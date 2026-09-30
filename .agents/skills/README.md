# Skills

Quatre skills. Trois sont des **méthodes de travail** écrites pour ce projet,
la quatrième est générée automatiquement par l'outil n8n.

| ID (répertoire) | `name` | Rôle | Quand l'invoquer |
|---|---|---|---|
| `interview-skills` | interview-skills | Transformer une idée floue en besoin vérifiable | Avant de concevoir quoi que ce soit |
| `doubt-driven-development` | doubt-driven-development | Passer le livrable au crible avant de le considérer fini | Après l'interview, avant validation |
| `hostile-review` | hostile-review | Chercher activement les failles du projet | Après le doute, avant de livrer |
| `n8n` | n8ncli | Gérer les workflows n8n en workflow-as-code | Toujours, pour `n8ncli` |

Pour les invoquer :

```
/skill interview-skills
/skill doubt-driven-development
/skill hostile-review
```

## Pourquoi tous les fichiers s'appellent `SKILL.md`

Ce n'est pas un oubli. La convention impose un nom de fichier exact : c'est le
**nom du répertoire parent** qui donne l'identifiant du skill.

```
.agents/skills/
└── hostile-review/          <- ID : hostile-review
    └── SKILL.md            <- nom imposé par la convention
```

`SKILL.md` est donc obligatoire, et le répertoire est ce qui distingue les
skills. Le champ `name` du frontmatter n'est qu'un libellé d'affichage : il
peut contenir des espaces (`n8n` s'affiche « n8ncli ») sans que cela change
l'identifiant.

## Emplacements de découverte

| Portée | Emplacement |
|---|---|
| Global | `~/.config/opencode/skills` |
| Global (compat.) | `~/.claude/skills`, `~/.agents/skills` |
| Projet | `.opencode/skills` |
| Projet (compat.) | `.claude/skills`, `.agents/skills` |

Priorité croissante : skills intégrés → `.claude/skills` → `.agents/skills` →
`~/.config/opencode/skills` → `.opencode/skills` → entrées `skills` de la
config. Un skill défini à plusieurs endroits : le plus prioritaire gagne.

`.agents/skills/` est lu par OpenCode **et** par Claude Code, d'où ce choix.

## Après un clonage

Les skills de ce dépôt sont scopés au projet. Pour les rendre disponibles
partout, les copier dans le répertoire global :

```cmd
xcopy /E /I /Y ".agents\skills\interview-skills"          "%USERPROFILE%\.config\opencode\skills\"
xcopy /E /I /Y ".agents\skills\doubt-driven-development" "%USERPROFILE%\.config\opencode\skills\"
xcopy /E /I /Y ".agents\skills\hostile-review"            "%USERPROFILE%\.config\opencode\skills\"
```

## Le skill `n8n-eugenia` n'est pas ici

Il vit uniquement en local, dans
`~/.config/opencode/skills/n8n-eugenia/`, et volontairement hors de ce dépôt
public : il contient l'URL de l'instance n8n et le `projectId` du compte.
