/**
 * Two context menus mounted at once (a chat message's menu inside the page's
 * root menu — blind run PB-06, 2026-10-01) must not fight over the baseline
 * ids. Every instance yields `cm:copy`, `cm:find`, …; the Alchemy registry
 * refuses a second provider's copy and captures a DuplicateActionError — 18
 * RED Error Inspector rows per right-click on /chat.
 *
 * Break this names: `contextMenuProvider` yields its rows for a target it did
 * not open → "never duplicate" red (captured DuplicateActionError) and
 * "resolves once" red.
 */
jest.mock("@/components/agent-copy/alchemy-icon-keys", () => ({ registerAlchemyIcon: () => "app:Icon" }));

import { createActionRegistry, createClickTarget } from "@ai-matrx/alchemy/actions";
import { contextMenuActionsFromModel, contextMenuProvider } from "../alchemy-provider";
import type { MenuModel, MenuNode } from "../model/menu-model";

const noop = () => undefined;
const item = (id: string, label: string): MenuNode => ({ kind: "item", id, label, onSelect: noop }) as MenuNode;

function baseline(): MenuModel {
  return {
    header: null,
    sections: [
      { id: "clipboard", group: "clipboard", nodes: [item("copy", "Copy"), item("select-all", "Select All")] },
      { id: "history", group: "history", nodes: [item("view-history", "View History")] },
    ],
    roles: {} as MenuModel["roles"],
  };
}

function twoMenus() {
  const capture = jest.fn();
  const registry = createActionRegistry({ ports: { diagnostics: { capture } } });
  for (const id of ["page-root", "message"]) {
    registry.register(contextMenuProvider(id, () => contextMenuActionsFromModel(baseline(), id)));
  }
  const targetOf = (instanceId: string) => createClickTarget({ host: { contextMenu: { kind: "context-menu", instanceId } } });
  return { registry, capture, targetOf };
}

describe("two open context menus", () => {
  it("never duplicate: resolving either menu captures no DuplicateActionError", async () => {
    const { registry, capture, targetOf } = twoMenus();
    await registry.resolve(targetOf("message"));
    await registry.resolve(targetOf("page-root"));
    expect(capture.mock.calls.map(([e]) => (e as Error).name)).toEqual([]);
  });

  it("resolves once: each menu draws its own baseline rows exactly once, from its own provider", async () => {
    const { registry, targetOf } = twoMenus();
    const resolved = await registry.resolve(targetOf("message"));
    expect(resolved.map((r) => r.action.id)).toEqual(["cm:copy", "cm:select-all", "cm:view-history"]);
    expect(new Set(resolved.map((r) => r.action.provider))).toEqual(new Set(["context-menu:message"]));
  });
});
