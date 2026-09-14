Structure du projet
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

Stack:
Software open source.
TypeScript, compilé en JavaScript simple (pas de framework, pas de bundler).
Carte du monde dessinée en SVG à partir de `data/world-countries.geo.json` (pas de dépendance externe, pas de tuiles chargées depuis un CDN).

Conventions:
Le code est en anglais, le contenu des markdown et du site statique est en français.
