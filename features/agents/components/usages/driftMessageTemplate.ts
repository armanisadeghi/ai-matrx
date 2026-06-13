/**
 * Default drift-notification message + action payload.
 *
 * Domain copy lives here (agents), not in the generic messaging layer. Kept in
 * lockstep with the Python server template
 * (aidream/services/agent_usage/drift_dm.py::build_drift_dm) so a drift DM reads
 * identically whether composed by a human in the Find Usages UI or by the
 * weekly scan.
 */

import type {
  AgentDriftActionPayload,
  MessageActionData,
} from "@/features/messaging/types";
import type { DriftSeverity } from "@/features/agents/redux/usages/usages.types";

export interface DriftMessageInput {
  agentId: string;
  agentName: string;
  currentVersion?: number;
  breakingCount?: number;
  silentCount?: number;
  warningCount?: number;
  severity?: DriftSeverity | null;
  alertId?: string | null;
  /** When notifying about one specific usage. */
  usageType?: string;
  usageId?: string;
  usageLabel?: string;
}

/** Build the default notification body (plain text). */
export function buildDriftMessage(input: DriftMessageInput): string {
  const { agentName, breakingCount = 0, silentCount = 0 } = input;
  const parts = [`Agent drift alert: "${agentName}" changed`];
  if (breakingCount > 0) {
    parts.push(
      ` and ${breakingCount} usage${breakingCount !== 1 ? "s" : ""} will now break`,
    );
  }
  if (silentCount > 0) {
    parts.push(
      ` (${silentCount} more silently lost ${silentCount !== 1 ? "their" : "its"} settings)`,
    );
  }
  return (
    parts.join("") +
    ". Open the agent's Find Usages window to review and update the affected usages."
  );
}

/** Build the `agent_drift` action envelope that renders deep-link chips. */
export function buildDriftActionData(
  input: DriftMessageInput,
): MessageActionData<"agent_drift", AgentDriftActionPayload> {
  return {
    kind: "agent_drift",
    version: 1,
    payload: {
      agent_id: input.agentId,
      agent_name: input.agentName,
      alert_id: input.alertId ?? null,
      severity: input.severity ?? null,
      counts: {
        breaking: input.breakingCount ?? 0,
        silent_breaking: input.silentCount ?? 0,
        warning: input.warningCount ?? 0,
      },
      usage_type: input.usageType,
      usage_id: input.usageId,
      usage_label: input.usageLabel,
    },
  };
}
