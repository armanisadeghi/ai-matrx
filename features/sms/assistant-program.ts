import type { Database } from "@/types/database.types";

type SmsAssistantProgramRpcRow =
  Database["communication"]["Functions"]["get_my_sms_assistant_program"]["Returns"][number];
type NullableSmsAssistantProgramRpcKey =
  | "verified_user_phone"
  | "preferred_agent_id"
  | "preferred_agent_version_id"
  | "sms_conversation_id"
  | "chat_conversation_id";
type SmsAssistantProgramRpcBoundary = Omit<
  SmsAssistantProgramRpcRow,
  NullableSmsAssistantProgramRpcKey
> & {
  [Key in NullableSmsAssistantProgramRpcKey]:
    SmsAssistantProgramRpcRow[Key] | null;
};

export interface SmsAssistantProgramState {
  destinationId: string | null;
  maskedPhone: string | null;
  programKey: string | null;
  numberActive: boolean;
  globalAssistantEnabled: boolean;
  smsEnabled: boolean;
  userAssistantEnabled: boolean;
  verifiedUserPhone: string | null;
  preferredAgentId: string | null;
  preferredAgentVersionId: string | null;
  smsConversationId: string | null;
  chatConversationId: string | null;
  identityStatus: string;
  consentStatus: string;
  ready: boolean;
  blockedReasons: string[];
}

export interface UpdateSmsAssistantProgram {
  userAssistantEnabled: boolean;
  preferredAgentId?: string | null;
  preferredAgentVersionId?: string | null;
}

export const SMS_ASSISTANT_TEST_BODY =
  "AI Matrx: Your text assistant is connected. Reply with a harmless question to test your saved agent. Reply STOP to opt out or HELP for help.";
export const SMS_ASSISTANT_OWNER_BETA_PROGRAM = "ai_matrx_owner_beta";

export function assistantBindingLabel(state: SmsAssistantProgramState): string {
  if (state.ready) return "Ready for owner testing";
  if (!state.userAssistantEnabled && state.preferredAgentId) return "Paused";
  if (!state.preferredAgentId) return "Agent not selected";
  return "Needs attention";
}

const BLOCKED_REASON_LABELS: Record<string, string> = {
  destination_not_ready: "The approved sender is not ready.",
  globally_paused: "Assistant messaging is temporarily paused for everyone.",
  sms_disabled: "Turn on SMS notifications above.",
  user_paused: "Assistant replies are paused for this phone.",
  verified_phone_missing: "Verify a phone number above.",
  agent_not_selected: "Choose a saved agent.",
  consent_opted_out:
    "This phone opted out. Reply START before enabling assistant messages.",
};

export function assistantBlockedReasonLabel(reason: string): string {
  return BLOCKED_REASON_LABELS[reason] ?? "Additional setup is required.";
}

export function smsPermissionLabel(state: SmsAssistantProgramState): string {
  if (!state.smsEnabled) return "SMS notifications off";
  if (state.consentStatus === "opted_out") return "Opted out";
  if (state.consentStatus === "opted_in") return "SMS notifications on";
  return "SMS notifications on · no opt-out recorded";
}

function nullableRpcText(value: string | null): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Converts the generated RPC result into the nullable UI boundary the SQL contract returns. */
export function smsAssistantProgramFromRpc(
  row: SmsAssistantProgramRpcBoundary,
): SmsAssistantProgramState {
  return {
    destinationId: nullableRpcText(row.destination_id),
    maskedPhone: nullableRpcText(row.masked_phone),
    programKey: nullableRpcText(row.program_key),
    numberActive: row.number_active,
    globalAssistantEnabled: row.global_assistant_enabled,
    smsEnabled: row.sms_enabled,
    userAssistantEnabled: row.user_assistant_enabled,
    verifiedUserPhone: nullableRpcText(row.verified_user_phone),
    preferredAgentId: nullableRpcText(row.preferred_agent_id),
    preferredAgentVersionId: nullableRpcText(row.preferred_agent_version_id),
    smsConversationId: nullableRpcText(row.sms_conversation_id),
    chatConversationId: nullableRpcText(row.chat_conversation_id),
    identityStatus: row.identity_status,
    consentStatus: row.consent_status,
    ready: row.ready,
    blockedReasons: row.blocked_reasons,
  };
}
