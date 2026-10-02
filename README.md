# N8N_eugenia

Workflows n8n gérés en **workflow-as-code** avec [`@workflows-accelerator/n8n-cli`](https://www.npmjs.com/package/@workflows-accelerator/n8n-cli).

Chaque workflow est un fichier TypeScript dans `n8n/workflows/`. Le code est la source de vérité ; l'UI n8n n'est qu'un rendu.

---

## Workflows

### Suivi de candidature

| Workflow | Rôle |
|---|---|
| `Recherche et suivi des candidatures.workflow.ts` | Recherche d'offres 2×/jour via Apify, filtrage, génération CV + lettre par Gemini, dépôt sur Drive, suivi dans Sheets |
| `Recherche et suivi des offres d'emploi avec Gemini.workflow.ts` | Ancien brouillon, **cassé** — à supprimer dans l'UI n8n |
| `My workflow 2.workflow.ts`, `Sandbox/My workflow.workflow.ts` | Brouillons |

### RAG sur Montesquieu, *L'Esprit des lois*

Deux workflows, l'un pour ingérer le livre, l'autre pour le discuter. Ils partagent la table `documents_bourdieu`.

| Workflow | Rôle |
|---|---|
| `Essai_RAG` | Formulaire d'envoi d'un PDF → extraction du texte → nettoyage en Markdown → chunking → embeddings → écriture dans Postgres |
| `Chat_Essai_RAG` | ChatTrigger → recherche hybride → RRF → prompt → Gemini → réponse citée |

La recherche est **hybride** : similarité cosinus sur les vecteurs, et recherche lexicale PostgreSQL sur une colonne `tsv` indexée en GIN. Les deux listes sont ensuite fusionnées par *reciprocal rank fusion* (`score = Σ 1/(60+position)`), qui ne compare que des positions et pas des scores — la similarité cosinus et le `ts_rank` ne sont pas sur la même échelle.

Chaque chunk porte 25 mots-clés, calculés par un trigger SQL. La recherche lexicale construit une requête OU (et non ET) avec les termes présents dans plus d'un cinquième du livre écartés : sans ça, un mot courant comme « homme » ne ramène que du bruit.

Le chunking vise un chunk par page imprimée : `chunkSize: 2800`, `chunkOverlap: 400`, soit 288 chunks pour les 300 pages de l'édition Garnier 1875. À 1200, le même livre en donnait 660, sans gain de pertinence.

---

## Base de données

Migrations dans `supabase/`, à jouer dans l'ordre sur la base Supabase.

| Fichier | Rôle |
|---|---|
| `001_documents_bourdieu.sql` | Table `documents_bourdieu` (`content`, `metadata`, `embedding vector(3072)`) + fonction de similarité |
| `002_mots_cles_par_chunk.sql` | Colonnes `tsv` et `keywords`, trigger de remplissage, 2 index GIN |
| `003_conversations.sql` | Table `conversations` : historique des échanges du chat |

> ⚠️ **`002` doit être jouée en deux fois.** En une seule passe, Postgres échoue sur `column "keywords" does not exist` : la colonne est créée après l'objet qui la référence.

> ⚠️ **`vector(3072)` n'est pas négociable.** Le modèle d'embeddings en sort 3072 dimensions. `text-embedding-004`, le modèle par défaut des nœuds n8n, n'en sort que 768 : le laisser en place fait échouer l'insertion sur `vector must have at least 1 dimension`. Le modèle est donc écrit en dur dans les deux workflows — voir `Gemini Embeddings`.

---

## Installation

```bash
npm install -g @workflows-accelerator/n8n-cli
n8ncli init
```

Si `n8ncli --version` renvoie une version inférieure à la dernière, épingler explicitement (`@workflows-accelerator/n8n-cli@1.2.40`). Pendant quelques semaines, `latest` pointait sur une version antérieure à la plus haute disponible.

> Sous **PowerShell**, `n8ncli` tout court échoue avec `PSSecurityException` : PowerShell appelle le lanceur `.ps1`, bloqué par la politique d'exécution. Utiliser `n8ncli.cmd`, ou `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## Commandes courantes

```bash
n8ncli status              # ce qui est modifié localement / sur l'instance
n8ncli diff <fichier>      # détail des différences
n8ncli validate <fichier>  # validation locale, sans aller-retour instance
n8ncli pull                # instance -> fichiers locaux
n8ncli push                # fichiers locaux -> instance
n8ncli exec "Nom"          # exécute le workflow
n8ncli webhooks            # quelles URL de production répondent
n8ncli publish "Nom"       # publie + active
n8ncli import-skill        # (ré)installe le skill agent dans .agents/skills/
```

`test/pin-essai-rag.json` sert à `n8ncli test` pour rejouer l'ingestion sans le PDF.

---

## Structure

```
n8n/
  config/
    n8n-cli.json        # env actif + projectId
    n8n-standards.json  # règles de nommage / lint
    n8n-layout.json     # positions des nœuds sur le canvas
  workflows/            # ← les workflows (source de vérité)
supabase/               # migrations de la base
test/                   # données de test (pin data)
.agents/skills/n8n/     # skill agent
```

## Secrets

Rien de sensible n'est versionné.

| Secret | Où il vit |
|---|---|
| Token MCP n8n | `~/.n8ncli-global.json` (**hors dépôt**) |
| Identifiants Google (Sheets / Drive / Gemini) | coffre n8n, jamais dans le code |
| Clé Google AI Studio (embeddings) | coffre n8n, type `googlePalmApi` |
| Jeton Apify | onglet `Config` du spreadsheet, jamais dans le code |

`.gitignore` exclut `.env`, `n8n/config/cache/`, `n8n/config/sync-state.json` et `n8n/references/`.

---

## Ce qui a coûté du temps

Notes prises sur le RAG Montesquieu. Aucune n'est un bug de n8n : ce sont des comportements silencieux qui produisent des données fausses sans lever la moindre erreur.

**Le canevas n8n peut écraser le serveur.** Lancer une exécution depuis un onglet d'éditeur renvoie d'abord le canevas du client à l'instance ; si ce canevas est plus ancien que la dernière version publiée, c'est lui qui fait foi. `update_workflow` refuse alors l'écriture : *« Cannot modify workflow while it is being edited by a user in the editor »*.

C'est le mécanisme qui explique deux éléments présents sur `Essai_RAG` mais absents du dépôt — un nœud `Vider la table des passages` et une copie du chatbot. Tant qu'un workflow reste modifiable depuis le canevas, `n8ncli status` est le seul moyen de savoir quelle version fait réellement foi.

**Les crédits gateway ne couvrent plus les embeddings.** `gemini-embedding-001` répond `404`, `gemini-embedding-002` répond `400 Gateway credits don't currently support this operation`. Les embeddings exigent un credential propre au projet (`googlePalmApi`). Les modèles de chat, eux, passent encore par le gateway.

**Un gros lot renvoie des vecteurs vides, sans erreur.** Au-delà d'une centaine de documents par requête, le service d'embeddings répond un tableau de tableaux vides. Le seul symptôme visible est l'échec d'insertion de pgvector sur un vecteur de dimension nulle, trois nœuds plus loin. `embeddingBatchSize` est à 40.

**Ne jamais vider une table avant d'avoir écrit.** Le pipeline vidait `documents_bourdieu` puis insérait ; l'insertion ayant échoué, les 288 chunks ont disparu. La version actuelle enregistre d'abord, vérifie (`nouveaux > 0`, `sans_vecteur = 0`, dimension), et ne purge l'ingestion précédente qu'ensuite.

**Un nœud à plusieurs entrées s'exécute une fois par branche.** Brancher les deux recherches sur un nœud `Merge` ne fusionne rien : le `Merge` tourne deux fois, et la suite aussi. Le prompt ne voit alors qu'une des deux listes à la fois. La chaîne est restée séquentielle, et la seconde liste est relue **par référence de nœud** (`$('Recherche par mots cles').all()`).

**`chainLlm` v1.7 refuse la sous-nœud mémoire.** La mémoire de conversation passe donc par la table `conversations`, lue dans le prompt.

**`queryReplacement` coupe sur les virgules**, sans respecter les guillemets. Inutilisable pour du texte libre : c'est pourquoi l'enregistrement du tour se fait par un `INSERT` construit dans un nœud Code, apostrophes doublées.

**Les apostrophes dans un littéral TypeScript sur apostrophes.** `$('Convertir le PDF en Markdown')` doit s'écrire `$(\'...\')`. L forget, la validation serveur passe et la requête part **tronquée** au premier `'` — la seule chose qui l'a révélé est la relecture de la valeur écrite avant envoi.

---

## ⚠️ Limite connue : `n8ncli push` n'écrit pas les mises à jour

Sur cette instance, `push` affiche `Push complete` mais **ne modifie aucun workflow existant**. Seul le tout premier `push` (création) a fonctionné.

Symptôme : `n8ncli status` signale en permanence `Modified locally (needs push)`.

**Contournement** : après un `push`, configurer manuellement dans l'UI n8n les nœuds dont les paramètres ont été réinitialisés — en particulier les nœuds **Google Sheets**, dont `resource` / `operation` / `documentId` / `sheetName` sont perdus.

Pourquoi : n8n n'enregistre pas le champ `resource` dans `parameters` (il est reconstruit à partir du type de nœud), et l'API refuse qu'on l'écrive explicitement (« path 'resource' is invalid or contains unsafe segments »). Un nœud dont l'opération n'appartient pas à la ressource par défaut se voit donc réinitialisé.

Tant que ce point n'est pas réglé, le MCP n8n reste le chemin le plus fiable pour appliquer une modification : `update_workflow`, puis `publish_workflow`.

---

## Confidentialité

Les données de suivi de candidature, les CV et les lettres de motivation sont **personnels et confidentiels**. Ce dépôt ne contient que la *logique* des workflows : ni CV, ni lettre, ni jeton. Le workflow n'envoie jamais de candidature — il produit uniquement des brouillons à vérifier.