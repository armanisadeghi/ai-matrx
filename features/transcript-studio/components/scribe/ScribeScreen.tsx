"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Mic,
  MoreVertical,
  Pencil,
  Radio,
  Square,
  Trash2,
  Wand2,
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
  updateSessionThunk,
} from "../../redux/thunks";
import { EditableSessionTitle } from "../EditableSessionTitle";
import { ActionSheet, type ActionSheetItem } from "./ActionSheet";
import { CleanupSheet } from "./CleanupSheet";
import { ScribeCaptureScreen } from "./ScribeCaptureScreen";
import { AssistantScreen } from "./AssistantScreen";
import { ScribeLiveScreen } from "./ScribeLiveScreen";
import { useStudioAssistant } from "../../hooks/useStudioAssistant";
import { useStudioSession } from "../../hooks/useStudioSession";

type Screen = "capture" | "agent" | "live";

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
];

export function ScribeScreen({ sessionId, onBack }: ScribeScreenProps) {
  const dispatch = useAppDispatch();
  const session = useAppSelector(selectSessionById(sessionId));
  const [screen, setScreen] = useState<Screen>("capture");
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);

  // The assistant hook is mounted at the screen level so a cleanup run that
  // completes BEFORE the user switches to the Agent tab still gets the
  // refreshed `cleaned_transcripts` named context on the next turn. We also
  // use its `send` to fire the post-recording review turn from the toast.
  const { refreshContext, send } = useStudioAssistant(sessionId);

  // Recording is a session-global concern (capturable from any mode), so the
  // control lives in the header and its state is read here. The capture
  // screen keeps its own full-size transport.
  const recorder = useStudioSession({ sessionId });

  // Offer to send a just-finished recording to the agent for review — as a
  // toast (no dedicated header/strip row), available from any mode.
  const wasRecording = useRef(false);
  useEffect(() => {
    if (wasRecording.current && !recorder.isOwnedRecording) {
      toast("Recording added", {
        description: "Send it to the agent to update the working document?",
        action: {
          label: "Send",
          onClick: () => void send(REVIEW_MESSAGE),
        },
      });
    }
    wasRecording.current = recorder.isOwnedRecording;
  }, [recorder.isOwnedRecording, send]);

  const recordingBlocked =
    recorder.isAnyRecording && !recorder.isOwnedRecording;

  const menuItems: ActionSheetItem[] = [
    {
      key: "cleanup",
      label: "Clean up transcripts",
      description: "AI cleanup of every recording in this session",
      icon: <Wand2 className="h-4 w-4" />,
      onSelect: () => setCleanupOpen(true),
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
    void dispatch(fetchRecordingSegmentsThunk({ sessionId }));
    void dispatch(fetchRawSegmentsThunk({ sessionId }));
    void dispatch(fetchCleanedSegmentsThunk({ sessionId }));
    void dispatch(fetchStudioDocumentsThunk({ sessionId }));
  }, [sessionId, dispatch]);

  return (
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
          <div className="hidden min-w-0 flex-1 sm:block">
            {session ? (
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
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* Recording control — inline, session-global. Tap to start; while
              recording it pulses red and stops. */}
          <button
            type="button"
            onClick={
              recorder.isOwnedRecording
                ? recorder.stop
                : () => void recorder.start()
            }
            disabled={recordingBlocked}
            aria-label={
              recorder.isOwnedRecording ? "Stop recording" : "Add recording"
            }
            className={cn(
              "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
              recorder.isOwnedRecording
                ? "bg-red-500 text-white active:scale-95"
                : recordingBlocked
                  ? "cursor-not-allowed text-muted-foreground"
                  : "text-foreground active:bg-accent",
            )}
          >
            {recorder.isOwnedRecording ? (
              <>
                {!recorder.isPaused && (
                  <span
                    aria-hidden
                    className="absolute inset-0 animate-ping rounded-full bg-red-500/40"
                  />
                )}
                <Square className="relative h-4 w-4 fill-current" />
              </>
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

      {/* Body */}
      <main className="min-h-0 flex-1">
        {screen === "capture" && <ScribeCaptureScreen sessionId={sessionId} />}
        {screen === "agent" && <AssistantScreen sessionId={sessionId} />}
        {screen === "live" && <ScribeLiveScreen sessionId={sessionId} />}
      </main>

      <ActionSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title={session?.title || "Session"}
        items={menuItems}
      />
      <CleanupSheet
        sessionId={sessionId}
        open={cleanupOpen}
        onOpenChange={setCleanupOpen}
        onPersisted={refreshContext}
      />
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
        }}
      />
    </div>
  );
}
