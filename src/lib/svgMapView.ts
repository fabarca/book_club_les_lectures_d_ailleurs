import type { Book } from "./types.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_ZOOM_SCALE = 8;

// Markers are drawn 4x as large on narrow (mobile) viewports, where
// fingers are far less precise than a mouse cursor. Matches the layout
// breakpoint used for the mobile book panel in styles.css.
const MOBILE_MARKER_SCALE = 4;
const MOBILE_BREAKPOINT_QUERY = "(max-width: 600px)";

// On mobile, markers only appear once the user has zoomed in at least this
// much — at the fully zoomed-out view there isn't enough room between
// countries to place them accurately by touch, so they'd just add clutter.
// Zooming back out below this level hides them again.
const MOBILE_MARKER_MIN_ZOOM = 2;

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

export interface SvgMapView {
  renderCountries(countries: CountryFeatureInput[], countriesWithBooks: Set<string>): void;
  renderMarkers(markers: MarkerInput[], onMarkerClick: (geoName: string) => void): void;
  /** Registers a callback fired when the user clicks the map somewhere that
   * isn't a marker (a country without books, or open background/ocean). */
  onBackgroundClick(callback: () => void): void;
}

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function parseViewBox(value: string): ViewBox {
  const [x, y, width, height] = value.trim().split(/\s+/).map(Number);
  return { x, y, width, height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Owns the <svg id="map"> element: renders country shapes and one box-pin
 * marker per country, and wires wheel-zoom / drag-to-pan by mutating the
 * viewBox. Pure DOM/SVG concerns only — it never fetches data or knows
 * about the detail panel. */
export function createSvgMap(container: HTMLElement, viewBox: string): SvgMapView {
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
  const { show: showTooltip, hide: hideTooltip, scaleGroup: tooltipScaleGroup } = createTooltip(svg);

  // Each marker's (and the tooltip's) visual content lives in its own
  // "scale group" so its apparent screen size can be kept constant
  // independently of the pan/zoom transform applied to the map (see
  // setupPanAndZoom's zoomRatio).
  const markerScaleGroups: SVGGElement[] = [tooltipScaleGroup];

  // Pin groups get an extra scale (on top of the zoom-cancelling one above)
  // on mobile viewports, applied independently so the tooltip's size is
  // unaffected. Kept in sync with the media query rather than read once, so
  // rotating a phone or resizing a browser window updates it live.
  const pinMobileGroups: SVGGElement[] = [];
  const mobileQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);

  function currentMobileScale(): number {
    return mobileQuery.matches ? MOBILE_MARKER_SCALE : 1;
  }

  function applyMobileScale(): void {
    for (const group of pinMobileGroups) {
      group.setAttribute("transform", `scale(${currentMobileScale()})`);
    }
  }

  // The outer <g class="marker"> elements, hidden on mobile until the user
  // has zoomed in past MOBILE_MARKER_MIN_ZOOM (see updateMarkerVisibility).
  const markerGroups: SVGGElement[] = [];

  function updateMarkerVisibility(): void {
    const visible = !mobileQuery.matches || currentZoomRatio <= 1 / MOBILE_MARKER_MIN_ZOOM;
    for (const group of markerGroups) {
      group.classList.toggle("marker-hidden", !visible);
    }
    if (!visible) hideTooltip();
  }

  mobileQuery.addEventListener("change", () => {
    applyMobileScale();
    updateMarkerVisibility();
  });

  let backgroundClickCallback: (() => void) | null = null;

  // Tracks the zoom-cancelling scale currently applied to markerScaleGroups,
  // so a marker rendered after the map has already been zoomed starts out at
  // the right size instead of waiting for the next zoom change to pick it up.
  let currentZoomRatio = 1;

  setupPanAndZoom(
    svg,
    parseViewBox(viewBox),
    (zoomRatio) => {
      currentZoomRatio = zoomRatio;
      for (const group of markerScaleGroups) {
        group.setAttribute("transform", `scale(${zoomRatio})`);
      }
      updateMarkerVisibility();
    },
    () => backgroundClickCallback?.(),
  );

  return {
    renderCountries(countries, countriesWithBooks) {
      for (const country of countries) {
        const path = document.createElementNS(SVG_NS, "path") as SVGPathElement;
        path.setAttribute("d", country.path);
        path.setAttribute(
          "class",
          countriesWithBooks.has(country.name) ? "country has-books" : "country",
        );
        countriesGroup.appendChild(path);
        countryPathsByName.set(country.name, path);
      }
    },
    renderMarkers(markers, onMarkerClick) {
      for (const marker of markers) {
        const group = document.createElementNS(SVG_NS, "g");
        group.setAttribute("class", "marker");
        group.setAttribute("transform", `translate(${marker.x},${marker.y})`);

        const scaleGroup = document.createElementNS(SVG_NS, "g");
        scaleGroup.setAttribute("transform", `scale(${currentZoomRatio})`);
        const pinGroup = document.createElementNS(SVG_NS, "g");
        pinGroup.setAttribute("transform", `scale(${currentMobileScale()})`);
        pinGroup.appendChild(createPinShape());
        pinGroup.appendChild(createPinLabel(marker.books.length));
        scaleGroup.appendChild(pinGroup);
        group.appendChild(scaleGroup);
        markerScaleGroups.push(scaleGroup);
        pinMobileGroups.push(pinGroup);
        markerGroups.push(group);

        const countryPath = countryPathsByName.get(marker.geoName);
        const countryLabel = marker.books[0]?.country ?? marker.geoName;

        group.addEventListener("click", (event) => {
          event.stopPropagation();
          onMarkerClick(marker.geoName);
        });
        // SVG has no z-index: paint order follows document order, so
        // bringing a marker in front on hover means moving it to be the
        // last sibling. Moving a node the pointer is already over makes the
        // browser re-fire "pointerenter" on it (it's briefly detached and
        // reattached), so skip the move once it's already last — otherwise
        // that re-fire retriggers this handler forever and starves clicks.
        group.addEventListener("pointerenter", () => {
          if (group.nextElementSibling !== null) markersGroup.appendChild(group);
          countryPath?.classList.add("country-hovered");
          showTooltip(marker.x, marker.y, countryLabel);
        });
        group.addEventListener("pointerleave", () => {
          countryPath?.classList.remove("country-hovered");
          hideTooltip();
        });
        markersGroup.appendChild(group);
      }
      updateMarkerVisibility();
    },
    onBackgroundClick(callback) {
      backgroundClickCallback = callback;
    },
  };
}

function createTooltip(svg: SVGSVGElement): {
  show: (x: number, y: number, label: string) => void;
  hide: () => void;
  scaleGroup: SVGGElement;
} {
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("class", "marker-tooltip");
  group.style.visibility = "hidden";

  const scaleGroup = document.createElementNS(SVG_NS, "g");
  const background = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  background.setAttribute("class", "marker-tooltip-bg");
  background.setAttribute("rx", String(TOOLTIP_PADDING_Y));
  const text = document.createElementNS(SVG_NS, "text") as SVGTextElement;
  text.setAttribute("class", "marker-tooltip-text");
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("y", String(TOOLTIP_Y));
  text.setAttribute("font-size", String(TOOLTIP_FONT_SIZE));

  scaleGroup.appendChild(background);
  scaleGroup.appendChild(text);
  group.appendChild(scaleGroup);
  svg.appendChild(group); // appended last: always painted above markers

  return {
    scaleGroup,
    show(x, y, label) {
      text.textContent = label;
      const bbox = text.getBBox();
      background.setAttribute("x", String(bbox.x - TOOLTIP_PADDING_X));
      background.setAttribute("y", String(bbox.y - TOOLTIP_PADDING_Y));
      background.setAttribute("width", String(bbox.width + TOOLTIP_PADDING_X * 2));
      background.setAttribute("height", String(bbox.height + TOOLTIP_PADDING_Y * 2));
      group.setAttribute("transform", `translate(${x},${y})`);
      group.style.visibility = "visible";
    },
    hide() {
      group.style.visibility = "hidden";
    },
  };
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

function setupPanAndZoom(
  svg: SVGSVGElement,
  initialViewBox: ViewBox,
  onZoomChange: (zoomRatio: number) => void,
  onBackgroundClick: () => void,
): void {
  let viewBox: ViewBox = { ...initialViewBox };
  const minWidth = initialViewBox.width / MAX_ZOOM_SCALE;
  const maxWidth = initialViewBox.width;
  let isDragging = false;
  let hasDragged = false;
  let lastPointer = { x: 0, y: 0 };

  // Pointers currently touching the map, keyed by pointerId. Two active
  // pointers means a pinch gesture; drag-to-pan only applies with one.
  const activePointers = new Map<number, { x: number; y: number }>();
  let lastPinchDistance: number | null = null;
  let lastPinchMidpoint: { x: number; y: number } | null = null;

  // With preserveAspectRatio="xMidYMid meet" the svg scales uniformly and
  // letterboxes whichever axis doesn't match the container's aspect ratio,
  // so both axes share a single px-per-unit scale (not rect.width/height
  // independently) and the letterboxed axis has a centering offset to
  // subtract before converting client coordinates into svg-space.
  function svgUnitsPerPixel(rect: DOMRect): number {
    return Math.max(viewBox.width / rect.width, viewBox.height / rect.height);
  }

  function clientToSvgPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = svg.getBoundingClientRect();
    const unitsPerPixel = svgUnitsPerPixel(rect);
    const renderedWidth = viewBox.width / unitsPerPixel;
    const renderedHeight = viewBox.height / unitsPerPixel;
    const offsetX = (rect.width - renderedWidth) / 2;
    const offsetY = (rect.height - renderedHeight) / 2;
    return {
      x: viewBox.x + (clientX - rect.left - offsetX) * unitsPerPixel,
      y: viewBox.y + (clientY - rect.top - offsetY) * unitsPerPixel,
    };
  }

  // Zooms so that `focal` (an svg-space point) stays under the same spot on
  // screen, clamping the resulting viewBox width to the configured range.
  function applyZoom(newWidth: number, focal: { x: number; y: number }): void {
    const clampedWidth = clamp(newWidth, minWidth, maxWidth);
    const ratio = clampedWidth / viewBox.width;
    viewBox = {
      x: focal.x - (focal.x - viewBox.x) * ratio,
      y: focal.y - (focal.y - viewBox.y) * ratio,
      width: clampedWidth,
      height: viewBox.height * ratio,
    };
    setViewBox(svg, viewBox);
    // Markers are drawn in map-space units, which shrink on screen as we
    // zoom in (viewBox.width shrinks while the svg's own pixel size stays
    // fixed). Scaling their local geometry down by the same ratio the
    // viewBox shrank by cancels that out, keeping their on-screen size
    // constant.
    onZoomChange(viewBox.width / initialViewBox.width);
  }

  svg.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const zoomFactor = event.deltaY < 0 ? 0.9 : 1 / 0.9;
      applyZoom(viewBox.width * zoomFactor, clientToSvgPoint(event.clientX, event.clientY));
    },
    { passive: false },
  );

  svg.addEventListener("pointerdown", (event) => {
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.size >= 2) {
      // A second finger just landed: stop any single-finger pan and start a
      // pinch instead. Distance/midpoint are captured fresh on the next move
      // so the gesture doesn't jump.
      isDragging = false;
      lastPinchDistance = null;
      lastPinchMidpoint = null;
      return;
    }

    // Capturing the pointer here would retarget the eventual "click" (used
    // by markers) onto the svg itself, so markers would never see it.
    if (event.target instanceof Element && event.target.closest(".marker")) return;

    isDragging = true;
    hasDragged = false;
    lastPointer = { x: event.clientX, y: event.clientY };
    svg.classList.add("dragging");
    svg.setPointerCapture(event.pointerId);
  });

  svg.addEventListener("pointermove", (event) => {
    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (activePointers.size >= 2) {
      hasDragged = true;
      const [a, b] = Array.from(activePointers.values());
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

      if (lastPinchDistance !== null && lastPinchMidpoint !== null) {
        const rect = svg.getBoundingClientRect();
        const unitsPerPixel = svgUnitsPerPixel(rect);
        const dx = (midpoint.x - lastPinchMidpoint.x) * unitsPerPixel;
        const dy = (midpoint.y - lastPinchMidpoint.y) * unitsPerPixel;
        viewBox = { ...viewBox, x: viewBox.x - dx, y: viewBox.y - dy };

        const zoomFactor = distance > 0 ? lastPinchDistance / distance : 1;
        applyZoom(viewBox.width * zoomFactor, clientToSvgPoint(midpoint.x, midpoint.y));
      }

      lastPinchDistance = distance;
      lastPinchMidpoint = midpoint;
      return;
    }

    if (!isDragging) return;
    hasDragged = true;
    const rect = svg.getBoundingClientRect();
    const unitsPerPixel = svgUnitsPerPixel(rect);
    const dx = (event.clientX - lastPointer.x) * unitsPerPixel;
    const dy = (event.clientY - lastPointer.y) * unitsPerPixel;
    viewBox = { ...viewBox, x: viewBox.x - dx, y: viewBox.y - dy };
    lastPointer = { x: event.clientX, y: event.clientY };
    setViewBox(svg, viewBox);
  });

  function endDrag(event: PointerEvent): void {
    activePointers.delete(event.pointerId);
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);

    if (activePointers.size >= 2) {
      // Still pinching with the remaining pointers: resync on the next move.
      lastPinchDistance = null;
      lastPinchMidpoint = null;
      return;
    }

    if (activePointers.size === 1) {
      // One finger left after a pinch: resume single-finger panning from
      // its current position instead of jumping to it.
      const [remaining] = activePointers.values();
      lastPointer = remaining;
      isDragging = true;
      lastPinchDistance = null;
      lastPinchMidpoint = null;
      return;
    }

    lastPinchDistance = null;
    lastPinchMidpoint = null;
    if (!isDragging) return;
    isDragging = false;
    svg.classList.remove("dragging");
  }
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("pointerleave", endDrag);

  svg.addEventListener("click", () => {
    // Marker clicks call stopPropagation, so only clicks on empty
    // background or a country without a marker reach here. A pan-drag
    // gesture also ends in a "click" on svg (setPointerCapture retargets
    // it there), which hasDragged filters out.
    if (hasDragged) return;
    onBackgroundClick();
  });
}
