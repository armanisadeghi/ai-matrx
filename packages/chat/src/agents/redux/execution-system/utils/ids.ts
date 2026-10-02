/**
 * ID Generation
 *
 * Client-generated IDs for execution entities (conversations, resources, requests).
 * Conversation IDs are plain UUIDs (no prefix) so they can be sent to the server
 * as-is and used as the authoritative conversation key.
 */

export const generateConversationId = (): string =>
    crypto.randomUUID();

/** @deprecated Use generateConversationId() */
export const generateInstanceId = generateConversationId;

export const generateResourceId = (): string =>
    `res_${crypto.randomUUID()}`;

export const generateRequestId = (): string =>
    `req_${crypto.randomUUID()}`;

export const generateScopeId = (): string =>
    `scope_${crypto.randomUUID()}`;
