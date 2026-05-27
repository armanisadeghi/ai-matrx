"use client";

/**
 * TranscriptionCleanup — voice pad with AI post-processing.
 *
 * - Sidebar: agent picker + context textarea + Process button.
 * - Main body: transcript textarea on top, AI response textarea on bottom.
 *   Both are always rendered (even when empty) so the split is stable.
 * - Auto-processing: when a transcription completes, the agent fires
 *   immediately — the user doesn't have to click Process.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Loader2, Stars } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { closeOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  selectVoicePadEntries,
  selectVoicePadDraftText,
  addTranscriptEntry,
  clearAllEntries,
  setDraftText,
} from "@/lib/redux/slices/voicePadSlice";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import { FilesTapButton } from "@/components/icons/tap-buttons";
import { useSetting } from "@/features/settings/hooks/useSetting";
import type { CustomCleanerAgent } from "@/lib/redux/preferences/userPreferencesSlice";
import { stripThinkingStreaming } from "@/features/notes/actions/quick-save/utils/stripThinking";
import { TranscriptionCleanupContextPanel } from "./TranscriptionCleanupContextPanel";
import {
  AI_POST_PROCESS_AGENTS,
  DEFAULT_AI_POST_PROCESS_AGENT_ID,
  type AiPostProcessAgent,
} from "../ai-agents";
import { useAiPostProcess } from "../hooks/useAiPostProcess";

const OVERLAY_ID = "transcriptionCleanup" as const;

interface TranscriptionCleanupProps {
  instanceId: string;
}

export default function TranscriptionCleanup({
  instanceId,
}: TranscriptionCleanupProps) {
  const dispatch = useAppDispatch();
  const entries = useAppSelector((s) =>
    selectVoicePadEntries(s, OVERLAY_ID, instanceId),
  );
  const draftText = useAppSelector((s) =>
    selectVoicePadDraftText(s, OVERLAY_ID, instanceId),
  );
  const [liveTranscript, setLiveTranscript] = useState("");
  const [agentId, setAgentId] = useState<string>(
    DEFAULT_AI_POST_PROCESS_AGENT_ID,
  );
  const [editedResponse, setEditedResponse] = useState<string | null>(null);
  // No userContext state — context is managed by TranscriptionCleanupContextPanel
  // and reported back via contextRef (updated synchronously on every block change).

  const ai = useAiPostProcess();

  // Custom user-defined cleaners (from preferences) merged into the picker
  // alongside the system-owned agents. Empty by default.
  const [customAgents] = useSetting<CustomCleanerAgent[]>(
    "userPreferences.transcription.customCleanerAgents",
  );
  const allAgents = useMemo<AiPostProcessAgent[]>(() => {
    if (!customAgents || customAgents.length === 0)
      return AI_POST_PROCESS_AGENTS;
    const customMapped: AiPostProcessAgent[] = customAgents.map((a) => ({
      id: a.id,
      name: a.displayName,
      transcriptVariableKey: a.transcriptVariableKey,
      contextSlotKey: a.contextSlotKey,
      contextVariableKey: a.contextVariableKey,
    }));
    return [...AI_POST_PROCESS_AGENTS, ...customMapped];
  }, [customAgents]);

  // Keep the latest selection + context so the async transcription-complete
  // callback can read them without stale closures.
  const agentIdRef = useRef(agentId);
  // contextRef is updated synchronously by handleContextChange (called from
  // TranscriptionCleanupContextPanel on every block mutation). Never stale.
  const contextRef = useRef("");
  agentIdRef.current = agentId;

  // Copy-safe refs — always hold the latest rendered values so clipboard
  // handlers work correctly regardless of display mode (including compact/floating).
  const responseRef = useRef<string>("");
  const transcriptDisplayRef = useRef<string>("");

  const windowId = `transcription-cleanup-${instanceId}`;
  const micId = `transcription-cleanup-mic-${instanceId}`;

  const selectedAgent = useMemo<AiPostProcessAgent>(
    () => allAgents.find((a) => a.id === agentId) ?? allAgents[0],
    [agentId, allAgents],
  );

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

  // Invariant: what we send to the AI MUST equal what the user sees in the
  // transcript textarea. `baseText` is derived from Redux (draftText ?? entries)
  // and changes on every keystroke. Async flows (auto-process on transcription
  // complete, mic callback that may have been captured by a child component)
  // must read the latest value via a ref to avoid stale-closure drift between
  // the textarea and the AI input.
  const baseTextRef = useRef(baseText);
  baseTextRef.current = baseText;

  const handleClose = useCallback(() => {
    dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId }));
  }, [dispatch, instanceId]);

  const handleTranscriptionComplete = useCallback(
    (text: string) => {
      setLiveTranscript("");
      const trimmed = text.trim();
      if (!trimmed) return;

      // Read the current visible baseText (which includes any user edits in
      // draftText) and append the new transcript to it. This exact string is
      // both rendered in the textarea and sent to the agent.
      const previous = baseTextRef.current;
      const combined = previous ? previous + "\n\n" + trimmed : trimmed;

      dispatch(addTranscriptEntry({ overlayId: OVERLAY_ID, instanceId, text }));
      // Lock draftText to `combined` so the textarea renders exactly what we
      // just sent to the AI. Without this, a pre-existing draftText would
      // diverge from the newly appended entries and the visible text would no
      // longer match the model input.
      dispatch(
        setDraftText({ overlayId: OVERLAY_ID, instanceId, text: combined }),
      );
      baseTextRef.current = combined;

      const agent =
        allAgents.find((a) => a.id === agentIdRef.current) ?? allAgents[0];
      setEditedResponse(null);
      ai.process({
        agent,
        transcript: combined,
        context: contextRef.current,
      });
    },
    [ai, dispatch, instanceId, allAgents],
  );

  const handleLiveTranscript = useCallback((text: string) => {
    setLiveTranscript(text);
  }, []);

  const handleClearAll = useCallback(() => {
    dispatch(clearAllEntries({ overlayId: OVERLAY_ID, instanceId }));
    ai.reset();
    setEditedResponse(null);
  }, [ai, dispatch, instanceId]);

  const handleContextChange = useCallback((combined: string) => {
    contextRef.current = combined;
  }, []);

  const handleDraftChange = useCallback(
    (value: string) => {
      dispatch(
        setDraftText({ overlayId: OVERLAY_ID, instanceId, text: value }),
      );
    },
    [dispatch, instanceId],
  );

  const handleProcess = useCallback(() => {
    // Always read the latest visible text via the ref. Same invariant as the
    // auto-process path: the string sent to the agent must equal the string
    // in the textarea at the moment of submission.
    const transcript = baseTextRef.current.trim();
    if (!transcript) {
      toast.info("Add a transcript before analyzing");
      return;
    }
    setEditedResponse(null);
    ai.process({
      agent: selectedAgent,
      transcript,
      context: contextRef.current,
    });
  }, [ai, selectedAgent]);

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

  // Strip <thinking>/<reasoning> blocks from the streaming model output so
  // chain-of-thought never reaches the textarea or the clipboard. While a
  // thinking block is open (closer hasn't arrived), surface a "Thinking…"
  // indicator in the header instead.
  const { visible: strippedResponse, isThinking } = useMemo(
    () => stripThinkingStreaming(ai.accumulatedText),
    [ai.accumulatedText],
  );
  const responseValue = editedResponse ?? strippedResponse;
  responseRef.current = responseValue;
  const isBusyEarly =
    ai.phase === "launching" ||
    ai.phase === "pending" ||
    ai.phase === "connecting";
  const responsePlaceholder =
    ai.phase === "idle"
      ? "Your cleaned transcript will appear here after recording..."
      : (isBusyEarly || isThinking) && responseValue.length === 0
        ? "Analyzing your transcript..."
        : ai.phase === "error"
          ? (ai.error ?? "Something went wrong. Please try again.")
          : "Preparing your response...";

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-3 pb-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          Agent
        </div>
        <div className="flex flex-col gap-1">
          {allAgents.map((agent) => (
            <label
              key={agent.id}
              className={cn(
                "flex items-start gap-2 rounded-md border p-2 cursor-pointer transition-colors text-xs",
                agent.id === agentId
                  ? "bg-primary/10 border-primary/50"
                  : "border-border/50 hover:bg-accent/40",
              )}
            >
              <input
                type="radio"
                name={`transcription-cleanup-agent-${instanceId}`}
                value={agent.id}
                checked={agent.id === agentId}
                onChange={() => setAgentId(agent.id)}
                className="mt-0.5 shrink-0"
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[11px] font-medium leading-tight">
                  {agent.name}
                </span>
                <span className="text-[10px] text-muted-foreground/80 leading-tight break-all">
                  var: <code>{agent.transcriptVariableKey}</code>
                  {agent.contextSlotKey && (
                    <>
                      {" "}
                      · ctx: <code>{agent.contextSlotKey}</code>
                    </>
                  )}
                </span>
              </div>
            </label>
          ))}
        </div>

        <div className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          Context
        </div>
        <TranscriptionCleanupContextPanel onChange={handleContextChange} />
      </div>

      <div className="shrink-0 border-t border-border/50 p-2 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={handleProcess}
          disabled={ai.isBusy}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            ai.isBusy
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {ai.isBusy ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing...
            </>
          ) : (
            <>
              <Stars className="h-3.5 w-3.5" /> Clean Up
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <WindowPanel
      id={windowId}
      title="Transcription Cleanup"
      width={820}
      height={620}
      position="top-right"
      minWidth={600}
      minHeight={420}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      onClose={handleClose}
      urlSyncKey="transcription-cleanup"
      urlSyncId={instanceId}
      sidebar={sidebar}
      sidebarDefaultSize={260}
      sidebarMinSize={220}
      defaultSidebarOpen={true}
      actionsRight={
        <MicrophoneIconButton
          id={micId}
          onTranscriptionComplete={handleTranscriptionComplete}
          onLiveTranscript={handleLiveTranscript}
          variant="icon-only"
          size="xs"
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col bg-background">
        {/* Top half: transcript */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between px-3 py-1.5 border-b border-border/40">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Transcript{" "}
              <span className="text-muted-foreground/60">
                ({entries.length})
              </span>
            </span>
            <div className="flex items-center gap-1">
              {(transcriptDisplay.trim().length > 0 || entries.length > 0) && (
                <ContentActionBar
                  content={transcriptDisplay}
                  title="Voice Pad Transcript"
                  instanceKey={`transcription-cleanup-transcript-${instanceId}`}
                  hideSpeaker
                  hidePencil
                  onDelete={handleClearAll}
                  deleteAriaLabel="Clear transcript"
                />
              )}
            </div>
          </div>
          <textarea
            value={transcriptDisplay}
            onChange={(e) => handleDraftChange(e.target.value)}
            placeholder="Tap the mic in the header to record. Transcribed text appears here and is processed automatically..."
            className={cn(
              "flex-1 min-h-0 w-full resize-none border-0 bg-background px-3 py-2 text-sm leading-snug",
              "focus:outline-none focus:ring-0",
            )}
          />
        </div>

        {/* Divider */}
        <div className="h-px shrink-0 bg-border/60" />

        {/* Bottom half: AI response */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between px-3 py-1.5 border-b border-border/40">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Stars className="h-3 w-3 text-primary/80" />
              AI Response
              {isThinking && (
                <span className="normal-case font-normal text-primary/80 inline-flex items-center gap-1">
                  · Thinking
                  <span className="inline-flex gap-0.5">
                    <span className="h-1 w-1 rounded-full bg-primary/70 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1 w-1 rounded-full bg-primary/70 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1 w-1 rounded-full bg-primary/70 animate-bounce" />
                  </span>
                </span>
              )}
              {ai.phase === "complete" && responseValue.trim() && (
                <span className="normal-case font-normal text-green-600 dark:text-green-400">
                  · Ready
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {/* Spinner occupies space always; invisible when not processing */}
              <Loader2
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground",
                  isBusyEarly || isThinking ? "animate-spin" : "invisible",
                )}
              />
              {ai.phase === "complete" && responseValue.trim().length > 0 && (
                <ContentActionBar
                  content={responseValue}
                  title={`AI-cleaned: ${selectedAgent.name}`}
                  metadata={{
                    agent_id: selectedAgent.id,
                    agent_name: selectedAgent.name,
                    source: "transcription-cleanup",
                  }}
                  instanceKey={`transcription-cleanup-response-${instanceId}`}
                  hideSpeaker
                  hidePencil
                  extras={
                    <FilesTapButton
                      variant="group"
                      onClick={handleCopyJoined}
                      ariaLabel="Copy transcript + AI response"
                      className="text-muted-foreground"
                    />
                  }
                />
              )}
            </div>
          </div>
          <textarea
            value={responseValue}
            onChange={(e) => setEditedResponse(e.target.value)}
            placeholder={responsePlaceholder}
            className={cn(
              "flex-1 min-h-0 w-full resize-none border-0 bg-background px-3 py-2 text-sm leading-snug",
              "focus:outline-none focus:ring-0",
              ai.phase === "error" && "text-destructive",
            )}
          />
        </div>
      </div>
    </WindowPanel>
  );
}
