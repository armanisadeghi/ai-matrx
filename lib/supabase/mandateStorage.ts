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

import type { Database, Json } from "@/types/database.types";

/** ON — the Phase 1W window completed 2026-08-29. See RUNBOOK-1W.md. */
export const MANDATE_SCHEMA_CUTOVER = true;

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

const definitionTable = (supabase: Client) => supabase.schema("mandate").from("definition");
const provisionTable = (supabase: Client) => supabase.schema("mandate").from("provision");
const bindingTable = (supabase: Client) => supabase.schema("mandate").from("binding");

/** The mandate definition table: `agent.mandate` or `mandate.definition`. */
export const mandateDefinitions = definitionTable;

/** The provision table: `agent.provision` or `mandate.provision`. */
export const mandateProvisions = provisionTable;

/** The binding table: `agent.mandate_binding` or `mandate.binding`. */
export const mandateBindings = bindingTable;

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

type NewMandateRow = Database["mandate"]["Tables"]["definition"]["Row"];
type NewBindingRow = Database["mandate"]["Tables"]["binding"]["Row"];
type NewProvisionRow = Database["mandate"]["Tables"]["provision"]["Row"];

export type MandateDefinitionRow = NewMandateRow;
export type MandateBindingRow = NewBindingRow;
export type MandateProvisionRow = NewProvisionRow;
export type MandateNoteRow = Database["agent"]["Tables"]["mandate_note"]["Row"];

export type MandateDefinitionUpdate = Database["mandate"]["Tables"]["definition"]["Update"];
export type MandateBindingUpdate = Database["mandate"]["Tables"]["binding"]["Update"];

/* -------------------------------------------------------------------------- */
/* Column-list fragments — the ONLY place a moved column is NAMED in a select. */
/* -------------------------------------------------------------------------- */

/*
 * An explicit `.select("a, b, c")` names columns, so PostgREST's generated types
 * turn a killed column into a `SelectQueryError` for the WHOLE row. These
 * fragments are the select-string half of the accessors below: a call site
 * composes one into its own list with a template literal and then reads the
 * result through `holderOfMandate` / `holderOfBinding` / `contractOfMandate`,
 * so no surface names `default_agent_id` or `agent_id` again.
 *
 * They are typed as literals (same conditional-type cast as the tables above) so
 * supabase-js can still infer the row shape from the composed string.
 */

const mandateHolderColumnsAgent = "default_agent_id, default_agent_version_id, use_latest" as const;
const mandateHolderColumnsNew =
  "default_holder_type, default_holder_id, default_holder_version_id" as const;

/** The mandate's default-Holder columns, for an explicit `.select(...)`. */
export const MANDATE_HOLDER_COLUMNS = (
  MANDATE_SCHEMA_CUTOVER ? mandateHolderColumnsNew : mandateHolderColumnsAgent
) as typeof MANDATE_SCHEMA_CUTOVER extends true
  ? typeof mandateHolderColumnsNew
  : typeof mandateHolderColumnsAgent;

const mandateContractColumnsAgent = "contract" as const;
const mandateContractColumnsNew =
  "required_output_keys, required_context_policies, accepts_user_input, auto_context_disabled, input_waiver, output_waiver" as const;

/** Whatever `contractOfMandate` needs to read, for an explicit `.select(...)`. */
export const MANDATE_CONTRACT_COLUMNS = (
  MANDATE_SCHEMA_CUTOVER ? mandateContractColumnsNew : mandateContractColumnsAgent
) as typeof MANDATE_SCHEMA_CUTOVER extends true
  ? typeof mandateContractColumnsNew
  : typeof mandateContractColumnsAgent;

const bindingHolderColumnsAgent = "holder_type, agent_id, agent_version_id, use_latest" as const;
const bindingHolderColumnsNew = "holder_type, holder_id, holder_version_id" as const;

/** A binding's Holder columns, for an explicit `.select(...)`. */
export const BINDING_HOLDER_COLUMNS = (
  MANDATE_SCHEMA_CUTOVER ? bindingHolderColumnsNew : bindingHolderColumnsAgent
) as typeof MANDATE_SCHEMA_CUTOVER extends true
  ? typeof bindingHolderColumnsNew
  : typeof bindingHolderColumnsAgent;

/* -------------------------------------------------------------------------- */
/* Moved-column accessors — the same answer on both sides of the switch.       */
/* -------------------------------------------------------------------------- */

/**
 * A row read from one of the mandate tables — the full row, or any projection
 * of it that carries the columns the accessor needs. Accessors take this rather
 * than the exact Row alias because most call sites read a `.select("a, b, c")`
 * projection, and a projection is not assignable to the full Row type.
 */
export type MandateRowLike = Readonly<Record<string, unknown>>;

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
export function holderOfMandate(row: MandateRowLike): HolderRef {
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
export function holderOfBinding(row: MandateRowLike): HolderRef {
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
 * The AGENT a binding names — null on every non-agent Holder.
 *
 * This is NOT the same accessor as {@link holderOfBinding}, and the difference
 * is the whole point. Pre-cutover the binding had an agent-only `agent_id`
 * column that a workflow binding left NULL by construction; post-cutover
 * `holder_id` is POLYMORPHIC and a workflow binding fills it with a workflow
 * id. So a surface that used to read `agent_id` — an agent-name lookup, an
 * agent picker's current value, "does this binding swap the agent" — must ask
 * for the agent specifically, or it starts treating a workflow id as an agent
 * id the moment the switch flips.
 *
 * Resolution paths that have already REFUSED a non-agent Holder (the client
 * resolvers' `assertExecutableHolder`) use `holderOfBinding` instead, so they
 * follow the Holder the day workflows execute.
 */
export function agentHolderOfBinding(row: MandateRowLike): HolderRef {
  const holder = holderOfBinding(row);
  if (holder.holderType !== "agent") {
    return { holderType: holder.holderType, holderId: null, versionId: null };
  }
  return holder;
}

/**
 * A mandate row's contract, in the blob shape every existing reader expects.
 * Post-cutover the blob is gone and this reassembles it from the promoted
 * columns, so no surface has to know which side of the switch it is on.
 */
export function contractOfMandate(row: MandateRowLike): Json {
  const anyRow = row as Record<string, unknown>;
  if (!MANDATE_SCHEMA_CUTOVER) {
    return (anyRow.contract as Json) ?? {};
  }
  const contract: Record<string, Json> = {
    required_output_keys: (anyRow.required_output_keys as string[]) ?? [],
    required_context_policies: (anyRow.required_context_policies as string[]) ?? [],
    accepts_user_input: Boolean(anyRow.accepts_user_input),
    auto_context_disabled: Boolean(anyRow.auto_context_disabled),
  };
  if (anyRow.input_waiver) contract.input_contract_waiver = anyRow.input_waiver as Json;
  if (anyRow.output_waiver) contract.output_contract_waiver = anyRow.output_waiver as Json;
  return contract;
}

/**
 * The mandate a mandate falls back to. `metadata.fallback` pre-cutover, the
 * promoted `fallback_mandate_key` column after.
 * Authority: `/common-docs/systems/mandates/FALLBACK-MANDATES.md`.
 */
export function fallbackKeyOfMandate(row: MandateRowLike): string | null {
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
export function goalOfMandate(row: MandateRowLike): string | null {
  if (!MANDATE_SCHEMA_CUTOVER) return null;
  return ((row as Record<string, unknown>).goal as string | null) ?? null;
}

/**
 * Does this mandate run the LATEST version of its Holder?
 *
 * Pre-cutover this is the `use_latest` column, which is NOT the same fact as
 * "no version is pinned" — that divergence is exactly why the column dies. So
 * each side answers with its own truth and no call site has to know: before the
 * cutover the stored boolean, after it `default_holder_version_id IS NULL`.
 */
export function isFloatingMandate(row: MandateRowLike): boolean {
  const anyRow = row as Record<string, unknown>;
  if (MANDATE_SCHEMA_CUTOVER) {
    return (anyRow.default_holder_version_id ?? null) === null;
  }
  return anyRow.use_latest === true;
}

/** The binding half of {@link isFloatingMandate}. */
export function isFloatingBinding(row: MandateRowLike): boolean {
  const anyRow = row as Record<string, unknown>;
  if (MANDATE_SCHEMA_CUTOVER) {
    return (anyRow.holder_version_id ?? null) === null;
  }
  return anyRow.use_latest === true;
}

/**
 * The mandate's declared input kind.
 *
 * KILLED at the cutover: the Provision is the mandate's entire input
 * declaration, and the real derived kind lives on the provision row
 * (`derived_input_kind`). Post-cutover this is always `null` — a surface that
 * needs the input contract reads the provision, not the mandate.
 * Authority: DESIGN-mandate-detach-revamp § column census.
 */
export function inputKindOfMandate(row: MandateRowLike): string | null {
  if (MANDATE_SCHEMA_CUTOVER) return null;
  return ((row as Record<string, unknown>).input_kind as string | null) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Write helpers — a rebind names the switch's columns in ONE place.           */
/* -------------------------------------------------------------------------- */

/**
 * What a rebind decides, in switch-neutral terms. `useLatest` is the UI's
 * question ("track latest, or pin this version?"); the helpers below turn it
 * into whatever the ACTIVE schema stores — the boolean column before the
 * cutover, a NULL version id after it.
 */
export type HolderWrite = {
  /** `agent` | `orchestra` | `workflow`. Only the new schema stores it here. */
  holderType?: string;
  holderId: string | null;
  versionId: string | null;
  useLatest: boolean;
};

/** The mandate-default columns a rebind writes, on either schema. */
export function mandateHolderWrite(holder: HolderWrite): MandateDefinitionUpdate {
  if (MANDATE_SCHEMA_CUTOVER) {
    return {
      default_holder_type: holder.holderType ?? "agent",
      default_holder_id: holder.holderId,
      default_holder_version_id: holder.useLatest ? null : holder.versionId,
    } as MandateDefinitionUpdate;
  }
  return {
    default_agent_id: holder.holderId,
    default_agent_version_id: holder.versionId,
    use_latest: holder.useLatest,
  } as MandateDefinitionUpdate;
}

/** The binding columns a rebind writes, on either schema. */
export function bindingHolderWrite(holder: HolderWrite): MandateBindingUpdate {
  if (MANDATE_SCHEMA_CUTOVER) {
    return {
      holder_type: holder.holderType ?? "agent",
      holder_id: holder.holderId,
      holder_version_id: holder.useLatest ? null : holder.versionId,
    } as MandateBindingUpdate;
  }
  return {
    holder_type: holder.holderType ?? "agent",
    agent_id: holder.holderId,
    agent_version_id: holder.versionId,
    use_latest: holder.useLatest,
  } as MandateBindingUpdate;
}
