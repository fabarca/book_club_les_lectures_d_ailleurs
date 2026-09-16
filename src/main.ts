import type { Book, ManifestEntry } from "./lib/types.js";
import { parseBookMarkdown } from "./lib/bookParser.js";
import { lookupCountryGeoName } from "./lib/countryLookup.js";
import { buildCountryCentroids, geometryToSvgPath, type CountryCentroid } from "./lib/countryGeometry.js";
import { project, MAP_VIEWBOX } from "./lib/geoProjection.js";
import {
  createSvgMapState,
  renderCountries,
  renderMarkers,
  registerBackgroundClickHandler,
  registerCountryClickHandler,
  setSelectedCountry,
  setHoveredCountry,
  setMarkersVisible,
  type SvgMapState,
  type CountryFeatureInput,
  type MarkerInput,
} from "./lib/svgMapView.js";
import { renderBookListPanel, type CountryFilterOption } from "./lib/bookListPanel.js";
import { renderBookDetailPanel } from "./lib/bookDetailPanel.js";

interface AppState {
  books: Book[];
  booksByCountry: Map<string, Book[]>;
  filterOptions: CountryFilterOption[];
  currentFilterGeoName: string | null;
  mapState: SvgMapState;
  bookPanel: HTMLElement | null;
  bookPanelToggle: HTMLElement | null;
  markerToggle: HTMLElement | null;
  markersVisible: boolean;
  bookListScrollTop: number;
}

async function loadManifest(): Promise<ManifestEntry[]> {
  const response = await fetch("manifest.json");
  if (!response.ok) throw new Error(`Failed to load manifest.json: HTTP ${response.status}`);
  const manifest = await response.json();
  return manifest;
}

async function loadGeojson(): Promise<GeoJSON.FeatureCollection> {
  const response = await fetch("data/world-countries.geo.json");
  const geojson = await response.json();
  return geojson;
}

async function loadBook(entry: ManifestEntry): Promise<Book | null> {
  try {
    const response = await fetch(`books/${entry.file}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const book = parseBookMarkdown(text, entry.file);
    return book;
  } catch (error) {
    console.warn(`Skipping ${entry.file}:`, error);
    return null;
  }
}

async function loadBooks(manifest: ManifestEntry[]): Promise<Book[]> {
  const bookPromises: Promise<Book | null>[] = [];
  for (const entry of manifest) bookPromises.push(loadBook(entry));
  const loadedBooks = await Promise.all(bookPromises);
  const books = filterLoadedBooks(loadedBooks);
  return books;
}

function filterLoadedBooks(loadedBooks: (Book | null)[]): Book[] {
  const books: Book[] = [];
  for (const book of loadedBooks) {
    if (book !== null) books.push(book);
  }
  return books;
}

function groupBooksByCountry(books: Book[], centroids: Map<string, CountryCentroid>): Map<string, Book[]> {
  const booksByCountry = new Map<string, Book[]>();
  for (const book of books) {
    const geoName = lookupCountryGeoName(book.country);
    if (!geoName || !centroids.has(geoName)) {
      console.warn(`No map position for "${book.title}" (Pays: "${book.country}")`);
      continue;
    }
    const existing = booksByCountry.get(geoName);
    if (existing) existing.push(book);
    else booksByCountry.set(geoName, [book]);
  }
  return booksByCountry;
}

function buildMarkers(booksByCountry: Map<string, Book[]>, centroids: Map<string, CountryCentroid>): MarkerInput[] {
  const markers: MarkerInput[] = [];
  for (const [geoName, countryBooks] of booksByCountry) {
    const centroid = centroids.get(geoName)!;
    const point = project(centroid.lat, centroid.lng);
    const marker: MarkerInput = { ...point, geoName, books: countryBooks };
    markers.push(marker);
  }
  return markers;
}

function buildCountryFeatures(geojson: GeoJSON.FeatureCollection): CountryFeatureInput[] {
  const countries: CountryFeatureInput[] = [];
  for (const feature of geojson.features) {
    if (typeof feature.properties?.name !== "string" || !feature.geometry) continue;
    const country: CountryFeatureInput = {
      name: feature.properties.name,
      path: geometryToSvgPath(feature.geometry, project),
    };
    countries.push(country);
  }
  return countries;
}

function compareFilterOptionsByLabel(a: CountryFilterOption, b: CountryFilterOption): number {
  const comparison = a.label.localeCompare(b.label, "fr");
  return comparison;
}

function buildFilterOptions(booksByCountry: Map<string, Book[]>): CountryFilterOption[] {
  const filterOptions: CountryFilterOption[] = [];
  for (const [geoName, countryBooks] of booksByCountry) {
    const option: CountryFilterOption = { geoName, label: countryBooks[0].country };
    filterOptions.push(option);
  }
  filterOptions.sort(compareFilterOptionsByLabel);
  return filterOptions;
}

function getVisibleBooks(state: AppState): Book[] {
  if (state.currentFilterGeoName === null) return state.books;
  const visibleBooks = state.booksByCountry.get(state.currentFilterGeoName) ?? [];
  return visibleBooks;
}

function showBookList(state: AppState): void {
  setSelectedCountry(state.mapState, state.currentFilterGeoName);
  const visibleBooks = getVisibleBooks(state);
  renderBookListPanel(
    visibleBooks,
    state.filterOptions,
    state.currentFilterGeoName,
    handleFilterChange.bind(null, state),
    handleBookSelected.bind(null, state),
    handleBookHoverChange.bind(null, state),
  );
}

function setCurrentFilterGeoName(state: AppState, geoName: string | null): void {
  state.currentFilterGeoName = geoName;
  setSelectedCountry(state.mapState, geoName);
}

function handleFilterChange(state: AppState, geoName: string | null): void {
  setCurrentFilterGeoName(state, geoName);
  showBookList(state);
}

function handleBookSelected(state: AppState, book: Book): void {
  state.bookListScrollTop = state.bookPanel?.scrollTop ?? 0;
  const geoName = lookupCountryGeoName(book.country);
  if (geoName) setSelectedCountry(state.mapState, geoName);
  renderBookDetailPanel(book, handleBookDetailBack.bind(null, state));
}

function handleBookDetailBack(state: AppState): void {
  showBookList(state);
  if (state.bookPanel) state.bookPanel.scrollTop = state.bookListScrollTop;
}

function handleBookHoverChange(state: AppState, geoName: string | null): void {
  setHoveredCountry(state.mapState, geoName);
}

function openPanel(state: AppState): void {
  state.bookPanel?.classList.add("open");
  state.bookPanelToggle?.classList.add("open");
}

function closePanel(state: AppState): void {
  state.bookPanel?.classList.remove("open");
  state.bookPanelToggle?.classList.remove("open");
}

function togglePanel(state: AppState): void {
  if (state.bookPanel?.classList.contains("open")) closePanel(state);
  else openPanel(state);
}

function toggleMarkerVisibility(state: AppState): void {
  state.markersVisible = !state.markersVisible;
  setMarkersVisible(state.mapState, state.markersVisible);
  state.markerToggle?.classList.toggle("markers-off", !state.markersVisible);
}

function handleMarkerSelected(state: AppState, geoName: string): void {
  setCurrentFilterGeoName(state, geoName);
  showBookList(state);
  openPanel(state);
}

function handleMapBackgroundClicked(state: AppState): void {
  setCurrentFilterGeoName(state, null);
  showBookList(state);
}

function getMapContainer(): HTMLElement {
  const mapContainer = document.getElementById("map");
  if (!mapContainer) throw new Error("Missing #map container");
  return mapContainer;
}

async function main(): Promise<void> {
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

  const state: AppState = {
    books,
    booksByCountry,
    filterOptions,
    currentFilterGeoName: null,
    mapState,
    bookPanel,
    bookPanelToggle,
    markerToggle,
    markersVisible: true,
    bookListScrollTop: 0,
  };

  bookPanelToggle?.addEventListener("click", togglePanel.bind(null, state));
  markerToggle?.addEventListener("click", toggleMarkerVisibility.bind(null, state));
  renderMarkers(mapState, markers, handleMarkerSelected.bind(null, state));
  registerCountryClickHandler(mapState, handleMarkerSelected.bind(null, state));
  registerBackgroundClickHandler(mapState, handleMapBackgroundClicked.bind(null, state));

  showBookList(state);
  openPanel(state);
}

function handleMainError(error: unknown): void {
  console.error("Failed to initialize the map:", error);
}

main().catch(handleMainError);
