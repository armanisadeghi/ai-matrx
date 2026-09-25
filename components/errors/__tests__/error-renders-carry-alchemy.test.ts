/**
 * components/errors/__tests__/error-renders-carry-alchemy.test.ts
 *
 * EVERY ERROR ON SCREEN CARRIES THE ALCHEMY MENU (Arman, 2026-09-25: "the
 * errors don't have an 'Alchemy' icon… find all places that need it"). The
 * menu lives in the shared error primitives, so a render inherits it by USING
 * one of them:
 *
 *   - `ErrorNotice`            (components/errors/ErrorNotice.tsx) — inline cards
 *   - destructive `Alert`      (components/ui/alert.tsx) — automatic
 *   - route/section boundaries (ErrorBoundaryView, ErrorBoundaryWithCapture)
 *   - error toasts             (lib/toast.ts decorator, components/ui/toaster.tsx)
 *
 * A file that hand-renders its own error — its own `role="alert"` box, its own
 * "Something went wrong" / "Not saved" sentence — bypasses the menu. This guard
 * counts those bespoke renders per file across app/, components/, features/ and
 * lib/. The BASELINE is a census, not an exemption: a file may not gain a
 * bespoke render, a new file may not introduce one, and a file whose count
 * DROPS fails until its baseline entry is lowered — so the list only shrinks.
 *
 * Move a bespoke render onto `ErrorNotice` (or a destructive `Alert`), then
 * lower or delete its entry in `error-render-census.baseline.json`.
 */
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SCANNED_DIRS = ["app", "components", "features", "lib"];
const BASELINE_FILE = path.join(__dirname, "error-render-census.baseline.json");

/** The primitives themselves — they ARE the one place an error box is drawn. */
const PRIMITIVES = new Set([
  "components/errors/ErrorNotice.tsx",
  "components/errors/ErrorBoundaryView.tsx",
  "lib/error-boundary/ErrorBoundaryWithCapture.tsx",
]);

const BESPOKE_SHAPES: ReadonlyArray<{ kind: string; pattern: RegExp }> = [
  { kind: 'its own role="alert" box', pattern: /role=(?:"alert"|\{\s*["']alert["']\s*\})/g },
  { kind: 'a hand-written "Something went wrong"', pattern: /Something went wrong/g },
  // `title="Not saved"` handed to ErrorNotice is the primitive, not a bespoke render.
  { kind: 'a hand-written "Not saved"', pattern: /(?<!title=)[>"'`]\s*Not saved\b/g },
];

export function countBespokeErrorRenders(source: string): number {
  let n = 0;
  for (const { pattern } of BESPOKE_SHAPES) n += source.match(pattern)?.length ?? 0;
  return n;
}

function isScannable(rel: string): boolean {
  if (!/\.tsx$/.test(rel)) return false;
  if (PRIMITIVES.has(rel)) return false;
  return (
    !/(^|\/)(__tests__|__mocks__)(\/|$)/.test(rel) &&
    !/\.(test|spec)\.tsx$/.test(rel)
  );
}

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

function censusTheTree(): Record<string, number> {
  const files: string[] = [];
  for (const dir of SCANNED_DIRS) walk(path.join(REPO_ROOT, dir), files);
  const found: Record<string, number> = {};
  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
    if (!isScannable(rel)) continue;
    const n = countBespokeErrorRenders(fs.readFileSync(file, "utf8"));
    if (n > 0) found[rel] = n;
  }
  return found;
}

describe("the bespoke-error detector (self-test)", () => {
  it("counts every bespoke shape", () => {
    expect(countBespokeErrorRenders('<div role="alert">x</div>')).toBe(1);
    expect(countBespokeErrorRenders("<div role={'alert'}>x</div>")).toBe(1);
    expect(countBespokeErrorRenders("<h2>Something went wrong</h2>")).toBe(1);
    expect(countBespokeErrorRenders('<p className="x">Not saved</p>')).toBe(1);
  });
  it("does not count a render that uses the primitive", () => {
    expect(
      countBespokeErrorRenders('<ErrorNotice title="Not saved" message={e} />'),
    ).toBe(0);
    expect(countBespokeErrorRenders('<Alert variant="destructive">x</Alert>')).toBe(0);
  });
});

describe("every error render carries the Alchemy Menu", () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")) as {
    files: Record<string, number>;
  };
  const census = censusTheTree();

  if (process.env.ERROR_CENSUS_PRINT === "1") {
    // Prints the live census so a baseline entry can be LOWERED by hand.
    console.log(JSON.stringify(census, null, 2));
  }

  it("no file gained a bespoke error render, and no new file introduced one", () => {
    const grown = Object.entries(census)
      .filter(([file, n]) => n > (baseline.files[file] ?? 0))
      .map(
        ([file, n]) =>
          `${file}: ${n} bespoke error render(s), baseline ${baseline.files[file] ?? 0} — render it with <ErrorNotice> (components/errors/ErrorNotice.tsx) or a destructive <Alert> so it carries the Alchemy Menu`,
      );
    expect(grown).toEqual([]);
  });

  it("the baseline only shrinks — a file that moved onto the primitive lowers its entry", () => {
    const stale = Object.entries(baseline.files)
      .filter(([file, n]) => (census[file] ?? 0) < n)
      .map(
        ([file, n]) =>
          `${file}: baseline ${n}, now ${census[file] ?? 0} — lower its entry in error-render-census.baseline.json`,
      );
    expect(stale).toEqual([]);
  });
});
