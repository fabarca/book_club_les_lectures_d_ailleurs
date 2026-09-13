Projet:
Carte interactive des livres lus dans le Book Club "Lecture d'ailleurs". Il s'agit d'un site web statique publié sur GitHub Pages. Un marqueur par livre est affiché sur une carte du monde (positionné selon le pays de l'auteur), et un clic sur un marqueur ouvre le détail du livre (couverture, auteur, année, description). Les données sont extraites automatiquement depuis Meetup.

Source: historique des événements et des livres lus (récupéré via l'API GraphQL publique de Meetup, sans authentification — voir `meetup_parser.js`)
https://www.meetup.com/fr-fr/club-de-lecture-les-lectures-d-ailleurs/

Structure du projet
- `src/` — sources TypeScript
  - `main.ts` → compile vers `main.js` (code du navigateur : carte Leaflet, chargement des livres, panneau de détail)
  - `meetup_parser.ts` → compile vers `meetup_parser.js` (script Node : récupère les événements Meetup et met à jour `books/`)
  - `lib/bookParser.ts` — parseur du format markdown des livres (côté navigateur)
  - `lib/countryLookup.ts` — correspondance nom de pays en français → clé du fichier GeoJSON
  - `lib/types.ts` — types partagés
- `data/world-countries.geo.json` — contours des pays (Natural Earth, domaine public), utilisé pour positionner les marqueurs
- `books/{author}__{book}.md` — un fichier par livre
- `books/{author}__{book}.jpg` — couverture du livre
- `books/manifest.json` — liste des fichiers de `books/`, générée par `meetup_parser.js` (nécessaire car un site statique ne peut pas lister un dossier lui-même)
- `index.html` — page d'accueil (charge Leaflet depuis un CDN puis `main.js`)

Format des fichiers markdown:
```markdown
# Livre: {book}
{image}
Édition: {event_number}
Date l'événement: {event_date}
Auteur: {author}
Année: {book_year}
Pays: {author_country}

## Description
{book_description}

```

Stack:
Software open source.
TypeScript, compilé en JavaScript simple (pas de framework, pas de bundler).
Leaflet.js pour la carte (chargé depuis un CDN dans `index.html`).

Conventions:
Le code est en anglais, le contenu des markdown et du site statique est en français.

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

Déploiement:
Le site est prévu pour être publié via GitHub Pages ("Deploy from branch: main / root", sans workflow GitHub Actions). Il faut lancer `npm run build` localement et committer le JavaScript compilé avant de pousser, pour que les fichiers `main.js` / `meetup_parser.js` servis correspondent au code source.
