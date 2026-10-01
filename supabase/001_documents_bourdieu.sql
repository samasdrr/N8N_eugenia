-- Ingestion RAG — table pgvector pour le workflow n8n Essai_RAG.
-- A executer dans le SQL Editor de Supabase (Dashboard > SQL Editor > New query > Run).
-- Idempotent : peut etre rejoue sans rien casser, y compris apres un echec partiel.
--
-- Le workflow ecrit dans cette table avec le noeud `Vectoriser dans Postgres`
-- (`@n8n/n8n-nodes-langchain.vectorStorePGVector`), qui passe par le pilote pg et
-- le credential Postgres. Plus rien ne transite par PostgREST : ni schema cache,
-- ni fonction RPC a recharger apres creation.

-- 1. Extension pgvector
create extension if not exists vector;

-- 2. Table des chunks
--    vector(3072) est impose par le modele d'embeddings utilise dans n8n :
--    models/gemini-embedding-001 sort du vecteur en 3072 dimensions, et le noeud
--    n'expose aucun reglage de dimension.
--
--    SCHEMA VERROILLE, A NE PAS MODIFIER SANS METTRE LE NOEUD A JOUR :
--      - `content` : le store LangChain vise `text` par defaut. Le noeud force
--        `content` via options.columnNames ; sans cet override, l insert echoue.
--      - `embedding`, `metadata` : les trois seules colonnes que le noeud ecrit
--        (INSERT (content, embedding, metadata) -- `id` est laisse a sa valeur
--        par defaut, bigserial suffit).
--      - `id` : le noeud ne fournit jamais d'id, donc le type n importe pas. Il ne
--        sert qu'en lecture, quand le chatbot fait ses recherches.
create table if not exists documents_bourdieu (
  id        bigserial primary key,
  content   text,
  metadata  jsonb,
  embedding vector(3072)
);

-- 3. PAS D'INDEX HNSW ICI, VOLONTAIREMENT
--
--    L'index HNSW de pgvector refuse plus de 2000 dimensions :
--      ERROR: column cannot have more than 2000 dimensions for hnsw index
--    et gemini-embedding-001 en produit 3072. Impossible de concilier les deux.
--    Le noeud PGVector ne cree aucun index de son cote, donc rien ne bute : seule
--    une creation manuelle d'index echouerait.
--
--    Ce n'est pas un probleme en pratique : un livre represente 400 a 1500 chunks,
--    et pgvector fait la recherche exhaustive par cosinus en quelques millisecondes
--    a ce volume. L'index ne devient utile qu'au-dela de plusieurs dizaines de
--    milliers de vecteurs.
--
--    Si un jour le corpus grossit fortement, deux options coherentes :
--      a) passer le noeud n8n sur models/text-embedding-004 (768 dimensions)
--         et recreer la colonne en vector(768), ce qui redonne la main a HNSW ;
--      b) rester en 3072 et accepter la recherche exhaustive.

-- 4. Recherche
--    PLUS BESOIN de fonction pour ce workflow : le noeud PGVector interroge la
--    table directement en SQL, en distance cosinus.
--    `match_documents` ci-dessous est donc facultatif. Elle ne sert que si un
--    noeud Supabase vector store est reintroduction un jour (lecture via PostgREST).
--    Elle renvoie `id bigint` : à garder tel quel tant que `id` reste un bigserial.
create or replace function match_documents (
  query_embedding  vector(3072),
  match_count      int    default 5,
  match_threshold  float  default 0
)
returns table (
  id         bigint,
  content    text,
  metadata   jsonb,
  similarity float
)
language sql
stable
as $$
  select
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) as similarity
  from documents_bourdieu d
  where 1 - (d.embedding <=> query_embedding) > match_threshold
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

-- 5. Verification
select count(*) as documents from documents_bourdieu;
