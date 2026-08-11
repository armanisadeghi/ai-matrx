"use client";

/**
 * AgentUserMessage
 *
 * Renders a user turn — text + content block chips — inside one collapsible
 * bubble, matching the style of PromptUserMessage.
 *
 * Content blocks are always RenderBlockPayload (normalized at the Redux
 * boundary). Chips are tiny pill-shaped references. Clicking opens a per-type
 * modal (placeholder JSON viewer until real modals are built).
 */

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectMessageById,
  selectFirstMessageId,
  selectHasMoreOlderMessages,
  extractFlatText,
  extractContentBlocks,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { UserActionBar } from "./UserActionBar";
import { FirstTurnVariables } from "./FirstTurnVariables";
import { ContextSlotChipStrip } from "@/features/agents/components/context-slots-display/ContextSlotChipStrip";
import { useCollapsibleMessageText } from "./useCollapsibleMessageText";
import { selectUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { MessageAttachmentStrip } from "../MessageAttachmentStrip";
import { isAttachmentMessagePart } from "@/features/agents/components/context-items/normalize";
import MarkdownStream from "@/components/MarkdownStream";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import type { RootState } from "@/lib/redux/store";

/**
 * User-attached resource block types (`input_notes`, `input_task`, media, …).
 * These are ALWAYS rendered as attachment chips from `content[]` — never in the
 * context-slot strip. Mixing them in was the "note shows twice / id-only
 * context chip" bug: `model_context.input_items` duplicates what content blocks
 * already carry, and attachments are auto-included for the model — unlike
 * ambient context entries the agent may defer-fetch via ctx_get.
 */
const ATTACHMENT_BLOCK_TYPES = new Set([
  "input_notes",
  "input_task",
  "input_table",
  "input_list",
  "input_data",
  "input_webpage",
  "input_workbook",
  "input_document",
  "input_project",
  "input_agent",
  "input_agent_app",
  "input_transcript",
  "input_transcript_session",
  "document",
  "image",
  "audio",
  "video",
  "youtube_video",
]);

function isAmbientContextEntry(entry: InstanceContextEntry): boolean {
  return !ATTACHMENT_BLOCK_TYPES.has(entry.type);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AgentUserMessageProps {
  conversationId: string;
  /** Server-assigned `cx_message.id` or client temp id for an optimistic user message. */
  messageId: string;
  /**
   * Optional surface key for routing fork / delete / retry outcomes via
   * the surfaces registry. Threaded down to UserActionBar.
   */
  surfaceKey?: string;
  compact?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component — collapsible bubble identical in style to PromptUserMessage
// ─────────────────────────────────────────────────────────────────────────────

export function AgentUserMessage({
  conversationId,
  messageId,
  surfaceKey,
  compact = false,
}: AgentUserMessageProps) {
  const record = useAppSelector(selectMessageById(conversationId, messageId));
  // The agent driving this conversation — used by ContextSlotChipStrip to
  // resolve slot definitions for type/label/description on each chip.
  const agentId = useAppSelector(
    (state: RootState) =>
      state.conversations.byConversationId[conversationId]?.agentId ?? null,
  );

  // The conversation's first turn carries its launch variables. Show the
  // variables strip only on the genuinely-first user message — i.e. the
  // first message currently loaded AND no older history paginated above it
  // (otherwise the "first loaded" message isn't actually turn 1).
  const firstMessageId = useAppSelector(selectFirstMessageId(conversationId));
  const hasMoreOlder = useAppSelector(
    selectHasMoreOlderMessages(conversationId),
  );
  const isFirstTurnMessage = !hasMoreOlder && firstMessageId === messageId;

  const [isHovered, setIsHovered] = useState(false);

  const content = extractFlatText(record);
  // Persisted generated parts stay typed all the way into the one shared
  // attachment strip. No RenderBlockPayload/open-data conversion is involved.
  const attachmentParts = extractContentBlocks(record).filter(
    isAttachmentMessagePart,
  );

  const trimmedText = content.trim();
  const hasContent = trimmedText || attachmentParts.length > 0;
  const metadata =
    record?.metadata && typeof record.metadata === "object"
      ? (record.metadata as Record<string, unknown>)
      : null;

  // Per-turn context this message actually carried, frozen at submit. NEVER
  // read live conversation context for a historical bubble — that's the
  // "context indicator is lying" bug.
  //
  // Two sources, in priority order:
  //   1. `record.modelContext.items` — ambient / slot context the agent may
  //      defer-fetch (org, working document, declared slots, …). Authoritative
  //      on reload. Does NOT include user attachments — those live in
  //      `content[]` + attachment chips only (`input_items` is server metadata,
  //      not a second UI surface).
  //   2. `metadata.context_snapshot` — optimistic snapshot frozen at submit
  //      by execute-instance.thunk. Used ONLY when `modelContext` is entirely
  //      absent (otherwise the authoritative record always wins).
  // Absent both → render no chips (honest).
  const modelContext = record?.modelContext;
  const ambientEntries: InstanceContextEntry[] = (
    modelContext?.items ?? []
  ).map((item) => ({
    key: item.key,
    // Inline items carry their literal `value`. DEFERRED items (large /
    // remote context) have no `value` — only a `size_hint` like "0 chars"
    // (zero *inlined*, not zero document length). Never surface that string
    // as `value` — it reads as "empty document" in chip previews. Fall back
    // to the label so deferred context still renders a chip; previews resolve
    // the real size from live instance context.
    value: item.value ?? item.label,
    slotMatched: item.slot_matched,
    type: item.type as InstanceContextEntry["type"],
    label: item.label,
  }));

  const filteredAmbient = ambientEntries.filter(isAmbientContextEntry);
  const filteredSnapshot = Array.isArray(metadata?.context_snapshot)
    ? (metadata.context_snapshot as InstanceContextEntry[]).filter(
        isAmbientContextEntry,
      )
    : null;

  const contextSnapshot: InstanceContextEntry[] | null = modelContext
    ? filteredAmbient.length > 0
      ? filteredAmbient
      : null
    : filteredSnapshot && filteredSnapshot.length > 0
      ? filteredSnapshot
      : null;

  // Variable values for the first-turn strip — pulled here ONLY so the collapse
  // signature reflects them. This is the "top section" that holds the largest
  // text and was previously excluded from collapse measurement entirely.
  const userVariableValues = useAppSelector(
    selectUserVariableValues(conversationId),
  );

  // Collapse signature — a fingerprint of EVERYTHING that renders inside the
  // bubble, so the whole component (variables + context chips + attachments +
  // text) drives collapse, and a change to any section re-evaluates collapse.
  // The measureRef wraps the entire inner stack; `scrollHeight` on the clamped
  // container reports full height regardless of the max-h clamp, so no separate
  // off-screen sizer is needed.
  const collapseSignature = useMemo(() => {
    const variableSig = isFirstTurnMessage
      ? JSON.stringify(userVariableValues)
      : "";
    const contextSig = (contextSnapshot ?? [])
      .map((e) => `${e.key}:${e.label}`)
      .join("|");
    const attachmentSig = attachmentParts
      .map((part, index) => `${part.type}:${index}`)
      .join("|");
    return `${variableSig}\u0000${contextSig}\u0000${attachmentSig}\u0000${trimmedText}`;
  }, [
    isFirstTurnMessage,
    userVariableValues,
    contextSnapshot,
    attachmentParts,
    trimmedText,
  ]);

  const { isCollapsed, setIsCollapsed, shouldBeCollapsible, measureRef } =
    useCollapsibleMessageText(collapseSignature);

  if (!hasContent) return null;

  const containerMargin = compact ? "" : "ml-12";

  return (
    <div
      className={cn("group relative", containerMargin)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Top-center collapse chevron — only visible on hover when expanded */}
      {shouldBeCollapsible && !isCollapsed && (
        <div
          className={cn(
            "absolute -top-3 left-1/2 -translate-x-1/2 z-10 transition-all duration-150",
            isHovered ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(true);
            }}
            className="flex items-center justify-center h-5 w-5 rounded-full bg-background/90 border border-border shadow-sm text-muted-foreground hover:text-foreground transition-colors"
            title="Collapse"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="bg-muted border border-border rounded-lg px-2 py-2">
        {/* Collapsible region — the ENTIRE message body. The whole stack
            (variables + context chips + attachment chips + text) is measured
            and clamped as one unit: the outer component controls sizing, so
            everything inside counts toward it. The variables strip in
            particular is usually the largest block of text in the bubble and
            MUST be collapsed with the rest. `measureRef` lives on the clamped
            container itself — `scrollHeight` reports full height regardless of
            the `max-h` clamp, so no off-screen duplicate is needed.

            Bubbles default to collapsed (live submit AND DB reload) and only
            ever open on a physical user click. Do not move any section out of
            this region. */}
        <div className="relative min-w-0">
          <div
            ref={measureRef}
            className={cn(
              "space-y-1.5 overflow-hidden transition-all duration-300",
              shouldBeCollapsible && isCollapsed && "max-h-12",
            )}
          >
            {/* First-turn variables — the values this conversation was launched
                with. Display-only, sourced from the instance variable slice, so
                live and reloaded conversations render identically. Shown once,
                on turn 1. */}
            {isFirstTurnMessage && (
              <FirstTurnVariables conversationId={conversationId} />
            )}

            {/* Context slot chips — the TRUE per-turn context this message
                carried, read ONLY from this message's own data: the server's
                `model_context` column (authoritative; wins on reload) or, before
                that record lands, the optimistic `metadata.context_snapshot`
                frozen at submit by execute-instance.thunk. We never fall back to
                the live conversation context here: doing so made every historical
                bubble lie, showing the current context as if the model had seen
                it. Neither source → show nothing (honest). */}
            {contextSnapshot && contextSnapshot.length > 0 && (
              <ContextSlotChipStrip
                conversationId={conversationId}
                agentId={agentId}
                entries={contextSnapshot}
              />
            )}

            {/* Attachment chips */}
            <MessageAttachmentStrip
              conversationId={conversationId}
              parts={attachmentParts}
            />

            {/* Text content */}
            {trimmedText && (
              <MarkdownStream
                content={trimmedText}
                className="text-xs text-foreground"
                hideCopyButton
                allowFullScreenEditor={false}
              />
            )}
          </div>

          {/* Fade + expand affordance — overlays the whole collapsed body. */}
          {shouldBeCollapsible && isCollapsed && (
            <>
              <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-muted via-muted/60 to-transparent pointer-events-none" />
              <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsCollapsed(false);
                  }}
                  className="h-6 w-6 p-0 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Expand message"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Action bar — floats below the bubble, visible on hover. Uses the
          full role="user" action registry, including Edit & Resubmit. */}
      <div
        className={cn(
          "absolute -bottom-7 right-0 transition-all duration-150",
          isHovered
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-1 pointer-events-none",
        )}
      >
        <UserActionBar
          content={trimmedText}
          messageId={messageId}
          conversationId={conversationId}
          metadata={metadata}
          surfaceKey={surfaceKey}
        />
      </div>
    </div>
  );
}
