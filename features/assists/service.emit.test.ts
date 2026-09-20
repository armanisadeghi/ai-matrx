import { emitAssist } from "./service";
import { createClient } from "@/utils/supabase/client";
import type { AssistAction } from "./types";

jest.mock("@/utils/supabase/client", () => ({
  createClient: jest.fn(),
  supabase: {
    auth: { getSession: jest.fn() },
  },
}));

const ACTION = {
  kind: "navigate",
  href: "/mandates",
} as const satisfies AssistAction;

function input() {
  return {
    sourceKey: "content_ir.missing_component",
    title: "Build a component",
    action: ACTION,
    dedupeKey: "content_ir.missing_component:shape.demo",
    priority: 0,
  };
}

describe("emitAssist write door", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("writes through emit_pending_assist and never inserts platform.assists", async () => {
    // Break: restore select-then-insert in emitAssist. The generic PostgREST
    // capture then records 23505 as a page error before the caller can treat
    // the lost race as success.
    const rpc = jest.fn(async (name: string) => {
      if (name === "my_assist_admission_decision") {
        return { data: [{ allowed: true }], error: null };
      }
      if (name === "emit_pending_assist") {
        return { data: "assist-row-1", error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    const from = jest.fn(() => {
      throw new Error("emitAssist must not touch platform.assists directly");
    });
    jest.mocked(createClient).mockReturnValue({
      schema: () => ({ rpc, from }),
    } as never);

    await expect(emitAssist("user-1", input(), "org-1")).resolves.toBe(
      "assist-row-1",
    );

    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("emit_pending_assist", {
      p_organization_id: "org-1",
      p_source_kind: "deterministic",
      p_source_key: "content_ir.missing_component",
      p_title: "Build a component",
      p_body: null,
      p_action: ACTION,
      p_surface_name: null,
      p_entity_type: null,
      p_entity_id: null,
      p_dedupe_key: "content_ir.missing_component:shape.demo",
      p_expires_at: null,
      p_priority: 0,
      p_evidence: null,
      p_confidence: null,
      p_reasoning: null,
    });
  });

  it("returns null when the door finds the key already addressed to someone else", async () => {
    // Break: treat a null RPC result as a throw, or fall back to insert.
    const rpc = jest.fn(async (name: string) => {
      if (name === "my_assist_admission_decision") {
        return { data: [{ allowed: true }], error: null };
      }
      if (name === "emit_pending_assist") {
        return { data: null, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    jest.mocked(createClient).mockReturnValue({
      schema: () => ({
        rpc,
        from: () => {
          throw new Error(
            "emitAssist must not touch platform.assists directly",
          );
        },
      }),
    } as never);

    await expect(emitAssist("user-1", input(), "org-1")).resolves.toBeNull();
  });

  it("collapses same-tab emits of one dedupe key into a single door call", async () => {
    // Break: drop the in-flight map. Two mounts then fire two RPCs and the
    // second can still lose the unique index on a slow network.
    let release!: (id: string) => void;
    const first = new Promise<string>((resolve) => {
      release = resolve;
    });
    const rpc = jest.fn(async (name: string) => {
      if (name === "my_assist_admission_decision") {
        return { data: [{ allowed: true }], error: null };
      }
      if (name === "emit_pending_assist") {
        return { data: await first, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });
    jest.mocked(createClient).mockReturnValue({
      schema: () => ({ rpc }),
    } as never);

    const a = emitAssist("user-1", input(), "org-1");
    const b = emitAssist("user-1", input(), "org-1");
    release("assist-row-shared");
    await expect(Promise.all([a, b])).resolves.toEqual([
      "assist-row-shared",
      "assist-row-shared",
    ]);
    expect(
      rpc.mock.calls.filter(([name]) => name === "emit_pending_assist"),
    ).toHaveLength(1);
  });
});
