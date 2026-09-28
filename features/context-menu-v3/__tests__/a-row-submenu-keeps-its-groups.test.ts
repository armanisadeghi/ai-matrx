/**
 * The Sheet's "Row · <name>" submenu (DATA-V2-BASICS-2): its source separates "Delete row…" from
 * the rest, but the rows reached the menu flat and Delete drew straight under "Highlight row".
 * Each run of rows between the source's separators is now one section, so the menu draws a
 * divider where the section changes (alchemy withGroupDividers).
 */
jest.mock("@/components/agent-copy/alchemy-icon-keys", () => ({ registerAlchemyIcon: () => "app:Icon" }));

import { createClickTarget } from "@ai-matrx/alchemy/actions";
import { contextMenuActionsFromModel } from "../alchemy-provider";
import type { MenuModel, MenuNode } from "../model/menu-model";

const noop = () => undefined;
const item = (id: string, label: string): MenuNode => ({ kind: "item", id, label, onSelect: noop }) as MenuNode;

it("gives each group of a submenu's rows its own section", async () => {
  const model: MenuModel = {
    header: null,
    roles: {} as MenuModel["roles"],
    sections: [
      {
        id: "extra:grid-row",
        group: "extra",
        nodes: [
          {
            kind: "submenu",
            id: "grid-row",
            label: "Row · Pinch gauges (set of 3)",
            children: [
              item("grid-row-duplicate", "Duplicate row"),
              item("grid-row-highlight", "Highlight row"),
              { kind: "separator", id: "grid-row-sep-delete" },
              item("grid-row-delete", "Delete row…"),
            ],
          } as MenuNode,
        ],
      },
    ],
  };
  const row = contextMenuActionsFromModel(model, "m1").find((a) => a.id === "cm:grid-row");
  const owned = createClickTarget({ host: { contextMenu: { kind: "context-menu", instanceId: "m1" } } });
  const rows = (await row?.expand?.(owned, new AbortController().signal)) ?? [];
  const groups = rows.map((a) => a.section?.id);
  expect(rows.map((a) => a.id)).toEqual(["cm:grid-row-duplicate", "cm:grid-row-highlight", "cm:grid-row-delete"]);
  expect(groups[0]).toBe(groups[1]);
  expect(groups[2]).not.toBe(groups[1]);
});
