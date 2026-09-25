/**
 * Every component the research places map names still makes the research call
 * the map says it makes — so "where each job runs" cannot drift from the code.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  RESEARCH_PLACE_CALLS,
  RESEARCH_PLACES,
} from "../components/intelligence/places";

const rows = Object.entries(RESEARCH_PLACE_CALLS).flatMap(([placeId, files]) =>
  Object.entries(files).flatMap(([file, calls]) =>
    calls.map((call) => [placeId, file, call] as const),
  ),
);

describe("Research intelligence places", () => {
  it.each(rows)("%s: %s calls .%s(", (_placeId, file, call) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    expect(source).toMatch(new RegExp(`\\.${call}\\(`));
  });

  it("every place lists at least one job and one source", () => {
    for (const place of RESEARCH_PLACES.places) {
      expect({ id: place.id, jobs: place.mandateKeys.length > 0 }).toEqual({
        id: place.id,
        jobs: true,
      });
      expect(place.sources.length).toBeGreaterThan(0);
    }
  });
});
