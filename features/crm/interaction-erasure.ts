import type { InteractionRow } from "./types";

const ERASURE_TOMBSTONE_PREFIX = "erased:sha256:";

export type InteractionRemovalTarget = Pick<
  InteractionRow,
  | "id"
  | "organization_id"
  | "direction"
  | "channel_code"
  | "message_id"
  | "attributes"
>;

type InteractionRemovalPatch = Partial<InteractionRow> & {
  deleted_at: string;
};

export interface InteractionRemoval {
  providerMessageId: string | null;
  sendingIdentityId: string | null;
  patch: InteractionRemovalPatch;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function retainedGmailIdentityId(row: InteractionRemovalTarget): string | null {
  if (
    row.direction !== "inbound" ||
    row.channel_code !== "email" ||
    typeof row.message_id !== "string" ||
    row.message_id.length === 0 ||
    !isObject(row.attributes)
  ) {
    return null;
  }
  const inbound = row.attributes.outreach_inbound;
  if (!isObject(inbound)) return null;
  const identityId = inbound.identity_id;
  return typeof identityId === "string" && identityId.length > 0
    ? identityId
    : null;
}

export async function erasureTombstoneMessageId(
  providerMessageId: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(providerMessageId);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${ERASURE_TOMBSTONE_PREFIX}${hex}`;
}

export async function buildInteractionRemoval(
  row: InteractionRemovalTarget,
  deletedAt = new Date().toISOString(),
): Promise<InteractionRemoval> {
  const sendingIdentityId = retainedGmailIdentityId(row);
  if (!sendingIdentityId || !row.message_id) {
    return {
      providerMessageId: null,
      sendingIdentityId: null,
      patch: { deleted_at: deletedAt },
    };
  }

  return {
    providerMessageId: row.message_id,
    sendingIdentityId,
    patch: {
      deleted_at: deletedAt,
      subject: null,
      body: null,
      thread_key: null,
      in_reply_to: null,
      message_id: await erasureTombstoneMessageId(row.message_id),
      attributes: {},
      metadata: {},
      custom_fields: {},
      provider: null,
      provider_account_id: null,
      provider_interaction_id: null,
      provider_status: null,
      provider_status_at: null,
      provider_status_sequence: null,
    },
  };
}
