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

it("marks the row after a submenu's separator as starting a group", async () => {
  const model: MenuModel = {
    header: null,
    roles: {} as MenuModel["roles"],
    sections: [
      {
        id: "extra:grid-row",
        // Extra sections are built with group "surface" (menu-model.ts).
        group: "surface",
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
  expect(rows.map((a) => a.id)).toEqual(["cm:grid-row-duplicate", "cm:grid-row-highlight", "cm:grid-row-delete"]);
  expect(rows.map((a) => Boolean((a as { startsGroup?: boolean }).startsGroup))).toEqual([false, false, true]);
});

it("marks the row after a separator in a section as starting a group", () => {
  const model: MenuModel = {
    header: null,
    roles: {} as MenuModel["roles"],
    sections: [
      {
        id: "extra:grid-row",
        group: "extra",
        label: "Row · Pinch gauges (set of 3)",
        nodes: [
          item("grid-row-duplicate", "Duplicate row"),
          item("grid-row-highlight", "Highlight row"),
          { kind: "separator", id: "grid-row-sep-delete" },
          item("grid-row-delete", "Delete row…"),
        ],
      } as unknown as MenuModel["sections"][number],
    ],
  };
  const actions = contextMenuActionsFromModel(model, "m1").filter((a) => a.id.startsWith("cm:grid-row-"));
  expect(actions.map((a) => [a.id, Boolean((a as { startsGroup?: boolean }).startsGroup)])).toEqual([
    ["cm:grid-row-duplicate", false],
    ["cm:grid-row-highlight", false],
    ["cm:grid-row-delete", true],
  ]);
});
