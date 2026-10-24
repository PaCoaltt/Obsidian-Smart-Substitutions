# Smart Substitutions

Plugin communautaire Obsidian en TypeScript : repérer les mots longs et répétés dans le fichier Markdown actif, proposer un raccourci, puis développer uniquement les raccourcis explicitement approuvés pendant les futures frappes.

**Version 0.1.0 — traitement local, sans réseau, sans IA ni télémétrie.** Aucune analyse du coffre entier, aucun remplacement global et aucune modification de la note lors de l’acceptation d’une proposition.

## Installation manuelle

Prérequis de développement : Node.js 22 ou plus récent et npm. Obsidian 1.6.0 minimum.

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

1. Créer `<coffre>/.obsidian/plugins/smart-substitutions/`.
2. Y copier **`main.js`**, **`manifest.json`** et **`styles.css`** depuis la racine du dépôt après le build.
3. Recharger Obsidian et activer **Smart Substitutions** dans Paramètres → Modules complémentaires. Autoriser les modules communautaires si nécessaire.
4. Ouvrir une note Markdown dans un éditeur (mode Source ou Live Preview).

Les trois fichiers doivent se trouver directement dans `smart-substitutions`, sans dossier intermédiaire. Ne pas copier `node_modules`. Le plugin n’est pas encore soumis à l’annuaire communautaire.

## Essai rapide

Créer une note contenant :

```text
déplacement déplacement déplacement
déplacement déplacement déplacement
```

Après environ 1,5 seconde, une petite proposition apparaît dans l’éditeur. L’abréviation exacte dépend des collisions dans le document. Cliquer sur **Accepter**, ou utiliser **Alt+Entrée**. Taper ensuite l’abréviation suivie d’un espace : seul ce mot saisi est développé. **Ctrl+Z / Cmd+Z** annule la substitution et son espace déclencheur ; les lettres du raccourci restent disponibles.

L’acceptation ne modifie aucune occurrence déjà présente dans la note. Une règle automatique est toujours associée à cette note.

## Suggestions et commandes

- **Accepter** : enregistrer la règle et l’activer immédiatement pour les futures frappes.
- **Modifier** : ajuster l’abréviation ou le remplacement dans une fenêtre de validation.
- **Ignorer** : ignorer définitivement ce mot dans ce fichier, jusqu’à restauration dans les paramètres.
- **Fermer / Échap** : masquer la proposition tout en la gardant dans la liste.
- La liste des suggestions propose aussi **Refuser** ; le refus est persistant et restaurable, comme l’ignorance définitive.

Commandes accessibles dans la palette, préfixées par **Smart Substitutions** :

| Commande | Usage |
| --- | --- |
| Ouvrir les suggestions | Consulter les propositions du fichier actif, y compris celles fermées |
| Analyser le fichier courant | Analyse explicite, même si l’analyse automatique est désactivée |
| Accepter la suggestion affichée | Alt+Entrée par défaut |
| Fermer la suggestion affichée | Raccourci personnalisable ; Échap est limité à l’éditeur affichant la proposition |
| Créer une règle | Ajouter une règle locale ou globale manuellement |

Configurer les raccourcis dans **Paramètres → Raccourcis clavier**, sans interception globale du clavier. Le bandeau ne prend pas le focus. Les boutons sont accessibles au clavier ; l’ouverture volontaire des fenêtres utilise les conventions natives d’Obsidian.

Une même proposition ne s’affiche spontanément qu’une fois par session. Le délai par défaut entre deux propositions est de 60 secondes. Fermer une proposition ne force pas l’affichage immédiat de la suivante. La liste reste disponible sans attendre.

## Paramètres

**Analyse** : activation automatique, fréquence minimale (6), longueur minimale (9), maximum de propositions en attente par fichier (5), debounce après édition (1 500 ms), délai entre propositions (60 000 ms), mots vides personnalisables.

**Substitution** : activation générale, espace activé par défaut, Tab désactivé par défaut, portée par défaut des règles manuelles. Avec Tab activé, seul un raccourci complet reconnu est développé ; aucune tabulation n’est insérée dans ce cas. Sinon, Tab reste disponible aux autres extensions. Les suggestions automatiques restent locales, quelle que soit la portée choisie pour les créations manuelles.

**Dictionnaire** : création, modification des sources/remplacements et de la portée, activation/désactivation, suppression après confirmation. Les refus et ignorances sont consultables et restaurables. La restauration autorise une nouvelle proposition lors de l’analyse suivante si les critères sont encore satisfaits.

Deux règles de même source sont interdites dans la même portée. Une règle active du fichier a priorité sur une règle globale active. Désactiver une règle locale permet donc à la règle globale de s’appliquer.

## Fonctionnement technique

L’analyse lit le texte de l’éditeur actif, y compris les modifications non encore enregistrées. Les événements Vault déclenchent aussi une nouvelle analyse si le fichier actif change. Aucun accès Node.js aux notes n’est utilisé.

Le tokenizer Unicode reconnaît les accents, normalise en NFC et traite les apostrophes typographiques. Les élisions françaises (`l’`, `d’`, `qu’`…) sont retirées pour le comptage. Le comptage ne distingue pas majuscules et minuscules.

Les exclusions sont conservatrices : frontmatter YAML, fences de code fermées ou ouvertes, code indenté, code inline, URL, adresses e-mail, liens et images Markdown, wikiliens, références, commentaires et balises HTML. Les libellés de liens sont exclus eux aussi. Les liens et le code inline en cours de frappe bénéficient d’une protection avant fermeture.

L’algorithme d’abréviation génère des préfixes, squelettes consonantiques et variantes mixtes de 3 à 6 caractères. Il classe les candidats selon structure reconnaissable, longueur, économie de frappe et fréquence. Il exclut les mots usuels intégrés au moteur, les mots du document et les raccourcis déjà réservés. Les exemples de mots ne sont pas codés en dur. Si tous les candidats sont bloqués, aucune proposition n’est créée ; la création manuelle reste possible.

Un filtre de transactions CodeMirror 6 reconnaît uniquement l’insertion d’un espace isolé portant l’événement de saisie `input.type`. Il complète la même transaction avec la modification du mot précédent et isole cette opération dans l’historique Undo. Aucun `dispatch` récursif n’est utilisé. Les collages, drops, compositions IME, insertions multiples, sélections multiples, remplacements de sélection et transactions d’autocomplétion sont ignorés. Une autocomplétion ouverte ou en attente garde la priorité. Les limites Unicode sont vérifiées à gauche et à droite du curseur.

Les règles et décisions ont des identifiants stables et sont stockées avec les paramètres dans `data.json`, via `loadData()` / `saveData()`. Les écritures sont regroupées après 500 ms, sérialisées pour éviter une sauvegarde ancienne après une récente, et une dernière sauvegarde est demandée au déchargement. Comme Obsidian n’attend pas une promesse dans `onunload`, un arrêt brutal peut perdre les derniers changements non encore sauvegardés. Le schéma est versionné ; une version inconnue interrompt le chargement sans écraser le fichier.

Les renommages et déplacements de fichiers ou dossiers actualisent les chemins des règles et des décisions via l’événement Vault `rename`. Les règles d’un fichier supprimé sont conservées et restent supprimables dans les paramètres. Un fichier recréé au même chemin hérite donc de ces règles et de cet historique.

## Architecture

```text
src/
  main.ts                    Cycle de vie, commandes, événements, bandeau
  analysis/markdown.ts       Exclusions, extraction et comptage
  abbreviations/generate.ts  Candidats déterministes et classement
  suggestions/service.ts    Sélection, validation et historique
  editor/substitution.ts    Transactions CodeMirror et Tab
  settings/ui.ts            Paramètres et fenêtres natives
  storage/model.ts          Types, schéma, migration et résolution des portées
tests/
  core.test.ts               Analyse, génération, historique et portées
  editor.test.ts             Transactions, Undo/Redo, clavier Tab et autocomplétion
  lifecycle.test.ts          API Obsidian simulée, debounce, sauvegarde et nettoyage
  mock-obsidian.ts           Adaptateur de test uniquement
  mock-field.ts              Champ CodeMirror de test uniquement
```

Les moteurs d’analyse, d’abréviation et de suggestions sont indépendants d’Obsidian ; une analyse future de dossiers pourra réutiliser ces modules sans changer le moteur de substitution.

## Commandes de développement

| Commande | Résultat |
| --- | --- |
| `npm ci` | Installer les versions verrouillées |
| `npm run dev` | Recompiler automatiquement `main.js` avec sourcemap |
| `npm run build` | Vérifier TypeScript et produire le bundle minifié |
| `npm run typecheck` | Vérification TypeScript stricte |
| `npm run lint` | ESLint sur les sources et tests |
| `npm test` | Tests Vitest avec les véritables bibliothèques CodeMirror et jsdom |

Structure et build inspirés du [plugin officiel d’exemple Obsidian](https://github.com/obsidianmd/obsidian-sample-plugin). Les modules `obsidian`, `@codemirror/*` et `@lezer/*` restent externes au bundle pour utiliser ceux de l’hôte.

## Validation et limites V1

Les tests automatisés couvrent les moteurs, la persistance sérialisée, les transactions CodeMirror, Undo/Redo, Unicode, les contextes exclus, les collages, le clavier Tab, la priorité de l’autocomplétion et le nettoyage des événements. Un test analyse 30 000 lignes sous une limite de 5 secondes ; il ne remplace pas un benchmark sur tous les appareils. Le cycle de vie Obsidian est testé avec une API simulée.

**Aucune session réelle d’Obsidian desktop ou mobile n’a été exécutée pour cette livraison.** Le manifeste autorise le mobile car le plugin n’utilise aucune API exclusivement desktop ; cela ne constitue pas une validation sur appareil. Vérifier notamment l’affichage du bandeau et les interactions avec les autres plugins dans son coffre.

- Analyse synchrone après debounce : de très gros fichiers peuvent provoquer une brève pause. Les exclusions sont mises en cache par document CodeMirror pour la substitution et ne sont calculées que lorsqu’une règle correspond.
- Le scanner est conservateur, sans parseur Markdown complet : les syntaxes exotiques ou imbriquées de plugins tiers peuvent ne pas être reconnues. Les mots vides français initiaux et le petit lexique anticollision sont extensibles mais non exhaustifs.
- Les sources sont comparées sans distinction de casse ; le remplacement utilise exactement le texte enregistré, sans capitalisation automatique.
- Une règle ne s’applique qu’à la saisie future d’une frontière, dans un éditeur et avec un seul curseur. Aucun traitement en lecture seule ou en mode Lecture.
- Aucun engagement de compatibilité avec tous les plugins qui modifient les mêmes transactions ou la touche Tab. Une extension de priorité supérieure peut prendre la main ; Tab reste désactivé par défaut.
- La suppression d’une règle acceptée ne réinitialise pas sa décision historique ; utiliser la création manuelle pour la recréer.

## Pistes V2

Analyse incrémentale ou en Worker pour les très grands fichiers, exclusions fondées sur l’arbre syntaxique de l’hôte, prévisualisation de plusieurs candidats, export/import du dictionnaire, puis analyse de dossiers sur demande et validation mobile réelle.

## Licence

MIT — voir [LICENSE](LICENSE).
