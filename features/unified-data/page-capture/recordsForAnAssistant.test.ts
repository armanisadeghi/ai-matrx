/**
 * RECORDS COPIED FOR AN ASSISTANT NAME EVERY VALUE BY ITS COLUMN (DATA-V2-BASICS-2 F41).
 * THE USE CASE: Harbor Dental's "Insurance Plan Accounts" — "Plan Type" is stored under the key
 * `renews` (the column was renamed). The copy said `renews: "Indemnity"` and never "Plan Type".
 * RED before: no such shaping; rows went out as the store's documents.
 */
import { recordsForAnAssistant } from "./recordsForAnAssistant";

const FIELDS = [
  { key: "account", label: "Account", type: "text" },
  { key: "renews", label: "Plan Type", type: "list" },
  { key: "annual_max_used", label: "Annual Max Used", type: "number" },
];

it("each value is named by the column a person reads, and the copy lists the columns", () => {
  const out = recordsForAnAssistant(FIELDS, [
    { id: "r1", document: { account: "Careington Discount · Plan 500", renews: "Indemnity", annual_max_used: null, _values: {} } },
  ]);
  expect(out.columns).toEqual([
    { name: "Account", key: "account", kind: "text" },
    { name: "Plan Type", key: "renews", kind: "list" },
    { name: "Annual Max Used", key: "annual_max_used", kind: "number" },
  ]);
  expect(out.rows[0]).toEqual({ id: "r1", Account: "Careington Discount · Plan 500", "Plan Type": "Indemnity", "Annual Max Used": null });
  expect(JSON.stringify(out.rows)).not.toContain("renews");
});

it("a key no column declares is kept, apart", () => {
  const out = recordsForAnAssistant(FIELDS, [{ id: "r2", document: { account: "Aetna", legacy_code: "A7" } }]);
  expect(out.rows[0]).toEqual({ id: "r2", Account: "Aetna", _other: { legacy_code: "A7" } });
});
