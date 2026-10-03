/**
 * A TABLE SHOWN AWAY FROM ITS PAGE (a window, a preview) GETS THE TABLE'S ONE ACTION LIST, AND IT
 * SAYS "TABLE", NEVER THE OLDER STORE'S "DATASET" (DATA-V2-BASICS-2 F35; TABLE-ACTIONS item 11).
 * Breaks named:
 * - a hand-made list again (Open in Data Workspace / Copy table ID only) → the registry ids are missing → red.
 * - "Copy dataset ID" / "Dataset ID copied" → red.
 * - a page-only verb acting away from the page (Archive runs from a window) → not disabled → red.
 */
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
import { extraSectionActionIds } from "@/features/unified-data/actions/tableActionAdapters";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { tableActionSectionsAwayFromPage } from "../dataset-table-actions";

const HARBOR_DENTAL_INSURANCE = { id: "377b783a-f18a-40c3-bf2b-7617691d0091", name: "Insurance Plan Accounts" };

type Item = ContextMenuExtraSection["items"][number];
const flat = (items: readonly Item[]): Item[] =>
  items.flatMap((i) => (i.kind === "submenu" ? flat(i.children) : i.kind === "separator" ? [] : [i]));

it("draws the registry's table verbs plus Copy table ID", () => {
  const ids = extraSectionActionIds(tableActionSectionsAwayFromPage(HARBOR_DENTAL_INSURANCE));
  expect(ids).toEqual(expect.arrayContaining(["open", "open-new-tab", "copy-link", "rename", "share", "export", "archive", "copy-table-id"]));
});

it("every item a person reads names the table", () => {
  const items = tableActionSectionsAwayFromPage(HARBOR_DENTAL_INSURANCE).flatMap((s) => flat(s.items));
  const words = items.map((i) => ("label" in i ? String(i.label) : "")).join(" | ");
  expect(words).toContain("Copy table ID");
  expect(words).toContain("Archive table");
  expect(words.toLowerCase()).not.toContain("dataset");
});

it("only the reading verbs act away from the page", () => {
  const items = tableActionSectionsAwayFromPage(HARBOR_DENTAL_INSURANCE).flatMap((s) => flat(s.items));
  const disabled = (id: string) => {
    const item = items.find((i) => "id" in i && i.id === id) as { disabled?: unknown } | undefined;
    return Boolean(item?.disabled);
  };
  expect(["archive", "rename", "share"].filter((id) => !disabled(id))).toEqual([]);
  expect(["open", "copy-link", "copy-table-id"].filter(disabled)).toEqual([]);
});

it("no table, no table section", () => {
  expect(tableActionSectionsAwayFromPage(null)).toEqual([]);
});
