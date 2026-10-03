/**
 * GUARD 4 — RECORD-MENU COVERAGE: every menu that targets a record carries "Link a record…"
 * (v6 lane 3 INTEGRATION, W1.4, 2026-10-03).
 *
 * The verb is bound ONCE, in the menu model, to the menu's entity — whichever way the entity
 * arrives (a surface's `entity` prop, a per-row entity, a `data-entity-*` sniff, or a row registered
 * in record-menu-registry). So no module adds it, and no record menu can lack it.
 *
 * Breaks each test names:
 * - the verb dropped or gated off for some kind → "each kind" red for that kind.
 * - the verb missing from the record-actions-only arrangement (list rows) → "list row" red.
 * - a record-menu-registry row's entity not reaching the verb → "registry" red.
 * - the verb drawn with no record to link to → "no record" red.
 */
jest.mock("@/components/agent-copy/alchemy-icon-keys", () => ({ registerAlchemyIcon: () => "app:Icon" }));
jest.mock("@/features/context-menu-v3/hooks/useContextMenuActions", () => ({
  getPlacementIcon: () => null,
  getPlacementLabel: (p: string) => p,
  resolveIcon: () => null,
  resolveRichActionView: () => ({ label: "", disabled: false }),
  PLACEMENT_COLOR: {},
}));
jest.mock("@ai-matrx/alchemy/react/host", () => ({}));
jest.mock("@ai-matrx/alchemy/react/menu", () => ({}));
jest.mock("@ai-matrx/alchemy/react/sheet", () => ({}));
jest.mock("@ai-matrx/alchemy/react/palette", () => ({}));
jest.mock("@/features/rich-document/actions/provider", () => ({}));
jest.mock("@/features/rich-document/actions/useRichDocumentProvider", () => ({}));
jest.mock("../regroup/RegroupContext", () => ({}));

import { createActionRegistry, createClickTarget } from "@ai-matrx/alchemy/actions";
import { contextMenuActionsFromModel } from "../alchemy-provider";
import { buildMenuModel } from "../model/menu-model";
import { RECORD_MENU_ATTR, registerRecordMenu, resolveRecordMenu } from "../record-menu-registry";
import type { ContextMenuActions } from "../hooks/useContextMenuActions";
import type { ContextMenuEntityRef } from "../types";

const noop = () => {};
const linked: string[] = [];

function engine(): ContextMenuActions {
  return {
    scope: { content: "Cedar Ridge intake" },
    actionText: { text: "Cedar Ridge intake", source: "content" },
    jsonSection: null,
    resolvedPlacementMode: {
      "ai-action": "show",
      "bound-agent": "show",
      "content-block": "hide",
      "organization-tool": "hide",
      "user-tool": "hide",
      "quick-action": "show",
    },
    categoryGroups: [],
    grouped: {},
    loading: false,
    librariesError: null,
    boundAgentSections: [],
    boundAgentsLoading: false,
    boundAgentsError: null,
    retryLibraries: noop,
    richDocCtx: {},
    registryActions: [],
    copyVariantActions: [],
    exportActions: [],
    convertActions: [],
    hasCompareBase: false,
    isAdmin: false,
    isDebugMode: false,
    isAdminIndicatorOpen: false,
    canNativeUndo: false,
    spokenSummaryAvailable: true,
    quickActions: new Proxy({}, { get: () => noop }),
    surfaceSection: { id: "surface-info", items: [] },
    handleEntrySelect: noop,
    handleBoundAgentExecute: noop,
    handleAttach: noop,
    handleShare: noop,
    handleLinkRecord: () => linked.push("opened"),
  } as unknown as ContextMenuActions;
}

async function menuIds(entity: ContextMenuEntityRef | undefined, recordActionsOnly: boolean) {
  const model = buildMenuModel(engine(), {
    selectedText: "",
    canUndo: false,
    canRedo: false,
    hasHistory: false,
    isEditable: false,
    selectionRange: { type: "non-editable", start: 0, end: 3, containerElement: null } as never,
    entity,
    extraSections: [],
    recordActionsOnly,
  });
  const registry = createActionRegistry({ ports: { diagnostics: { capture: jest.fn() } } });
  registry.register({ id: "context-menu:m1", tier: "T1", actions: () => contextMenuActionsFromModel(model, "m1", { editable: false }) });
  const target = createClickTarget({ readOnly: true, host: { contextMenu: { kind: "context-menu", instanceId: "m1" } } });
  return { model, ids: (await registry.resolve(target)).map((r) => r.action.id) };
}

// The six kinds lane 3 links from (W1.4): a CRM party, an HR employee, a task, a note, a meeting, a message.
const KINDS: ContextMenuEntityRef[] = [
  { type: "party", id: "p1", title: "Dana Whitfield" },
  { type: "hr_employee", id: "e1", title: "Marcus Lee" },
  { type: "task", id: "t1", title: "Call back about knee rehab plan" },
  { type: "note", id: "n1", title: "Intake checklist", resourceType: "note" },
  { type: "meet_meeting", id: "m1", title: "Weekly clinic huddle" },
  { type: "dm_message", id: "d1", title: "Can we move Thursday's session?" },
];

describe("every record menu carries Link a record…", () => {
  it.each(KINDS.map((k) => [k.type, k] as const))("each kind: %s (full menu)", async (_t, entity) => {
    const { ids } = await menuIds(entity, false);
    expect(ids).toContain("cm:link-record");
  });

  it.each(KINDS.map((k) => [k.type, k] as const))("list row: %s (record actions only)", async (_t, entity) => {
    const { ids, model } = await menuIds(entity, true);
    expect(ids).toContain("cm:link-record");
    expect(model.roles.linkRecord?.label).toBe("Link a record…");
  });

  it("registry: a row registered in record-menu-registry links its own record", async () => {
    const root = document.createElement("div");
    root.setAttribute(RECORD_MENU_ATTR, "note:n1");
    const inner = document.createElement("p");
    root.appendChild(inner);
    const off = registerRecordMenu("note:n1", () => ({ entity: KINDS[3]!, extraSections: [] }));
    try {
      const rows = resolveRecordMenu(inner);
      const { model } = await menuIds(rows?.entity ?? undefined, true);
      linked.length = 0;
      model.roles.linkRecord?.onSelect?.();
      expect(linked).toEqual(["opened"]);
    } finally {
      off();
    }
  });

  it("no record: a menu that targets nothing offers no link", async () => {
    const { ids } = await menuIds(undefined, false);
    expect(ids).not.toContain("cm:link-record");
  });
});
