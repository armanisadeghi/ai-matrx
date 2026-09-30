/**
 * EVERY RIGHT-CLICK CAN MAKE A REFERENCE (Arman, 2026-09-11: "add this
 * functionality to the system-wide context menu so you can create these from
 * anywhere and insert them in any text or just get them and copy them").
 *
 * Breaks each test names:
 * - the reference row vanishes from an editable field → "insert" red.
 * - it vanishes from read-only content instead of turning into Copy (v3 law:
 *   same verb, never absent) → "copy" red.
 *
 * The earlier pin for this row lived in a layout-parity test that the menu's
 * single-renderer rebuild deleted; nothing guarded it until this file.
 */
jest.mock("@/components/agent-copy/alchemy-icon-keys", () => ({ registerAlchemyIcon: () => "app:Icon" }));
jest.mock("@/features/context-menu-v3/hooks/useContextMenuActions", () => ({
  getPlacementIcon: () => null,
  getPlacementLabel: (p: string) => p,
  resolveIcon: () => null,
  resolveRichActionView: () => ({ label: "", disabled: false }),
  PLACEMENT_COLOR: {},
}));

import { createActionRegistry, createClickTarget } from "@ai-matrx/alchemy/actions";
import { contextMenuActionsFromModel } from "../alchemy-provider";
import { buildMenuModel } from "../model/menu-model";
import type { ContextMenuActions } from "../hooks/useContextMenuActions";

const noop = () => {};

function engine(handleInsertReference: () => void): ContextMenuActions {
  return {
    scope: { content: "Quarterly plan" },
    actionText: { text: "Quarterly plan", source: "content" },
    jsonSection: null,
    resolvedPlacementMode: {
      "ai-action": "hide",
      "bound-agent": "hide",
      "content-block": "hide",
      "organization-tool": "hide",
      "user-tool": "hide",
      "quick-action": "hide",
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
    handleInsertReference,
  } as unknown as ContextMenuActions;
}

async function referenceRow(isEditable: boolean) {
  const handler = jest.fn();
  const model = buildMenuModel(engine(handler), {
    selectedText: "",
    canUndo: false,
    canRedo: false,
    hasHistory: false,
    selectionRange: null,
    isEditable,
    ...(isEditable ? { getTextarea: () => null } : {}),
  } as unknown as Parameters<typeof buildMenuModel>[1]);
  const registry = createActionRegistry({ ports: { diagnostics: { capture: jest.fn() } } });
  registry.register({
    id: "context-menu:m1",
    tier: "T1",
    actions: () => contextMenuActionsFromModel(model, "m1", { editable: isEditable }),
  });
  const target = createClickTarget({
    readOnly: !isEditable,
    host: { contextMenu: { kind: "context-menu", instanceId: "m1" } },
  });
  const resolved = await registry.resolve(target);
  return { row: resolved.find((r) => r.action.id === "cm:insert-reference"), handler };
}

describe("a reference from any right-click", () => {
  it("insert: an editable field offers 'Insert reference…', available", async () => {
    const { row } = await referenceRow(true);
    expect(row).toBeDefined();
    expect(row!.action.label).toBe("Insert reference…");
    expect(row!.eligibility).toEqual({ status: "available" });
  });

  it("copy: read-only content offers the same row as 'Copy reference…', never absent", async () => {
    const { row } = await referenceRow(false);
    expect(row).toBeDefined();
    expect(row!.action.label).toBe("Copy reference…");
    expect(row!.eligibility).toEqual({ status: "available" });
  });
});
