/**
 * A GRID'S RIGHT-CLICK MENU NEVER FOLDS ITS ROWS UNDER AN INVENTED HEADING (ALC-15, chair ruling 7
 * and the Lossless Law). A lane folded every site-wide row of a grid menu under ONE "More…"
 * (2026-09-26) — a name the classic menu never used, the same fold Arman rejected on 2026-08-22
 * ("NEVER remove a feature … folded … under 'More'", context-menu-v3 FEATURE change log).
 *
 * THE USE CASE: the pool-service dispatcher right-clicks a Visit Date cell. The grid's own Cell and
 * Row sections come first (the primary-section law), and Copy, Read aloud, History and Compare are
 * right there, by their own names — not behind a container she has to open to find them.
 *
 * Break it names: any fold of the grid's model under a heading outside the classic names → red.
 */
jest.mock("@/components/agent-copy/alchemy-icon-keys", () => ({ registerAlchemyIcon: () => "app:Icon" }));

import { createActionRegistry, createClickTarget } from "@ai-matrx/alchemy/actions";
import type { MatrxTableMenuSection } from "@ai-matrx/design-system/data-table/menu-targets";
import { toContextMenuExtraSections } from "@/components/official/table-menu-sections";
import { contextMenuActionsFromModel } from "../alchemy-provider";
import type { MenuModel, MenuNode, MenuSection } from "../model/menu-model";
import * as menuModel from "../model/menu-model";

const noop = () => undefined;
const item = (id: string, label: string): MenuNode => ({ kind: "item", id, label, onSelect: noop }) as MenuNode;

function gridCellMenu(): MenuModel {
  const sections: MenuSection[] = [
    { id: "extra:table-cell", group: "surface", label: "Cell", primary: true, nodes: [item("copy-cell", "Copy"), item("paste-cell", "Paste"), item("clear-cell", "Clear")] },
    { id: "extra:table-row", group: "surface", label: "Row", nodes: [item("dup", "Duplicate row"), item("open", "Open record")] },
    { id: "clipboard", group: "clipboard", nodes: [item("copy", "Copy"), item("speak", "Read aloud"), item("select-all", "Select All"), item("find", "Find")] },
    { id: "history", group: "history", nodes: [item("view-history", "View History"), item("compare", "Compare")] },
  ];
  return { header: null, sections, roles: {} as MenuModel["roles"] };
}

it("every grid row is offered at the top level by its own name — nothing behind a coined container", async () => {
  const registry = createActionRegistry({ ports: { diagnostics: { capture: jest.fn() } } });
  registry.register({ id: "context-menu:g1", tier: "T1", actions: () => contextMenuActionsFromModel(gridCellMenu(), "g1") });
  const top = await registry.resolve(createClickTarget({ host: { contextMenu: { kind: "context-menu", instanceId: "g1" } } }));
  const labels = top.map((r) => r.action.label);
  expect(labels).toEqual(expect.arrayContaining(["Copy", "Paste", "Clear", "Duplicate row", "Open record", "Read aloud", "Select All", "Find", "View History", "Compare"]));
  expect(labels.filter((l) => /^more/i.test(String(l)))).toEqual([]);
  const headings = new Set(top.map((r) => r.action.section?.label).filter(Boolean));
  expect([...headings].sort()).toEqual(["Cell", "History", "Row"]);
});

it("the model has no fold-into-More… step and the table asks for none", () => {
  expect((menuModel as Record<string, unknown>).foldSiteMenuIntoMore).toBeUndefined();
  const sections: MatrxTableMenuSection[] = [
    { id: "cell", title: "Cell", primary: true, items: [{ id: "copy", label: "Copy", onSelect: noop }] },
  ] as MatrxTableMenuSection[];
  expect(toContextMenuExtraSections(sections).some((s) => "foldSiteMenu" in s)).toBe(false);
});

it("the package's heading check passes on the grid's real model and fails on the removed fold", async () => {
  const { buildMenuModel, unapprovedHeadings } = await import("@ai-matrx/alchemy/menu");
  const approved = new Set(["Cell", "Row", "History"]);
  const target = createClickTarget({ host: { contextMenu: { kind: "context-menu", instanceId: "g2" } } });
  const resolve = async (model: MenuModel) => {
    const registry = createActionRegistry({ ports: { diagnostics: { capture: jest.fn() } } });
    registry.register({ id: "context-menu:g2", tier: "T1", actions: () => contextMenuActionsFromModel(model, "g2") });
    return buildMenuModel(target, await registry.resolve(target));
  };
  expect(unapprovedHeadings(await resolve(gridCellMenu()), approved)).toEqual([]);
  // The fold a lane added: every site row under one "More…".
  const folded = gridCellMenu();
  const rest = folded.sections.filter((s) => s.group !== "surface");
  folded.sections = [
    ...folded.sections.filter((s) => s.group === "surface"),
    { id: "site-more", group: "tools", nodes: [{ kind: "submenu", id: "site-more", label: "More…", children: rest.flatMap((s) => s.nodes) } as MenuNode] },
  ];
  expect(unapprovedHeadings(await resolve(folded), approved)).toEqual(["More…"]);
});
