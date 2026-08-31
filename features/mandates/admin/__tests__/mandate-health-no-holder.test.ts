/**
 * V2-2 — A MANDATE THAT WAS NEVER BOUND IS NOT A BROKEN PIN.
 *
 * The defect, walked on production 2026-08-31: a scratch mandate twenty
 * minutes old, never pinned, never bound, opened its admin panel on a rose
 * alert — "This mandate's pin is outside your direct reach" / "The pinned
 * agent no longer exists — nothing with the pinned id is in the agents table.
 * Choose a replacement" — two inches under the workspace correctly saying
 * "No holder yet". Every mandate a person creates started there.
 *
 * Cause: `buildRow` derived `unresolved = agentId == null`, and a mandate with
 * no holder columns at all resolves to a null agent for the same reason a
 * DANGLING pin does. The two states are now distinguished by whether a pin
 * exists, which is the only thing that separates them.
 *
 * These assertions go RED against the pre-fix derivation: cases 1 and 2 read
 * "unresolved pin", and the dangling-pin case is the pin that still must.
 */
import { buildRow } from "../mandate-health";
import type { MandateConsoleData, MandateDefinitionRow } from "../service";

const EMPTY_DATA: MandateConsoleData = {
  mandates: [],
  agentsById: {},
  versionsById: {},
  bindingsByMandateId: {},
} as unknown as MandateConsoleData;

function mandate(overrides: Record<string, unknown>): MandateDefinitionRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    mandate_key: "zzz.scratch_job",
    label: "Scratch job",
    is_enabled: true,
    output_kind: null,
    metadata: null,
    updated_at: "2026-08-31T20:00:00Z",
    ...overrides,
  } as unknown as MandateDefinitionRow;
}

describe("holderless mandates read as calm, not broken", () => {
  it("a mandate with no holder and no version is 'no holder yet'", () => {
    const row = buildRow(
      mandate({
        default_agent_id: null,
        default_agent_version_id: null,
        default_holder_id: null,
        default_holder_version_id: null,
      }),
      EMPTY_DATA,
    );
    expect(row.health).toBe("no holder yet");
    expect(row.health).not.toBe("unresolved pin");
    expect(row.agentId).toBeNull();
  });

  it("does not become 'unresolved pin' just because a code-truth report exists", () => {
    const row = buildRow(
      mandate({
        default_agent_id: null,
        default_agent_version_id: null,
        default_holder_id: null,
        default_holder_version_id: null,
      }),
      EMPTY_DATA,
      {
        mandate_key: "zzz.scratch_job",
        resolution: "no_code_declaration",
        drift: "match",
        bound_agent_drift: null,
        bound_agent: null,
        code_variables: [],
        code_only_variables: [],
        db_only_variables: [],
        passes_user_input: false,
        call_sites: [],
        import_error: null,
        source: null,
      } as never,
    );
    expect(row.health).toBe("no holder yet");
  });

  it("a pin whose agent cannot be read is STILL 'unresolved pin'", () => {
    // The regression half: the fix must not silence a genuinely dangling pin.
    const row = buildRow(
      mandate({
        default_agent_id: "99999999-9999-9999-9999-999999999999",
        default_holder_id: "99999999-9999-9999-9999-999999999999",
        default_agent_version_id: null,
        default_holder_version_id: null,
      }),
      EMPTY_DATA,
    );
    expect(row.health).toBe("unresolved pin");
  });
});
