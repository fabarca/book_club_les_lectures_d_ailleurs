import { test, expect } from "./fixtures";
import { dragPanelResizer, isMobileProject, waitForPanelOpenTransition } from "./helpers";

const CLAMP_TOLERANCE_PX = 5;

test.describe("book panel resize (desktop, width)", () => {
  test.skip(({ isMobile }) => isMobileProject({ isMobile }), "desktop-only: the handle resizes width here");

  test("dragging the resize handle left grows the panel's width", async ({ page }) => {
    await page.goto("/");
    await waitForPanelOpenTransition(page);
    const panel = page.locator("#book-panel");
    const initialWidth = (await panel.boundingBox())!.width;

    await dragPanelResizer(page, -150, 0);

    const resizedWidth = (await panel.boundingBox())!.width;
    expect(resizedWidth).toBeGreaterThan(initialWidth);
  });

  test("dragging far left clamps the width to 70% of the viewport", async ({ page }) => {
    await page.goto("/");
    await waitForPanelOpenTransition(page);
    const panel = page.locator("#book-panel");
    const viewport = page.viewportSize()!;

    await dragPanelResizer(page, -2000, 0);

    const resizedWidth = (await panel.boundingBox())!.width;
    expect(resizedWidth).toBeLessThanOrEqual(viewport.width * 0.7 + CLAMP_TOLERANCE_PX);
    expect(resizedWidth).toBeGreaterThanOrEqual(viewport.width * 0.7 - CLAMP_TOLERANCE_PX);
  });

  test("dragging far right clamps the width to 25% of the viewport", async ({ page }) => {
    await page.goto("/");
    await waitForPanelOpenTransition(page);
    const panel = page.locator("#book-panel");
    const viewport = page.viewportSize()!;

    await dragPanelResizer(page, 2000, 0);

    const resizedWidth = (await panel.boundingBox())!.width;
    expect(resizedWidth).toBeLessThanOrEqual(viewport.width * 0.25 + CLAMP_TOLERANCE_PX);
    expect(resizedWidth).toBeGreaterThanOrEqual(viewport.width * 0.25 - CLAMP_TOLERANCE_PX);
  });

  test("resized width does not persist across a reload", async ({ page }) => {
    await page.goto("/");
    await waitForPanelOpenTransition(page);
    const panel = page.locator("#book-panel");
    const initialWidth = (await panel.boundingBox())!.width;

    await dragPanelResizer(page, -150, 0);
    expect((await panel.boundingBox())!.width).not.toBe(initialWidth);

    await page.reload();
    await waitForPanelOpenTransition(page);
    const reloadedWidth = (await page.locator("#book-panel").boundingBox())!.width;
    expect(reloadedWidth).toBe(initialWidth);
  });

  test("the book list stays interactive after a resize", async ({ page }) => {
    await page.goto("/");
    await waitForPanelOpenTransition(page);
    await dragPanelResizer(page, -150, 0);

    await page.locator("#book-list li").first().click();
    await expect(page.locator("#book-detail-back")).toBeVisible();
  });

  test("arrow keys resize the panel; Home/End snap to the clamped bounds", async ({ page }) => {
    await page.goto("/");
    await waitForPanelOpenTransition(page);
    const panel = page.locator("#book-panel");
    const handle = page.locator("#book-panel-resizer");
    const viewport = page.viewportSize()!;
    const initialWidth = (await panel.boundingBox())!.width;

    await handle.focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    expect((await panel.boundingBox())!.width).toBeGreaterThan(initialWidth);

    await page.keyboard.press("End");
    const maxWidth = (await panel.boundingBox())!.width;
    expect(maxWidth).toBeLessThanOrEqual(viewport.width * 0.7 + CLAMP_TOLERANCE_PX);
    expect(maxWidth).toBeGreaterThanOrEqual(viewport.width * 0.7 - CLAMP_TOLERANCE_PX);

    await page.keyboard.press("Home");
    const minWidth = (await panel.boundingBox())!.width;
    expect(minWidth).toBeLessThanOrEqual(viewport.width * 0.25 + CLAMP_TOLERANCE_PX);
    expect(minWidth).toBeGreaterThanOrEqual(viewport.width * 0.25 - CLAMP_TOLERANCE_PX);
  });
});

test.describe("book panel resize (mobile, height)", () => {
  test.skip(({ isMobile }) => !isMobileProject({ isMobile }), "mobile-only: the handle resizes height here");

  test("dragging the resize handle up grows the panel's height, clamped to 70% of the viewport", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForPanelOpenTransition(page);
    const panel = page.locator("#book-panel");
    const viewport = page.viewportSize()!;
    const initialHeight = (await panel.boundingBox())!.height;

    await dragPanelResizer(page, 0, -80);
    const grownHeight = (await panel.boundingBox())!.height;
    expect(grownHeight).toBeGreaterThan(initialHeight);

    await dragPanelResizer(page, 0, -2000);
    const clampedHeight = (await panel.boundingBox())!.height;
    expect(clampedHeight).toBeLessThanOrEqual(viewport.height * 0.7 + CLAMP_TOLERANCE_PX);
    expect(clampedHeight).toBeGreaterThanOrEqual(viewport.height * 0.7 - CLAMP_TOLERANCE_PX);
  });

  test("dragging the resize handle down shrinks the panel's height, clamped to 25% of the viewport", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForPanelOpenTransition(page);
    const panel = page.locator("#book-panel");
    const viewport = page.viewportSize()!;

    await dragPanelResizer(page, 0, 2000);

    const clampedHeight = (await panel.boundingBox())!.height;
    expect(clampedHeight).toBeLessThanOrEqual(viewport.height * 0.25 + CLAMP_TOLERANCE_PX);
    expect(clampedHeight).toBeGreaterThanOrEqual(viewport.height * 0.25 - CLAMP_TOLERANCE_PX);
  });
});
