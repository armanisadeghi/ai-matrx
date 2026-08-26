/**
 * PLACEMENT FIDELITY — unit tests for the pure grouping function behind the
 * v3 context menu (`buildCategoryGroups`). This is the single fetch→grouping
 * seam: rows Arman creates in the admin UI (shortcuts, categories, content
 * blocks) pass through here on their way to the placement submenus.
 *
 * Certifies (with a synthetic fetch payload):
 *  - a row lands under exactly the category / placement it declares;
 *  - nested child categories nest under their parent;
 *  - an EMPTY category is returned (never dropped) so the UI can render it greyed;
 *  - a shortcut with no agent is KEPT (renderer disables it as "Not configured");
 *  - missing icon passes through as null (renderer falls back);
 *  - duplicate sort_order is deterministic (stable sort);
 *  - keyboard shortcuts pass through and drive scope-precedence dedupe;
 *  - sort orders are respected for categories (then label) and items.
 */

// The hook module imports redux plumbing; the pure function under test does
// not use it — mock the plumbing away so the import chain stays light.
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: jest.fn(),
  useAppSelector: jest.fn(),
}));
jest.mock("@/features/agents/redux/agent-shortcuts/thunks", () => ({
  fetchUnifiedMenu: jest.fn(),
}));
jest.mock("@/features/agents/redux/agent-shortcuts/selectors", () => ({
  selectAllShortcutsArray: jest.fn(),
}));
jest.mock("@/features/agents/redux/agent-shortcut-categories/selectors", () => ({
  selectAllCategoriesArray: jest.fn(),
}));
jest.mock("@/features/agent-connections/redux/skl/content-block-compat", () => ({
  selectAllContentBlocksArray: jest.fn(),
}));

import {
  buildCategoryGroups,
  type AgentMenuCategoryGroup,
} from "../useUnifiedAgentContextMenu";
import type { AgentShortcutRecord } from "@/features/agents/redux/agent-shortcuts/types";
import type { AgentShortcutCategoryRecord } from "@/features/agents/redux/agent-shortcut-categories/types";
import type { AgentContentBlockRecord } from "@/features/agent-connections/redux/skl/content-block-compat";

// ── Synthetic-row factories (only the fields the grouping reads) ────────────

function makeCategory(
  over: Partial<Record<string, unknown>> & { id: string; label: string },
): AgentShortcutCategoryRecord {
  return {
    placementType: "ai-action",
    parentCategoryId: null,
    sortOrder: 0,
    isActive: true,
    iconName: "Rocket",
    color: "#0ea5e9",
    enabledFeatures: null,
    userId: null,
    organizationId: null,
    projectId: null,
    taskId: null,
    ...over,
  } as unknown as AgentShortcutCategoryRecord;
}

function makeShortcut(
  over: Partial<Record<string, unknown>> & {
    id: string;
    label: string;
    categoryId: string;
  },
): AgentShortcutRecord {
  return {
    sortOrder: 0,
    isActive: true,
    iconName: "Zap",
    keyboardShortcut: null,
    agentId: "agent-1",
    surfaceName: null,
    enabledFeatures: null,
    userId: null,
    organizationId: null,
    projectId: null,
    taskId: null,
    ...over,
  } as unknown as AgentShortcutRecord;
}

function makeBlock(
  over: Partial<Record<string, unknown>> & {
    id: string;
    label: string;
    blockId: string;
  },
): AgentContentBlockRecord {
  return {
    categoryId: null,
    template: "Hello {{name}}",
    sortOrder: 0,
    isActive: true,
    iconName: null,
    enabledFeatures: null,
    userId: null,
    organizationId: null,
    projectId: null,
    taskId: null,
    ...over,
  } as unknown as AgentContentBlockRecord;
}

const ALL_PLACEMENTS = [
  "ai-action",
  "content-block",
  "user-tool",
  "organization-tool",
];

function build(args: {
  categories?: AgentShortcutCategoryRecord[];
  shortcuts?: AgentShortcutRecord[];
  contentBlocks?: AgentContentBlockRecord[];
  placementTypes?: string[];
  surfaceName?: string | null;
}): AgentMenuCategoryGroup[] {
  return buildCategoryGroups({
    placementTypes: args.placementTypes ?? ALL_PLACEMENTS,
    surfaceName: args.surfaceName ?? null,
    shortcuts: args.shortcuts ?? [],
    categories: args.categories ?? [],
    contentBlocks: args.contentBlocks ?? [],
  });
}

function find(
  groups: AgentMenuCategoryGroup[],
  id: string,
): AgentMenuCategoryGroup | null {
  for (const g of groups) {
    if (g.category.id === id) return g;
    const nested = find(g.children, id);
    if (nested) return nested;
  }
  return null;
}

describe("buildCategoryGroups — placement fidelity", () => {
  it("lands each row under exactly its declared placement/category", () => {
    const groups = build({
      categories: [
        makeCategory({ id: "cat-ai", label: "Writing", placementType: "ai-action" }),
        makeCategory({ id: "cat-cb", label: "Snippets", placementType: "content-block" }),
        makeCategory({ id: "cat-user", label: "My Stuff", placementType: "user-tool" }),
        makeCategory({ id: "cat-org", label: "Org Stuff", placementType: "organization-tool" }),
      ],
      shortcuts: [
        makeShortcut({ id: "s1", label: "Improve", categoryId: "cat-ai" }),
        makeShortcut({ id: "s2", label: "My Tool", categoryId: "cat-user" }),
        makeShortcut({ id: "s3", label: "Org Tool", categoryId: "cat-org" }),
      ],
      contentBlocks: [
        makeBlock({ id: "b1", label: "Greeting", blockId: "greeting", categoryId: "cat-cb" }),
      ],
    });

    expect(groups).toHaveLength(4);
    const byPlacement = new Map(
      groups.map((g) => [g.category.placementType, g]),
    );
    expect(byPlacement.get("ai-action")?.items.map((i) => i.label)).toEqual([
      "Improve",
    ]);
    expect(byPlacement.get("content-block")?.items.map((i) => i.label)).toEqual([
      "Greeting",
    ]);
    expect(byPlacement.get("user-tool")?.items.map((i) => i.label)).toEqual([
      "My Tool",
    ]);
    expect(
      byPlacement.get("organization-tool")?.items.map((i) => i.label),
    ).toEqual(["Org Tool"]);
    // Content block entries carry their template verbatim.
    const block = byPlacement.get("content-block")!.items[0];
    expect(block.entryType).toBe("content_block");
    if (block.entryType === "content_block") {
      expect(block.template).toBe("Hello {{name}}");
    }
  });

  it("nests child categories under their parent (grandchildren too)", () => {
    const groups = build({
      categories: [
        makeCategory({ id: "root", label: "Root", sortOrder: 1 }),
        makeCategory({ id: "child", label: "Child", parentCategoryId: "root" }),
        makeCategory({
          id: "grandchild",
          label: "Grandchild",
          parentCategoryId: "child",
        }),
      ],
      shortcuts: [
        makeShortcut({ id: "s1", label: "Deep", categoryId: "grandchild" }),
      ],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].category.id).toBe("root");
    expect(groups[0].children).toHaveLength(1);
    expect(groups[0].children[0].category.id).toBe("child");
    expect(groups[0].children[0].children[0].category.id).toBe("grandchild");
    expect(
      groups[0].children[0].children[0].items.map((i) => i.label),
    ).toEqual(["Deep"]);
  });

  it("keeps an EMPTY category (Arman must SEE where new items will land)", () => {
    const groups = build({
      categories: [
        makeCategory({ id: "empty", label: "Brand New Category" }),
      ],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].category.id).toBe("empty");
    expect(groups[0].items).toEqual([]);
    expect(groups[0].children).toEqual([]);
  });

  it("keeps a shortcut with NO agent (renders disabled, never vanishes)", () => {
    const groups = build({
      categories: [makeCategory({ id: "c", label: "C" })],
      shortcuts: [
        makeShortcut({ id: "s1", label: "Unwired", categoryId: "c", agentId: null }),
      ],
    });
    const g = find(groups, "c")!;
    expect(g.items).toHaveLength(1);
    const entry = g.items[0];
    expect(entry.label).toBe("Unwired");
    expect(entry.entryType === "agent_shortcut" && entry.agentId).toBeNull();
  });

  it("passes a missing icon through as null (renderer falls back)", () => {
    const groups = build({
      categories: [makeCategory({ id: "c", label: "C", iconName: null })],
      shortcuts: [
        makeShortcut({ id: "s1", label: "NoIcon", categoryId: "c", iconName: null }),
      ],
    });
    const g = find(groups, "c")!;
    expect(g.category.iconName).toBeNull();
    expect(g.items[0].iconName).toBeNull();
  });

  it("respects sortOrder for categories (label breaks ties) and items; duplicate sort_order is stable", () => {
    const groups = build({
      categories: [
        makeCategory({ id: "b", label: "Beta", sortOrder: 5 }),
        makeCategory({ id: "a", label: "Alpha", sortOrder: 5 }),
        makeCategory({ id: "z", label: "Zed", sortOrder: 1 }),
      ],
      shortcuts: [
        makeShortcut({ id: "s3", label: "Third", categoryId: "z", sortOrder: 9 }),
        makeShortcut({ id: "s1", label: "First", categoryId: "z", sortOrder: 1 }),
        // Duplicate sortOrder — stable sort keeps input order (Second before Second-B).
        makeShortcut({ id: "s2", label: "Second", categoryId: "z", sortOrder: 5 }),
        makeShortcut({ id: "s2b", label: "Second-B", categoryId: "z", sortOrder: 5 }),
      ],
    });
    // Category order: sortOrder asc, then label.
    expect(groups.map((g) => g.category.id)).toEqual(["z", "a", "b"]);
    // Item order inside "z".
    expect(find(groups, "z")!.items.map((i) => i.label)).toEqual([
      "First",
      "Second",
      "Second-B",
      "Third",
    ]);
  });

  it("passes the keyboard shortcut through and dedupes on it by scope precedence", () => {
    const groups = build({
      categories: [makeCategory({ id: "c", label: "C" })],
      shortcuts: [
        makeShortcut({
          id: "global-version",
          label: "Fix Grammar",
          categoryId: "c",
          keyboardShortcut: "mod+g",
        }),
        makeShortcut({
          id: "user-version",
          label: "Fix Grammar (mine)",
          categoryId: "c",
          keyboardShortcut: "mod+g",
          userId: "user-1",
        }),
      ],
    });
    const items = find(groups, "c")!.items;
    // User scope outranks global for the same keyboard shortcut.
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("user-version");
    expect(
      items[0].entryType === "agent_shortcut" && items[0].keyboardShortcut,
    ).toBe("mod+g");
  });

  it("drops rows for placements the menu did not request", () => {
    const groups = build({
      placementTypes: ["ai-action"],
      categories: [
        makeCategory({ id: "ai", label: "AI", placementType: "ai-action" }),
        makeCategory({ id: "org", label: "Org", placementType: "organization-tool" }),
      ],
      shortcuts: [
        makeShortcut({ id: "s1", label: "Keep", categoryId: "ai" }),
        makeShortcut({ id: "s2", label: "Drop", categoryId: "org" }),
      ],
    });
    expect(groups.map((g) => g.category.id)).toEqual(["ai"]);
    expect(find(groups, "ai")!.items.map((i) => i.label)).toEqual(["Keep"]);
  });

  it("drops inactive rows and inactive categories", () => {
    const groups = build({
      categories: [
        makeCategory({ id: "on", label: "On" }),
        makeCategory({ id: "off", label: "Off", isActive: false }),
      ],
      shortcuts: [
        makeShortcut({ id: "s1", label: "Live", categoryId: "on" }),
        makeShortcut({ id: "s2", label: "Dead", categoryId: "on", isActive: false }),
      ],
    });
    expect(groups.map((g) => g.category.id)).toEqual(["on"]);
    expect(find(groups, "on")!.items.map((i) => i.label)).toEqual(["Live"]);
  });

  it("surface-matched shortcuts are first-class; foreign-surface exclusives stay hidden; legacy context matches are flagged", () => {
    const groups = build({
      surfaceName: "matrx/notes",
      categories: [makeCategory({ id: "c", label: "C" })],
      shortcuts: [
        makeShortcut({
          id: "modern",
          label: "Modern",
          categoryId: "c",
          surfaceName: "matrx/notes",
        }),
        makeShortcut({
          id: "foreign",
          label: "Foreign",
          categoryId: "c",
          surfaceName: "matrx/other-surface",
        }),
        makeShortcut({ id: "legacy", label: "Legacy", categoryId: "c" }),
      ],
    });
    const items = find(groups, "c")!.items;
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get("modern")?.legacyMatch).toBe(false);
    expect(byId.has("foreign")).toBe(false);
    expect(byId.get("legacy")?.legacyMatch).toBe(true);
  });
});
