import { test, expect } from "./fixtures";
import { getSafeMapPoint, isMobileProject } from "./helpers";

function readFirstMarkerPinTransform(): string | null {
  const marker = document.querySelector(".marker");
  const scaleGroup = marker?.children[0] as SVGGElement | undefined;
  const pinGroup = scaleGroup?.children[0] as SVGGElement | undefined;
  const transform = pinGroup?.getAttribute("transform") ?? null;
  return transform;
}

function isNotMobileProject(fixtures: { isMobile: boolean | undefined }): boolean {
  const isNotMobile = !isMobileProject(fixtures);
  return isNotMobile;
}

test.describe("mobile map markers", () => {
  // Playwright's test.skip() statically inspects this callback's parameter
  // destructuring to know which fixtures to inject, so it must be an inline
  // arrow with that exact pattern — a reference to a named function doesn't
  // work here. All the actual logic still lives in isNotMobileProject.
  test.skip(({ isMobile }) => isNotMobileProject({ isMobile }), "Only relevant on the mobile project (narrow viewport)");

  test("pins stay hidden until zoomed in, then scale up 4x", async ({ page }) => {
    await page.goto("/");
    const firstMarker = page.locator(".marker").first();
    await expect(firstMarker).toHaveClass(/marker-hidden/);

    const safePoint = await getSafeMapPoint(page);
    await page.mouse.move(safePoint.x, safePoint.y);
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -100);

    await expect(firstMarker).not.toHaveClass(/marker-hidden/);
    const pinTransform = await page.evaluate(readFirstMarkerPinTransform);
    expect(pinTransform).toBe("scale(4)");
  });
});
