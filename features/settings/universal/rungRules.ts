// features/settings/universal/rungRules.ts
//
// THE PURE HALF of the sub-organization rung vocabulary: which rungs exist,
// what a person calls one, and — the load-bearing question — which of them a
// given key's picker may OFFER.
//
// 🚨 IT IS PURE ON PURPOSE. `scripts/check-settings-ladder-ui.ts` grades
// reachability by asking THIS function what the screen would draw, rather than
// re-implementing the rule (re-implementing it is exactly how that guard came to
// print green over 582 unreachable key-rung pairs — V-57). A guard is a node
// script with no Next.js environment, so the rule may not sit in a module that
// reaches a browser Supabase client at import time. The door that reads rows
// (`fetchScopeRows`) lives next door in `scopeRows.ts` and re-exports
// everything here, so no call site had to change.

import {
  KNOB_RUNG_CONSUMERS,
  unreachableRungsFor,
} from "./knobDatabaseConsumers.generated";
import type { KnobScopeKindName } from "@/lib/scoped-config/types";

export type SubOrgScopeKind = Exclude<KnobScopeKindName, "organization" | "user" | "device">;

/**
 * Every sub-org rung the universal UI offers a picker for, with where its rows
 * live and what to call one (mirrors platform.knob_scope_kind). This list IS
 * the surface's promise: a rung listed here is addressed on the read and
 * offered as a picker; `check:settings-ladder-ui` reads it from disk.
 */
export const SUB_ORG_SCOPE_SOURCES = [
  { kind: "employer_profile", noun: "Employer profile" },
  { kind: "brand", noun: "Brand" },
  { kind: "pay_group", noun: "Pay group" },
  { kind: "site", noun: "Site" },
  { kind: "location", noun: "Location" },
  // DD-131: `platform.knob_scope_kind` names `table` (scope_schema/scope_table
  // = platform.entity_types) and `agent` (agent.definition). DD-166 (closed
  // 2026-09-13, aidream 0642 + 0672): `platform.knob_scope_rows` no longer
  // assumes every rung is a per-org row set — it branches on
  // `knob_scope_kind.scope_row_identity`. `table` is `platform_taxonomy`:
  // `platform.entity_types` has no `organization_id` (it is the platform-wide
  // table catalog, not a tenant row set), so its branch lists every ACTIVE
  // registered token with no organization filter — deliberately unfiltered by
  // `confirmation_enabled`, because table-scoped knobs are not all
  // confirmation knobs (e.g. `records.children.fan_out_ceiling` applies to
  // any table). `agent` is `tenant_row` (`agent.definition.organization_id`
  // is real) and needed no change. Live-verified both ways from this repo.
  { kind: "table", noun: "Table" },
  { kind: "agent", noun: "Agent" },
] as const satisfies readonly {
  kind: SubOrgScopeKind;
  noun: string;
}[];

export const SUB_ORG_SCOPE_KINDS: readonly SubOrgScopeKind[] = SUB_ORG_SCOPE_SOURCES.map(
  (source) => source.kind,
);

export function isSubOrgScopeKind(kind: string): kind is SubOrgScopeKind {
  return (SUB_ORG_SCOPE_KINDS as readonly string[]).includes(kind);
}

/**
 * The rungs of ONE key that a person picks a ROW for — its `overridable_by`
 * narrowed to the rungs this surface offers a picker for, in ladder order.
 * `organization`, `user` and `device` are excluded because they are not
 * picked: the screen already knows which organization, which person and which
 * browser it is standing in.
 *
 * 🚨 DD-211 — AND narrowed again to the rungs the DATABASE CAN ANSWER WITH.
 * `overridable_by` is what the registry OFFERS; a rung other than
 * `organization` or `user` only changes an answer if some reader names it in
 * `p_scopes`. `records.confirmation.agent_write_born_confirmed` offered an
 * `agent` rung, the door saved it (`{"ok":true,"origin":"agent_override"}`),
 * this panel listed it back — and its one reader named a `table` rung and
 * nothing else, so not a single row ever changed (V-64, 2026-09-13). A control
 * is ABSENT or HONEST, never a box that accepts a value nothing honours, so a
 * rung nothing can answer is not offered at all.
 *
 * The census is measured live from `pg_proc` and committed by
 * `pnpm generate:knob-database-consumers`; `pnpm check:knob-database-consumers`
 * fails when it drifts, and fails when a knob GAINS such a rung — so hiding it
 * here can never become how the gap is quietly lived with.
 *
 * `fullKey` is optional only so the function keeps working for a caller that
 * does not have it; without it nothing is hidden (never guess).
 */
export function pickableRungsFor(
  overridableBy: readonly string[],
  fullKey?: string,
): SubOrgScopeKind[] {
  const strict = fullKey !== undefined && isStrictRungFeature(fullKey);
  const named = fullKey ? rungsNamedByReadersOf(fullKey) : null;
  const unreachable = fullKey ? unreachableRungsFor(fullKey, overridableBy) : [];
  return SUB_ORG_SCOPE_SOURCES.map((source) => source.kind).filter((kind) => {
    if (!overridableBy.includes(kind)) return false;
    // 🚨 DD-203 — inside a STRICT namespace, silence is an answer.
    if (strict) return named !== null && named.includes(kind);
    return !unreachable.includes(kind);
  });
}

/**
 * 🚨 DD-203 — THE NAMESPACES WHERE "NOT MEASURED" MEANS "NOT ANSWERABLE".
 *
 * `unreachableRungsFor` deliberately hides nothing for a key no readable call
 * site mentions: guessing would be worse than saying nothing, because a reader
 * can always be somewhere the census cannot read. That is the right default —
 * and it is wrong for `hr.*`, where the shape of the whole namespace has been
 * read out of the live catalog and is not a guess (2026-09-14):
 *
 *   hr._knob(feature, key)                  → knob_resolve(feature, key, null)
 *   hr._hr_knob(feature, key, org, default) → knob_resolve(feature, key, org)
 *
 * EVERY `hr.*` knob is resolved through one of those two dispatchers, and
 * neither takes a person, an employment or a location, so neither can name a
 * row-keyed rung — there is nothing in their arguments to name one WITH. The
 * only HR readers that hold a subject are `hr.rehire_service_dates` and
 * `hr.sync_membership_to_employment`, and DD-203's migration taught both to name
 * `employer_profile`, `pay_group` and `location` inline, where the census reads
 * them. So within `hr.*`, a key the census does not positively name is a key no
 * reader can answer at a row-keyed rung, and offering a picker for it would be
 * the DD-211 defect at 192-key scale: a control that saves a value nothing
 * honours.
 *
 * The census stays the authority in BOTH directions — a key here is offered
 * only when a measured reader names the rung — so the day an HR lane gives a
 * dispatcher its subject, the rung appears with no edit here.
 */
export const STRICT_RUNG_FEATURE_PREFIXES: readonly string[] = ["hr."];

export function isStrictRungFeature(fullKey: string): boolean {
  return STRICT_RUNG_FEATURE_PREFIXES.some((prefix) => fullKey.startsWith(prefix));
}

/** The rungs a measured database reader of this key NAMES, or `null` when none is measurable. */
function rungsNamedByReadersOf(fullKey: string): readonly string[] | null {
  return KNOB_RUNG_CONSUMERS[fullKey] ?? null;
}

function sourceFor(kind: SubOrgScopeKind) {
  const source = SUB_ORG_SCOPE_SOURCES.find((entry) => entry.kind === kind);
  if (!source) throw new Error(`No scope source for rung ${kind}`);
  return source;
}

export function scopeKindNoun(kind: SubOrgScopeKind): string {
  return sourceFor(kind).noun;
}
