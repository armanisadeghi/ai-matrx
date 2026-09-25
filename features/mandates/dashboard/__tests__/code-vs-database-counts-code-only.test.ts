/**
 * "Code vs database: Match N of N" counts CODE-BACKED mandates only.
 *
 * Defect (review, 2026-09-24): the tile read "Match 469 of 469" because every
 * soft mandate — no code declaration at all — compares empty inputs with
 * empty inputs and the report calls that a "match".
 */
import type {
  MandateCodeTruthReport,
  MandateConsoleData,
} from "@/features/mandates/admin/service";
import { codeBackedKeys, driftMetrics } from "../metrics";

const consoleData = {
  mandates: [
    { mandate_key: "seo.code_one", origin: "code" },
    { mandate_key: "seo.code_two", origin: "code" },
    { mandate_key: "shortcut.soft_one", origin: "soft" },
    { mandate_key: "shortcut.soft_two", origin: "soft" },
  ],
} as unknown as MandateConsoleData;

const report = {
  mandates: [
    { mandate_key: "seo.code_one", drift: "match" },
    { mandate_key: "seo.code_two", drift: "diff" },
    { mandate_key: "shortcut.soft_one", drift: "match" },
    { mandate_key: "shortcut.soft_two", drift: "match" },
  ],
} as unknown as MandateCodeTruthReport;

describe("Code vs database tile", () => {
  it("counts matches over code-backed mandates only", () => {
    const keys = consoleData.mandates.map((m) => m.mandate_key);
    const drift = driftMetrics(report, keys, codeBackedKeys(consoleData));
    expect(drift?.match).toBe(1);
    expect(drift?.codeBacked).toBe(2);
    expect(drift?.diff).toBe(1);
  });
});
