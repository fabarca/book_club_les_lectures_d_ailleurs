import type { Point2D } from "./geoProjection.js";

export interface CountryCentroid {
  lat: number;
  lng: number;
}

function collectPoints(geometry: GeoJSON.Geometry): [number, number][] {
  const points: [number, number][] = [];

  function visit(coords: any): void {
    if (typeof coords[0] === "number") {
      points.push(coords as [number, number]);
    } else {
      for (const c of coords) visit(c);
    }
  }

  visit((geometry as any).coordinates);
  return points;
}

/** Bounding-box center of a country's geometry. Simple and good enough for
 * marker placement. Countries that cross the antimeridian (e.g. Russia,
 * Fiji) have some of their longitudes recorded near +180 and others near
 * -180; a naive min/max would treat that as spanning almost the whole
 * globe and land the centroid nowhere near the actual country, so when that
 * >180° spread is detected, longitudes are shifted into 0..360 space (where
 * the two sides sit next to each other) before averaging, then unwrapped
 * back to -180..180. */
export function computeCentroid(geometry: GeoJSON.Geometry): CountryCentroid {
  const points = collectPoints(geometry);

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lng, lat] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  if (maxLng - minLng > 180) {
    minLng = Infinity;
    maxLng = -Infinity;
    for (const [lng] of points) {
      const shifted = lng < 0 ? lng + 360 : lng;
      if (shifted < minLng) minLng = shifted;
      if (shifted > maxLng) maxLng = shifted;
    }
  }

  let centerLng = (minLng + maxLng) / 2;
  if (centerLng > 180) centerLng -= 360;

  return { lat: (minLat + maxLat) / 2, lng: centerLng };
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
  const commands = ring.map(([lng, lat], i) => {
    const { x, y } = project(lat, lng);
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  });
  return `${commands.join(" ")} Z`;
}

/** Converts a country's GeoJSON geometry into an SVG path "d" string via the
 * given projection. Rings are combined with fill-rule evenodd (set in CSS)
 * so holes (enclaves) render correctly without special-casing them here. */
export function geometryToSvgPath(
  geometry: GeoJSON.Geometry,
  project: (lat: number, lng: number) => Point2D,
): string {
  if (geometry.type === "Polygon") {
    return (geometry.coordinates as [number, number][][])
      .map((ring) => ringToPath(ring, project))
      .join(" ");
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as [number, number][][][])
      .map((polygon) => polygon.map((ring) => ringToPath(ring, project)).join(" "))
      .join(" ");
  }
  return "";
}
