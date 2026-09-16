const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_ZOOM_SCALE = 12;
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
function parseViewBox(value) {
    const parts = value.trim().split(/\s+/);
    const numbers = [];
    for (const part of parts)
        numbers.push(Number(part));
    const [x, y, width, height] = numbers;
    const box = { x, y, width, height };
    return box;
}
function clamp(value, min, max) {
    const clamped = Math.min(Math.max(value, min), max);
    return clamped;
}
function currentMobileScale(state) {
    const scale = state.mobileQuery.matches ? MOBILE_MARKER_SCALE : 1;
    return scale;
}
function applyMobileScale(state) {
    const scale = currentMobileScale(state);
    for (const group of state.mobileScaleGroups) {
        group.setAttribute("transform", `scale(${scale})`);
    }
}
// The outer <g class="marker"> elements are hidden on mobile until the user
// has zoomed in past MOBILE_MARKER_MIN_ZOOM.
function updateMarkerVisibility(state) {
    const visible = !state.mobileQuery.matches || state.currentZoomRatio <= 1 / MOBILE_MARKER_MIN_ZOOM;
    for (const group of state.markerGroups) {
        group.classList.toggle("marker-hidden", !visible);
    }
    if (!visible)
        hideTooltip(state.tooltip);
}
function handleMobileQueryChange(state) {
    applyMobileScale(state);
    updateMarkerVisibility(state);
}
function handleMapZoomChange(state, zoomRatio) {
    state.currentZoomRatio = zoomRatio;
    for (const group of state.markerScaleGroups) {
        group.setAttribute("transform", `scale(${zoomRatio})`);
    }
    updateMarkerVisibility(state);
}
function handleMapBackgroundClick(state) {
    const callback = state.backgroundClickCallback;
    if (callback)
        callback();
}
/** Creates the <svg id="map"> element and its state: country shapes and one
 * box-pin marker per country, plus wheel-zoom / drag-to-pan wiring that
 * mutates the viewBox. Pure DOM/SVG concerns only — it never fetches data or
 * knows about the detail panel. */
export function createSvgMapState(container, viewBox) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("id", "map");
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    container.appendChild(svg);
    const countriesGroup = document.createElementNS(SVG_NS, "g");
    svg.appendChild(countriesGroup);
    const markersGroup = document.createElementNS(SVG_NS, "g");
    svg.appendChild(markersGroup);
    const countryPathsByName = new Map();
    const tooltip = createTooltipState(svg);
    // Each marker's (and the tooltip's) visual content lives in its own
    // "scale group" so its apparent screen size can be kept constant
    // independently of the pan/zoom transform applied to the map (see
    // handleMapZoomChange's zoomRatio).
    const markerScaleGroups = [tooltip.scaleGroup];
    // Pin and tooltip groups get an extra scale (on top of the zoom-cancelling
    // one above) on mobile viewports, so the country-name label grows in step
    // with the enlarged pin instead of staying pinned to its base size. Kept
    // in sync with the media query rather than read once, so rotating a phone
    // or resizing a browser window updates it live.
    const mobileScaleGroups = [tooltip.mobileGroup];
    const markerGroups = [];
    const mobileQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const state = {
        svg,
        countriesGroup,
        markersGroup,
        countryPathsByName,
        tooltip,
        markerScaleGroups,
        mobileScaleGroups,
        markerGroups,
        mobileQuery,
        backgroundClickCallback: null,
        currentZoomRatio: 1,
    };
    // Markers set their own initial mobile scale when rendered (they don't
    // exist yet at this point), but the tooltip group above does exist now
    // and needs its initial scale applied explicitly.
    applyMobileScale(state);
    mobileQuery.addEventListener("change", handleMobileQueryChange.bind(null, state));
    setupPanAndZoom(svg, parseViewBox(viewBox), handleMapZoomChange.bind(null, state), handleMapBackgroundClick.bind(null, state));
    return state;
}
function renderCountry(state, country, countriesWithBooks) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", country.path);
    const className = countriesWithBooks.has(country.name) ? "country has-books" : "country";
    path.setAttribute("class", className);
    state.countriesGroup.appendChild(path);
    state.countryPathsByName.set(country.name, path);
}
export function renderCountries(state, countries, countriesWithBooks) {
    for (const country of countries)
        renderCountry(state, country, countriesWithBooks);
}
function handleMarkerClick(context, event) {
    event.stopPropagation();
    context.onMarkerClick(context.marker.geoName);
}
function handleMarkerPointerEnter(context) {
    // SVG has no z-index: paint order follows document order, so bringing a
    // marker in front on hover means moving it to be the last sibling. Moving
    // a node the pointer is already over makes the browser re-fire
    // "pointerenter" on it (it's briefly detached and reattached), so skip the
    // move once it's already last — otherwise that re-fire retriggers this
    // handler forever and starves clicks.
    if (context.group.nextElementSibling !== null)
        context.state.markersGroup.appendChild(context.group);
    context.countryPath?.classList.add("country-hovered");
    showTooltip(context.state.tooltip, context.marker.x, context.marker.y, context.countryLabel);
}
function handleMarkerPointerLeave(context) {
    context.countryPath?.classList.remove("country-hovered");
    hideTooltip(context.state.tooltip);
}
function renderMarker(state, marker, onMarkerClick) {
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "marker");
    group.setAttribute("transform", `translate(${marker.x},${marker.y})`);
    const scaleGroup = document.createElementNS(SVG_NS, "g");
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
    const countryPath = state.countryPathsByName.get(marker.geoName);
    const countryLabel = marker.books[0]?.country ?? marker.geoName;
    const context = { state, group, countryPath, marker, countryLabel, onMarkerClick };
    group.addEventListener("click", handleMarkerClick.bind(null, context));
    group.addEventListener("pointerenter", handleMarkerPointerEnter.bind(null, context));
    group.addEventListener("pointerleave", handleMarkerPointerLeave.bind(null, context));
    state.markersGroup.appendChild(group);
}
export function renderMarkers(state, markers, onMarkerClick) {
    for (const marker of markers)
        renderMarker(state, marker, onMarkerClick);
    updateMarkerVisibility(state);
}
/** Registers a callback fired when the user clicks the map somewhere that
 * isn't a marker (a country without books, or open background/ocean). */
export function registerBackgroundClickHandler(state, callback) {
    state.backgroundClickCallback = callback;
}
function createTooltipState(svg) {
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "marker-tooltip");
    group.style.visibility = "hidden";
    const scaleGroup = document.createElementNS(SVG_NS, "g");
    const mobileGroup = document.createElementNS(SVG_NS, "g");
    const background = document.createElementNS(SVG_NS, "rect");
    background.setAttribute("class", "marker-tooltip-bg");
    background.setAttribute("rx", String(TOOLTIP_PADDING_Y));
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("class", "marker-tooltip-text");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("y", String(TOOLTIP_Y));
    text.setAttribute("font-size", String(TOOLTIP_FONT_SIZE));
    mobileGroup.appendChild(background);
    mobileGroup.appendChild(text);
    scaleGroup.appendChild(mobileGroup);
    group.appendChild(scaleGroup);
    svg.appendChild(group); // appended last: always painted above markers
    const tooltip = { group, scaleGroup, mobileGroup, background, text };
    return tooltip;
}
function showTooltip(tooltip, x, y, label) {
    tooltip.text.textContent = label;
    const bbox = tooltip.text.getBBox();
    tooltip.background.setAttribute("x", String(bbox.x - TOOLTIP_PADDING_X));
    tooltip.background.setAttribute("y", String(bbox.y - TOOLTIP_PADDING_Y));
    tooltip.background.setAttribute("width", String(bbox.width + TOOLTIP_PADDING_X * 2));
    tooltip.background.setAttribute("height", String(bbox.height + TOOLTIP_PADDING_Y * 2));
    tooltip.group.setAttribute("transform", `translate(${x},${y})`);
    tooltip.group.style.visibility = "visible";
}
function hideTooltip(tooltip) {
    tooltip.group.style.visibility = "hidden";
}
function createPinShape() {
    const shape = document.createElementNS(SVG_NS, "g");
    const tail = document.createElementNS(SVG_NS, "polygon");
    tail.setAttribute("points", `${-PIN_TAIL_HALF_WIDTH},${PIN_BOX_BOTTOM_Y} ${PIN_TAIL_HALF_WIDTH},${PIN_BOX_BOTTOM_Y} 0,0`);
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
function createPinLabel(count) {
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", "0");
    label.setAttribute("y", String(PIN_BOX_CENTER_Y));
    label.setAttribute("font-size", String(PIN_FONT_SIZE));
    label.setAttribute("class", "marker-count");
    label.textContent = String(count);
    return label;
}
function setViewBox(svg, vb) {
    svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
}
// With preserveAspectRatio="xMidYMid meet" the svg scales uniformly and
// letterboxes whichever axis doesn't match the container's aspect ratio, so
// both axes share a single px-per-unit scale (not rect.width/height
// independently) and the letterboxed axis has a centering offset to subtract
// before converting client coordinates into svg-space.
function svgUnitsPerPixel(state, rect) {
    const unitsPerPixel = Math.max(state.viewBox.width / rect.width, state.viewBox.height / rect.height);
    return unitsPerPixel;
}
function clientToSvgPoint(state, clientX, clientY) {
    const rect = state.svg.getBoundingClientRect();
    const unitsPerPixel = svgUnitsPerPixel(state, rect);
    const renderedWidth = state.viewBox.width / unitsPerPixel;
    const renderedHeight = state.viewBox.height / unitsPerPixel;
    const offsetX = (rect.width - renderedWidth) / 2;
    const offsetY = (rect.height - renderedHeight) / 2;
    const point = {
        x: state.viewBox.x + (clientX - rect.left - offsetX) * unitsPerPixel,
        y: state.viewBox.y + (clientY - rect.top - offsetY) * unitsPerPixel,
    };
    return point;
}
// Zooms so that `focal` (an svg-space point) stays under the same spot on
// screen, clamping the resulting viewBox width to the configured range.
function applyZoom(state, newWidth, focal) {
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
function handleWheel(state, event) {
    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? 0.9 : 1 / 0.9;
    const focal = clientToSvgPoint(state, event.clientX, event.clientY);
    applyZoom(state, state.viewBox.width * zoomFactor, focal);
}
function handlePointerDown(state, event) {
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
    if (event.target instanceof Element && event.target.closest(".marker"))
        return;
    state.isDragging = true;
    state.hasDragged = false;
    state.lastPointer = { x: event.clientX, y: event.clientY };
    state.svg.classList.add("dragging");
    state.svg.setPointerCapture(event.pointerId);
}
function computePinchGeometry(pointers) {
    const [a, b] = pointers;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const geometry = { distance, midpoint };
    return geometry;
}
function panByPinchMidpointDelta(state, midpoint) {
    const lastMidpoint = state.lastPinchMidpoint;
    if (!lastMidpoint)
        return;
    const rect = state.svg.getBoundingClientRect();
    const unitsPerPixel = svgUnitsPerPixel(state, rect);
    const dx = (midpoint.x - lastMidpoint.x) * unitsPerPixel;
    const dy = (midpoint.y - lastMidpoint.y) * unitsPerPixel;
    state.viewBox = { ...state.viewBox, x: state.viewBox.x - dx, y: state.viewBox.y - dy };
}
function handlePinchMove(state) {
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
function handleDragMove(state, event) {
    if (!state.isDragging)
        return;
    state.hasDragged = true;
    const rect = state.svg.getBoundingClientRect();
    const unitsPerPixel = svgUnitsPerPixel(state, rect);
    const dx = (event.clientX - state.lastPointer.x) * unitsPerPixel;
    const dy = (event.clientY - state.lastPointer.y) * unitsPerPixel;
    state.viewBox = { ...state.viewBox, x: state.viewBox.x - dx, y: state.viewBox.y - dy };
    state.lastPointer = { x: event.clientX, y: event.clientY };
    setViewBox(state.svg, state.viewBox);
}
function handlePointerMove(state, event) {
    if (state.activePointers.has(event.pointerId)) {
        state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (state.activePointers.size >= 2) {
        handlePinchMove(state);
        return;
    }
    handleDragMove(state, event);
}
function endDrag(state, event) {
    state.activePointers.delete(event.pointerId);
    if (state.svg.hasPointerCapture(event.pointerId))
        state.svg.releasePointerCapture(event.pointerId);
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
    if (!state.isDragging)
        return;
    state.isDragging = false;
    state.svg.classList.remove("dragging");
}
function handleBackgroundClickOnSvg(state) {
    // Marker clicks call stopPropagation, so only clicks on empty background
    // or a country without a marker reach here. A pan-drag gesture also ends
    // in a "click" on svg (setPointerCapture retargets it there), which
    // hasDragged filters out.
    if (state.hasDragged)
        return;
    state.onBackgroundClick();
}
function createPanZoomState(svg, initialViewBox, onZoomChange, onBackgroundClick) {
    const state = {
        svg,
        viewBox: { ...initialViewBox },
        initialViewBox,
        minWidth: initialViewBox.width / MAX_ZOOM_SCALE,
        maxWidth: initialViewBox.width,
        isDragging: false,
        hasDragged: false,
        lastPointer: { x: 0, y: 0 },
        activePointers: new Map(),
        lastPinchDistance: null,
        lastPinchMidpoint: null,
        onZoomChange,
        onBackgroundClick,
    };
    return state;
}
function setupPanAndZoom(svg, initialViewBox, onZoomChange, onBackgroundClick) {
    const state = createPanZoomState(svg, initialViewBox, onZoomChange, onBackgroundClick);
    svg.addEventListener("wheel", handleWheel.bind(null, state), { passive: false });
    svg.addEventListener("pointerdown", handlePointerDown.bind(null, state));
    svg.addEventListener("pointermove", handlePointerMove.bind(null, state));
    svg.addEventListener("pointerup", endDrag.bind(null, state));
    svg.addEventListener("pointercancel", endDrag.bind(null, state));
    svg.addEventListener("pointerleave", endDrag.bind(null, state));
    svg.addEventListener("click", handleBackgroundClickOnSvg.bind(null, state));
}
