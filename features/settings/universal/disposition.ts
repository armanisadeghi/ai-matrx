import type { KnobScopeKindName } from "@/lib/scoped-config/types";

export type SettingsDisposition = {
  stateOnlyAt: readonly KnobScopeKindName[];
  reason: string;
  consumerEvidence: string;
};

/** Known runtime adoption gaps. The registry remains visible; unsafe lower-rung editing does not. */
const AUDITED: Record<string, SettingsDisposition> = {
  "batch.deadline.max_hours": { stateOnlyAt: ["organization", "user"], reason: "This runtime currently reads only the platform value.", consumerEvidence: "Batch deadline readers query platform.feature_knob directly." },
  "batch.deadline.processing_mode": { stateOnlyAt: ["organization", "user"], reason: "This runtime currently reads only the platform value.", consumerEvidence: "Batch deadline readers query platform.feature_knob directly." },
  "commerce.pipeline.deadline_max_hours": { stateOnlyAt: ["user"], reason: "The commerce runtime does not pass a user scope for this value.", consumerEvidence: "Organization resolution is used; user resolution is absent." },
  "commerce.pipeline.processing_mode": { stateOnlyAt: ["organization", "user"], reason: "No active runtime consumer was verified for this setting.", consumerEvidence: "Source census found registry/settings references only." },
  "agents.model_prefs.agent_authoring_default_model": { stateOnlyAt: ["organization", "user"], reason: "No active runtime consumer was verified for this setting.", consumerEvidence: "Source census found first-screen/settings references only." },
  "agents.model_prefs.chat_default_model": { stateOnlyAt: ["organization", "user"], reason: "No active runtime consumer was verified for this setting.", consumerEvidence: "Source census found first-screen/settings references only." },
  "media.listening.voice": { stateOnlyAt: ["organization", "user", "device"], reason: "No active runtime consumer was verified for this setting.", consumerEvidence: "Source census found first-screen/settings references only." },
  "records.confirmation.list_hides_unconfirmed": { stateOnlyAt: ["organization", "user"], reason: "No active runtime consumer was verified for this setting.", consumerEvidence: "Source census found registry/settings references only." },
};

export function dispositionFor(fullKey: string, context: "user" | "organization" | "system"): SettingsDisposition | null {
  const disposition = AUDITED[fullKey];
  if (!disposition || context === "system") return null;
  return disposition.stateOnlyAt.includes(context) ? disposition : null;
}

export const auditedSettingsDispositions = AUDITED;
