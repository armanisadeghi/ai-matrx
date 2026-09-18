// features/marketing/seo/topical-map/start/verify-no-handbuilt-map-url.test.ts
//
// ZERO-AUTHORSHIP VERIFICATION (Lane E, VERIFIER-E attack #1).
//
// CONTRACTS.md §2: "All hrefs come from `features/marketing/lib/routes.ts`
// builders. Never hand-build a map URL." This is a forcing-function test, not
// a description of current behaviour: it scans Lane E's own files for a raw
// `/marketing/topical-maps/...` string literal built by hand (template
// literal or plain string), the same pattern the brief's attack #1 asked for.
//
// This test is RED by design until the finding is fixed (2 of the 16 files
// fail, 3 exact literal hits). The fix is either (a) a
// `marketingRoutes.topicalMapStart(...)` builder added by the coordinator
// (routes.ts is coordinator-owned, CONTRACTS §9) and adopted here, or (b) the
// call sites removed in favor of a shared local helper that itself is filed
// with the coordinator. Do not silence this by loosening the pattern or
// excluding a file — that is fixing the test, not the defect.
//
// Known offenders at verification time (commit 1b66428994f1):
//   - features/marketing/seo/topical-map/linkins/SiteTopicalMapButton.tsx:60
//   - features/marketing/seo/topical-map/linkins/SiteTopicalMapButton.tsx:75
//   - features/research/components/outputs/outputDefinitions.ts:141
//
// `marketingRoutes` (features/marketing/lib/routes.ts) has a builder for the
// map's read-only id door (`topicalMapDoor`) but none for the brand-free
// START door (`/marketing/topical-maps/start`), so every screen that needs
// that address without a brand segment hand-builds it instead of escalating
// for a builder.

import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "../../../../../");

// A literal `/marketing/topical-maps/start` built as a plain or template
// string, NOT through a `marketingRoutes.*` call. Deliberately narrow: it must
// not also flag `marketingRoutes.topicalMapDoor(...)`, which IS the sanctioned
// builder for the sibling id door.
const HANDBUILT_START_DOOR = /['"`]\/marketing\/topical-maps\/start/;

const FILES_LANE_E_OWNS = [
  "features/marketing/seo/topical-map/linkins/SiteTopicalMapButton.tsx",
  "features/marketing/seo/topical-map/linkins/MapThesePagesLink.tsx",
  "features/marketing/seo/topical-map/linkins/PlanNodeTopicField.tsx",
  "features/marketing/seo/topical-map/linkins/PlanSiteMapCell.tsx",
  "features/marketing/seo/topical-map/linkins/TopicGapsTile.tsx",
  "features/marketing/seo/topical-map/linkins/keywordMapTopicColumn.tsx",
  "features/marketing/seo/topical-map/linkins/useKeywordMapHomes.ts",
  "features/marketing/seo/topical-map/linkins/useSiteTopicalMapLink.ts",
  "features/marketing/seo/topical-map/door/TopicalMapDoorBody.tsx",
  "features/marketing/seo/topical-map/door/TopicalMapStartDoor.tsx",
  "features/marketing/seo/topical-map/components/TopicalMapHome.tsx",
  "features/marketing/seo/topical-map/components/TopicalMapHomeHeader.tsx",
  "features/marketing/seo/topical-map/components/TopicalMapHomeCard.tsx",
  "features/marketing/seo/topical-map/start/StartMapScreen.tsx",
  "features/marketing/seo/topical-map/start/StartMapResult.tsx",
  "features/research/components/outputs/outputDefinitions.ts",
];

describe("VERIFIER-E — no hand-built topical-map START door URL (CONTRACTS §2)", () => {
  it.each(FILES_LANE_E_OWNS)("%s builds every map address through a routes.ts builder", (rel) => {
    const abs = path.join(REPO_ROOT, rel);
    const source = fs.readFileSync(abs, "utf8");
    const lines = source.split("\n");
    const offendingLines = lines
      .map((line, i) => ({ line, n: i + 1 }))
      // Skip comment lines (`//`, doc-block `*`) — a URL named in prose is not
      // a hand-built href; only real code (a string literal reachable at
      // runtime) is the defect.
      .filter(({ line }) => !/^\s*(\/\/|\*)/.test(line))
      .filter(({ line }) => HANDBUILT_START_DOOR.test(line));

    if (offendingLines.length > 0) {
      const detail = offendingLines.map(({ line, n }) => `  ${rel}:${n}  ${line.trim()}`).join("\n");
      throw new Error(
        `Hand-built "/marketing/topical-maps/start" URL literal(s) — CONTRACTS §2 says every ` +
          `href comes from a marketingRoutes.ts builder:\n${detail}\n\n` +
          `Fix: add a marketingRoutes.topicalMapStart(...) builder (coordinator-owned file — ` +
          `file it in the register) and call it here instead of the raw string.`,
      );
    }
    expect(offendingLines).toEqual([]);
  });
});
