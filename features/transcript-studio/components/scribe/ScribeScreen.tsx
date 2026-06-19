"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlignLeft,
  BookA,
  ChevronLeft,
  FileText,
  FlaskConical,
  Loader2,
  Mic,
  MoreVertical,
  Pencil,
  Radio,
  Square,
  Trash2,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectSessionById } from "../../redux/selectors";
import { activeSessionIdSet } from "../../redux/slice";
import {
  deleteSessionThunk,
  fetchCleanedSegmentsThunk,
  fetchRawSegmentsThunk,
  fetchRecordingSegmentsThunk,
  fetchStudioDocumentsThunk,
  reconcileStuckRecordingsThunk,
  updateSessionThunk,
} from "../../redux/thunks";
import { EditableSessionTitle } from "../EditableSessionTitle";
import { ActionSheet, type ActionSheetItem } from "./ActionSheet";
import {
  SessionTranscriptViewer,
  type SessionTranscriptMode,
} from "./SessionTranscriptViewer";
import { ScribeCaptureScreen } from "./ScribeCaptureScreen";
import { SessionAudioPlayer } from "./SessionAudioPlayer";
import { ScribeCitationProvider } from "../../state/ScribeCitationContext";
import { AssistantScreen } from "./AssistantScreen";
import { ExperimentalAgentScreen } from "./ExperimentalAgentScreen";
import { ScribeLiveScreen } from "./ScribeLiveScreen";
import { AssistantAgentBar } from "./AssistantAgentBar";
import { WorkingDocumentHeader } from "./WorkingDocumentHeader";
import { VoicePlaybackButton } from "./VoicePlaybackButton";
import { useOpenDictionarySelectorWindow } from "@/features/overlays/openers/dictionarySelectorWindow";
import { useStudioAssistant } from "../../hooks/useStudioAssistant";
import { addClientTool } from "@/features/agents/redux/execution-system/instance-client-tools/instance-client-tools.slice";
import { SCRIBE_TOOL_NAMES } from "@/features/agents/scribe-tools/tools/names";
import { useStudioAutoLabel } from "../../hooks/useStudioAutoLabel";
import { useStudioSession } from "../../hooks/useStudioSession";

type Screen = "capture" | "agent" | "live" | "agent2";

const REVIEW_MESSAGE =
  "A new recording was just added to this session. Please review the latest transcript and update the working document accordingly.";

interface ScribeScreenProps {
  sessionId: string;
  onBack?: () => void;
}

interface ModeTab {
  key: Screen;
  label: string;
  icon: typeof Mic;
}

const MODE_TABS: ModeTab[] = [
  { key: "capture", label: "Record", icon: Mic },
  { key: "agent", label: "Agent", icon: Webhook },
  { key: "live", label: "Live", icon: Radio },
  { key: "agent2", label: "Agent+", icon: FlaskConical },
];

export function ScribeScreen({ sessionId, onBack }: ScribeScreenProps) {
  const dispatch = useAppDispatch();
  const session = useAppSelector(selectSessionById(sessionId));
  const [screen, setScreen] = useState<Screen>("capture");
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  // Sessions hydrate from the persisted store on the client only, so the
  // server renders the "Loading…" shell while the client would render the
  // title — a hydration mismatch. Gate the title on a post-mount flag so the
  // first client render matches the server.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [sessionViewer, setSessionViewer] =
    useState<SessionTranscriptMode | null>(null);

  // The assistant hook is mounted at the screen level so a cleanup that
  // completes BEFORE the user switches to the Agent tab still gets the
  // refreshed cleaned context on the next turn. We also use its `send` to fire
  // the post-recording review turn from the toast.
  const { send, conversationId: assistantConversationId } =
    useStudioAssistant(sessionId);

  // Arm the Scribe client tool(s) on the session's assistant conversation —
  // always on for Scribe so the agent can cue + play a clip of the recording on
  // demand (scribe_play_audio). Additive; the conversation's tool array is
  // initialized when the instance is minted, so addClientTool takes effect.
  useEffect(() => {
    if (!assistantConversationId) return;
    for (const toolName of SCRIBE_TOOL_NAMES) {
      dispatch(
        addClientTool({ conversationId: assistantConversationId, toolName }),
      );
    }
  }, [assistantConversationId, dispatch]);

  // Recording is a session-global concern (capturable from any mode), so the
  // control lives in the header and its state is read here. The capture
  // screen keeps its own full-size transport.
  const recorder = useStudioSession({ sessionId });

  // One-shot GLiNER2 auto-label once the first transcript text streams in —
  // only while the title is still the placeholder; never overrides a custom name.
  useStudioAutoLabel({ sessionId, currentTitle: session?.title ?? "" });

  // Offer to send a just-KEPT recording to the agent for review — as a toast,
  // available from any mode. Driven by `keptRecordingTick` (bumped only when a
  // recording is finalized) so a discarded too-short clip never prompts.
  const keptTick = useAppSelector((s) => s.transcriptStudio.keptRecordingTick);
  const lastKeptTick = useRef(keptTick);
  useEffect(() => {
    if (keptTick > lastKeptTick.current) {
      toast("Recording added", {
        description: "Send it to the agent to update the working document?",
        closeButton: true,
        action: {
          label: "Send",
          onClick: () => void send(REVIEW_MESSAGE),
        },
      });
    }
    lastKeptTick.current = keptTick;
  }, [keptTick, send]);

  const recordingBlocked =
    recorder.isAnyRecording && !recorder.isOwnedRecording;

  const openDictionary = useOpenDictionarySelectorWindow();

  const menuItems: ActionSheetItem[] = [
    {
      key: "view-raw",
      label: "View raw transcripts",
      description: "Verbatim text of every recording",
      icon: <FileText className="h-4 w-4" />,
      onSelect: () => setSessionViewer("raw"),
    },
    {
      key: "view-clean",
      label: "View clean transcripts",
      description: "AI-cleaned full session — refresh to re-run",
      icon: <AlignLeft className="h-4 w-4" />,
      onSelect: () => setSessionViewer("clean"),
    },
    {
      key: "dictionary",
      label: "Custom dictionary",
      description: "Terms & pronunciations that bias transcription",
      icon: <BookA className="h-4 w-4" />,
      onSelect: () =>
        openDictionary({ surfaceKey: "matrx-user/transcript-scribe" }),
    },
    {
      key: "rename",
      label: "Rename session",
      icon: <Pencil className="h-4 w-4" />,
      onSelect: () => setRenameOpen(true),
    },
    {
      key: "delete",
      label: "Delete session",
      icon: <Trash2 className="h-4 w-4" />,
      destructive: true,
      onSelect: async () => {
        const ok = await confirm({
          title: `Delete "${session?.title || "Session"}"?`,
          description:
            "This removes the session and its recordings from your list.",
          confirmLabel: "Delete",
          variant: "destructive",
        });
        if (ok) {
          void dispatch(deleteSessionThunk(sessionId));
          onBack?.();
        }
      },
    },
  ];

  // Activate the session (wires the realtime middleware's Channel B) and load
  // its existing data once on mount / session change.
  useEffect(() => {
    if (!sessionId) return;
    dispatch(activeSessionIdSet(sessionId));
    void dispatch(fetchCleanedSegmentsThunk({ sessionId }));
    void dispatch(fetchStudioDocumentsThunk({ sessionId }));
    // Recording + raw segments must land before reconcile so it can derive
    // each stranded segment's tEnd from its chunks. Recovery then finalizes
    // any segment whose stop-finalize was lost (stomped start / reload mid-save)
    // so cards never spin "Saving…" forever.
    void (async () => {
      await Promise.all([
        dispatch(fetchRecordingSegmentsThunk({ sessionId })),
        dispatch(fetchRawSegmentsThunk({ sessionId })),
      ]);
      void dispatch(reconcileStuckRecordingsThunk({ sessionId }));
    })();
  }, [sessionId, dispatch]);

  return (
   <ScribeCitationProvider sessionId={sessionId}>
    <div className="flex h-dvh flex-col overflow-hidden bg-textured">
      {/* Header (shell chrome is hidden on this route — see shell.css) */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex h-12 w-full items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to sessions"
              className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground active:bg-accent"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {/* Title shortened (max-w) to make room for the voice-playback stop
              control that appears next to the mic while audio is playing. */}
          <div className="hidden min-w-0 max-w-[12rem] flex-1 sm:block">
            {mounted && session ? (
              <EditableSessionTitle
                sessionId={sessionId}
                title={session.title}
                className="truncate text-sm font-medium"
              />
            ) : (
              <span className="text-sm font-medium text-muted-foreground">
                Loading…
              </span>
            )}
          </div>
          {/* Mode tabs — Record / Agent / Live. Centered on small screens
              (where the title is hidden to reclaim width), inline otherwise. */}
          <div className="flex flex-1 justify-center sm:flex-none sm:justify-start">
            <div className="flex shrink-0 rounded-full bg-muted p-0.5">
              {MODE_TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setScreen(key)}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors",
                    screen === key
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Voice playback stop — only renders while a voice reply is
              loading/playing, so audio can be stopped from any tab. */}
          <VoicePlaybackButton />
          {/* Custom Dictionary moved into the ⋮ session menu (declutters the
              header — it's supplementary, not a primary control). */}
          {/* Recording control — inline, session-global. Tap to start; while
              recording it pulses red and stops. */}
          <button
            type="button"
            onClick={
              recorder.isOwnedRecording
                ? recorder.stop
                : () => void recorder.start()
            }
            disabled={recordingBlocked || recorder.isFinalizing}
            aria-label={
              recorder.isOwnedRecording
                ? "Stop recording"
                : recorder.isFinalizing
                  ? "Saving previous recording"
                  : "Add recording"
            }
            className={cn(
              "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
              recorder.isOwnedRecording
                ? "bg-red-500 text-white active:scale-95"
                : recordingBlocked || recorder.isFinalizing
                  ? "cursor-not-allowed text-muted-foreground"
                  : "text-foreground active:bg-accent",
            )}
          >
            {recorder.isOwnedRecording ? (
              <>
                {!recorder.isPaused && (
                  <span
                    aria-hidden
                    /* Desktop only — on mobile the bottom bar owns the pulsing
                       "Recording" indicator, so we don't double up. */
                    className="absolute inset-0 hidden animate-ping rounded-full bg-red-500/40 sm:block"
                  />
                )}
                <Square className="relative h-4 w-4 fill-current" />
              </>
            ) : recorder.isFinalizing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </button>
          {/* Session menu */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Session options"
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground active:bg-accent"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Assistant agent bar + working document — rendered once here so they
          sit at the top of EVERY tab identically (Record / Agent / Live / …).
          Single shared instances; tabs below never duplicate them. */}
      <AssistantAgentBar sessionId={sessionId} />
      <WorkingDocumentHeader sessionId={sessionId} />

      {/* Body — all three modes stay mounted; switching tabs only flips
          visibility. This keeps one shared state across Record / Agent / Live:
          nothing unmounts, re-fetches, re-resolves the conversation, or flashes
          a spinner when you move between tabs. */}
      <main className="relative min-h-0 flex-1">
        <div className={cn("h-full", screen !== "capture" && "hidden")}>
          <ScribeCaptureScreen sessionId={sessionId} />
        </div>
        <div className={cn("h-full", screen !== "agent" && "hidden")}>
          <AssistantScreen sessionId={sessionId} />
        </div>
        <div className={cn("h-full", screen !== "live" && "hidden")}>
          <ScribeLiveScreen sessionId={sessionId} />
        </div>
        <div className={cn("h-full", screen !== "agent2" && "hidden")}>
          <ExperimentalAgentScreen sessionId={sessionId} />
        </div>
      </main>

      {/* Session audio transport — one shared player across every tab. Surfaces
          only once a recording card or an agent `<audiocite>` citation seeks it
          (or the user plays the session), giving full scrub / ±10s / speed that
          the per-card play button never had. */}
      <SessionAudioPlayer sessionId={sessionId} />

      <ActionSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title={session?.title || "Session"}
        items={menuItems}
        contentClassName="min-h-[50dvh]"
      />
      {sessionViewer && (
        <SessionTranscriptViewer
          sessionId={sessionId}
          mode={sessionViewer}
          open={sessionViewer !== null}
          onClose={() => setSessionViewer(null)}
          allowRefresh
        />
      )}
      <TextInputDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename session"
        defaultValue={session?.title ?? ""}
        confirmLabel="Save"
        onConfirm={(value) => {
          void dispatch(
            updateSessionThunk({
              id: sessionId,
              patch: { title: value.trim() },
            }),
          );
          setRenameOpen(false);
        }}
      />
    </div>
   </ScribeCitationProvider>
  );
}
