/**
 * NEWS-ENGINE-SPEC §5.3 / §12 Lane G: no story screen reads `web.news_item`.
 *
 * A story row (`seo.tracker_story`) carries its own display evidence (≤8), so
 * the screens a person uses never reach into the platform's sighting store —
 * a join there would couple every monitor screen to a shared producer's
 * retention (R6: unsurfaced sightings expire after 90 days) and read other
 * trackers' sightings through a table that is not the story's.
 *
 * The census is every file under the story screens' homes, by directory, so a
 * new file there is covered without editing this test. Comments are stripped
 * first: docs may NAME the table; code may not TOUCH it.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/** The homes of every screen that shows a news monitor's stories. */
const STORY_SCREEN_DIRS = [
  "features/marketing/news-monitor",
  "features/marketing/monitor-setup",
  "components/mardown-display/blocks/news-monitor",
];
const STORY_SCREEN_FILES = [
  "features/marketing/front-doors/BrandScopedMonitoring.tsx",
  "features/marketing/front-doors/MonitoringFrontDoor.tsx",
  "features/marketing/components/backlinks/CoverageTab.tsx",
  "features/marketing/data/coverage-hooks.ts",
  "features/marketing/data/coverage-queries.ts",
  "features/content-ir/kinds/news-monitor.ts",
];

function walk(dir: string): string[] {
  const abs = join(ROOT, dir);
  return readdirSync(abs).flatMap((name) => {
    const path = join(abs, name);
    if (statSync(path).isDirectory()) return walk(relative(ROOT, path));
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [relative(ROOT, path)] : [];
  });
}

/** Remove // and /* *\/ comments (strings are left intact — a query lives in a string). */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Any code reference to the sighting table: `.from("news_item")`, an embedded select, an RPC arg. */
export const NEWS_ITEM_REFERENCE = /\bnews_items?\b/;

export function offenders(files: string[]): string[] {
  return files.filter((file) =>
    NEWS_ITEM_REFERENCE.test(stripComments(readFileSync(join(ROOT, file), "utf8"))),
  );
}

describe("story screens never read web.news_item", () => {
  const files = [...STORY_SCREEN_DIRS.flatMap(walk), ...STORY_SCREEN_FILES];

  it("covers the story screens (the census is not empty)", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files).toContain("features/marketing/news-monitor/data.ts");
  });

  it("finds no code reference to news_item in any story screen", () => {
    expect(offenders(files)).toEqual([]);
  });

  it("the detector catches a join and ignores a comment (self-test)", () => {
    expect(NEWS_ITEM_REFERENCE.test(stripComments('supabase.schema("web").from("news_item")'))).toBe(true);
    expect(NEWS_ITEM_REFERENCE.test(stripComments('.select("id, news_item(title)")'))).toBe(true);
    expect(NEWS_ITEM_REFERENCE.test(stripComments("// reads web.news_item? never"))).toBe(false);
    expect(NEWS_ITEM_REFERENCE.test(stripComments("/* web.news_item */ const x = 1;"))).toBe(false);
  });
});
