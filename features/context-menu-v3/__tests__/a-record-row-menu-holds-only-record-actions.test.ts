/**
 * A LIST ROW OR FOLDER MENU HOLDS ONLY WHAT ACTS ON THE RECORD
 * (page-pass /notes, 2026-09-28 — the blind judge: a folder's right-click
 * showed Select All, Speak, Find, Compare, Chat and every agent library; a
 * note row showed Select All and "Read aloud selection").
 *
 * Breaks each test names:
 * - `recordActionsOnly` ignored by the model → any editor row resolves → "editor rows" red.
 * - the record's own section, Attach To or Share dropped with them → "record rows" red.
 * - read-aloud / Compare registry rows not excluded from a record target → "registry" red.
 * - the full menu losing its editor rows (the mode leaking) → "full menu" red.
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
import { editorOnlyRichActionIds } from "../components/AlchemyMenuContent";
import type { ContextMenuActions } from "../hooks/useContextMenuActions";

const noop = () => {};

function engine(over: Partial<ContextMenuActions> = {}): ContextMenuActions {
  return {
    scope: { content: "Research" },
    actionText: { text: "Research", source: "content" },
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
    grouped: { "ai-action": [{ category: { id: "c1", label: "Writing" }, items: [{ id: "e1", label: "Tidy", entryType: "prompt" }], children: [] }] },
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

const folderSection = {
  id: "folder",
  label: "Research",
  primary: true,
  items: [
    { id: "rename", label: "Rename folder", onSelect: noop },
    { id: "archive", label: "Move all notes to Trash…", onSelect: noop, destructive: true },
  ],
};

async function ids(recordActionsOnly: boolean, over: Partial<ContextMenuActions> = {}) {
  const model = buildMenuModel(engine(over), {
    selectedText: "",
    canUndo: false,
    canRedo: false,
    hasHistory: false,
    isEditable: false,
    selectionRange: { type: "non-editable", start: 0, end: 3, containerElement: null } as never,
    entity: { type: "note", id: "n1", title: "A note", resourceType: "note" },
    extraSections: [folderSection as never],
    recordActionsOnly,
  });
  const registry = createActionRegistry({ ports: { diagnostics: { capture: jest.fn() } } });
  registry.register({ id: "context-menu:m1", tier: "T1", actions: () => contextMenuActionsFromModel(model, "m1", { editable: false }) });
  const target = createClickTarget({ readOnly: true, host: { contextMenu: { kind: "context-menu", instanceId: "m1" } } });
  return (await registry.resolve(target)).map((r) => r.action.id);
}

const EDITOR_ROWS = [
  "cm:select-all",
  "cm:find",
  "cm:speak",
  "cm:listen",
  "cm:insert-reference",
  "cm:chat",
  "cm:compare",
  "cm:quick-actions",
  "cm:placement:ai-action",
  "cm:view-history",
];

describe("a record-actions-only menu (list row, folder)", () => {
  it("editor rows: none of the editor's items resolve", async () => {
    const got = await ids(true);
    for (const id of EDITOR_ROWS) expect(got).not.toContain(id);
  });

  it("record rows: the record's own section, Attach To and Share stay", async () => {
    const got = await ids(true);
    expect(got).toEqual(expect.arrayContaining(["cm:x:rename", "cm:x:archive", "cm:attach", "cm:share"]));
  });

  it("registry: read-aloud, listen and Compare rows are excluded from a record target", () => {
    const excluded = editorOnlyRichActionIds([
      { id: "tts-play", category: "listen" },
      { id: "summarize-and-listen", category: "listen" },
      { id: "compare-with-base", category: "edit" },
      { id: "copy-markdown", category: "copy" },
      { id: "download-docx", category: "export" },
      { id: "text-cleanup", category: "ai" },
    ]);
    expect(excluded.sort()).toEqual(["compare-with-base", "summarize-and-listen", "tts-play"]);
  });

  it("folder: over no record source (only a name), no Copy / Copy as / document rows — its own rows only", async () => {
    const raw = {
      registryActions: [{ id: "copy-markdown", label: "Copy as Markdown", category: "copy" }],
      copyVariantActions: [{ id: "copy-markdown", label: "Copy as Markdown", category: "copy" }],
      richDocCtx: { source: { type: "raw" } },
    } as unknown as Partial<ContextMenuActions>;
    const got = await ids(true, raw);
    expect(got).not.toContain("cm:copy");
    expect(got).not.toContain("cm:copy-as");
    expect(got).toEqual(expect.arrayContaining(["cm:x:rename", "cm:x:archive"]));
  });

  it("full menu: without the mode the editor rows are still there", async () => {
    const got = await ids(false);
    expect(got).toEqual(expect.arrayContaining(["cm:select-all", "cm:find", "cm:chat", "cm:compare"]));
  });
});
