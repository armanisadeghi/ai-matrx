"use client";

// features/vision-interview/components/RoomHeader.tsx
//
// RouteHeader for the room: back chevron + inline-editable session title on
// the left; round chip + human-controlled "Advance stage" on the right
// (stage advancement rides the resume payload — design-doc open Q4 — so the
// control arms only while the run waits on the human). The stage POSITION
// itself lives in the full-width StageRail below the header (v2) — this
// header no longer carries a stepper or stage chip.

import { useState } from "react";
import { ArrowRight, Check, Pencil, X } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectRoomSession,
  selectRunPhase,
  sessionMerged,
} from "../redux/vision-interview.slice";
import { renameSession } from "../service";
import { normalizeStage, STAGES } from "../types";

interface RoomHeaderProps {
  onAdvanceStage: () => Promise<void>;
}

export function RoomHeader({ onAdvanceStage }: RoomHeaderProps) {
  const dispatch = useAppDispatch();
  const session = useAppSelector(selectRoomSession);
  const runPhase = useAppSelector(selectRunPhase);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [advancing, setAdvancing] = useState(false);

  const stage = session ? STAGES[normalizeStage(session.stage)] : null;
  const canAdvance =
    runPhase === "waiting_human" && stage != null && stage.next !== null;

  const commitRename = async () => {
    if (!session) return;
    const title = draft.trim();
    setEditing(false);
    if (!title || title === session.title) return;
    // Optimistic — the realtime echo is dropped by the monotonic guard.
    dispatch(
      sessionMerged({
        ...session,
        title,
        updated_at: new Date().toISOString(),
      }),
    );
    try {
      await renameSession(session.id, title);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not rename the session.",
      );
    }
  };

  return (
    <RouteHeader
      left={
        <>
          <ChevronLeftTapButton
            href="/vision-interview"
            variant="transparent"
            ariaLabel="Back to interviews"
          />
          {editing ? (
            <span className="ml-1 flex items-center gap-1">
              <Input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitRename();
                  if (e.key === "Escape") setEditing(false);
                }}
                className="h-7 w-56 text-base sm:text-sm"
                aria-label="Session title"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Save title"
                onClick={() => void commitRename()}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Cancel rename"
                onClick={() => setEditing(false)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </span>
          ) : (
            <button
              type="button"
              className="group ml-1 flex min-w-0 items-center gap-1"
              onClick={() => {
                setDraft(session?.title ?? "");
                setEditing(true);
              }}
              title="Rename"
            >
              <span className="min-w-0 truncate text-sm font-medium text-foreground">
                {session?.title ?? "Interview"}
              </span>
              <Pencil
                className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              />
            </button>
          )}
        </>
      }
      right={
        session && stage ? (
          <span className="flex items-center gap-1.5">
            {/* Round chip stays md+ only — on xs it collided with the title
                and the Advance control (Arman's screenshots, 2026-08-16).
                The stage position lives in the StageRail on every size. */}
            <span className="hidden rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground md:inline">
              Round {session.current_round}
            </span>
            {stage.next && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={!canAdvance || advancing}
                title={
                  canAdvance
                    ? `Advance to ${STAGES[stage.next].label}`
                    : "Stage advances on your turn — wait for the room to hand back"
                }
                onClick={async () => {
                  setAdvancing(true);
                  try {
                    await onAdvanceStage();
                  } finally {
                    setAdvancing(false);
                  }
                }}
                aria-label={
                  canAdvance && stage.next
                    ? `Advance to ${STAGES[stage.next].label}`
                    : "Advance stage"
                }
              >
                <span className="hidden sm:inline">Advance</span>
                <ArrowRight className="h-3 w-3 sm:ml-1" aria-hidden />
              </Button>
            )}
          </span>
        ) : null
      }
    />
  );
}
