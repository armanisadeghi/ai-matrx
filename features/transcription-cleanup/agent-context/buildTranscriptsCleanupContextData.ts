import { Save, Eraser, SpellCheck } from "lucide-react";
import type { ContextMenuExtraSection } from "@/features/context-menu-v2/extraSections";
import {
  createTranscriptsCleanupScope,
  type CleanupContextItemValue,
  type CleanupSlotSummary,
} from "@/features/surfaces/manifests/transcripts-cleanup.manifest";
import type { CleanupCustomSlot } from "@/features/transcript-studio/types";

/**
 * Shared agent-context contract for `matrx-user/transcripts-cleanup`.
 *
 * Mirrors `features/notes/agent-context/`: a PURE builder maps the live pad
 * state → the manifest's `createTranscriptsCleanupScope` helper (so the value
 * names can never drift from the declared surface values), plus the canonical
 * menu props the panes spread onto `UnifiedAgentContextMenu`. `CleanupPad`
 * reads its refs at trigger time and passes them in — keeping this file pure
 * means a demo and the live page would emit one identical shape.
 */

/** Shared menu props for every region of the cleanup pad. */
export const TRANSCRIPTS_CLEANUP_CONTEXT_MENU_PROPS = {
  sourceFeature: "transcription-cleanup" as const,
  surfaceName: "matrx-user/transcripts-cleanup" as const,
  isEditable: true as const,
  /** Plain-text panes — content-block insertion has no place here. */
  placementMode: { "content-block": "hide" } as const,
};

/** Which pane an action was triggered from (overlaid by `menuContextData`). */
export type CleanupPaneKind = "transcript" | "clean" | "custom";

/** A custom slot plus its live streamed/edited text and run phase. */
export interface CleanupSlotState {
  slot: CleanupCustomSlot;
  /** Current visible text for the slot (user edit / loaded / streamed). */
  text: string;
  /** Streaming phase of the slot's last run (clean_run_status vocabulary). */
  runStatus: string;
}

export interface BuildTranscriptsCleanupContextDataArgs {
  /** Raw transcript text as visible in the Transcript pane (baseline `content`). */
  rawTranscriptText: string;
  /** Cleaned transcript text as visible in the Clean pane. */
  cleanedTranscriptText: string;
  /** All custom slots in order, with their live text + run status. */
  slots: CleanupSlotState[];
  /** 0-based index of the visible custom slot. */
  activeSlotIndex: number;
  /** Active cleanup session id (studio_sessions row). */
  sessionId?: string | null;
  /** Active session title. */
  sessionTitle?: string | null;
  /** ISO timestamp the active session was started. */
  sessionStartedAt?: string | null;
  /** Mic is actively recording. */
  isRecording: boolean;
  /** A finished recording is being transcribed (post-record, pre-commit). */
  isTranscribing: boolean;
  /** Transcript pane is read-only (recording / transcribing). */
  isTranscriptLocked: boolean;
  /** In-flight mic transcription during an active recording. */
  liveTranscriptText?: string;
  /** Text queued (via "At start" while recording) to prepend on commit. */
  pendingInsertStart?: string;
  /** Text queued (via "At end" while recording) to append on commit. */
  pendingInsertEnd?: string;
  /** Agent assigned to the Clean container (always set). */
  cleanAgentId: string;
  /** Streaming phase of the Clean container's last run. */
  cleanRunStatus: string;
  /** Display names keyed by agent id (resolved labels). */
  agentNames: Record<string, string>;
  /** The session's structured context blocks (already filtered to non-empty). */
  contextItems: CleanupContextItemValue[];
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function slotLabel(
  slot: CleanupCustomSlot,
  index: number,
  agentNames: Record<string, string>,
): string {
  return (
    slot.label ||
    (slot.agentId ? agentNames[slot.agentId] : undefined) ||
    `slot-${index + 1}`
  );
}

/**
 * Canonical `contextData` for `matrx-user/transcripts-cleanup` — emits every
 * value declared in the manifest EXCEPT the selection family (`selection` /
 * `text_before` / `text_after`), which `UnifiedAgentContextMenu` captures from
 * the live DOM at trigger time. `content` defaults to the raw transcript;
 * `menuContextData` overlays it with the active pane's text per launch.
 */
export function buildTranscriptsCleanupContextData(
  args: BuildTranscriptsCleanupContextDataArgs,
): Record<string, unknown> {
  const {
    rawTranscriptText,
    cleanedTranscriptText,
    slots,
    activeSlotIndex,
    sessionId,
    sessionTitle,
    sessionStartedAt,
    isRecording,
    isTranscribing,
    isTranscriptLocked,
    liveTranscriptText,
    pendingInsertStart,
    pendingInsertEnd,
    cleanAgentId,
    cleanRunStatus,
    agentNames,
    contextItems,
  } = args;

  const idx = slots.length > 0 ? Math.min(activeSlotIndex, slots.length - 1) : 0;
  const active = slots[idx];
  const activeSlot = active?.slot;
  const activeText = active?.text ?? "";

  const allCustomOutputs: Record<string, string> = Object.fromEntries(
    slots.map((s, i) => [slotLabel(s.slot, i, agentNames), s.text]),
  );

  const customSlotsSummary: CleanupSlotSummary[] = slots.map((s, i) => ({
    label: slotLabel(s.slot, i, agentNames),
    agent_id: s.slot.agentId,
    agent_name: s.slot.agentId ? (agentNames[s.slot.agentId] ?? null) : null,
    source: s.slot.source,
    auto_run: s.slot.autoRun,
    run_status: s.runStatus,
    has_output: Boolean(s.text.trim()),
  }));

  const scope = createTranscriptsCleanupScope({
    content: rawTranscriptText,
    raw_transcript_text: rawTranscriptText,
    cleaned_transcript_text: cleanedTranscriptText || undefined,
    custom_output_text: activeText || undefined,
    all_custom_outputs: allCustomOutputs,

    session_id: sessionId ?? undefined,
    session_title: sessionTitle ?? undefined,
    session_started_at: sessionStartedAt ?? undefined,

    raw_word_count: wordCount(rawTranscriptText),
    raw_char_count: rawTranscriptText.length,
    cleaned_word_count: wordCount(cleanedTranscriptText),

    is_recording: isRecording,
    is_transcribing: isTranscribing,
    is_transcript_locked: isTranscriptLocked,
    live_transcript_text: liveTranscriptText || undefined,
    pending_insert_start: pendingInsertStart || undefined,
    pending_insert_end: pendingInsertEnd || undefined,

    clean_agent_id: cleanAgentId,
    clean_agent_name: agentNames[cleanAgentId],
    clean_run_status: cleanRunStatus,

    active_slot_index: idx,
    active_slot_agent_id: activeSlot?.agentId ?? undefined,
    active_slot_agent_name: activeSlot?.agentId
      ? agentNames[activeSlot.agentId]
      : undefined,
    active_slot_source: activeSlot?.source ?? "clean",
    active_slot_auto_run: activeSlot?.autoRun ?? false,
    active_slot_run_status: active?.runStatus ?? "idle",
    custom_slot_count: slots.length,
    custom_slots_summary: customSlotsSummary,

    context_items: contextItems,
    context_item_count: contextItems.length,
  });

  return scope as Record<string, unknown>;
}

/**
 * Overlay the base scope with the pane the action fired from. `content` is
 * narrowed to the pane's text so a name-matched agent's `content` variable
 * (and the menu's Compare actions) operate on what the user is looking at.
 * `context` is dropped — the menu types it as a string while our scope's named
 * values carry everything the mappings need.
 */
export function withActivePane(
  baseScope: Record<string, unknown>,
  pane: CleanupPaneKind,
  paneText: string,
): Record<string, unknown> {
  const { context: _omitted, ...scope } = baseScope;
  return {
    ...scope,
    content: paneText,
    active_pane: pane,
    active_pane_text: paneText,
  };
}

/**
 * Cleanup-specific, non-agent menu items injected via `extraSections`. The
 * core menu renders these; the pad wires the callbacks (per pane) so a
 * right-click offers the pad's own ops alongside the shared agent actions.
 */
export function createTranscriptsCleanupExtraSections(handlers: {
  onCleanUp?: () => void;
  onSaveAsNote?: () => void;
  onClearPane?: () => void;
}): ContextMenuExtraSection[] {
  const items: ContextMenuExtraSection["items"] = [];
  if (handlers.onCleanUp) {
    items.push({
      kind: "item",
      id: "cleanup-run",
      label: "Clean up transcript",
      icon: SpellCheck,
      onSelect: handlers.onCleanUp,
    });
  }
  if (handlers.onSaveAsNote) {
    items.push({
      kind: "item",
      id: "cleanup-save-note",
      label: "Save as note",
      icon: Save,
      onSelect: handlers.onSaveAsNote,
    });
  }
  if (handlers.onClearPane) {
    if (items.length > 0) items.push({ kind: "separator", id: "sep" });
    items.push({
      kind: "item",
      id: "cleanup-clear",
      label: "Clear this pane",
      icon: Eraser,
      destructive: true,
      onSelect: handlers.onClearPane,
    });
  }
  if (items.length === 0) return [];
  return [
    {
      id: "cleanup-ops",
      label: "Cleanup",
      anchor: "after-compare",
      items,
    },
  ];
}
