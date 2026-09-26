/**
 * ONE REGISTRY TREE BEHIND EVERY MENU (RC-B6 round 2, owner's bar).
 *
 * The verifier found the right-click on a chat answer to be a different tree
 * from the ⋯ menu: registry actions regrouped under Convert / Export /
 * History / "Document", a second AI family (AI Actions, Agents, My Items, Org
 * Items) beside "Improve with AI", and "Regenerate answer" twice.
 *
 * The guard: for one content source, the ⋯ tree (AdvancedMenu / ProTextarea
 * list — `buildMenuTree(registryMenuActions)`; the bar's ⋯ and the standalone
 * ⋯/sheet are the Alchemy package's layouts over the same registry, ALC-15)
 * and the right-click model (context-menu v3 `buildMenuModel`, which the phone
 * sheet also renders) list the SAME registry ids in the SAME order and
 * grouping; the agent libraries live inside the AI submenu; nothing repeats.
 */
jest.mock("@/features/context-menu-v3/hooks/useContextMenuActions", () => ({
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

import * as fs from "fs";
import * as path from "path";
import "../actions/handlers";
import { resolveActions } from "../actions/provider";
import {
  AI_SUBMENU_LABEL,
  buildMenuTree,
  flattenMenuTreeIds,
  registryMenuActions,
  withAiSlot,
} from "../variants/shared/menuStructure";
import { chatContext } from "../test-utils/chatContext";
import {
  buildMenuModel,
  type MenuNode,
} from "@/features/context-menu-v3/model/menu-model";
import type { ContextMenuActions } from "@/features/context-menu-v3/hooks/useContextMenuActions";

const noop = () => {};

function engine(registryActions: ContextMenuActions["registryActions"], ctx: unknown): ContextMenuActions {
  const aiGroup = {
    category: {
      id: "cat-writing",
      label: "Writing",
      placementType: "ai-action",
      parentCategoryId: null,
      sortOrder: 0,
      iconName: null,
      color: "#0ea5e9",
      isActive: true,
    },
    items: [
      {
        entryType: "agent_shortcut",
        scopeLevel: "global",
        legacyMatch: false,
        id: "s-improve",
        label: "Improve Writing",
        categoryId: "cat-writing",
        agentId: "a1",
        iconName: null,
        keyboardShortcut: null,
        sortOrder: 0,
        isActive: true,
      },
    ],
    children: [],
  };
  return {
    scope: { content: "answer" },
    actionText: { text: "answer", source: "content" },
    jsonSection: null,
    resolvedPlacementMode: {
      "ai-action": "show",
      "bound-agent": "show",
      "content-block": "hide",
      "organization-tool": "show",
      "user-tool": "show",
      "quick-action": "show",
    },
    categoryGroups: [aiGroup],
    grouped: { "ai-action": [aiGroup] },
    loading: false,
    boundAgentSections: [
      { key: "public", label: "Public", sortOrder: 1, agents: [{ agentId: "a2", name: "Summarizer" }] },
    ],
    boundAgentsLoading: false,
    richDocCtx: ctx,
    registryActions,
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
  } as unknown as ContextMenuActions;
}

/** Registry ids (and submenu labels) in model order, library rows excluded. */
function registryIdsInModel(nodes: MenuNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.kind === "item" && n.id.startsWith("rich:")) out.push(n.id.slice(5));
    if (n.kind === "submenu" && n.id.startsWith("rich-sub:")) {
      out.push(`submenu:${n.label}`);
      out.push(...registryIdsInModel(n.children));
    }
  }
  return out;
}

function allIds(nodes: MenuNode[]): string[] {
  return nodes.flatMap((n) =>
    n.kind === "submenu" ? [n.id, ...allIds(n.children)] : n.kind === "separator" ? [] : [n.id],
  );
}

describe("one registry tree behind every menu", () => {
  const ctx = chatContext("assistant");
  const menuActions = registryMenuActions(resolveActions(ctx));
  // The ⋯ tree for a host that carries the agent libraries (the ⋯ on a
  // right-clickable answer opens that very menu): the AI submenu is present.
  const tree = buildMenuTree(menuActions);
  const dotsIds = flattenMenuTreeIds({ ...tree, submenus: withAiSlot(tree.submenus, true) });
  const model = buildMenuModel(engine(menuActions, ctx), {
    selectedText: "",
    isEditable: false,
    canUndo: false,
    canRedo: false,
    hasHistory: false,
  });

  it("the right-click (and the phone sheet, which renders the same model) lists the ⋯ tree exactly", () => {
    const registry = model.sections.find((s) => s.id === "registry");
    expect(registry).toBeDefined();
    expect(registryIdsInModel(registry!.nodes)).toEqual(dotsIds);
  });

  it("no second AI family: the agent libraries are inside the AI submenu", () => {
    expect(model.sections.some((s) => s.group === "ai")).toBe(false);
    const registry = model.sections.find((s) => s.id === "registry")!;
    const ai = registry.nodes.find(
      (n) => n.kind === "submenu" && n.label === AI_SUBMENU_LABEL,
    );
    expect(ai && ai.kind === "submenu" ? allIds(ai.children) : []).toEqual(
      expect.arrayContaining(["placement:ai-action", "placement:bound-agent"]),
    );
  });

  it("no content verb is drawn twice (no Copy as / Export / Convert / Compare beside the registry)", () => {
    const ids = model.sections.flatMap((s) => allIds(s.nodes));
    for (const legacy of ["copy-as", "export", "convert", "compare", "listen"]) {
      expect(ids).not.toContain(legacy);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("Regenerate appears once", () => {
    const labels = model.sections
      .flatMap((s) => s.nodes)
      .flatMap(function walk(n: MenuNode): string[] {
        return n.kind === "submenu" ? n.children.flatMap(walk) : "label" in n ? [n.label] : [];
      });
    expect(labels.filter((l) => /regenerate/i.test(l)).length).toBeLessThanOrEqual(1);
  });

  it("every menu host builds from the one selector and the one tree", () => {
    const hosts = [
      "../variants/RegistryActionMenu.tsx",
      "../variants/RegistryActionList.tsx",
      "../../context-menu-v3/model/menu-model.ts",
    ];
    for (const rel of hosts) {
      const src = fs.readFileSync(path.join(__dirname, rel), "utf8");
      expect(src).toMatch(/buildMenuTree\(/);
    }
    // The phone sheet, the right-click and the palette are the Alchemy
    // package's layouts over ONE model built from the ONE engine (ALC-15 S3).
    const content = fs.readFileSync(
      path.join(__dirname, "../../context-menu-v3/components/AlchemyMenuContent.tsx"),
      "utf8",
    );
    expect(content).toMatch(/buildMenuModel\(/);
    expect(content).toMatch(/@ai-matrx\/alchemy\/react\/sheet/);
    expect(content).not.toMatch(/copyVariantActions|placementSubmenu\(/);
  });
});
