import type { KnobScopeKindName } from "@/lib/scoped-config/types";
import { databaseConsumersOf } from "./knobDatabaseConsumers.generated";

type EditingContext = KnobScopeKindName | "system";

export type SettingsDisposition = {
  stateOnlyAt: readonly EditingContext[];
  reason: string;
  consumerEvidence: string;
};

/**
 * Known runtime adoption gaps. The registry remains visible; unsafe lower-rung editing does not.
 *
 * HAND-KEPT. `pnpm check:settings-orphans` is the mechanical source of the same truth (a
 * registered key no code reads); this map should be DERIVED from its JSON output instead of
 * audited by hand — a follow-up, not done here (2026-09-12).
 *
 * 2026-09-13 (DD-183): half of that derivation is now live. The census's IN-DB tier is
 * generated into `knobDatabaseConsumers.generated.ts` and `dispositionFor` consults it, so a
 * knob read from inside the database can never be called "not connected" by this map again.
 * The remaining half — deriving the ENTRIES themselves from the census's orphan list rather
 * than writing them by hand — is still open: the census's FORWARDED tier is a heuristic, and
 * turning 170 registry rows read-only on a heuristic is a bigger decision than this lane's.
 */
const AUDITED: Record<string, SettingsDisposition> = {
  "commerce.labels.default_template": { stateOnlyAt: [], reason: "", consumerEvidence: "features/commerce-intake/labels/components/CreateLabelBatchDialog.tsx and PrintLabelDialog.tsx resolve this value." },
  "messaging.conversation_ai.transcript_message_cap": { stateOnlyAt: [], reason: "", consumerEvidence: "features/messaging/lib/useMessagingIntelligences.ts resolves transcript_message_cap." },
  "tables.pagination.intent_timeout_ms": { stateOnlyAt: [], reason: "", consumerEvidence: "lib/data-table/useTablePaginationPolicy.ts resolves this value." },
  "tables.pagination.mode": { stateOnlyAt: [], reason: "", consumerEvidence: "lib/data-table/useTablePaginationPolicy.ts resolves this value." },
  "tables.pagination.threshold_px": { stateOnlyAt: [], reason: "", consumerEvidence: "lib/data-table/useTablePaginationPolicy.ts resolves this value." },
  "batch.deadline.max_hours": { stateOnlyAt: ["organization", "user"], reason: "This runtime currently reads only the platform value.", consumerEvidence: "Batch deadline readers query platform.feature_knob directly." },
  "batch.deadline.processing_mode": { stateOnlyAt: ["organization", "user"], reason: "This runtime currently reads only the platform value.", consumerEvidence: "Batch deadline readers query platform.feature_knob directly." },
  "commerce.pipeline.deadline_max_hours": { stateOnlyAt: ["user"], reason: "The commerce runtime does not pass a user scope for this value.", consumerEvidence: "Organization resolution is used; user resolution is absent." },
  "commerce.pipeline.processing_mode": { stateOnlyAt: ["organization", "user", "system"], reason: "No active runtime consumer was verified for this setting.", consumerEvidence: "Source census found registry/settings references only." },
  // Re-measured 2026-09-13 (DD-183) against the live database, not only source: this key is
  // read by NO function, view, or source call site — three of its eight `records.confirmation.*`
  // siblings ARE read from inside the database and are correctly absent from this map.
  "records.confirmation.list_hides_unconfirmed": { stateOnlyAt: ["organization", "user", "system"], reason: "No active runtime consumer was verified for this setting.", consumerEvidence: "Census 2026-09-13 over source AND pg_proc/pg_views: no reader in matrx-frontend, aidream, the packages, or the database. Its siblings agent_write_born_confirmed and table_allows_born_confirmed are read by platform._stamp_actor_tier; confirm_on_human_edit by content_ir.edit_kind_instance_value." },
};

/**
 * 🚨 A DATABASE CONSUMER IS A CONSUMER (DD-183).
 *
 * Every entry above was written from a SOURCE census — a grep over
 * matrx-frontend and aidream — and a source grep cannot see inside `pg_proc`.
 * A knob resolved by a trigger or an RPC body has no call site to find: the
 * record store's confirmation keys are resolved by `platform._stamp_actor_tier`
 * and `content_ir.edit_kind_instance_value`, and ~50 `hr.*` keys are consumed
 * ONLY that way. Telling a person that a setting their database honours on
 * every write "is not available yet" is law 4 broken from the other side: the
 * screen is lying, just in the direction that looks cautious.
 *
 * So the live census wins over the hand audit, in the one direction it can:
 * it can only ever REMOVE a false "not connected", never add one. The census
 * is measured from `pg_proc`/`pg_views` by `check:settings-orphans`'s IN-DB
 * tier and written by `pnpm generate:knob-database-consumers`.
 */
export function dispositionFor(fullKey: string, context: "user" | "organization" | "system"): SettingsDisposition | null {
  const disposition = AUDITED[fullKey];
  if (!disposition) return null;
  if (databaseConsumersOf(fullKey)) return null;
  return disposition.stateOnlyAt.includes(context) ? disposition : null;
}

export const auditedSettingsDispositions = AUDITED;
