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
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findOrphanMenus, uncarriedErrorDisplays } from "./error-display-census";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SCANNED_DIRS = ["app", "components", "features", "lib"];
const BASELINE_FILE = path.join(__dirname, "error-render-census.baseline.json");

/**
 * THE CEILING. The census reached zero; the baseline may never hold more than
 * this many uncarried displays. A sweep that "fixes" the guard by adding a
 * baseline entry fails here — raising this number is an edit to this test, in
 * review, never a quiet JSON change (RC-B12 round 3: three entries arrived by
 * baseline edits instead of menus).
 */
const MAX_BASELINE_TOTAL = 0;

/** The primitives themselves — they ARE the one place an error box is drawn. */
const PRIMITIVES = new Set([
  "components/errors/ErrorNotice.tsx",
  "components/errors/ErrorAlchemyMenu.tsx",
  // The package error slot and the toast decorator render only for an error.
  "components/errors/PackageErrorActions.tsx",
  "components/errors/errorToastAlchemy.tsx",
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
    expect(count('<div className="flex"><h2>Something went wrong</h2><ErrorAlchemyMenu input={i} /></div>')).toBe(0);
    // …but an ErrorNotice beside a raw box is not the box's menu (F9).
    expect(count('<div><ErrorNotice message="x" /><p role="alert">{error}</p></div>')).toBe(1);
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

describe("round-2 holes (RC-B12 verify R2-1), red then green", () => {
  it("red or rose text rendering a message-like value counts", () => {
    expect(count('<p className="text-red-600">{msg}</p>')).toBe(1);
    expect(count('<span className="text-rose-600">{problem}</span>')).toBe(1);
    expect(count('<p className="text-destructive">{load.message}</p>')).toBe(1);
  });
  it("any red/rose/amber render inside an error branch counts", () => {
    expect(count('{load.status === "error" ? <p className="text-xs text-destructive">{load.detail}</p> : null}')).toBe(1);
    expect(count('{failed && <span className="text-amber-700">{text}</span>}')).toBe(1);
  });
  it("more failure phrasings count in any colour", () => {
    expect(count('<p className="text-sm">Unable to load your projects.</p>')).toBe(1);
    expect(count("<p>Error loading data</p>")).toBe(1);
    expect(count('<span className="text-xs">Save failed — {err}</span>')).toBe(1);
  });
  it("an inline red colour counts", () => {
    expect(count('<p style={{ color: "red" }}>{error}</p>')).toBe(1);
  });
  it("a row that is red only under a condition is not the error box (its menu would show on every row)", () => {
    expect(
      count('<div className={cn("group", error && "bg-destructive/10")}><span>{key}</span>{error && <div className="text-destructive">{error.message}</div>}<ErrorAlchemyMenu /></div>'),
    ).toBe(1);
    expect(
      count('<div className={cn("group", error && "bg-destructive/10")}><span>{key}</span>{error && <div className="text-destructive">{error.message}<ErrorAlchemyMenu /></div>}</div>'),
    ).toBe(0);
  });
  it("a hidden menu does not carry", () => {
    expect(count('<p role="alert">{error}<ErrorAlchemyMenu className="hidden" /></p>')).toBe(1);
  });
  it("red text that is not an error still does not count", () => {
    expect(count('<span className="text-destructive">{count} overdue</span>')).toBe(0);
    expect(count('<span className="text-red-600">{formatMoney(total)}</span>')).toBe(0);
  });
});

describe("round-3 probes (RC-B12 verify R3-1), red then green", () => {
  it("one destructive card with plain wrappers inside is one box, carried by one menu", () => {
    expect(
      count('<div className="bg-destructive/10"><div className="flex"><div><p className="text-destructive">Template Error</p><p className="text-destructive/80">Failed to compile.</p></div></div><ErrorAlchemyMenu /></div>'),
    ).toBe(0);
  });
  it("'Template Error' / 'Failed to compile' in a destructive box counts", () => {
    expect(
      count('<div className="rounded bg-destructive/10 p-4"><h3>Template Error</h3><p>Failed to compile the {mode} template.</p></div>'),
    ).toBe(1);
  });
  it("red {reason}, orange {error} and red 'Error: {detail}' count", () => {
    expect(count('<p className="text-red-600">{reason}</p>')).toBe(1);
    expect(count('<p className="text-orange-600">{error}</p>')).toBe(1);
    expect(count('<span className="text-destructive">Error: {detail}</span>')).toBe(1);
  });
  it("'Permission denied' and 'Request timed out' in red count", () => {
    expect(count('<p className="text-destructive">Permission denied</p>')).toBe(1);
    expect(count('<p className="text-red-500">Request timed out</p>')).toBe(1);
  });
  it("an error's id or digest line is a reference, not a second error display", () => {
    expect(count('{error.digest && <p className="text-xs">Error ID: {error.digest}</p>}')).toBe(0);
  });
  it("an uncoloured {state.message} inside an error branch counts", () => {
    expect(count('{state.status === "error" ? <p className="text-sm">{state.message}</p> : null}')).toBe(1);
  });
  it("an opacity-0 menu does not carry, unless it is revealed on hover", () => {
    expect(count('<p role="alert">{error}<ErrorAlchemyMenu className="opacity-0" /></p>')).toBe(1);
    expect(count('<p role="alert">{error}<ErrorAlchemyMenu className="opacity-0 group-hover:opacity-100" /></p>')).toBe(0);
  });
});

describe("a menu never shows when nothing failed", () => {
  const orphans = (jsx: string) =>
    findOrphanMenus(`export function C({ error }: any) { return (<>${jsx}</>); }`).length;
  it("self-test: a bare menu on a healthy row is an orphan; inside a box or branch it is not", () => {
    expect(orphans('<div className={cn("row", error && "bg-destructive/10")}><span>k</span><ErrorAlchemyMenu /></div>')).toBe(1);
    expect(orphans('<p className="text-destructive">{error}<ErrorAlchemyMenu /></p>')).toBe(0);
    expect(orphans('{error && <p className="text-sm">{error}<ErrorAlchemyMenu /></p>}')).toBe(0);
    expect(orphans('<ErrorAlchemyMenu input={{ message: "x" }} />')).toBe(0);
  });

  it("no file has an orphan menu", () => {
    const files: string[] = [];
    for (const dir of SCANNED_DIRS) walk(path.join(REPO_ROOT, dir), files);
    const found: string[] = [];
    for (const file of files) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
      if (!isScannable(rel)) continue;
      const source = fs.readFileSync(file, "utf8");
      if (!source.includes("ErrorAlchemyMenu")) continue;
      for (const line of findOrphanMenus(source, rel)) found.push(`${rel}:${line}`);
    }
    if (process.env.ERROR_CENSUS_PRINT === "1") console.log("ORPHANS " + JSON.stringify(found));
    expect(found).toEqual([]);
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

  it("the baseline never exceeds its ceiling, and never grows against the last commit", () => {
    const total = Object.values(baseline.files).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(MAX_BASELINE_TOTAL);
    let committed: { files: Record<string, number> } | null = null;
    try {
      const rel = path.relative(REPO_ROOT, BASELINE_FILE).split(path.sep).join("/");
      committed = JSON.parse(
        execSync(`git show HEAD:${rel}`, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
      );
    } catch {
      committed = null; // no git (a tarball, a sandbox): the ceiling above still holds
    }
    if (committed) {
      const grown = Object.entries(baseline.files)
        .filter(([file, n]) => n > (committed!.files[file] ?? 0))
        .map(([file, n]) => `${file}: baseline raised to ${n} (committed ${committed!.files[file] ?? 0}) — add the menu instead`);
      expect(grown).toEqual([]);
    }
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
