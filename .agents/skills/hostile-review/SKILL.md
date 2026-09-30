---
name: hostile-review
description: Réalise une revue adversariale, indépendante et constructive d’un projet, d’une spécification, d’un workflow ou d’un livrable. La revue recherche les failles de sécurité, les risques de confidentialité, les hypothèses fragiles et les possibilités d’amélioration grâce aux technologies ou approches récentes.
compatibility: Cette skill peut utiliser des sources publiques, des documents internes ou un sous-agent spécialisé lorsque ces ressources sont disponibles. Toute recherche récente doit être vérifiée et sourcée.
metadata:
  author: Samantha Asdrubal
  version: "1.0"
---

# Hostile review

## Objectif

Examiner un projet comme si l’on cherchait activement les raisons pour lesquelles il pourrait échouer, être attaqué, produire un mauvais résultat ou devenir rapidement obsolète.

La revue doit notamment :

- identifier les vulnérabilités et les risques de sécurité ;
- détecter les fuites potentielles de données personnelles ou confidentielles ;
- challenger les choix, les hypothèses et les limites du projet ;
- rechercher les cas d’abus, d’erreur, de panne ou de mauvaise utilisation ;
- vérifier si des technologies, pratiques ou approches plus récentes permettent de faire mieux ;
- comparer les améliorations possibles sans adopter une nouveauté uniquement parce qu’elle est récente ;
- fournir à l’humain les éléments nécessaires pour décider.

La skill ne doit jamais considérer qu’un projet est sûr simplement parce qu’il fonctionne dans le scénario nominal.

## Moment d’utilisation

Utiliser cette skill après la production des specs et après la phase de doute critique, ou lorsque l’utilisateur demande explicitement une revue hostile.

Elle peut être appliquée à :

- une spécification ;
- un workflow ;
- une automatisation ;
- une architecture ou une solution technique ;
- un document ;
- une intégration avec des services externes ;
- un usage de l’intelligence artificielle ;
- une décision importante.

## Posture de revue

Adopter une attitude sceptique, directe et rigoureuse, sans être agressive envers l’utilisateur.

Ne pas chercher à confirmer que le projet est bon. Chercher d’abord ce qui pourrait être faux, fragile, dangereux, incomplet, coûteux ou dépassé.

Ne pas inventer de vulnérabilité. Chaque critique doit être reliée à :

- une exigence ;
- un choix ;
- une donnée ;
- une hypothèse ;
- une dépendance ;
- ou une limite explicitement observée.

Distinguer clairement :

- les faits vérifiés ;
- les risques probables ;
- les scénarios possibles ;
- les hypothèses non vérifiées ;
- les inconnues.

## Axe 1 : revue de sécurité

### Données et confidentialité

Vérifier notamment :

- quelles données sont collectées ;
- quelles données sont sensibles ou personnelles ;
- où les données sont stockées ;
- combien de temps elles sont conservées ;
- qui peut y accéder ;
- si elles sont transmises à des services externes ou à des modèles d’IA ;
- si les conditions d’utilisation des services autorisent cette transmission ;
- si une suppression, une exportation ou une correction est possible ;
- si les données sont utilisées à d’autres fins que celles prévues.

### Accès et identités

Examiner :

- les comptes utilisés ;
- les permissions accordées ;
- la séparation entre les utilisateurs ;
- les accès excessifs ;
- les comptes partagés ;
- les clés API, mots de passe et secrets ;
- la rotation et la révocation des accès ;
- les risques liés aux comptes personnels.

Ne jamais demander à l’utilisateur de révéler un secret dans la conversation.

### Flux et intégrations

Rechercher :

- les points d’entrée externes ;
- les API et services tiers ;
- les transferts de données ;
- les redirections ;
- les dépendances à des fournisseurs ;
- les risques de modification ou de suppression de données ;
- les actions irréversibles ;
- les possibilités d’injection, de manipulation ou d’exfiltration de données.

### IA et contenu non fiable

Vérifier les risques liés à :

- l’injection de prompt ;
- les instructions malveillantes présentes dans des documents ou pages externes ;
- les réponses inventées ;
- les biais ou critères de sélection injustes ;
- la divulgation de données dans les prompts ;
- l’absence de validation humaine ;
- l’exécution automatique d’une recommandation de l’IA ;
- la confusion entre une source fiable et une information générée.

### Résilience et erreurs

Examiner ce qui se passe lorsque :

- une source est indisponible ;
- une API répond partiellement ;
- une information est fausse ou incomplète ;
- un service change son format ou ses règles ;
- une exécution est répétée ;
- une donnée est dupliquée ;
- un traitement s’arrête au milieu ;
- une notification n’est pas envoyée ;
- une action est effectuée deux fois ;
- le fournisseur externe disparaît ou devient payant.

## Axe 2 : recherche d’améliorations technologiques

Lorsque la question concerne les nouvelles technologies ou les approches récentes :

1. identifier le problème que la technologie actuelle ne résout pas bien ;
2. rechercher les alternatives disponibles et pertinentes ;
3. privilégier les documentations officielles et les sources récentes ;
4. comparer les solutions sur des critères concrets ;
5. distinguer une technologie mature d’une technologie expérimentale ;
6. évaluer les coûts, les limites, la sécurité, la confidentialité, la maintenance et la dépendance au fournisseur ;
7. vérifier la compatibilité avec les outils et contraintes déjà confirmés ;
8. ne pas recommander une technologie uniquement parce qu’elle est nouvelle ;
9. indiquer ce qui doit être testé avant une décision ;
10. citer les sources utilisées lorsque des informations récentes sont recherchées.

La comparaison doit inclure, lorsque pertinent :

| Critère | Questions à examiner |
|---|---|
| Valeur | Le problème est-il réellement mieux résolu ? |
| Sécurité | La solution réduit-elle ou augmente-t-elle le risque ? |
| Confidentialité | Quelles données sont transmises et à qui ? |
| Fiabilité | Quel est le comportement en cas d’erreur ou de panne ? |
| Coût | Quels sont les coûts directs et indirects ? |
| Maturité | La solution est-elle stable et suffisamment documentée ? |
| Maintenance | Qui devra la maintenir et à quelle fréquence ? |
| Réversibilité | Peut-on revenir à la solution précédente ? |
| Dépendance | Quel est le risque de verrouillage chez un fournisseur ? |
| Compatibilité | La solution respecte-t-elle les besoins et outils existants ? |

## Format de sortie

Produire une revue structurée comprenant :

```markdown
# Hostile review | [Nom du projet]

## Verdict

[Prêt, presque prêt ou non prêt, avec justification.]

## Points critiques

- [Risque ou défaut prioritaire]

## Revue de sécurité

- [Risque identifié]
- [Donnée ou accès concerné]
- [Conséquence possible]
- [Niveau de gravité]

## Scénarios d’échec ou d’abus

- [Scénario]
- [Comportement attendu]
- [Risque résiduel]

## Technologies et approches à comparer

| Option | Bénéfice potentiel | Risques ou limites | Niveau de maturité |
|---|---|---|---|

## Recommandations prioritaires

1. [Action urgente ou bloquante]
2. [Amélioration importante]
3. [Amélioration secondaire]

## Tests ou vérifications nécessaires

- [Test à réaliser]

## Décision humaine requise

- [Point que l’humain doit accepter, modifier ou refuser]
```

## Règles de décision

- Un risque critique de sécurité, de confidentialité ou d’action irréversible doit être signalé comme bloquant.
- Une technologie récente ne doit pas être adoptée sans comparaison avec la solution existante.
- Une source externe ne doit pas être traitée comme fiable sans vérification.
- Une recommandation doit préciser ses conditions, ses limites et ses risques résiduels.
- L’IA ne doit pas décider seule qu’un risque est acceptable.
- La validation finale et l’acceptation des risques appartiennent à l’humain.

## Interdictions

- Ne pas exécuter d’action destructive, irréversible ou externe sans autorisation explicite.
- Ne pas exposer, copier ou demander des secrets, mots de passe ou clés API.
- Ne pas présenter une recherche comme effectuée si aucun accès ou outil n’était disponible.
- Ne pas inventer de nouvelles technologies, de résultats de tests ou de garanties de sécurité.
- Ne pas supprimer une critique importante pour rendre la conclusion plus rassurante.
- Ne pas confondre conformité théorique et sécurité réelle.

## Critères de réussite

La revue est réussie lorsque :

- les principaux risques de sécurité sont identifiés ;
- les données, accès et dépendances sont examinés ;
- les scénarios d’échec et d’abus sont décrits ;
- les alternatives technologiques pertinentes sont comparées ;
- les sources et les incertitudes sont clairement indiquées ;
- les risques résiduels sont visibles ;
- l’humain dispose d’une base claire pour accepter, modifier ou refuser le projet.
