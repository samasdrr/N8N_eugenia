-- Mots-cles par chunk et index de recherche lexicale pour le workflow n8n Essai_RAG.
-- A executer dans le SQL Editor de Supabase (Dashboard > SQL Editor > New query > Run).
-- Idempotent : peut etre rejoue sans rien casser.
--
-- POURQUOI C'EST DANS LA BASE ET PAS DANS LE WORKFLOW
--
-- Dans `Essai_RAG`, les documents sont construits par le sous-noeud `Data Loader
-- Markdown`, lui-meme branche sur le noeud vector store. Il n existe aucun noeud
-- intermediaire ou l on pourrait enrichir chaque document avant l'ecriture : la
-- seule facon d ajouter une information par chunk depuis n8n serait de remplacer
-- le Data Loader par un tableau de documents construit a la main, ce qui fait
-- perdre le decoupage par titres de LangChain.
--
-- Un trigger BEFORE INSERT fait le meme travail, sans toucher au workflow et sans
-- decalage possible : toute ligne ecrite dans la table, quel que soit l outil,
-- recoit ses mots-cles. Le workflow d'ingestion reste identique.
--
-- ORDRE DES OPERATIONS, ET DEUX PASSES
--
-- Ce fichier se joue en DEUX fois dans le SQL Editor : d'abord jusqu'au point 3
-- (colonnes, fonction de calcul, remplissage), puis le reste (points 4 a 6).
--
-- Pourquoi : envoye en un seul bloc, le CREATE TRIGGER echoue avec
--   column "keywords" does not exist
-- alors que la colonne vient d etre ajoutee dans le meme script. Le declencheur
-- prepare son plan sur la version du type de ligne qu il voit au moment de sa
-- creation, et dans un envoi unique il ne voit pas encore la colonne. En
-- executant les points 4 a 6 dans une deuxieme execution, la colonne est deja
-- engagee, le plan est correct, et la migration passe.
--
-- Le remplissage est place avant le trigger pour une raison voisine : le UPDATE ne
-- doit pas declencher la fonction qu on vient d installer.

-- 1. Vecteur de recherche stocke, pour que la recherche lexicale soit indexee.
--
--    Sans cette colonne, le chatbot recalcule to_tsvector sur chaque ligne a chaque
--    question : un scan complet de la table par message. La colonne generee est
--    calculee a l'ecriture, donc indexable, et se remplit toute seule.
--
--    La stemmedisation francaise vient de la configuration 'french' : les pluriels
--    sont ramenes a leur radical, ce qui rend "lois" et "loi" identiques.
alter table documents_bourdieu
  add column if not exists tsv tsvector
  generated always as (to_tsvector('french', coalesce(content, ''))) stored;

alter table documents_bourdieu
  add column if not exists keywords text[];

-- 2. Calcul des mots-cles : les 25 radicaux les plus frequents du chunk.
--
--    unnest(tsvector) renvoie un radical par ligne avec ses positions dans le texte :
--    le nombre de positions EST la frequence du terme. Tri par frequence puis par
--    ordre alphabetique, pour que deux ingestions du meme livre donnent exactement
--    la meme liste.
--
--    ts_stat() ferait le meme travail mais n est pas installe sur cette base, d ou
--    le comptage par positions.
--
--    Volontairement non genere : une colonne generee n accepte ni sous-requete ni
--    agregation, donc impossible d y classer les termes.
create or replace function chunk_keywords(contenu text) returns text[]
language sql
immutable
as $body$
  select coalesce(array_agg(s.lexeme order by s.freq desc, s.lexeme), '{}'::text[])
  from (
    select u.lexeme, array_length(u.positions, 1) as freq
    from unnest(to_tsvector('french', coalesce(contenu, ''))) as u(lexeme, positions, weights)
    order by 2 desc, 1
    limit 25
  ) s;
$body$;

-- 3. Remplissage des chunks deja en base. Le trigger n existe pas encore, donc
--    c'est la fonction qui est appelee directement.
update documents_bourdieu
set keywords = chunk_keywords(content)
where keywords is null;

-- 4. Arme du trigger pour les prochaines ecritures, venue du workflow d'ingestion.
--
-- *** DEUXIEME PASSE : a partir d'ici ***
--
-- Le trigger fait recalculer les mots-cles a chaque ecriture, y compris sur les
-- futures ingestions : aucune ligne ne peut entrer dans la table sans ses mots-cles.
create or replace function fill_chunk_keywords() returns trigger
language plpgsql
as $body$
begin
  new.keywords := chunk_keywords(new.content);
  return new;
end;
$body$;

drop trigger if exists trg_documents_bourdieu_keywords on documents_bourdieu;
create trigger trg_documents_bourdieu_keywords
  before insert or update of content on documents_bourdieu
  for each row execute function fill_chunk_keywords();

-- 5. Index. Le premier sert a la recherche par similarite lexicale du chatbot, le
--    second au filtrage par mots-cles (`keywords && ARRAY[...]`).
create index if not exists documents_bourdieu_tsv_idx
  on documents_bourdieu using gin (tsv);

create index if not exists documents_bourdieu_keywords_idx
  on documents_bourdieu using gin (keywords);

-- 6. Verification
select
  count(*) as chunks,
  count(*) filter (where keywords is not null) as avec_mots_cles,
  count(*) filter (where tsv is not null) as avec_vecteur_lexical,
  round(avg(array_length(keywords, 1))) as mots_cles_moyen,
  (select indexname from pg_indexes where tablename = 'documents_bourdieu' order by 1) as index_1,
  (select indexname from pg_indexes where tablename = 'documents_bourdieu' order by 1 offset 2) as index_3;
