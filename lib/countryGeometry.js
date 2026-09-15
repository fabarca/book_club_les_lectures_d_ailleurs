function collectPointsInto(coords, points) {
    if (typeof coords[0] === "number") {
        points.push(coords);
        return;
    }
    for (const c of coords)
        collectPointsInto(c, points);
}
function collectPoints(geometry) {
    const points = [];
    collectPointsInto(geometry.coordinates, points);
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
export function computeCentroid(geometry) {
    const points = collectPoints(geometry);
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const [lng, lat] of points) {
        if (lat < minLat)
            minLat = lat;
        if (lat > maxLat)
            maxLat = lat;
        if (lng < minLng)
            minLng = lng;
        if (lng > maxLng)
            maxLng = lng;
    }
    if (maxLng - minLng > 180) {
        minLng = Infinity;
        maxLng = -Infinity;
        for (const [lng] of points) {
            const shifted = lng < 0 ? lng + 360 : lng;
            if (shifted < minLng)
                minLng = shifted;
            if (shifted > maxLng)
                maxLng = shifted;
        }
    }
    let centerLng = (minLng + maxLng) / 2;
    if (centerLng > 180)
        centerLng -= 360;
    const centroid = { lat: (minLat + maxLat) / 2, lng: centerLng };
    return centroid;
}
export function buildCountryCentroids(geojson) {
    const centroids = new Map();
    for (const feature of geojson.features) {
        const name = feature.properties?.name;
        if (typeof name === "string" && feature.geometry) {
            centroids.set(name, computeCentroid(feature.geometry));
        }
    }
    return centroids;
}
function ringToPath(ring, project) {
    const commands = [];
    for (let i = 0; i < ring.length; i++) {
        const [lng, lat] = ring[i];
        const { x, y } = project(lat, lng);
        commands.push(`${i === 0 ? "M" : "L"}${x},${y}`);
    }
    const path = `${commands.join(" ")} Z`;
    return path;
}
function buildPathFromRings(rings, project) {
    const ringPaths = [];
    for (const ring of rings)
        ringPaths.push(ringToPath(ring, project));
    const path = ringPaths.join(" ");
    return path;
}
function buildPathFromPolygons(polygons, project) {
    const polygonPaths = [];
    for (const polygon of polygons)
        polygonPaths.push(buildPathFromRings(polygon, project));
    const path = polygonPaths.join(" ");
    return path;
}
/** Converts a country's GeoJSON geometry into an SVG path "d" string via the
 * given projection. Rings are combined with fill-rule evenodd (set in CSS)
 * so holes (enclaves) render correctly without special-casing them here. */
export function geometryToSvgPath(geometry, project) {
    if (geometry.type === "Polygon") {
        const path = buildPathFromRings(geometry.coordinates, project);
        return path;
    }
    if (geometry.type === "MultiPolygon") {
        const path = buildPathFromPolygons(geometry.coordinates, project);
        return path;
    }
    const emptyPath = "";
    return emptyPath;
}
