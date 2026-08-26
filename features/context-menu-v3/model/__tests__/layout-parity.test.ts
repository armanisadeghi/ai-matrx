/**
 * THE LOSSLESS LAW — layout parity tests.
 *
 * A layout (`tiered`, `command`) may rearrange the menu model but may NEVER
 * hide, rename, or drop a row Classic shows. This suite builds one synthetic
 * FULL model (every branch populated: placements with nested categories, bound
 * agents, extra sections at all three anchors incl. one long enough to fold,
 * copy-as / export / convert, JSON verbs, editable save/delete, admin, the
 * surface submenu) and asserts the actionable LEAF SET is identical across
 * classic / tiered / command arrangements. If a future layout drops a node,
 * this test names it.
 *
 * Also pins the command-layout filter: matches leaves from extraSections,
 * matches while bound agents are still loading (loaded groups stay visible),
 * folds case + diacritics, and returns [] (no crash) on empty query / model.
 */

// menu-model imports presentational helpers from the engine hook module, whose
// transitive imports are heavy (supabase, overlays, redux). The helpers are
// pure presentation — mock them so the model stays testable in isolation.
jest.mock("../../hooks/useContextMenuActions", () => ({
  getPlacementIcon: () => null,
  getPlacementLabel: (p: string) => p,
  resolveIcon: () => null,
  resolveRichActionView: (
    action: { label: unknown; disabled?: (ctx: unknown) => unknown },
    ctx: unknown,
  ) => ({
    label:
      typeof action.label === "function"
        ? (action.label as (c: unknown) => string)(ctx)
        : (action.label as string),
    disabled: Boolean(action.disabled?.(ctx)),
  }),
  PLACEMENT_COLOR: {},
}));

import {
  buildMenuModel,
  type MenuLeafNode,
  type MenuNode,
  type MenuModel,
} from "../menu-model";
import {
  arrangeMenu,
  collectAllLeaves,
  filterLeaves,
  foldForMatch,
  type ArrangedMenu,
} from "../layouts";
import type { ContextMenuActions } from "../../hooks/useContextMenuActions";
import type { AgentMenuCategoryGroup } from "../../hooks/useUnifiedAgentContextMenu";
import type { ContextMenuExtraSection } from "../../types";

// ── Synthetic engine output ─────────────────────────────────────────────────

const noop = () => {};

function group(
  id: string,
  label: string,
  placementType: string,
  items: Array<{ id: string; label: string; agentId?: string | null }>,
  children: AgentMenuCategoryGroup[] = [],
): AgentMenuCategoryGroup {
  return {
    category: {
      id,
      label,
      placementType,
      parentCategoryId: null,
      sortOrder: 0,
      iconName: null,
      color: "#0ea5e9",
      isActive: true,
    },
    items: items.map((i) => ({
      entryType: "agent_shortcut",
      scopeLevel: "global",
      legacyMatch: false,
      id: i.id,
      label: i.label,
      categoryId: id,
      agentId: i.agentId === undefined ? "agent-1" : i.agentId,
      iconName: null,
      keyboardShortcut: null,
      sortOrder: 0,
      isActive: true,
    })),
    children,
  } as unknown as AgentMenuCategoryGroup;
}

function richAction(id: string, label: string) {
  return {
    id,
    label,
    icon: null,
    category: "copy",
    run: noop,
  } as unknown as ContextMenuActions["copyVariantActions"][number];
}

const aiGroups = [
  group(
    "cat-ai",
    "Writing",
    "ai-action",
    [
      { id: "s-improve", label: "Improve Writing" },
      { id: "s-unwired", label: "Unwired Shortcut", agentId: null }, // disabled leaf
    ],
    [group("cat-ai-child", "Nested Tools", "ai-action", [{ id: "s-deep", label: "Deep Résumé Fixer" }])],
  ),
];
const emptyUserGroups = [group("cat-user-empty", "Brand New Category", "user-tool", [])];

function makeEngine(over?: Partial<ContextMenuActions>): ContextMenuActions {
  const grouped: Record<string, AgentMenuCategoryGroup[]> = {
    "ai-action": aiGroups,
    "user-tool": emptyUserGroups,
  };
  const base = {
    scope: { selection: "sel", content: "content" },
    actionText: { text: "Selected words", source: "selection" as const },
    jsonSection: {
      state: "bare",
      detection: { ok: true, root: "object", lineCount: 2 },
      actions: [
        { id: "json-minify", label: "Minify JSON", run: noop },
        { id: "json-copy-minified", label: "Copy minified", run: noop },
      ],
    },
    resolvedPlacementMode: {
      "ai-action": "show",
      "bound-agent": "show",
      "content-block": "show",
      "organization-tool": "show",
      "user-tool": "show",
      "quick-action": "show",
    },
    categoryGroups: [...aiGroups, ...emptyUserGroups],
    grouped,
    loading: false,
    boundAgentSections: [
      {
        key: "public",
        label: "Public",
        sortOrder: 10,
        agents: [
          { agentId: "a1", name: "Summarizer", bindingId: "b1", canDetach: true },
        ],
      },
    ],
    boundAgentsLoading: false,
    richDocCtx: {},
    copyVariantActions: [richAction("copy-md", "Copy as Markdown")],
    exportActions: [richAction("export-md", "Download as Markdown")],
    convertActions: [richAction("convert-task", "Convert to Task")],
    hasCompareBase: true,
    isAdmin: true,
    isDebugMode: true,
    isAdminIndicatorOpen: false,
    canNativeUndo: true,
    handleCopy: noop,
    handleSpeak: noop,
    handleSpokenSummary: noop,
    spokenSummaryAvailable: true,
    handleCut: noop,
    handlePaste: noop,
    handleSelectAll: noop,
    handleUndo: noop,
    handleRedo: noop,
    handleCompareClipboard: noop,
    handleSetCompareBase: noop,
    handleCompareWithBase: noop,
    handleShortcutExecute: noop,
    handleBoundAgentExecute: noop,
    handleContentBlockInsert: noop,
    handleEntrySelect: noop,
    handleDelete: noop,
    handleFind: noop,
    handleAttach: noop,
    handleShare: noop,
    handleInspectValues: noop,
    handleInspectState: noop,
    handleToggleDebugMode: noop,
    handleToggleAdminIndicator: noop,
    quickActions: {
      openChatWindow: noop,
      openQuickNotes: noop,
      openQuickTasks: noop,
      openQuickChat: noop,
      openQuickData: noop,
      openQuickFiles: noop,
      openVoicePad: noop,
    },
    surfaceSection: {
      id: "surface-info",
      items: [
        {
          kind: "submenu",
          id: "surface",
          label: "Notes",
          children: [
            { kind: "item", id: "surface:location", label: "matrx/notes", onSelect: noop },
            { kind: "item", id: "surface:context", label: "Surface Context", onSelect: noop },
          ],
        },
      ],
    } satisfies ContextMenuExtraSection,
    ...over,
  };
  return base as unknown as ContextMenuActions;
}

const extraSections: ContextMenuExtraSection[] = [
  {
    id: "note-ops",
    label: "Note",
    anchor: "after-clipboard",
    items: [
      { kind: "item", id: "note:new", label: "New Note", onSelect: noop },
      { kind: "item", id: "note:dup", label: "Duplicate Note", onSelect: noop },
    ],
  },
  {
    id: "long-section",
    label: "File",
    anchor: "after-compare",
    items: [
      // > INLINE_SURFACE_MAX rows so tiered folds this into one submenu — every
      // row must survive INSIDE the fold.
      { kind: "item", id: "f:open", label: "Open File", onSelect: noop },
      { kind: "item", id: "f:rename", label: "Rename File", onSelect: noop },
      { kind: "item", id: "f:move", label: "Move File", onSelect: noop },
      { kind: "checkbox", id: "f:pin", label: "Pin File", checked: true, onCheckedChange: noop },
      { kind: "link", id: "f:docs", label: "File Docs", href: "/docs" },
    ],
  },
  {
    id: "tail-section",
    anchor: "after-placements",
    items: [{ kind: "item", id: "tail:one", label: "Tail Action", onSelect: noop }],
  },
];

const modelProps = {
  extraSections,
  isEditable: true,
  onSave: noop,
  onDelete: noop,
  onUndo: noop,
  onRedo: noop,
  canUndo: true,
  canRedo: true,
  undoHint: undefined,
  redoHint: undefined,
  onViewHistory: noop,
  hasHistory: true,
  selectedText: "Selected words",
  entity: {
    type: "note",
    id: "note-1",
    title: "My Note",
    resourceType: "note",
  },
} as unknown as Parameters<typeof buildMenuModel>[1];

// ── Leaf collection (disabled INCLUDED — greyed rows are still shown rows) ──

function collectShownLeafLabels(nodes: MenuNode[], out: Set<string>): void {
  for (const n of nodes) {
    if (n.kind === "separator" || n.kind === "label") continue;
    if (n.kind === "submenu") {
      collectShownLeafLabels(n.children, out);
      continue;
    }
    out.add(n.label);
  }
}

function leafSet(arranged: ArrangedMenu): Set<string> {
  const out = new Set<string>();
  collectShownLeafLabels(arranged.strip as MenuNode[], out);
  for (const s of arranged.sections) collectShownLeafLabels(s.nodes, out);
  return out;
}

function buildModel(engine = makeEngine()): MenuModel {
  return buildMenuModel(engine, modelProps);
}

describe("THE LOSSLESS LAW — classic vs tiered vs command", () => {
  it("tiered shows every actionable leaf classic shows (and nothing less)", () => {
    const model = buildModel();
    const classic = leafSet(arrangeMenu(model, "classic"));
    const tiered = leafSet(arrangeMenu(model, "tiered"));
    expect([...tiered].sort()).toEqual([...classic].sort());
  });

  it("command shows every actionable leaf classic shows (and nothing less)", () => {
    const model = buildModel();
    const classic = leafSet(arrangeMenu(model, "classic"));
    const command = leafSet(arrangeMenu(model, "command"));
    expect([...command].sort()).toEqual([...classic].sort());
  });

  it("the classic set actually covers the whole menu (sanity: key rows present)", () => {
    const classic = leafSet(arrangeMenu(buildModel(), "classic"));
    for (const label of [
      "Copy",
      "Copy as Markdown",
      "Minify JSON",
      "Cut",
      "Paste",
      "Select All",
      "Find & Replace",
      "Chat",
      "Undo",
      "Redo",
      "View History",
      "Compare with clipboard",
      "Download as Markdown",
      "Convert to Task",
      "Attach To",
      "Share",
      "Improve Writing",
      "Unwired Shortcut", // disabled (no agent) — still shown
      "Deep Résumé Fixer", // nested child category leaf
      "Summarizer", // bound agent
      "New Note",
      "Open File",
      "Pin File",
      "File Docs",
      "Tail Action",
      "Save",
      "Delete",
      "Context Values",
      "Surface Context",
      "Notes", // quick actions
    ]) {
      expect(classic.has(label)).toBe(label ? true : true);
      if (!classic.has(label)) {
        throw new Error(`classic leaf set is missing "${label}"`);
      }
    }
  });

  it("an empty category renders as a (greyed) leaf-less submenu but its PLACEMENT stays visible and enabled", () => {
    const model = buildModel();
    const placementSection = model.sections.find((s) => s.id === "placements")!;
    const userTool = placementSection.nodes.find(
      (n) => n.kind === "submenu" && n.id === "placement:user-tool",
    );
    expect(userTool).toBeDefined();
    if (userTool?.kind !== "submenu") throw new Error("expected submenu");
    // The placement has one (empty) category → it must be openable so the
    // greyed category is visible.
    expect(userTool.disabled).toBe(false);
    expect(userTool.children).toHaveLength(1);
    const emptyCat = userTool.children[0];
    if (emptyCat.kind !== "submenu") throw new Error("expected category submenu");
    expect(emptyCat.label).toBe("Brand New Category");
    expect(emptyCat.disabled).toBe(true); // greyed, never dropped
  });
});

describe("command layout filter", () => {
  it("matches leaves contributed by extraSections (including inside the fold)", () => {
    const leaves = collectAllLeaves(buildModel());
    expect(filterLeaves(leaves, "rename").map((l) => l.node.label)).toContain(
      "Rename File",
    );
    expect(filterLeaves(leaves, "tail").map((l) => l.node.label)).toContain(
      "Tail Action",
    );
  });

  it("still matches already-loaded groups while bound agents are loading", () => {
    const engine = makeEngine({
      boundAgentsLoading: true,
      boundAgentSections: [],
    });
    const leaves = collectAllLeaves(buildMenuModel(engine, modelProps));
    expect(filterLeaves(leaves, "improve").map((l) => l.node.label)).toContain(
      "Improve Writing",
    );
  });

  it("folds case and diacritics both directions", () => {
    const leaves = collectAllLeaves(buildModel());
    // Query without diacritics matches the accented label…
    expect(filterLeaves(leaves, "resume").map((l) => l.node.label)).toContain(
      "Deep Résumé Fixer",
    );
    // …and an accented query matches too.
    expect(filterLeaves(leaves, "RÉSUMÉ").map((l) => l.node.label)).toContain(
      "Deep Résumé Fixer",
    );
    expect(foldForMatch("Café")).toBe("cafe");
  });

  it("ranks a label prefix above a path-only match and returns [] on empty query / empty model", () => {
    const leaves = collectAllLeaves(buildModel());
    const results = filterLeaves(leaves, "copy");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].node.label.toLowerCase().startsWith("copy")).toBe(true);
    expect(filterLeaves(leaves, "   ")).toEqual([]);
    // Empty model: no sections at all — no crash, no results.
    const emptyModel = { header: null, sections: [], roles: {} } as unknown as MenuModel;
    expect(filterLeaves(collectAllLeaves(emptyModel), "anything")).toEqual([]);
  });

  it("excludes disabled leaves from filter results (cannot run what cannot be clicked)", () => {
    const leaves = collectAllLeaves(buildModel());
    expect(
      filterLeaves(leaves, "unwired").map((l) => l.node.label),
    ).not.toContain("Unwired Shortcut");
  });
});
