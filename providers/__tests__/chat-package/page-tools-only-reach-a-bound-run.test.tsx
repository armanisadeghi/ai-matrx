/**
 * PAGE TOOLS REACH ONLY A RUN BOUND TO THAT PAGE (Arman, 2026-10-03).
 *
 * The break this catches: `buildToolInjection` read page tools off the GLOBAL
 * mounted provider stack, so any run built while a page was mounted got that
 * page's `apply_surface_write` + client tools — a background JSON extraction
 * (`runHeadlessAgentJson`), a launch that opted out of the page
 * (`surfaceName: null`), a window bound to another screen. The structured job
 * called the write tool instead of answering, the server parked the turn for a
 * browser result nobody sent, and the run hung.
 *
 * SUT: the real `buildToolInjection`. The surface stack, the write-target
 * policy resolution and the client-tool handler registry are real; only the
 * manifest registry (a page's declaration), Supabase and the capability
 * registration side-effect module are stubbed. Every case mounts the SAME page
 * and varies only the conversation — so the tool list can differ only if the
 * injection reads the conversation's binding.
 */

const mockGetManifest = jest.fn();

jest.mock("@ai-matrx/chat/surfaces/runtime/registry", () => ({
  getDeclaringSurface: () => null,
  getManifest: mockGetManifest,
  peekSurfaceBody: (n: string) => (mockGetManifest)(n),
  peekSurfaceValue: (n: string, v: string) => (mockGetManifest)(n)?.values?.find((x: { name: string }) => x.name === v),
  loadSurfaceBody: async (n: string) => (mockGetManifest)(n),
  awaitSurfaceBodies: async () => ({ missing: [], waitedMs: 0 }),
  awaitSendSurfaceBodies: async () => [],
  takeSurfaceWithheldWarning: () => null,
  prefetchSurfaceBodies: () => {},
  isIndexedSurfaceClientToolName: () => false,
  useSurfaceBody: (n: string) => ({ status: "ready", body: (mockGetManifest)(n) }),
  getSurfaceChildren: () => [],
  getSurfaceAncestry: (name: string) =>
    name === "matrx-user/page-child" ? ["matrx-user/page-a"] : [],
}));

jest.mock("@ai-matrx/chat/agents/redux/execution-system/client-capabilities/register-all", () => ({}));

jest.mock("@/lib/supabase/hasBrowserSession", () => ({
  hasBrowserSession: async () => true,
}));

// No agent declares an output schema — the binding alone must decide.
jest.mock("@ai-matrx/chat/host/db", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({
          in: async () => ({ data: [], error: null }),
        }),
      }),
    }),
  }),
}));

import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  buildToolInjection,
  buildUserToolOverrides,
  resolveClientSurface,
} from "@ai-matrx/chat/agents/redux/execution-system/utils/build-tool-injection";
import type { ToolInjectionResult } from "@ai-matrx/chat/agents/types/tool-injection.types";
import {
  registerSurfaceRuntime,
  useSurfaceClientTools,
} from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { invalidateOutputSchemaCache } from "@ai-matrx/chat/mandates/output-contract";
import { resetMandateCatalogueCache } from "@/features/mandates/catalogue";
import type { ChatRootState } from "@ai-matrx/chat/store/root-state";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const PAGE = "matrx-user/page-a";

const WRITE_TARGET = {
  name: "page_draft_content",
  label: "Draft content",
  description: "The page's draft body.",
  valueType: "string" as const,
  mode: "draft" as const,
  applyPolicy: "ask" as const,
};

const CLIENT_TOOL = {
  name: "page_a_focus_field",
  description: "Move the page's focus to a field.",
  inputSchema: {
    type: "object" as const,
    properties: { field: { type: "string" as const } },
    required: ["field"],
  },
};

function makeState(conv: {
  surfaceName?: string | null;
  displayMode?: string;
  jsonExtraction?: { enabled: boolean } | null;
  builderAdvancedSettings?: Record<string, unknown>;
  agentAutoToolsDisabled?: boolean;
}): ChatRootState {
  return {
    agentDefinition: {
      agents: {
        "agent-1": {
          id: "agent-1",
          name: "Any agent",
          tools: [],
          customTools: [],
          mcpServers: [],
          outputSchema: null,
          autoToolsDisabled: conv.agentAutoToolsDisabled ?? false,
          _loadedFields: { name: true, tools: true, outputSchema: true },
        },
      },
    },
    conversations: {
      byConversationId: {
        conv: {
          agentId: "agent-1",
          mandateKey: null,
          surfaceName: conv.surfaceName ?? null,
        },
      },
    },
    instanceClientTools: { byConversationId: {} },
    instanceUIState: {
      byConversationId: {
        conv: {
          conversationId: "conv",
          displayMode: conv.displayMode ?? "panel",
          jsonExtraction: conv.jsonExtraction ?? null,
          builderAdvancedSettings: conv.builderAdvancedSettings ?? {},
        },
      },
    },
    creatorDebug: { settings: {} },
    adminPreferences: {},
  } as unknown as ChatRootState;
}

function mountPage(): () => void {
  const unregister = registerSurfaceRuntime(
    {
      surfaceName: PAGE,
      getScope: () => ({}),
      getWriteHandlers: () => ({ [WRITE_TARGET.name]: () => {} }),
    },
    1,
  );
  function ClientToolHost() {
    useSurfaceClientTools(PAGE, { [CLIENT_TOOL.name]: () => ({ ok: true }) });
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ClientToolHost />);
  });
  return () => {
    act(() => root.unmount());
    container.remove();
    unregister();
  };
}

function toolNames(result: ToolInjectionResult): string[] {
  return (result.tools ?? []).map((spec) => (spec.kind === "agent" ? "" : spec.name));
}

const PAGE_TOOLS = ["apply_surface_write", CLIENT_TOOL.name];

describe("page tools reach only a run bound to that page", () => {
  let unmount: () => void;
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    invalidateOutputSchemaCache();
    resetMandateCatalogueCache();
    mockGetManifest.mockImplementation((name: string) =>
      name === PAGE ? { writeTargets: [WRITE_TARGET], clientTools: [CLIENT_TOOL] } : {},
    );
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    unmount = mountPage();
  });

  afterEach(() => {
    unmount();
    infoSpy.mockRestore();
  });

  it("a run launched on the page receives the page's tools", async () => {
    const result = await buildToolInjection(makeState({ surfaceName: PAGE }), "conv");
    expect(toolNames(result)).toEqual(expect.arrayContaining(PAGE_TOOLS));
  });

  it("a run launched on a child surface inherits its ancestor page's tools", async () => {
    const result = await buildToolInjection(
      makeState({ surfaceName: "matrx-user/page-child" }),
      "conv",
    );
    expect(toolNames(result)).toEqual(expect.arrayContaining(PAGE_TOOLS));
  });

  it("a run with no surface binding receives none (the surfaceName:null opt-out)", async () => {
    const result = await buildToolInjection(makeState({ surfaceName: null }), "conv");
    for (const name of PAGE_TOOLS) expect(toolNames(result)).not.toContain(name);
    expect(infoSpy.mock.calls[0]?.[0]).toContain("not bound");
  });

  it("a run bound to another screen receives none", async () => {
    const result = await buildToolInjection(
      makeState({ surfaceName: "matrx-user/other-window" }),
      "conv",
    );
    for (const name of PAGE_TOOLS) expect(toolNames(result)).not.toContain(name);
  });

  it("a background run receives none even when stamped with the page", async () => {
    const result = await buildToolInjection(
      makeState({ surfaceName: PAGE, displayMode: "background" }),
      "conv",
    );
    for (const name of PAGE_TOOLS) expect(toolNames(result)).not.toContain(name);
  });

  it("a JSON-answer run (runHeadlessAgentJson) receives none even in a visible mode", async () => {
    const result = await buildToolInjection(
      makeState({ surfaceName: PAGE, displayMode: "panel", jsonExtraction: { enabled: true } }),
      "conv",
    );
    for (const name of PAGE_TOOLS) expect(toolNames(result)).not.toContain(name);
  });

  it("the person's auto-tools switch OFF withholds page tools; ON overrides an agent that disabled them", async () => {
    const off = await buildToolInjection(
      makeState({ surfaceName: PAGE, builderAdvancedSettings: { autoTools: false } }),
      "conv",
    );
    for (const name of PAGE_TOOLS) expect(toolNames(off)).not.toContain(name);

    const agentOff = await buildToolInjection(
      makeState({ surfaceName: PAGE, agentAutoToolsDisabled: true }),
      "conv",
    );
    for (const name of PAGE_TOOLS) expect(toolNames(agentOff)).not.toContain(name);

    const personOn = await buildToolInjection(
      makeState({
        surfaceName: PAGE,
        agentAutoToolsDisabled: true,
        builderAdvancedSettings: { autoTools: true },
      }),
      "conv",
    );
    expect(toolNames(personOn)).toEqual(expect.arrayContaining(PAGE_TOOLS));
  });

  it("a run without an interface never borrows the route's surface", () => {
    expect(
      resolveClientSurface(makeState({ displayMode: "background" }), "conv"),
    ).toBeUndefined();
  });
});

/**
 * A RUN ON AN ITEM KEEPS THE SURFACE THAT HOLDS THE ITEM (Board, 2026-10-04).
 * Real turn (conversation 051d7738, test@test.com): the Board's side chat had
 * board_read / board_open_item / board_item_act while no tile was live, and
 * lost ALL of them the moment a tile became live (the conversation follows the
 * active surface, so its stamp became the tile's surface, and the binding only
 * accepted the stamp and its inheritance ancestors). The agent then called
 * board_item_act and the server refused it ("not available here").
 */
describe("a run stamped with a surface nested in a host keeps the host's tools", () => {
  const TILE = "matrx-user/tile-b";
  const OTHER = "matrx-user/unrelated";
  const TILE_TOOL = { ...CLIENT_TOOL, name: "tile_b_do" };
  const OTHER_TOOL = { ...CLIENT_TOOL, name: "unrelated_do" };
  let unmount: () => void;
  let infoSpy: jest.SpyInstance;

  function mountNested(): () => void {
    const cleanups = [mountPage()];
    cleanups.push(
      registerSurfaceRuntime({ surfaceName: TILE, getScope: () => ({}), getWriteHandlers: () => ({}) }, 2),
    );
    cleanups.push(
      registerSurfaceRuntime({ surfaceName: OTHER, getScope: () => ({}), getWriteHandlers: () => ({}) }, 2),
    );
    function Host() {
      useSurfaceClientTools(TILE, { [TILE_TOOL.name]: () => ({ ok: true }) });
      useSurfaceClientTools(OTHER, { [OTHER_TOOL.name]: () => ({ ok: true }) });
      return null;
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Host />));
    return () => {
      act(() => root.unmount());
      container.remove();
      cleanups.forEach((c) => c());
    };
  }

  beforeEach(() => {
    invalidateOutputSchemaCache();
    resetMandateCatalogueCache();
    mockGetManifest.mockImplementation((name: string) =>
      name === PAGE
        ? { writeTargets: [WRITE_TARGET], clientTools: [CLIENT_TOOL] }
        : name === TILE
          ? { clientTools: [TILE_TOOL] }
          : name === OTHER
            ? { clientTools: [OTHER_TOOL] }
            : {},
    );
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    unmount = mountNested();
  });
  afterEach(() => {
    unmount();
    infoSpy.mockRestore();
  });

  it("a run stamped with the nested surface still receives the host page's tools", async () => {
    const result = await buildToolInjection(makeState({ surfaceName: TILE }), "conv");
    expect(toolNames(result)).toEqual(expect.arrayContaining([CLIENT_TOOL.name, TILE_TOOL.name]));
  });

  it("a sibling mounted beside the stamp (not around it) is still withheld", async () => {
    const result = await buildToolInjection(makeState({ surfaceName: TILE }), "conv");
    expect(toolNames(result)).not.toContain(OTHER_TOOL.name);
  });

  it("the host's tools do not leak DOWN: a run stamped with the host gets no tile tools", async () => {
    const result = await buildToolInjection(makeState({ surfaceName: PAGE }), "conv");
    expect(toolNames(result)).not.toContain(TILE_TOOL.name);
  });
});

/**
 * THE WRITE TOOL POINTS AT THE HOST'S WAY IN (Board, 2026-10-04). On a Board
 * the injected `apply_surface_write` lists only the LIVE item's targets; an
 * agent that wanted another item's cell called it anyway ("declares no write
 * target") or went searching with knowledge_search. A mounted surface's
 * `otherItemsHint` rides in that tool's description.
 */
describe("apply_surface_write carries the mounted host's otherItemsHint", () => {
  const HINT = "HOST-HINT: other items are reached with board_open_item then board_item_act.";
  let unmount: () => void;
  let infoSpy: jest.SpyInstance;
  beforeEach(() => {
    invalidateOutputSchemaCache();
    resetMandateCatalogueCache();
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    unmount();
    infoSpy.mockRestore();
  });
  function description(result: ToolInjectionResult): string {
    const spec = (result.tools ?? []).find((t) => t.kind === "inline" && t.name === "apply_surface_write");
    return spec && spec.kind === "inline" ? String(spec.description) : "";
  }

  it("states the hint when the surface that declares it is mounted", async () => {
    mockGetManifest.mockImplementation((name: string) =>
      name === PAGE ? { writeTargets: [WRITE_TARGET], clientTools: [CLIENT_TOOL], otherItemsHint: HINT } : {},
    );
    unmount = mountPage();
    const result = await buildToolInjection(makeState({ surfaceName: PAGE }), "conv");
    expect(description(result)).toContain(HINT);
  });

  it("says nothing extra when no mounted surface declares one", async () => {
    mockGetManifest.mockImplementation((name: string) =>
      name === PAGE ? { writeTargets: [WRITE_TARGET], clientTools: [CLIENT_TOOL] } : {},
    );
    unmount = mountPage();
    const result = await buildToolInjection(makeState({ surfaceName: PAGE }), "conv");
    expect(description(result)).not.toContain("HOST-HINT");
    expect(description(result)).toContain("Available targets right now");
  });
});

/**
 * A DORMANT TILE KEEPS ITS HOST (Board side chat, 2026-10-04). A side chat
 * opened (or restamped) while a table tile was live carries the TILE's surface
 * as its stamp. The moment the tile is deselected its surface unmounts, so
 * "mounted around the stamp" is false and the Board's tools (board_read,
 * board_open_item, board_item_act) vanished mid-conversation — the agent fell
 * back to knowledge_search / apply_surface_write. The binding must remember
 * which host a surface was mounted inside and keep that host's tools while the
 * host is still open.
 */
describe("a run stamped with a surface that has since closed keeps the host it was inside", () => {
  const HOST = "matrx-user/host-board";
  const TILE_GONE = "matrx-user/tile-gone";
  const HOST_TOOL = { ...CLIENT_TOOL, name: "host_board_read" };
  const cleanups: Array<() => void> = [];
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    invalidateOutputSchemaCache();
    resetMandateCatalogueCache();
    mockGetManifest.mockImplementation((name: string) =>
      name === HOST ? { clientTools: [HOST_TOOL] } : {},
    );
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    cleanups.push(
      registerSurfaceRuntime({ surfaceName: HOST, getScope: () => ({}), getWriteHandlers: () => ({}) }, 1),
    );
    function Host() {
      useSurfaceClientTools(HOST, { [HOST_TOOL.name]: () => ({ ok: true }) });
      return null;
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Host />));
    cleanups.push(() => {
      act(() => root.unmount());
      container.remove();
    });
  });
  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
    infoSpy.mockRestore();
  });

  it("the tile was live (mounted inside the host), then went dormant: the host's tools still reach the run", async () => {
    const closeTile = registerSurfaceRuntime(
      { surfaceName: TILE_GONE, getScope: () => ({}), getWriteHandlers: () => ({}) },
      2,
    );
    const live = await buildToolInjection(makeState({ surfaceName: TILE_GONE }), "conv");
    expect(toolNames(live)).toContain(HOST_TOOL.name);
    closeTile();
    const dormant = await buildToolInjection(makeState({ surfaceName: TILE_GONE }), "conv");
    expect(toolNames(dormant)).toContain(HOST_TOOL.name);
  });

  it("a stamp that was never inside the host gets none of its tools", async () => {
    const dormant = await buildToolInjection(
      makeState({ surfaceName: "matrx-user/never-inside" }),
      "conv",
    );
    expect(toolNames(dormant)).not.toContain(HOST_TOOL.name);
  });
});

describe("the person's tool decisions travel as the USER layer", () => {
  it("picks → user.add, removals → user.remove, the switch → user.auto_tools; never tools[]", async () => {
    const state = makeState({
      surfaceName: null,
      builderAdvancedSettings: {
        addedTools: ["tool-id-1", "tool-id-1", "tool-id-2"],
        removedTools: ["web_search"],
        autoTools: false,
      },
    });
    expect(buildUserToolOverrides(state, "conv")).toEqual({
      add: ["tool-id-1", "tool-id-2"],
      remove: ["web_search"],
      auto_tools: false,
    });
    const result = await buildToolInjection(state, "conv");
    expect(toolNames(result)).not.toContain("tool-id-1");
  });

  it("the switch is omitted while it follows the agent", () => {
    expect(buildUserToolOverrides(makeState({}), "conv")).toEqual({});
  });
});
