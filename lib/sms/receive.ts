/**
 * SMS Receiving Service
 *
 * Processes inbound SMS/MMS from Twilio webhooks.
 * Handles conversation lookup/creation, media download, and AI agent routing.
 */

import { createAdminClient } from "@/utils/supabase/adminClient";
import { resolveOrgIdForUserServer } from "@/lib/organizations/personalOrg";
import type { InboundSmsPayload, TwilioMediaAttachment } from "./types";
import {
  normalizeSmsEndpoint,
  smsInboundProviderEventKey,
  selectSingleSmsPreferenceBinding,
  smsVerifiedPreferenceScope,
  type ClaimedSmsInboundReceipt,
  type ResolvedSmsInboundContext,
  type SmsInboundContextInput,
  type SmsInboundContextResolution,
} from "./identity";

const RECEIPT_LEASE_MS = 60_000;

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key]?.trim();
  if (!value) {
    throw new Error(`Inbound SMS is missing ${key}`);
  }
  return value;
}

/** Parse the signed provider form instead of asserting an untrusted object shape. */
export function parseInboundSmsPayload(
  params: Record<string, string>,
): InboundSmsPayload {
  const payload: InboundSmsPayload = {
    MessageSid: requiredParam(params, "MessageSid"),
    AccountSid: requiredParam(params, "AccountSid"),
    From: requiredParam(params, "From"),
    To: requiredParam(params, "To"),
    Body: params.Body ?? "",
    NumMedia: params.NumMedia ?? "0",
    NumSegments: params.NumSegments ?? "1",
    SmsStatus: params.SmsStatus ?? "received",
    ApiVersion: requiredParam(params, "ApiVersion"),
  };
  if (params.MessagingServiceSid) {
    payload.MessagingServiceSid = params.MessagingServiceSid;
  }
  if (params.OptOutType) {
    payload.OptOutType = params.OptOutType;
  }
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith("MediaUrl") || key.startsWith("MediaContentType")) {
      payload[key] = value;
    }
  }
  return payload;
}

export function inboundContextInput(
  payload: InboundSmsPayload,
): SmsInboundContextInput {
  return {
    provider: "twilio",
    providerAccountId: payload.AccountSid,
    providerMessageId: payload.MessageSid,
    source: normalizeSmsEndpoint(payload.From),
    destination: normalizeSmsEndpoint(payload.To),
    optOutType: payload.OptOutType,
  };
}

/** Persist and lease a provider event before any policy or business processing. */
export async function claimInboundSmsReceipt(
  payload: InboundSmsPayload,
): Promise<ClaimedSmsInboundReceipt> {
  const supabase = createAdminClient();
  const input = inboundContextInput(payload);
  const providerEventKey = smsInboundProviderEventKey(input);
  const now = new Date();
  const leaseExpiresAt = new Date(
    now.getTime() + RECEIPT_LEASE_MS,
  ).toISOString();
  const { data: inserted, error: insertError } = await supabase
    .schema("communication")
    .from("sms_webhook_logs")
    .insert({
      webhook_type: "inbound_sms",
      twilio_sid: input.providerMessageId,
      raw_payload: payload,
      provider: input.provider,
      provider_account_id: input.providerAccountId,
      provider_event_key: providerEventKey,
      processed: false,
      processing_attempts: 1,
      claimed_at: now.toISOString(),
      lease_expires_at: leaseExpiresAt,
    })
    .select("id")
    .single();

  if (inserted) {
    return {
      receiptId: inserted.id,
      duplicate: false,
      processable: true,
      providerEventKey,
    };
  }
  if (insertError?.code !== "23505") {
    throw new Error(
      `Failed to persist inbound SMS receipt: ${insertError?.message ?? "unknown error"}`,
    );
  }

  const { data: existing, error: existingError } = await supabase
    .schema("communication")
    .from("sms_webhook_logs")
    .select("id, processed, lease_expires_at, processing_attempts")
    .eq("provider_event_key", providerEventKey)
    .single();
  if (existingError || !existing) {
    throw new Error(
      `Failed to load duplicate inbound SMS receipt: ${existingError?.message ?? "not found"}`,
    );
  }
  if (existing.processed) {
    return {
      receiptId: existing.id,
      duplicate: true,
      processable: false,
      providerEventKey,
    };
  }

  const leaseExpired =
    !existing.lease_expires_at ||
    new Date(existing.lease_expires_at).getTime() <= now.getTime();
  if (!leaseExpired) {
    return {
      receiptId: existing.id,
      duplicate: true,
      processable: false,
      providerEventKey,
    };
  }

  const { data: reclaimed } = await supabase
    .schema("communication")
    .from("sms_webhook_logs")
    .update({
      claimed_at: now.toISOString(),
      lease_expires_at: leaseExpiresAt,
      processing_attempts: existing.processing_attempts + 1,
      processing_error: null,
    })
    .eq("id", existing.id)
    .eq("processed", false)
    .or(`lease_expires_at.is.null,lease_expires_at.lte.${now.toISOString()}`)
    .select("id")
    .maybeSingle();

  return {
    receiptId: existing.id,
    duplicate: true,
    processable: reclaimed?.id === existing.id,
    providerEventKey,
  };
}

export async function completeInboundSmsReceipt(
  receiptId: string,
  messageId: string | null,
  processingError: string | null = null,
): Promise<void> {
  const { error } = await createAdminClient()
    .schema("communication")
    .from("sms_webhook_logs")
    .update({
      processed: true,
      processed_at: new Date().toISOString(),
      message_id: messageId,
      processing_error: processingError,
      claimed_at: null,
      lease_expires_at: null,
    })
    .eq("id", receiptId);
  if (error) {
    throw new Error(`Failed to finalize inbound SMS receipt: ${error.message}`);
  }
}

export async function releaseInboundSmsReceipt(
  receiptId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .schema("communication")
    .from("sms_webhook_logs")
    .update({
      processing_error: errorMessage.slice(0, 2000),
      claimed_at: null,
      lease_expires_at: null,
    })
    .eq("id", receiptId)
    .eq("processed", false);
  if (error) {
    console.error("Failed to release inbound SMS receipt:", error);
  }
}

/**
 * Extract media attachments from a Twilio inbound SMS payload.
 */
export function extractMediaAttachments(
  payload: InboundSmsPayload,
): TwilioMediaAttachment[] {
  const numMedia = parseInt(payload.NumMedia || "0", 10);
  const attachments: TwilioMediaAttachment[] = [];

  for (let i = 0; i < numMedia; i++) {
    const url = payload[`MediaUrl${i}`];
    const contentType = payload[`MediaContentType${i}`];
    if (url && contentType) {
      attachments.push({ url, contentType, index: i });
    }
  }

  return attachments;
}

async function optionalCrmBinding(
  organizationId: string,
  userId: string,
  normalizedSource: string,
): Promise<
  | {
      status: "resolved";
      partyId: string | null;
      contactMediumId: string | null;
      contactPointId: string | null;
      canonicalConsentBlocked: boolean;
    }
  | { status: "ambiguous"; partyIds: string[] }
> {
  const supabase = createAdminClient();
  const { data: claimedParties, error: partyError } = await supabase
    .schema("crm")
    .from("party")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("claimed_by", userId)
    .is("deleted_at", null)
    .limit(3);
  if (partyError) {
    throw new Error(
      `Failed to resolve CRM party binding: ${partyError.message}`,
    );
  }
  if ((claimedParties?.length ?? 0) > 1) {
    return {
      status: "ambiguous",
      partyIds: claimedParties?.map((party) => party.id) ?? [],
    };
  }

  const partyId = claimedParties?.[0]?.id ?? null;
  if (!partyId) {
    // The owner beta predates the signup-time party invariant. Never create a party at request time.
    return {
      status: "resolved",
      partyId: null,
      contactMediumId: null,
      contactPointId: null,
      canonicalConsentBlocked: false,
    };
  }

  const { data: media, error: mediumError } = await supabase
    .schema("crm")
    .from("contact_medium")
    .select("id, unsubscribed_at, suppressed_at")
    .eq("organization_id", organizationId)
    .eq("channel", "phone")
    .eq("value_key", normalizedSource)
    .is("deleted_at", null)
    .limit(3);
  if (mediumError) {
    throw new Error(
      `Failed to resolve CRM phone medium: ${mediumError.message}`,
    );
  }
  if ((media?.length ?? 0) > 1) {
    return { status: "ambiguous", partyIds: [partyId] };
  }
  const contactMediumId = media?.[0]?.id ?? null;
  if (!contactMediumId) {
    return {
      status: "resolved",
      partyId,
      contactMediumId: null,
      contactPointId: null,
      canonicalConsentBlocked: false,
    };
  }

  const { data: points, error: pointError } = await supabase
    .schema("crm")
    .from("party_contact_point")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("party_id", partyId)
    .eq("medium_id", contactMediumId)
    .is("deleted_at", null)
    .limit(3);
  if (pointError) {
    throw new Error(
      `Failed to resolve CRM contact point: ${pointError.message}`,
    );
  }
  if ((points?.length ?? 0) > 1) {
    return { status: "ambiguous", partyIds: [partyId] };
  }
  return {
    status: "resolved",
    partyId,
    contactMediumId,
    contactPointId: points?.[0]?.id ?? null,
    canonicalConsentBlocked: Boolean(
      media?.[0]?.unsubscribed_at || media?.[0]?.suppressed_at,
    ),
  };
}

/** Resolve one provider event to an exact user/program/transport context. */
export async function resolveSmsInboundContext(
  payload: InboundSmsPayload,
): Promise<SmsInboundContextResolution> {
  const supabase = createAdminClient();
  const input = inboundContextInput(payload);
  const base = {
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    providerMessageId: input.providerMessageId,
    source: input.source,
    destination: input.destination,
  } as const;

  const { data: destinations, error: destinationError } = await supabase
    .schema("communication")
    .from("sms_phone_numbers")
    .select("id, organization_id, program_key, assistant_enabled, is_active")
    .eq("provider", input.provider)
    .eq("provider_account_id", input.providerAccountId)
    .eq("phone_number", input.destination)
    .is("deleted_at", null)
    .limit(2);
  if (destinationError) {
    throw new Error(
      `Failed to resolve SMS destination: ${destinationError.message}`,
    );
  }
  if (!destinations?.length) {
    return { ...base, status: "not_found", reason: "destination_not_owned" };
  }
  if (destinations.length > 1) {
    return {
      ...base,
      status: "ambiguous",
      reason: "multiple_destination_identities",
      candidateCount: destinations.length,
      candidatePartyIds: [],
    };
  }
  const destination = destinations[0];
  if (!destination.is_active) {
    return { ...base, status: "not_found", reason: "destination_inactive" };
  }
  const preferenceScope = smsVerifiedPreferenceScope(
    input,
    destination.id,
    destination.program_key,
  );

  const { data: preferences, error: preferenceError } = await supabase
    .schema("communication")
    .from("sms_notification_preferences")
    .select("user_id, organization_id, ai_agent_messages")
    .eq("phone_number", preferenceScope.phoneNumber)
    .eq("assistant_destination_id", preferenceScope.destinationIdentityId)
    .eq("assistant_program_key", preferenceScope.programKey)
    .eq("sms_enabled", true)
    .is("deleted_at", null)
    .limit(3);
  if (preferenceError) {
    throw new Error(
      `Failed to resolve verified SMS user binding: ${preferenceError.message}`,
    );
  }
  const preferenceSelection = selectSingleSmsPreferenceBinding(preferences);
  if (preferenceSelection.status === "not_found") {
    return {
      ...base,
      status: "not_found",
      reason: "verified_user_binding_not_found",
    };
  }
  if (preferenceSelection.status === "ambiguous") {
    return {
      ...base,
      status: "ambiguous",
      reason: "phone_bound_to_multiple_users",
      candidateCount: preferenceSelection.candidateCount,
      candidatePartyIds: [],
    };
  }
  const preference = preferenceSelection.value;
  const crmBinding = await optionalCrmBinding(
    preference.organization_id,
    preference.user_id,
    input.source,
  );
  if (crmBinding.status === "ambiguous") {
    return {
      ...base,
      status: "ambiguous",
      reason: "multiple_crm_identity_bindings",
      candidateCount: crmBinding.partyIds.length,
      candidatePartyIds: crmBinding.partyIds,
    };
  }
  if (
    crmBinding.canonicalConsentBlocked &&
    classifySmsPolicyKeyword(payload) !== "opt_in"
  ) {
    return {
      ...base,
      status: "not_found",
      reason: "canonical_consent_opted_out",
    };
  }

  const { data: existingConversations, error: conversationError } =
    await supabase
      .schema("communication")
      .from("sms_conversations")
      .select("id, chat_conversation_id")
      .eq("provider_account_id", input.providerAccountId)
      .eq("destination_identity_id", destination.id)
      .eq("external_phone_number", input.source)
      .eq("program_key", destination.program_key)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(2);
  if (conversationError) {
    throw new Error(
      `Failed to resolve SMS conversation: ${conversationError.message}`,
    );
  }
  if ((existingConversations?.length ?? 0) > 1) {
    return {
      ...base,
      status: "ambiguous",
      reason: "multiple_active_transport_conversations",
      candidateCount: existingConversations?.length ?? 0,
      candidatePartyIds: crmBinding.partyId ? [crmBinding.partyId] : [],
    };
  }

  let conversation = existingConversations?.[0] ?? null;
  if (!conversation) {
    const chatConversationId = crypto.randomUUID();
    const { data: created, error: createError } = await supabase
      .schema("communication")
      .from("sms_conversations")
      .insert({
        organization_id: preference.organization_id,
        user_id: preference.user_id,
        external_phone_number: input.source,
        our_phone_number: input.destination,
        conversation_type: "user_initiated",
        provider: input.provider,
        provider_account_id: input.providerAccountId,
        destination_identity_id: destination.id,
        program_key: destination.program_key,
        party_id: crmBinding.partyId,
        contact_medium_id: crmBinding.contactMediumId,
        contact_point_id: crmBinding.contactPointId,
        chat_conversation_id: chatConversationId,
        // Agent identity is deliberately absent at the transport boundary.
        // The aidream worker resolves sms.owner_beta through the canonical
        // system → org Binding → user Binding chain for this exact user/org.
        agent_id: null,
        canonical_agent_version_id: null,
        identity_status: "resolved",
      })
      .select("id, chat_conversation_id")
      .single();
    if (createError || !created) {
      throw new Error(
        `Failed to create SMS conversation: ${createError?.message ?? "unknown error"}`,
      );
    }
    conversation = created;
  }

  if (!conversation.chat_conversation_id) {
    throw new Error(
      "Resolved SMS conversation is missing its canonical chat identity",
    );
  }
  const { data: chatRow, error: chatError } = await supabase
    .schema("chat")
    .from("conversation")
    .select("id")
    .eq("id", conversation.chat_conversation_id)
    .maybeSingle();
  if (chatError) {
    throw new Error(
      `Failed to inspect canonical chat conversation: ${chatError.message}`,
    );
  }

  return {
    ...base,
    status: "resolved",
    organizationId: preference.organization_id,
    userId: preference.user_id,
    partyId: crmBinding.partyId,
    contactMediumId: crmBinding.contactMediumId,
    contactPointId: crmBinding.contactPointId,
    destinationIdentityId: destination.id,
    programKey: destination.program_key,
    smsConversationId: conversation.id,
    chatConversationId: conversation.chat_conversation_id,
    chatConversationIsNew: !chatRow,
    assistantEnabled: destination.assistant_enabled,
    agentMessagesEnabled: preference.ai_agent_messages,
    // These compatibility fields stay null. The transport may identify the
    // actor and organization; it may never choose the agent.
    agentId: null,
    agentVersionId: null,
  };
}

/**
 * Find or create a conversation for an inbound message.
 */
export async function findOrCreateConversation(
  fromNumber: string,
  toNumber: string,
): Promise<{
  id: string;
  userId: string | null;
  organizationId: string;
  isNew: boolean;
}> {
  const supabase = createAdminClient();

  // Look for existing active conversation
  const { data: existing } = await supabase
    .schema("communication")
    .from("sms_conversations")
    .select("id, user_id, organization_id")
    .eq("external_phone_number", fromNumber)
    .eq("our_phone_number", toNumber)
    .eq("status", "active")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    return {
      id: existing.id,
      userId: existing.user_id,
      organizationId: existing.organization_id,
      isNew: false,
    };
  }

  // Look up user by assigned phone number (our number -> user mapping)
  // or by the external number matching a user's registered phone
  const { data: phoneOwner } = await supabase
    .schema("communication")
    .from("sms_phone_numbers")
    .select("user_id")
    .eq("phone_number", toNumber)
    .eq("is_active", true)
    .limit(1)
    .single();

  // Also check if the sender's number matches any user's notification preferences
  const { data: senderUser } = await supabase
    .schema("communication")
    .from("sms_notification_preferences")
    .select("user_id")
    .eq("phone_number", fromNumber)
    .limit(1)
    .single();

  const userId = senderUser?.user_id || phoneOwner?.user_id || null;

  // Resolve the org from the routed user (or the system org for an unrouted
  // inbound number).
  const organizationId = await resolveOrgIdForUserServer(supabase, userId);

  // Create new conversation
  const { data: newConv, error } = await supabase
    .schema("communication")
    .from("sms_conversations")
    .insert({
      organization_id: organizationId,
      user_id: userId,
      external_phone_number: fromNumber,
      our_phone_number: toNumber,
      conversation_type: "user_initiated",
    })
    .select("id, user_id")
    .single();

  if (error) {
    throw new Error(`Failed to create conversation: ${error.message}`);
  }

  return {
    id: newConv.id,
    userId: newConv.user_id,
    organizationId,
    isNew: true,
  };
}

export type SmsPolicyKeyword = "opt_in" | "opt_out" | "help" | null;

export function classifySmsPolicyKeyword(
  payload: InboundSmsPayload,
): SmsPolicyKeyword {
  const providerType = payload.OptOutType?.trim().toUpperCase();
  if (providerType === "START") return "opt_in";
  if (providerType === "STOP") return "opt_out";
  if (providerType === "HELP") return "help";
  const body = payload.Body.trim().toUpperCase();
  if (["START", "UNSTOP", "YES", "SUBSCRIBE"].includes(body)) return "opt_in";
  if (
    [
      "STOP",
      "UNSUBSCRIBE",
      "END",
      "QUIT",
      "STOPALL",
      "CANCEL",
      "REVOKE",
      "OPTOUT",
    ].includes(body)
  ) {
    return "opt_out";
  }
  if (body === "HELP" || body === "INFO") return "help";
  return null;
}

/**
 * Hand an SMS STOP/START to THE ONE SUPPRESSION AUTHORITY.
 *
 * A legal opt-out must be one decision with one decider (Arman, 2026-08-14):
 * `crm.contact_medium` is the store and `crm.honor_consent_decision` is the only
 * thing that writes it. This used to hand-write `contact_medium` and
 * `party_contact_point` here, which made SMS a second authority — so a STOP and
 * an email unsubscribe could disagree about the same person.
 *
 * The medium id is passed when we resolved one, and the raw number otherwise:
 * the authority creates the medium rather than drop the STOP, because "we have
 * not met this number before" is not a lawful reason to keep texting it.
 */
async function reconcileCanonicalSmsConsent(
  context: ResolvedSmsInboundContext,
  policyKeyword: Exclude<SmsPolicyKeyword, null>,
  providerEventKey: string,
): Promise<void> {
  if (policyKeyword === "help") return;
  const supabase = createAdminClient();
  const { error } = await supabase.schema("crm").rpc("honor_consent_decision", {
    p_decision: policyKeyword,
    p_via: "sms_keyword",
    p_reason: "sms_keyword",
    p_medium_id: context.contactMediumId,
    p_organization_id: context.organizationId,
    p_channel: "phone",
    p_value_key: normalizeSmsEndpoint(context.source),
    p_value_raw: context.source,
    p_received_at: new Date().toISOString(),
    p_detail: {
      provider: context.provider,
      provider_event_key: providerEventKey,
      program_key: context.programKey,
      source: "sms_keyword",
    },
  });
  if (error) {
    throw new Error(
      `Failed to honor the SMS ${policyKeyword} decision: ${error.message}`,
    );
  }
}

interface ProcessInboundSmsOptions {
  receipt: ClaimedSmsInboundReceipt;
  context: ResolvedSmsInboundContext;
  aiProcessingStatus: "pending" | "skipped";
  skipReason?: string;
  commandCandidate?: boolean;
}

async function admitInboundSmsCommandCandidate(
  supabase: ReturnType<typeof createAdminClient>,
  inboundMessageId: string,
): Promise<void> {
  const { error } = await supabase
    .schema("communication")
    .rpc("admit_pending_sms_command_turn", {
      p_inbound_message_id: inboundMessageId,
    });
  if (error) {
    throw new Error(
      `Failed to verify inbound SMS command offer: ${error.message}`,
    );
  }
}

/**
 * Process and store an inbound SMS message.
 * Returns the message ID for further processing (e.g., AI agent).
 */
export async function processInboundSms(
  payload: InboundSmsPayload,
  options?: ProcessInboundSmsOptions,
): Promise<{
  messageId: string;
  conversationId: string;
  userId: string | null;
  isNewConversation: boolean;
  hasMedia: boolean;
}> {
  const supabase = createAdminClient();

  const conversation = options
    ? {
        id: options.context.smsConversationId,
        userId: options.context.userId,
        organizationId: options.context.organizationId,
        isNew: options.context.chatConversationIsNew,
      }
    : await findOrCreateConversation(payload.From, payload.To);
  const input = inboundContextInput(payload);
  const providerEventKey =
    options?.receipt.providerEventKey ?? smsInboundProviderEventKey(input);

  // Extract media
  const media = extractMediaAttachments(payload);
  const mediaUrls = media.map((m) => m.url);
  const mediaContentTypes = media.map((m) => m.contentType);

  // Insert message
  const { data: message, error: msgError } = await supabase
    .schema("communication")
    .from("sms_messages")
    .insert({
      organization_id: conversation.organizationId,
      conversation_id: conversation.id,
      twilio_sid: payload.MessageSid,
      provider: input.provider,
      provider_account_id: input.providerAccountId,
      webhook_receipt_id: options?.receipt.receiptId,
      idempotency_key: providerEventKey,
      direction: "inbound",
      from_number: input.source,
      to_number: input.destination,
      body: payload.Body,
      status: "received",
      num_segments: parseInt(payload.NumSegments || "1", 10),
      num_media: media.length,
      media_urls: mediaUrls,
      media_content_types: mediaContentTypes,
      sent_by_type: "user",
      ai_processing_status: options?.aiProcessingStatus ?? "pending",
      ai_processed: options?.aiProcessingStatus === "skipped",
      error_code: options?.skipReason,
    })
    .select("id")
    .single();

  if (msgError?.code === "23505" && options) {
    const { data: existingMessage, error: existingMessageError } =
      await supabase
        .schema("communication")
        .from("sms_messages")
        .select("id")
        .eq("idempotency_key", providerEventKey)
        .single();
    if (existingMessageError || !existingMessage) {
      throw new Error(
        `Failed to recover idempotent inbound SMS: ${existingMessageError?.message ?? "not found"}`,
      );
    }
    if (options.commandCandidate) {
      await admitInboundSmsCommandCandidate(supabase, existingMessage.id);
    }
    await completeInboundSmsReceipt(
      options.receipt.receiptId,
      existingMessage.id,
    );
    return {
      messageId: existingMessage.id,
      conversationId: conversation.id,
      userId: conversation.userId,
      isNewConversation: false,
      hasMedia: media.length > 0,
    };
  }
  if (msgError || !message) {
    throw new Error(
      `Failed to store inbound message: ${msgError?.message ?? "missing inserted message"}`,
    );
  }

  // Store media records
  if (media.length > 0) {
    const mediaRecords = media.map((m) => ({
      organization_id: conversation.organizationId,
      message_id: message.id,
      content_type: m.contentType,
      original_url: m.url,
    }));

    const { error: mediaError } = await supabase
      .schema("communication")
      .from("sms_media")
      .insert(mediaRecords);

    if (mediaError) {
      console.error("Failed to store media records:", mediaError);
    }
  }

  if (options?.commandCandidate) {
    await admitInboundSmsCommandCandidate(supabase, message.id);
  }

  if (options) {
    const policyKeyword = classifySmsPolicyKeyword(payload);
    if (policyKeyword) {
      await reconcileCanonicalSmsConsent(
        options.context,
        policyKeyword,
        providerEventKey,
      );
    }
    await completeInboundSmsReceipt(options.receipt.receiptId, message.id);
  }

  return {
    messageId: message.id,
    conversationId: conversation.id,
    userId: conversation.userId,
    isNewConversation: conversation.isNew,
    hasMedia: media.length > 0,
  };
}

/**
 * Is this number suppressed? Read from `crm.contact_medium` — the ONE
 * suppression store — so a STOP, an email unsubscribe and a spoken do-not-call
 * are the same fact to every channel.
 *
 * This used to read `communication.sms_consent.status = 'opted_out'`, which made
 * SMS enforce a store nothing else could see, and which the (now deleted)
 * `sms_handle_opt_out_keywords` trigger only ever wrote when a row was already
 * `opted_in` — so a STOP from an unenrolled number was enforced nowhere at all.
 * `sms_consent` survives as a preference/verification record; it is no longer a
 * suppression gate.
 */
export async function isPhoneNumberOptedOut(
  phoneNumber: string,
  organizationId?: string,
): Promise<boolean> {
  const supabase = createAdminClient();

  let query = supabase
    .schema("crm")
    .from("contact_medium")
    .select("unsubscribed_at, suppressed_at")
    .eq("channel", "phone")
    .eq("value_key", normalizeSmsEndpoint(phoneNumber))
    .is("deleted_at", null)
    .or("unsubscribed_at.not.is.null,suppressed_at.not.is.null")
    .limit(1);
  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to read phone suppression: ${error.message}`);
  }

  return (data?.length ?? 0) > 0;
}
