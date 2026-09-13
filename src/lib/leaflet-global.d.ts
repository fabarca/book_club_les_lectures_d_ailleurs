import type * as leaflet from "leaflet";

// main.ts loads Leaflet from a CDN <script> tag (see index.html), not as an
// ES module import, so it only exists as a global at runtime. This declares
// its type without adding a runtime import (type-only, erased at compile time).
declare global {
  const L: typeof leaflet;
}
