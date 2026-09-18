/**
 * DD-211 — the rung readers, proven RED on the carrier's OWN historical bytes
 * and GREEN on today's.
 *
 * `pnpm check:knob-database-consumers --self-test` proves the guard can say no
 * against the live database with a planted knob. This proves the same rule
 * against the exact text `platform._stamp_actor_tier` carried before and after
 * DD-211 — so the thing the census would have missed is the thing that was
 * actually wrong, not a stand-in for it.
 */
import { describe, expect, it } from "@jest/globals";
import {
  knobResolveCalls,
  literalOf,
  RUNGS_WITHOUT_SCOPES,
  rungsNamedBy,
  scopesArgumentOf,
} from "../knob-resolve-callers/core";

/** What `platform._stamp_actor_tier` passed from DD-198 until DD-211 (table only). */
const BEFORE_DD211 = `
        IF  COALESCE((platform.knob_resolve('records', 'confirmation.agent_write_born_confirmed',
                        org, NULL, jsonb_build_array(jsonb_build_object('kind', 'table', 'id', table_scope_id))))::text::boolean, false)
        AND COALESCE((platform.knob_resolve('records', 'confirmation.table_allows_born_confirmed',
                        org, NULL, jsonb_build_array(jsonb_build_object('kind', 'table', 'id', table_scope_id))))::text::boolean, false)
`;

/** What it passes now (dd211b): the table always, the agent too when one is writing. */
const AFTER_DD211 = `
        IF  COALESCE((platform.knob_resolve('records', 'confirmation.agent_write_born_confirmed',
                        org, NULL,
                        CASE WHEN agent_id IS NULL
                             THEN jsonb_build_array(jsonb_build_object('kind', 'table', 'id', table_scope_id))
                             ELSE jsonb_build_array(jsonb_build_object('kind', 'agent', 'id', agent_id),
                                                    jsonb_build_object('kind', 'table', 'id', table_scope_id))
                        END))::text::boolean, false)
`;

/** The rung kinds a body names for one (feature, key). */
function rungsFor(body: string, feature: string, key: string): string[] {
  const kinds = new Set<string>();
  for (const call of knobResolveCalls(body)) {
    if (literalOf(call.args[0] ?? "") !== feature) continue;
    if (literalOf(call.args[1] ?? "") !== key) continue;
    for (const kind of rungsNamedBy(scopesArgumentOf(call.args)).kinds) kinds.add(kind);
  }
  return [...kinds].sort();
}

/** The rungs a knob OFFERS that the body cannot answer with. */
function unreachable(body: string, feature: string, key: string, overridableBy: string[]): string[] {
  const named = rungsFor(body, feature, key);
  return overridableBy.filter((r) => !RUNGS_WITHOUT_SCOPES.includes(r) && !named.includes(r));
}

const AGENT_KNOB = ["organization", "agent"];

describe("the rung census on the carrier's own bytes", () => {
  it("RED — before DD-211 the agent rung was offered and nothing named it", () => {
    expect(rungsFor(BEFORE_DD211, "records", "confirmation.agent_write_born_confirmed")).toEqual(["table"]);
    expect(
      unreachable(BEFORE_DD211, "records", "confirmation.agent_write_born_confirmed", AGENT_KNOB),
    ).toEqual(["agent"]);
  });

  it("GREEN — after DD-211 the agent rung is named at the call site", () => {
    expect(rungsFor(AFTER_DD211, "records", "confirmation.agent_write_born_confirmed")).toEqual([
      "agent",
      "table",
    ]);
    expect(
      unreachable(AFTER_DD211, "records", "confirmation.agent_write_born_confirmed", AGENT_KNOB),
    ).toEqual([]);
  });

  it("organization and user never need p_scopes — they are knob_resolve's own parameters", () => {
    expect(
      unreachable(BEFORE_DD211, "records", "confirmation.table_allows_born_confirmed", [
        "organization",
        "table",
      ]),
    ).toEqual([]);
    expect(unreachable(BEFORE_DD211, "records", "confirmation.agent_write_born_confirmed", ["user"])).toEqual([]);
  });

  it("a reader that names NO rung leaves every row-keyed rung unreachable", () => {
    const nullScopes = `select platform.knob_resolve('records', 'children.fan_out_ceiling', p_org, null, null);`;
    expect(rungsFor(nullScopes, "records", "children.fan_out_ceiling")).toEqual([]);
    expect(unreachable(nullScopes, "records", "children.fan_out_ceiling", ["organization", "table"])).toEqual([
      "table",
    ]);
  });
});

describe("rungsNamedBy", () => {
  it("reads the SQL object form", () => {
    expect(rungsNamedBy(`jsonb_build_array(jsonb_build_object('kind', 'agent', 'id', a))`)).toEqual({
      kinds: ["agent"],
      dynamic: false,
    });
  });

  it("reads the TypeScript object form", () => {
    expect(rungsNamedBy(`deviceId ? [{ kind: "device", id: deviceId }] : undefined`)).toEqual({
      kinds: ["device"],
      dynamic: false,
    });
  });

  it("says so when the kind itself is computed, instead of guessing", () => {
    // platform._knob_override_write builds the kind from a parameter.
    expect(
      rungsNamedBy(
        `case when p_scope_kind not in ('organization','user') then jsonb_build_array(jsonb_build_object('kind', p_scope_kind, 'id', p_scope_id)) else null end`,
      ),
    ).toEqual({ kinds: [], dynamic: true });
  });

  it("finds nothing in a null or absent argument", () => {
    expect(rungsNamedBy("null")).toEqual({ kinds: [], dynamic: false });
    expect(rungsNamedBy("")).toEqual({ kinds: [], dynamic: false });
  });
});

describe("literalOf", () => {
  it("unwraps a SQL literal and a quoted string, and refuses an expression", () => {
    expect(literalOf("'records'")).toBe("records");
    expect(literalOf(' "records" ')).toBe("records");
    expect(literalOf("p_feature")).toBeNull();
  });
});
