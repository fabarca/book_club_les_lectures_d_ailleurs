import { MOBILE_BREAKPOINT_QUERY } from "./svgMapView.js";
const MIN_PANEL_FRACTION = 0.25;
const MAX_PANEL_FRACTION = 0.7;
const KEYBOARD_STEP_FRACTION = 0.05;
function clamp(value, min, max) {
    const clamped = Math.min(Math.max(value, min), max);
    return clamped;
}
function isMobileAxis(state) {
    return state.mobileQuery.matches;
}
function cssPropertyName(state) {
    return isMobileAxis(state) ? "--book-panel-height" : "--book-panel-width";
}
function currentBounds(state) {
    const viewportSize = isMobileAxis(state) ? window.innerHeight : window.innerWidth;
    const bounds = { min: viewportSize * MIN_PANEL_FRACTION, max: viewportSize * MAX_PANEL_FRACTION };
    return bounds;
}
function setPanelSize(state, sizePx) {
    const { min, max } = currentBounds(state);
    const clampedSize = clamp(sizePx, min, max);
    document.documentElement.style.setProperty(cssPropertyName(state), `${clampedSize}px`);
    state.handle.setAttribute("aria-valuenow", String(Math.round(clampedSize)));
    state.handle.setAttribute("aria-valuemin", String(Math.round(min)));
    state.handle.setAttribute("aria-valuemax", String(Math.round(max)));
}
function handlePointerDown(state, event) {
    event.preventDefault();
    state.isDragging = true;
    const rect = state.panel.getBoundingClientRect();
    if (isMobileAxis(state)) {
        state.startPointerPos = event.clientY;
        state.startSize = rect.height;
    }
    else {
        state.startPointerPos = event.clientX;
        state.startSize = rect.width;
    }
    state.handle.setPointerCapture(event.pointerId);
    state.handle.classList.add("dragging");
    document.body.style.cursor = isMobileAxis(state) ? "ns-resize" : "ew-resize";
    document.body.style.userSelect = "none";
}
function handlePointerMove(state, event) {
    if (!state.isDragging)
        return;
    const currentPos = isMobileAxis(state) ? event.clientY : event.clientX;
    const delta = state.startPointerPos - currentPos;
    setPanelSize(state, state.startSize + delta);
}
function endDrag(state, event) {
    if (!state.isDragging)
        return;
    state.isDragging = false;
    if (state.handle.hasPointerCapture(event.pointerId))
        state.handle.releasePointerCapture(event.pointerId);
    state.handle.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
}
function handleKeyDown(state, event) {
    const rect = state.panel.getBoundingClientRect();
    const currentSize = isMobileAxis(state) ? rect.height : rect.width;
    const { min, max } = currentBounds(state);
    const viewportSize = isMobileAxis(state) ? window.innerHeight : window.innerWidth;
    const step = viewportSize * KEYBOARD_STEP_FRACTION;
    const growKey = isMobileAxis(state) ? "ArrowUp" : "ArrowLeft";
    const shrinkKey = isMobileAxis(state) ? "ArrowDown" : "ArrowRight";
    if (event.key === growKey) {
        event.preventDefault();
        setPanelSize(state, currentSize + step);
    }
    else if (event.key === shrinkKey) {
        event.preventDefault();
        setPanelSize(state, currentSize - step);
    }
    else if (event.key === "Home") {
        event.preventDefault();
        setPanelSize(state, min);
    }
    else if (event.key === "End") {
        event.preventDefault();
        setPanelSize(state, max);
    }
}
function handleMobileQueryChange(state) {
    state.handle.setAttribute("aria-orientation", isMobileAxis(state) ? "horizontal" : "vertical");
}
function handleWindowResize(state) {
    const propertyName = cssPropertyName(state);
    const currentValue = document.documentElement.style.getPropertyValue(propertyName);
    if (!currentValue)
        return;
    const rect = state.panel.getBoundingClientRect();
    const currentSize = isMobileAxis(state) ? rect.height : rect.width;
    const { min, max } = currentBounds(state);
    const clampedSize = clamp(currentSize, min, max);
    if (clampedSize !== currentSize)
        setPanelSize(state, clampedSize);
}
export function setupPanelResize(panel, handle) {
    const mobileQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const state = { panel, handle, mobileQuery, isDragging: false, startPointerPos: 0, startSize: 0 };
    handleMobileQueryChange(state);
    mobileQuery.addEventListener("change", handleMobileQueryChange.bind(null, state));
    window.addEventListener("resize", handleWindowResize.bind(null, state));
    handle.addEventListener("pointerdown", handlePointerDown.bind(null, state));
    handle.addEventListener("pointermove", handlePointerMove.bind(null, state));
    handle.addEventListener("pointerup", endDrag.bind(null, state));
    handle.addEventListener("pointercancel", endDrag.bind(null, state));
    handle.addEventListener("keydown", handleKeyDown.bind(null, state));
    return state;
}
