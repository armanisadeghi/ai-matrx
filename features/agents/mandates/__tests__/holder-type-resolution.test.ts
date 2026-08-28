/**
 * THE HOLDER GATE — a binding whose Holder is not an agent must REFUSE, never
 * degrade to the system default.
 *
 * The latent defect these pin: `agent.mandate_binding` accepts
 * `holder_type='workflow'`, and such a row carries NO `agent_id` by
 * construction. The client resolver never read `holder_type`, so a workflow
 * binding fell straight through `if (binding.agent_id)` and `resolveMandate`
 * returned the SYSTEM DEFAULT agent with `provenance: "system"` — the user's
 * deliberate binding silently evaporating while the caller was told the
 * platform default was in charge.
 *
 * Workflow Holders now EXECUTE — on the server (aidream
 * `services/mandates/workflow_holder.py`). This browser-side resolver still
 * cannot run one: its whole job is handing `POST /agents/{id}` an agent id, so
 * it has no channel to start a workflow run. It must therefore keep refusing,
 * and the refusal must name that real reason rather than claiming the feature
 * does not exist.
 */

import {
  EXECUTABLE_HOLDER_TYPES,
  holderNotExecutableMessage,
  parseBindingWave1,
} from "../provision-shapes";

type Row = Record<string, unknown>;

interface Scenario {
  userId: string | null;
  orgBindings: Row[];
  userBinding: Row | null;
}

const MANDATE_ID = "0f2a1f1e-1111-4c4c-9c9c-aaaaaaaaaaaa";
const SYSTEM_AGENT_ID = "11111111-2222-4333-8444-555555555555";
const BOUND_AGENT_ID = "99999999-8888-4777-8666-555555555555";

const MANDATE_ROW: Row = {
  id: MANDATE_ID,
  mandate_key: "workflow.contract_check",
  is_enabled: true,
  use_latest: true,
  default_agent_id: SYSTEM_AGENT_ID,
  contract: null,
  input_kind: null,
  output_kind: null,
  provision_key: null,
  pins: null,
  pinned_context: null,
};

let scenario: Scenario = { userId: null, orgBindings: [], userBinding: null };

interface Chain {
  select: (columns?: string) => Chain;
  eq: (column: string, value: unknown) => Chain;
  is: (column: string, value: unknown) => Chain;
  order: (column: string, options?: unknown) => Chain;
  limit: (count: number) => Promise<{ data: Row[]; error: null }>;
  maybeSingle: () => Promise<{ data: Row | null; error: null }>;
}

function makeChain(table: string): Chain {
  const chain: Chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    limit: async () => ({ data: scenario.orgBindings, error: null }),
    maybeSingle: async () => ({
      data: table === "mandate" ? MANDATE_ROW : scenario.userBinding,
      error: null,
    }),
  };
  return chain;
}

const mockSupabaseClient = {
  schema: () => ({ from: (table: string) => makeChain(table) }),
  auth: {
    getUser: async () => ({
      data: { user: scenario.userId ? { id: scenario.userId } : null },
    }),
  },
};

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => mockSupabaseClient,
}));

// Imported after the mock so the resolver picks up the fake client.
import { invalidateMandateCache, resolveMandate } from "../service";

beforeEach(() => {
  scenario = {
    userId: "cccccccc-dddd-4eee-8fff-000000000000",
    orgBindings: [],
    userBinding: null,
  };
  invalidateMandateCache();
});

describe("parseBindingWave1 — the declared holder type, verbatim", () => {
  it("reads the declared holder type without collapsing it", () => {
    expect(parseBindingWave1({ holder_type: "workflow" }).holderType).toBe(
      "workflow",
    );
    expect(parseBindingWave1({ holder_type: "agent" }).holderType).toBe("agent");
  });

  it("reads an absent or blank holder type as 'agent' (the server's default)", () => {
    expect(parseBindingWave1({}).holderType).toBe("agent");
    expect(parseBindingWave1({ holder_type: "" }).holderType).toBe("agent");
    expect(parseBindingWave1(null).holderType).toBe("agent");
  });

  it("does NOT masquerade an unrecognized holder type as an agent", () => {
    // The failure mode this replaced: anything-not-'workflow' became 'agent',
    // so a third Holder kind would have executed as if it were an agent.
    const parsed = parseBindingWave1({ holder_type: "orchestra" });
    expect(parsed.holderType).toBe("orchestra");
    expect(EXECUTABLE_HOLDER_TYPES.has(parsed.holderType)).toBe(false);
  });

  it("names only 'agent' as executable in this wave", () => {
    expect(EXECUTABLE_HOLDER_TYPES.has("agent")).toBe(true);
    expect(EXECUTABLE_HOLDER_TYPES.has("workflow")).toBe(false);
  });
});

describe("holderNotExecutableMessage", () => {
  it("names the mandate, the layer, the row and the holder type", () => {
    const message = holderNotExecutableMessage(
      "workflow.contract_check",
      "user",
      "b1b1b1b1-0000-4000-8000-000000000000",
      "workflow",
    );
    expect(message).toContain("workflow.contract_check");
    expect(message).toContain("your binding");
    expect(message).toContain("b1b1b1b1-0000-4000-8000-000000000000");
    expect(message).toContain("'workflow' Holder");
    expect(message).toContain("this browser path can only launch an agent");
    // The refusal must not claim the capability is unbuilt — it ships.
    expect(message).not.toContain("NOT IMPLEMENTED");
  });

  it("says which layer an organization binding came from", () => {
    expect(
      holderNotExecutableMessage("workflow.contract_check", "organization", null, "workflow"),
    ).toContain("an organization binding");
  });
});

describe("resolveMandate — agent Holders resolve exactly as before", () => {
  it("returns the system default when nothing is bound", async () => {
    const resolved = await resolveMandate("workflow.contract_check");
    expect(resolved.agentId).toBe(SYSTEM_AGENT_ID);
    expect(resolved.provenance).toBe("system");
    expect(resolved.holderType).toBe("agent");
  });

  it("applies a user binding that names an agent Holder", async () => {
    scenario.userBinding = {
      id: "b1b1b1b1-0000-4000-8000-000000000000",
      holder_type: "agent",
      agent_id: BOUND_AGENT_ID,
      agent_version_id: null,
      use_latest: true,
      config_overrides: null,
      is_enabled: true,
    };
    const resolved = await resolveMandate("workflow.contract_check");
    expect(resolved.agentId).toBe(BOUND_AGENT_ID);
    expect(resolved.provenance).toBe("user");
    expect(resolved.holderType).toBe("agent");
  });

  it("still applies a binding whose holder_type column is absent", async () => {
    // Rows written before the column existed read as agent Holders.
    scenario.userBinding = {
      id: "b2b2b2b2-0000-4000-8000-000000000000",
      agent_id: BOUND_AGENT_ID,
      agent_version_id: null,
      use_latest: true,
      config_overrides: null,
      is_enabled: true,
    };
    const resolved = await resolveMandate("workflow.contract_check");
    expect(resolved.agentId).toBe(BOUND_AGENT_ID);
    expect(resolved.provenance).toBe("user");
  });
});

describe("resolveMandate — a workflow Holder REFUSES, loudly", () => {
  const workflowUserBinding: Row = {
    id: "b3b3b3b3-0000-4000-8000-000000000000",
    holder_type: "workflow",
    // No agent_id — a workflow Holder carries none by construction. This is
    // exactly the row that used to fall through to the system default.
    agent_id: null,
    agent_version_id: null,
    use_latest: true,
    config_overrides: null,
    is_enabled: true,
  };

  it("throws instead of returning the system default (a user binding)", async () => {
    scenario.userBinding = workflowUserBinding;
    await expect(resolveMandate("workflow.contract_check")).rejects.toThrow(
      /names a 'workflow' Holder/,
    );
  });

  it("names the mandate key, the binding layer and the holder type", async () => {
    scenario.userBinding = workflowUserBinding;
    const error = await resolveMandate("workflow.contract_check").catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain("workflow.contract_check");
    expect(message).toContain("your binding");
    expect(message).toContain("b3b3b3b3-0000-4000-8000-000000000000");
    expect(message).toContain("'workflow' Holder");
    expect(message).toContain("this browser path can only launch an agent");
    // The refusal must not claim the capability is unbuilt — it ships.
    expect(message).not.toContain("NOT IMPLEMENTED");
    // The whole point: the system default is NOT what came back.
    expect(message).not.toContain(SYSTEM_AGENT_ID);
  });

  it("refuses an ORGANIZATION binding with a workflow Holder too", async () => {
    scenario.orgBindings = [
      {
        id: "b4b4b4b4-0000-4000-8000-000000000000",
        holder_type: "workflow",
        agent_id: null,
        agent_version_id: null,
        use_latest: true,
        config_overrides: null,
        is_enabled: true,
        updated_at: "2026-08-27T00:00:00Z",
      },
    ];
    const error = await resolveMandate("workflow.contract_check").catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("an organization binding");
  });

  it("refuses before applying the binding's settings half", async () => {
    // The server refuses before merging config_overrides; so must we — a
    // half-applied non-executable binding is a worse lie than none.
    scenario.userBinding = {
      ...workflowUserBinding,
      config_overrides: { model: "user-override-model" },
    };
    await expect(resolveMandate("workflow.contract_check")).rejects.toThrow(
      /this browser path can only launch an agent/,
    );
  });

  it("does not cache a refusal as a resolution", async () => {
    scenario.userBinding = workflowUserBinding;
    await expect(resolveMandate("workflow.contract_check")).rejects.toThrow();
    // Rebind to an agent (no cache invalidation in between — the throw must
    // never have written a cache entry).
    scenario.userBinding = {
      id: "b5b5b5b5-0000-4000-8000-000000000000",
      holder_type: "agent",
      agent_id: BOUND_AGENT_ID,
      agent_version_id: null,
      use_latest: true,
      config_overrides: null,
      is_enabled: true,
    };
    const resolved = await resolveMandate("workflow.contract_check");
    expect(resolved.agentId).toBe(BOUND_AGENT_ID);
  });

  it("refuses an unrecognized Holder type as well", async () => {
    scenario.userBinding = { ...workflowUserBinding, holder_type: "orchestra" };
    await expect(resolveMandate("workflow.contract_check")).rejects.toThrow(
      /'orchestra' Holder/,
    );
  });
});
