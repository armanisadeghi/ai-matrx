/**
 * One frame for a file, in every host (2026-10-09): the file is named once,
 * its actions appear once, and no row is stacked under the tabs.
 *
 * The class this guards: a host that already names the file and carries its
 * Copy link / Download / More (the file page's header, the /files side panel,
 * the preview window, a Board tile's header) wrapped a body that named it again
 * and stacked a second action bar under the tabs repeating Download and Copy
 * link — four rows of chrome and a 176px rail above a small Board tile image.
 *   - `FileTabsBody` puts the KIND's actions in its tab row; its `FilePreview`
 *     draws no action bar.
 *   - A host with its own file actions asks `FilePreview` for the kind's only.
 *   - The Board tile names the file in the tile header (`TitleField`) and uses
 *     the workspace's one-row `tile` layout.
 *   - ONE builder of preview actions (`usePreviewActions`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "../../../..");
const SCAN = ["app", "features", "components", "lib"];

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const path = join(dir, name);
    // Other writers share this checkout: a file can vanish between list and stat.
    let isDir: boolean;
    try {
      isDir = statSync(path).isDirectory();
    } catch {
      continue;
    }
    if (isDir) sources(path, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const files = SCAN.flatMap((d) => sources(join(ROOT, d)));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const readSafe = (abs: string) => {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return "";
  }
};

const SURFACES = "features/files/components/surfaces";

it("the tabbed body's preview draws no action bar of its own", () => {
  const body = read(`${SURFACES}/FileTabsBody.tsx`);
  const previews = body.match(/<FilePreview\b[^>]*>/g) ?? [];
  expect(previews.length).toBe(1);
  expect(previews[0]).toMatch(/actionBar="none"/);
  // The kind's actions sit inside the tab row, never as a bar under it.
  const bars = body.match(/<PreviewerActionBar\b[\s\S]*?\/>/g) ?? [];
  expect(bars.length).toBe(1);
  expect(bars[0]).toMatch(/variant="inline"/);
});

it("a host with its own file actions asks the preview for the kind's only", () => {
  const mobile = read(`${SURFACES}/MobileStack.tsx`);
  const previews = mobile.match(/<FilePreview\b[^>]*>/g) ?? [];
  expect(previews.length).toBeGreaterThan(0);
  for (const p of previews) expect(p).toMatch(/actionBar="kind"/);
});

it("the Board file tile names the file once and uses the one-row layout", () => {
  const items = read("features/board/items/work-items.tsx");
  expect(items).toMatch(/<SingleFileWorkspace layout="tile"/);
  const fileType = items.slice(items.indexOf('key: "file"'));
  expect(fileType).toMatch(/TitleField: FileTileTitle/);
  // The tile workspace never names the file: that is the host header's.
  expect(read(`${SURFACES}/single-file/SingleFileWorkspace.tsx`)).not.toMatch(/SingleFileNameLabel/);
});

it("no host still asks for the retired stacked toolbar", () => {
  const offenders = files
    .filter((f) => /<SingleFileWorkspace\b[^>]*\btoolbar\b/.test(readSafe(f)))
    .map((f) => relative(ROOT, f));
  expect(offenders).toEqual([]);
});

it("one builder of preview actions", () => {
  const builders = files
    .filter((f) => /\bbuildPreviewActions\(/.test(readSafe(f)))
    .map((f) => relative(ROOT, f))
    .filter((f) => !f.endsWith("preview-actions.ts"));
  expect(builders).toEqual(["features/files/components/core/FilePreview/usePreviewActions.ts"]);
});
