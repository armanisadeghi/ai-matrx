"use client";

import { Mic, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createSessionThunk } from "../redux/thunks";

interface EmptySessionStateProps {
  className?: string;
  onSessionCreated?: (sessionId: string) => void;
  navigateToSession?: (sessionId: string | null) => void;
}

export function EmptySessionState({
  className,
  onSessionCreated,
  navigateToSession,
}: EmptySessionStateProps) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);

  const handleCreate = async () => {
    if (!userId) return;
    const result = await dispatch(
      createSessionThunk({
        userId,
        activate: !navigateToSession,
      }),
    );
    if (createSessionThunk.fulfilled.match(result) && result.payload?.id) {
      navigateToSession?.(result.payload.id);
      onSessionCreated?.(result.payload.id);
    }
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-textured p-8 text-center",
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Mic className="h-6 w-6" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Transcript Studio</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          A four-column workspace for live transcription, cleanup, concept
          extraction, and a pluggable module column.
        </p>
      </div>
      <button
        type="button"
        onClick={handleCreate}
        disabled={!userId}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          userId
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-muted text-muted-foreground cursor-not-allowed",
        )}
      >
        <Plus className="h-4 w-4" />
        Start a new session
      </button>
    </div>
  );
}
