import type { Point2D } from "./geoProjection.js";

export interface CountryCentroid {
  lat: number;
  lng: number;
}

/** Shifts a ring's longitudes into a contiguous range when it crosses the
 * antimeridian (e.g. Fiji, the Russian mainland): some vertices are recorded
 * near +180 and others near -180, so a naive min/max or area calculation
 * would treat it as spanning almost the whole globe. Shifting negative
 * longitudes by +360 puts both sides next to each other; the final result is
 * unwrapped back to -180..180 by `rewrapLng`. */
function unwrapRingLongitudes(ring: [number, number][]): [number, number][] {
  let minLng = Infinity, maxLng = -Infinity;
  for (const [lng] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  if (maxLng - minLng <= 180) return ring;
  return ring.map(([lng, lat]): [number, number] => [lng < 0 ? lng + 360 : lng, lat]);
}

function rewrapLng(lng: number): number {
  return lng > 180 ? lng - 360 : lng;
}

function ringArea(ring: [number, number][]): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

/** True area-weighted centroid of a ring (not a plain vertex average, which
 * skews toward whichever edge of the shape has more vertices packed into
 * it). Falls back to a vertex average for a degenerate (near-zero-area)
 * ring, where the area-weighted formula divides by ~0. */
function ringCentroid(ring: [number, number][]): { x: number; y: number } {
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-9) {
    let sumX = 0, sumY = 0;
    for (const [x, y] of ring) {
      sumX += x;
      sumY += y;
    }
    return { x: sumX / ring.length, y: sumY / ring.length };
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/** The widest horizontal chord through `ring` at `targetY`, as an [x1, x2]
 * span — or the span containing `preferredX` if there is one. Used to find
 * an x inside the ring even when the ring's own centroid isn't (e.g. a thin
 * crescent shape, where the centroid falls in the crescent's notch but a
 * chord through the shape's bulk still lands on solid ground). Returns null
 * only if the ring doesn't cross `targetY` at all (degenerate ring). */
function widestSpanAtY(ring: [number, number][], targetY: number, preferredX: number): [number, number] | null {
  const xs: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    if ((y1 <= targetY && y2 > targetY) || (y2 <= targetY && y1 > targetY)) {
      const t = (targetY - y1) / (y2 - y1);
      xs.push(x1 + t * (x2 - x1));
    }
  }
  xs.sort((a, b) => a - b);

  let widest: [number, number] | null = null;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const span: [number, number] = [xs[i], xs[i + 1]];
    if (preferredX >= span[0] && preferredX <= span[1]) return span;
    if (!widest || span[1] - span[0] > widest[1] - widest[0]) widest = span;
  }
  return widest;
}

/** The outer ring to place a marker on: a country's only ring for a
 * `Polygon`, or the largest-area part of a `MultiPolygon` (so an archipelago
 * like Japan gets centered on its main island instead of averaged across all
 * of them, which lands in the sea between islands). */
function selectOuterRing(geometry: GeoJSON.Geometry): [number, number][] {
  if (geometry.type === "Polygon") return geometry.coordinates[0] as [number, number][];
  if (geometry.type === "MultiPolygon") {
    let largest: [number, number][] = geometry.coordinates[0]?.[0] as [number, number][];
    let largestArea = -Infinity;
    for (const polygon of geometry.coordinates) {
      const outer = polygon[0] as [number, number][];
      const area = Math.abs(ringArea(unwrapRingLongitudes(outer)));
      if (area > largestArea) {
        largestArea = area;
        largest = outer;
      }
    }
    return largest;
  }
  return [];
}

/** A point guaranteed to lie inside a country's largest polygon part (unlike
 * a plain bounding-box or vertex-average centroid, which can land outside
 * the shape entirely for a non-convex country like Croatia's thin Adriatic
 * crescent, or an archipelago like Japan). Takes the area-weighted centroid
 * of the ring for latitude, then the widest horizontal chord through the
 * ring at that latitude for longitude. */
export function computeCentroid(geometry: GeoJSON.Geometry): CountryCentroid {
  const rawRing = selectOuterRing(geometry);
  if (rawRing.length === 0) return { lat: 0, lng: 0 };

  const ring = unwrapRingLongitudes(rawRing);
  const { x: centroidLng, y: centroidLat } = ringCentroid(ring);
  const span = widestSpanAtY(ring, centroidLat, centroidLng);
  const finalLng = span ? (span[0] + span[1]) / 2 : centroidLng;

  const centroid: CountryCentroid = { lat: centroidLat, lng: rewrapLng(finalLng) };
  return centroid;
}

export function buildCountryCentroids(geojson: GeoJSON.FeatureCollection): Map<string, CountryCentroid> {
  const centroids = new Map<string, CountryCentroid>();
  for (const feature of geojson.features) {
    const name = feature.properties?.name;
    if (typeof name === "string" && feature.geometry) {
      centroids.set(name, computeCentroid(feature.geometry));
    }
  }
  return centroids;
}

function ringToPath(ring: [number, number][], project: (lat: number, lng: number) => Point2D): string {
  const commands: string[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [lng, lat] = ring[i];
    const { x, y } = project(lat, lng);
    commands.push(`${i === 0 ? "M" : "L"}${x},${y}`);
  }
  const path = `${commands.join(" ")} Z`;
  return path;
}

function buildPathFromRings(
  rings: [number, number][][],
  project: (lat: number, lng: number) => Point2D,
): string {
  const ringPaths: string[] = [];
  for (const ring of rings) ringPaths.push(ringToPath(ring, project));
  const path = ringPaths.join(" ");
  return path;
}

function buildPathFromPolygons(
  polygons: [number, number][][][],
  project: (lat: number, lng: number) => Point2D,
): string {
  const polygonPaths: string[] = [];
  for (const polygon of polygons) polygonPaths.push(buildPathFromRings(polygon, project));
  const path = polygonPaths.join(" ");
  return path;
}

/** Converts a country's GeoJSON geometry into an SVG path "d" string via the
 * given projection. Rings are combined with fill-rule evenodd (set in CSS)
 * so holes (enclaves) render correctly without special-casing them here. */
export function geometryToSvgPath(
  geometry: GeoJSON.Geometry,
  project: (lat: number, lng: number) => Point2D,
): string {
  if (geometry.type === "Polygon") {
    const path = buildPathFromRings(geometry.coordinates as [number, number][][], project);
    return path;
  }
  if (geometry.type === "MultiPolygon") {
    const path = buildPathFromPolygons(geometry.coordinates as [number, number][][][], project);
    return path;
  }
  const emptyPath = "";
  return emptyPath;
}
