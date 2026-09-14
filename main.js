import { parseBookMarkdown } from "./lib/bookParser.js";
import { lookupCountryGeoName } from "./lib/countryLookup.js";
import { buildCountryCentroids, geometryToSvgPath } from "./lib/countryGeometry.js";
import { project, MAP_VIEWBOX } from "./lib/geoProjection.js";
import { createSvgMap } from "./lib/svgMapView.js";
import { renderDetailPanel, renderBookList } from "./lib/detailPanel.js";
async function loadManifest() {
    const response = await fetch("manifest.json");
    if (!response.ok)
        throw new Error(`Failed to load manifest.json: HTTP ${response.status}`);
    return response.json();
}
async function loadBook(entry) {
    try {
        const response = await fetch(`books/${entry.file}`);
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        return parseBookMarkdown(text, entry.file);
    }
    catch (error) {
        console.warn(`Skipping ${entry.file}:`, error);
        return null;
    }
}
function groupBooksByCountry(books, centroids) {
    const booksByCountry = new Map();
    for (const book of books) {
        const geoName = lookupCountryGeoName(book.country);
        if (!geoName || !centroids.has(geoName)) {
            console.warn(`No map position for "${book.title}" (Pays: "${book.country}")`);
            continue;
        }
        const existing = booksByCountry.get(geoName);
        if (existing)
            existing.push(book);
        else
            booksByCountry.set(geoName, [book]);
    }
    return booksByCountry;
}
function showBookOrList(countryBooks) {
    if (countryBooks.length === 1) {
        renderDetailPanel(countryBooks[0]);
        return;
    }
    const showList = () => renderBookList(countryBooks, countryBooks[0].country, (book) => renderDetailPanel(book, showList));
    showList();
}
async function main() {
    const [manifest, geojson] = await Promise.all([
        loadManifest(),
        fetch("data/world-countries.geo.json").then((r) => r.json()),
    ]);
    const centroids = buildCountryCentroids(geojson);
    const books = (await Promise.all(manifest.map(loadBook))).filter((b) => b !== null);
    const booksByCountry = groupBooksByCountry(books, centroids);
    const markers = Array.from(booksByCountry, ([geoName, countryBooks]) => {
        const centroid = centroids.get(geoName);
        return { ...project(centroid.lat, centroid.lng), geoName, books: countryBooks };
    });
    const countries = geojson.features
        .filter((feature) => typeof feature.properties?.name === "string" && feature.geometry)
        .map((feature) => ({
        name: feature.properties.name,
        path: geometryToSvgPath(feature.geometry, project),
    }));
    const mapContainer = document.getElementById("map");
    if (!mapContainer)
        throw new Error("Missing #map container");
    const mapView = createSvgMap(mapContainer, MAP_VIEWBOX);
    mapView.renderCountries(countries, new Set(booksByCountry.keys()));
    mapView.renderMarkers(markers, showBookOrList);
}
main().catch((error) => {
    console.error("Failed to initialize the map:", error);
});
