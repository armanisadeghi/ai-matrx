/**
 * A READ-ONLY RIGHT-CLICK OFFERS ONLY WHAT CAN ACT, AND NOTHING LOADS FOREVER
 * (page-pass 2026-09-27: /education/flashcards rows, /education/progress).
 *
 * Breaks each test names:
 * - Cut / Paste / Undo / Redo greyed on a table row or rendered content (they
 *   mean nothing there and push the row's own section down) → "edit-only" red.
 * - the same verbs vanish from an editable field (they must grey with their
 *   sentence there, R1 c) → "editable" red.
 * - Select All offered where it would do nothing (no selection, no field) →
 *   "select all" red.
 * - a library fetch that never answers leaves "Loading…" on its row for as
 *   long as the menu is open → "deadline" red.
 * - a library that failed is silently absent or still claims to load →
 *   "retry" red.
 */
jest.mock("@/components/agent-copy/alchemy-icon-keys", () => ({ registerAlchemyIcon: () => "app:Icon" }));
jest.mock("@/features/context-menu-v3/hooks/useContextMenuActions", () => ({
  getPlacementIcon: () => null,
  getPlacementLabel: (p: string) => (p === "ai-action" ? "AI Actions" : p),
  resolveIcon: () => null,
  resolveRichActionView: () => ({ label: "", disabled: false }),
  PLACEMENT_COLOR: {},
}));

import { createActionRegistry, createClickTarget } from "@ai-matrx/alchemy/actions";
import { contextMenuActionsFromModel } from "../alchemy-provider";
import { buildMenuModel } from "../model/menu-model";
import type { ContextMenuActions } from "../hooks/useContextMenuActions";
import { MenuLibraryTimeoutError, withMenuDeadline } from "../utils/menu-deadline";

const noop = () => {};

function engine(over: Partial<ContextMenuActions> = {}): ContextMenuActions {
  return {
    scope: { content: "AP Chemistry: Core Nomenclature" },
    actionText: { text: "AP Chemistry: Core Nomenclature", source: "content" },
    jsonSection: null,
    resolvedPlacementMode: {
      "ai-action": "show",
      "bound-agent": "show",
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
    ...over,
  } as unknown as ContextMenuActions;
}

const baseProps = { selectedText: "", canUndo: false, canRedo: false, hasHistory: false, selectionRange: null };

async function resolvedIds(m: ContextMenuActions, isEditable: boolean, extra: Record<string, unknown> = {}) {
  const model = buildMenuModel(m, { ...baseProps, isEditable, ...extra });
  const registry = createActionRegistry({ ports: { diagnostics: { capture: jest.fn() } } });
  registry.register({ id: "context-menu:m1", tier: "T1", actions: () => contextMenuActionsFromModel(model, "m1") });
  const target = createClickTarget({ readOnly: !isEditable, host: { contextMenu: { kind: "context-menu", instanceId: "m1" } } });
  const resolved = await registry.resolve(target);
  return { model, target, resolved, byId: Object.fromEntries(resolved.map((r) => [r.action.id, r])) };
}

describe("a read-only right-click", () => {
  it("edit-only: Cut, Paste, Undo and Redo are absent on a row or rendered content", async () => {
    const { byId } = await resolvedIds(engine(), false);
    for (const id of ["cm:cut", "cm:paste", "cm:undo", "cm:redo"]) expect(byId[id]).toBeUndefined();
    expect(byId["cm:copy"]?.eligibility).toEqual({ status: "available" });
  });

  it("editable: the same verbs still grey with their sentence in a field", async () => {
    const { byId } = await resolvedIds(engine(), true, { getTextarea: () => null });
    for (const id of ["cm:cut", "cm:undo", "cm:redo"]) {
      expect(byId[id]?.eligibility).toMatchObject({ status: "unavailable-verb", sentence: expect.stringMatching(/\w/) });
    }
    expect(byId["cm:paste"]?.eligibility).toEqual({ status: "available" });
  });

  it("select all: absent with no selection and no field, present on a field or a selection", async () => {
    expect((await resolvedIds(engine(), false)).byId["cm:select-all"]).toBeUndefined();
    expect((await resolvedIds(engine(), true, { getTextarea: () => null })).byId["cm:select-all"]).toBeDefined();
    const range = { type: "non-editable", start: 0, end: 3, containerElement: null } as unknown;
    expect((await resolvedIds(engine(), false, { selectionRange: range })).byId["cm:select-all"]).toBeDefined();
  });
});

describe("slow menu libraries", () => {
  afterEach(() => jest.useRealTimers());

  it("deadline: a fetch that never answers rejects with a named timeout", async () => {
    jest.useFakeTimers();
    const never = new Promise<never>(() => {});
    const raced = withMenuDeadline(never, "Loading the menu's AI actions", 8_000);
    jest.advanceTimersByTime(8_000);
    await expect(raced).rejects.toBeInstanceOf(MenuLibraryTimeoutError);
  });

  it("deadline: a fetch that answers in time passes through", async () => {
    await expect(withMenuDeadline(Promise.resolve(7), "x", 1_000)).resolves.toBe(7);
  });

  it("retry: a failed library keeps its row and opens onto one Retry, never Loading…", async () => {
    const retry = jest.fn();
    const { resolved, target } = await resolvedIds(
      engine({ librariesError: "took longer than 8s", boundAgentsError: "took longer than 8s", retryLibraries: retry }),
      false,
    );
    for (const id of ["cm:placement:ai-action", "cm:placement:bound-agent"]) {
      const lib = resolved.find((r) => r.action.id === id);
      expect(lib?.eligibility).toEqual({ status: "available" });
      expect(lib?.action.pending?.(target)).toBe(false);
      const rows = await lib!.action.expand!(target, new AbortController().signal);
      expect(rows.map((r) => r.label)).toEqual(["Couldn't load. Retry"]);
      await rows[0]!.run(target, {} as never);
    }
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it("a library that is simply empty (no error) stays absent", async () => {
    const { resolved } = await resolvedIds(engine(), false);
    expect(resolved.find((r) => r.action.id === "cm:placement:ai-action")).toBeUndefined();
  });
});
