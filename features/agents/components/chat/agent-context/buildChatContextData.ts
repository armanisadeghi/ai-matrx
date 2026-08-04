import { PLACEMENT_TYPES } from "@/features/agent-shortcuts/constants";
import {
  createChatScope,
  type ChatAttachedResourceEntry,
  type ChatScratchpadRef,
  type ChatWorkingDocumentRef,
} from "@/features/surfaces/manifests/chat.manifest";

/**
 * Canonical `contextData` + menu props for the `matrx-user/chat` surface
 * (the live `/chat` route). Pure: live chat state → `createChatScope(...)`,
 * so every region (composer + presentational display) and any future demo
 * share one shape. See `features/agents/components/chat/FEATURE.md`.
 *
 * The surface emits five kinds of value (mirroring the manifest's groups):
 *   1. Baselines (`selection` / `text_before` / `text_after` / `content` /
 *      `context`) — from the live composer draft, so agent actions can target
 *      what the user is typing right now.
 *   2. Conversation customs — id / title / message count / agent id+name.
 *   3. Message customs — the targeted message (`current_message_*`), the last
 *      user / assistant turn, and the full transcript (`full_conversation_text`
 *      / `all_messages`).
 *   4. Composer customs — the draft (`input_draft`), attached resource chips
 *      (`attached_resources`), and resolved agent variables (`variable_values`).
 *   5. Session state + context-document refs — `is_streaming` /
 *      `conversation_status` / `model`, and the lean `working_document` /
 *      `scratchpad` references (never the bodies — those are their own
 *      surfaces).
 *
 * Callers pass only what they can honestly source. The pre-first-message
 * landing composer (`NewChatLandingInput`) sources just the draft + agent;
 * the room display can additionally source the message family. Every value is
 * optional — the registry floors the baselines at launch, so a binding never
 * resolves to nothing.
 */

/** Placements offered by the chat surface's right-click menu. */
export const CHAT_CONTEXT_MENU_PLACEMENTS = [
  PLACEMENT_TYPES.AI_ACTION,
  PLACEMENT_TYPES.CONTENT_BLOCK,
  PLACEMENT_TYPES.QUICK_ACTION,
] as const;

/**
 * Shared menu props for `matrx-user/chat`. `sourceFeature` is the canonical
 * chat-route literal (see `features/agents/types/instance.types.ts`), so traces
 * attribute a launch to the live chat route; `surfaceName` equals the
 * `ui_surface.name` row.
 */
export const CHAT_CONTEXT_MENU_PROPS = {
  sourceFeature: "chat" as const,
  surfaceName: "matrx-user/chat" as const,
  isEditable: true as const,
  enabledPlacements: [...CHAT_CONTEXT_MENU_PLACEMENTS],
};

/** One message in the active conversation, ordered. */
export interface ChatMessageEntry {
  id: string;
  role: string;
  text: string;
  created_at?: string;
}

export interface BuildChatContextDataArgs {
  /** Current composer draft (what the user has typed, not yet sent). */
  inputDraft?: string;
  /** Caret / selection inside the composer (textarea offsets). */
  selectionStart?: number;
  selectionEnd?: number;

  /** Active conversation. Absent before the first message is sent. */
  conversationId?: string | null;
  conversationTitle?: string | null;
  conversationStatus?: string | null;
  isStreaming?: boolean;

  /** Agent driving the conversation (read-only provenance once it exists). */
  agentId?: string | null;
  agentName?: string | null;

  /** The message the user is acting on (e.g. right-clicked). */
  currentMessageId?: string | null;
  currentMessageRole?: string | null;
  currentMessageText?: string | null;

  /** Most-recent of each role, and the whole transcript. */
  lastUserMessage?: string | null;
  lastAssistantMessage?: string | null;
  messages?: ChatMessageEntry[];

  /** Composer attachments (lean chip refs) + resolved agent variables. */
  attachedResources?: ChatAttachedResourceEntry[];
  variableValues?: Record<string, unknown> | null;

  /** Session state: the model in effect after instance overrides. */
  model?: string | null;

  /** Lean refs to the conversation's context documents (never the bodies). */
  workingDocument?: ChatWorkingDocumentRef | null;
  scratchpad?: ChatScratchpadRef | null;
}

function joinTranscript(messages: ChatMessageEntry[]): string {
  return messages
    .map((m) => {
      const role = m.role
        ? m.role.charAt(0).toUpperCase() + m.role.slice(1)
        : "Message";
      return `${role}: ${m.text ?? ""}`;
    })
    .join("\n\n");
}

/**
 * Pure extraction of the chat surface's runtime scope. Shared by the composer
 * (editable) and the conversation display (presentational).
 */
export function buildChatContextData(
  args: BuildChatContextDataArgs,
): Record<string, unknown> {
  const {
    inputDraft = "",
    selectionStart = 0,
    selectionEnd = 0,
    conversationId,
    conversationTitle,
    conversationStatus,
    isStreaming,
    agentId,
    agentName,
    currentMessageId,
    currentMessageRole,
    currentMessageText,
    lastUserMessage,
    lastAssistantMessage,
    messages = [],
    attachedResources,
    variableValues,
    model,
    workingDocument,
    scratchpad,
  } = args;

  // Composer baselines — selection/neighbors taken from the live draft so an
  // agent action can operate on exactly what the user is composing. `context`
  // (the structured ambient slot) is left unset here; the neighbor text rides
  // on `text_before`/`text_after`, and the registry floors `context` to `{}`
  // at launch, so a binding never resolves to nothing.
  const draft = inputDraft;
  const hasSelection = selectionEnd > selectionStart;
  const selectedText = hasSelection
    ? draft.slice(selectionStart, selectionEnd)
    : "";

  const hasConversation = Boolean(conversationId);
  const messageCount = messages.length;
  const fullTranscript = messages.length ? joinTranscript(messages) : "";

  const scope = createChatScope({
    // Baselines (composer draft).
    selection: selectedText || undefined,
    text_before: draft ? draft.slice(0, selectionStart) : undefined,
    text_after: draft ? draft.slice(selectionEnd) : undefined,
    // `content` is the composer body — what the user is writing. The full
    // transcript rides on `full_conversation_text` / `all_messages` instead.
    content: draft || undefined,

    // Active conversation.
    conversation_id: hasConversation ? conversationId! : undefined,
    conversation_title: conversationTitle || undefined,
    conversation_message_count: hasConversation ? messageCount : undefined,
    conversation_agent_id: agentId || undefined,
    conversation_agent_name: agentName || undefined,

    // Targeted message.
    current_message_id: currentMessageId || undefined,
    current_message_role: currentMessageRole || undefined,
    current_message_text: currentMessageText || undefined,

    // Last messages + transcript.
    last_user_message: lastUserMessage || undefined,
    last_assistant_message: lastAssistantMessage || undefined,
    full_conversation_text: fullTranscript || undefined,
    all_messages: messages.length ? messages : undefined,

    // Composer / runtime state.
    input_draft: draft || undefined,
    attached_resources: attachedResources?.length ? attachedResources : undefined,
    variable_values:
      variableValues && Object.keys(variableValues).length
        ? variableValues
        : undefined,
    is_streaming: isStreaming || undefined,
    conversation_status: conversationStatus || undefined,
    model: model || undefined,

    // Context documents — lean refs only; bodies belong to their own surfaces.
    working_document: workingDocument || undefined,
    scratchpad: scratchpad || undefined,
  });

  return scope as Record<string, unknown>;
}
