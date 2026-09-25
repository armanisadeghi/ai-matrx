/**
 * Proves `remediateBrokenMapping` writes through the registered association
 * door (`assoc_add`) and never a direct `.update()` on `platform.associations`.
 *
 * Why this matters: a direct update is refused twice over — RLS
 * `associations_client_update_refused` blocks it under the admin's session,
 * and under the service-role client `platform._stamp_actor_tier` refuses it
 * with 23514 (tier `code`, no actor_system). Live-proven 2026-09-25.
 *
 * Fixture: the Cascade Electronics pickup-intake agent binding, one broken
 * `customer_zip` mapping remapped to `pickup_zip`.
 */

jest.mock("@ai-matrx/data/db", () => ({ readAllRows: async () => [] }));
jest.mock("@/features/surfaces/config/namespace-registry", () => ({
  listRegisteredNamespaces: () => [],
}));

import { remediateBrokenMapping } from "@/features/surfaces/services/manifest-sync.service";

const BINDING_ID = "0b6f7c1e-2d0a-4a51-9a3e-5f1c2b7d8e90";
const EDGE = {
  id: BINDING_ID,
  source_type: "agent",
  source_id: "a1111111-1111-4111-8111-111111111111",
  target_type: "surface",
  target_id: "b2222222-2222-4222-8222-222222222222",
  organization_id: "c3333333-3333-4333-8333-333333333333",
  role: "binding:global",
  label: null,
  position: null,
  metadata: { tier: "global", version: 1, visibility: "internal" },
  payload: {
    value_mappings: {
      customer_zip: { mapType: "surface_value", target: "zip_old", required: true },
      notes: { mapType: "surface_value", target: "pickup_notes" },
    },
  },
};

function fakeClient(rpcResult: { data: unknown; error: unknown }) {
  const update = jest.fn();
  const rpc = jest.fn(async () => rpcResult);
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is"]) chain[m] = () => chain;
  chain.single = async () => ({ data: EDGE, error: null });
  chain.update = update;
  const sb = {
    schema: () => ({ from: () => chain }),
    rpc,
  };
  return { sb: sb as never, rpc, update };
}

describe("remediateBrokenMapping", () => {
  it("writes via assoc_add, preserving the edge's key, role, org and metadata", async () => {
    const { sb, rpc, update } = fakeClient({ data: BINDING_ID, error: null });
    const result = await remediateBrokenMapping(sb, {
      bindingKind: "agent",
      bindingId: BINDING_ID,
      mappingKey: "customer_zip",
      remediation: { action: "remap_to", target: "pickup_zip" },
    });

    expect(update).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(fn).toBe("assoc_add");
    expect(args).toMatchObject({
      p_source_type: "agent",
      p_source_id: EDGE.source_id,
      p_target_type: "surface",
      p_target_id: EDGE.target_id,
      p_org_id: EDGE.organization_id,
      p_role: "binding:global",
      p_metadata: EDGE.metadata,
      p_payload_kind: "surface_binding",
    });
    expect((args.p_payload as { value_mappings: unknown }).value_mappings).toEqual({
      customer_zip: { mapType: "surface_value", target: "pickup_zip", required: true },
      notes: { mapType: "surface_value", target: "pickup_notes" },
    });
    expect(result.applied).toBe(true);
  });

  it("reports an access refusal (42501) as Forbidden, not a bare 500", async () => {
    const { sb } = fakeClient({
      data: null,
      error: { code: "42501", message: "assoc_add: non-conveying edges require editor access" },
    });
    await expect(
      remediateBrokenMapping(sb, {
        bindingKind: "agent",
        bindingId: BINDING_ID,
        mappingKey: "customer_zip",
        remediation: { action: "remove" },
      }),
    ).rejects.toThrow(/^Forbidden: /);
  });
});
