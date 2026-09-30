---
name: doubt-driven-development
description: Applique une méthode de doute systématique aux livrables produits avec une IA afin d’identifier les erreurs, les omissions et les hypothèses fragiles, puis d’améliorer le résultat avant validation humaine. À utiliser après la fin de la skill Interview skills et avant qu’un résultat soit considéré comme final.
compatibility: Cette skill fonctionne avec toute tâche produite avec une IA. Elle peut utiliser un sous-agent ou une méthode de revue indépendante lorsque ces capacités sont disponibles.
metadata:
  author: Samantha Asdrubal
  version: "1.0"
---

# Doubt Driven Development

## Objectif

Empêcher l’IA de considérer seule que son travail est suffisamment bon ou définitif.

Cette méthode impose une collaboration active entre l’IA et l’humain. L’IA doit douter de la qualité de son propre travail, rechercher ses erreurs et ses limites, améliorer le résultat, puis le soumettre à une validation humaine explicite.

L’IA ne possède jamais le dernier mot sur le rendu final.

## Moment d’utilisation

Utiliser cette skill une fois que la skill **Interview skills** est terminée et qu’un résultat a été produit, notamment :

- une spécification ;
- un objectif ;
- une liste d’affirmations ;
- une analyse ;
- une recommandation ;
- un document ;
- un plan ;
- du code ;
- ou tout autre livrable nécessitant une validation.

La méthode peut également être réutilisée sur tout travail important réalisé avec une IA.

## Principe fondamental

Ne jamais présenter un livrable comme définitivement validé uniquement parce que l’IA estime qu’il est terminé.

Toujours distinguer :

- le résultat initial ;
- les doutes et faiblesses identifiés par l’IA ;
- les corrections apportées ;
- les remarques d’une revue externe ;
- la décision finale de l’humain.

## Les quatre étapes obligatoires

### Étape 1 : auto-évaluation critique

Examiner le résultat avec une attitude volontairement sceptique.

Rechercher notamment :

- les erreurs factuelles ;
- les informations inventées ou insuffisamment vérifiées ;
- les omissions ;
- les contradictions ;
- les hypothèses non déclarées ;
- les formulations ambiguës ;
- les exigences non couvertes ;
- les résultats qui ne répondent pas exactement à la demande ;
- les risques, limites ou cas particuliers ignorés ;
- les éléments qui pourraient être mal interprétés par l’utilisateur.

Produire une liste claire des doutes identifiés, même si le résultat semble correct au premier regard.

### Étape 2 : amélioration du résultat

Corriger les problèmes identifiés pendant l’auto-évaluation.

Lorsque plusieurs corrections ou interprétations sont raisonnables :

- ne pas choisir silencieusement une seule option ;
- préparer plusieurs versions ou variantes lorsque cela apporte une vraie valeur ;
- expliquer brièvement la différence entre les versions ;
- conserver les incertitudes qui ne peuvent pas être résolues sans l’humain.

Ne pas ajouter de faits non vérifiés pour rendre le résultat plus convaincant.

### Étape 3 : revue externe

Lorsque cela est possible, soumettre le résultat amélioré à une vérification indépendante :

- un sous-agent spécialisé ;
- une seconde analyse avec un rôle différent ;
- une checklist indépendante ;
- une comparaison avec les sources ou documents disponibles ;
- un test ou une vérification adaptée au type de livrable.

La revue externe doit rechercher les mêmes problèmes que l’auto-évaluation, mais sans simplement répéter le raisonnement initial.

Si aucun sous-agent ou moyen de revue externe n’est disponible, le signaler clairement et poursuivre avec les limites connues.

Ne jamais présenter l’avis du sous-agent comme une vérité absolue. Il s’agit d’un avis supplémentaire à examiner.

### Étape 4 : validation humaine finale

Présenter le résultat à l’humain pour validation explicite.

La réponse doit indiquer clairement :

- ce qui a été produit ;
- les corrections effectuées ;
- les doutes qui restent ouverts ;
- les remarques importantes de la revue externe ;
- les variantes disponibles, lorsqu’il y en a ;
- ce que l’humain doit valider ou modifier.

Ne pas considérer le résultat comme final tant que l’humain ne l’a pas validé.

Ne pas prendre d’action irréversible ou externe sans validation humaine explicite.

## Si l’humain refuse ou demande des corrections

Lorsque l’humain n’accepte pas le résultat :

1. analyser précisément le désaccord ou la correction demandée ;
2. expliquer ce qui doit changer et pourquoi ;
3. produire plusieurs versions corrigées lorsque plusieurs directions sont pertinentes ;
4. soumettre les versions à une nouvelle validation humaine ;
5. recommencer les étapes de doute nécessaires avant la nouvelle validation.

Ne pas défendre automatiquement le résultat précédent. Le désaccord humain est un signal à examiner, pas une erreur à minimiser.

## Format de sortie recommandé

Utiliser une structure adaptée au livrable, comprenant autant que possible :

```markdown
## Résultat proposé

[Version améliorée du livrable]

## Auto-évaluation critique

- [Doute ou faiblesse identifiée]
- [Point vérifié]
- [Hypothèse restante]

## Améliorations apportées

- [Correction effectuée]
- [Clarification ajoutée]

## Revue externe

- [Avis ou résultat de la vérification indépendante]
- [Limite de la revue si aucun sous-agent ou test n’était disponible]

## Validation humaine requise

- [Point à valider]
- [Choix à effectuer entre les variantes]
- [Modification éventuelle à demander]
```

Le format peut être simplifié pour une tâche courte, mais la validation humaine doit toujours rester explicite pour un livrable important.

## Règles de qualité

- Ne jamais confondre confiance et exactitude.
- Ne jamais masquer une incertitude pour produire une réponse plus fluide.
- Ne jamais inventer une validation externe qui n’a pas eu lieu.
- Ne jamais prétendre qu’un livrable est final avant validation humaine.
- Toujours conserver une trace des doutes significatifs et des corrections.
- Toujours distinguer les faits vérifiés, les déductions et les hypothèses.
- Adapter la profondeur de la revue à l’importance et au risque du livrable.
- Préserver la décision finale de l’humain, même lorsque l’IA estime qu’une option est meilleure.

## Critères de réussite

La skill est correctement appliquée lorsque :

- l’IA a explicitement recherché les faiblesses de son travail ;
- les corrections ont été apportées avant la demande de validation ;
- une revue indépendante a été réalisée lorsque cela était possible ;
- les désaccords et incertitudes sont visibles ;
- l’humain dispose des éléments nécessaires pour décider ;
- aucune version n’est présentée comme définitive sans validation humaine.
