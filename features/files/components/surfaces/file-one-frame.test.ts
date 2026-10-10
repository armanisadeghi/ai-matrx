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

// FILE_FRAME_ROOT: the planted-break proof points the guard at a scratch copy, never the real files.
const ROOT = process.env.FILE_FRAME_ROOT ?? join(__dirname, "../../../..");
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

it("every <FilePreview> host chooses its action bar out loud (no bare call)", () => {
  // A bare call silently takes "all" — the stacked-chrome bug when the host already shows actions.
  // The device console's own `./FilePreview` (SFTP sheet) is a different component.
  const bare: string[] = [];
  for (const f of files) {
    const src = readSafe(f);
    if (/devices\/console\//.test(f) || !/<FilePreview\b/.test(src)) continue;
    // JSX opening tags only: skip comments and prose (`<FilePreview>` inside docs / `<FilePreview/>`).
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const m of code.matchAll(/<FilePreview\b(?!>|\/>)([\s\S]*?)\/?>(?=[\s\S]|$)/g)) {
      // Props end at the first `>` not inside braces (arrow bodies `=>` sit inside braces).
      let depth = 0;
      let props = "";
      const start = (m.index ?? 0) + "<FilePreview".length;
      for (let i = start; i < code.length; i++) {
        const c = code[i];
        if (c === "{") depth++;
        else if (c === "}") depth--;
        else if (c === ">" && depth === 0 && code[i - 1] !== "=") break;
        props += c;
      }
      if (!/\bactionBar=/.test(props)) bare.push(`${relative(ROOT, f)}`);
    }
  }
  expect(bare).toEqual([]);
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

// ── The tab area folds itself, by its own width (2026-10-10) ────────────────

it("the tab area picks strip or menu by the row's measured width, by default", () => {
  const body = read(`${SURFACES}/FileTabsBody.tsx`);
  expect(body).toMatch(/tabs = "auto"/);
  // Measured on the row — a ResizeObserver, never a viewport breakpoint or the mobile hook.
  expect(body).toMatch(/new ResizeObserver\(/);
  const fit = body.slice(body.indexOf("export function useTabsFit"), body.indexOf("function FileTabMenu"));
  expect(fit).not.toMatch(/innerWidth|matchMedia|useIsMobile|window\.screen/);
  // The tab strip must not hide itself by a media-query class.
  const row = body.slice(body.indexOf('aria-label="File tabs"') - 200, body.indexOf('aria-label="File tabs"') + 100);
  expect(row).not.toMatch(/\b(sm|md|lg|xl|max-\w+):hidden/);
});

it("no host pins the tab area to the strip (every host inherits the auto fold)", () => {
  const offenders = files
    .filter((f) => /<FileTabsBody\b[^>]*\btabs="strip"/.test(readSafe(f)))
    .map((f) => relative(ROOT, f));
  expect(offenders).toEqual([]);
});

it("a floating window shows one close button: the window's own", () => {
  const win = read("features/window-panels/windows/cloud-files/FilePreviewWindow.tsx");
  expect(win).toMatch(/<PreviewPane\b[\s\S]*?closeButton=\{false\}/);
  expect(read(`${SURFACES}/PreviewPane.tsx`)).toMatch(/closeButton \? \(/);
});

it("the file page top bar is all transparent tap buttons (glass only floats)", () => {
  for (const rel of [`${SURFACES}/single-file/SingleFileTopBar.tsx`, `${SURFACES}/single-file/SingleFileActions.tsx`]) {
    const src = read(rel);
    // A bare glass-default tap button beside plain breadcrumbs is the dev-guard break.
    expect(src).not.toMatch(/<TapTargetButton\b/);
    for (const m of src.match(/<ChevronLeftTapButton\b[\s\S]*?\/>/g) ?? []) expect(m).toMatch(/variant="transparent"/);
    for (const m of src.match(/<PageCaptureButton\b[^>]*>/g) ?? []) expect(m).toMatch(/triggerVariant="transparent"/);
  }
});

it("a PDF on a Board tile shares the viewer's toolbar row", () => {
  expect(read(`${SURFACES}/single-file/SingleFileWorkspace.tsx`)).toMatch(/hostInPdfToolbar/);
  expect(read("features/files/components/core/FilePreview/PreviewerSwitch.tsx")).toMatch(/toolbarStart=\{hostToolbar\?\.start\}/);
});
