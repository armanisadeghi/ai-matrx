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

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectMessageById,
  selectFirstMessageId,
  persistedBodyBlocks,
  selectHasMoreOlderMessages,
  extractFlatText,
  extractInspectableText,
  extractContentBlocks,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { UserActionBar } from "./UserActionBar";
import {
  FirstTurnLaunchInputs,
  FirstTurnVariables,
  UserMessageVariables,
} from "./FirstTurnVariables";
import { ContextPolicyChipStrip } from "@/features/agents/components/context-policies-display/ContextPolicyChipStrip";
import { useMachineFramesVisible } from "@/features/agents/components/shared/transcript-audience";
import { useCollapsibleMessageText } from "./useCollapsibleMessageText";
import {
  selectHostSubmittedFirstTurnValues,
  selectOwnSubmittedFirstTurnValues,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { MessageAttachmentStrip } from "../MessageAttachmentStrip";
import { isAttachmentMessagePart } from "@/features/agents/components/context-items/normalize";
import MarkdownStream from "@/components/MarkdownStream";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import type { RootState } from "@/lib/redux/store";
import { buildVariableDisplayLines } from "@/features/agents/utils/variable-display-lines";
import type {
  MessagePart,
  RenderBlockPayload,
} from "@/types/python-generated/stream-events";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import {
  recordTranscriptEvent,
  shortId,
} from "@/features/agents/redux/execution-system/messages/transcript-journal";

export function AgentUserMessageContent({
  conversationId,
  text,
  attachmentParts,
  bodyBlocks,
  variables,
}: {
  conversationId: string;
  text: string;
  attachmentParts: MessagePart[];
  /**
   * Typed parts that are neither text nor an attachment chip — the decision
   * questions that were put, a speech script, any kind this build does not
   * know — as canonical render blocks (`persistedBodyBlocks`).
   */
  bodyBlocks?: RenderBlockPayload[];
  variables?: Record<string, unknown>;
}) {
  const trimmedText = text.trim();
  const hasBodyBlocks = !!bodyBlocks && bodyBlocks.length > 0;

  if (
    !trimmedText &&
    !hasBodyBlocks &&
    attachmentParts.length === 0 &&
    (!variables || buildVariableDisplayLines(variables).length === 0)
  ) {
    return null;
  }

  return (
    <>
      {variables ? <UserMessageVariables values={variables} /> : null}
      <MessageAttachmentStrip
        conversationId={conversationId}
        parts={attachmentParts}
      />
      {trimmedText || hasBodyBlocks ? (
        <MarkdownStream imagePolicy="other"
          content={trimmedText}
          serverProcessedBlocks={hasBodyBlocks ? bodyBlocks : undefined}
          className="text-xs text-foreground"
          hideCopyButton
          allowFullScreenEditor={false}
        />
      ) : null}
    </>
  );
}

/**
 * User-attached resource block types (`input_notes`, `input_task`, media, …).
 * These are ALWAYS rendered as attachment chips from `content[]` — never in the
 * context-policy strip. Mixing them in was the "note shows twice / id-only
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

/** Parts a user bubble draws itself: its text. Thinking/tool parts never
 * belong to a person's turn and stay out of the bubble. */
const USER_SELF_RENDERED_PART_TYPES = new Set([
  "text",
  "thinking",
  "tool_call",
  "tool_result",
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
  const machineFramesVisible = useMachineFramesVisible();
  // The agent driving this conversation — used by ContextPolicyChipStrip to
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
  // Raw-faithful view for the action bar (copy / edit / menu). For a message
  // whose stored content is a pure structured payload (e.g. media blocks with
  // no text), `text` is the pretty-printed JSON and `isStructuredRaw` flips
  // the edit affordance into the read-only raw viewer — actions never operate
  // on a blank. The transcript bubble below keeps rendering `trimmedText` +
  // attachment chips; the JSON never leaks into the display.
  const inspectable = extractInspectableText(record);
  // Persisted generated parts stay typed all the way into the one shared
  // attachment strip. No RenderBlockPayload/open-data conversion is involved.
  const attachmentParts = extractContentBlocks(record).filter(
    isAttachmentMessagePart,
  );
  // Every other typed part (decision questions, speech script, unknown kinds)
  // is message body — rendered, never dropped. useMemo: normalization mints ids.
  const bodyBlocks = useMemo(
    () =>
      persistedBodyBlocks(record, {
        isSelfRendered: (part) => USER_SELF_RENDERED_PART_TYPES.has(part.type ?? ""),
      }),
    [record],
  );

  const trimmedText = content.trim();
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
    selectOwnSubmittedFirstTurnValues(conversationId),
  );
  const hasVisibleVariables =
    isFirstTurnMessage &&
    buildVariableDisplayLines(userVariableValues).length > 0;
  const hasOwnContent = Boolean(
    trimmedText ||
    bodyBlocks.length > 0 ||
    attachmentParts.length > 0 ||
    hasVisibleVariables ||
    (contextSnapshot && contextSnapshot.length > 0),
  );
  // 🚨 A VARIABLES-ONLY FIRST TURN IS NOT AN EMPTY TURN. When every input the
  // turn carried was wired by the host (a kit's "Run it once", a surface's job
  // inputs) and the person typed nothing — the correct shape under THE
  // USER-INPUT LAW — the bubble used to claim "This message has no displayable
  // text." It states what actually started the run instead: a compact
  // "Started with" row naming the inputs, openable to their values. Only when
  // nothing else would render, so a bubble with the person's own words never
  // gains the host's vocabulary.
  const hostLaunchValues = useAppSelector(
    selectHostSubmittedFirstTurnValues(conversationId),
  );
  const launchOnlyTurn =
    !hasOwnContent &&
    isFirstTurnMessage &&
    buildVariableDisplayLines(hostLaunchValues).length > 0;
  const showLaunchInputs = launchOnlyTurn && machineFramesVisible;
  const hasContent = hasOwnContent || showLaunchInputs;

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
    const bodySig = bodyBlocks.map((block) => block.type).join("|");
    return `${variableSig}\u0000${contextSig}\u0000${attachmentSig}\u0000${bodySig}\u0000${trimmedText}`;
  }, [
    isFirstTurnMessage,
    userVariableValues,
    contextSnapshot,
    attachmentParts,
    bodyBlocks,
    trimmedText,
  ]);

  const { isCollapsed, setIsCollapsed, shouldBeCollapsible, measureRef } =
    useCollapsibleMessageText(collapseSignature);

  // A user row the model reads but the person never typed: loop-guard
  // notices, host steers, orchestrator gate notices. The server stamps them
  // `metadata.authored_by = "host"` with an EMPTY `user_content`, and hiding
  // them from the transcript is the design (they say "not from the user").
  const authoredByHost = metadata?.authored_by === "host";
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);

  // 🚨 A user bubble that renders NOTHING is the "my message disappeared"
  // defect wearing a different hat. The journal records every empty render
  // with the shape that produced it so the admin transcript report can name
  // it; the screen itself says what happened instead of going blank.
  useEffect(() => {
    if (hasContent || !record) return;
    recordTranscriptEvent(
      conversationId,
      authoredByHost
        ? "user_bubble_hidden_host_authored"
        : launchOnlyTurn
          ? "user_bubble_hidden_host_launch_only"
          : "user_bubble_rendered_empty",
      {
        id: shortId(messageId),
        position: record.position,
        clientStatus: record._clientStatus ?? null,
        userContentShape: describeUserContentShape(record.userContent),
        contentParts: Array.isArray(record.content) ? record.content.length : 0,
        contentTextLength: extractFlatText({
          ...record,
          userContent: null,
        }).length,
      },
    );
  }, [
    hasContent,
    record,
    conversationId,
    messageId,
    authoredByHost,
    launchOnlyTurn,
  ]);

  if (!hasContent) {
    // A launch-only turn on an Expert-audience transcript is the surface
    // starting the conversation — the same design as a host-authored row: the
    // inputs are machine frames she never supplied, so the bubble is absent
    // rather than a stand-in that claims her turn was empty.
    if (authoredByHost || launchOnlyTurn || !record) return null;
    const storedTextLength = extractFlatText({
      ...record,
      userContent: null,
    }).length;
    return (
      <div
        className={cn("group relative", compact ? "" : "ml-12")}
        data-testid="user-message-empty"
      >
        <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          This message has no displayable text.
          {isSuperAdmin && (
            <span className="ml-1 font-mono">
              [{shortId(messageId)} pos {record.position} ·{" "}
              {record._clientStatus ?? "no-client-status"} · user_content{" "}
              {describeUserContentShape(record.userContent)} · content{" "}
              {storedTextLength} chars]
            </span>
          )}
        </div>
      </div>
    );
  }

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
            {/* 🚨 AND THE LAUNCH VARIABLES ARE A BUILDER'S VIEW TOO. Found
                live on 2026-09-16 while verifying the tool-frame fix: with
                every tool card gone, the Conductor's first bubble still opened
                with "Attachments: … Rulebook Document: # … Rulebook id:
                a84d1c5e-… Status: draft · Version: 25", and the interview's
                with "Interview Probes: story_time / Interview Context Mode:
                blank_slate". Those are the values the HOST wired, in the
                host's vocabulary — the Expert neither typed them nor can act
                on them, and a raw enum token in her own message bubble is the
                purest form of the machine talking to itself. Creator mode
                still shows every one. */}
            {machineFramesVisible && isFirstTurnMessage && (
              <FirstTurnVariables conversationId={conversationId} />
            )}
            {showLaunchInputs && (
              <FirstTurnLaunchInputs
                conversationId={conversationId}
                onOpenChange={(open) => {
                  if (open) setIsCollapsed(false);
                }}
              />
            )}

            {/* Context policy chips — the TRUE per-turn context this message
                carried, read ONLY from this message's own data: the server's
                `model_context` column (authoritative; wins on reload) or, before
                that record lands, the optimistic `metadata.context_snapshot`
                frozen at submit by execute-instance.thunk. We never fall back to
                the live conversation context here: doing so made every historical
                bubble lie, showing the current context as if the model had seen
                it. Neither source → show nothing (honest). */}
            {/* 🚨 A CONTEXT SNAPSHOT IS A BUILDER'S RECORD OF WHAT THE MODEL
                SAW — it is not something an Expert asked for, attached, or can
                act on. On an expert-audience transcript the "CONTEXT · Context
                Items (13)" strip is the same leak as a tool card, one bubble
                higher (cold walk 2026-09-16, finding #2's family). Creator mode
                still shows it. See ../../shared/transcript-audience.tsx. */}
            {machineFramesVisible && contextSnapshot && contextSnapshot.length > 0 && (
              <ContextPolicyChipStrip
                conversationId={conversationId}
                agentId={agentId}
                entries={contextSnapshot}
              />
            )}

            <AgentUserMessageContent
              conversationId={conversationId}
              text={trimmedText}
              attachmentParts={attachmentParts}
              bodyBlocks={bodyBlocks}
            />
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
          content={inspectable.isStructuredRaw ? inspectable.text : trimmedText}
          structuredRaw={inspectable.isStructuredRaw}
          messageId={messageId}
          conversationId={conversationId}
          metadata={metadata}
          surfaceKey={surfaceKey}
        />
      </div>
    </div>
  );
}

/**
 * Compact shape word for `user_content` — the projection the bubble prefers
 * over `content` when it is non-null. Shared with the transcript report so
 * the two never disagree about what "empty" means.
 */
export function describeUserContentShape(
  userContent: unknown,
): "null" | "empty" | "no_text" | "text" | "non_array" {
  if (userContent == null) return "null";
  if (!Array.isArray(userContent)) return "non_array";
  if (userContent.length === 0) return "empty";
  const hasText = userContent.some(
    (part) =>
      part &&
      typeof part === "object" &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string" &&
      (part as { text: string }).text.trim().length > 0,
  );
  return hasText ? "text" : "no_text";
}
