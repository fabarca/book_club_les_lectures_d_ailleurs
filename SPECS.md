## Structure du projet
- `src/` — sources TypeScript
  - `main.ts` → compile vers `main.js` (chargement des livres, orchestration : construit la carte SVG et branche le panneau de détail)
  - `meetup_parser.ts` → compile vers `meetup_parser.js` (script Node : récupère les événements Meetup et met à jour `books/`)
  - `generate_manifest.ts` → compile vers `generate_manifest.js` (script Node : reconstruit `manifest.json` en scannant `books/`, exécuté automatiquement avant `npm run build` et par `meetup_parser.js`)
  - `lib/bookParser.ts` — parseur du format markdown des livres (réutilisé côté navigateur et côté Node)
  - `lib/countryLookup.ts` — correspondance nom de pays en français → clé du fichier GeoJSON
  - `lib/countryGeometry.ts` — centroïdes de pays et conversion des géométries GeoJSON en tracés SVG
  - `lib/geoProjection.ts` — projection équirectangulaire (coordonnées géographiques → coordonnées SVG)
  - `lib/svgMapView.ts` — rendu du `<svg id="map">` (pays, un marqueur "pin" par pays affichant le nombre de livres) et interaction zoom/déplacement
  - `lib/detailPanel.ts` — panneau de détail d'un livre, et liste des livres d'un pays quand il y en a plusieurs
  - `lib/types.ts` — types partagés
- `data/world-countries.geo.json` — contours des pays (Natural Earth, domaine public), utilisé pour tracer la carte et positionner les marqueurs
- `books/{author}__{book}.md` — un fichier par livre
- `books/{author}__{book}.jpg` — couverture du livre
- `index.html` — page d'accueil (charge `styles.css` puis `main.js`)
- `styles.css` — styles de la page et de la carte
- `manifest.json` — liste des fichiers de `books/`, générée automatiquement par `generate_manifest.js` à partir du contenu du dossier (nécessaire car un site statique ne peut pas lister un dossier lui-même)

Format des fichiers markdown:
```markdown
# Livre: {book}
{image}
Édition: {event_number}
Date l'événement: {event_date}
Lien: {event_url}
Auteur: {author}
Année: {book_year}
Pays: {author_country}

## Description
{book_description}

```

## Stack
Software open source.
TypeScript, compilé en JavaScript simple (pas de framework, pas de bundler).
Carte du monde dessinée en SVG à partir de `data/world-countries.geo.json` (pas de dépendance externe, pas de tuiles chargées depuis un CDN).

## Conventions
Code and comments are written in English. Content texts directed to final users are written in French.

This project follow the principles of: Don't Repeat Yourself, Keep it simple and Separation of Concerns.

In order to improve readability when returning an output in a function, prefer to store the output in a variable first with a clear name instead of a direct return of the expression that produce the output. Prefer returning a single variable(e.g. "return variable_name"), instead of a list (e.g. "return [a, b, ...]") or a dict (e.g. "return {a, b}").

Don't use anonymous functions.
Use explicit loops (like: for, for..of, for..in).
Reduce complexity by avoiding embedded logics and thus reducing the levels of indentation. For example, when finding more than three levels of identation inside a function, it must be refactored by extracting some logic outside (for example in a separated function). Don't define functions inside functions.

Whenever is possible, prefer functional programming approach, for example creating functions that return an output without modifying the state of the input. 

Use clear naming of functions, classes, methods, variables, etc.