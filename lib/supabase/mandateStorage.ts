/**
 * THE MANDATE STORAGE ROUTER — the one place this repo names the mandate tables.
 *
 * Phase 1W moves mandate storage out of the `agent` schema:
 *
 *     agent.mandate          ->  mandate.definition
 *     agent.provision        ->  mandate.provision
 *     agent.mandate_binding  ->  mandate.binding
 *     agent.mandate_note         STAYS in `agent` (its FK is repointed at
 *                                mandate.definition; it has no new home yet)
 *
 * Every `.schema(...).from(...)` for those tables goes through the helpers here,
 * so the window flips ONE constant instead of sweeping 26 call sites across 8
 * files. Cross-repo design:
 * `/common-docs/projects/workflow-mandate-program/DESIGN-mandate-detach-revamp.md`;
 * the window itself: `RUNBOOK-1W.md` in the same directory.
 *
 * ┌─ THE SWITCH ──────────────────────────────────────────────────────────────┐
 * │  MANDATE_SCHEMA_CUTOVER = false   the live tables (agent.*)               │
 * │  MANDATE_SCHEMA_CUTOVER = true    the new tables (mandate.*)              │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * WHY A CONSTANT AND NOT AN ENV VAR. `/common-docs/policies/env-vars-are-values-
 * not-toggles.md` is a scar in this repo: `NEXT_PUBLIC_FILES_BROWSER_CUTOVER`
 * was added as a panic gate, the bug it guarded was fixed days later, and the
 * flag sat silently `false` in production for two weeks routing every browser
 * upload to the dead path with nobody aware. A constant is visible in review and
 * ships with the release that needs it. The precedent to imitate is
 * `lib/api/service-routing.ts` ("there is deliberately no toggle"). The window
 * flips this line and runs `./ship.sh --target all`.
 *
 * WHY BOTH BRANCHES TYPE-CHECK. `MANDATE_SCHEMA_CUTOVER` is a literal `false`,
 * so TypeScript narrows every conditional below to the ACTIVE branch — today's
 * row types are byte-identical to what the call sites had before this module
 * existed. But TS still checks the INACTIVE branch is well-formed, so
 * `types/database.types.ts` must carry the `mandate` schema (it does, as of the
 * `--schema mandate` addition to `pnpm db-types`). Flipping the constant to
 * `true` re-narrows everything and surfaces, at compile time, every call site
 * that still reads a killed column — which is exactly the sweep the window needs
 * to have already passed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

/** OFF until the Phase 1W window. See RUNBOOK-1W.md step 4b. */
export const MANDATE_SCHEMA_CUTOVER = false;

type Client = SupabaseClient<Database>;

/**
 * Human-readable name of the ACTIVE storage. Use it in error copy and logs so a
 * half-flipped deploy is legible from a screenshot instead of a guess.
 */
export const MANDATE_STORAGE_LABEL = MANDATE_SCHEMA_CUTOVER ? "mandate.*" : "agent.*";

/* -------------------------------------------------------------------------- */
/* Table accessors — the ONLY place either schema is named.                    */
/* -------------------------------------------------------------------------- */

/*
 * Each table has TWO real accessors — one per schema — and the exported name is
 * whichever the switch selects, cast to that branch's own type.
 *
 * The cast is doing something specific and necessary: a bare
 * `SWITCH ? a() : b()` infers the UNION of two different PostgrestQueryBuilder
 * types, and `.update(...)` is not callable on that union. The conditional TYPE
 * below is driven by the same constant as the value, so flipping the constant
 * flips both together — there is no second edit to forget, and no branch that
 * stops being type-checked (both arrow functions are real, compiled code).
 */

const definitionTableAgent = (supabase: Client) => supabase.schema("agent").from("mandate");
const definitionTableNew = (supabase: Client) => supabase.schema("mandate").from("definition");
const provisionTableAgent = (supabase: Client) => supabase.schema("agent").from("provision");
const provisionTableNew = (supabase: Client) => supabase.schema("mandate").from("provision");
const bindingTableAgent = (supabase: Client) => supabase.schema("agent").from("mandate_binding");
const bindingTableNew = (supabase: Client) => supabase.schema("mandate").from("binding");

/** The mandate definition table: `agent.mandate` or `mandate.definition`. */
export const mandateDefinitions = (
  MANDATE_SCHEMA_CUTOVER ? definitionTableNew : definitionTableAgent
) as typeof MANDATE_SCHEMA_CUTOVER extends true
  ? typeof definitionTableNew
  : typeof definitionTableAgent;

/** The provision table: `agent.provision` or `mandate.provision`. */
export const mandateProvisions = (
  MANDATE_SCHEMA_CUTOVER ? provisionTableNew : provisionTableAgent
) as typeof MANDATE_SCHEMA_CUTOVER extends true
  ? typeof provisionTableNew
  : typeof provisionTableAgent;

/** The binding table: `agent.mandate_binding` or `mandate.binding`. */
export const mandateBindings = (
  MANDATE_SCHEMA_CUTOVER ? bindingTableNew : bindingTableAgent
) as typeof MANDATE_SCHEMA_CUTOVER extends true
  ? typeof bindingTableNew
  : typeof bindingTableAgent;

/**
 * Mandate notes. NOT part of the schema move — `agent.mandate_note` stays where
 * it is and only its FK is repointed at `mandate.definition`. It routes through
 * this module anyway so the notes surface is found by the same grep as the rest
 * of the feature the day notes DO get a home.
 */
export function mandateNotes(supabase: Client) {
  return supabase.schema("agent").from("mandate_note");
}

/* -------------------------------------------------------------------------- */
/* Row types — aliases that follow the switch, so call sites never repoint.    */
/* -------------------------------------------------------------------------- */

type AgentMandateRow = Database["agent"]["Tables"]["mandate"]["Row"];
type NewMandateRow = Database["mandate"]["Tables"]["definition"]["Row"];
type AgentBindingRow = Database["agent"]["Tables"]["mandate_binding"]["Row"];
type NewBindingRow = Database["mandate"]["Tables"]["binding"]["Row"];
type AgentProvisionRow = Database["agent"]["Tables"]["provision"]["Row"];
type NewProvisionRow = Database["mandate"]["Tables"]["provision"]["Row"];

export type MandateDefinitionRow = typeof MANDATE_SCHEMA_CUTOVER extends true
  ? NewMandateRow
  : AgentMandateRow;
export type MandateBindingRow = typeof MANDATE_SCHEMA_CUTOVER extends true
  ? NewBindingRow
  : AgentBindingRow;
export type MandateProvisionRow = typeof MANDATE_SCHEMA_CUTOVER extends true
  ? NewProvisionRow
  : AgentProvisionRow;
export type MandateNoteRow = Database["agent"]["Tables"]["mandate_note"]["Row"];

export type MandateDefinitionUpdate = typeof MANDATE_SCHEMA_CUTOVER extends true
  ? Database["mandate"]["Tables"]["definition"]["Update"]
  : Database["agent"]["Tables"]["mandate"]["Update"];

/* -------------------------------------------------------------------------- */
/* Moved-column accessors — the same answer on both sides of the switch.       */
/* -------------------------------------------------------------------------- */

/**
 * A Holder reference, in post-D1 terms.
 *
 * `versionId === null` MEANS latest. There is no `use_latest` after the cutover:
 * two columns encoding one fact is how `use_latest=false` plus a null version
 * became an unresolvable row.
 */
export type HolderRef = {
  holderType: string;
  holderId: string | null;
  versionId: string | null;
};

/** The default Holder of a mandate row, on either schema. */
export function holderOfMandate(row: MandateDefinitionRow): HolderRef {
  const anyRow = row as Record<string, unknown>;
  if (MANDATE_SCHEMA_CUTOVER) {
    return {
      holderType: (anyRow.default_holder_type as string) ?? "agent",
      holderId: (anyRow.default_holder_id as string | null) ?? null,
      versionId: (anyRow.default_holder_version_id as string | null) ?? null,
    };
  }
  return {
    holderType: "agent",
    holderId: (anyRow.default_agent_id as string | null) ?? null,
    versionId: (anyRow.default_agent_version_id as string | null) ?? null,
  };
}

/** The Holder a binding names, on either schema. */
export function holderOfBinding(row: MandateBindingRow): HolderRef {
  const anyRow = row as Record<string, unknown>;
  if (MANDATE_SCHEMA_CUTOVER) {
    return {
      holderType: (anyRow.holder_type as string) ?? "agent",
      holderId: (anyRow.holder_id as string | null) ?? null,
      versionId: (anyRow.holder_version_id as string | null) ?? null,
    };
  }
  return {
    holderType: (anyRow.holder_type as string) ?? "agent",
    holderId: (anyRow.agent_id as string | null) ?? null,
    versionId: (anyRow.agent_version_id as string | null) ?? null,
  };
}

/**
 * A mandate row's contract, in the blob shape every existing reader expects.
 * Post-cutover the blob is gone and this reassembles it from the promoted
 * columns, so no surface has to know which side of the switch it is on.
 */
export function contractOfMandate(row: MandateDefinitionRow): Record<string, unknown> {
  const anyRow = row as Record<string, unknown>;
  if (!MANDATE_SCHEMA_CUTOVER) {
    return (anyRow.contract as Record<string, unknown>) ?? {};
  }
  const contract: Record<string, unknown> = {
    required_output_keys: (anyRow.required_output_keys as string[]) ?? [],
    required_context_policies: (anyRow.required_context_policies as string[]) ?? [],
    accepts_user_input: Boolean(anyRow.accepts_user_input),
    auto_context_disabled: Boolean(anyRow.auto_context_disabled),
  };
  if (anyRow.input_waiver) contract.input_contract_waiver = anyRow.input_waiver;
  if (anyRow.output_waiver) contract.output_contract_waiver = anyRow.output_waiver;
  return contract;
}

/**
 * The mandate a mandate falls back to. `metadata.fallback` pre-cutover, the
 * promoted `fallback_mandate_key` column after.
 * Authority: `/common-docs/systems/agents/mandates/FALLBACK-MANDATES.md`.
 */
export function fallbackKeyOfMandate(row: MandateDefinitionRow): string | null {
  const anyRow = row as Record<string, unknown>;
  if (MANDATE_SCHEMA_CUTOVER) {
    return (anyRow.fallback_mandate_key as string | null) ?? null;
  }
  const metadata = (anyRow.metadata as Record<string, unknown> | null) ?? {};
  const fallback = metadata.fallback;
  return typeof fallback === "string" && fallback.trim() ? fallback.trim() : null;
}

/**
 * The mandate's goal — half of its immutable contract. There is no column for it
 * before the cutover, so: null.
 */
export function goalOfMandate(row: MandateDefinitionRow): string | null {
  if (!MANDATE_SCHEMA_CUTOVER) return null;
  return ((row as Record<string, unknown>).goal as string | null) ?? null;
}
