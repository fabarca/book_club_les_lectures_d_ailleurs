import type { Book } from "./types.js";
import type { Point2D } from "./geoProjection.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_ZOOM_SCALE = 12;

// Markers are drawn 4x as large on narrow (mobile) viewports, where
// fingers are far less precise than a mouse cursor. Matches the layout
// breakpoint used for the mobile book panel in styles.css.
const MOBILE_MARKER_SCALE = 4;
export const MOBILE_BREAKPOINT_QUERY = "(max-width: 600px)";

// Box-pin geometry, in local units centered on the anchor tip at (0, 0).
const PIN_SCALE = 0.6 * 0.85;
const PIN_BOX_HALF_WIDTH = 7 * PIN_SCALE;
const PIN_BOX_HEIGHT = 12 * PIN_SCALE;
const PIN_TAIL_HALF_WIDTH = 3 * PIN_SCALE;
const PIN_TAIL_HEIGHT = 5 * PIN_SCALE;
const PIN_CORNER_RADIUS = 3 * PIN_SCALE;
const PIN_BOX_TOP_Y = -(PIN_TAIL_HEIGHT + PIN_BOX_HEIGHT);
const PIN_BOX_BOTTOM_Y = -PIN_TAIL_HEIGHT;
const PIN_BOX_CENTER_Y = -(PIN_TAIL_HEIGHT + PIN_BOX_HEIGHT / 2);
const PIN_FONT_SIZE = 9 * PIN_SCALE;

// Tooltip geometry, in the same local-unit space as the pin, anchored above it.
const TOOLTIP_FONT_SIZE = 5;
const TOOLTIP_GAP = 3;
const TOOLTIP_PADDING_X = 2;
const TOOLTIP_PADDING_Y = 1.3;
const TOOLTIP_Y = PIN_BOX_TOP_Y - TOOLTIP_GAP;

export interface CountryFeatureInput {
  name: string;
  path: string;
}

export interface MarkerInput {
  x: number;
  y: number;
  /** Country name as used in the GeoJSON dataset, for matching this marker
   * to its country's <path> (highlighted on hover) and tooltip label. */
  geoName: string;
  books: Book[];
}

interface TooltipState {
  group: SVGGElement;
  scaleGroup: SVGGElement;
  mobileGroup: SVGGElement;
  background: SVGRectElement;
  text: SVGTextElement;
}

/** All the mutable state that used to live in createSvgMap's closure. Every
 * operation on the map (rendering, background-click registration) takes
 * this state object explicitly instead of capturing it. */
export interface SvgMapState {
  svg: SVGSVGElement;
  countriesGroup: SVGGElement;
  markersGroup: SVGGElement;
  countryPathsByName: Map<string, SVGPathElement>;
  /** Where each country's marker sits, so hovering the country's shape (away
   * from the pin itself) can show the same tooltip anchored at the same spot. */
  markerPositionByGeoName: Map<string, { x: number; y: number; label: string }>;
  tooltip: TooltipState;
  markerScaleGroups: SVGGElement[];
  mobileScaleGroups: SVGGElement[];
  markerGroups: SVGGElement[];
  mobileQuery: MediaQueryList;
  backgroundClickCallback: (() => void) | null;
  countryClickCallback: ((geoName: string) => void) | null;
  selectedCountryPaths: SVGPathElement[];
  hoveredCountryPath: SVGPathElement | null;
  currentZoomRatio: number;
}

interface MarkerRenderContext {
  state: SvgMapState;
  group: SVGGElement;
  marker: MarkerInput;
  onMarkerClick: (geoName: string) => void;
}

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** State for the pan/zoom gesture handling, private to setupPanAndZoom's
 * handlers — nothing outside this file's pan/zoom functions reads it. */
interface PanZoomState {
  svg: SVGSVGElement;
  viewBox: ViewBox;
  initialViewBox: ViewBox;
  minWidth: number;
  maxWidth: number;
  isDragging: boolean;
  hasDragged: boolean;
  lastPointer: Point2D;
  // Pointers currently touching the map, keyed by pointerId. Two active
  // pointers means a pinch gesture; drag-to-pan only applies with one.
  activePointers: Map<number, Point2D>;
  lastPinchDistance: number | null;
  lastPinchMidpoint: Point2D | null;
  onZoomChange: (zoomRatio: number) => void;
  onBackgroundClick: () => void;
  onCountryClick: (geoName: string) => void;
}

interface PinchGeometry {
  distance: number;
  midpoint: Point2D;
}

function parseViewBox(value: string): ViewBox {
  const parts = value.trim().split(/\s+/);
  const numbers: number[] = [];
  for (const part of parts) numbers.push(Number(part));
  const [x, y, width, height] = numbers;
  const box: ViewBox = { x, y, width, height };
  return box;
}

function clamp(value: number, min: number, max: number): number {
  const clamped = Math.min(Math.max(value, min), max);
  return clamped;
}

function currentMobileScale(state: SvgMapState): number {
  const scale = state.mobileQuery.matches ? MOBILE_MARKER_SCALE : 1;
  return scale;
}

function applyMobileScale(state: SvgMapState): void {
  const scale = currentMobileScale(state);
  for (const group of state.mobileScaleGroups) {
    group.setAttribute("transform", `scale(${scale})`);
  }
}

function handleMobileQueryChange(state: SvgMapState): void {
  applyMobileScale(state);
}

function handleMapZoomChange(state: SvgMapState, zoomRatio: number): void {
  state.currentZoomRatio = zoomRatio;
  for (const group of state.markerScaleGroups) {
    group.setAttribute("transform", `scale(${zoomRatio})`);
  }
}

function handleMapBackgroundClick(state: SvgMapState): void {
  const callback = state.backgroundClickCallback;
  if (callback) callback();
}

function handleMapCountryClick(state: SvgMapState, geoName: string): void {
  state.countryClickCallback?.(geoName);
}

/** Creates the <svg id="map"> element and its state: country shapes and one
 * box-pin marker per country, plus wheel-zoom / drag-to-pan wiring that
 * mutates the viewBox. Pure DOM/SVG concerns only — it never fetches data or
 * knows about the detail panel. */
export function createSvgMapState(container: HTMLElement, viewBox: string): SvgMapState {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.setAttribute("id", "map");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  container.appendChild(svg);

  const countriesGroup = document.createElementNS(SVG_NS, "g");
  svg.appendChild(countriesGroup);

  const markersGroup = document.createElementNS(SVG_NS, "g") as SVGGElement;
  svg.appendChild(markersGroup);

  const countryPathsByName = new Map<string, SVGPathElement>();
  const markerPositionByGeoName = new Map<string, { x: number; y: number; label: string }>();
  const tooltip = createTooltipState(svg);

  // Each marker's (and the tooltip's) visual content lives in its own
  // "scale group" so its apparent screen size can be kept constant
  // independently of the pan/zoom transform applied to the map (see
  // handleMapZoomChange's zoomRatio).
  const markerScaleGroups: SVGGElement[] = [tooltip.scaleGroup];

  // Pin and tooltip groups get an extra scale (on top of the zoom-cancelling
  // one above) on mobile viewports, so the country-name label grows in step
  // with the enlarged pin instead of staying pinned to its base size. Kept
  // in sync with the media query rather than read once, so rotating a phone
  // or resizing a browser window updates it live.
  const mobileScaleGroups: SVGGElement[] = [tooltip.mobileGroup];
  const markerGroups: SVGGElement[] = [];
  const mobileQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);

  const state: SvgMapState = {
    svg,
    countriesGroup,
    markersGroup,
    countryPathsByName,
    markerPositionByGeoName,
    tooltip,
    markerScaleGroups,
    mobileScaleGroups,
    markerGroups,
    mobileQuery,
    backgroundClickCallback: null,
    countryClickCallback: null,
    selectedCountryPaths: [],
    hoveredCountryPath: null,
    currentZoomRatio: 1,
  };

  // Markers set their own initial mobile scale when rendered (they don't
  // exist yet at this point), but the tooltip group above does exist now
  // and needs its initial scale applied explicitly.
  applyMobileScale(state);

  mobileQuery.addEventListener("change", handleMobileQueryChange.bind(null, state));

  setupPanAndZoom(
    svg,
    parseViewBox(viewBox),
    handleMapZoomChange.bind(null, state),
    handleMapBackgroundClick.bind(null, state),
    handleMapCountryClick.bind(null, state),
  );

  return state;
}

function handleCountryPointerEnter(state: SvgMapState, geoName: string): void {
  setHoveredCountry(state, geoName);
}

function handleCountryPointerLeave(state: SvgMapState): void {
  setHoveredCountry(state, null);
}

function renderCountry(state: SvgMapState, country: CountryFeatureInput, countriesWithBooks: Set<string>): void {
  const path = document.createElementNS(SVG_NS, "path") as SVGPathElement;
  path.setAttribute("d", country.path);
  const hasBooks = countriesWithBooks.has(country.name);
  path.setAttribute("class", hasBooks ? "country has-books" : "country");
  path.setAttribute("data-geo-name", country.name);
  if (hasBooks) {
    // Markers sit in a separate DOM group on top of the country shapes, so
    // hovering the pin itself doesn't naturally propagate to the country
    // path underneath (that's handled manually in handleMarkerPointerEnter/
    // Leave) — these listeners cover the rest of the country's area, showing
    // the same tooltip anchored at the marker's position.
    path.addEventListener("pointerenter", handleCountryPointerEnter.bind(null, state, country.name));
    path.addEventListener("pointerleave", handleCountryPointerLeave.bind(null, state));
  }
  state.countriesGroup.appendChild(path);
  state.countryPathsByName.set(country.name, path);
}

export function renderCountries(
  state: SvgMapState,
  countries: CountryFeatureInput[],
  countriesWithBooks: Set<string>,
): void {
  for (const country of countries) renderCountry(state, country, countriesWithBooks);
}

function handleMarkerClick(context: MarkerRenderContext, event: Event): void {
  event.stopPropagation();
  context.onMarkerClick(context.marker.geoName);
}

function handleMarkerPointerEnter(context: MarkerRenderContext): void {
  // SVG has no z-index: paint order follows document order, so bringing a
  // marker in front on hover means moving it to be the last sibling. Moving
  // a node the pointer is already over makes the browser re-fire
  // "pointerenter" on it (it's briefly detached and reattached), so skip the
  // move once it's already last — otherwise that re-fire retriggers this
  // handler forever and starves clicks.
  if (context.group.nextElementSibling !== null) context.state.markersGroup.appendChild(context.group);
  setHoveredCountry(context.state, context.marker.geoName);
}

function handleMarkerPointerLeave(context: MarkerRenderContext): void {
  setHoveredCountry(context.state, null);
}

function renderMarker(state: SvgMapState, marker: MarkerInput, onMarkerClick: (geoName: string) => void): void {
  const group = document.createElementNS(SVG_NS, "g") as SVGGElement;
  group.setAttribute("class", "marker");
  group.setAttribute("transform", `translate(${marker.x},${marker.y})`);
  group.setAttribute("data-geo-name", marker.geoName);

  const scaleGroup = document.createElementNS(SVG_NS, "g") as SVGGElement;
  scaleGroup.setAttribute("transform", `scale(${state.currentZoomRatio})`);
  const pinGroup = document.createElementNS(SVG_NS, "g");
  pinGroup.setAttribute("transform", `scale(${currentMobileScale(state)})`);
  pinGroup.appendChild(createPinShape());
  pinGroup.appendChild(createPinLabel(marker.books.length));
  scaleGroup.appendChild(pinGroup);
  group.appendChild(scaleGroup);
  state.markerScaleGroups.push(scaleGroup);
  state.mobileScaleGroups.push(pinGroup);
  state.markerGroups.push(group);

  const countryLabel = marker.books[0]?.country ?? marker.geoName;
  state.markerPositionByGeoName.set(marker.geoName, { x: marker.x, y: marker.y, label: countryLabel });
  const context: MarkerRenderContext = { state, group, marker, onMarkerClick };

  group.addEventListener("click", handleMarkerClick.bind(null, context));
  group.addEventListener("pointerenter", handleMarkerPointerEnter.bind(null, context));
  group.addEventListener("pointerleave", handleMarkerPointerLeave.bind(null, context));
  state.markersGroup.appendChild(group);
}

export function renderMarkers(
  state: SvgMapState,
  markers: MarkerInput[],
  onMarkerClick: (geoName: string) => void,
): void {
  for (const marker of markers) renderMarker(state, marker, onMarkerClick);
}

/** Shows or hides every marker at once, independent of the per-marker
 * mobile zoom-gating (`updateMarkerVisibility`) — this hides the whole
 * markers group regardless of that per-marker state. */
export function setMarkersVisible(state: SvgMapState, visible: boolean): void {
  state.markersGroup.classList.toggle("markers-group-hidden", !visible);
}

/** Registers a callback fired when the user clicks the map somewhere that
 * isn't a marker (a country without books, or open background/ocean). */
export function registerBackgroundClickHandler(state: SvgMapState, callback: () => void): void {
  state.backgroundClickCallback = callback;
}

/** Registers a callback fired when the user clicks directly on a country's
 * shape that has books (anywhere in its landmass, not just its marker pin). */
export function registerCountryClickHandler(state: SvgMapState, callback: (geoName: string) => void): void {
  state.countryClickCallback = callback;
}

/** Applies the persistent "selected" highlight to one or more countries by
 * geoName, clearing it from whichever countries previously had it. Pass null
 * to clear the highlight entirely. */
export function setSelectedCountry(state: SvgMapState, geoName: string | string[] | null): void {
  for (const path of state.selectedCountryPaths) path.classList.remove("country-selected");

  const geoNames = geoName === null ? [] : Array.isArray(geoName) ? geoName : [geoName];
  const paths: SVGPathElement[] = [];
  for (const name of geoNames) {
    const path = state.countryPathsByName.get(name);
    if (path) paths.push(path);
  }
  for (const path of paths) path.classList.add("country-selected");
  state.selectedCountryPaths = paths;
}

/** Applies the transient "hovered" highlight and tooltip to a country by
 * geoName, the same as hovering it (or its marker) directly — used both by
 * the map's own pointer handlers and by external callers like the book list
 * hovering a country's books. Pass null to clear the hover entirely. */
export function setHoveredCountry(state: SvgMapState, geoName: string | null): void {
  state.hoveredCountryPath?.classList.remove("country-hovered");
  const path = geoName ? state.countryPathsByName.get(geoName) : undefined;
  path?.classList.add("country-hovered");
  state.hoveredCountryPath = path ?? null;

  const position = geoName ? state.markerPositionByGeoName.get(geoName) : undefined;
  if (position) showTooltip(state.tooltip, position.x, position.y, position.label);
  else hideTooltip(state.tooltip);
}

function createTooltipState(svg: SVGSVGElement): TooltipState {
  const group = document.createElementNS(SVG_NS, "g") as SVGGElement;
  group.setAttribute("class", "marker-tooltip");
  group.style.visibility = "hidden";

  const scaleGroup = document.createElementNS(SVG_NS, "g") as SVGGElement;
  const mobileGroup = document.createElementNS(SVG_NS, "g") as SVGGElement;
  const background = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  background.setAttribute("class", "marker-tooltip-bg");
  background.setAttribute("rx", String(TOOLTIP_PADDING_Y));
  const text = document.createElementNS(SVG_NS, "text") as SVGTextElement;
  text.setAttribute("class", "marker-tooltip-text");
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("y", String(TOOLTIP_Y));
  text.setAttribute("font-size", String(TOOLTIP_FONT_SIZE));

  mobileGroup.appendChild(background);
  mobileGroup.appendChild(text);
  scaleGroup.appendChild(mobileGroup);
  group.appendChild(scaleGroup);
  svg.appendChild(group); // appended last: always painted above markers

  const tooltip: TooltipState = { group, scaleGroup, mobileGroup, background, text };
  return tooltip;
}

function showTooltip(tooltip: TooltipState, x: number, y: number, label: string): void {
  tooltip.text.textContent = label;
  const bbox = tooltip.text.getBBox();
  tooltip.background.setAttribute("x", String(bbox.x - TOOLTIP_PADDING_X));
  tooltip.background.setAttribute("y", String(bbox.y - TOOLTIP_PADDING_Y));
  tooltip.background.setAttribute("width", String(bbox.width + TOOLTIP_PADDING_X * 2));
  tooltip.background.setAttribute("height", String(bbox.height + TOOLTIP_PADDING_Y * 2));
  tooltip.group.setAttribute("transform", `translate(${x},${y})`);
  tooltip.group.style.visibility = "visible";
}

function hideTooltip(tooltip: TooltipState): void {
  tooltip.group.style.visibility = "hidden";
}

function createPinShape(): SVGGElement {
  const shape = document.createElementNS(SVG_NS, "g");

  const tail = document.createElementNS(SVG_NS, "polygon");
  tail.setAttribute(
    "points",
    `${-PIN_TAIL_HALF_WIDTH},${PIN_BOX_BOTTOM_Y} ${PIN_TAIL_HALF_WIDTH},${PIN_BOX_BOTTOM_Y} 0,0`,
  );
  tail.setAttribute("class", "marker-pin-tail");
  shape.appendChild(tail);

  const box = document.createElementNS(SVG_NS, "rect");
  box.setAttribute("x", String(-PIN_BOX_HALF_WIDTH));
  box.setAttribute("y", String(PIN_BOX_TOP_Y));
  box.setAttribute("width", String(PIN_BOX_HALF_WIDTH * 2));
  box.setAttribute("height", String(PIN_BOX_HEIGHT));
  box.setAttribute("rx", String(PIN_CORNER_RADIUS));
  box.setAttribute("class", "marker-pin-box");
  shape.appendChild(box);

  return shape;
}

function createPinLabel(count: number): SVGTextElement {
  const label = document.createElementNS(SVG_NS, "text") as SVGTextElement;
  label.setAttribute("x", "0");
  label.setAttribute("y", String(PIN_BOX_CENTER_Y));
  label.setAttribute("font-size", String(PIN_FONT_SIZE));
  label.setAttribute("class", "marker-count");
  label.textContent = String(count);
  return label;
}

function setViewBox(svg: SVGSVGElement, vb: ViewBox): void {
  svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
}

// With preserveAspectRatio="xMidYMid meet" the svg scales uniformly and
// letterboxes whichever axis doesn't match the container's aspect ratio, so
// both axes share a single px-per-unit scale (not rect.width/height
// independently) and the letterboxed axis has a centering offset to subtract
// before converting client coordinates into svg-space.
function svgUnitsPerPixel(state: PanZoomState, rect: DOMRect): number {
  const unitsPerPixel = Math.max(state.viewBox.width / rect.width, state.viewBox.height / rect.height);
  return unitsPerPixel;
}

function clientToSvgPoint(state: PanZoomState, clientX: number, clientY: number): Point2D {
  const rect = state.svg.getBoundingClientRect();
  const unitsPerPixel = svgUnitsPerPixel(state, rect);
  const renderedWidth = state.viewBox.width / unitsPerPixel;
  const renderedHeight = state.viewBox.height / unitsPerPixel;
  const offsetX = (rect.width - renderedWidth) / 2;
  const offsetY = (rect.height - renderedHeight) / 2;
  const point: Point2D = {
    x: state.viewBox.x + (clientX - rect.left - offsetX) * unitsPerPixel,
    y: state.viewBox.y + (clientY - rect.top - offsetY) * unitsPerPixel,
  };
  return point;
}

// Zooms so that `focal` (an svg-space point) stays under the same spot on
// screen, clamping the resulting viewBox width to the configured range.
function applyZoom(state: PanZoomState, newWidth: number, focal: Point2D): void {
  const clampedWidth = clamp(newWidth, state.minWidth, state.maxWidth);
  const ratio = clampedWidth / state.viewBox.width;
  state.viewBox = {
    x: focal.x - (focal.x - state.viewBox.x) * ratio,
    y: focal.y - (focal.y - state.viewBox.y) * ratio,
    width: clampedWidth,
    height: state.viewBox.height * ratio,
  };
  setViewBox(state.svg, state.viewBox);
  // Markers are drawn in map-space units, which shrink on screen as we zoom
  // in (viewBox.width shrinks while the svg's own pixel size stays fixed).
  // Scaling their local geometry down by the same ratio the viewBox shrank
  // by cancels that out, keeping their on-screen size constant.
  const zoomRatio = state.viewBox.width / state.initialViewBox.width;
  state.onZoomChange(zoomRatio);
}

function handleWheel(state: PanZoomState, event: WheelEvent): void {
  event.preventDefault();
  const zoomFactor = event.deltaY < 0 ? 0.9 : 1 / 0.9;
  const focal = clientToSvgPoint(state, event.clientX, event.clientY);
  applyZoom(state, state.viewBox.width * zoomFactor, focal);
}

function handlePointerDown(state: PanZoomState, event: PointerEvent): void {
  state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (state.activePointers.size >= 2) {
    // A second finger just landed: stop any single-finger pan and start a
    // pinch instead. Distance/midpoint are captured fresh on the next move
    // so the gesture doesn't jump.
    state.isDragging = false;
    state.lastPinchDistance = null;
    state.lastPinchMidpoint = null;
    return;
  }

  // Capturing the pointer here would retarget the eventual "click" (used by
  // markers) onto the svg itself, so markers would never see it.
  if (event.target instanceof Element && event.target.closest(".marker")) return;

  state.isDragging = true;
  state.hasDragged = false;
  state.lastPointer = { x: event.clientX, y: event.clientY };
  state.svg.classList.add("dragging");
  state.svg.setPointerCapture(event.pointerId);
}

function computePinchGeometry(pointers: Point2D[]): PinchGeometry {
  const [a, b] = pointers;
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint: Point2D = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const geometry: PinchGeometry = { distance, midpoint };
  return geometry;
}

function panByPinchMidpointDelta(state: PanZoomState, midpoint: Point2D): void {
  const lastMidpoint = state.lastPinchMidpoint;
  if (!lastMidpoint) return;
  const rect = state.svg.getBoundingClientRect();
  const unitsPerPixel = svgUnitsPerPixel(state, rect);
  const dx = (midpoint.x - lastMidpoint.x) * unitsPerPixel;
  const dy = (midpoint.y - lastMidpoint.y) * unitsPerPixel;
  state.viewBox = { ...state.viewBox, x: state.viewBox.x - dx, y: state.viewBox.y - dy };
}

function handlePinchMove(state: PanZoomState): void {
  state.hasDragged = true;
  const pointers = Array.from(state.activePointers.values());
  const { distance, midpoint } = computePinchGeometry(pointers);

  if (state.lastPinchDistance !== null && state.lastPinchMidpoint !== null) {
    panByPinchMidpointDelta(state, midpoint);
    const zoomFactor = distance > 0 ? state.lastPinchDistance / distance : 1;
    const focal = clientToSvgPoint(state, midpoint.x, midpoint.y);
    applyZoom(state, state.viewBox.width * zoomFactor, focal);
  }

  state.lastPinchDistance = distance;
  state.lastPinchMidpoint = midpoint;
}

function handleDragMove(state: PanZoomState, event: PointerEvent): void {
  if (!state.isDragging) return;
  state.hasDragged = true;
  const rect = state.svg.getBoundingClientRect();
  const unitsPerPixel = svgUnitsPerPixel(state, rect);
  const dx = (event.clientX - state.lastPointer.x) * unitsPerPixel;
  const dy = (event.clientY - state.lastPointer.y) * unitsPerPixel;
  state.viewBox = { ...state.viewBox, x: state.viewBox.x - dx, y: state.viewBox.y - dy };
  state.lastPointer = { x: event.clientX, y: event.clientY };
  setViewBox(state.svg, state.viewBox);
}

function handlePointerMove(state: PanZoomState, event: PointerEvent): void {
  if (state.activePointers.has(event.pointerId)) {
    state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  if (state.activePointers.size >= 2) {
    handlePinchMove(state);
    return;
  }

  handleDragMove(state, event);
}

function endDrag(state: PanZoomState, event: PointerEvent): void {
  state.activePointers.delete(event.pointerId);
  if (state.svg.hasPointerCapture(event.pointerId)) state.svg.releasePointerCapture(event.pointerId);

  if (state.activePointers.size >= 2) {
    // Still pinching with the remaining pointers: resync on the next move.
    state.lastPinchDistance = null;
    state.lastPinchMidpoint = null;
    return;
  }

  if (state.activePointers.size === 1) {
    // One finger left after a pinch: resume single-finger panning from its
    // current position instead of jumping to it.
    const [remaining] = state.activePointers.values();
    state.lastPointer = remaining;
    state.isDragging = true;
    state.lastPinchDistance = null;
    state.lastPinchMidpoint = null;
    return;
  }

  state.lastPinchDistance = null;
  state.lastPinchMidpoint = null;
  if (!state.isDragging) return;
  state.isDragging = false;
  state.svg.classList.remove("dragging");
}

function handleBackgroundClickOnSvg(state: PanZoomState, event: MouseEvent): void {
  // Marker clicks call stopPropagation, so only clicks on empty background,
  // a country without books, or a country with books (off its marker pin)
  // reach here. A pan-drag gesture also ends in a "click" on svg
  // (setPointerCapture retargets it there), which hasDragged filters out.
  if (state.hasDragged) return;
  // setPointerCapture retargets the click's `target` to the svg itself, so
  // event.target can't tell us what was actually clicked. elementFromPoint
  // uses viewport coordinates instead, which capture doesn't affect.
  const countryPath = document.elementFromPoint(event.clientX, event.clientY)?.closest(".country.has-books");
  const geoName = countryPath?.getAttribute("data-geo-name");
  if (geoName) {
    state.onCountryClick(geoName);
    return;
  }
  state.onBackgroundClick();
}

function createPanZoomState(
  svg: SVGSVGElement,
  initialViewBox: ViewBox,
  onZoomChange: (zoomRatio: number) => void,
  onBackgroundClick: () => void,
  onCountryClick: (geoName: string) => void,
): PanZoomState {
  const state: PanZoomState = {
    svg,
    viewBox: { ...initialViewBox },
    initialViewBox,
    minWidth: initialViewBox.width / MAX_ZOOM_SCALE,
    maxWidth: initialViewBox.width,
    isDragging: false,
    hasDragged: false,
    lastPointer: { x: 0, y: 0 },
    activePointers: new Map<number, Point2D>(),
    lastPinchDistance: null,
    lastPinchMidpoint: null,
    onZoomChange,
    onBackgroundClick,
    onCountryClick,
  };
  return state;
}

function setupPanAndZoom(
  svg: SVGSVGElement,
  initialViewBox: ViewBox,
  onZoomChange: (zoomRatio: number) => void,
  onBackgroundClick: () => void,
  onCountryClick: (geoName: string) => void,
): void {
  const state = createPanZoomState(svg, initialViewBox, onZoomChange, onBackgroundClick, onCountryClick);

  svg.addEventListener("wheel", handleWheel.bind(null, state), { passive: false });
  svg.addEventListener("pointerdown", handlePointerDown.bind(null, state));
  svg.addEventListener("pointermove", handlePointerMove.bind(null, state));
  svg.addEventListener("pointerup", endDrag.bind(null, state));
  svg.addEventListener("pointercancel", endDrag.bind(null, state));
  svg.addEventListener("pointerleave", endDrag.bind(null, state));
  svg.addEventListener("click", handleBackgroundClickOnSvg.bind(null, state));
}
