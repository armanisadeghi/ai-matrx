/**
 * OWNER-TIE DEDUPE — a screen's own version of an action must beat a generic
 * copy at the same owner level, whatever order the rows arrive in.
 *
 * Reproduced live 2026-09-27: on `matrx-user/tasks` with text selected, the
 * menu ran `shortcut.generate_image_2` (generic, reads `selection`) and dropped
 * the tasks version (reads `active_task_description`), because every row is
 * owner `user` and the old dedupe kept whichever row came first.
 *
 * The rows below are Arman's Org's live Media rows in the exact order
 * `mandate.context_menu_view` emitted them.
 */

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

const ORG = "3e790542-fdaf-40b2-8bf3-658bf94fe67f";
const CAT = "06048a3b-86db-40f4-9092-c051f6374983";
const USER = "u-creator";

const LIVE_ROWS: [string, string | null, string][] = [
  ["shortcut.generate_image_2", null, "selection"],
  ["shortcut.generate_image_10", null, "selection"],
  ["shortcut.generate_image_11", null, "selection"],
  ["shortcut.generate_image_4", null, "selection"],
  ["shortcut.generate_image_3", null, "selection"],
  ["shortcut.generate_image_8", null, "selection"],
  ["shortcut.generate_image_9", null, "selection"],
  ["shortcut.generate_image_5", null, "selection"],
  ["shortcut.generate_image_6", null, "selection"],
  ["shortcut.generate_image_7", null, "selection"],
  [
    "shortcut.generate_image.matrx_user_agent_builder",
    "matrx-user/agent-builder",
    "agent_description",
  ],
  [
    "shortcut.generate_image.matrx_user_tasks",
    "matrx-user/tasks",
    "active_task_description",
  ],
  ["shortcut.generate_image", "matrx-default/default", "selection"],
];

function toShortcuts(rows: typeof LIVE_ROWS): AgentShortcutRecord[] {
  return rows.map(([key, surface, target]) => ({
    id: key,
    label: "Generate Image",
    categoryId: CAT,
    isActive: true,
    keyboardShortcut: null,
    surfaceName: surface,
    mandateKey: key,
    sortOrder: 0,
    valueMappings: {
      image_description: {
        target,
        mapType: "surface_value",
        required: target === "selection",
      },
    },
    userId: USER,
    organizationId: ORG,
    projectId: null,
    taskId: null,
  })) as unknown as AgentShortcutRecord[];
}

const categories = [
  {
    id: CAT,
    label: "Media",
    placementType: "ai-action",
    isActive: true,
    parentCategoryId: null,
    sortOrder: 0,
    userId: null,
    organizationId: ORG,
    projectId: null,
    taskId: null,
  },
] as unknown as AgentShortcutCategoryRecord[];

function flat(groups: AgentMenuCategoryGroup[]): AgentMenuCategoryGroup["items"] {
  return groups.flatMap((g) => [...g.items, ...flat(g.children)]);
}

function winner(
  rows: typeof LIVE_ROWS,
  surfaceName: string,
  availableKeys: string[],
  hasSelection: boolean,
): string[] {
  const groups = buildCategoryGroups({
    placementTypes: ["ai-action"],
    surfaceName,
    availableKeys: new Set(availableKeys),
    hasSelection,
    shortcuts: toShortcuts(rows),
    categories,
    contentBlocks: [],
  });
  return flat(groups)
    .filter((i) => i.label === "Generate Image")
    .map((i) => (i as { mandateKey?: string }).mandateKey ?? i.id);
}

/** Deterministic permutations: live order, reversed, and rotations. */
function orders(rows: typeof LIVE_ROWS): (typeof LIVE_ROWS)[] {
  const out = [rows, [...rows].reverse()];
  for (let k = 1; k < rows.length; k++) {
    out.push([...rows.slice(k), ...rows.slice(0, k)]);
  }
  return out;
}

describe("owner-tie dedupe prefers the screen's own version", () => {
  it("tasks screen, text selected: the tasks version wins in the live row order", () => {
    expect(
      winner(
        LIVE_ROWS,
        "matrx-user/tasks",
        ["selection", "active_task_description"],
        true,
      ),
    ).toEqual(["shortcut.generate_image.matrx_user_tasks"]);
  });

  it("tasks screen: the winner never depends on row order", () => {
    for (const rows of orders(LIVE_ROWS)) {
      for (const hasSelection of [true, false]) {
        expect(
          winner(
            rows,
            "matrx-user/tasks",
            ["selection", "active_task_description"],
            hasSelection,
          ),
        ).toEqual(["shortcut.generate_image.matrx_user_tasks"]);
      }
    }
  });

  it("agent builder screen: the agent-builder version wins in every row order", () => {
    for (const rows of orders(LIVE_ROWS)) {
      expect(
        winner(
          rows,
          "matrx-user/agent-builder",
          ["selection", "agent_description"],
          true,
        ),
      ).toEqual(["shortcut.generate_image.matrx_user_agent_builder"]);
    }
  });

  it("a screen with no own version: one generic copy wins, the same one in every order", () => {
    const seen = new Set<string>();
    for (const rows of orders(LIVE_ROWS)) {
      const w = winner(rows, "matrx-user/notes", ["selection"], true);
      expect(w).toHaveLength(1);
      seen.add(w[0]);
    }
    expect(seen.size).toBe(1);
  });

  it("owner level still outranks screen specificity", () => {
    const rows = toShortcuts(LIVE_ROWS);
    // Give one generic copy a task owner: it must beat the user-owned tasks version.
    const generic = rows.find((r) => r.id === "shortcut.generate_image_5")!;
    Object.assign(generic, { userId: null, organizationId: null, taskId: "task-1" });
    const groups = buildCategoryGroups({
      placementTypes: ["ai-action"],
      surfaceName: "matrx-user/tasks",
      availableKeys: new Set(["selection", "active_task_description"]),
      hasSelection: true,
      shortcuts: rows,
      categories,
      contentBlocks: [],
    });
    const items = flat(groups).filter((i) => i.label === "Generate Image");
    expect(items.map((i) => i.id)).toEqual(["shortcut.generate_image_5"]);
  });
});
