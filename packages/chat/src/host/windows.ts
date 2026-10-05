/**
 * The chat package's windows (CPM-009c, slice P18) — no React.
 *
 * `CHAT_WINDOWS` is THE list of every window/overlay id the package opens,
 * closes, renders as a panel, or asks about. Package code names a window only
 * through it (`CHAT_WINDOWS.runControlsWindow`), never as a bare string — the
 * `no-bare-overlay-id` guard fails a literal anywhere in the package. The host
 * hosts them through the `windows` port: matrx-frontend's adapter maps each id
 * onto its overlay catalogue (a compile-time check there refuses an id the
 * catalogue does not know) or onto a canvas tab (Quick Chat, the context
 * preview), so `?panels=` restore keeps going through the app's own window
 * manager.
 *
 * `openOverlay` / `closeOverlay` keep the call shape the package always used —
 * `dispatch(openOverlay({ overlayId, instanceId, data }))` — but resolve to the
 * windows port, so the package never imports the host's overlay slice.
 */

import type { ChatWindowsPort } from "./contract";
import { getChatHost, isChatHostConfigured } from "./configure";
import { createUnhostedWindows } from "./defaults/windows";

export const CHAT_WINDOWS = {
  // Result shells (one per display mode — see display-mode-overlay.ts).
  agentFullModal: "agentFullModal",
  agentCompactModal: "agentCompactModal",
  agentChatBubble: "agentChatBubble",
  agentInlineOverlay: "agentInlineOverlay",
  agentSidebarOverlay: "agentSidebarOverlay",
  agentFlexiblePanel: "agentFlexiblePanel",
  agentPanelOverlay: "agentPanelOverlay",
  agentToastOverlay: "agentToastOverlay",
  agentFloatingChat: "agentFloatingChat",
  agentChatCollapsible: "agentChatCollapsible",
  agentChatAssistant: "agentChatAssistant",
  // Package windows.
  agentAssistantMarkdownDebugWindow: "agentAssistantMarkdownDebugWindow",
  agentDebugWindow: "agentDebugWindow",
  agentGateWindow: "agentGateWindow",
  agentMemoryWindow: "agentMemoryWindow",
  agentRunHistoryWindow: "agentRunHistoryWindow",
  agentRunWindow: "agentRunWindow",
  chatDebugWindow: "chatDebugWindow",
  contextPreviewPanel: "contextPreviewPanel",
  customAgentWindow: "customAgentWindow",
  imagePeekHost: "imagePeekHost",
  liveRunWindow: "liveRunWindow",
  messageAnalysisWindow: "messageAnalysisWindow",
  observationalMemoryWindow: "observationalMemoryWindow",
  quickChat: "quickChat",
  quickChatHistory: "quickChatHistory",
  runControlsWindow: "runControlsWindow",
  sendToAgentWindow: "sendToAgentWindow",
  toolCallWindow: "toolCallWindow",
  // Host windows the package opens with its own payload.
  fullScreenEditor: "fullScreenEditor",
  saveToNotes: "saveToNotes",
  // THE ONE "Save to a table" (CPM register F-ST, windows-port option): a tool result's rows,
  // payload { text, value, hasValue, grid, title, shapeIndex, organizationId, callbackGroupId }.
  saveToTable: "saveToTable",
  shareModal: "shareModal",
  agentFromChatWindow: "agentFromChatWindow",
} as const;

export type ChatWindowId = (typeof CHAT_WINDOWS)[keyof typeof CHAT_WINDOWS];

export const CHAT_WINDOW_IDS: readonly ChatWindowId[] = Object.values(CHAT_WINDOWS);

const ID_SET: ReadonlySet<string> = new Set(CHAT_WINDOW_IDS);

export function isChatWindowId(value: unknown): value is ChatWindowId {
  return typeof value === "string" && ID_SET.has(value);
}

/** The instance a window opens as when the caller names none. */
export const DEFAULT_WINDOW_INSTANCE_ID = "default";

export interface ChatWindowOpenPayload {
  overlayId: ChatWindowId;
  instanceId?: string;
  data?: unknown;
}

export interface ChatWindowClosePayload {
  overlayId: ChatWindowId;
  instanceId?: string;
}

/** What `openOverlay`/`closeOverlay` return: a thunk the store's thunk middleware runs. */
export type ChatWindowThunk = () => void;

/**
 * Stand-in for code that runs with no chat host configured (a bare render, a
 * test): opens nothing and says so once per window id on the console.
 */
const UNHOSTED_WINDOWS: ChatWindowsPort = createUnhostedWindows(() => ({
  capture: () => {
    /* no host, so no diagnostics sink; the console line already said it */
  },
}));

/** The configured host's windows port, or the announcing stand-in when there is none. */
export function chatWindowsPort(): ChatWindowsPort {
  return isChatHostConfigured() ? getChatHost().windows : UNHOSTED_WINDOWS;
}

/** `dispatch(openOverlay({ overlayId, instanceId, data }))` — opens through the windows port. */
export function openOverlay(payload: ChatWindowOpenPayload): ChatWindowThunk {
  return () =>
    chatWindowsPort().open(payload.overlayId, payload.data, payload.instanceId);
}

/** `dispatch(closeOverlay({ overlayId, instanceId }))` — closes through the windows port. */
export function closeOverlay(payload: ChatWindowClosePayload): ChatWindowThunk {
  return () => chatWindowsPort().close(payload.overlayId, payload.instanceId);
}
