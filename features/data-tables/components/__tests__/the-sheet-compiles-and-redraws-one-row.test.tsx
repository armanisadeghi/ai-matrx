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
 *   2. The row boundary the Sheet draws through (`SheetBodyRow` + the latest box): a change to one
 *      record redraws that row only; a row's own fact redraws that row; the table's shape redraws
 *      every row; a row the memo KEPT acts on the viewer as it is NOW, never the render it was
 *      drawn in.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SheetBodyRow, useLatestBox, useSlot } from "../sheet-body-row";

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

// ── 2. The row boundary ─────────────────────────────────────────────────────────────────────
interface Row {
  id: string;
  patient: string;
}
const drawn: string[] = [];
let lastScope: { clicks: string[]; label: string } | null = null;

/** A small Sheet: the same shape `UserTableViewer` draws its body with. */
function MiniSheet({ rows, label, ticked, epoch }: { rows: Row[]; label: string; ticked: string | null; epoch: number }) {
  const latest = useLatestBox<{ clicks: string[]; label: string }>();
  const clicks = useSlot<string[]>([]);
  const scope = { clicks: clicks.get(), label };
  latest.put(scope);
  lastScope = scope;
  const S = latest.get;
  const render = (row: Row) => {
    drawn.push(row.id);
    return (
      <tr data-row={row.id}>
        <td>
          <button type="button" onClick={() => S().clicks.push(`${row.id}@${S().label}`)}>
            {row.patient}
          </button>
        </td>
      </tr>
    );
  };
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

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  drawn.length = 0;
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

describe("the Sheet's row boundary", () => {
  it("a change to one record redraws that row only", () => {
    act(() => root.render(<MiniSheet rows={RECALLS} label="v1" ticked={null} epoch={1} />));
    expect(drawn).toEqual(["r1", "r2", "r3"]);
    drawn.length = 0;
    const edited = RECALLS.map((r) => (r.id === "r2" ? { ...r, patient: "Priya Raman-Ortiz" } : r));
    act(() => root.render(<MiniSheet rows={edited} label="v2" ticked={null} epoch={1} />));
    expect(drawn).toEqual(["r2"]);
  });

  it("a row's own fact redraws that row; the table's shape redraws every row", () => {
    act(() => root.render(<MiniSheet rows={RECALLS} label="v1" ticked={null} epoch={1} />));
    drawn.length = 0;
    act(() => root.render(<MiniSheet rows={RECALLS} label="v1" ticked="r3" epoch={1} />));
    expect(drawn).toEqual(["r3"]);
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
