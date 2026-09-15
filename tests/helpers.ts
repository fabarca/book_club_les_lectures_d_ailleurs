import type { Page } from "@playwright/test";

/** A point on the map that's never covered by the header banner (top-left,
 * full-width on narrow viewports) or the book panel (right side on desktop,
 * bottom ~70% of the viewport on mobile — see the media query in
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
