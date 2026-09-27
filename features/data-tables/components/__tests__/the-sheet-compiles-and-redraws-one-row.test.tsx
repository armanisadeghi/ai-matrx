/**
 * THE SHEET COMPILES, AND ONE CELL EDIT REDRAWS ONE ROW (lane RENDER-2, 2026-09-27).
 *
 * Measured on /data-v2 (a copied table, which opens in the Sheet — `UserTableViewer`): one cell
 * edit rendered 2,726 components before RENDER-AUDIT, 1,683 after its row memo, and 318 once the
 * Sheet COMPILED — because the React Compiler had silently skipped the whole 5,700-line component
 * (six disabled hook-lint lines, `try … finally`, `throw` inside `try`, refs read in render,
 * manual memo it could not keep), and a skipped component has no memoisation at all under this
 * repo's "no manual memo" rule. The toolbar and every closed dialog it holds were redrawn three
 * times per edit.
 *
 * Two halves, because jest here runs ts-jest WITHOUT the React Compiler:
 *   1. The compiler itself, over the Sheet's own files, finds no silent skip (the same diagnostics
 *      `pnpm check:compiler-skips` reads). RED on the pre-lane bytes: `UserTableViewer` skipped.
 *   2. The row boundary the Sheet draws through (`SheetBodyRow` + the latest box), run twice: as
 *      written, and COMPILED by the React Compiler exactly as Next compiles it. A change to one
 *      record redraws that row only; a row's own fact redraws that row FROM THE LATEST SCOPE; the
 *      table's shape redraws every row; a row the memo KEPT acts on the viewer as it is now.
 *      The compiled run is the one that caught the second defect: compiled, `SheetBodyRow` cached
 *      `render(row, index)` on [render, row, index], and once the Sheet compiled its `render`
 *      stopped changing — a cell whose facts said "editing" drew its cached, closed self and the
 *      editor never opened. RED with `"use no memo"` removed from `SheetBodyRow`
 *      (SHEET_BODY_ROW_UNDER_TEST=<a copy without it>), GREEN with it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { act, memo, useState, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import ts from "typescript";
import * as asWritten from "../sheet-body-row";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = resolve(__dirname, "../../../..");
const SHEET_FILES = [
  "components/user-generated-table-data/UserTableViewer.tsx",
  "components/user-generated-table-data/TableToolbar.tsx",
  "features/data-tables/components/sheet-body-row.tsx",
  "app/(core)/data-v2/[tableId]/page.tsx",
];

describe("the Sheet compiles", () => {
  it("the React Compiler skips none of the Sheet, its toolbar, its row or the /data-v2 route", () => {
    let out = "";
    let code = 0;
    try {
      out = execFileSync("node", ["scripts/check-compiler-skips.mjs", ...SHEET_FILES], { cwd: ROOT, encoding: "utf8" });
    } catch (e) {
      const err = e as { status?: number; stdout?: string };
      code = err.status ?? 1;
      out = err.stdout ?? "";
    }
    // Every file answered, each with zero silent skips (a named "use no memo" helper is allowed).
    for (const file of SHEET_FILES) expect(out).toContain(`${file}: compiled`);
    expect(out).not.toMatch(/SKIPPED/);
    expect(code).toBe(0);
    expect(out).toMatch(/UserTableViewer\.tsx: compiled [1-9]\d*, skipped 0/);
  }, 120_000);
});

// ── 2. The row boundary, as written and as compiled ─────────────────────────────────────────
type RowModule = typeof asWritten;

/** `sheet-body-row.tsx` through the React Compiler (the plugin and defaults Next uses), then TS. */
function compiledRowModule(file: string): RowModule {
  const pnpm = join(ROOT, "node_modules/.pnpm");
  const dirs = readdirSync(pnpm);
  const core = dirs.filter((d) => d.startsWith("@babel+core@7.")).sort().at(-1) ?? "missing-babel-core-7";
  const syntax = dirs.filter((d) => d.startsWith("@babel+plugin-syntax-typescript@7.")).sort().at(-1) ?? "missing-syntax-typescript-7";
  const babel = require(join(pnpm, core, "node_modules/@babel/core"));
  const tsSyntax = require(join(pnpm, syntax, "node_modules/@babel/plugin-syntax-typescript"));
  const reactCompiler = require("babel-plugin-react-compiler");
  const compiled = babel.transformSync(readFileSync(file, "utf8"), {
    filename: file,
    babelrc: false,
    configFile: false,
    plugins: [[tsSyntax, { isTSX: true }], [reactCompiler, { panicThreshold: "none" }]],
  }).code as string;
  expect(compiled).toContain("react/compiler-runtime"); // it really went through the compiler
  const js = ts.transpileModule(compiled, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} as RowModule };
  new Function("require", "module", "exports", js)(require, mod, mod.exports);
  return mod.exports;
}

const UNDER_TEST = process.env.SHEET_BODY_ROW_UNDER_TEST ?? join(ROOT, "features/data-tables/components/sheet-body-row.tsx");
const MODULES: Array<[string, () => RowModule]> = [
  ["as written", () => asWritten],
  ["compiled by the React Compiler", () => compiledRowModule(UNDER_TEST)],
];

interface Row {
  id: string;
  patient: string;
}
interface Scope {
  clicks: string[];
  label: string;
  ticked: string | null;
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const RECALLS: Row[] = [
  { id: "r1", patient: "Walt Okafor" },
  { id: "r2", patient: "Priya Raman" },
  { id: "r3", patient: "Dana Whitfield" },
];

describe.each(MODULES)("the Sheet's row boundary (%s)", (_label, load) => {
  const { SheetBodyRow, useLatestBox, useSlot } = load();
  const drawn: string[] = [];
  let lastScope: Scope | null = null;

  /**
   * A small Sheet, shaped as the COMPILED `UserTableViewer` hands its rows over: one `render` that
   * never changes identity and reads the viewer's latest scope through the box.
   */
  function MiniSheet({ rows, label, ticked, epoch }: { rows: Row[]; label: string; ticked: string | null; epoch: number }) {
    const latest = useLatestBox<Scope>();
    const clicks = useSlot<string[]>([]);
    const scope: Scope = { clicks: clicks.get(), label, ticked };
    latest.put(scope);
    lastScope = scope;
    const S = latest.get;
    function drawRow(row: Row) {
      drawn.push(row.id);
      return (
        <tr data-row={row.id} data-ticked={S().ticked === row.id ? "yes" : "no"}>
          <td>
            <button type="button" onClick={() => S().clicks.push(`${row.id}@${S().label}`)}>
              {row.patient}
            </button>
          </td>
        </tr>
      );
    }
    const [render] = useState(() => drawRow);
    return (
      <table>
        <tbody>
          {rows.map((row, index) => (
            <SheetBodyRow key={row.id} row={row} index={index} epoch={epoch} facts={[ticked === row.id]} render={render} />
          ))}
        </tbody>
      </table>
    );
  }
  const tickedOf = (id: string) => container.querySelector(`[data-row="${id}"]`)?.getAttribute("data-ticked");

  beforeEach(() => {
    drawn.length = 0;
  });

  it("a change to one record redraws that row only", () => {
    act(() => root.render(<MiniSheet rows={RECALLS} label="v1" ticked={null} epoch={1} />));
    expect(drawn).toEqual(["r1", "r2", "r3"]);
    drawn.length = 0;
    const edited = RECALLS.map((r) => (r.id === "r2" ? { ...r, patient: "Priya Raman-Ortiz" } : r));
    act(() => root.render(<MiniSheet rows={edited} label="v2" ticked={null} epoch={1} />));
    expect(drawn).toEqual(["r2"]);
    expect(container.querySelector('[data-row="r2"] button')?.textContent).toBe("Priya Raman-Ortiz");
  });

  it("a row's own fact redraws that row FROM THE LATEST SCOPE (the editor opens); the shape redraws every row", () => {
    act(() => root.render(<MiniSheet rows={RECALLS} label="v1" ticked={null} epoch={1} />));
    drawn.length = 0;
    act(() => root.render(<MiniSheet rows={RECALLS} label="v1" ticked="r3" epoch={1} />));
    expect(drawn).toEqual(["r3"]);
    expect(tickedOf("r3")).toBe("yes");
    expect(tickedOf("r1")).toBe("no");
    drawn.length = 0;
    act(() => root.render(<MiniSheet rows={RECALLS} label="v1" ticked="r3" epoch={2} />));
    expect(drawn).toEqual(["r1", "r2", "r3"]);
  });

  it("a row the memo kept acts on the viewer as it is now, never the render it was drawn in", () => {
    act(() => root.render(<MiniSheet rows={RECALLS} label="v1" ticked={null} epoch={1} />));
    drawn.length = 0;
    act(() => root.render(<MiniSheet rows={RECALLS} label="v2" ticked={null} epoch={1} />));
    expect(drawn).toEqual([]); // every row kept
    const button = container.querySelector('[data-row="r1"] button') as HTMLButtonElement;
    act(() => button.click());
    expect(lastScope?.clicks).toEqual(["r1@v2"]);
  });
});

// ── 3. The Sheet's toolbar and column headers hold still on a cell edit (lane RENDER-3) ─────────
//
// Measured on /data-v2 (Hygiene Recall Schedule) after RENDER-2: one cell edit redrew the toolbar
// 181 times and the column headers 291 times — once per Sheet render, three per edit — because the
// Sheet handed the toolbar four JSX slots rebuilt every render plus the page's rows, and drew every
// header inline with fresh closures. After: toolbar 7 (the Undo pair alone, as its count moves),
// headers 0. jest here runs without the compiler and cannot mount the whole Sheet, so this proves
// the two halves the browser number rests on: (a) the Sheet's WIRING — the toolbar and the header
// row sit behind memo boundaries and are handed nothing that moves with the rows — RED on the
// pre-lane bytes; (b) the BOUNDARIES themselves, as written and compiled.

const VIEWER = resolve(ROOT, process.env.SHEET_VIEWER_UNDER_TEST ?? "components/user-generated-table-data/UserTableViewer.tsx");
/** Values that change on every cell write, realtime patch or page read. */
const ROW_VALUES = new Set(["displayRows", "data", "cellUndo", "fullDatasetCache", "relationChoicesRead", "computedPage"]);

function viewerSource() {
  return ts.createSourceFile(VIEWER, readFileSync(VIEWER, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function jsxNamed(sf: ts.SourceFile, name: string): Array<ts.JsxOpeningLikeElement> {
  const out: ts.JsxOpeningLikeElement[] = [];
  const walk = (n: ts.Node) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.tagName.getText(sf) === name) out.push(n);
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return out;
}
/** Every const of the viewer, by name → its initializer. */
function constsOf(sf: ts.SourceFile): Map<string, ts.Expression> {
  const out = new Map<string, ts.Expression>();
  const walk = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) out.set(n.name.text, n.initializer);
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return out;
}
/**
 * The row values an expression reaches, following the Sheet's own `sheet*` consts (its toolbar
 * slots and facts). Allowed: `displayRows.length` (a count), and anything under a
 * `showTableConfigModal ? … : …` (Table settings reads the rows only while it is open).
 */
function rowValuesReached(node: ts.Node, sf: ts.SourceFile, consts: Map<string, ts.Expression>, seen = new Set<string>()): string[] {
  const found: string[] = [];
  const walk = (n: ts.Node) => {
    if (ts.isConditionalExpression(n) && n.condition.getText(sf) === "showTableConfigModal") return;
    if (ts.isPropertyAccessExpression(n) && n.expression.getText(sf) === "displayRows" && n.name.text === "length") return;
    if (ts.isIdentifier(n)) {
      const parent = n.parent;
      const isName = (ts.isPropertyAccessExpression(parent) && parent.name === n) || (ts.isPropertyAssignment(parent) && parent.name === n) || ts.isJsxAttribute(parent);
      if (!isName) {
        if (ROW_VALUES.has(n.text)) found.push(`${n.text} @${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`);
        if (n.text.startsWith("sheet") && consts.has(n.text) && !seen.has(n.text)) {
          seen.add(n.text);
          found.push(...rowValuesReached(consts.get(n.text)!, sf, consts, seen));
        }
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return found;
}

describe("the Sheet's toolbar and column headers are handed nothing a cell edit moves", () => {
  const sf = viewerSource();
  const consts = constsOf(sf);

  it("the toolbar is drawn through its memo boundary, with no row value in any prop or slot", () => {
    const lineOf = (n: ts.Node) => `line ${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
    // A <TableToolbar> drawn straight in the Sheet sits outside the memo boundary.
    expect({ tableToolbarDrawnDirectly: jsxNamed(sf, "TableToolbar").map(lineOf) }).toEqual({ tableToolbarDrawnDirectly: [] });
    const toolbars = jsxNamed(sf, "SheetToolbar");
    expect(toolbars.length).toBe(1);
    expect(rowValuesReached(toolbars[0]!.attributes, sf, consts)).toEqual([]);
  });

  it("the column-header row is drawn through its memo boundary, and its facts read no row value", () => {
    const parts = jsxNamed(sf, "SheetChromePart");
    const headerPart = parts.find((p) => jsxNamed(sf, "TableHeader").some((h) => h.getStart(sf) > p.getStart(sf) && h.getEnd() < p.parent.getEnd()));
    expect(headerPart).toBeDefined();
    const facts = headerPart!.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "facts");
    expect(facts).toBeDefined();
    expect(rowValuesReached(facts!, sf, consts)).toEqual([]);
    // Every header cell is its own boundary too, keyed by its column.
    expect(jsxNamed(sf, "SheetHeaderCell")).toHaveLength(1);
  });
});

describe.each(MODULES)("the Sheet's chrome boundaries (%s)", (_label, load) => {
  it("a chrome part redraws from its LATEST render only when one of its facts changed", () => {
    const { SheetChromePart } = load();
    const drawn: string[] = [];
    function Host({ label, sorted, rows }: { label: string; sorted: string; rows: number }) {
      // The rows move on every edit; the part's facts do not read them.
      void rows;
      return <SheetChromePart facts={[sorted]} render={() => { drawn.push(label); return <span data-part="">{`${sorted}:${label}`}</span>; }} />;
    }
    act(() => root.render(<Host label="v1" sorted="patient" rows={8} />));
    expect(drawn).toEqual(["v1"]);
    act(() => root.render(<Host label="v2" sorted="patient" rows={9} />));
    expect(drawn).toEqual(["v1"]); // a cell edit: nothing the part shows moved
    act(() => root.render(<Host label="v3" sorted="recall_due" rows={9} />));
    expect(drawn).toEqual(["v1", "v3"]);
    expect(container.querySelector("[data-part]")?.textContent).toBe("recall_due:v3");
  });

  it("the Undo pair's source never changes identity, tells its reader alone, and undoes through the latest undo", () => {
    const { useSheetUndoSource } = load();
    const reads: number[] = [];
    const undone: string[] = [];
    const seen: unknown[] = [];
    function Pair({ source }: { source: ReturnType<typeof useSheetUndoSource> }) {
      const face = useSyncExternalStore(source.subscribe, source.face, source.face);
      reads.push(face.depth);
      return <button type="button" data-undo="" onClick={source.undo}>{`Undo ${face.depth}`}</button>;
    }
    const SteadyPair = memo(Pair);
    function Toolbar({ depth, tag }: { depth: number; tag: string }) {
      const source = useSheetUndoSource({ canUndo: depth > 0, canRedo: false, busy: false, undoDepth: depth, undo: () => undone.push(tag), redo: () => undefined });
      seen.push(source);
      return <SteadyPair source={source} />;
    }
    act(() => root.render(<Toolbar depth={0} tag="t0" />));
    act(() => root.render(<Toolbar depth={1} tag="t1" />));
    act(() => root.render(<Toolbar depth={1} tag="t2" />));
    expect(new Set(seen).size).toBe(1);
    expect(reads).toEqual([0, 1]); // drawn once more when the count moved, never for a render that moved nothing
    expect(container.querySelector("[data-undo]")?.textContent).toBe("Undo 1");
    act(() => (container.querySelector("[data-undo]") as HTMLButtonElement).click());
    expect(undone).toEqual(["t2"]);
  });
});
