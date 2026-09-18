/** @jest-environment node */
//
// 🚨 DD-221 — THE WRITE GOES THROUGH THE KEY'S OWN DOOR.
//
// WHAT THIS SUITE IS FOR, AND WHY IT MOCKS THE WIRE AND NOTHING ELSE. The
// defect it pins is not a rendering one: it is WHICH RPC NAME LEAVES THE
// BROWSER. Measured live on 2026-09-14 against the real database, with the real
// person `20149d3f-…` (an HR admin in Write Target Sandbox who is `role='member'`,
// not an org owner or admin), on `hr.employees.adjusted_service_date_rule` at
// the pay-group rung:
//
//   platform.knob_override_set → {"ok": false, "reason": "forbidden",
//                                 "detail": "Organization configuration is owner/admin only."}
//   public.hr_knob_set         → {"ok": true, "origin": "pay_group_override",
//                                 "audit_id": …}  and that row IS in hr.access_audit
//
// and, as an org OWNER with no HR standing, `knob_override_set` ACCEPTED the
// same write and `hr.access_audit` did not move (1842 rows before, 1842 after).
// So the RPC name decides both who may write and whether the write is recorded.
// Only `@/utils/supabase/client` is mocked, because the thing under test is the
// call it receives.

import {
  writeKnobOverrideThroughDoor,
  type KnobWriteDoor,
} from "./service";
import { createClient } from "@/utils/supabase/client";

jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));
jest.mock("./effectiveKnobs", () => ({ invalidateEffectiveKnob: jest.fn() }));

const ORG = "11111111-1111-4111-8111-111111111111";
const PAY_GROUP = "44444444-4444-4444-8444-444444444444";

const HR_DOOR: KnobWriteDoor = {
  key: "hr.employees.adjusted_service_date_rule",
  featurePrefix: "hr.",
  setDoor: "public.hr_knob_set",
  clearDoor: "public.hr_knob_clear",
  authorityKind: "hr_settings_gate",
  mayWrite: true,
  authorityDetail: "You hold HR admin standing in this organization.",
  reason: "HR settings are HR's.",
};

const DEFAULT_DOOR: KnobWriteDoor = {
  key: "records.confirmation.confirm_on_human_edit",
  featurePrefix: "",
  setDoor: "platform.knob_override_set",
  clearDoor: "platform.knob_override_set",
  authorityKind: "org_steward",
  mayWrite: true,
  authorityDetail: "You are an owner or admin of this organization.",
  reason: "The platform default.",
};

/** Records every RPC the client is asked to make, and on which schema. */
function recordingClient() {
  const calls: { schema: string | null; fn: string; args: Record<string, unknown> }[] = [];
  const rpc = (schema: string | null) => (fn: string, args: Record<string, unknown>) => {
    calls.push({ schema, fn, args });
    return Promise.resolve({ data: { ok: true }, error: null });
  };
  jest.mocked(createClient).mockReturnValue({
    rpc: rpc(null),
    schema: (name: string) => ({ rpc: rpc(name) }),
  } as unknown as ReturnType<typeof createClient>);
  return calls;
}

const hrWrite = {
  feature: "hr.employees",
  key: "adjusted_service_date_rule",
  scopeKind: "pay_group" as const,
  scopeId: PAY_GROUP,
  organizationId: ORG,
};

it("sets an hr. exception through public.hr_knob_set, never through knob_override_set", async () => {
  const calls = recordingClient();
  await writeKnobOverrideThroughDoor({ door: HR_DOOR, ...hrWrite, value: "always_carry" });

  expect(calls).toHaveLength(1);
  expect(calls[0].fn).toBe("hr_knob_set");
  expect(calls[0].args).toEqual({
    p_organization_id: ORG,
    p_feature: "hr.employees",
    p_key: "adjusted_service_date_rule",
    p_value: "always_carry",
    p_scope_kind: "pay_group",
    p_scope_id: PAY_GROUP,
  });
  expect(calls.map((call) => call.fn)).not.toContain("knob_override_set");
});

it("removes an hr. exception through public.hr_knob_clear — the removal is a write too", async () => {
  const calls = recordingClient();
  await writeKnobOverrideThroughDoor({ door: HR_DOOR, ...hrWrite, value: null });

  expect(calls).toHaveLength(1);
  expect(calls[0].fn).toBe("hr_knob_clear");
  expect(calls[0].args).toEqual({
    p_organization_id: ORG,
    p_feature: "hr.employees",
    p_key: "adjusted_service_date_rule",
    p_scope_kind: "pay_group",
    p_scope_id: PAY_GROUP,
  });
});

it("leaves every other namespace on the platform door, unchanged", async () => {
  const calls = recordingClient();
  await writeKnobOverrideThroughDoor({
    door: DEFAULT_DOOR,
    feature: "records",
    key: "confirmation.confirm_on_human_edit",
    scopeKind: "table",
    scopeId: PAY_GROUP,
    organizationId: ORG,
    value: true,
  });

  expect(calls).toHaveLength(1);
  expect(calls[0].schema).toBe("platform");
  expect(calls[0].fn).toBe("knob_override_set");
});

it("refuses a declared door it cannot call, by name — never a quiet fall back", async () => {
  // Falling back to the platform door is exactly the bug: it would pass the
  // wrong gate and leave the namespace's own audit trail empty, silently.
  const calls = recordingClient();
  await expect(
    writeKnobOverrideThroughDoor({
      door: { ...HR_DOOR, setDoor: "esign.knob_set" },
      ...hrWrite,
      value: "always_carry",
    }),
  ).rejects.toThrow(/esign\.knob_set/);
  expect(calls).toHaveLength(0);
});
