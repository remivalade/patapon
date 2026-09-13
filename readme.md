# Le monde de Patapon

Un jeu de promenade 3D pour Marceau, 7 ans, dans un univers inspiré de Star Wars. Marceau est un petit Jedi roux ; Patapon est un grand nounours contrebandier, installé devant sa maison en bois. Son astéroïde abrite un monde chaleureux : prairies, lacs, arbres, animaux et soleil artificiel.

Le terrain est **la face intérieure d'une sphère** : le sol opposé est visible au-dessus de soi, et marcher tout droit permet de faire le tour du monde. Le jeu est conçu d'abord pour le téléphone, avec un rendu low poly, une lumière douce et des effets légers.

## Contenu de cette version

- Approche extérieure dans un champ d'astéroïdes, puis entrée dans l'habitat.
- Maison de Patapon, vaisseau garé à proximité, promenade sur tout le globe.
- Collisions avec les arbres et les rochers, saut et nage.
- Speeder avec accélération, décélération et freinage, utilisable au-dessus de l'eau.
- Conduite par joystick ou inclinaison du téléphone, avec recalibrage.
- Vaches et moutons interactifs et montables ; possibilité de sauter à dos d'animal.
- Route circulaire, grand lac à l'opposé de la maison, pont et île arborée.
- Tour de verre et ascenseur vers la salle de contrôle à l'intérieur du soleil.
- Cache solaire mobile produisant un cycle jour/nuit.
- Variétés d'arbres, champs de fleurs, papillons, lucioles, vent, poussière, éclaboussures et ambiance sonore.

## Démarrer sur ordinateur

Installer **Node.js 22 ou plus récent**, avec npm (inclus dans Node.js). Ouvrir un terminal dans ce dossier, celui qui contient `package.json` :

```bash
npm run dev
```

Ouvrir **http://127.0.0.1:5173**, puis appuyer sur le bouton d'entrée. Arrêter le serveur avec Ctrl+C. Ne pas ouvrir `index.html` par double-clic : les modules JavaScript doivent être servis en HTTP/HTTPS.

**Aucun `npm install` n'est nécessaire** dans cet export : Three.js et sa licence sont inclus, les scripts utilisent uniquement Node.js. Aucun compte, serveur applicatif, clé API ou fichier `.env` n'est nécessaire pour jouer.

| Commande                        | Utilité                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`                   | Servir les sources localement ; recharger la page après une modification         |
| `npm run dev -- --host 0.0.0.0` | Autoriser les appareils du même réseau local à accéder au jeu                    |
| `npm run check`                 | Vérifier la syntaxe JavaScript                                                   |
| `npm test`                      | Exécuter les vérifications de logique du jeu                                     |
| `npm run build`                 | Générer le site statique dans `dist/`                                            |
| `npm run preview`               | Servir `dist/` localement, après le build                                        |
| `npx prettier . --write`        | Reformater le code selon `.prettierrc.json` (Prettier est téléchargé à la volée) |

Pour tester sur téléphone en Wi-Fi, utiliser `http://IP-LOCALE-DE-L-ORDINATEUR:5173`. L'accès dépend du réseau et du pare-feu. Pour **l'inclinaison**, préférer l'adresse HTTPS fournie par l'hébergeur : les capteurs peuvent être indisponibles en HTTP local. Activer « Incliner » par un appui et autoriser les capteurs si le navigateur le demande ; tenir le téléphone confortablement puis utiliser le bouton de recentrage. Le joystick reste une solution de repli.

## Mettre le projet sur GitHub avec GitHub Desktop

**Dézipper ne publie pas automatiquement le projet.** Le ZIP contient un dossier de projet complet, y compris son dossier caché `.git`, qui conserve les dix commits du prototype. Aucune connexion à l'ancien serveur Git n'est configurée.

1. Dézipper l'archive et installer [GitHub Desktop](https://desktop.github.com/), puis se connecter à son compte GitHub.
2. Dans GitHub Desktop, choisir **File → Add Local Repository** et sélectionner le dossier `le-monde-de-patapon`, celui contenant ce README. Il s'agit déjà d'un dépôt Git : ne pas créer un autre dossier de dépôt à l'intérieur.
3. Dans **Changes**, vérifier les changements de préparation : déplacement de `dist/` vers `src/`, nouveau point d'entrée à la racine, documentation, scripts, tests et configuration Vercel. Ils sont volontairement prêts à être enregistrés sous ton compte. Saisir par exemple `Préparer le projet autonome pour GitHub et Vercel`, puis **Commit to main**. Les suppressions des anciens chemins sont normales : les fichiers du jeu sont maintenant sous `src/`.
4. Cliquer **Publish repository**, choisir `le-monde-de-patapon`, conserver **Keep this code private** et sélectionner le compte personnel (pas une organisation).
5. Cliquer **Publish Repository**. Le code et l'historique sont maintenant sur GitHub.

Il est important de dézipper le dossier entier, sans recopier uniquement les fichiers visibles : cela préservera `.git`, `.gitignore` et le dossier `.github` des vérifications automatiques. Sur macOS, les fichiers cachés s'affichent avec Cmd+Maj+point.

Un dépôt GitHub vide créé à l'avance n'est pas nécessaire avec ce parcours. Le bouton GitHub « Import repository » sert à importer depuis une adresse de dépôt Git, pas un fichier ZIP. Envoyer le ZIP lui-même comme un fichier dans GitHub ne permet pas de déployer son contenu.

Références officielles : [ajouter un dépôt local à GitHub Desktop](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-a-repository-from-your-local-computer-to-github-desktop), [publier un projet existant](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-an-existing-project-to-github-using-github-desktop).

## Héberger sur Vercel

Après la publication sur GitHub :

1. Se connecter à [Vercel](https://vercel.com/) et ajouter un nouveau projet depuis GitHub.
2. Donner accès au dépôt `le-monde-de-patapon` et l'importer.
3. Vérifier les réglages ci-dessous, puis lancer le déploiement.

| Réglage                   | Valeur                                           |
| ------------------------- | ------------------------------------------------ |
| Root Directory            | Racine du dépôt, `.`                             |
| Framework Preset          | Other                                            |
| Node.js                   | 22.x                                             |
| Install Command           | `node --version` (aucune dépendance à installer) |
| Build Command             | `npm run build`                                  |
| Output Directory          | `dist`                                           |
| Variables d'environnement | Aucune                                           |
| Branche de production     | `main`                                           |

Les commandes et le dossier de sortie sont déjà déclarés dans `vercel.json`. Ce projet est un **site statique JavaScript**, sans Vite dans cet export. Le build copie uniquement `index.html` et `src/` dans `dist/` ; il ne minifie ni ne regroupe les modules. Les tests, la documentation et l'historique Git ne font pas partie du site publié.

Une fois le déploiement terminé, ouvrir l'adresse HTTPS sur le téléphone. Les nouvelles modifications envoyées sur `main` déclencheront des déploiements. Pour essayer une évolution, travailler sur une branche puis ouvrir une pull request : Vercel peut fournir une prévisualisation avant la fusion dans `main`. [Documentation Git de Vercel](https://vercel.com/docs/git)

Un dépôt privé protège le code source sur GitHub ; **l'accès au jeu hébergé se règle séparément** dans Vercel. Vérifier le réglage de protection du déploiement selon les personnes qui doivent pouvoir jouer. L'offre Hobby est destinée aux projets personnels non commerciaux, dans ses quotas ; privilégier le dépôt personnel privé pour ce parcours. [Offre Hobby](https://vercel.com/docs/plans/hobby)

Si Vercel indique un problème d'auteur de commit, vérifier que l'adresse Git utilisée dans GitHub Desktop appartient bien au compte GitHub connecté à Vercel. Le commit de préparation de l'étape précédente doit être fait avec ton compte.

## Organisation du projet

| Chemin                        | Responsabilité                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                  | Point d'entrée et interface : entrée, joystick, pédales, saut, interactions                                                                                                                             |
| `src/main.js`                 | Point d'entrée dans le navigateur : crée le moteur de rendu puis démarre le jeu                                                                                                                         |
| `src/world.js`                | Le jeu lui-même, créé par `createGame` : état du joueur, commandes, interactions, caméra et boucle de jeu. Rend une porte d'entrée stable (commandes, `place`, `state`, `parts`) utilisée par les tests |
| `src/builders.js`             | Suite aléatoire déterministe, briques low poly (boîte, boule, cylindre, poutre) et pose sur le globe                                                                                                    |
| `src/exterior.js`             | Espace autour de l'astéroïde : ciel, étoiles, rocher, porte d'entrée, astéroïdes voisins                                                                                                                |
| `src/habitat.js`              | Face intérieure habitée : lumières, terrain, forêts, rochers, lacs, tour, tunnel, fleurs ; assemble le village et le soleil                                                                             |
| `src/village.js`              | Pierres de gué, cabane, transat, Patapon et son salut, vaisseau garé                                                                                                                                    |
| `src/sun.js`                  | Soleil artificiel : sphère, halo, lueur, poussières et intérieur                                                                                                                                        |
| `src/marceau.js`              | Modèle de Marceau et son ombre au sol                                                                                                                                                                   |
| `src/navigation.js`           | Géométrie sphérique, déplacements, relief, eau, collisions et pont                                                                                                                                      |
| `src/handling.js`             | Réponse des déplacements à pied et du speeder, accélération et freinage                                                                                                                                 |
| `src/tilt.js`                 | Capteurs d'orientation, permission, calibration et repli vers le joystick                                                                                                                               |
| `src/expansion.js`            | Modèles et comportement des animaux, speeder et ascenseur                                                                                                                                               |
| `src/landscape.js`            | Grand lac/pont/île et système de jour/nuit                                                                                                                                                              |
| `src/water.js`                | Rendu et animation de l'eau                                                                                                                                                                             |
| `src/vegetation.js`           | Variétés d'arbres, prairies fleuries, vent et papillons                                                                                                                                                 |
| `src/effects.js`              | Particules de déplacement, feuilles, lucioles et détails nocturnes                                                                                                                                      |
| `src/audio.js`                | Ambiance et sons synthétisés avec Web Audio                                                                                                                                                             |
| `src/style.css`               | Présentation et disposition des contrôles, notamment sur mobile                                                                                                                                         |
| `src/vendor/`                 | Three.js r169 et sa licence MIT                                                                                                                                                                         |
| `scripts/`                    | Serveur local, génération du dossier à héberger, vérification syntaxique                                                                                                                                |
| `tests/harness.mjs`           | Navigateur simulé pour les tests : faux DOM, faux moteur de rendu, création d'une partie                                                                                                                |
| `tests/game-regression.mjs`   | Vérifications automatisées des mécanismes existants, une par nom, exécutées dans l'ordre                                                                                                                |
| `.github/workflows/check.yml` | Vérifications GitHub Actions à chaque push et pull request                                                                                                                                              |
| `vercel.json`                 | Configuration d'hébergement Vercel                                                                                                                                                                      |
| `AGENTS.md`                   | Repères pour une personne ou un assistant qui reprend le code                                                                                                                                           |
| `docs/`                       | Plan de restructuration retenu et checklist des essais sur téléphone                                                                                                                                    |
| `dist/`                       | Résultat généré du build, ignoré par Git ; ne pas le modifier directement                                                                                                                               |

Le code du jeu et le moteur 3D sont conservés à l'identique dans `src/`. Seuls leur emplacement et les liens du point d'entrée ont changé. L'ancien hébergement n'est pas modifié par cet export. Le commit de référence du jeu est `dc6553e92c8b976716997d81c63007d369ee8e1d`.

## Contrôles

Sur téléphone : joystick à gauche pour marcher, glissement sur la partie droite pour regarder, bouton de saut et bouton contextuel près d'un véhicule, d'un animal ou de l'ascenseur. Toucher une vache ou un mouton provoque sa réaction sonore. En selle, utiliser les pédales à droite ; l'inclinaison se sélectionne avec « Incliner ». Le saut reste disponible sur les animaux.

Sur ordinateur : flèches ou touches de déplacement (ZQSD/WASD), espace pour sauter, E pour l'action contextuelle ; cliquer-glisser pour regarder. Les boutons à l'écran restent utilisables.

## Vérifications et limites

```bash
npm run check
npm test
npm run build
```

La suite de régression emploie les véritables mathématiques Three.js avec un DOM et un moteur de rendu simulés. Elle vérifie notamment le tour complet de la route, les collisions, les sauts, la nage, le speeder sur l'eau, les montures, l'ascenseur, les entrées tactiles simulées, le pont et la gestion des particules.

**Ces tests ne compilent pas les shaders sur un GPU et ne mesurent pas la fluidité réelle.** Avant une version destinée à Marceau, essayer sur le téléphone : entrée dans le monde, marche et caméra, collisions, nage, speeder avec inclinaison, saut à dos d'animal, pont, ascenseur et transition jour/nuit. Tester portrait et paysage, puis le retour dans le jeu après mise en veille. Vérifier aussi l'audio après le premier appui.

Le jeu n'a actuellement ni sauvegarde persistante, ni mode hors ligne installé, ni multijoueur. Certaines parties de `world.js` restent très compactes : la mise en dossier ne constitue pas encore une refonte de l'architecture.

## Faire évoluer le jeu

Faire une branche par amélioration, vérifier localement et sur une prévisualisation mobile, puis fusionner dans `main`. Conserver les vérifications avant de modifier la physique. Documenter les réglages et les décisions dans le dépôt.

Prochaines étapes possibles : introduire Vite et son fichier de verrouillage, rendre le code plus lisible, extraire progressivement les états du joueur et la caméra, partager les commandes des montures, déplacer les paramètres du monde dans des fichiers de données, puis introduire TypeScript. Les faire progressivement, avec une version jouable à chaque étape. Ne pas associer une mise à jour majeure de Three.js à cette première migration : les effets de lumière et de végétation personnalisent ses shaders.

Three.js est redistribué avec sa licence dans `src/vendor/THREE-LICENSE.txt`.
