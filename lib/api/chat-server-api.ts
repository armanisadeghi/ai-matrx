// lib/api/chat-server-api.ts
//
// This app's server client, as @ai-matrx/chat's server port (PACKAGE-INDEPENDENCE.md §2.1, P9).
// The chat package reaches the AI Matrx server only through `host.server.api`; matrx-frontend
// supplies its own `lib/api` here (providers/ChatHostAdapter.tsx), so every package call runs
// exactly the code it ran before the port existed. The module augmentation below REGISTERS these
// types with the package (the TanStack `Register` pattern, like lib/redux/chat-store-register.ts),
// so package call sites type-check against these exact signatures.

import {
  buildRequestBody,
  callApi,
  callBatchDeleteMessages,
  callCompactTurns,
  callConversationDelete,
  callConversationFork,
  callConversationForkAndRun,
  callConversationMemoryCost,
  callConversationSandboxBind,
  callConversationSandboxUnbind,
  callConversationUpdate,
  callHideMessages,
  callReplaceMessages,
  callRestoreCompaction,
  resolveScope,
  waitForAuthReady,
  type ApiCallError,
  type ApiCallResult,
  type BatchDeleteResult,
  type CallScope,
  type CompactTurnsResult,
  type ConversationForkAndRunBody,
  type ConversationDeleteResult,
  type ConversationForkBody,
  type ConversationSettingsBody,
  type ConversationSettingsResult,
  type HideMessagesResult,
  type LLMParamsBody,
  type MemoryCostSummary,
  type MessageSelector,
  type ReplaceMessagesResult,
  type RestoreCompactionResult,
  type SandboxBindBody,
} from "@/lib/api/call-api";
import {
  cancelAgentRunRequest,
  createMatrxTransport,
  createMatrxTransportFromTarget,
  type MatrxTransportOptions,
} from "@/lib/api/matrx-transport";
import {
  peekSelectedOrganizationId,
  waitForOrganizationAdmission,
  type OrganizationAdmission,
} from "@/lib/api/organization-admission";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
import { adminLaneHeadersFor, adminLaneOrganizationId } from "@/lib/api/admin-lane";
import { adminDoorOpen } from "@/lib/api/adminDoor";
import { fetchContextState } from "@/lib/api/context-api";
import { apiGet, apiPatch, apiPost, buildPath } from "@/lib/api/typed-client";
import { getAccessTokenOrNull, postJson, requestRaw, resolveBaseUrl } from "@/lib/python-client";
import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";
import { mintCredential } from "@/lib/api/broker/client";
import { reportBrowserProviderFailure, reportBrowserProviderUsage } from "@/lib/api/provider-session-failure";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import type { LLMParams } from "@/lib/api/types";
import {
  clearApiOverrides,
  selectActiveServer,
  selectActiveServerHealth,
  selectAiApiVersion,
  selectApiVersion,
  selectEndpointOverrideConfig,
  selectLoopbackTargetsAllowed,
  selectPathOverrides,
  selectResolvedBaseUrl,
  setAiApiVersion,
  setApiVersion,
  setPathOverride,
  switchServer,
} from "@/lib/redux/slices/apiConfigSlice";
import {
  discoverLocalEngine,
  getCachedLocalEngine,
  supportsLocalAgentExecution,
} from "@/lib/local-engine/discovery";
import { invokeMatrxExtendTool } from "@/lib/extension-bridge/matrx-extend-client";

export const appChatServerApi = {
  // call-api
  callApi,
  buildRequestBody,
  resolveScope,
  waitForAuthReady,
  callConversationMemoryCost,
  callConversationFork,
  callConversationForkAndRun,
  callBatchDeleteMessages,
  callReplaceMessages,
  callHideMessages,
  callRestoreCompaction,
  callCompactTurns,
  callConversationUpdate,
  callConversationDelete,
  callConversationSandboxBind,
  callConversationSandboxUnbind,
  // matrx-transport
  createMatrxTransport,
  createMatrxTransportFromTarget,
  cancelAgentRunRequest,
  // organization admission + the admin seat
  peekSelectedOrganizationId,
  waitForOrganizationAdmission,
  applyOrganizationContextHeader,
  adminLaneOrganizationId,
  adminLaneHeadersFor,
  adminDoorOpen,
  // context state
  fetchContextState,
  // typed client + python client
  apiGet,
  apiPost,
  apiPatch,
  buildPath,
  postJson,
  requestRaw,
  getAccessTokenOrNull,
  resolveBaseUrl,
  productionUrl: (): string => AIDREAM_PRODUCTION_URL,
  // credentials broker + browser-held provider sessions
  mintCredential,
  reportBrowserProviderFailure,
  reportBrowserProviderUsage,
  // the NDJSON stream every run reads
  parseNdjsonStream,
  // the server selection
  selectResolvedBaseUrl,
  selectActiveServer,
  selectActiveServerHealth,
  selectAiApiVersion,
  selectApiVersion,
  selectPathOverrides,
  selectEndpointOverrideConfig,
  selectLoopbackTargetsAllowed,
  switchServer,
  setAiApiVersion,
  setApiVersion,
  setPathOverride,
  clearApiOverrides,
  // a matrx-local engine on this machine, and the browser extension
  getCachedLocalEngine,
  discoverLocalEngine,
  supportsLocalAgentExecution,
  invokeMatrxExtendTool,
};

export type AppChatServerApi = typeof appChatServerApi;

/** The request/response types the package's server calls use — this app's own. */
export interface AppChatServerTypes {
  ApiCallError: ApiCallError;
  ApiCallResult: ApiCallResult;
  CallScope: CallScope;
  LLMParams: LLMParams;
  LLMParamsBody: LLMParamsBody;
  MemoryCostSummary: MemoryCostSummary;
  MessageSelector: MessageSelector;
  BatchDeleteResult: BatchDeleteResult;
  ReplaceMessagesResult: ReplaceMessagesResult;
  HideMessagesResult: HideMessagesResult;
  RestoreCompactionResult: RestoreCompactionResult;
  CompactTurnsResult: CompactTurnsResult;
  ConversationForkBody: ConversationForkBody;
  ConversationForkAndRunBody: ConversationForkAndRunBody;
  ConversationSettingsBody: ConversationSettingsBody;
  ConversationSettingsResult: ConversationSettingsResult;
  ConversationDeleteResult: ConversationDeleteResult;
  SandboxBindBody: SandboxBindBody;
  MatrxTransportOptions: MatrxTransportOptions;
  OrganizationAdmission: OrganizationAdmission;
}

declare module "@ai-matrx/chat/host/contract" {
  interface ChatServerRegister {
    api: AppChatServerApi;
    types: AppChatServerTypes;
  }
}
