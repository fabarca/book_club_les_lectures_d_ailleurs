/** Equirectangular projection: maps geographic coordinates to a fixed
 * 360x180 SVG coordinate space (one unit per degree), origin at the
 * antimeridian/south pole corner, y growing downward like SVG expects. */

export interface Point2D {
  x: number;
  y: number;
}

const MAP_WIDTH = 360;
const MAP_HEIGHT = 180;

export const MAP_VIEWBOX = `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`;

export function project(lat: number, lng: number): Point2D {
  const point: Point2D = {
    x: lng + MAP_WIDTH / 2,
    y: MAP_HEIGHT / 2 - lat,
  };
  return point;
}
