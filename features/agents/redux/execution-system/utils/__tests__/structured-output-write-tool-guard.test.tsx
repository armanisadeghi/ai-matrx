/**
 * THE STRUCTURED-OUTPUT / WRITE-TARGET TRAP, as a guard.
 *
 * The break this catches, in one line: `buildToolInjection` offers
 * `apply_surface_write` (and the surface's client tools) to an agent whose
 * contract is to RETURN a structured object — the agent calls the tool instead
 * of answering and the run sits `paused` forever (proven live 2026-08-18,
 * `masterwork.rule_improver`).
 *
 * SUT: the real `buildToolInjection`. It OWNS the decision under test — which
 * tool specs come out for this conversation — and nothing about that decision
 * is stubbed. What IS stubbed is what it CALLS: the surface manifest registry
 * (a page's declaration), Supabase (the network), and the capability
 * registration side-effect module (a module graph, not logic). The live
 * surface stack, the write-target policy resolution, the client-tool handler
 * registry, the agent-definition slice and the guard itself are all real.
 *
 * The forcing function is the returned `tools` array: the write tool and the
 * client tool can only appear there if the injection walked the mounted
 * surface stack, resolved the ask/auto policy, found the registered handlers
 * and built the specs — and can only be absent if the guard read a real
 * output-contract declaration off the agent. A `return expected` SUT satisfies
 * neither case, because the two cases assert opposite arrays from the same
 * harness.
 *
 * The third case is the one that matters most in production: the agent record
 * in Redux carries NO `outputSchema` at all, because no execution RPC returns
 * that column. That is exactly the state a mandate launch leaves behind, so a
 * guard that only read the slice would let the trap through.
 */

const mockGetManifest = jest.fn();
const mockSelectIn = jest.fn();

jest.mock("@/features/surfaces/manifests/registry", () => ({
  getManifest: (name: string) => mockGetManifest(name),
}));

// The capability providers register a large client module graph that this
// decision does not touch. The registry itself stays real (it answers empty).
jest.mock(
  "@/features/agents/redux/execution-system/client-capabilities/register-all",
  () => ({}),
);

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({
          in: (_column: string, ids: string[]) => mockSelectIn(ids),
        }),
      }),
    }),
  }),
}));

import { act } from "react";
import { createRoot } from "react-dom/client";
import { buildToolInjection } from "../build-tool-injection";
import {
  registerSurfaceRuntime,
  useSurfaceClientTools,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { invalidateOutputSchemaCache } from "@/features/mandates/output-contract";
import { resetMandateCatalogueCache } from "@/features/mandates/catalogue";
import type { RootState } from "@/lib/redux/store";

// React 19 refuses `act` outside an act environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const SURFACE = "matrx-user/trap-test";

/**
 * A real manifest shape: one agent-writable target (`ask`, so it survives the
 * manual floor) and one client tool.
 */
const WRITE_TARGET = {
  name: "page_draft_content",
  label: "Draft content",
  description: "The page's draft body.",
  valueType: "string" as const,
  mode: "draft" as const,
  applyPolicy: "ask" as const,
};

const CLIENT_TOOL = {
  name: "trap_test_focus_field",
  description: "Move the page's focus to a field.",
  inputSchema: {
    type: "object" as const,
    properties: { field: { type: "string" as const } },
    required: ["field"],
  },
};

/**
 * The output schema an agent whose job is to RETURN an object declares — the
 * shape `agent.definition.output_schema` actually holds (name + JSON Schema),
 * as `parse-output-snapshot.ts` validates it.
 */
const RULE_IMPROVER_OUTPUT_SCHEMA = {
  name: "improved_rule",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      rule_text: { type: "string" as const },
      rationale: { type: "string" as const },
    },
    required: ["rule_text", "rationale"],
    additionalProperties: false,
  },
};

function makeState(args: {
  conversationId: string;
  agentId: string;
  /** `undefined` = the slice never loaded the field (every execution launch). */
  outputSchema?: typeof RULE_IMPROVER_OUTPUT_SCHEMA | null;
  mandateKey?: string | null;
}): RootState {
  const loadedFields: Record<string, true> = {
    name: true,
    modelId: true,
    tools: true,
  };
  const agent: Record<string, unknown> = {
    id: args.agentId,
    name: "Rule improver",
    tools: [],
    customTools: [],
    mcpServers: [],
    _loadedFields: loadedFields,
  };
  if (args.outputSchema !== undefined) {
    agent.outputSchema = args.outputSchema;
    loadedFields.outputSchema = true;
  }

  return {
    agentDefinition: { agents: { [args.agentId]: agent } },
    conversations: {
      byConversationId: {
        [args.conversationId]: {
          agentId: args.agentId,
          mandateKey: args.mandateKey ?? null,
          surfaceName: SURFACE,
        },
      },
    },
    instanceClientTools: { byConversationId: {} },
    instanceUIState: { byConversationId: {} },
    creatorDebug: { settings: {} },
    adminPreferences: {},
  } as unknown as RootState;
}

/**
 * Mounts the real surface stack: the runtime entry that carries the write
 * handler, plus a real React mount of `useSurfaceClientTools` (the only
 * registrar for client-tool handlers — there is no non-hook seam, and adding
 * one for a test would be a test-only helper on a production module).
 */
function mountSurface(): () => void {
  const unregisterRuntime = registerSurfaceRuntime(
    {
      surfaceName: SURFACE,
      getScope: () => ({}),
      getWriteHandlers: () => ({
        [WRITE_TARGET.name]: () => ({ ok: true }),
      }),
    },
    1,
  );

  function ClientToolHost() {
    useSurfaceClientTools(SURFACE, {
      [CLIENT_TOOL.name]: () => ({ focused: true }),
    });
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ClientToolHost />);
  });

  return () => {
    act(() => {
      root.unmount();
    });
    container.remove();
    unregisterRuntime();
  };
}

function toolNames(result: { tools?: Array<{ name?: string }> }): string[] {
  return (result.tools ?? []).map((spec) => spec.name ?? "");
}

describe("structured-output agents never receive the page's write tools", () => {
  let unmountSurface: () => void;
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    invalidateOutputSchemaCache();
    resetMandateCatalogueCache();
    mockGetManifest.mockReturnValue({
      writeTargets: [WRITE_TARGET],
      clientTools: [CLIENT_TOOL],
    });
    mockSelectIn.mockResolvedValue({ data: [], error: null });
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    unmountSurface = mountSurface();
  });

  afterEach(() => {
    unmountSurface();
    infoSpy.mockRestore();
  });

  it("offers apply_surface_write and the surface client tool to an agent with no output contract", async () => {
    const state = makeState({
      conversationId: "conv-plain",
      agentId: "agent-plain",
      outputSchema: null,
    });

    const result = await buildToolInjection(state, "conv-plain");

    expect(toolNames(result)).toEqual(
      expect.arrayContaining(["apply_surface_write", CLIENT_TOOL.name]),
    );
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("withholds both when the agent declares an output schema in the slice", async () => {
    const state = makeState({
      conversationId: "conv-structured",
      agentId: "agent-structured",
      outputSchema: RULE_IMPROVER_OUTPUT_SCHEMA,
    });

    const result = await buildToolInjection(state, "conv-structured");

    expect(toolNames(result)).not.toContain("apply_surface_write");
    expect(toolNames(result)).not.toContain(CLIENT_TOOL.name);
    // No silent suppression: the line names the agent, the evidence and the fix.
    const line = infoSpy.mock.calls[0]?.[0] as string;
    expect(line).toContain("Rule improver");
    expect(line).toContain("improved_rule");
    expect(line).toContain("apply_surface_write");
    expect(line).toContain("bind a non-structured agent to write the page");
  });

  it("withholds both when the contract lives only in the database (the mandate-launch state)", async () => {
    // No `outputSchema` key at all — precisely what `agx_get_execution_full`
    // leaves in the slice, and the state the live 2026-08-18 pause ran in.
    const state = makeState({
      conversationId: "conv-db-only",
      agentId: "agent-db-only",
      mandateKey: "masterwork.rule_improver",
    });
    mockSelectIn.mockResolvedValue({
      data: [
        { id: "agent-db-only", output_schema: RULE_IMPROVER_OUTPUT_SCHEMA },
      ],
      error: null,
    });

    const result = await buildToolInjection(state, "conv-db-only");

    expect(mockSelectIn).toHaveBeenCalledWith(["agent-db-only"]);
    expect(toolNames(result)).not.toContain("apply_surface_write");
    expect(toolNames(result)).not.toContain(CLIENT_TOOL.name);
  });

  it("does not pay for the by-id read on a surface with nothing to withhold", async () => {
    mockGetManifest.mockReturnValue({});
    const state = makeState({
      conversationId: "conv-no-targets",
      agentId: "agent-no-targets",
    });

    const result = await buildToolInjection(state, "conv-no-targets");

    expect(toolNames(result)).not.toContain("apply_surface_write");
    expect(mockSelectIn).not.toHaveBeenCalled();
  });
});
