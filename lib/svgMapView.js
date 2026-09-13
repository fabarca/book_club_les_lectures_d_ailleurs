const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_ZOOM_SCALE = 8;
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
    const [x, y, width, height] = value.trim().split(/\s+/).map(Number);
    return { x, y, width, height };
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
/** Owns the <svg id="map"> element: renders country shapes and one box-pin
 * marker per country, and wires wheel-zoom / drag-to-pan by mutating the
 * viewBox. Pure DOM/SVG concerns only — it never fetches data or knows
 * about the detail panel. */
export function createSvgMap(container, viewBox) {
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
    const { show: showTooltip, hide: hideTooltip, scaleGroup: tooltipScaleGroup } = createTooltip(svg);
    // Each marker's (and the tooltip's) visual content lives in its own
    // "scale group" so its apparent screen size can be kept constant
    // independently of the pan/zoom transform applied to the map (see
    // setupPanAndZoom's zoomRatio).
    const markerScaleGroups = [tooltipScaleGroup];
    setupPanAndZoom(svg, parseViewBox(viewBox), (zoomRatio) => {
        for (const group of markerScaleGroups) {
            group.setAttribute("transform", `scale(${zoomRatio})`);
        }
    });
    return {
        renderCountries(countries, countriesWithBooks) {
            for (const country of countries) {
                const path = document.createElementNS(SVG_NS, "path");
                path.setAttribute("d", country.path);
                path.setAttribute("class", countriesWithBooks.has(country.name) ? "country has-books" : "country");
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
                scaleGroup.appendChild(createPinShape());
                scaleGroup.appendChild(createPinLabel(marker.books.length));
                group.appendChild(scaleGroup);
                markerScaleGroups.push(scaleGroup);
                const countryPath = countryPathsByName.get(marker.geoName);
                const countryLabel = marker.books[0]?.country ?? marker.geoName;
                group.addEventListener("click", (event) => {
                    event.stopPropagation();
                    onMarkerClick(marker.books);
                });
                // SVG has no z-index: paint order follows document order, so
                // bringing a marker in front on hover means moving it to be the
                // last sibling. Moving a node the pointer is already over makes the
                // browser re-fire "pointerenter" on it (it's briefly detached and
                // reattached), so skip the move once it's already last — otherwise
                // that re-fire retriggers this handler forever and starves clicks.
                group.addEventListener("pointerenter", () => {
                    if (group.nextElementSibling !== null)
                        markersGroup.appendChild(group);
                    countryPath?.classList.add("country-hovered");
                    showTooltip(marker.x, marker.y, countryLabel);
                });
                group.addEventListener("pointerleave", () => {
                    countryPath?.classList.remove("country-hovered");
                    hideTooltip();
                });
                markersGroup.appendChild(group);
            }
        },
    };
}
function createTooltip(svg) {
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "marker-tooltip");
    group.style.visibility = "hidden";
    const scaleGroup = document.createElementNS(SVG_NS, "g");
    const background = document.createElementNS(SVG_NS, "rect");
    background.setAttribute("class", "marker-tooltip-bg");
    background.setAttribute("rx", String(TOOLTIP_PADDING_Y));
    const text = document.createElementNS(SVG_NS, "text");
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
function setupPanAndZoom(svg, initialViewBox, onZoomChange) {
    let viewBox = { ...initialViewBox };
    const minWidth = initialViewBox.width / MAX_ZOOM_SCALE;
    const maxWidth = initialViewBox.width;
    let isDragging = false;
    let lastPointer = { x: 0, y: 0 };
    function clientToSvgPoint(clientX, clientY) {
        const rect = svg.getBoundingClientRect();
        return {
            x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.width,
            y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.height,
        };
    }
    svg.addEventListener("wheel", (event) => {
        event.preventDefault();
        const zoomFactor = event.deltaY < 0 ? 0.9 : 1 / 0.9;
        const newWidth = clamp(viewBox.width * zoomFactor, minWidth, maxWidth);
        if (newWidth === viewBox.width)
            return;
        const cursor = clientToSvgPoint(event.clientX, event.clientY);
        const ratio = newWidth / viewBox.width;
        viewBox = {
            x: cursor.x - (cursor.x - viewBox.x) * ratio,
            y: cursor.y - (cursor.y - viewBox.y) * ratio,
            width: newWidth,
            height: viewBox.height * ratio,
        };
        setViewBox(svg, viewBox);
        // Markers are drawn in map-space units, which shrink on screen as we
        // zoom in (viewBox.width shrinks while the svg's own pixel size stays
        // fixed). Scaling their local geometry down by the same ratio the
        // viewBox shrank by cancels that out, keeping their on-screen size
        // constant.
        onZoomChange(viewBox.width / initialViewBox.width);
    }, { passive: false });
    svg.addEventListener("pointerdown", (event) => {
        // Capturing the pointer here would retarget the eventual "click" (used
        // by markers) onto the svg itself, so markers would never see it.
        if (event.target instanceof Element && event.target.closest(".marker"))
            return;
        isDragging = true;
        lastPointer = { x: event.clientX, y: event.clientY };
        svg.classList.add("dragging");
        svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener("pointermove", (event) => {
        if (!isDragging)
            return;
        const rect = svg.getBoundingClientRect();
        const dx = ((event.clientX - lastPointer.x) / rect.width) * viewBox.width;
        const dy = ((event.clientY - lastPointer.y) / rect.height) * viewBox.height;
        viewBox = { ...viewBox, x: viewBox.x - dx, y: viewBox.y - dy };
        lastPointer = { x: event.clientX, y: event.clientY };
        setViewBox(svg, viewBox);
    });
    function endDrag(event) {
        // pointerleave fires whenever the cursor exits the svg, even when
        // nothing was being dragged (e.g. just hovering a marker then moving
        // away) — release only when we actually captured the pointer, otherwise
        // releasePointerCapture throws.
        if (!isDragging)
            return;
        isDragging = false;
        svg.classList.remove("dragging");
        svg.releasePointerCapture(event.pointerId);
    }
    svg.addEventListener("pointerup", endDrag);
    svg.addEventListener("pointerleave", endDrag);
}
