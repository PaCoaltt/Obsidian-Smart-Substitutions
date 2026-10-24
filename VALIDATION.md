# Validation de la V1

Exécutée le 24 octobre 2026 sous Windows, Node.js 24.19.0 et npm, dans ce dépôt.

| Vérification | Résultat |
| --- | --- |
| `npm run typecheck` | Réussite, TypeScript strict, sources et tests |
| `npm run lint` | Réussite, sources et tests |
| `npm test` | 27 tests réussis dans 3 fichiers |
| `npm run build` | Réussite, génération de `main.js` |
| `git diff --check` | Réussite |

Dernière exécution des 27 tests : 1,33 seconde au total. Le test de volume analyse 30 000 lignes contenant chacune un mot accentué et du code inline, avec une limite de 5 secondes.

Les tests éditeur utilisent `@codemirror/state`, `@codemirror/view`, `@codemirror/commands` et `@codemirror/autocomplete` réels : transactions de saisie, sélections, Undo/Redo, événements clavier Tab et autocomplétion en attente. Ils s’exécutent sous jsdom. Les tests du cycle de vie utilisent un adaptateur simulant l’API Obsidian pour contrôler les événements, la persistance et les temporisations.

Dans cet environnement, les processus esbuild/Vitest ont nécessité une exécution autorisée hors du bac à sable Windows ; les commandes n’ont pas été modifiées pour contourner ces restrictions.

## Validation interactive restant à effectuer

Aucune session réelle d’Obsidian desktop ou mobile n’a été pilotée. Avant publication communautaire, effectuer ce parcours dans un coffre de test :

1. Installer les trois fichiers, activer le plugin et ouvrir la note d’exemple du README.
2. Vérifier le bandeau en thèmes clair et sombre, sans déplacement du focus.
3. Modifier une proposition, l’accepter et constater que le texte de la note reste identique.
4. Saisir le raccourci suivi d’un espace ; vérifier texte et curseur, puis Ctrl+Z/Cmd+Z et Redo.
5. Vérifier que la règle locale ne s’applique pas dans une autre note, puis créer une règle globale.
6. Refuser et ignorer des suggestions ; éditer puis rouvrir les notes pour vérifier leur absence.
7. Recharger Obsidian pour vérifier les règles, paramètres et décisions persistantes.
8. Renommer une note puis un dossier ; vérifier les règles locales et leurs chemins dans les paramètres.
9. Essayer les contextes code, liens, URL et YAML, le collage et une composition IME.
10. Activer Tab et tester avec les autres extensions de l’utilisateur ; désactiver le plugin pour vérifier le retour au comportement habituel.
11. Refaire ce parcours sur Android/iOS et inspecter le bandeau avec le clavier logiciel ouvert.
