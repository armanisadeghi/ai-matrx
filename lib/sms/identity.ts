import { normalizeMediumValue } from "@/features/crm/normalize";

export type SmsProvider = "twilio";

export interface SmsInboundContextInput {
  provider: SmsProvider;
  providerAccountId: string;
  providerMessageId: string;
  source: string;
  destination: string;
  optOutType?: string;
}

interface SmsInboundContextBase {
  provider: SmsProvider;
  providerAccountId: string;
  providerMessageId: string;
  source: string;
  destination: string;
}

export interface ResolvedSmsInboundContext extends SmsInboundContextBase {
  status: "resolved";
  organizationId: string;
  userId: string;
  partyId: string | null;
  contactMediumId: string | null;
  contactPointId: string | null;
  destinationIdentityId: string;
  programKey: string;
  smsConversationId: string;
  chatConversationId: string;
  chatConversationIsNew: boolean;
  agentId: string;
  agentVersionId: string | null;
}

export interface AmbiguousSmsInboundContext extends SmsInboundContextBase {
  status: "ambiguous";
  reason: string;
  candidateCount: number;
  candidatePartyIds: string[];
}

export interface UnresolvedSmsInboundContext extends SmsInboundContextBase {
  status: "not_found";
  reason: string;
}

export type SmsInboundContextResolution =
  | ResolvedSmsInboundContext
  | AmbiguousSmsInboundContext
  | UnresolvedSmsInboundContext;

export interface ClaimedSmsInboundReceipt {
  receiptId: string;
  duplicate: boolean;
  processable: boolean;
  providerEventKey: string;
}

/** Normalize a transport endpoint with the same E.164 rules as CRM contact media. */
export function normalizeSmsEndpoint(raw: string): string {
  return normalizeMediumValue("phone", raw).valueKey;
}

/** Stable provider-scoped idempotency key for one inbound Twilio message. */
export function smsInboundProviderEventKey(input: SmsInboundContextInput): string {
  const account = input.providerAccountId.trim();
  const message = input.providerMessageId.trim();
  if (!account || !message) {
    throw new Error("Inbound SMS requires provider account and message identifiers");
  }
  return `${input.provider}:inbound:${account}:${message}`;
}
