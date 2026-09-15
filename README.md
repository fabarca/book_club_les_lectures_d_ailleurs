Projet:

Carte interactive des livres lus dans le Book Club "Lecture d'ailleurs". Il s'agit d'un site web statique publié sur GitHub Pages. Un marqueur par pays est affiché sur une carte du monde dessinée en SVG (positionné au centroïde du pays de l'auteur), indiquant le nombre de livres lus dans ce pays. Au survol, le pays est mis en évidence et son nom s'affiche ; un clic ouvre le détail du livre (couverture, auteur, année, description), ou une liste pour choisir lequel afficher si plusieurs livres partagent ce pays. Les données sont extraites automatiquement depuis Meetup.

Source: historique des événements et des livres lus (récupéré via l'API GraphQL publique de Meetup, sans authentification — voir `meetup_parser.js`)
https://www.meetup.com/fr-fr/club-de-lecture-les-lectures-d-ailleurs/

Pour la structure du projet, le format des fichiers et les conventions techniques, voir [SPECS.md](SPECS.md).

Installation:
```bash
npm install
npm run build   # compile src/*.ts vers main.js, meetup_parser.js, lib/*.js
```

Mode d'utilisation — mettre à jour les livres:
```bash
npm run parse   # équivalent à: node meetup_parser.js
```
Ce script récupère tous les événements passés du club sur Meetup et crée un fichier `.md` + une image de couverture pour chaque nouveau livre. Il ne modifie jamais un fichier `.md` déjà présent (pour ne pas écraser les corrections manuelles).

⚠️ Meetup ne fournit pas les champs `Pays` et `Année` de façon fiable (ils ne sont pas structurés dans les descriptions d'événements). Le script écrit `À COMPLÉTER` pour ces deux champs et affiche un avertissement dans la console — il faut les compléter à la main dans `books/*.md` après chaque exécution. Un livre dont `Pays` n'est pas renseigné n'apparaît pas sur la carte (un avertissement est visible dans la console du navigateur).

Mode d'utilisation — voir la carte en local:
```bash
npm run serve   # équivalent à: npx http-server . -c-1
```
Puis ouvrir http://localhost:8080 dans un navigateur. Un serveur HTTP est nécessaire même en local : le navigateur bloque les requêtes `fetch()` vers des fichiers locaux ouverts directement (`file://`).

Tests:

Installation initiale (une seule fois) :
```bash
npm install
npx playwright install chromium
```

Lancer les tests:
```bash
npm test   # recompile (npm run build) puis lance la suite Playwright en headless contre localhost:8080
npm run test:ui   # mode interactif, pour déboguer un test localement
```
Les specs vivent dans `tests/` et couvrent le rendu de la carte, le survol/clic sur un marqueur, le filtre par pays, le panneau de détail, le zoom/pan (molette et glisser-déposer), et le comportement spécifique aux marqueurs sur mobile (masqués jusqu'à un certain niveau de zoom). En cas d'échec, Playwright enregistre une capture d'écran et une trace sous `test-results/` (la commande exacte pour l'ouvrir, `npx playwright show-trace ...`, est affichée dans la sortie).

Déploiement:
Le site est prévu pour être publié via GitHub Pages ("Deploy from branch: main / root", sans workflow GitHub Actions). Il faut lancer `npm run build` localement et committer le JavaScript compilé avant de pousser, pour que les fichiers `main.js` / `meetup_parser.js` servis correspondent au code source.
