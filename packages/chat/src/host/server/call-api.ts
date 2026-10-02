/**
 * Server seam (P9) — the one server call (`callApi`) and its conversation helpers. Same names the call sites imported from the
 * host's `lib/api/call-api`; each forwards at call time to the configured host's server
 * client (`../server.ts`).
 */

import { forwardServer, type ChatServerTypes } from "../server";

export const callApi = forwardServer("callApi");
export const buildRequestBody = forwardServer("buildRequestBody");
export const resolveScope = forwardServer("resolveScope");
export const waitForAuthReady = forwardServer("waitForAuthReady");
export const callConversationMemoryCost = forwardServer("callConversationMemoryCost");
export const callConversationFork = forwardServer("callConversationFork");
export const callConversationForkAndRun = forwardServer("callConversationForkAndRun");
export const callBatchDeleteMessages = forwardServer("callBatchDeleteMessages");
export const callReplaceMessages = forwardServer("callReplaceMessages");
export const callHideMessages = forwardServer("callHideMessages");
export const callRestoreCompaction = forwardServer("callRestoreCompaction");
export const callCompactTurns = forwardServer("callCompactTurns");

export type ApiCallError = ChatServerTypes["ApiCallError"];
export type ApiCallResult = ChatServerTypes["ApiCallResult"];
export type CallScope = ChatServerTypes["CallScope"];
export type LLMParamsBody = ChatServerTypes["LLMParamsBody"];
export type MemoryCostSummary = ChatServerTypes["MemoryCostSummary"];
export type MessageSelector = ChatServerTypes["MessageSelector"];
export type BatchDeleteResult = ChatServerTypes["BatchDeleteResult"];
export type ReplaceMessagesResult = ChatServerTypes["ReplaceMessagesResult"];
export type HideMessagesResult = ChatServerTypes["HideMessagesResult"];
export type RestoreCompactionResult = ChatServerTypes["RestoreCompactionResult"];
export type CompactTurnsResult = ChatServerTypes["CompactTurnsResult"];
export type ConversationForkBody = ChatServerTypes["ConversationForkBody"];
export type ConversationForkAndRunBody = ChatServerTypes["ConversationForkAndRunBody"];
