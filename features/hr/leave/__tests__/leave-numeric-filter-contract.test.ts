import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

type ExtractedColumn = { filter: string | null; accessor: (row: unknown) => unknown };

function columnsFrom(file: string, declaration: string): Map<string, ExtractedColumn> {
  const source = readFileSync(resolve(__dirname, file), "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: { value: ts.ArrayLiteralExpression | null } = { value: null };
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(tree) === declaration &&
      node.initializer !== undefined &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      found.value = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  const columns = found.value;
  if (columns === null) throw new Error(`Missing ${declaration} in ${file}`);

  return new Map(
    columns.elements.flatMap((element) => {
      if (!ts.isObjectLiteralExpression(element)) return [];
      const property = (name: string) =>
        element.properties.find(
          (candidate): candidate is ts.PropertyAssignment =>
            ts.isPropertyAssignment(candidate) && candidate.name.getText(tree) === name,
        );
      const id = property("id")?.initializer;
      const filter = property("filter")?.initializer;
      const accessor = property("accessorFn")?.initializer;
      if (!id || !ts.isStringLiteral(id) || !accessor) return [];
      const compiled = ts.transpileModule(`module.exports = (${accessor.getText(tree)});`, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      const runtimeModule = { exports: null as unknown };
      new Function("module", "exports", compiled)(runtimeModule, runtimeModule.exports);
      if (typeof runtimeModule.exports !== "function") throw new Error(`Accessor ${id.text} did not compile`);
      return [[id.text, { filter: filter !== undefined && ts.isStringLiteral(filter) ? filter.text : null, accessor: runtimeModule.exports as (row: unknown) => unknown }]];
    }),
  );
}

function expectNumberColumns(columns: Map<string, ExtractedColumn>, ids: string[]) {
  for (const id of ids) expect(column(columns, id).filter).toBe("number");
}

function column(columns: Map<string, ExtractedColumn>, id: string): ExtractedColumn {
  const extracted = columns.get(id);
  if (!extracted) throw new Error(`Missing production column ${id}`);
  return extracted;
}

describe("leave numeric filter accessors", () => {
  it("uses the production accessors for all 14 columns without turning absence into a number", () => {
    const balances = columnsFrom("../manager/LeaveBalancesSurface.tsx", "columns");
    expectNumberColumns(balances, ["accrued", "used", "upcoming", "pending", "available", "after-pending", "cap"]);
    const figures = { unlimited: false, accruedToDate: 0, usedTaken: -2, approvedUpcoming: 3, pendingApproval: 4, bookableNow: 0, available: -4, balanceCap: 8 };
    expect(column(balances, "accrued").accessor(figures)).toBe(0);
    expect(column(balances, "used").accessor(figures)).toBe(-2);
    expect(column(balances, "after-pending").accessor(figures)).toBe(-4);
    for (const id of ["accrued", "used", "upcoming", "pending", "available", "after-pending", "cap"]) {
      expect(column(balances, id).accessor({ ...figures, unlimited: true })).toBeNull();
    }

    const queue = columnsFrom("../manager/LeaveQueueSurface.tsx", "columns");
    expectNumberColumns(queue, ["hours", "balance", "findings"]);
    expect(column(queue, "hours").accessor({ request: { requestedHours: 0 } })).toBe(0);
    expect(column(queue, "balance").accessor({ request: { conflictCheck: { projectedBalanceAtStart: -3 } } })).toBe(-3);
    expect(column(queue, "findings").accessor({ request: { conflictCheck: { hard: [], advisory: [] } } })).toBe(0);
    expect(column(queue, "findings").accessor({ request: null })).toBeNull();

    const roster = columnsFrom("../policies/LeaveEnrollmentSurface.tsx", "rosterColumns");
    expectNumberColumns(roster, ["available", "after-pending"]);
    expect(column(roster, "available").accessor({ unlimited: false, bookableNow: 0 })).toBe(0);
    expect(column(roster, "after-pending").accessor({ unlimited: false, available: -4 })).toBe(-4);
    expect(column(roster, "available").accessor({ unlimited: true, bookableNow: 99 })).toBeNull();

    const policies = columnsFrom("../policies/LeavePolicyListSurface.tsx", "columns");
    expectNumberColumns(policies, ["enrolled", "version"]);
    expect(column(policies, "enrolled").accessor({ enrolledCount: 0 })).toBe(0);
    expect(column(policies, "version").accessor({ version: null })).toBeNull();
  });
});
