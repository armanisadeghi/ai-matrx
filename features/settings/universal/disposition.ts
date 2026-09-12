import type { KnobScopeKindName } from "@/lib/scoped-config/types";

type EditingContext = KnobScopeKindName | "system";

export type SettingsDisposition = {
  stateOnlyAt: readonly EditingContext[];
  reason: string;
  consumerEvidence: string;
};

/** Known runtime adoption gaps. The registry remains visible; unsafe lower-rung editing does not. */
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
  "agents.model_prefs.agent_authoring_default_model": { stateOnlyAt: ["organization", "user", "system"], reason: "No active runtime consumer was verified for this setting.", consumerEvidence: "Source census found first-screen/settings references only." },
  "agents.model_prefs.chat_default_model": { stateOnlyAt: ["organization", "user", "system"], reason: "No active runtime consumer was verified for this setting.", consumerEvidence: "Source census found first-screen/settings references only." },
  "media.listening.voice": { stateOnlyAt: ["organization", "user", "device", "system"], reason: "No active runtime consumer was verified for this setting.", consumerEvidence: "Source census found first-screen/settings references only." },
  "records.confirmation.list_hides_unconfirmed": { stateOnlyAt: ["organization", "user", "system"], reason: "No active runtime consumer was verified for this setting.", consumerEvidence: "Source census found registry/settings references only." },
};

export function dispositionFor(fullKey: string, context: "user" | "organization" | "system"): SettingsDisposition | null {
  const disposition = AUDITED[fullKey];
  if (!disposition) return null;
  return disposition.stateOnlyAt.includes(context) ? disposition : null;
}

export const auditedSettingsDispositions = AUDITED;
