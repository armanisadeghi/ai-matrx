"use client";

/**
 * CleanupPad — the standalone-route version of the Transcription Cleanup tool.
 *
 * Behaviour is a faithful copy of the floating window panel
 * (`components/official-candidate/transcription-cleanup/`); only the chrome is
 * page-native:
 *
 * - Header lives in the app shell header via `<PageHeader>` (portal into
 *   `#shell-header-center`) — no in-body header bar, no wasted vertical space.
 * - Desktop/tablet: two resizable splits — sidebar │ main, and within main,
 *   transcript ─ response. Both dividers drag and persist via cookies.
 * - Mobile: options collapse into a drawer; transcript/response stack.
 * - The mic is the hero: a central, prominent record control, not a corner icon.
 *
 * Voice-pad state is keyed under `overlayId="transcriptionCleanupPage"`,
 * `instanceId="main"` so it never collides with the floating overlay's state.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2, PanelLeftOpen, Stars, X } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import { FilesTapButton } from "@/components/icons/tap-buttons";
import { useSetting } from "@/features/settings/hooks/useSetting";
import type { CustomCleanerAgent } from "@/lib/redux/preferences/userPreferencesSlice";
import { stripThinkingStreaming } from "@/features/notes/actions/quick-save/utils/stripThinking";
import { CleanupContextPanel } from "./CleanupContextPanel";
import {
  AI_POST_PROCESS_AGENTS,
  DEFAULT_AI_POST_PROCESS_AGENT_ID,
  type AiPostProcessAgent,
} from "../ai-agents";
import { useAiPostProcess } from "../hooks/useAiPostProcess";

// Distinct from the overlay's "transcriptionCleanup" id so page state and
// floating-window state stay independent in the shared voicePad slice.
const OVERLAY_ID = "transcriptionCleanupPage" as const;
const INSTANCE_ID = "main" as const;

const H_COOKIE = "panels:cleanup-h";
const V_COOKIE = "panels:cleanup-v";

function writeLayoutCookie(name: string, layout: Record<string, number>) {
  document.cookie =
    `${name}=${encodeURIComponent(JSON.stringify(layout))}` +
    `; path=/; max-age=31536000; SameSite=Lax`;
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
  const entries = useAppSelector((s) =>
    selectVoicePadEntries(s, OVERLAY_ID, INSTANCE_ID),
  );
  const draftText = useAppSelector((s) =>
    selectVoicePadDraftText(s, OVERLAY_ID, INSTANCE_ID),
  );
  const [liveTranscript, setLiveTranscript] = useState("");
  const [agentId, setAgentId] = useState<string>(
    DEFAULT_AI_POST_PROCESS_AGENT_ID,
  );
  const [editedResponse, setEditedResponse] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile options drawer whenever we leave mobile width.
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

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
  // CleanupContextPanel on every block mutation). Never stale.
  const contextRef = useRef("");
  agentIdRef.current = agentId;

  // Copy-safe refs — always hold the latest rendered values so clipboard
  // handlers work correctly regardless of display mode.
  const responseRef = useRef<string>("");
  const transcriptDisplayRef = useRef<string>("");

  const micId = `transcription-cleanup-page-mic-${INSTANCE_ID}`;

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

      const agent =
        allAgents.find((a) => a.id === agentIdRef.current) ?? allAgents[0];
      setEditedResponse(null);
      ai.process({
        agent,
        transcript: combined,
        context: contextRef.current,
      });
    },
    [ai, dispatch, allAgents],
  );

  const handleLiveTranscript = useCallback((text: string) => {
    setLiveTranscript(text);
  }, []);

  const handleClearAll = useCallback(() => {
    dispatch(
      clearAllEntries({ overlayId: OVERLAY_ID, instanceId: INSTANCE_ID }),
    );
    ai.reset();
    setEditedResponse(null);
  }, [ai, dispatch]);

  const handleContextChange = useCallback((combined: string) => {
    contextRef.current = combined;
  }, []);

  const handleDraftChange = useCallback(
    (value: string) => {
      dispatch(
        setDraftText({
          overlayId: OVERLAY_ID,
          instanceId: INSTANCE_ID,
          text: value,
        }),
      );
    },
    [dispatch],
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
    setDrawerOpen(false);
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
  // chain-of-thought never reaches the textarea or the clipboard.
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

  const recordStatus = liveTranscript
    ? "Listening…"
    : ai.isBusy
      ? "Processing…"
      : "Tap to record";

  // ── Central record control (the hero) ──────────────────────────────────────
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

  // ── Sidebar / options content (shared by desktop panel and mobile drawer) ───
  const optionsBody = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-4 pb-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Agent
        </div>
        <RadioGroup
          value={agentId}
          onValueChange={setAgentId}
          className="gap-2"
        >
          {allAgents.map((agent) => {
            const active = agent.id === agentId;
            return (
              <Label
                key={agent.id}
                htmlFor={`cleanup-agent-${agent.id}`}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent/50",
                )}
              >
                <RadioGroupItem
                  value={agent.id}
                  id={`cleanup-agent-${agent.id}`}
                  className="mt-0.5"
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm font-medium leading-snug text-foreground">
                    {agent.name}
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    var: <code className="text-[11px]">{agent.transcriptVariableKey}</code>
                    {agent.contextSlotKey && (
                      <>
                        {" · "}ctx:{" "}
                        <code className="text-[11px]">{agent.contextSlotKey}</code>
                      </>
                    )}
                  </span>
                </div>
              </Label>
            );
          })}
        </RadioGroup>

        <div className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Context
        </div>
        <CleanupContextPanel onChange={handleContextChange} />
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <button
          type="button"
          onClick={handleProcess}
          disabled={ai.isBusy}
          className={cn(
            "inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
            ai.isBusy
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {ai.isBusy ? (
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

  // ── Transcript pane ─────────────────────────────────────────────────────────
  const transcriptPane = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Transcript{" "}
          <span className="text-muted-foreground/60">({entries.length})</span>
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
          "text-base md:text-sm", // ≥16px on mobile to prevent iOS zoom
          "focus:outline-none focus:ring-0",
        )}
      />
    </div>
  );

  // ── Response pane ───────────────────────────────────────────────────────────
  const responsePane = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Stars className="h-3.5 w-3.5 text-primary/80" />
          AI Response
          {isThinking && (
            <span className="inline-flex items-center gap-1 font-normal normal-case text-primary/80">
              · Thinking
              <span className="inline-flex gap-0.5">
                <span className="h-1 w-1 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.3s]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.15s]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-primary/70" />
              </span>
            </span>
          )}
          {ai.phase === "complete" && responseValue.trim() && (
            <span className="font-normal normal-case text-green-600 dark:text-green-400">
              · Ready
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <Loader2
            className={cn(
              "h-4 w-4 text-muted-foreground",
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
                source: "transcription-cleanup-page",
              }}
              instanceKey={`transcription-cleanup-page-response-${INSTANCE_ID}`}
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
          "min-h-0 w-full flex-1 resize-none border-0 bg-background px-4 py-3 leading-relaxed",
          "text-base md:text-sm",
          "focus:outline-none focus:ring-0",
          ai.phase === "error" && "text-destructive",
        )}
      />
    </div>
  );

  // ── Header (portaled into the app shell header) ─────────────────────────────
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
      </div>
    </PageHeader>
  );

  // ── Mobile layout: stacked + drawer ─────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        {header}
        <div className="flex h-full min-h-0 flex-col bg-background pt-[var(--shell-header-h)]">
          {recordControl}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">{transcriptPane}</div>
            <div className="h-px shrink-0 bg-border" />
            <div className="min-h-0 flex-1">{responsePane}</div>
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
              <div className="min-h-0 flex-1">{optionsBody}</div>
            </aside>
          </div>
        )}
      </>
    );
  }

  // ── Desktop / tablet layout: two resizable splits ───────────────────────────
  return (
    <>
      {header}
      <div className="h-full overflow-hidden">
        <ResizablePanelGroup
          id="cleanup-h"
          orientation="horizontal"
          defaultLayout={defaultHLayout}
          onLayoutChanged={(layout) => writeLayoutCookie(H_COOKIE, layout)}
          className="h-full w-full"
        >
          <ResizablePanel
            id="sidebar"
            defaultSize="30%"
            minSize="18%"
            maxSize="46%"
          >
            <div className="h-full pt-[var(--shell-header-h)]">{optionsBody}</div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel id="main" minSize="40%">
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
                  {responsePane}
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </>
  );
}
