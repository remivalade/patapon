# Plan de restructuration du code

Statut : retenu. Version de référence : commit `9873a01` (à taguer `v0.9-reference` sur GitHub).

## Objectif

Rendre le jeu plus simple à comprendre, modifier et tester, en conservant une version jouable après chaque étape. Le chantier reste volontairement court : Three.js reste inclus dans le dépôt, les commandes actuelles fonctionnent sans installation, le code reste en JavaScript.

## Critère de fin

Le chantier est terminé quand ces trois points sont vrais :

- on peut modifier une interaction sans fouiller tout `world.js` ;
- les tests survivent au déplacement d'une fonction d'un fichier à un autre ;
- les transitions du joueur (marche, nage, monture, ascenseur) ont un seul endroit responsable de leur cohérence.

Ensuite, retour aux nouveautés pour Marceau.

## Les quatre étapes

| Étape                      | Périmètre                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Référence et lisibilité | Taguer la version actuelle, formater le code dans un commit séparé, conserver une courte checklist téléphone. Pas de renommage ni de nettoyage logique dans ce commit.                                        |
| 2. Tests découplés         | Exposer quelques opérations stables : créer une partie de test, avancer la simulation, envoyer une commande, consulter l'état. Les tests utilisent ces opérations au lieu de réécrire le texte de `world.js`. |
| 3. Découpage limité        | Extraire les responsabilités évidentes de `world.js` en conservant les calculs, les constantes et l'ordre des mises à jour. Quatre ou cinq fichiers supplémentaires sont une bonne cible, pas une obligation. |
| 4. Mode joueur explicite   | Centraliser marche, nage, monture et ascenseur, ainsi que leurs transitions. Conserver séparément la phase de l'expérience : introduction, arrivée, jeu.                                                      |

## Avancement

- Étape 1 terminée : version de référence `9873a01`, formatage Prettier vérifié par captures d'écran identiques, checklist ajoutée.
- Étape 2 terminée : `world.js` expose `createGame({ renderer })`, `main.js` démarre le jeu dans le navigateur, `tests/harness.mjs` crée une partie simulée. Les 26 vérifications passent par cette porte d'entrée, sans lire le texte de `world.js`.
- Étape 3 terminée : la construction du monde est sortie de `world.js` vers `builders.js`, `exterior.js`, `habitat.js`, `village.js`, `sun.js` et `marceau.js`, sans changer les calculs ni l'ordre. Une empreinte de toute la scène (positions, matrices, géométries) est identique avant et après. `world.js` garde l'état du joueur, les commandes, la caméra et la boucle. Premier jalon d'essais téléphone à faire.
- Étape 4 : à faire.

## Précisions

- **Formatage.** Le risque est très faible plutôt que nul. Un outil automatique (Prettier, configuration dans `.prettierrc.json`), un diff exclusivement de formatage et les tests existants suffisent à le vérifier.
- **Mode explicite.** Tout ne devient pas un état exclusif : sauter est compatible avec marcher ou monter un animal. La hauteur et la vitesse du saut restent des données associées au mode, pas un mode à part.
- **Pourquoi les tests avant le découpage.** Les tests actuels lisent le texte de `world.js` et y injectent du code qui accède à ses variables internes. Tout découpage les casserait. Les découpler d'abord préserve le filet de sécurité au moment où il sert.

## Validation

Les vérifications automatiques (`npm run check`, `npm test`, `npm run build`) tournent à chaque commit. Les essais manuels sur téléphone sont regroupés en deux jalons :

1. après le découpage (fin de l'étape 3) ;
2. après les transitions du joueur (fin de l'étape 4).

Un essai ciblé supplémentaire se justifie si une anomalie apparaît. La checklist se trouve dans `docs/checklist-telephone.md`.

## Possibilités futures, sans engagement

Ces évolutions ne sont entreprises que si une nouveauté du jeu en a besoin :

- contrat commun des montures (le jour où un deuxième véhicule arrive) ;
- lieux et réglages décrits dans des fichiers de données ;
- Vite et Three.js en dépendance npm avec fichier de verrouillage ;
- TypeScript, en commençant par les modules purs ;
- test de fumée dans un navigateur (Playwright) ;
- profils de qualité et budget de performance mesuré sur téléphone.
