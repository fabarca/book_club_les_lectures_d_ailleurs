import { test, expect } from "./fixtures";
import { getSafeMapPoint } from "./helpers";

function parseViewBoxWidth(viewBoxAttribute: string): number {
  const parts = viewBoxAttribute.trim().split(/\s+/).map(Number);
  const width = parts[2];
  return width;
}

test.describe("map zoom and pan", () => {
  test("wheel zoom in shrinks the viewBox width, clamped to the configured range", async ({ page }) => {
    await page.goto("/");
    const svg = page.locator("#map > svg");
    const initialWidth = parseViewBoxWidth((await svg.getAttribute("viewBox"))!);
    const safePoint = await getSafeMapPoint(page);

    await page.mouse.move(safePoint.x, safePoint.y);
    for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -100);

    const zoomedWidth = parseViewBoxWidth((await svg.getAttribute("viewBox"))!);
    expect(zoomedWidth).toBeLessThan(initialWidth);
    expect(zoomedWidth).toBeGreaterThanOrEqual(initialWidth / 8); // MAX_ZOOM_SCALE clamp in svgMapView.ts
  });

  test("dragging the map pans the viewBox", async ({ page }) => {
    await page.goto("/");
    const svg = page.locator("#map > svg");
    const initialViewBox = await svg.getAttribute("viewBox");
    const safePoint = await getSafeMapPoint(page);

    await page.mouse.move(safePoint.x, safePoint.y);
    await page.mouse.down();
    await page.mouse.move(safePoint.x + 40, safePoint.y + 15, { steps: 5 });
    await page.mouse.up();

    const pannedViewBox = await svg.getAttribute("viewBox");
    expect(pannedViewBox).not.toBe(initialViewBox);
  });
});
