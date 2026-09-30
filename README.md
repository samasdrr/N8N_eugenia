# N8N_eugenia

Workflows n8n gérés en **workflow-as-code** avec [`@workflows-accelerator/n8n-cli`](https://www.npmjs.com/package/@workflows-accelerator/n8n-cli).

Chaque workflow est un fichier TypeScript dans `n8n/workflows/`. Le code est la source de vérité ; l'UI n8n n'est qu'un rendu.

---

## Workflows

| Workflow | Rôle |
|---|---|
| `Recherche et suivi des candidatures.workflow.ts` | Recherche d'offres 2×/jour via Apify, filtrage, génération CV + lettre par Gemini, dépôt sur Drive, suivi dans Sheets |
| `Recherche et suivi des offres d'emploi avec Gemini.workflow.ts` | Ancien brouillon, **cassé** — à supprimer dans l'UI n8n |
| `My workflow 2.workflow.ts`, `Sandbox/My workflow.workflow.ts` | Brouillons |

---

## Installation

```bash
npm install -g @workflows-accelerator/n8n-cli
n8ncli init
```

> ⚠️ **N'utilisez pas `@latest`.** Le dist-tag `latest` du registry pointe actuellement sur `1.2.35`, alors que la version réellement la plus haute est `1.2.39`. Installez la version explicite :
>
> ```bash
> npm install -g @workflows-accelerator/n8n-cli@1.2.39
> ```

## Commandes courantes

```bash
n8ncli status              # ce qui est modifié localement / sur l'instance
n8ncli diff <fichier>      # détail des différences
n8ncli validate <fichier>  # validation locale, sans aller-retour instance
n8ncli pull                # instance -> fichiers locaux
n8ncli push                # fichiers locaux -> instance
n8ncli exec "Nom"          # exécute le workflow
n8ncli import-skill        # (ré)installe le skill agent dans .agents/skills/
```

---

## Structure

```
n8n/
  config/
    n8n-cli.json        # env actif + projectId
    n8n-standards.json  # règles de nommage / lint
    n8n-layout.json     # positions des nœuds sur le canvas
  workflows/            # ← les workflows (source de vérité)
.agents/skills/n8n/     # skill agent
```

## Secrets

Rien de sensible n'est versionné.

| Secret | Où il vit |
|---|---|
| Token MCP n8n | `~/.n8ncli-global.json` (**hors dépôt**) |
| Identifiants Google (Sheets / Drive / Gemini) | coffre n8n, jamais dans le code |
| Jeton Apify | onglet `Config` du spreadsheet, jamais dans le code |

`.gitignore` exclut `.env`, `n8n/config/cache/`, `n8n/config/sync-state.json` et `n8n/references/`.

---

## ⚠️ Limite connue : `n8ncli push` n'écrit pas les mises à jour

Sur cette instance, `push` affiche `Push complete` mais **ne modifie aucun workflow existant**. Seul le tout premier `push` (création) a fonctionné.

Symptôme : `n8ncli status` signale en permanence `Modified locally (needs push)`.

**Contournement** : après un `push`, configurer manuellement dans l'UI n8n les nœuds dont les paramètres ont été réinitialisés — en particulier les nœuds **Google Sheets**, dont `resource` / `operation` / `documentId` / `sheetName` sont perdus.

Pourquoi : n8n n'enregistre pas le champ `resource` dans `parameters` (il est reconstruit à partir du type de nœud), et l'API refuse qu'on l'écrive explicitement (« path 'resource' is invalid or contains unsafe segments »). Un nœud dont l'opération n'appartient pas à la ressource par défaut se voit donc réinitialisé.

---

## Confidentialité

Les données de suivi de candidature, les CV et les lettres de motivation sont **personnels et confidentiels**. Ce dépôt ne contient que la *logique* des workflows : ni CV, ni lettre, ni jeton. Le workflow n'envoie jamais de candidature — il produit uniquement des brouillons à vérifier.
