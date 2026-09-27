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
import { buildCarryingResolver } from "./error-census-carriers";
import {
  findDoubleMenus,
  findDoubledStops,
  findUngatedEmptyStates,
  findUngatedEmptyStateProps,
  findUngatedCounts,
  findSoftFailureToasts,
  findOrphanMenus,
  carriersFromFacts,
  componentFacts,
  isCensusScannable,
  setCarryingComponentsResolver,
  uncarriedErrorDisplays,
} from "./error-display-census";

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

/** Which files the census reads: one definition, shared with the lint rule. */
const isScannable = isCensusScannable;

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
  const rels = files.map((file) => path.relative(REPO_ROOT, file).split(path.sep).join("/"));
  setCarryingComponentsResolver(buildCarryingResolver(REPO_ROOT, rels.filter((rel) => /\.tsx$/.test(rel)), { componentFacts, carriersFromFacts }));
  const found: Record<string, number> = {};
  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
    if (!isScannable(rel)) continue;
    const n = uncarriedErrorDisplays(fs.readFileSync(file, "utf8"), rel).length;
    if (n > 0) found[rel] = n;
  }
  setCarryingComponentsResolver(null);
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

describe("round-4 probes (RC-B12 verify, theoretical shapes), red then green", () => {
  it("a zero-size menu, or a menu inside a hidden element of the box, does not carry", () => {
    expect(count('<p role="alert">{error}<ErrorAlchemyMenu className="w-0 h-0 overflow-hidden" /></p>')).toBe(1);
    expect(count('<p role="alert">{error}<ErrorAlchemyMenu className="size-0" /></p>')).toBe(1);
    expect(count('<div role="alert">{error}<span className="hidden"><ErrorAlchemyMenu /></span></div>')).toBe(1);
    expect(count('<div role="alert">{error}<span className="hidden sm:inline"><ErrorAlchemyMenu /></span></div>')).toBe(0);
  });
  it("pink or fuchsia text rendering an error counts", () => {
    expect(count('<p className="text-pink-600">{error}</p>')).toBe(1);
    expect(count('<p className="text-fuchsia-500">{error}</p>')).toBe(1);
  });
  it("a destructive Badge rendering an error counts", () => {
    expect(count('<Badge variant="destructive">{error}</Badge>')).toBe(1);
    expect(count('<Badge variant="destructive">Archived</Badge>')).toBe(0);
  });
  it("'Oops! That didn't work.' counts in any colour", () => {
    expect(count("<p>Oops! That didn't work.</p>")).toBe(1);
  });
  it("a destructive card with three plain wrappers is one box: a title line and a message line share one menu", () => {
    expect(
      count('<Card className="border-destructive"><CardContent><div className="flex"><div><p className="text-destructive">{error.type}</p><p className="text-destructive/80">{error.message}<ErrorAlchemyMenu /></p></div></div></CardContent></Card>'),
    ).toBe(0);
  });
  it("a menu beside a role=alert box does not carry it; beside a heading it does", () => {
    expect(count('<div><div role="alert">{error}</div><ErrorAlchemyMenu /></div>')).toBe(1);
    expect(count('<div><h2>Something went wrong</h2><ErrorAlchemyMenu /></div>')).toBe(0);
  });
});

describe("round-5 probes (RC-B12 verify), red then green", () => {
  it("an error fed by prop into a neutral component counts (EmptyCatalogue, EmptyState)", () => {
    expect(count("{error ? <EmptyCatalogue message={`Could not load skills: ${error}`} /> : null}")).toBe(1);
    expect(count("<EmptyState title=\"Nothing here\" description={error} />")).toBe(1);
    expect(count("<EmptyState title={error.message} />")).toBe(1);
    expect(count('<EmptyState title="No skills" description="Add one to start." />')).toBe(0);
    expect(count("<ErrorNotice message={error} />")).toBe(0);
  });
  it("an error constant rendered as text counts, in any component", () => {
    expect(count("<div><h3>{ORGANIZATION_UNAVAILABLE_TITLE}</h3><p>{ORGANIZATION_UNAVAILABLE_DESCRIPTION}</p></div>")).toBeGreaterThan(0);
    expect(count("<Notice title={LOAD_ERROR_TITLE} />")).toBe(1);
  });
  it("a scale-0, display:none or {false && …} menu is absent", () => {
    expect(count('<p role="alert">{error}<ErrorAlchemyMenu className="scale-0" /></p>')).toBe(1);
    expect(count('<p role="alert">{error}<span style={{ display: "none" }}><ErrorAlchemyMenu /></span></p>')).toBe(1);
    expect(count('<p role="alert">{error}{false && <ErrorAlchemyMenu />}</p>')).toBe(1);
  });
  it("'This page crashed' and 'The server refused the request' count in any colour", () => {
    expect(count("<p>This page crashed.</p>")).toBe(1);
    expect(count("<p>The server refused the request.</p>")).toBe(1);
  });
});

describe("facts about errors are not errors (UI audit C)", () => {
  it("an error count or an error-type badge is a label, not a display to copy", () => {
    expect(count('<span className="text-red-500">{r.error_count}</span>')).toBe(0);
    expect(count('{r.error_count > 0 ? <span className="text-red-500">{r.error_count}</span> : null}')).toBe(0);
    expect(count('<Badge variant="destructive">{r.error_type}</Badge>')).toBe(0);
    expect(count('<Badge variant="outline">{kept ? "Saved" : "Not saved"}</Badge>')).toBe(0);
    expect(count('{run.verdict === "fail" ? <Badge className="text-destructive">fail</Badge> : null}')).toBe(0);
    expect(count('{error ? <Badge className="text-destructive">{error}</Badge> : null}')).toBe(1);
    expect(count('<span className="text-red-500">{r.error}</span>')).toBe(1);
  });
});

describe("round-6 probes (RC-B12 verify), red then green", () => {
  const file = (body: string) =>
    uncarriedErrorDisplays(`import { FormMessage } from "@/components/ui/form";\n${body}`).length;
  it("a form-message component rendered anywhere is a field-error display unless it draws the menu", () => {
    expect(count("<FormItem><FormControl><Input /></FormControl><FormMessage /></FormItem>")).toBe(1);
    expect(count("<FieldError>{errors.name?.message}</FieldError>")).toBe(1);
    expect(count("<FormMessage><ErrorAlchemyMenu /></FormMessage>")).toBe(0);
  });
  it("red text rendering a local derived from an error counts (FormMessage's own body)", () => {
    expect(
      file(`export function M({ error, children }: any) { const body = error ? String(error.message) : children; return <p className="text-destructive">{body}</p>; }`),
    ).toBe(1);
  });
  it("a menu inside a hidden parent, {0 && menu} and {true ? null : menu} are absent", () => {
    expect(count('<p role="alert">{error}<span className="hidden"><ErrorAlchemyMenu /></span></p>')).toBe(1);
    expect(count('<div role="alert">{error}<div className="hidden"><span><ErrorAlchemyMenu /></span></div></div>')).toBe(1);
    expect(count('<p role="alert">{error}{0 && <ErrorAlchemyMenu />}</p>')).toBe(1);
    expect(count('<p role="alert">{error}{true ? null : <ErrorAlchemyMenu />}</p>')).toBe(1);
    expect(count('<p role="alert">{error}{false ? null : <ErrorAlchemyMenu />}</p>')).toBe(0);
  });
  it("an error passed through a props spread into a neutral component counts", () => {
    expect(count("<EmptyState {...{ title: \"Could not load\", description: error }} />")).toBe(1);
    expect(count("<EmptyState {...{ description: error.message }} />")).toBe(1);
    expect(count("<EmptyState {...rest} />")).toBe(0);
  });
  it("a tooltip-only error (title={error}) counts: an error you can only hover is not shown", () => {
    expect(count('<span className="text-muted-foreground" title={error}>Failed</span>')).toBe(1);
    expect(count('<Pill title={failureReason}>{status}</Pill>')).toBe(1);
    expect(count('<span title={error}>Failed <ErrorAlchemyMenu error={error} /></span>')).toBe(0);
    expect(count('<span className="text-muted-foreground" title={why}>Skipped</span>')).toBe(0);
  });
});

describe("round-7 probes (RC-B12 verify): lists of reasons are errors", () => {
  it("red text rendering reasons / issues / failures / errors — plain, .join(...) or .map(...) — counts", () => {
    expect(count('<span className="text-destructive">The check needs repair: {row.brokenReasons.join(" · ")}</span>')).toBe(1);
    expect(count('<p className="text-red-600">{issues.join(", ")}</p>')).toBe(1);
    expect(count('<ul className="text-destructive">{failures.map((f) => <li key={f}>{f}</li>)}</ul>')).toBe(1);
    expect(count('<p className="text-destructive">{validationErrors.join("; ")}</p>')).toBe(1);
    expect(count('<span className="text-destructive">{row.brokenReasons.join(" · ")}<ErrorAlchemyMenu /></span>')).toBe(0);
    expect(count('<p className="text-muted-foreground">{tags.join(", ")}</p>')).toBe(0);
  });
});

describe("round-8 probes (RC-B12 verify): JSX entities are decoded before matching", () => {
  it("'Couldn&apos;t load' counts exactly like 'could not load'", () => {
    expect(count("<p>Could not load this map.</p>")).toBe(1);
    expect(count("<p>Couldn&apos;t load this map.</p>")).toBe(1);
    expect(count("<p>Couldn&rsquo;t load this map.</p>")).toBe(1);
    expect(count("<p>Couldn&#39;t save the deal.</p>")).toBe(1);
    expect(count("<p>Couldn&#x27;t open this page</p>")).toBe(1);
    expect(count("<p>We couldn&apos;t find anything &mdash; try another search.</p>")).toBe(1);
    expect(count('<PageHeader title="Couldn&apos;t open this page" />')).toBe(1);
    expect(count("<span>This deal couldn&apos;t be refreshed just now.</span>")).toBe(1);
    expect(count("<p>This mind map couldn&apos;t be rendered — try regenerating it.</p>")).toBe(1);
  });
});

describe("a message value is never followed by its own full stop (RC-B12 round 9)", () => {
  const stops = (jsx: string) =>
    findDoubledStops(`export function C({ error, message, reason, gate }: any) { return (<>${jsx}</>); }`).length;
  it("self-test: `{error}. ` counts; asClause(error), an ellipsis and a non-message value do not", () => {
    expect(stops("<span>It could not be read: {error}. Dropping a file still works.</span>")).toBe(1);
    expect(stops("<p>{gate.listError}. Printing is still available.</p>")).toBe(1);
    expect(stops("<p>Refused: {reason}.</p>")).toBe(1);
    expect(stops("<span>It could not be read: {asClause(error)}. Dropping a file still works.</span>")).toBe(0);
    expect(stops("<p>{message}... and more</p>")).toBe(0);
    expect(stops("<p>{count}. items</p>")).toBe(0);
  });
  it("no file joins a message and a full stop", () => {
    const files: string[] = [];
    for (const dir of SCANNED_DIRS) walk(path.join(REPO_ROOT, dir), files);
    const found: string[] = [];
    for (const file of files) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
      if (!isScannable(rel)) continue;
      for (const line of findDoubledStops(fs.readFileSync(file, "utf8"), rel)) found.push(`${rel}:${line}`);
    }
    if (process.env.ERROR_CENSUS_PRINT === "1") console.log("DOUBLED_STOPS " + JSON.stringify(found));
    expect(found).toEqual([]);
  });
});

describe("round-10 probes (RC-B12 verify): the verifier's missed phrases", () => {
  it.each([
    "We weren&apos;t able to reach the server.",
    "We wasn't able to open it.",
    "Your note didn&apos;t save.",
    "Failed to sync your calendar.",
    "Something broke while loading this view.",
    "The service is busy — try again later.",
  ])("counts: %s", (sentence) => {
    expect(count(`<p>${sentence}</p>`)).toBe(1);
  });
});

describe("an empty view is an answer only after a read that succeeded (RC-B12 round 11)", () => {
  const ungated = (body: string) => findUngatedEmptyStates(`export function C(p: any) { ${body} }`).length;
  it("self-test: an empty view under a loading check with no failure check is refused", () => {
    // Quick Tasks before the fix: the failed read said "No tasks found".
    expect(ungated("const { tasks, isLoading } = p; return isLoading ? <Spinner /> : tasks.length === 0 ? <p>No tasks found.</p> : <List />;")).toBe(1);
    // The Vault before the fix: the error banner above, then "Your vault is empty" below it.
    expect(ungated("const vault = p.vault; return <>{vault.error && <Banner />}{vault.loading ? <Skeleton /> : items.length === 0 ? <VaultEmptyState /> : <List />}</>;")).toBe(1);
    expect(ungated("const { tasks, isLoading, isError } = p; return isLoading ? <Spinner /> : isError ? <ReadFailure error /> : tasks.length === 0 ? <p>No tasks found.</p> : <List />;")).toBe(0);
    expect(ungated("const { tasks, isLoading, error } = p; if (error) return <ReadFailure error={error} />; return isLoading ? <Spinner /> : tasks.length === 0 ? <p>No tasks yet</p> : <List />;")).toBe(0);
    expect(ungated("const q = p.q; return <ReadGate status={readStatusOf(q)} isEmpty={!q.rows.length} empty={<p>No rows yet</p>}><List /></ReadGate>;")).toBe(0);
    // Not a read-backed view: a search with no matches.
    expect(ungated("return p.matches.length === 0 ? <p>No matches found</p> : <List />;")).toBe(0);
  });

  it("self-test: a view that reads data but never checks loading is still a candidate (the Projects window)", () => {
    // The shape the old census missed: rows from a read hook, no loading check,
    // "No projects found" over a failed read.
    const projectsShaped = (gate: string) =>
      ungated(
        `const { flatProjects, isError, error } = useNavTree();\n  const active = flatProjects.filter((x) => x.org_id === p.org);\n  return (<div>{p.org ? (${gate}active.length > 0 ? active.map((x) => <Row key={x.id} />) : <p>No projects found</p>) : <p>Pick one</p>}</div>);`,
      );
    expect(projectsShaped("")).toBe(1);
    expect(projectsShaped("isError && active.length === 0 ? <ReadFailure error={error} /> : ")).toBe(0);
    // Local UI state is not a read: its empty copy is not a candidate.
    expect(ungated("const [draft, setDraft] = useState<string[]>([]);\n  return draft.length === 0 ? <p>No tags yet</p> : <List />;")).toBe(0);
  });

  it("self-test: stale-while-error (rows kept + StaleDataNotice) is gated; hiding rows is not required", () => {
    expect(
      ungated(
        `const { rows, isLoading, error, retry } = p.q;\n  return isLoading && rows.length === 0 ? <Spinner /> : error && rows.length === 0 ? <ReadFailure error={error} onRetry={retry} /> : rows.length === 0 ? <p>No rows yet</p> : <>{error ? <StaleDataNotice hasData what="rows" onRetry={retry} /> : null}<List rows={rows} /></>;`,
      ),
    ).toBe(0);
  });

  it("self-test: an exemption needs a reason on the view itself — a bare marker exempts nothing", () => {
    const view = (comment: string) =>
      ungated(`const { rows, isLoading } = p.q;\n  return isLoading ? <Spinner /> : rows.length === 0 ? (\n    ${comment}\n    <p>No rows yet</p>\n  ) : <List />;`);
    expect(view("")).toBe(1);
    expect(view("// read-gate-exempt:")).toBe(1);
    expect(view("// read-gate-exempt: static")).toBe(1);
    expect(view("// read-gate-exempt: rows come from the parent's props, which own the read and its failure")).toBe(0);
    // The marker far above the view does not reach it.
    expect(ungated(`// read-gate-exempt: rows come from the parent's props, which own the read\n\n\n\n\n const { rows, isLoading } = p.q;\n  return isLoading ? <Spinner /> : rows.length === 0 ? <p>No rows yet</p> : <List />;`)).toBe(1);
  });

  /**
   * THE BURN-DOWN. Every read-backed empty view that is not gated on the
   * read's outcome, per file — the hand-written views (round 11), every
   * `emptyState=` handed to a list/table primitive without `read=` (round 13),
   * and every count rendered from a read with no failure check (round 13).
   * Shrink-only: a file may not gain one, a new file may not introduce one, a
   * fixed file lowers its entry. The lint rule flags each one in the editor.
   */
  it("no file gained an ungated empty view, emptyState prop, or count — and the burn-down only shrinks", () => {
    const baseline = JSON.parse(
      fs.readFileSync(path.join(__dirname, "empty-state-gate.baseline.json"), "utf8"),
    ) as Record<"emptyViews" | "emptyStateProps" | "counts", Record<string, number>>;
    const files: string[] = [];
    for (const dir of SCANNED_DIRS) walk(path.join(REPO_ROOT, dir), files);
    const finders = {
      emptyViews: findUngatedEmptyStates,
      emptyStateProps: findUngatedEmptyStateProps,
      counts: findUngatedCounts,
    } as const;
    const report: Record<string, { grew: Array<[string, number]>; shrank: Array<[string, number]> }> = {};
    for (const [kind, find] of Object.entries(finders) as Array<[keyof typeof finders, (source: string, fileName: string) => number[]]>) {
      const expected = baseline[kind] ?? {};
      const found: Record<string, number> = {};
      for (const file of files) {
        const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
        if (!isScannable(rel)) continue;
        const n = find(fs.readFileSync(file, "utf8"), rel).length;
        if (n > 0) found[rel] = n;
      }
      report[kind] = {
        grew: Object.entries(found).filter(([rel, n]) => n > (expected[rel] ?? 0)),
        shrank: Object.entries(expected).filter(([rel, n]) => (found[rel] ?? 0) < n),
      };
    }
    if (process.env.ERROR_CENSUS_PRINT === "1") console.log("UNGATED_EMPTY " + JSON.stringify(report));
    expect(report).toEqual({
      emptyViews: { grew: [], shrank: [] },
      emptyStateProps: { grew: [], shrank: [] },
      counts: { grew: [], shrank: [] },
    });
  });
});

describe("a list primitive's emptyState waits for its read (RC-B12 round 13)", () => {
  const props = (body: string) => findUngatedEmptyStateProps(`export function C(p: any) { ${body} }`).length;
  it("self-test: emptyState over read-backed rows without read= is refused", () => {
    // The shape: a query's loading flag reaches the table, its failure never does.
    expect(props('const q = useTasks(); return <MatrxDataTable data={q.rows} isLoading={q.isLoading} emptyState={{ title: "No tasks yet" }} />;')).toBe(1);
    // Rows from a read hook, no loading input at all.
    expect(props('const { rows } = useTasks(); return <TopicTree rows={rows} emptyState="Nothing here yet" />;')).toBe(1);
    // The fix: the read's outcome travels with the empty state.
    expect(props('const q = useTasks(); return <MatrxDataTable data={q.rows} isLoading={q.isLoading} read={readOf(q, { what: "your tasks" })} emptyState={{ title: "No tasks yet" }} />;')).toBe(0);
    // Gated above: the failure returns first.
    expect(props('const q = useTasks(); if (q.error) return <ReadFailure error={q.error} />; return <MatrxDataTable data={q.rows} isLoading={q.isLoading} emptyState={{ title: "No tasks yet" }} />;')).toBe(0);
    expect(props('const q = useTasks(); return q.isError ? <ReadFailure error={q.error} /> : <MatrxDataTable data={q.rows} isLoading={q.isLoading} emptyState={{ title: "No tasks yet" }} />;')).toBe(0);
  });
  it("self-test: rows that are a pure local value are not a read", () => {
    expect(props('return <MatrxDataTable data={p.rows} emptyState={{ title: "No rows" }} />;')).toBe(0);
    expect(props('const [draft] = useState<string[]>([]); return <TagList items={draft} emptyState="No tags yet" />;')).toBe(0);
    expect(props('const rows = useMemo(() => p.rows.filter(Boolean), [p.rows]); return <MatrxDataTable data={rows} emptyState={{ title: "No rows" }} />;')).toBe(0);
  });
  it("self-test: an exemption needs its reason on the element", () => {
    const view = (comment: string) =>
      props(`const q = useTasks();
  return (
    ${comment}
    <MatrxDataTable data={q.rows} isLoading={q.isLoading} emptyState={{ title: "No tasks yet" }} />
  );`);
    expect(view("")).toBe(1);
    expect(view("// read-gate-exempt:")).toBe(1);
    expect(view("// read-gate-exempt: the page's failure slot above answers a failed read, once")).toBe(0);
  });
});

describe("a count from a failed read is a lie too (RC-B12 round 13)", () => {
  const counts = (body: string) => findUngatedCounts(`export function C(p: any) { ${body} }`).length;
  it("self-test: a count rendered from read data with no failure check is refused", () => {
    expect(counts("const { rows, isLoading } = useRateLimits(); return <p>{rows.length} rate limits</p>;")).toBe(1);
    expect(counts("const { rows, isLoading } = useRateLimits(); return <StatTile label=\"Limits\" value={rows.length} />;")).toBe(1);
    expect(counts("const { data, error } = useStats(); return <span>{data.total_count.toLocaleString()} loaded</span>;")).toBe(1);
    expect(counts("const { count, isLoading } = useUnread(); return <Badge>{count}</Badge>;")).toBe(1);
  });
  it("self-test: a gated count, an UntrustedCount, and local counts pass", () => {
    expect(counts('const { rows, error } = useRateLimits(); return <p>{error ? "—" : rows.length} rate limits</p>;')).toBe(0);
    expect(counts("const { rows, error } = useRateLimits(); if (error) return <ReadFailure error={error} />; return <p>{rows.length} rate limits</p>;")).toBe(0);
    expect(counts("const { rows, isError } = useRateLimits(); return <p><UntrustedCount value={rows.length} trustworthy={!isError} label=\"Limits\" /> rate limits</p>;")).toBe(0);
    expect(counts("const [rows] = useState<string[]>([]); const loading = false; return <p>{rows.length} drafts</p>;")).toBe(0);
    expect(counts("return <p>{p.rows.length} rows</p>;")).toBe(0);
  });
});

describe("a failure is never an info toast (RC-B12 round 11)", () => {
  const soft = (body: string) => findSoftFailureToasts(`export async function f(p: any) { ${body} }`).length;
  it("self-test: the GenerateShellClient shape counts; a cancellation and plain info do not", () => {
    expect(soft('try { await p.run(); } catch (err) { const msg = err instanceof Error ? err.message : "Generate failed"; toast.info(msg); }')).toBe(1);
    expect(soft('toast.info("Upload failed — try again");')).toBe(1);
    expect(soft('try { await p.run(); } catch { toast.info("Authorization cancelled — nothing changed."); }')).toBe(0);
    expect(soft('toast.info("Copied to your clipboard");')).toBe(0);
    expect(soft('try { await p.run(); } catch (err) { toast.error(String(err)); }')).toBe(0);
  });
  it("no file announces a failure with toast.info / toast.message", () => {
    const files: string[] = [];
    for (const dir of [...SCANNED_DIRS, "hooks", "providers"]) walk(path.join(REPO_ROOT, dir), files);
    const found: string[] = [];
    for (const file of files) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
      if (!/\.(tsx?|mts)$/.test(rel) || /(__tests__|\.test\.|\.spec\.)/.test(rel)) continue;
      for (const line of findSoftFailureToasts(fs.readFileSync(file, "utf8"), rel)) found.push(`${rel}:${line}`);
    }
    expect(found).toEqual([]);
  });
});

describe("one error box carries one menu", () => {
  const doubles = (jsx: string) =>
    findDoubleMenus(`export function C({ error, ok }: any) { return (<>${jsx}</>); }`).length;
  it("self-test: two menus in one box are a defect; menus in exclusive branches are not", () => {
    expect(doubles('<div role="alert"><h3>Failed<ErrorAlchemyMenu /></h3><p>x</p><ErrorAlchemyMenu /></div>')).toBe(1);
    expect(doubles('<div role="alert"><ErrorNotice message="x" /><ErrorAlchemyMenu /></div>')).toBe(1);
    expect(doubles('<div role="alert">{ok ? <p>a<ErrorAlchemyMenu /></p> : <p>b<ErrorAlchemyMenu /></p>}</div>')).toBe(0);
    expect(doubles('<div role="alert"><p>a</p><ErrorAlchemyMenu /></div>')).toBe(0);
  });
  it("no file draws two menus on one box", () => {
    const files: string[] = [];
    for (const dir of SCANNED_DIRS) walk(path.join(REPO_ROOT, dir), files);
    const found: string[] = [];
    for (const file of files) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
      if (!isScannable(rel)) continue;
      const source = fs.readFileSync(file, "utf8");
      if (!source.includes("ErrorAlchemyMenu")) continue;
      for (const line of findDoubleMenus(source, rel)) found.push(`${rel}:${line}`);
    }
    if (process.env.ERROR_CENSUS_PRINT === "1") console.log("DOUBLES " + JSON.stringify(found));
    expect(found).toEqual([]);
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
    expect(orphans('{problems.map((problem) => <div key={problem}>{problem}<ErrorAlchemyMenu error={problem} /></div>)}')).toBe(0);
    expect(orphans('<div><ErrorAlchemyMenu error={title} /></div>')).toBe(1);
    expect(orphans('<ul role="alert">{errs.map((e, i, all) => <li key={i}>{e}{i === all.length - 1 && <ErrorAlchemyMenu />}</li>)}</ul>')).toBe(0);
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
