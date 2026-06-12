"use client";

/**
 * CleanupPad — the standalone Transcription Cleanup page, on the STUDIO data
 * model. Record → auto-clean → refine with ANY number of custom agents.
 *
 * Layout (desktop, 3 resizable panels):
 *   sidebar   — sessions (Mine|All scope + New), Clean agent dropdown,
 *               context items, Clean Up button
 *   main      — New session + central record pill in a tall band spanning the
 *               (transparent) shell-header zone; transcript over Clean (resizable)
 *   custom    — full-height right container with up to MAX_CUSTOM_SLOTS
 *               slots (tab pills, one visible at a time). Each slot: its own
 *               agent, input source (raw|clean), auto-run, and output doc.
 * Mobile: single scroll column with the sidebar in a drawer.
 *
 * Custom slots — outputs live in studio_documents (one row per slot docKind);
 * the slot list (agent/source/autorun per slot) persists in
 * studio_session_settings.custom_slots. Auto-run: source=raw slots fire
 * alongside Clean; source=clean slots fire when the cleaned result lands.
 *
 * Context menu — every pane is wrapped in UnifiedAgentContextMenu with
 * surfaceName "matrx-user/transcripts-cleanup", so internal + user shortcuts
 * work over selections (textarea selection is captured by the menu itself)
 * and surface value-mappings drive variable resolution.
 *
 * Invariant carried from the original tool: what is sent to the AI equals the
 * fully committed transcript at stop time. During recording the textarea is
 * read-only; optional prefix/suffix inserts are queued and merged in
 * `commitTranscript` immediately before Clean / persist — never mid-chunk.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AudioLines,
  ArrowDownToLine,
  ArrowUpToLine,
  BookOpen,
  ChevronDown,
  CircleStop,
  Loader2,
  PanelLeftOpen,
  Play,
  Plus,
  Stars,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectVoicePadEntries,
  selectVoicePadDraftText,
  addTranscriptEntry,
  clearAllEntries,
  setDraftText,
} from "@/lib/redux/slices/voicePadSlice";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { TranscriptsListHeader } from "@/features/transcripts/components/TranscriptsListHeader";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Switch } from "@/components/ui/switch";
import {
  MicrophoneIconButton,
  type MicrophoneIconButtonHandle,
} from "@/features/audio/components/MicrophoneIconButton";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import { FilesTapButton } from "@/components/icons/tap-buttons";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { UnifiedAgentContextMenu } from "@/features/context-menu-v2/UnifiedAgentContextMenu";
import { stripThinkingStreaming } from "@/features/notes/actions/quick-save/utils/stripThinking";
import { createTranscriptsCleanupScope } from "@/features/surfaces/manifests/transcripts-cleanup.manifest";
import type {
  CleanupCustomSlot,
  SessionContextItem,
} from "@/features/transcript-studio/types";
import { CleanupContextPanel } from "./CleanupContextPanel";
import {
  CleanupSessionList,
  CleanupSessionsToolbar,
} from "./CleanupSessionList";
import {
  TranscriptInsertDialog,
  type TranscriptInsertTarget,
} from "./TranscriptInsertDialog";
import {
  composeCommittedTranscript,
  composeTranscriptDisplay,
  composeTranscriptParts,
} from "../utils/transcriptCompose";
import { DEFAULT_CLEAN_AGENT_ID, SYSTEM_AGENT_NAMES } from "../ai-agents";
import {
  useAiPostProcess,
  type InputMappingInfo,
} from "../hooks/useAiPostProcess";
import {
  useCleanupSession,
  CLEANUP_DOC_KIND,
  makeSlotDocKind,
} from "../hooks/useCleanupSession";

const OVERLAY_ID = "transcriptionCleanupPage" as const;
const INSTANCE_ID = "main" as const;

const H_COOKIE = "panels:cleanup-h3";
const V_COOKIE = "panels:cleanup-v";

/** Fixed hook pool size — raise here when more parallel slots are needed. */
const MAX_CUSTOM_SLOTS = 3;

/** Side columns — top band aligns vertically with the center record band. */
const SIDE_COLUMN_TOP_BAND =
  "flex shrink-0 flex-col justify-center gap-2 border-b border-border bg-muted/30 px-3 py-3 min-h-[4.5rem]";

const RECORD_BAND =
  "flex shrink-0 items-center justify-center border-b border-border px-4 py-3 min-h-[4.5rem]";

function SidebarSectionLabel({
  icon: Icon,
  label,
  accent = "muted",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  accent?: "muted" | "primary";
}) {
  return (
    <div className="mb-1.5 mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <span
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-md",
          accent === "primary" ? "bg-primary/10" : "bg-muted",
        )}
      >
        <Icon
          className={cn(
            "h-3 w-3",
            accent === "primary" ? "text-primary" : "text-muted-foreground",
          )}
        />
      </span>
      {label}
    </div>
  );
}

function writeLayoutCookie(name: string, layout: Record<string, number>) {
  document.cookie =
    `${name}=${encodeURIComponent(JSON.stringify(layout))}` +
    `; path=/; max-age=31536000; SameSite=Lax`;
}

function mappingCaption(mapping: InputMappingInfo | null): string | null {
  if (!mapping) return null;
  if (mapping.mode === "user_input") return "input → user message";
  return `input → ${mapping.target}`;
}

/** Skeleton line widths — stable per row so the shimmer doesn't reflow. */
const VEIL_LINE_WIDTHS = ["92%", "78%", "85%", "64%", "88%", "71%"] as const;

/**
 * In-pane loading veil shown while a session's content is fetched. It covers
 * ONLY the data region of a pane (the headers / toolbars stay mounted), so the
 * page never loses its structure on a session switch — and it fully masks the
 * previous session's text so there's no stale flash before the new content
 * applies.
 */
function PaneLoadingVeil({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col gap-3 bg-background/85 px-4 py-3 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        {label}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 pt-1">
        {VEIL_LINE_WIDTHS.map((w, i) => (
          <div
            key={i}
            className="h-3 animate-pulse rounded bg-muted"
            style={{ width: w }}
          />
        ))}
      </div>
    </div>
  );
}

/** Stable initial slot (fixed id — SSR-safe; new slots mint uuids on click). */
function initialSlot(): CleanupCustomSlot {
  return {
    id: "slot-1",
    agentId: null,
    source: "clean",
    autoRun: false,
    docKind: CLEANUP_DOC_KIND,
  };
}

interface CleanupPadProps {
  defaultHLayout?: Record<string, number>;
  defaultVLayout?: Record<string, number>;
}

export default function CleanupPad({
  defaultHLayout,
  defaultVLayout,
}: CleanupPadProps) {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();
  const session = useCleanupSession();

  const entries = useAppSelector((s) =>
    selectVoicePadEntries(s, OVERLAY_ID, INSTANCE_ID),
  );
  const draftText = useAppSelector((s) =>
    selectVoicePadDraftText(s, OVERLAY_ID, INSTANCE_ID),
  );
  const [liveTranscript, setLiveTranscript] = useState("");
  const [pendingPrefix, setPendingPrefix] = useState("");
  const [pendingSuffix, setPendingSuffix] = useState("");
  const [insertDialogTarget, setInsertDialogTarget] =
    useState<TranscriptInsertTarget | null>(null);
  const [isMicRecording, setIsMicRecording] = useState(false);
  const [isMicTranscribing, setIsMicTranscribing] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /**
   * The session whose content is currently reflected in the panes. Set by the
   * load-reset effect once the DB snapshot has been applied to local state.
   * Drives the in-pane loading veil: while the active session differs from this
   * (or a fetch is in flight), each data pane shows its own loading state —
   * never the previous session's text.
   */
  const [appliedSessionId, setAppliedSessionId] = useState<string | null>(null);
  const micRef = useRef<MicrophoneIconButtonHandle>(null);

  // Agents — Clean defaults to the system cleaner.
  const [cleanAgentId, setCleanAgentId] = useState(DEFAULT_CLEAN_AGENT_ID);
  const [agentNames, setAgentNames] =
    useState<Record<string, string>>(SYSTEM_AGENT_NAMES);

  // Custom slots — one visible at a time, each with its own agent/source/autorun.
  const [slots, setSlots] = useState<CleanupCustomSlot[]>([initialSlot()]);
  const [activeSlotIdx, setActiveSlotIdx] = useState(0);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const activeSlot = slots[Math.min(activeSlotIdx, slots.length - 1)];

  // null = show the live stream / nothing; string = loaded-from-DB or user edit.
  const [editedResponse, setEditedResponse] = useState<string | null>(null);
  const [editedBySlot, setEditedBySlot] = useState<
    Record<string, string | null>
  >({});

  const cleanAi = useAiPostProcess();
  // Fixed pool — one streaming runtime per slot index (hooks can't be dynamic).
  const slotAi0 = useAiPostProcess();
  const slotAi1 = useAiPostProcess();
  const slotAi2 = useAiPostProcess();
  const slotAis = [slotAi0, slotAi1, slotAi2];

  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  // ── Latest-value refs (async flows must never read stale closures) ────────
  const cleanAgentIdRef = useRef(cleanAgentId);
  cleanAgentIdRef.current = cleanAgentId;
  const contextItemsRef = useRef<SessionContextItem[]>([]);
  const responseRef = useRef<string>("");
  const customRef = useRef<string>("");
  const transcriptDisplayRef = useRef<string>("");
  const pendingPrefixRef = useRef("");
  const pendingSuffixRef = useRef("");

  // Pane textarea refs — the context menu reads selection through these.
  const transcriptTaRef = useRef<HTMLTextAreaElement | null>(null);
  const cleanTaRef = useRef<HTMLTextAreaElement | null>(null);
  const customTaRef = useRef<HTMLTextAreaElement | null>(null);

  const allText = useMemo(
    () => entries.map((e) => e.text).join("\n\n"),
    [entries],
  );
  const baseText = draftText !== null ? draftText : allText;
  const isTranscriptLocked = isMicRecording || isMicTranscribing;
  const transcriptDisplay = composeTranscriptDisplay(
    baseText,
    liveTranscript,
    pendingPrefix,
    pendingSuffix,
  );
  transcriptDisplayRef.current = transcriptDisplay;

  useEffect(() => {
    pendingPrefixRef.current = pendingPrefix;
  }, [pendingPrefix]);
  useEffect(() => {
    pendingSuffixRef.current = pendingSuffix;
  }, [pendingSuffix]);

  // Invariant: the string sent to the AI equals the visible transcript.
  const baseTextRef = useRef(baseText);
  baseTextRef.current = baseText;

  const sessionRefs = useRef(session);
  sessionRefs.current = session;

  // ── Streaming → display values ─────────────────────────────────────────────
  const { visible: strippedClean, isThinking: cleanThinking } = useMemo(
    () => stripThinkingStreaming(cleanAi.accumulatedText),
    [cleanAi.accumulatedText],
  );
  const responseValue = editedResponse ?? strippedClean;
  responseRef.current = responseValue;

  /** Display value for a slot: user edit / loaded text, else its live stream. */
  const slotValue = (idx: number): string => {
    const slot = slots[idx];
    if (!slot) return "";
    const edited = editedBySlot[slot.id];
    if (edited !== null && edited !== undefined) return edited;
    return stripThinkingStreaming(slotAis[idx].accumulatedText).visible;
  };
  const activeSlotValue = activeSlot ? slotValue(activeSlotIdx) : "";
  customRef.current = activeSlotValue;
  const activeAi = slotAis[Math.min(activeSlotIdx, MAX_CUSTOM_SLOTS - 1)];

  // ── Surface scope (live values for agent variable/slot mapping) ────────────
  // Volatile render state mirrored into a ref so the scope builder (called at
  // trigger time from stable callbacks) never reads stale closures.
  const scopeRenderState = {
    isMicRecording,
    isMicTranscribing,
    liveTranscript,
    agentNames,
    activeSlotIdx,
    cleanPhase: cleanAi.phase,
    slotPhases: slotAis.map((ai) => ai.phase),
    slotTexts: slots.map((_, idx) => slotValue(idx)),
  };
  const scopeStateRef = useRef(scopeRenderState);
  scopeStateRef.current = scopeRenderState;

  /** Emits every value declared in `transcriptsCleanupManifest` except the
   * selection family (`selection` / `text_before` / `text_after`), which
   * `UnifiedAgentContextMenu` captures itself at trigger time. */
  const buildScope = useCallback(() => {
    const s = scopeStateRef.current;
    const slotList = slotsRef.current;
    const raw = baseTextRef.current;
    const cleaned = responseRef.current;
    const idx = Math.min(s.activeSlotIdx, slotList.length - 1);
    const slot = slotList[idx];
    const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
    const slotLabel = (sl: CleanupCustomSlot, i: number) =>
      sl.label ||
      (sl.agentId ? s.agentNames[sl.agentId] : undefined) ||
      `slot-${i + 1}`;
    const activeContextItems = contextItemsRef.current
      .filter((i) => i.value.trim())
      .map((i) => ({ key: i.key, label: i.label, value: i.value }));

    return createTranscriptsCleanupScope({
      content: raw,
      raw_transcript_text: raw,
      cleaned_transcript_text: cleaned || undefined,
      custom_output_text: customRef.current || undefined,
      all_custom_outputs: Object.fromEntries(
        slotList.map((sl, i) => [slotLabel(sl, i), s.slotTexts[i] ?? ""]),
      ),
      session_id: sessionRefs.current.activeSessionId ?? undefined,
      session_title: sessionRefs.current.activeSession?.title,
      session_started_at: sessionRefs.current.activeSession?.startedAt,
      raw_word_count: words(raw),
      raw_char_count: raw.length,
      cleaned_word_count: words(cleaned),
      is_recording: s.isMicRecording,
      is_transcribing: s.isMicTranscribing,
      is_transcript_locked: s.isMicRecording || s.isMicTranscribing,
      live_transcript_text: s.liveTranscript || undefined,
      pending_insert_start: pendingPrefixRef.current || undefined,
      pending_insert_end: pendingSuffixRef.current || undefined,
      clean_agent_id: cleanAgentIdRef.current,
      clean_agent_name: s.agentNames[cleanAgentIdRef.current],
      clean_run_status: s.cleanPhase,
      active_slot_index: idx,
      active_slot_agent_id: slot?.agentId ?? undefined,
      active_slot_agent_name: slot?.agentId
        ? s.agentNames[slot.agentId]
        : undefined,
      active_slot_source: slot?.source ?? "clean",
      active_slot_auto_run: slot?.autoRun ?? false,
      active_slot_run_status: s.slotPhases[idx] ?? "idle",
      custom_slot_count: slotList.length,
      custom_slots_summary: slotList.map((sl, i) => ({
        label: slotLabel(sl, i),
        agent_id: sl.agentId,
        agent_name: sl.agentId ? (s.agentNames[sl.agentId] ?? null) : null,
        source: sl.source,
        auto_run: sl.autoRun,
        run_status: s.slotPhases[i] ?? "idle",
        has_output: Boolean(s.slotTexts[i]?.trim()),
      })),
      context_items: activeContextItems,
      context_item_count: activeContextItems.length,
    });
  }, []);

  /** contextData for the context menu — pane-specific content over the scope.
   * (`context` is omitted: the menu types it as a string; our scope's named
   * values carry everything the mappings need.) */
  const menuContextData = useCallback(
    (pane: "transcript" | "clean" | "custom", paneText: string) => {
      const { context: _omitted, ...scope } = buildScope();
      return {
        ...scope,
        content: paneText,
        active_pane: pane,
        active_pane_text: paneText,
      };
    },
    [buildScope],
  );

  // ── Session content loading: reset local state from the DB snapshot ───────
  useEffect(() => {
    const loaded = session.loaded;
    if (!loaded) return;
    dispatch(
      clearAllEntries({ overlayId: OVERLAY_ID, instanceId: INSTANCE_ID }),
    );
    dispatch(
      setDraftText({
        overlayId: OVERLAY_ID,
        instanceId: INSTANCE_ID,
        text: loaded.rawText,
      }),
    );
    setEditedResponse(loaded.cleanText || null);

    // Guard: ids that didn't resolve to a real agent name (studio shortcut
    // ids on foreign sessions) aren't runnable here — fall back, loudly.
    const validClean =
      loaded.cleanAgentId &&
      (loaded.agentNames[loaded.cleanAgentId] ||
        SYSTEM_AGENT_NAMES[loaded.cleanAgentId]);
    if (loaded.cleanAgentId && !validClean) {
      console.warn(
        `[cleanup] persisted clean agent ${loaded.cleanAgentId} did not resolve to an agent (studio shortcut id?) — using default`,
      );
    }
    setCleanAgentId(validClean ? loaded.cleanAgentId! : DEFAULT_CLEAN_AGENT_ID);

    const loadedSlots = (
      loaded.customSlots.length > 0 ? loaded.customSlots : [initialSlot()]
    )
      .slice(0, MAX_CUSTOM_SLOTS)
      .map((slot) => {
        if (slot.agentId && !loaded.agentNames[slot.agentId]) {
          console.warn(
            `[cleanup] persisted slot agent ${slot.agentId} did not resolve to an agent — clearing`,
          );
          return { ...slot, agentId: null };
        }
        return slot;
      });
    setSlots(loadedSlots);
    setActiveSlotIdx(0);
    const edited: Record<string, string | null> = {};
    for (const slot of loadedSlots) {
      edited[slot.id] = loaded.customTexts[slot.docKind] || null;
    }
    setEditedBySlot(edited);

    contextItemsRef.current = loaded.contextItems;
    setAgentNames((prev) => ({ ...prev, ...loaded.agentNames }));
    setLiveTranscript("");
    cleanAi.reset();
    for (const ai of slotAis) ai.reset();
    // Content is now reflected in the panes — lift the per-pane loading veil.
    setAppliedSessionId(loaded.sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.loaded, dispatch]);

  const clearLocalContent = useCallback(() => {
    dispatch(
      clearAllEntries({ overlayId: OVERLAY_ID, instanceId: INSTANCE_ID }),
    );
    dispatch(
      setDraftText({
        overlayId: OVERLAY_ID,
        instanceId: INSTANCE_ID,
        text: "",
      }),
    );
    setEditedResponse(null);
    setEditedBySlot({});
    setLiveTranscript("");
    setPendingPrefix("");
    setPendingSuffix("");
    pendingPrefixRef.current = "";
    pendingSuffixRef.current = "";
    cleanAi.reset();
    for (const ai of slotAis) ai.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, cleanAi]);

  /**
   * Per-pane loading: true while a persisted session is being switched in —
   * either the fetch is in flight (`loadState === "loading"`), or it has just
   * resolved but the load-reset effect hasn't applied the snapshot to the panes
   * yet (`appliedSessionId` still lags `session.loaded`). The second clause
   * closes the one-frame gap that would otherwise flash the previous session's
   * text. Locally-created sessions never populate `session.loaded`, so they
   * never veil.
   */
  const isLoadingSession =
    session.loadState === "loading" ||
    (session.loaded !== null && session.loaded.sessionId !== appliedSessionId);

  // ── Agent name resolution for dropdown labels ──────────────────────────────
  const resolveAgentName = useCallback(
    async (id: string) => {
      if (agentNames[id]) return;
      const names = await session.fetchAgentNames([id]);
      if (names[id]) setAgentNames((prev) => ({ ...prev, ...names }));
    },
    [agentNames, session],
  );

  // ── Slot mutations (persisted via custom_slots) ────────────────────────────
  const updateSlots = useCallback(
    (next: CleanupCustomSlot[]) => {
      setSlots(next);
      slotsRef.current = next;
      session.persistSettings({ customSlots: next });
    },
    [session],
  );

  const patchSlot = useCallback(
    (slotId: string, patch: Partial<CleanupCustomSlot>) => {
      updateSlots(
        slotsRef.current.map((s) => (s.id === slotId ? { ...s, ...patch } : s)),
      );
    },
    [updateSlots],
  );

  const addSlot = useCallback(() => {
    if (slotsRef.current.length >= MAX_CUSTOM_SLOTS) return;
    const id = crypto.randomUUID();
    const slot: CleanupCustomSlot = {
      id,
      agentId: null,
      source: "clean",
      autoRun: false,
      docKind: makeSlotDocKind(id, false),
    };
    updateSlots([...slotsRef.current, slot]);
    setActiveSlotIdx(slotsRef.current.length - 1);
  }, [updateSlots]);

  const removeSlot = useCallback(
    (slotId: string) => {
      if (slotsRef.current.length <= 1) return;
      const next = slotsRef.current.filter((s) => s.id !== slotId);
      updateSlots(next);
      setActiveSlotIdx((idx) => Math.min(idx, next.length - 1));
    },
    [updateSlots],
  );

  // ── Run: Clean ─────────────────────────────────────────────────────────────
  const runClean = useCallback(
    (text: string) => {
      setEditedResponse(null);
      void session.maybeAutoLabelFromTranscript(text);
      void cleanAi.process({
        agentId: cleanAgentIdRef.current,
        text,
        contextItems: contextItemsRef.current,
        scope: buildScope(),
      });
    },
    [cleanAi, buildScope, session.maybeAutoLabelFromTranscript],
  );

  // ── Run: Custom slots ──────────────────────────────────────────────────────
  const runSlot = useCallback(
    (idx: number, input: string, opts?: { silent?: boolean }) => {
      const slot = slotsRef.current[idx];
      if (!slot?.agentId) {
        if (!opts?.silent) toast.info("Choose an agent for this slot first");
        return;
      }
      if (!input.trim()) {
        if (!opts?.silent)
          toast.info("Nothing to process yet — record or type a transcript");
        return;
      }
      setEditedBySlot((prev) => ({ ...prev, [slot.id]: null }));
      void slotAis[idx].process({
        agentId: slot.agentId,
        text: input,
        contextItems: contextItemsRef.current,
        scope: buildScope(),
      });
    },
    // slotAis identities are stable per render position
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildScope],
  );

  const runActiveSlot = useCallback(() => {
    const slot = slotsRef.current[activeSlotIdx];
    if (!slot) return;
    const input =
      slot.source === "clean" && responseRef.current.trim()
        ? responseRef.current
        : baseTextRef.current;
    runSlot(activeSlotIdx, input);
  }, [activeSlotIdx, runSlot]);

  /** Autorun, raw path — every autoRun slot with source=raw fires with Clean. */
  const autoRunRawSlots = useCallback(
    (rawText: string) => {
      slotsRef.current.forEach((slot, idx) => {
        if (slot.autoRun && slot.source === "raw" && slot.agentId) {
          runSlot(idx, rawText, { silent: true });
        }
      });
    },
    [runSlot],
  );

  // Persist the cleaned output exactly once per completed conversation, and
  // fire autorun slots that wait on the cleaned result.
  const persistedCleanCidRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      cleanAi.phase === "complete" &&
      cleanAi.conversationId &&
      persistedCleanCidRef.current !== cleanAi.conversationId
    ) {
      persistedCleanCidRef.current = cleanAi.conversationId;
      const text = stripThinkingStreaming(cleanAi.accumulatedText).visible;
      void sessionRefs.current.persistCleanRun(
        text,
        cleanAgentIdRef.current,
        cleanAi.conversationId,
      );
      if (text.trim()) {
        slotsRef.current.forEach((slot, idx) => {
          if (slot.autoRun && slot.source === "clean" && slot.agentId) {
            runSlot(idx, text, { silent: true });
          }
        });
      }
    }
  }, [cleanAi.phase, cleanAi.conversationId, cleanAi.accumulatedText, runSlot]);

  // Persist each slot's output exactly once per completed conversation.
  const persistedSlotCidsRef = useRef<Record<string, string>>({});
  useEffect(() => {
    slotAis.forEach((ai, idx) => {
      const slot = slotsRef.current[idx];
      if (
        slot?.agentId &&
        ai.phase === "complete" &&
        ai.conversationId &&
        persistedSlotCidsRef.current[slot.id] !== ai.conversationId
      ) {
        persistedSlotCidsRef.current[slot.id] = ai.conversationId;
        const text = stripThinkingStreaming(ai.accumulatedText).visible;
        void sessionRefs.current.persistCustomRun(
          text,
          slot.agentId,
          ai.conversationId,
          slot.docKind,
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    slotAi0.phase,
    slotAi0.conversationId,
    slotAi0.accumulatedText,
    slotAi1.phase,
    slotAi1.conversationId,
    slotAi1.accumulatedText,
    slotAi2.phase,
    slotAi2.conversationId,
    slotAi2.accumulatedText,
  ]);

  // ── Mic ────────────────────────────────────────────────────────────────────
  const clearPendingInserts = useCallback(() => {
    setPendingPrefix("");
    setPendingSuffix("");
    pendingPrefixRef.current = "";
    pendingSuffixRef.current = "";
  }, []);

  const commitTranscript = useCallback(
    (text: string) => {
      setLiveTranscript("");
      const trimmed = text.trim();
      const prefix = pendingPrefixRef.current;
      const suffix = pendingSuffixRef.current;
      const combined = composeCommittedTranscript(
        baseTextRef.current,
        trimmed,
        prefix,
        suffix,
      );

      clearPendingInserts();
      if (!combined) return null;

      if (trimmed) {
        dispatch(
          addTranscriptEntry({
            overlayId: OVERLAY_ID,
            instanceId: INSTANCE_ID,
            text: trimmed,
          }),
        );
      }
      dispatch(
        setDraftText({
          overlayId: OVERLAY_ID,
          instanceId: INSTANCE_ID,
          text: combined,
        }),
      );
      baseTextRef.current = combined;

      if (trimmed) {
        void sessionRefs.current.persistRawAppend(trimmed);
      }
      if (prefix.trim() || suffix.trim() || !trimmed) {
        void sessionRefs.current.persistRawReplace(combined);
      }

      return combined;
    },
    [clearPendingInserts, dispatch],
  );

  const handleTranscriptionComplete = useCallback(
    (text: string) => {
      const combined = commitTranscript(text);
      if (!combined) return;
      runClean(combined);
      autoRunRawSlots(combined);
    },
    [commitTranscript, runClean, autoRunRawSlots],
  );

  /** Stop recording and persist raw transcript only — no Clean / autorun / label. */
  const handleTranscriptOnlyComplete = useCallback(
    (text: string) => {
      commitTranscript(text);
    },
    [commitTranscript],
  );

  const handleLiveTranscript = useCallback((text: string) => {
    setLiveTranscript(text);
  }, []);

  const handleRecordingStateChange = useCallback(
    ({
      isRecording,
      isTranscribing,
    }: {
      isRecording: boolean;
      isTranscribing: boolean;
    }) => {
      setIsMicRecording(isRecording);
      setIsMicTranscribing(isTranscribing);
    },
    [],
  );

  const queueTranscriptInsert = useCallback(
    (position: TranscriptInsertTarget, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (isMicRecording || isMicTranscribing) {
        if (position === "start") {
          setPendingPrefix((prev) => composeTranscriptParts(prev, trimmed));
        } else {
          setPendingSuffix((prev) => composeTranscriptParts(prev, trimmed));
        }
        toast.success(
          position === "start"
            ? "Text queued at the start"
            : "Text queued at the end",
        );
        return;
      }

      const current = baseTextRef.current.trim();
      const next =
        position === "start"
          ? composeTranscriptParts(trimmed, current)
          : composeTranscriptParts(current, trimmed);
      dispatch(
        setDraftText({
          overlayId: OVERLAY_ID,
          instanceId: INSTANCE_ID,
          text: next,
        }),
      );
      baseTextRef.current = next;
      session.persistRawReplace(next);
    },
    [dispatch, isMicRecording, isMicTranscribing, session],
  );

  const handleInsertDialogConfirm = useCallback(
    (text: string) => {
      if (!insertDialogTarget) return;
      queueTranscriptInsert(insertDialogTarget, text);
      setInsertDialogTarget(null);
    },
    [insertDialogTarget, queueTranscriptInsert],
  );

  const handleSoftStop = useCallback(() => {
    micRef.current?.stopForTranscriptOnly();
  }, []);

  // ── Edits ──────────────────────────────────────────────────────────────────
  const handleDraftChange = useCallback(
    (value: string) => {
      if (isTranscriptLocked) return;
      dispatch(
        setDraftText({
          overlayId: OVERLAY_ID,
          instanceId: INSTANCE_ID,
          text: value,
        }),
      );
      session.persistRawReplace(value);
    },
    [dispatch, isTranscriptLocked, session],
  );

  const handleResponseChange = useCallback(
    (value: string) => {
      setEditedResponse(value);
      session.persistCleanEdit(value, cleanAgentIdRef.current);
    },
    [session],
  );

  const handleCustomChange = useCallback(
    (value: string) => {
      const slot = slotsRef.current[activeSlotIdx];
      if (!slot) return;
      setEditedBySlot((prev) => ({ ...prev, [slot.id]: value }));
      session.persistCustomEdit(value, slot.docKind);
    },
    [activeSlotIdx, session],
  );

  const handleClearAll = useCallback(() => {
    clearLocalContent();
    void session.persistRawClear();
  }, [clearLocalContent, session]);

  const handleContextChange = useCallback(
    (items: SessionContextItem[]) => {
      contextItemsRef.current = items;
      session.persistSettings({ contextItems: items });
    },
    [session],
  );

  // ── Agent selections ───────────────────────────────────────────────────────
  const handleCleanAgentSelect = useCallback(
    (agentId: string) => {
      setCleanAgentId(agentId);
      void resolveAgentName(agentId);
      session.persistSettings({ cleanAgentId: agentId });
    },
    [resolveAgentName, session],
  );

  const handleSlotAgentSelect = useCallback(
    (agentId: string) => {
      const slot = slotsRef.current[activeSlotIdx];
      if (!slot) return;
      void resolveAgentName(agentId);
      patchSlot(slot.id, { agentId });
    },
    [activeSlotIdx, patchSlot, resolveAgentName],
  );

  // ── Manual Clean Up ────────────────────────────────────────────────────────
  const handleProcess = useCallback(() => {
    if (isTranscriptLocked) {
      toast.info("Finish recording before running Clean");
      return;
    }
    const transcript = baseTextRef.current.trim();
    if (!transcript) {
      toast.info("Add a transcript before analyzing");
      return;
    }
    runClean(transcript);
    // Autorun (source = raw): Clean and these slots run simultaneously.
    autoRunRawSlots(transcript);
    setDrawerOpen(false);
  }, [isTranscriptLocked, runClean, autoRunRawSlots]);

  const handleCopyJoined = useCallback(async () => {
    const transcript = transcriptDisplayRef.current.trim();
    const response = responseRef.current.trim();
    if (!transcript && !response) {
      toast.info("Nothing to copy yet");
      return;
    }
    const parts: string[] = [];
    if (transcript) parts.push(transcript);
    if (response) parts.push(response);
    try {
      await navigator.clipboard.writeText(parts.join("\n\n---\n\n"));
      toast.success("Both copied to clipboard");
    } catch {
      toast.error("Copy failed — try selecting the text and copying manually");
    }
  }, []);

  // ── Session switching ──────────────────────────────────────────────────────
  const handleSelectSession = useCallback(
    (id: string) => {
      if (id === session.activeSessionId) return;
      session.selectSession(id);
      setDrawerOpen(false);
    },
    [session],
  );

  const handleNewSession = useCallback(async () => {
    if (isCreatingSession) return;
    setIsCreatingSession(true);
    try {
      clearLocalContent();
      contextItemsRef.current = [];
      setSlots([initialSlot()]);
      setActiveSlotIdx(0);
      await session.createNew();
      setDrawerOpen(false);
    } finally {
      setIsCreatingSession(false);
    }
  }, [clearLocalContent, isCreatingSession, session]);

  // ── Textarea replace/insert handlers for the context menu ─────────────────
  const makeTextHandlers = useCallback(
    (
      taRef: React.RefObject<HTMLTextAreaElement | null>,
      getValue: () => string,
      setValue: (v: string) => void,
    ) => ({
      onTextReplace: (newText: string) => {
        const ta = taRef.current;
        if (!ta) return;
        const value = getValue();
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        setValue(value.substring(0, start) + newText + value.substring(end));
        setTimeout(() => {
          ta.focus();
          ta.setSelectionRange(start, start + newText.length);
        }, 0);
      },
      onTextInsertBefore: (text: string) => {
        const ta = taRef.current;
        if (!ta) return;
        const value = getValue();
        const start = ta.selectionStart;
        const insert = text + "\n\n";
        setValue(value.substring(0, start) + insert + value.substring(start));
        setTimeout(() => {
          ta.focus();
          ta.setSelectionRange(start + insert.length, start + insert.length);
        }, 0);
      },
      onTextInsertAfter: (text: string) => {
        const ta = taRef.current;
        if (!ta) return;
        const value = getValue();
        const end = ta.selectionEnd;
        const insert = "\n\n" + text;
        setValue(value.substring(0, end) + insert + value.substring(end));
        setTimeout(() => {
          ta.focus();
          ta.setSelectionRange(end + insert.length, end + insert.length);
        }, 0);
      },
    }),
    [],
  );

  // ── Status helpers ─────────────────────────────────────────────────────────
  const cleanBusyEarly =
    cleanAi.phase === "launching" ||
    cleanAi.phase === "pending" ||
    cleanAi.phase === "connecting";
  const responsePlaceholder =
    cleanAi.phase === "idle"
      ? "Your cleaned transcript will appear here after recording..."
      : (cleanBusyEarly || cleanThinking) && responseValue.length === 0
        ? "Analyzing your transcript..."
        : cleanAi.phase === "error"
          ? (cleanAi.error ?? "Something went wrong. Please try again.")
          : "Preparing your response...";

  const activeThinking = useMemo(
    () => stripThinkingStreaming(activeAi.accumulatedText).isThinking,
    [activeAi.accumulatedText],
  );
  const activeBusyEarly =
    activeAi.phase === "launching" ||
    activeAi.phase === "pending" ||
    activeAi.phase === "connecting";
  const customPlaceholder =
    activeAi.phase === "idle"
      ? activeSlot?.agentId
        ? "Run your agent to fill this slot — or just type here..."
        : "Pick any agent above, then run it over the transcript or the cleaned text..."
      : (activeBusyEarly || activeThinking) && activeSlotValue.length === 0
        ? "Processing..."
        : activeAi.phase === "error"
          ? (activeAi.error ?? "Something went wrong. Please try again.")
          : "Preparing your response...";

  const isRecordingActive = isMicRecording || Boolean(liveTranscript);

  const recordStatus =
    liveTranscript || isMicRecording
      ? "Listening…"
      : cleanAi.isBusy
        ? "Processing…"
        : "Tap to record";

  const micId = `transcription-cleanup-page-mic-${INSTANCE_ID}`;
  const recordPillRef = useRef<HTMLDivElement>(null);

  const handleRecordPillClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest("button")) return;
      recordPillRef.current?.querySelector("button")?.click();
    },
    [],
  );

  const handleRecordPillKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      recordPillRef.current?.querySelector("button")?.click();
    },
    [],
  );

  // ── Shared UI fragments ────────────────────────────────────────────────────
  /** Mid-size pill — shared by New session and Save only (record pill stays larger). */
  const secondaryPillClass =
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3.5 shadow-sm text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const recordPill = (
    <div
      ref={recordPillRef}
      role="button"
      tabIndex={0}
      aria-label={recordStatus}
      onClick={handleRecordPillClick}
      onKeyDown={handleRecordPillKeyDown}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-full border bg-card py-1 pl-1 pr-4 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isRecordingActive
          ? "border-red-500/40 ring-2 ring-red-500/15"
          : "border-border ring-1 ring-primary/10 hover:ring-primary/25 hover:shadow-md",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full p-1 transition-colors",
          isRecordingActive
            ? "bg-red-500/15 text-red-500"
            : "bg-primary/10 text-primary",
        )}
      >
        <MicrophoneIconButton
          ref={micRef}
          id={micId}
          onTranscriptionComplete={handleTranscriptionComplete}
          onTranscriptOnlyComplete={handleTranscriptOnlyComplete}
          onLiveTranscript={handleLiveTranscript}
          onRecordingStateChange={handleRecordingStateChange}
          variant="icon-only"
          size="lg"
        />
      </span>
      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {isRecordingActive && (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        )}
        {recordStatus}
      </span>
    </div>
  );

  const softStopButton = (
    <button
      type="button"
      onClick={handleSoftStop}
      disabled={!isMicRecording}
      title={
        isMicRecording
          ? "Stop and save transcript without cleaning"
          : "Available while recording"
      }
      aria-label="Stop and save transcript without cleaning"
      className={cn(
        secondaryPillClass,
        isMicRecording
          ? "border-border/80 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
          : "cursor-not-allowed border-border/50 bg-muted/20 text-muted-foreground/45",
      )}
    >
      <CircleStop className="h-3.5 w-3.5 shrink-0" />
      <span>Save only</span>
    </button>
  );

  const newSessionButton = (
    <button
      type="button"
      onClick={() => void handleNewSession()}
      disabled={isCreatingSession}
      title="Start a fresh session — nothing is deleted"
      aria-label="Start a new session"
      className={cn(
        secondaryPillClass,
        "border-primary/30 text-foreground ring-1 ring-primary/15 hover:ring-primary/30 hover:shadow-md",
        isCreatingSession && "cursor-not-allowed opacity-60",
      )}
    >
      {isCreatingSession ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
      ) : (
        <Plus className="h-3.5 w-3.5 shrink-0 text-primary" />
      )}
      <span>New session</span>
    </button>
  );

  const recordArea = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {newSessionButton}
      {recordPill}
      {softStopButton}
    </div>
  );

  const recordBand = <div className={RECORD_BAND}>{recordArea}</div>;

  const mobileDrawerToggle = isMobile ? (
    <button
      type="button"
      onClick={() => setDrawerOpen(true)}
      aria-label="Open options"
      className="absolute left-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <PanelLeftOpen className="h-4 w-4" />
    </button>
  ) : null;

  const recordControl = (
    <div className="relative flex shrink-0 items-center justify-center border-b border-border px-4 py-4">
      {mobileDrawerToggle}
      {recordArea}
    </div>
  );

  const sidebarBody = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className={SIDE_COLUMN_TOP_BAND}>
        <CleanupSessionsToolbar
          scope={session.scope}
          onScopeChange={session.setScope}
          onCreate={() => void handleNewSession()}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-2 pb-3">
        <CleanupSessionList
          sessions={session.sessions}
          fetchStatus={session.fetchStatus}
          activeSessionId={session.activeSessionId}
          scope={session.scope}
          onScopeChange={session.setScope}
          onSelect={handleSelectSession}
          onCreate={() => void handleNewSession()}
          onDelete={(id) => void session.deleteSession(id)}
          showToolbar={false}
        />

        <SidebarSectionLabel
          icon={Stars}
          label="Cleaning Agent"
          accent="primary"
        />
        <AgentListDropdown
          onSelect={handleCleanAgentSelect}
          label={agentNames[cleanAgentId] ?? "Choose an agent…"}
          className="w-full"
        />
        {cleanAi.mapping && (
          <div className="mt-1 text-[10px] text-muted-foreground/70">
            {mappingCaption(cleanAi.mapping)}
          </div>
        )}

        <SidebarSectionLabel icon={BookOpen} label="Context" />
        <CleanupContextPanel
          key={session.loaded?.sessionId ?? "draft"}
          initialItems={session.loaded?.contextItems ?? null}
          onChange={handleContextChange}
        />
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <button
          type="button"
          onClick={handleProcess}
          disabled={cleanAi.isBusy}
          className={cn(
            "inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
            cleanAi.isBusy
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
          )}
        >
          {cleanAi.isBusy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Analyzing...
            </>
          ) : (
            <>
              <Stars className="h-4 w-4" /> Clean Up
            </>
          )}
        </button>
      </div>
    </div>
  );

  const transcriptHandlers = makeTextHandlers(
    transcriptTaRef,
    () => transcriptDisplayRef.current,
    handleDraftChange,
  );
  const transcriptPane = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted">
            <AudioLines className="h-3 w-3 text-muted-foreground" />
          </span>
          Transcript
          {isTranscriptLocked && (pendingPrefix || pendingSuffix) ? (
            <span className="rounded-full bg-primary/10 px-1.5 py-px font-normal normal-case text-primary">
              Queued
            </span>
          ) : null}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {isTranscriptLocked ? (
            <>
              <button
                type="button"
                onClick={() => setInsertDialogTarget("start")}
                title="Queue text at the start of the transcript"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ArrowUpToLine className="h-3 w-3" />
                <span className="hidden sm:inline">At start</span>
              </button>
              <button
                type="button"
                onClick={() => setInsertDialogTarget("end")}
                title="Queue text at the end of the transcript"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ArrowDownToLine className="h-3 w-3" />
                <span className="hidden sm:inline">At end</span>
              </button>
            </>
          ) : null}
          {(transcriptDisplay.trim().length > 0 || entries.length > 0) && (
            <ContentActionBar
              content={transcriptDisplay}
              title="Voice Pad Transcript"
              instanceKey={`transcription-cleanup-page-transcript-${INSTANCE_ID}`}
              hideSpeaker
              hidePencil
              onDelete={handleClearAll}
              deleteAriaLabel="Clear transcript"
            />
          )}
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <UnifiedAgentContextMenu
          sourceFeature="transcription-cleanup"
          surfaceName="matrx-user/transcripts-cleanup"
          getTextarea={() => transcriptTaRef.current}
          isEditable={!isTranscriptLocked}
          contextData={menuContextData("transcript", transcriptDisplay)}
          placementMode={{ "content-block": "hide" }}
          className="flex min-h-0 flex-1 flex-col"
          {...transcriptHandlers}
        >
          <textarea
            ref={transcriptTaRef}
            value={transcriptDisplay}
            readOnly={isTranscriptLocked}
            onChange={(e) => handleDraftChange(e.target.value)}
            placeholder={
              isTranscriptLocked
                ? "Live transcript streams here while recording. Use At start / At end to queue extra text."
                : "Tap the mic above to record. Transcribed text appears here and is processed automatically..."
            }
            className={cn(
              "h-full w-full flex-1 resize-none border-0 bg-background px-4 py-3 leading-relaxed",
              "text-base md:text-sm",
              "focus:outline-none focus:ring-0",
              isTranscriptLocked && "cursor-default",
            )}
          />
        </UnifiedAgentContextMenu>
        {isLoadingSession && <PaneLoadingVeil label="Loading transcript…" />}
      </div>
    </div>
  );

  const cleanHandlers = makeTextHandlers(
    cleanTaRef,
    () => responseRef.current,
    handleResponseChange,
  );
  const cleanPane = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-primary/10">
            <Stars className="h-3 w-3 text-primary" />
          </span>
          Clean
          {cleanThinking && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-px font-normal normal-case text-primary">
              Thinking
              <span className="inline-flex gap-0.5">
                <span className="h-1 w-1 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.3s]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.15s]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-primary/70" />
              </span>
            </span>
          )}
          {cleanAi.phase === "complete" && responseValue.trim() && (
            <span className="rounded-full bg-green-500/10 px-1.5 py-px font-normal normal-case text-green-600 dark:text-green-400">
              Ready
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <Loader2
            className={cn(
              "h-4 w-4 text-muted-foreground",
              cleanBusyEarly || cleanThinking ? "animate-spin" : "invisible",
            )}
          />
          {responseValue.trim().length > 0 && (
            <ContentActionBar
              content={responseValue}
              title={`AI-cleaned: ${agentNames[cleanAgentId] ?? "agent"}`}
              metadata={{
                agent_id: cleanAgentId,
                source: "transcription-cleanup-page",
              }}
              instanceKey={`transcription-cleanup-page-response-${INSTANCE_ID}`}
              hideSpeaker
              hidePencil
              extras={
                <FilesTapButton
                  variant="group"
                  onClick={handleCopyJoined}
                  ariaLabel="Copy transcript + cleaned text"
                  className="text-muted-foreground"
                />
              }
            />
          )}
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <UnifiedAgentContextMenu
          sourceFeature="transcription-cleanup"
          surfaceName="matrx-user/transcripts-cleanup"
          getTextarea={() => cleanTaRef.current}
          isEditable
          contextData={menuContextData("clean", responseValue)}
          placementMode={{ "content-block": "hide" }}
          className="flex min-h-0 flex-1 flex-col"
          {...cleanHandlers}
        >
          <textarea
            ref={cleanTaRef}
            value={responseValue}
            onChange={(e) => handleResponseChange(e.target.value)}
            placeholder={responsePlaceholder}
            className={cn(
              "h-full w-full flex-1 resize-none border-0 bg-background px-4 py-3 leading-relaxed",
              "text-base md:text-sm",
              "focus:outline-none focus:ring-0",
              cleanAi.phase === "error" && "text-destructive",
            )}
          />
        </UnifiedAgentContextMenu>
        {isLoadingSession && <PaneLoadingVeil label="Loading cleaned text…" />}
      </div>
    </div>
  );

  const customHandlers = makeTextHandlers(
    customTaRef,
    () => customRef.current,
    handleCustomChange,
  );
  const customTopBand = (
    <div className={SIDE_COLUMN_TOP_BAND}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Wand2 className="h-3 w-3 text-primary" />
          </span>
          Custom
          {activeThinking && (
            <span className="rounded-full bg-primary/10 px-1.5 py-px font-normal normal-case text-primary">
              Thinking
            </span>
          )}
          {activeAi.phase === "complete" && activeSlotValue.trim() && (
            <span className="rounded-full bg-green-500/10 px-1.5 py-px font-normal normal-case text-green-600 dark:text-green-400">
              Ready
            </span>
          )}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <Loader2
            className={cn(
              "h-4 w-4 text-muted-foreground",
              activeBusyEarly || activeThinking ? "animate-spin" : "invisible",
            )}
          />
        </div>
      </div>

      <div className="flex items-center gap-1">
        {slots.map((slot, idx) => {
          const active = idx === activeSlotIdx;
          const busy = slotAis[idx]?.isBusy;
          const label =
            slot.label ||
            (slot.agentId
              ? (agentNames[slot.agentId] ?? `Slot ${idx + 1}`)
              : `Slot ${idx + 1}`);
          return (
            <span key={slot.id} className="group/tab relative inline-flex">
              <button
                type="button"
                onClick={() => setActiveSlotIdx(idx)}
                className={cn(
                  "inline-flex max-w-36 items-center gap-1 truncate rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                  active
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  slots.length > 1 && "pr-5",
                )}
              >
                {busy && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
                <span className="truncate">{label}</span>
              </button>
              {slots.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSlot(slot.id)}
                  aria-label={`Remove ${label}`}
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive group-hover/tab:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}
        {slots.length < MAX_CUSTOM_SLOTS && (
          <button
            type="button"
            onClick={addSlot}
            aria-label="Add custom slot"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  const customToolbar = (
    <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2">
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <AgentListDropdown
            onSelect={handleSlotAgentSelect}
            label={
              activeSlot?.agentId
                ? (agentNames[activeSlot.agentId] ?? "Agent…")
                : "Choose any agent…"
            }
            className="w-full"
          />
        </div>
        <div className="relative shrink-0">
          <select
            value={activeSlot?.source ?? "clean"}
            onChange={(e) =>
              activeSlot &&
              patchSlot(activeSlot.id, {
                source: e.target.value as "clean" | "raw",
              })
            }
            aria-label="Input source for this slot"
            className="h-7 appearance-none rounded-md border border-border bg-background pl-2 pr-6 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="clean">Clean</option>
            <option value="raw">Raw</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        </div>
        <button
          type="button"
          onClick={runActiveSlot}
          disabled={activeAi.isBusy}
          className={cn(
            "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors",
            activeAi.isBusy
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {activeAi.isBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          Run
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <label className="flex min-w-0 cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
          <Switch
            checked={activeSlot?.autoRun ?? false}
            onCheckedChange={(on) =>
              activeSlot && patchSlot(activeSlot.id, { autoRun: on })
            }
            disabled={!activeSlot?.agentId}
            className="scale-75"
            aria-label="Auto-run this slot"
          />
          Auto-run
          <span className="truncate text-muted-foreground/60">
            {activeSlot?.source === "raw" ? "(with Clean)" : "(after Clean)"}
          </span>
        </label>
        <div className="flex shrink-0 items-center gap-1.5">
          {activeAi.mapping && (
            <span className="hidden text-[10px] text-muted-foreground/70 sm:inline">
              {mappingCaption(activeAi.mapping)}
            </span>
          )}
          {activeSlotValue.trim().length > 0 && (
            <ContentActionBar
              content={activeSlotValue}
              title={`Custom: ${activeSlot?.agentId ? (agentNames[activeSlot.agentId] ?? "agent") : "output"}`}
              metadata={{
                agent_id: activeSlot?.agentId ?? "",
                source: "transcription-cleanup-page-custom",
              }}
              instanceKey={`transcription-cleanup-page-custom-${activeSlot?.id ?? INSTANCE_ID}`}
              hideSpeaker
              hidePencil
            />
          )}
        </div>
      </div>
    </div>
  );

  const customPane = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {customTopBand}
      {customToolbar}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <UnifiedAgentContextMenu
          sourceFeature="transcription-cleanup"
          surfaceName="matrx-user/transcripts-cleanup"
          getTextarea={() => customTaRef.current}
          isEditable
          contextData={menuContextData("custom", activeSlotValue)}
          placementMode={{ "content-block": "hide" }}
          className="flex min-h-0 flex-1 flex-col"
          {...customHandlers}
        >
          <textarea
            ref={customTaRef}
            value={activeSlotValue}
            onChange={(e) => handleCustomChange(e.target.value)}
            placeholder={customPlaceholder}
            className={cn(
              "h-full w-full flex-1 resize-none border-0 bg-background px-4 py-3 leading-relaxed",
              "text-base md:text-sm",
              "focus:outline-none focus:ring-0",
              activeAi.phase === "error" && "text-destructive",
            )}
          />
        </UnifiedAgentContextMenu>
        {isLoadingSession && <PaneLoadingVeil label="Loading output…" />}
      </div>
    </div>
  );

  const shellHeader = (
    <PageHeader>
      <TranscriptsListHeader />
    </PageHeader>
  );

  const transcriptInsertDialog = (
    <TranscriptInsertDialog
      open={insertDialogTarget !== null}
      target={insertDialogTarget}
      onOpenChange={(open) => {
        if (!open) setInsertDialogTarget(null);
      }}
      onConfirm={handleInsertDialogConfirm}
    />
  );

  // ── Mobile: single scroll column + drawer ──────────────────────────────────
  if (isMobile) {
    return (
      <>
        {shellHeader}
        <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background pt-[var(--shell-header-h)]">
          {recordControl}
          <div className="flex h-[34dvh] shrink-0 flex-col border-b border-border">
            {transcriptPane}
          </div>
          <div className="flex h-[34dvh] shrink-0 flex-col border-b border-border">
            {cleanPane}
          </div>
          <div className="flex h-[48dvh] shrink-0 flex-col pb-4">
            {customPane}
          </div>
        </div>

        {drawerOpen && (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setDrawerOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col border-r border-border bg-background shadow-xl pb-[calc(var(--shell-dock-h)+var(--shell-dock-bottom)+var(--shell-safe-area-bottom)+0.5rem)]">
              <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Options
                </span>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close options"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1">{sidebarBody}</div>
            </aside>
          </div>
        )}
        {transcriptInsertDialog}
      </>
    );
  }

  // ── Desktop: 3 resizable panels ────────────────────────────────────────────
  return (
    <>
      {shellHeader}
      {transcriptInsertDialog}
      <div className="h-full overflow-hidden">
        <ResizablePanelGroup
          id="cleanup-h3"
          orientation="horizontal"
          defaultLayout={defaultHLayout}
          onLayoutChanged={(layout) => writeLayoutCookie(H_COOKIE, layout)}
          className="h-full w-full"
        >
          <ResizablePanel
            id="sidebar"
            defaultSize="24%"
            minSize="16%"
            maxSize="38%"
          >
            <div className="flex h-full min-h-0 flex-col pt-[var(--shell-header-h)]">
              {sidebarBody}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel id="main" minSize="30%">
            <div className="flex h-full min-h-0 flex-col pt-[var(--shell-header-h)]">
              {recordBand}
              <ResizablePanelGroup
                id="cleanup-v"
                orientation="vertical"
                defaultLayout={defaultVLayout}
                onLayoutChanged={(layout) =>
                  writeLayoutCookie(V_COOKIE, layout)
                }
                className="min-h-0 flex-1"
              >
                <ResizablePanel id="transcript" defaultSize="50%" minSize="20%">
                  {transcriptPane}
                </ResizablePanel>
                <ResizableHandle style={{ cursor: "row-resize" }} />
                <ResizablePanel id="response" defaultSize="50%" minSize="20%">
                  {cleanPane}
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            id="custom"
            defaultSize="28%"
            minSize="18%"
            maxSize="45%"
          >
            <div className="flex h-full min-h-0 flex-col pt-[var(--shell-header-h)]">
              {customPane}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </>
  );
}
