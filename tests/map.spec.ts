import { test, expect } from "./fixtures";
import { getCountryLandmassPoint, getNoBooksCountryPoint, getSafeMapPoint, isMobileProject } from "./helpers";

test.describe("map and book panel", () => {
  test("loads with map, countries and markers in the DOM", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#map > svg")).toBeVisible();
    await expect(page.locator(".country").first()).toBeVisible();
    // Markers exist regardless of viewport, but stay hidden on mobile until
    // zoomed in (see mobile.spec.ts) — check presence, not visibility.
    await expect(page.locator(".marker")).not.toHaveCount(0);
  });

  test("hovering a marker highlights its country and shows a tooltip", async ({ page, isMobile }) => {
    test.skip(isMobileProject({ isMobile }), "Markers are hidden until zoomed in on mobile; see mobile.spec.ts");
    await page.goto("/");
    await page.locator(".marker").first().hover();
    await expect(page.locator(".country-hovered")).toHaveCount(1);
    await expect(page.locator(".marker-tooltip")).toBeVisible();
  });

  test("hovering a country's landmass (not its marker) highlights it and shows the tooltip", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobileProject({ isMobile }), "The book panel covers part of the map on mobile, making landmass targeting unreliable");
    await page.goto("/");
    const point = await getCountryLandmassPoint(page);
    await page.mouse.move(point.x, point.y);
    await expect(page.locator(".country-hovered")).toHaveCount(1);
    await expect(page.locator(".marker-tooltip")).toBeVisible();
  });

  test("clicking a marker opens the book panel filtered to that country", async ({ page, isMobile }) => {
    test.skip(isMobileProject({ isMobile }), "Markers are hidden until zoomed in on mobile; see mobile.spec.ts");
    await page.goto("/");
    await page.locator(".marker").first().click();
    await expect(page.locator("#book-panel")).toHaveClass(/open/);
    await expect(page.locator("#book-panel-toggle")).toHaveClass(/open/);
    await expect(page.locator("#country-filter-toggle")).not.toHaveText(/Tous les pays/);
    await expect(page.locator("#book-list li").first()).toBeVisible();
    await expect(page.locator(".country-selected")).toHaveCount(1);
  });

  test("clicking a country's landmass opens the book panel filtered to that country, like clicking its marker", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobileProject({ isMobile }), "The book panel covers part of the map on mobile, making landmass targeting unreliable");
    await page.goto("/");
    const point = await getCountryLandmassPoint(page);
    await page.mouse.click(point.x, point.y);
    await expect(page.locator("#book-panel")).toHaveClass(/open/);
    await expect(page.locator("#country-filter-toggle")).not.toHaveText(/Tous les pays/);
    await expect(page.locator(".country-selected")).toHaveCount(1);
  });

  test("clicking a country without books resets the filter, like clicking empty background", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobileProject({ isMobile }), "The book panel covers part of the map on mobile, making landmass targeting unreliable");
    await page.goto("/");
    await page.locator(".marker").first().click();
    await expect(page.locator("#country-filter-toggle")).not.toHaveText(/Tous les pays/);

    const point = await getNoBooksCountryPoint(page);
    await page.mouse.click(point.x, point.y);
    await expect(page.locator("#country-filter-toggle")).toHaveText(/Tous les pays/);
    await expect(page.locator(".country-selected")).toHaveCount(0);
  });

  test("country filter dropdown opens and resetting to all countries updates the list", async ({ page, isMobile }) => {
    test.skip(isMobileProject({ isMobile }), "Markers are hidden until zoomed in on mobile; see mobile.spec.ts");
    await page.goto("/");
    await page.locator(".marker").first().click();
    await expect(page.locator(".country-selected")).toHaveCount(1);

    const filterToggle = page.locator("#country-filter-toggle");
    await filterToggle.click();
    const optionsList = page.locator("#country-filter-options");
    await expect(optionsList).toBeVisible();

    await optionsList.locator("li").first().click(); // "Tous les pays" is always the first option
    await expect(filterToggle).toHaveText(/Tous les pays/);
    await expect(page.locator(".country-selected")).toHaveCount(0);
  });

  test("clicking a book opens the detail panel, and back returns to the list", async ({ page }) => {
    await page.goto("/");
    await page.locator("#book-list li").first().click();
    const backButton = page.locator("#book-detail-back");
    await expect(backButton).toBeVisible();
    await backButton.click();
    await expect(page.locator("#book-list")).toBeVisible();
  });

  test("clicking the map background clears the country filter", async ({ page, isMobile }) => {
    test.skip(isMobileProject({ isMobile }), "Markers are hidden until zoomed in on mobile; see mobile.spec.ts");
    await page.goto("/");
    await page.locator(".marker").first().click();
    await expect(page.locator("#country-filter-toggle")).not.toHaveText(/Tous les pays/);
    await expect(page.locator(".country-selected")).toHaveCount(1);

    const safePoint = await getSafeMapPoint(page);
    await page.mouse.click(safePoint.x, safePoint.y);
    await expect(page.locator("#country-filter-toggle")).toHaveText(/Tous les pays/);
    await expect(page.locator(".country-selected")).toHaveCount(0);
  });

  test("the panel toggle button opens and closes the book panel", async ({ page }) => {
    await page.goto("/");
    const panel = page.locator("#book-panel");
    await expect(panel).toHaveClass(/open/); // opened automatically once the page finishes loading

    const toggle = page.locator("#book-panel-toggle");
    await toggle.click();
    await expect(panel).not.toHaveClass(/open/);
    await toggle.click();
    await expect(panel).toHaveClass(/open/);
  });
});
