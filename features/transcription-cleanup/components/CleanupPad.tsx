"use client";

/**
 * CleanupPad — the standalone Transcription Cleanup page, on the STUDIO data
 * model. Record → auto-clean → optionally refine with ANY agent.
 *
 * Layout (desktop, 3 resizable panels):
 *   sidebar   — sessions (recents + New), Clean agent dropdown, context items,
 *               Clean Up button
 *   main      — central record control; transcript over Clean (resizable)
 *   custom    — full-height right container: any-agent dropdown + input
 *               source + Run, output textarea
 * Mobile: single scroll column (record, transcript, clean, custom) with the
 * sidebar in a slide-over drawer.
 *
 * Persistence (see useCleanupSession): sessions are studio_sessions rows with
 * source='cleanup'; raw → studio_raw_segments, clean → studio_cleaned_segments,
 * custom → studio_documents, agents + context items → studio_session_settings.
 * A session materializes lazily on first content.
 *
 * Invariant carried from the original tool: what is sent to the AI MUST equal
 * what the user sees in the transcript textarea (`baseTextRef`).
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown, Loader2, PanelLeftOpen, Play, Stars, X } from "lucide-react";
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
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import { FilesTapButton } from "@/components/icons/tap-buttons";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { stripThinkingStreaming } from "@/features/notes/actions/quick-save/utils/stripThinking";
import { createTranscriptsCleanupScope } from "@/features/surfaces/manifests/transcripts-cleanup.manifest";
import type { SessionContextItem } from "@/features/transcript-studio/types";
import { CleanupContextPanel } from "./CleanupContextPanel";
import { CleanupSessionList } from "./CleanupSessionList";
import { DEFAULT_CLEAN_AGENT_ID, SYSTEM_AGENT_NAMES } from "../ai-agents";
import {
  useAiPostProcess,
  type InputMappingInfo,
} from "../hooks/useAiPostProcess";
import { useCleanupSession } from "../hooks/useCleanupSession";

const OVERLAY_ID = "transcriptionCleanupPage" as const;
const INSTANCE_ID = "main" as const;

const H_COOKIE = "panels:cleanup-h3";
const V_COOKIE = "panels:cleanup-v";

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
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Agents — Clean defaults to the system cleaner; Custom starts unset.
  const [cleanAgentId, setCleanAgentId] = useState(DEFAULT_CLEAN_AGENT_ID);
  const [customAgentId, setCustomAgentId] = useState<string | null>(null);
  const [agentNames, setAgentNames] =
    useState<Record<string, string>>(SYSTEM_AGENT_NAMES);
  const [customSource, setCustomSource] = useState<"clean" | "raw">("clean");

  // null = show the live stream / nothing; string = loaded-from-DB or user edit.
  const [editedResponse, setEditedResponse] = useState<string | null>(null);
  const [editedCustom, setEditedCustom] = useState<string | null>(null);

  const cleanAi = useAiPostProcess();
  const customAi = useAiPostProcess();

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

  const allText = useMemo(
    () => entries.map((e) => e.text).join("\n\n"),
    [entries],
  );
  const baseText = draftText !== null ? draftText : allText;
  const transcriptDisplay = liveTranscript
    ? baseText
      ? baseText + "\n\n" + liveTranscript
      : liveTranscript
    : baseText;
  transcriptDisplayRef.current = transcriptDisplay;

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
  const { visible: strippedCustom, isThinking: customThinking } = useMemo(
    () => stripThinkingStreaming(customAi.accumulatedText),
    [customAi.accumulatedText],
  );
  const responseValue = editedResponse ?? strippedClean;
  responseRef.current = responseValue;
  const customValue = editedCustom ?? strippedCustom;
  customRef.current = customValue;

  // ── Surface scope (live values for agent variable/slot mapping) ────────────
  const buildScope = useCallback(() => {
    return createTranscriptsCleanupScope({
      content: baseTextRef.current,
      raw_transcript_text: baseTextRef.current,
      cleaned_transcript_text: responseRef.current || undefined,
      custom_output_text: customRef.current || undefined,
      session_id: sessionRefs.current.activeSessionId ?? undefined,
      session_title: sessionRefs.current.activeSession?.title,
    });
  }, []);

  // ── Session content loading: reset local state from the DB snapshot ───────
  useEffect(() => {
    const loaded = session.loaded;
    if (!loaded) return;
    dispatch(clearAllEntries({ overlayId: OVERLAY_ID, instanceId: INSTANCE_ID }));
    dispatch(
      setDraftText({
        overlayId: OVERLAY_ID,
        instanceId: INSTANCE_ID,
        text: loaded.rawText,
      }),
    );
    setEditedResponse(loaded.cleanText || null);
    setEditedCustom(loaded.customText || null);
    setCleanAgentId(loaded.cleanAgentId ?? DEFAULT_CLEAN_AGENT_ID);
    setCustomAgentId(loaded.customAgentId);
    contextItemsRef.current = loaded.contextItems;
    setAgentNames((prev) => ({ ...prev, ...loaded.agentNames }));
    setLiveTranscript("");
    cleanAi.reset();
    customAi.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.loaded, dispatch]);

  const clearLocalContent = useCallback(() => {
    dispatch(clearAllEntries({ overlayId: OVERLAY_ID, instanceId: INSTANCE_ID }));
    dispatch(
      setDraftText({ overlayId: OVERLAY_ID, instanceId: INSTANCE_ID, text: "" }),
    );
    setEditedResponse(null);
    setEditedCustom(null);
    setLiveTranscript("");
    cleanAi.reset();
    customAi.reset();
  }, [dispatch, cleanAi, customAi]);

  // ── Agent name resolution for dropdown labels ──────────────────────────────
  const resolveAgentName = useCallback(
    async (id: string) => {
      if (agentNames[id]) return;
      const names = await session.fetchAgentNames([id]);
      if (names[id]) setAgentNames((prev) => ({ ...prev, ...names }));
    },
    [agentNames, session],
  );

  // ── Run: Clean ─────────────────────────────────────────────────────────────
  const runClean = useCallback(
    (text: string) => {
      setEditedResponse(null);
      void cleanAi.process({
        agentId: cleanAgentIdRef.current,
        text,
        contextItems: contextItemsRef.current,
        scope: buildScope(),
      });
    },
    [cleanAi, buildScope],
  );

  // Persist the cleaned output exactly once per completed conversation.
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
    }
  }, [cleanAi.phase, cleanAi.conversationId, cleanAi.accumulatedText]);

  // ── Run: Custom ────────────────────────────────────────────────────────────
  const runCustom = useCallback(() => {
    if (!customAgentId) {
      toast.info("Choose an agent for the custom container first");
      return;
    }
    const input =
      customSource === "clean" && responseRef.current.trim()
        ? responseRef.current
        : baseTextRef.current;
    if (!input.trim()) {
      toast.info("Nothing to process yet — record or type a transcript");
      return;
    }
    setEditedCustom(null);
    void customAi.process({
      agentId: customAgentId,
      text: input,
      contextItems: contextItemsRef.current,
      scope: buildScope(),
    });
  }, [customAgentId, customSource, customAi, buildScope]);

  const persistedCustomCidRef = useRef<string | null>(null);
  const customAgentIdRef = useRef(customAgentId);
  customAgentIdRef.current = customAgentId;
  useEffect(() => {
    if (
      customAi.phase === "complete" &&
      customAi.conversationId &&
      customAgentIdRef.current &&
      persistedCustomCidRef.current !== customAi.conversationId
    ) {
      persistedCustomCidRef.current = customAi.conversationId;
      const text = stripThinkingStreaming(customAi.accumulatedText).visible;
      void sessionRefs.current.persistCustomRun(
        text,
        customAgentIdRef.current,
        customAi.conversationId,
      );
    }
  }, [customAi.phase, customAi.conversationId, customAi.accumulatedText]);

  // ── Mic ────────────────────────────────────────────────────────────────────
  const handleTranscriptionComplete = useCallback(
    (text: string) => {
      setLiveTranscript("");
      const trimmed = text.trim();
      if (!trimmed) return;

      const previous = baseTextRef.current;
      const combined = previous ? previous + "\n\n" + trimmed : trimmed;

      dispatch(
        addTranscriptEntry({
          overlayId: OVERLAY_ID,
          instanceId: INSTANCE_ID,
          text,
        }),
      );
      // Lock draftText to `combined` so the textarea renders exactly what we
      // just sent to the AI.
      dispatch(
        setDraftText({
          overlayId: OVERLAY_ID,
          instanceId: INSTANCE_ID,
          text: combined,
        }),
      );
      baseTextRef.current = combined;

      void sessionRefs.current.persistRawAppend(trimmed);
      runClean(combined);
    },
    [dispatch, runClean],
  );

  const handleLiveTranscript = useCallback((text: string) => {
    setLiveTranscript(text);
  }, []);

  // ── Edits ──────────────────────────────────────────────────────────────────
  const handleDraftChange = useCallback(
    (value: string) => {
      dispatch(
        setDraftText({
          overlayId: OVERLAY_ID,
          instanceId: INSTANCE_ID,
          text: value,
        }),
      );
      session.persistRawReplace(value);
    },
    [dispatch, session],
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
      setEditedCustom(value);
      session.persistCustomEdit(value);
    },
    [session],
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

  const handleCustomAgentSelect = useCallback(
    (agentId: string) => {
      setCustomAgentId(agentId);
      void resolveAgentName(agentId);
      session.persistSettings({ customAgentId: agentId });
    },
    [resolveAgentName, session],
  );

  // ── Manual Clean Up ────────────────────────────────────────────────────────
  const handleProcess = useCallback(() => {
    const transcript = baseTextRef.current.trim();
    if (!transcript) {
      toast.info("Add a transcript before analyzing");
      return;
    }
    runClean(transcript);
    setDrawerOpen(false);
  }, [runClean]);

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
    clearLocalContent();
    contextItemsRef.current = [];
    await session.createNew();
    setDrawerOpen(false);
  }, [clearLocalContent, session]);

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
  const customBusyEarly =
    customAi.phase === "launching" ||
    customAi.phase === "pending" ||
    customAi.phase === "connecting";
  const customPlaceholder =
    customAi.phase === "idle"
      ? customAgentId
        ? "Run your agent to fill this container — or just type here..."
        : "Pick any agent above, then run it over the transcript or the cleaned text..."
      : (customBusyEarly || customThinking) && customValue.length === 0
        ? "Processing..."
        : customAi.phase === "error"
          ? (customAi.error ?? "Something went wrong. Please try again.")
          : "Preparing your response...";

  const recordStatus = liveTranscript
    ? "Listening…"
    : cleanAi.isBusy
      ? "Processing…"
      : "Tap to record";

  const micId = `transcription-cleanup-page-mic-${INSTANCE_ID}`;

  // ── Shared UI fragments ────────────────────────────────────────────────────

  const recordControl = (
    <div className="flex shrink-0 items-center justify-center gap-3 border-b border-border px-4 py-3">
      <div className="flex items-center gap-2.5 rounded-full border border-border bg-card py-1 pl-1 pr-4 shadow-sm">
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full p-1 transition-colors",
            liveTranscript
              ? "bg-red-500/15 text-red-500"
              : "bg-primary/10 text-primary",
          )}
        >
          <MicrophoneIconButton
            id={micId}
            onTranscriptionComplete={handleTranscriptionComplete}
            onLiveTranscript={handleLiveTranscript}
            variant="icon-only"
            size="lg"
          />
        </span>
        <span className="text-sm font-medium text-foreground">
          {recordStatus}
        </span>
      </div>
    </div>
  );

  const sidebarBody = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-4 pb-3">
        <CleanupSessionList
          sessions={session.sessions}
          fetchStatus={session.fetchStatus}
          activeSessionId={session.activeSessionId}
          onSelect={handleSelectSession}
          onCreate={() => void handleNewSession()}
          onDelete={(id) => void session.deleteSession(id)}
        />

        <div className="mb-1.5 mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Cleaning Agent
        </div>
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

        <div className="mb-1.5 mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Context
        </div>
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
              : "bg-primary text-primary-foreground hover:bg-primary/90",
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

  const transcriptPane = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Transcript
        </span>
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
      <textarea
        value={transcriptDisplay}
        onChange={(e) => handleDraftChange(e.target.value)}
        placeholder="Tap the mic above to record. Transcribed text appears here and is processed automatically..."
        className={cn(
          "min-h-0 w-full flex-1 resize-none border-0 bg-background px-4 py-3 leading-relaxed",
          "text-base md:text-sm",
          "focus:outline-none focus:ring-0",
        )}
      />
    </div>
  );

  const cleanPane = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Stars className="h-3.5 w-3.5 text-primary/80" />
          Clean
          {cleanThinking && (
            <span className="inline-flex items-center gap-1 font-normal normal-case text-primary/80">
              · Thinking
              <span className="inline-flex gap-0.5">
                <span className="h-1 w-1 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.3s]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.15s]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-primary/70" />
              </span>
            </span>
          )}
          {cleanAi.phase === "complete" && responseValue.trim() && (
            <span className="font-normal normal-case text-green-600 dark:text-green-400">
              · Ready
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
      <textarea
        value={responseValue}
        onChange={(e) => handleResponseChange(e.target.value)}
        placeholder={responsePlaceholder}
        className={cn(
          "min-h-0 w-full flex-1 resize-none border-0 bg-background px-4 py-3 leading-relaxed",
          "text-base md:text-sm",
          "focus:outline-none focus:ring-0",
          cleanAi.phase === "error" && "text-destructive",
        )}
      />
    </div>
  );

  const customControls = (
    <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Custom
          {customThinking && (
            <span className="inline-flex items-center gap-1 font-normal normal-case text-primary/80">
              · Thinking
            </span>
          )}
          {customAi.phase === "complete" && customValue.trim() && (
            <span className="font-normal normal-case text-green-600 dark:text-green-400">
              · Ready
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <Loader2
            className={cn(
              "h-4 w-4 text-muted-foreground",
              customBusyEarly || customThinking ? "animate-spin" : "invisible",
            )}
          />
          {customValue.trim().length > 0 && (
            <ContentActionBar
              content={customValue}
              title={`Custom: ${customAgentId ? (agentNames[customAgentId] ?? "agent") : "output"}`}
              metadata={{
                agent_id: customAgentId ?? "",
                source: "transcription-cleanup-page-custom",
              }}
              instanceKey={`transcription-cleanup-page-custom-${INSTANCE_ID}`}
              hideSpeaker
              hidePencil
            />
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <AgentListDropdown
            onSelect={handleCustomAgentSelect}
            label={
              customAgentId
                ? (agentNames[customAgentId] ?? "Agent…")
                : "Choose any agent…"
            }
            className="w-full"
          />
        </div>
        <div className="relative shrink-0">
          <select
            value={customSource}
            onChange={(e) => setCustomSource(e.target.value as "clean" | "raw")}
            aria-label="Input source for the custom agent"
            className="h-7 appearance-none rounded-md border border-border bg-background pl-2 pr-6 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="clean">Clean</option>
            <option value="raw">Raw</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        </div>
        <button
          type="button"
          onClick={runCustom}
          disabled={customAi.isBusy}
          className={cn(
            "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors",
            customAi.isBusy
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {customAi.isBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          Run
        </button>
      </div>
      {customAi.mapping && (
        <div className="text-[10px] text-muted-foreground/70">
          {mappingCaption(customAi.mapping)}
        </div>
      )}
    </div>
  );

  const customPane = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {customControls}
      <textarea
        value={customValue}
        onChange={(e) => handleCustomChange(e.target.value)}
        placeholder={customPlaceholder}
        className={cn(
          "min-h-0 w-full flex-1 resize-none border-0 bg-background px-4 py-3 leading-relaxed",
          "text-base md:text-sm",
          "focus:outline-none focus:ring-0",
          customAi.phase === "error" && "text-destructive",
        )}
      />
    </div>
  );

  const header = (
    <PageHeader>
      <div className="flex w-full items-center justify-center gap-2 px-1">
        {isMobile && (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open options"
            className="-ml-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
        <Stars className="h-4 w-4 shrink-0 text-primary/80" />
        <span className="text-sm font-semibold text-foreground">
          Transcription Cleanup
        </span>
        {session.activeSession && (
          <span className="hidden max-w-56 truncate text-xs text-muted-foreground sm:inline">
            · {session.activeSession.title}
          </span>
        )}
      </div>
    </PageHeader>
  );

  // ── Mobile: single scroll column + drawer ──────────────────────────────────
  if (isMobile) {
    return (
      <>
        {header}
        <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background pt-[var(--shell-header-h)]">
          {recordControl}
          <div className="flex h-[34dvh] shrink-0 flex-col border-b border-border">
            {transcriptPane}
          </div>
          <div className="flex h-[34dvh] shrink-0 flex-col border-b border-border">
            {cleanPane}
          </div>
          <div className="flex h-[42dvh] shrink-0 flex-col pb-4">
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
      </>
    );
  }

  // ── Desktop: 3 resizable panels ────────────────────────────────────────────
  return (
    <>
      {header}
      <div className="h-full overflow-hidden">
        <ResizablePanelGroup
          id="cleanup-h3"
          orientation="horizontal"
          defaultLayout={defaultHLayout}
          onLayoutChanged={(layout) => writeLayoutCookie(H_COOKIE, layout)}
          className="h-full w-full"
        >
          <ResizablePanel id="sidebar" defaultSize="24%" minSize="16%" maxSize="38%">
            <div className="h-full pt-[var(--shell-header-h)]">{sidebarBody}</div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel id="main" minSize="30%">
            <div className="flex h-full min-h-0 flex-col pt-[var(--shell-header-h)]">
              {recordControl}
              <ResizablePanelGroup
                id="cleanup-v"
                orientation="vertical"
                defaultLayout={defaultVLayout}
                onLayoutChanged={(layout) => writeLayoutCookie(V_COOKIE, layout)}
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

          <ResizablePanel id="custom" defaultSize="28%" minSize="18%" maxSize="45%">
            <div className="h-full pt-[var(--shell-header-h)]">{customPane}</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </>
  );
}
