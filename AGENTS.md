# Repères pour contribuer au monde de Patapon

- Jeu familial de promenade 3D, d'abord sur téléphone, pour un enfant de 7 ans. Préserver le ton doux, la simplicité des commandes et les interactions acquises.
- Lire `readme.md`. Les sources sont dans `src/`, le point d'entrée à la racine. `dist/` est généré et ignoré par Git.
- Commandes : `npm run dev`, `npm run check`, `npm test`, `npm run build`, `npm run preview`. Node.js 22+, aucune installation de dépendances dans cette version.
- Le monde est la face INTÉRIEURE d'une sphère de rayon 260 centrée en (0, 260, 0). La normale pointe vers l'extérieur ; le haut local pointe vers le centre. Une hauteur positive rapproche du centre.
- Utiliser les fonctions de `navigation.js` pour placer et déplacer les objets. Le transport parallèle permet de traverser les pôles ; ne pas remplacer cette navigation par un plan X/Z global. Le grand lac utilise sa propre carte locale près de l'antipode.
- Garder cohérents le rendu du pont, le relief, les hauteurs de marche et les collisions. Le speeder doit continuer à franchir les lacs.
- Préserver les états de marche/nage/conduite/ascenseur et le nettoyage des entrées lors d'une perte de focus, d'un changement d'orientation et d'une descente de monture. Freiner est prioritaire sur accélérer.
- Demander l'accès aux capteurs uniquement après un appui. Préserver le joystick en cas de refus ou de capteurs absents. Vérifier portrait et les deux paysages.
- Three.js r169 est inclus avec sa licence. Les matériaux modifient `onBeforeCompile` et composent les effets de vent et de nuit ; ne pas écraser ces hooks en ajoutant un effet.
- Réutiliser l'instanciation et les pools de particules ; éviter de multiplier les lumières dynamiques et les allocations dans la boucle de rendu. Mesurer sur téléphone avant d'affirmer un gain de fluidité.
- Les tests ne lisent pas l'intérieur de `world.js` : ils passent par l'objet rendu par `createGame` (commandes, `place`, `state`, `parts`) et par le harnais `tests/harness.mjs`. Quand une fonction change de fichier, garder cet objet à jour plutôt que d'exposer des variables internes.
- Les tests simulent le DOM et WebGL, pas les mathématiques Three.js. Ils ne prouvent ni le rendu GPU, ni les performances, ni les permissions réelles des capteurs. Donner les limites de validation dans les comptes rendus.
- Garder les changements petits et expliquer pourquoi ils sont nécessaires. Le refactoring de `world.js` reste à faire progressivement ; ne pas mêler une grosse refonte et des nouveautés de jeu.
- Ne pas ajouter de secrets, de compte serveur ou de service externe sans besoin établi. L'hébergement cible de cet export est Vercel statique.
