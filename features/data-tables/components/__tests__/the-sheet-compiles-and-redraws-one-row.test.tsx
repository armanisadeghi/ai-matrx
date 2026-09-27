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
import { act, useState } from "react";
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
