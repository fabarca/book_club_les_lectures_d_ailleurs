import type { Locator, Page } from "@playwright/test";

/** A point on the map that's never covered by the header banner (top-left,
 * full-width on narrow viewports) or the book panel (right side on desktop,
 * bottom ~50% of the viewport on mobile — see the media query in
 * styles.css). Just below the header, horizontally centered, clears both. */
export async function getSafeMapPoint(page: Page): Promise<{ x: number; y: number }> {
  const svgBox = (await page.locator("#map > svg").boundingBox())!;
  const headerBox = (await page.locator("header").boundingBox())!;
  const point = { x: svgBox.x + svgBox.width / 2, y: headerBox.y + headerBox.height + 20 };
  return point;
}

export function isMobileProject(fixtures: { isMobile: boolean | undefined }): boolean {
  const isMobile = Boolean(fixtures.isMobile);
  return isMobile;
}

/** The book panel opens automatically on load, sliding in via a 0.25s CSS
 * transition (see the `#book-panel.open` rule in styles.css). The resizer
 * handle rides along with that same transition, so any test that needs its
 * on-screen position (rather than just checking the "open" class) must wait
 * for the slide-in to finish first, or it'll compute a mid-animation point. */
export async function waitForPanelOpenTransition(page: Page): Promise<void> {
  await page.locator("#book-panel.open").waitFor();
  await page.waitForTimeout(300);
}

/** Drags the book panel's resize handle by the given screen-space delta,
 * using the same move -> down -> move(steps) -> up idiom as the map's
 * drag-to-pan tests in zoom-pan.spec.ts. */
export async function dragPanelResizer(page: Page, deltaX: number, deltaY: number): Promise<void> {
  const handle = page.locator("#book-panel-resizer");
  const box = (await handle.boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + deltaX, center.y + deltaY, { steps: 5 });
  await page.mouse.up();
}

export interface CountryPoint {
  x: number;
  y: number;
}

/** A point on the given "has-books" country's shape that isn't covered by
 * its own marker pin — needed to exercise hover/click on the country shape
 * itself, as opposed to the marker sitting on top of it. Defaults to Brazil:
 * large, and positioned clear of the book panel at the desktop viewport size
 * these tests run at. */
export async function getCountryLandmassPoint(page: Page, geoName = "Brazil"): Promise<CountryPoint> {
  await page.locator(".country.has-books").first().waitFor();
  // Scans a grid over the country's bounding box (in the browser, using the
  // live viewBox-to-screen transform) until a point resolves — via the same
  // elementFromPoint hit-testing the app itself uses for clicks — to the
  // country's own path and not its marker. A fixed offset isn't reliable
  // here: where the marker sits relative to the country's bbox shifts with
  // viewport size (the svg's preserveAspectRatio letterboxing), and concave
  // shapes/neighboring countries mean plenty of bbox-interior points miss
  // the country entirely.
  const point = await page.evaluate((name) => {
    const path = document.querySelector(`.country.has-books[data-geo-name="${name}"]`);
    if (!path) throw new Error(`No has-books country path found for "${name}"`);
    const box = (path as SVGGraphicsElement).getBBox();
    const svg = document.querySelector("svg#map") as SVGSVGElement;
    const ctm = svg.getScreenCTM()!;
    const svgPoint = svg.createSVGPoint();

    const steps = 9;
    for (let i = 1; i < steps; i++) {
      for (let j = 1; j < steps; j++) {
        svgPoint.x = box.x + (box.width * i) / steps;
        svgPoint.y = box.y + (box.height * j) / steps;
        const screenPoint = svgPoint.matrixTransform(ctm);
        const el = document.elementFromPoint(screenPoint.x, screenPoint.y);
        if (el && el.closest(".marker") === null && el.matches(`.country.has-books[data-geo-name="${name}"]`)) {
          return { x: screenPoint.x, y: screenPoint.y };
        }
      }
    }
    return null;
  }, geoName);

  if (!point) throw new Error(`Could not find a marker-free point on "${geoName}"'s shape`);
  return point;
}

/** A marker that isn't visually covered by a neighboring marker's pin at the
 * current zoom level — on mobile, pins are drawn 4x larger and are no longer
 * gated to only appear once zoomed in, so two countries with close-together
 * markers can overlap at full zoom-out. Picks the first marker whose own
 * center point still resolves, via the same elementFromPoint hit-testing the
 * app uses for clicks, to itself rather than a neighbor. Call this only
 * after markers have been made visible (e.g. via the marker toggle). */
export async function getUnobstructedMarker(page: Page): Promise<Locator> {
  const geoName = await page.evaluate(() => {
    for (const marker of Array.from(document.querySelectorAll(".marker"))) {
      const rect = marker.getBoundingClientRect();
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const el = document.elementFromPoint(cx, cy);
      if (el && el.closest(".marker") === marker) return marker.getAttribute("data-geo-name");
    }
    return null;
  });
  if (!geoName) throw new Error("Could not find an unobstructed marker");
  return page.locator(`.marker[data-geo-name="${geoName}"]`);
}

/** The screen-space center of a country that has no books (and thus no
 * marker) — used to verify clicking such a country behaves like clicking
 * empty background. Defaults to Antarctica: large and unambiguous. */
export async function getNoBooksCountryPoint(page: Page, geoName = "Antarctica"): Promise<CountryPoint> {
  await page.locator(".country").first().waitFor();
  const point = await page.evaluate((name) => {
    const path = document.querySelector(`.country[data-geo-name="${name}"]`);
    if (!path) throw new Error(`No country path found for "${name}"`);
    const box = (path as SVGGraphicsElement).getBBox();
    const svg = document.querySelector("svg#map") as SVGSVGElement;
    const svgPoint = svg.createSVGPoint();
    svgPoint.x = box.x + box.width * 0.5;
    svgPoint.y = box.y + box.height * 0.5;
    const screenPoint = svgPoint.matrixTransform(svg.getScreenCTM()!);
    return { x: screenPoint.x, y: screenPoint.y };
  }, geoName);
  return point;
}
