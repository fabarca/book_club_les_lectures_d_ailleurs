import { parseBookMarkdown } from "./lib/bookParser.js";
import { lookupCountryGeoName } from "./lib/countryLookup.js";
import { buildCountryCentroids, geometryToSvgPath } from "./lib/countryGeometry.js";
import { project, MAP_VIEWBOX } from "./lib/geoProjection.js";
import { createSvgMapState, renderCountries, renderMarkers, registerBackgroundClickHandler, registerCountryClickHandler, setSelectedCountry, setMarkersVisible, } from "./lib/svgMapView.js";
import { renderBookListPanel } from "./lib/bookListPanel.js";
import { renderBookDetailPanel } from "./lib/bookDetailPanel.js";
async function loadManifest() {
    const response = await fetch("manifest.json");
    if (!response.ok)
        throw new Error(`Failed to load manifest.json: HTTP ${response.status}`);
    const manifest = await response.json();
    return manifest;
}
async function loadGeojson() {
    const response = await fetch("data/world-countries.geo.json");
    const geojson = await response.json();
    return geojson;
}
async function loadBook(entry) {
    try {
        const response = await fetch(`books/${entry.file}`);
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        const book = parseBookMarkdown(text, entry.file);
        return book;
    }
    catch (error) {
        console.warn(`Skipping ${entry.file}:`, error);
        return null;
    }
}
async function loadBooks(manifest) {
    const bookPromises = [];
    for (const entry of manifest)
        bookPromises.push(loadBook(entry));
    const loadedBooks = await Promise.all(bookPromises);
    const books = filterLoadedBooks(loadedBooks);
    return books;
}
function filterLoadedBooks(loadedBooks) {
    const books = [];
    for (const book of loadedBooks) {
        if (book !== null)
            books.push(book);
    }
    return books;
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
function buildMarkers(booksByCountry, centroids) {
    const markers = [];
    for (const [geoName, countryBooks] of booksByCountry) {
        const centroid = centroids.get(geoName);
        const point = project(centroid.lat, centroid.lng);
        const marker = { ...point, geoName, books: countryBooks };
        markers.push(marker);
    }
    return markers;
}
function buildCountryFeatures(geojson) {
    const countries = [];
    for (const feature of geojson.features) {
        if (typeof feature.properties?.name !== "string" || !feature.geometry)
            continue;
        const country = {
            name: feature.properties.name,
            path: geometryToSvgPath(feature.geometry, project),
        };
        countries.push(country);
    }
    return countries;
}
function compareFilterOptionsByLabel(a, b) {
    const comparison = a.label.localeCompare(b.label, "fr");
    return comparison;
}
function buildFilterOptions(booksByCountry) {
    const filterOptions = [];
    for (const [geoName, countryBooks] of booksByCountry) {
        const option = { geoName, label: countryBooks[0].country };
        filterOptions.push(option);
    }
    filterOptions.sort(compareFilterOptionsByLabel);
    return filterOptions;
}
function getVisibleBooks(state) {
    if (state.currentFilterGeoName === null)
        return state.books;
    const visibleBooks = state.booksByCountry.get(state.currentFilterGeoName) ?? [];
    return visibleBooks;
}
function showBookList(state) {
    const visibleBooks = getVisibleBooks(state);
    renderBookListPanel(visibleBooks, state.filterOptions, state.currentFilterGeoName, handleFilterChange.bind(null, state), handleBookSelected.bind(null, state));
}
function setCurrentFilterGeoName(state, geoName) {
    state.currentFilterGeoName = geoName;
    setSelectedCountry(state.mapState, geoName);
}
function handleFilterChange(state, geoName) {
    setCurrentFilterGeoName(state, geoName);
    showBookList(state);
}
function handleBookSelected(state, book) {
    renderBookDetailPanel(book, showBookList.bind(null, state));
}
function openPanel(state) {
    state.bookPanel?.classList.add("open");
    state.bookPanelToggle?.classList.add("open");
}
function closePanel(state) {
    state.bookPanel?.classList.remove("open");
    state.bookPanelToggle?.classList.remove("open");
}
function togglePanel(state) {
    if (state.bookPanel?.classList.contains("open"))
        closePanel(state);
    else
        openPanel(state);
}
function toggleMarkerVisibility(state) {
    state.markersVisible = !state.markersVisible;
    setMarkersVisible(state.mapState, state.markersVisible);
    state.markerToggle?.classList.toggle("markers-off", !state.markersVisible);
}
function handleMarkerSelected(state, geoName) {
    setCurrentFilterGeoName(state, geoName);
    showBookList(state);
    openPanel(state);
}
function handleMapBackgroundClicked(state) {
    setCurrentFilterGeoName(state, null);
    showBookList(state);
}
function getMapContainer() {
    const mapContainer = document.getElementById("map");
    if (!mapContainer)
        throw new Error("Missing #map container");
    return mapContainer;
}
async function main() {
    const [manifest, geojson] = await Promise.all([loadManifest(), loadGeojson()]);
    const centroids = buildCountryCentroids(geojson);
    const books = await loadBooks(manifest);
    const booksByCountry = groupBooksByCountry(books, centroids);
    const markers = buildMarkers(booksByCountry, centroids);
    const countries = buildCountryFeatures(geojson);
    const filterOptions = buildFilterOptions(booksByCountry);
    const mapContainer = getMapContainer();
    const mapState = createSvgMapState(mapContainer, MAP_VIEWBOX);
    renderCountries(mapState, countries, new Set(booksByCountry.keys()));
    const bookPanel = document.getElementById("book-panel");
    const bookPanelToggle = document.getElementById("book-panel-toggle");
    const markerToggle = document.getElementById("marker-toggle");
    const state = {
        books,
        booksByCountry,
        filterOptions,
        currentFilterGeoName: null,
        mapState,
        bookPanel,
        bookPanelToggle,
        markerToggle,
        markersVisible: true,
    };
    bookPanelToggle?.addEventListener("click", togglePanel.bind(null, state));
    markerToggle?.addEventListener("click", toggleMarkerVisibility.bind(null, state));
    renderMarkers(mapState, markers, handleMarkerSelected.bind(null, state));
    registerCountryClickHandler(mapState, handleMarkerSelected.bind(null, state));
    registerBackgroundClickHandler(mapState, handleMapBackgroundClicked.bind(null, state));
    showBookList(state);
    openPanel(state);
}
function handleMainError(error) {
    console.error("Failed to initialize the map:", error);
}
main().catch(handleMainError);
