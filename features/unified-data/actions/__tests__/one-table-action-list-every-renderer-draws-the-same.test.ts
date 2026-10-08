/**
 * G1 — ONE LIST, ACROSS EVERY RENDERER (lane TABLE-ACTIONS, v6 lane 1).
 *
 * The use case: at Cedar Ridge Physical Therapy the owner, a therapist (editor) and the front desk
 * (viewer) reach "Balance and Gait Programs" from the Data home row ⋯, from a right-click and from
 * the table page's own ⋯. Each was a different hand-made list (the owner, 2026-10-01: "there is no
 * way to 'delete' or 'archive' the table"). Every renderer is now an adapter of `tableActions()`
 * from @ai-matrx/records-ui, and this test holds all three — the list shell's row menu, the v3
 * right-click sections and the package's header ⋯ — to the registry: the same ids, in the same
 * order, none hidden, and every disabled one drawn DISABLED WITH ITS REASON. For every seat, with
 * host handlers missing, and with this app's own entries (`tableMenuExtensions`) in the list.
 *
 * RED, proven 2026-10-02 (each planted, run, reverted): an extra entry in `toItemMenuConfig`; a
 * reorder in `toExtraSections`; disabled entries dropped in `toItemMenuConfig`; the reason dropped
 * from a disabled entry in `toItemMenuConfig`.
 */

import {
  dropdownActionIds,
  tableActions,
  tableRightsAt,
  toDropdownEntries,
  type ObjectAction,
  type TableActionHost,
} from "@ai-matrx/records-ui";
import type { ItemMenuConfig, ItemMenuEntry } from "@ai-matrx/chat/ui/item-types";
import type { ContextMenuExtraItem, ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { toExtraSections, toItemMenuConfig } from "../tableActionAdapters";
import { tableMenuExtensions } from "../tableMenuExtensions";

const TABLE = { id: "ae674b7a-6433-4cf2-8a7e-a1f7997ddf4d", name: "Balance and Gait Programs", is_kernel: false };

const noop = () => {};
const everyHandler: TableActionHost = {
  open: noop,
  openInNewTab: noop,
  copyText: noop,
  rename: noop,
  duplicate: noop,
  move: noop,
  toggleFavorite: noop,
  share: noop,
  export: noop,
  import: noop,
  addColumn: noop,
  settings: noop,
  history: noop,
  openBuiltOn: noop,
  archive: noop,
  extend: () => [
    { id: "link-record", label: "Link a record…", icon: "link-2", group: "organize", run: noop },
    ...tableMenuExtensions({ workflows: noop, rowChangeAgent: noop }),
  ],
};

/** A real host with gaps: no duplicate door, no built-on screens, no Workflows screen. */
const someMissing: TableActionHost = (() => {
  const { duplicate: _d, openBuiltOn: _b, ...rest } = everyHandler;
  return { ...rest, extend: () => tableMenuExtensions({ rowChangeAgent: noop }) };
})();

const SEATS = ["admin", "editor", "viewer"] as const;
const HOSTS: Record<string, TableActionHost> = { "every handler": everyHandler, "some handlers missing": someMissing };

type Drawn = { id: string; disabled: boolean; reason: string | null };

function drawnFromItemMenu(config: ItemMenuConfig): Drawn[] {
  const walk = (entries: ItemMenuEntry[]): Drawn[] =>
    entries.flatMap((e) =>
      e.kind === "submenu"
        ? e.sections.flatMap((s) => walk(s.items))
        : e.hidden
          ? []
          : [{ id: e.id, disabled: e.disabled === true, reason: e.disabled ? (e.disabledReason ?? null) : null }],
    );
  return config.sections.flatMap((s) => walk(s.items));
}

function drawnFromExtraSections(sections: ContextMenuExtraSection[]): Drawn[] {
  const walk = (items: ContextMenuExtraItem[]): Drawn[] =>
    items.flatMap((i) =>
      i.kind === "separator"
        ? []
        : i.kind === "submenu"
          ? walk(i.children)
          : [{ id: i.id, disabled: i.disabled === true, reason: i.disabled ? (i.description ?? null) : null }],
    );
  return sections.flatMap((s) => walk(s.items));
}

const expected = (actions: readonly ObjectAction[]): Drawn[] =>
  actions.map((a) => ({ id: a.id, disabled: a.disabledReason !== undefined, reason: a.disabledReason ?? null }));

describe("one table action list, every renderer", () => {
  for (const seat of SEATS) {
    for (const [hostName, host] of Object.entries(HOSTS)) {
      describe(`${seat}, ${hostName}`, () => {
        const actions = () => tableActions({ table: TABLE, rights: tableRightsAt(seat), host });

        it("the row menu draws every id, in order, disabled ones disabled with their reason", () => {
          expect(drawnFromItemMenu(toItemMenuConfig(actions()))).toEqual(expected(actions()));
        });

        it("the right-click sections draw every id, in order, disabled ones disabled with their reason", () => {
          expect(drawnFromExtraSections(toExtraSections(actions()))).toEqual(expected(actions()));
        });

        it("the header ⋯ adapter draws the same ids", () => {
          expect(dropdownActionIds(toDropdownEntries(actions()))).toEqual(actions().map((a) => a.id));
        });

        it("the table page's own entries are in the list, and Archive table is last", () => {
          const ids = actions().map((a) => a.id);
          expect(ids).toEqual(
            expect.arrayContaining(["workflows", "row-change-agent"]),
          );
          expect(ids[ids.length - 1]).toBe("archive");
        });
      });
    }
  }

  // THE COPY ENTRIES LEFT WITH COPY AGAIN (lane ONE-HOME wave 4): no seat, on any table, meets them.
  it.each([
    ["an admin", "admin"],
    ["a viewer", "viewer"],
  ] as const)("%s meets no copy entry on any table", (_who, seat) => {
    for (const host of [everyHandler, someMissing]) {
      const ids = tableActions({ table: TABLE, rights: tableRightsAt(seat), host }).map((a) => a.id);
      expect(ids).not.toContain("test-copy");
      expect(ids).not.toContain("copy-again");
      expect(ids).toContain("row-change-agent");
    }
  });

  it("a viewer on a table that is not a copy meets the other entries disabled, saying why", () => {
    const viewer = tableActions({ table: TABLE, rights: tableRightsAt("viewer"), host: someMissing });
    const byId = Object.fromEntries(drawnFromItemMenu(toItemMenuConfig(viewer)).map((d) => [d.id, d.reason]));
    expect(byId).toMatchObject({
      duplicate: "Not available here",
      archive: "Needs Admin access",
      open: null,
    });
  });

  it("Built on it is one submenu in both frontend renderers", () => {
    const actions = tableActions({ table: TABLE, rights: tableRightsAt("admin"), host: everyHandler });
    const rowSubmenus = toItemMenuConfig(actions)
      .sections.flatMap((s) => s.items)
      .filter((e) => e.kind === "submenu");
    expect(rowSubmenus.map((e) => e.label)).toEqual(["Built on it"]);
    const rightClickSubmenus = toExtraSections(actions)
      .flatMap((s) => s.items)
      .filter((i) => i.kind === "submenu");
    expect(rightClickSubmenus.map((i) => (i.kind === "submenu" ? i.label : ""))).toEqual(["Built on it"]);
  });
});
