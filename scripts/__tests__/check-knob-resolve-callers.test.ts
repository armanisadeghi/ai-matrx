/**
 * The DD-198 classifier, on the exact call shapes that made the class and the exact ones
 * that are correct. The guard's DATABASE half proves itself against the real catalog
 * (`pnpm check:knob-resolve-callers --self-test` plants a function and requires the census
 * to name it). This is the other half: the SOURCE reader, which cannot plant a file in a
 * shared working tree without a peer sweeper committing it.
 *
 * Every RED case here is a real call site that existed: `_stamp_actor_tier`'s
 * `jsonb_build_object('table', …)` and `edit_kind_instance_value`'s `'{}'::jsonb`.
 */
import { classify, knobResolveCalls, scopesArgumentOf } from "../knob-resolve-callers/core";

const scopesOf = (body: string) => knobResolveCalls(body).map((c) => scopesArgumentOf(c.args));
const verdictsOf = (body: string) => scopesOf(body).map(classify);

describe("DD-198 — knob_resolve callers name their rungs with an array", () => {
  it("RED: the carrier's object argument is an offender, both calls", () => {
    const body = `
      IF  COALESCE((platform.knob_resolve('records', 'confirmation.agent_write_born_confirmed',
                      org, NULL, jsonb_build_object('table', table_scope_id)))::text::boolean, false)
      AND COALESCE((platform.knob_resolve('records', 'confirmation.table_allows_born_confirmed',
                      org, NULL, jsonb_build_object('table', table_scope_id)))::text::boolean, false)`;
    expect(verdictsOf(body)).toEqual(["offender", "offender"]);
  });

  it("RED: the edit door's '{}'::jsonb is an offender", () => {
    const body = `platform.knob_resolve('records', 'confirmation.confirm_on_human_edit', row_org, actor, '{}'::jsonb)`;
    expect(verdictsOf(body)).toEqual(["offender"]);
  });

  it("RED: an object literal in TypeScript or Python is an offender", () => {
    expect(classify(`{ table: tableId }`)).toBe("offender");
    expect(classify(`'{"table": "…"}'`)).toBe("offender");
  });

  it("GREEN: the fixed carrier shape passes", () => {
    const body = `platform.knob_resolve('records', 'confirmation.table_allows_born_confirmed',
                    org, NULL, jsonb_build_array(jsonb_build_object('kind', 'table', 'id', table_scope_id)))`;
    expect(verdictsOf(body)).toEqual(["ok"]);
  });

  it("GREEN: omitted, null, a CASE over safe branches, and a browser ternary all pass", () => {
    expect(verdictsOf(`platform.knob_resolve('extensibility', p_key, p_organization_id)`)).toEqual(["ok"]);
    expect(verdictsOf(`platform.knob_resolve('continued_access','portal_enabled', p_org, null, null)`)).toEqual(["ok"]);
    expect(
      classify(`case when p_scope_kind not in ('organization','user') then jsonb_build_array(jsonb_build_object('kind', p_scope_kind, 'id', p_scope_id)) else null end`),
    ).toBe("ok");
    expect(classify(`deviceId ? [{ kind: "device", id: deviceId }] : undefined`)).toBe("ok");
  });

  it("a CASE that returns an object on ANY branch is still an offender", () => {
    expect(classify(`case when x then jsonb_build_object('table', t) else null end`)).toBe("offender");
  });

  it("reads the supabase-js RPC form, where p_scopes is a named property", () => {
    const body = `supabase.schema("platform").rpc("knob_resolve", {
        p_feature: feature, p_key: key, p_organization_id: organizationId,
        p_user_id: userId ?? undefined,
        p_scopes: deviceId ? [{ kind: "device", id: deviceId }] : undefined,
      })`;
    expect(verdictsOf(body)).toEqual(["ok"]);
  });

  it("a comma inside a quoted argument never splits the argument list", () => {
    const body = `platform.knob_resolve('records', 'a,b', org, null, jsonb_build_array(jsonb_build_object('kind','table','id',t)))`;
    expect(scopesOf(body)).toEqual([`jsonb_build_array(jsonb_build_object('kind','table','id',t))`]);
  });
});
