"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Mic,
  MoreVertical,
  Pencil,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
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
import { useStudioAssistant } from "../../hooks/useStudioAssistant";

type Screen = "capture" | "assistant";

interface ScribeScreenProps {
  sessionId: string;
  onBack?: () => void;
}

export function ScribeScreen({ sessionId, onBack }: ScribeScreenProps) {
  const dispatch = useAppDispatch();
  const session = useAppSelector(selectSessionById(sessionId));
  const [screen, setScreen] = useState<Screen>("capture");
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);

  // The assistant hook is mounted at the screen level so a cleanup run that
  // completes BEFORE the user switches to the Assistant tab still gets the
  // refreshed `cleaned_transcripts` named context on the next turn.
  const { refreshContext } = useStudioAssistant(sessionId);

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
          <div className="min-w-0 flex-1">
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
          {/* Segmented toggle */}
          <div className="flex shrink-0 rounded-full bg-muted p-0.5">
            <button
              type="button"
              onClick={() => setScreen("capture")}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                screen === "capture"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              <Mic className="h-3.5 w-3.5" />
              Record
            </button>
            <button
              type="button"
              onClick={() => setScreen("assistant")}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                screen === "assistant"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Assistant
            </button>
          </div>
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
        {screen === "capture" ? (
          <ScribeCaptureScreen sessionId={sessionId} />
        ) : (
          <AssistantScreen sessionId={sessionId} />
        )}
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
