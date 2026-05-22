"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Mic, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectSessionById } from "../../redux/selectors";
import { activeSessionIdSet } from "../../redux/slice";
import {
  fetchCleanedSegmentsThunk,
  fetchRawSegmentsThunk,
  fetchRecordingSegmentsThunk,
  fetchStudioDocumentsThunk,
} from "../../redux/thunks";
import { EditableSessionTitle } from "../EditableSessionTitle";
import { MobileCaptureScreen } from "./MobileCaptureScreen";
import { AssistantScreen } from "./AssistantScreen";

type Screen = "capture" | "assistant";

interface MobileStudioScreenProps {
  sessionId: string;
  onBack?: () => void;
}

export function MobileStudioScreen({
  sessionId,
  onBack,
}: MobileStudioScreenProps) {
  const dispatch = useAppDispatch();
  const session = useAppSelector(selectSessionById(sessionId));
  const [screen, setScreen] = useState<Screen>("capture");

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
        </div>
      </header>

      {/* Body */}
      <main className="min-h-0 flex-1">
        {screen === "capture" ? (
          <MobileCaptureScreen sessionId={sessionId} />
        ) : (
          <AssistantScreen sessionId={sessionId} />
        )}
      </main>
    </div>
  );
}
