/**
 * components/errors/__tests__/error-renders-carry-alchemy.test.ts
 *
 * EVERY ERROR ON SCREEN CARRIES THE ALCHEMY MENU (Arman, 2026-09-25: "the
 * errors don't have an 'Alchemy' icon… find all places that need it").
 *
 * What an error display IS — semantic, per element, parsed from the JSX — lives
 * in `error-display-census.ts`: role="alert" boxes of any colour, red-styled
 * elements rendering an error value or a failure sentence, failure sentences in
 * any colour, and amber / role="status" notices rendering an error value. Each
 * one must carry the menu IN ITS OWN BOX (or sit inside a primitive that draws
 * it: ErrorNotice, ErrorBox, a destructive Alert, ErrorBoundaryView). A carrier
 * elsewhere in the file never excuses a box (RC-B12 verify F9).
 *
 * The BASELINE (`error-render-census.baseline.json`) counts uncarried displays
 * per file. It is a census, not an exemption: a file may not gain one, a new
 * file may not introduce one, and a file whose count drops fails until its
 * entry is lowered — the list only shrinks.
 */
import fs from "node:fs";
import path from "node:path";
import { uncarriedErrorDisplays } from "./error-display-census";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SCANNED_DIRS = ["app", "components", "features", "lib"];
const BASELINE_FILE = path.join(__dirname, "error-render-census.baseline.json");

/** The primitives themselves — they ARE the one place an error box is drawn. */
const PRIMITIVES = new Set([
  "components/errors/ErrorNotice.tsx",
  "components/errors/ErrorAlchemyMenu.tsx",
  "components/errors/ErrorBoundaryView.tsx",
  "lib/error-boundary/ErrorBoundaryWithCapture.tsx",
]);

/**
 * Bundles that cannot import host code: the kind sandbox runtime runs inside
 * an isolated iframe and relays its render error to the host, whose boundary
 * carries the menu.
 */
const ISOLATED_BUNDLES = [/^features\/content-ir\/sandbox\/runtime\//];

function isScannable(rel: string): boolean {
  if (!/\.tsx$/.test(rel)) return false;
  if (PRIMITIVES.has(rel)) return false;
  if (ISOLATED_BUNDLES.some((pattern) => pattern.test(rel))) return false;
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

export function censusTheTree(): Record<string, number> {
  const files: string[] = [];
  for (const dir of SCANNED_DIRS) walk(path.join(REPO_ROOT, dir), files);
  const found: Record<string, number> = {};
  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
    if (!isScannable(rel)) continue;
    const n = uncarriedErrorDisplays(fs.readFileSync(file, "utf8"), rel).length;
    if (n > 0) found[rel] = n;
  }
  return found;
}

const count = (jsx: string) =>
  uncarriedErrorDisplays(`export function C({ error, e }: any) { return (<>${jsx}</>); }`).length;

describe("the error-display detector (self-test — each RC-B12 verify hole, red then green)", () => {
  it("probe A: a bare role=alert box counts", () => {
    expect(count('<div role="alert" className="text-destructive">{error}</div>')).toBe(1);
  });
  it("probe B: a carrier elsewhere in the file never cancels an unrelated box", () => {
    expect(
      count('<ErrorNotice message="x" /><div role="alert" className="text-destructive">{error}</div>'),
    ).toBe(1);
  });
  it("probe C: red text rendering an error without role=alert counts", () => {
    expect(count('<p className="text-destructive">Failed to save: {error}</p>')).toBe(1);
  });
  it("probe D: a grey role=alert box counts", () => {
    expect(count('<div role="alert" className="text-muted-foreground">{error}</div>')).toBe(1);
  });
  it("a failure sentence counts in any colour, and an amber status notice rendering an error counts", () => {
    expect(count("<h2>Something went wrong</h2>")).toBe(1);
    expect(count("<p>We couldn't load this note.</p>")).toBe(1);
    expect(count('<div role="status" className="text-amber-700">{error.message}</div>')).toBe(1);
  });
  it("one box with a title and a message counts once", () => {
    expect(
      count('<div role="alert" className="border-destructive"><p className="text-destructive">Could not save</p><p>{error}</p></div>'),
    ).toBe(1);
  });
  it("does not count a box that carries the menu, or a render inside a primitive", () => {
    expect(count('<div role="alert">{error}<ErrorAlchemyMenu error={error} /></div>')).toBe(0);
    expect(count('<ErrorNotice title="Not saved" message={error} />')).toBe(0);
    expect(count('<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>')).toBe(0);
    expect(count('<ErrorNotice title="t"><p className="text-destructive">{error}</p></ErrorNotice>')).toBe(0);
  });
  it("does not count red text that is not an error, or error words in comments and props", () => {
    expect(count('<span className="text-destructive">*</span>')).toBe(0);
    expect(count('<Button variant="destructive">Delete</Button>')).toBe(0);
    expect(count("<Badge>Not published</Badge>")).toBe(0);
    expect(count('{/* role="alert" used to live here */}<p>ok</p>')).toBe(0);
  });
});

describe("every error render carries the Alchemy Menu", () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")) as {
    files: Record<string, number>;
  };
  const census = censusTheTree();

  if (process.env.ERROR_CENSUS_PRINT === "1") {
    console.log(JSON.stringify(census, null, 2));
  }

  it("no file gained an error display without the menu, and no new file introduced one", () => {
    const grown = Object.entries(census)
      .filter(([file, n]) => n > (baseline.files[file] ?? 0))
      .map(
        ([file, n]) =>
          `${file}: ${n} error display(s) without the Alchemy Menu, baseline ${baseline.files[file] ?? 0} — render it with <ErrorNotice error={…}> or put <ErrorAlchemyMenu error={…} /> inside the box`,
      );
    expect(grown).toEqual([]);
  });

  it("the baseline only shrinks — a fixed file lowers its entry", () => {
    const stale = Object.entries(baseline.files)
      .filter(([file, n]) => (census[file] ?? 0) < n)
      .map(
        ([file, n]) =>
          `${file}: baseline ${n}, now ${census[file] ?? 0} — lower its entry in error-render-census.baseline.json`,
      );
    expect(stale).toEqual([]);
  });
});
