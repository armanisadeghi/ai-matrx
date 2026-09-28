/**
 * THE TABLE'S MENU SAYS "TABLE", NEVER THE OLDER STORE'S "DATASET" (DATA-V2-BASICS-2 F35).
 * Right-click on Harbor Dental's "Insurance Plan Accounts" offered "Copy dataset ID" — the older
 * store's word; the page, the switcher and every button call it a table.
 * RED before: the item read "Copy dataset ID" and its toast "Dataset ID copied".
 */
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
import { buildDatasetTableMenuSection } from "../dataset-table-actions";

it("every item a person reads names the table", () => {
  const section = buildDatasetTableMenuSection({ getRow: () => ({ id: "377b783a-f18a-40c3-bf2b-7617691d0091" }) } as never);
  const words = section.items.map((i) => ("label" in i ? String(i.label) : "")).join(" | ");
  expect(words).toContain("Copy table ID");
  expect(words.toLowerCase()).not.toContain("dataset");
});
