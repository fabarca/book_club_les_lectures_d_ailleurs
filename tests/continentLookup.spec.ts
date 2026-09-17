import { test, expect } from "@playwright/test";
import { FRENCH_TO_GEOJSON_NAME } from "../src/lib/countryLookup";
import { GEONAME_TO_CONTINENT } from "../src/lib/continentLookup";

test("every country in FRENCH_TO_GEOJSON_NAME has a continent", () => {
  const geoNames = new Set(Object.values(FRENCH_TO_GEOJSON_NAME));
  const missing: string[] = [];
  for (const geoName of geoNames) {
    if (!GEONAME_TO_CONTINENT[geoName]) missing.push(geoName);
  }
  expect(missing).toEqual([]);
});
