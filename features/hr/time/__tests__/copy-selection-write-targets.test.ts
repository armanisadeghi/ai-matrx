import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const ROOT = resolve(__dirname, "../../../..");
const cases = [
  {
    file: "features/hr/time/punches/PunchRegister.tsx",
    variable: "selected",
    eligible: { id: "eligible", voidedAt: null },
    copyOnly: { id: "copy-only", voidedAt: "2026-10-01" },
  },
  {
    file: "features/hr/time/exceptions/ExceptionsQueue.tsx",
    variable: "selected",
    eligible: { id: "eligible", allowedResolutions: ["acknowledged"] },
    copyOnly: { id: "copy-only", allowedResolutions: [] },
  },
  {
    file: "features/hr/time/timesheet/PeriodApprovalGrid.tsx",
    variable: "selectedRows",
    eligible: {
      employmentId: "eligible",
      openExceptionCount: 0,
      openStepId: "step",
    },
    copyOnly: {
      employmentId: "copy-only",
      openExceptionCount: 1,
      openStepId: "step",
    },
  },
];

describe("HR copy selection preserves write eligibility", () => {
  it.each(cases)(
    "keeps copy-only and stale IDs out of write actions in $file",
    ({ file, variable, eligible, copyOnly }) => {
      const text = readFileSync(resolve(ROOT, file), "utf8");
      const source = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      let expression: string | undefined;
      let selectionGate = false;
      function visit(node: ts.Node) {
        if (
          ts.isVariableDeclaration(node) &&
          node.name.getText(source) === variable &&
          node.initializer
        )
          expression = node.initializer.getText(source);
        if (
          ts.isPropertyAssignment(node) &&
          node.name.getText(source) === "isRowSelectable"
        )
          selectionGate = true;
        ts.forEachChild(node, visit);
      }
      visit(source);
      expect(selectionGate).toBe(false);
      expect(expression).toBeDefined();
      const code = ts.transpileModule(`return (${expression});`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText;
      const selectWriteRows = new Function("rows", "selectedIds", code) as (
        rows: unknown[],
        ids: string[],
      ) => unknown[];
      expect(
        selectWriteRows(
          [eligible, copyOnly],
          ["eligible", "copy-only", "stale"],
        ),
      ).toEqual([eligible]);
      expect(
        selectWriteRows([eligible, copyOnly], ["copy-only", "stale"]),
      ).toEqual([]);
      expect(selectWriteRows([eligible, copyOnly], [])).toEqual([]);
      if ("employmentId" in eligible) {
        expect(
          selectWriteRows([{ ...eligible, openStepId: null }], ["eligible"]),
        ).toEqual([]);
      }
    },
  );
});
