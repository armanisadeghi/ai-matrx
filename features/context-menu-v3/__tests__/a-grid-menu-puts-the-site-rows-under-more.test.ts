/**
 * A GRID'S RIGHT-CLICK MENU IS ITS OWN FIRST; THE SITE-WIDE ROWS WAIT UNDER ONE "More…"
 * (lane C, merged-grid review 2026-09-26: "menus run about 40 items").
 *
 * THE USE CASE: the pool-service dispatcher right-clicks a Visit Date cell on the September route
 * sheet. She wants Copy, Paste, Clear, Insert row, Duplicate, Open, Filter by this value — the
 * grid's own — not Compare, Read aloud, Export and Attach appended below them. Airtable's and
 * Sheets' cell menus are 8–15 rows. The table's sections stay flat, in order; every universal
 * row moves into ONE "More…" at the end, and none of them is lost.
 */
jest.mock("@/components/agent-copy/alchemy-icon-keys", () => ({ registerAlchemyIcon: () => "app:Icon" }));

import { createActionRegistry, createClickTarget } from "@ai-matrx/alchemy/actions";
import type { MatrxTableMenuSection } from "@ai-matrx/design-system/data-table/menu-targets";
import { toContextMenuExtraSections } from "@/components/official/table-menu-sections";
import { contextMenuActionsFromModel } from "../alchemy-provider";
import { foldSiteMenuIntoMore, type MenuModel, type MenuNode, type MenuSection } from "../model/menu-model";

const noop = () => undefined;
const item = (id: string, label: string): MenuNode => ({ kind: "item", id, label, onSelect: noop }) as MenuNode;

/** A grid cell's open: the table's Cell / Row sections, then the site's universal rows. */
function gridCellMenu(): MenuModel {
  const sections: MenuSection[] = [
    { id: "extra:table-cell", group: "surface", label: "Cell", primary: true, nodes: [item("copy-cell", "Copy"), item("paste-cell", "Paste"), item("clear-cell", "Clear")] },
    { id: "extra:table-row", group: "surface", label: "Row", nodes: [item("dup", "Duplicate row"), item("open", "Open record")] },
    { id: "clipboard", group: "clipboard", nodes: [item("copy", "Copy"), item("speak", "Read aloud"), item("select-all", "Select All"), item("find", "Find")] },
    { id: "tools", group: "tools", nodes: [item("chat", "Chat about this")] },
    { id: "history", group: "history", nodes: [item("view-history", "View History"), item("compare", "Compare"), item("export", "Export"), item("attach", "Attach to…")] },
    { id: "quick", group: "quick", nodes: [item("report", "Report a problem")] },
    { id: "surface-info", group: "surface-info", nodes: [item("surface:location", "data-v2/grid")] },
  ];
  return { header: null, sections, roles: {} as MenuModel["roles"] };
}

describe("foldSiteMenuIntoMore", () => {
  it("keeps the grid's sections flat and first, and puts every site row under ONE More… at the end", () => {
    const folded = foldSiteMenuIntoMore(gridCellMenu());
    expect(folded.sections.map((s) => s.id)).toEqual(["extra:table-cell", "extra:table-row", "site-more"]);
    const more = folded.sections.at(-1)!.nodes[0]!;
    expect(more).toMatchObject({ kind: "submenu", label: "More…" });
    const inside = (more as { children: MenuNode[] }).children.filter((n) => n.kind !== "separator").map((n) => ("label" in n ? n.label : ""));
    // Nothing is lost: every universal row is still one press away.
    expect(inside).toEqual(["Copy", "Read aloud", "Select All", "Find", "Chat about this", "View History", "Compare", "Export", "Attach to…", "Report a problem", "data-v2/grid"]);
  });

  it("the top level is short: the grid's rows plus one More… (≤ 15)", async () => {
    const registry = createActionRegistry({ ports: { diagnostics: { capture: jest.fn() } } });
    registry.register({ id: "context-menu:g1", tier: "T1", actions: () => contextMenuActionsFromModel(foldSiteMenuIntoMore(gridCellMenu()), "g1") });
    const top = await registry.resolve(createClickTarget({ host: { contextMenu: { kind: "context-menu", instanceId: "g1" } } }));
    const labels = top.filter((r) => r.eligibility.status === "available").map((r) => r.action.label);
    expect(labels).toEqual(["Copy", "Paste", "Clear", "Duplicate row", "Open record", "More…"]);
    expect(labels.length).toBeLessThanOrEqual(15);
  });

  it("a surface that did not ask keeps the classic menu", () => {
    const unasked = gridCellMenu();
    unasked.sections = unasked.sections.filter((s) => s.group !== "surface");
    expect(foldSiteMenuIntoMore(unasked).sections.map((s) => s.id)).toEqual(unasked.sections.map((s) => s.id));
  });
});

describe("the canonical table asks for it", () => {
  it("every table section the design system answers carries foldSiteMenu", () => {
    const sections: MatrxTableMenuSection[] = [
      { id: "cell", title: "Cell", primary: true, items: [{ id: "copy", label: "Copy", onSelect: noop }] },
      { id: "row", title: "Row", items: [{ id: "dup", label: "Duplicate row", onSelect: noop }] },
    ] as MatrxTableMenuSection[];
    expect(toContextMenuExtraSections(sections).every((s) => s.foldSiteMenu === true)).toBe(true);
  });
});
