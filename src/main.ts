import type { Book, ManifestEntry } from "./lib/types.js";
import { parseBookMarkdown } from "./lib/bookParser.js";
import { lookupCountryGeoName } from "./lib/countryLookup.js";

interface CountryCentroid {
  lat: number;
  lng: number;
}

async function loadManifest(): Promise<ManifestEntry[]> {
  const response = await fetch("books/manifest.json");
  if (!response.ok) throw new Error(`Failed to load manifest.json: HTTP ${response.status}`);
  return response.json();
}

async function loadBook(entry: ManifestEntry): Promise<Book | null> {
  try {
    const response = await fetch(`books/${entry.file}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return parseBookMarkdown(text, entry.file);
  } catch (error) {
    console.warn(`Skipping ${entry.file}:`, error);
    return null;
  }
}

/** Bounding-box center of a country's geometry. Simple and good enough for
 * marker placement; not corrected for countries that cross the antimeridian
 * (e.g. Russia, Fiji), where this can land in the wrong hemisphere. */
function computeCentroid(geometry: GeoJSON.Geometry): CountryCentroid {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;

  function visit(coords: any): void {
    if (typeof coords[0] === "number") {
      const [lng, lat] = coords as [number, number];
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    } else {
      for (const c of coords) visit(c);
    }
  }

  visit((geometry as any).coordinates);
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
}

function buildCountryCentroids(geojson: GeoJSON.FeatureCollection): Map<string, CountryCentroid> {
  const centroids = new Map<string, CountryCentroid>();
  for (const feature of geojson.features) {
    const name = feature.properties?.name;
    if (typeof name === "string" && feature.geometry) {
      centroids.set(name, computeCentroid(feature.geometry));
    }
  }
  return centroids;
}

/** Deterministic string hash (djb2) so the same book always jitters to the
 * same spot across reloads. */
function hashString(value: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return Math.abs(hash);
}

function jitteredPosition(centroid: CountryCentroid, seedKey: string): [number, number] {
  const angle = hashString(seedKey, 5381) % 360;
  const radius = 0.3 + (hashString(seedKey, 52711) % 5) * 0.15;
  const radians = (angle * Math.PI) / 180;
  return [centroid.lat + radius * Math.sin(radians), centroid.lng + radius * Math.cos(radians)];
}

function renderDetailPanel(book: Book): void {
  const panel = document.getElementById("book-detail");
  if (!panel) return;

  panel.innerHTML = `
    <button id="book-detail-close" aria-label="Fermer">&times;</button>
    <img src="books/${book.imagePath}" alt="Couverture de ${escapeHtml(book.title)}" />
    <h2>${escapeHtml(book.title)}</h2>
    <p class="book-meta">${escapeHtml(book.author)} — ${escapeHtml(book.year)} — ${escapeHtml(book.country)}</p>
    <p class="book-edition">Édition ${escapeHtml(book.edition)} (${escapeHtml(book.eventDate)})</p>
    <div class="book-description">${escapeHtml(book.description).replace(/\n/g, "<br>")}</div>
  `;
  panel.hidden = false;
  document.getElementById("book-detail-close")?.addEventListener("click", () => {
    panel.hidden = true;
  });
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

async function main(): Promise<void> {
  const [manifest, geojson] = await Promise.all([
    loadManifest(),
    fetch("data/world-countries.geo.json").then((r) => r.json()),
  ]);

  const centroids = buildCountryCentroids(geojson);
  const books = (await Promise.all(manifest.map(loadBook))).filter((b): b is Book => b !== null);

  const map = L.map("map").setView([20, 10], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 18,
  }).addTo(map);

  for (const book of books) {
    const geoName = lookupCountryGeoName(book.country);
    const centroid = geoName ? centroids.get(geoName) : undefined;
    if (!centroid) {
      console.warn(`No map position for "${book.title}" (Pays: "${book.country}")`);
      continue;
    }

    const [lat, lng] = jitteredPosition(centroid, book.sourceFile);
    const marker = L.marker([lat, lng]).addTo(map);
    marker.on("click", () => renderDetailPanel(book));
  }
}

main().catch((error) => {
  console.error("Failed to initialize the map:", error);
});
