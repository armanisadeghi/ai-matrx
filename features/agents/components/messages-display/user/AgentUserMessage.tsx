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
  Image as ImageIcon,
  Music,
  Video,
  FileText,
  Globe,
  StickyNote,
  CheckSquare,
  Table2,
  List,
  Database,
  Youtube,
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
import { BlockHoverPreview } from "@/features/agents/components/previews/BlockHoverPreview";
import { FileResourceChip } from "@/features/files";
import { ContextSlotChipStrip } from "@/features/agents/components/context-slots-display/ContextSlotChipStrip";
import { ResourceAttachmentTile } from "./ResourceAttachmentTile";
import { useCollapsibleMessageText } from "./useCollapsibleMessageText";
import { selectUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { ContextItemDrawer } from "@/features/agents/components/context-items/ContextItemDrawer";
import { useContextItemDrawer } from "@/features/agents/components/context-items/useContextItemDrawer";
import { normalizeBlock } from "@/features/agents/components/context-items/normalize";
import { normalizeContentBlocks } from "@/features/agents/redux/execution-system/utils/normalize-content-blocks";
import type { ContextDrawerItem } from "@/features/agents/components/context-items/types";
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

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

type ContentBlock = RenderBlockPayload;

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

interface NormalisedBlock {
  key: string;
  blockType: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  chipBg: string;
  chipBorder: string;
  label: string;
  title: string;
  raw: ContentBlock;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation
// ─────────────────────────────────────────────────────────────────────────────

function normaliseBlock(
  block: ContentBlock,
  idx: number,
): NormalisedBlock | null {
  if (block.type === "text") return null;

  const key = block.blockId ?? `block-${idx}`;

  // Normalized output types (from streaming or DB normalization)
  switch (block.type) {
    case "image":
    case "image_output":
      return mediaChip(key, "image", block);
    case "audio":
    case "audio_output":
      return mediaChip(key, "audio", block);
    case "video":
    case "video_output":
      return mediaChip(key, "video", block);
    case "document":
    case "file_output":
      return mediaChip(key, "document", block);
    case "youtube_video":
      return mediaChip(key, "youtube", block);

    case "input_webpage":
      return chip(
        key,
        "input_webpage",
        Globe,
        "text-teal-600 dark:text-teal-400",
        "bg-teal-50 dark:bg-teal-950/30",
        "border-teal-300 dark:border-teal-700",
        "Webpage",
        block,
      );
    case "input_notes":
      return chip(
        key,
        "input_notes",
        StickyNote,
        "text-orange-600 dark:text-orange-400",
        "bg-orange-50 dark:bg-orange-950/30",
        "border-orange-300 dark:border-orange-700",
        "Note",
        block,
      );
    case "input_task":
      return chip(
        key,
        "input_task",
        CheckSquare,
        "text-blue-600 dark:text-blue-400",
        "bg-blue-50 dark:bg-blue-950/30",
        "border-blue-300 dark:border-blue-700",
        "Task",
        block,
      );
    case "input_table":
      return chip(
        key,
        "input_table",
        Table2,
        "text-green-600 dark:text-green-400",
        "bg-green-50 dark:bg-green-950/30",
        "border-green-300 dark:border-green-700",
        "Table",
        block,
      );
    case "input_list":
      return chip(
        key,
        "input_list",
        List,
        "text-purple-600 dark:text-purple-400",
        "bg-purple-50 dark:bg-purple-950/30",
        "border-purple-300 dark:border-purple-700",
        "List",
        block,
      );
    case "input_data":
      return chip(
        key,
        "input_data",
        Database,
        "text-gray-600 dark:text-gray-400",
        "bg-gray-50 dark:bg-gray-950/30",
        "border-gray-300 dark:border-gray-700",
        "Data",
        block,
      );

    default:
      return null;
  }
}

function mediaChip(
  key: string,
  kind: string,
  raw: ContentBlock,
): NormalisedBlock {
  const map: Record<
    string,
    [
      React.ComponentType<{ className?: string }>,
      string,
      string,
      string,
      string,
    ]
  > = {
    image: [
      ImageIcon,
      "text-blue-600 dark:text-blue-400",
      "bg-blue-50 dark:bg-blue-950/30",
      "border-blue-300 dark:border-blue-700",
      "Image",
    ],
    audio: [
      Music,
      "text-pink-600 dark:text-pink-400",
      "bg-pink-50 dark:bg-pink-950/30",
      "border-pink-300 dark:border-pink-700",
      "Audio",
    ],
    video: [
      Video,
      "text-indigo-600 dark:text-indigo-400",
      "bg-indigo-50 dark:bg-indigo-950/30",
      "border-indigo-300 dark:border-indigo-700",
      "Video",
    ],
    document: [
      FileText,
      "text-gray-600 dark:text-gray-400",
      "bg-gray-50 dark:bg-gray-950/30",
      "border-gray-300 dark:border-gray-700",
      "Doc",
    ],
    youtube: [
      Youtube,
      "text-red-600 dark:text-red-400",
      "bg-red-50 dark:bg-red-950/30",
      "border-red-300 dark:border-red-700",
      "YouTube",
    ],
  };
  const [icon, iconColor, chipBg, chipBorder, defaultLabel] =
    map[kind] ?? map.document;

  const d = raw.data as Record<string, unknown> | null | undefined;
  const title =
    (d?.["filename"] as string) ??
    (d?.["title"] as string) ??
    (d?.["url"] as string)?.split("/").pop() ??
    defaultLabel;
  return {
    key,
    blockType: raw.type,
    icon,
    iconColor,
    chipBg,
    chipBorder,
    label: defaultLabel,
    title,
    raw,
  };
}

function chip(
  key: string,
  blockType: string,
  icon: React.ComponentType<{ className?: string }>,
  iconColor: string,
  chipBg: string,
  chipBorder: string,
  label: string,
  raw: ContentBlock,
): NormalisedBlock {
  const d = raw.data as Record<string, unknown> | null | undefined;
  const title =
    (d?.["title"] as string) ??
    (d?.["label"] as string) ??
    (d?.["name"] as string) ??
    label;
  return {
    key,
    blockType,
    icon,
    iconColor,
    chipBg,
    chipBorder,
    label,
    title,
    raw,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chip — tiny pill reference inside the bubble
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pull the cld_files UUID off a content block when present. Media blocks
 * (image / audio / video / document) carry it as `file_id` per the
 * MediaRef contract. Non-media blocks return null and fall through to
 * the legacy per-type chip + modal path.
 */
function extractBlockFileId(raw: ContentBlock): string | null {
  if (!raw || typeof raw !== "object") return null;
  const { type } = raw as { type?: string };
  if (
    type !== "image" &&
    type !== "image_output" &&
    type !== "audio" &&
    type !== "audio_output" &&
    type !== "video" &&
    type !== "video_output" &&
    type !== "document" &&
    type !== "file_output"
  ) {
    return null;
  }
  const r = raw as {
    file_id?: unknown;
    data?: Record<string, unknown> | null;
  };
  if (typeof r.file_id === "string") return r.file_id;
  const data = r.data;
  if (data && typeof data.fileId === "string") return data.fileId;
  if (data && typeof data.file_id === "string") return data.file_id;
  return null;
}

function AttachmentChip({
  block,
  onOpen,
}: {
  block: NormalisedBlock;
  onOpen: (blockKey: string) => void;
}) {
  const fileId = extractBlockFileId(block.raw);

  // file_id media keeps its rich FileResourceChip, but clicking still opens the
  // shared drawer (the chip itself only renders a thumbnail/label).
  const tile = fileId ? (
    <button
      type="button"
      onClick={() => onOpen(block.key)}
      className="inline-flex"
    >
      <FileResourceChip fileId={fileId} size="xs" />
    </button>
  ) : (
    <ResourceAttachmentTile
      typeLabel={block.label}
      title={block.title}
      icon={block.icon}
      themeKey={block.blockType}
      onClick={() => onOpen(block.key)}
    />
  );

  return (
    <BlockHoverPreview block={block.raw} side="top" align="start">
      {tile}
    </BlockHoverPreview>
  );
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
  // Non-text content blocks (images, audio, tables, etc.) render as chips.
  // Filter out plain text blocks since those are already rendered as the
  // main content line.
  //
  // `extractContentBlocks` returns the persisted `MessagePart[]` shape
  // (`note_ids` on the part root). The drawer + hover previews expect the
  // canonical `RenderBlockPayload` shape (`note_ids` under `data`) — same
  // normalization `AgentAssistantMessage` already applies. Without this,
  // clicking a sent note chip opens an empty drawer because the id was never
  // lifted into `refs.noteIds`.
  //
  // useMemo is intentional: normalizeContentBlocks mints blockIds.
  const renderBlocks = useMemo(() => {
    const parts = extractContentBlocks(record).filter((b) => b.type !== "text");
    if (parts.length === 0) return [] as ContentBlock[];
    return normalizeContentBlocks(parts) as ContentBlock[];
  }, [record]);

  const normalisedBlocks: NormalisedBlock[] = renderBlocks
    .map((b, i) => normaliseBlock(b, i))
    .filter((b): b is NormalisedBlock => b !== null);

  // Flattened drawer items across every attachment on this message — prev/next
  // walks each individual record. Each chip opens the drawer at its first item.
  const drawer = useContextItemDrawer();
  const drawerItems: ContextDrawerItem[] = renderBlocks.flatMap((b, i) =>
    normalizeBlock(b, i, conversationId),
  );

  const openDrawerForBlock = (blockKey: string) => {
    const idx = drawerItems.findIndex((it) => it.id.startsWith(`${blockKey}:`));
    drawer.openAt(drawerItems, idx < 0 ? 0 : idx);
  };

  const trimmedText = content.trim();
  const hasContent = trimmedText || normalisedBlocks.length > 0;
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
    const attachmentSig = normalisedBlocks.map((b) => b.key).join("|");
    return `${variableSig}\u0000${contextSig}\u0000${attachmentSig}\u0000${trimmedText}`;
  }, [
    isFirstTurnMessage,
    userVariableValues,
    contextSnapshot,
    normalisedBlocks,
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
            {normalisedBlocks.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {normalisedBlocks.map((block) => (
                  <AttachmentChip
                    key={block.key}
                    block={block}
                    onOpen={openDrawerForBlock}
                  />
                ))}
              </div>
            )}

            {/* Text content */}
            {trimmedText && (
              <div className="text-xs text-foreground whitespace-pre-wrap break-words">
                {trimmedText}
              </div>
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

      <ContextItemDrawer controller={drawer} />
    </div>
  );
}
