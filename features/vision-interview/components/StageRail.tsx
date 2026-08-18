"use client";

// features/vision-interview/components/StageRail.tsx
//
// THE WIZARD. The v2 stage arc rendered as big, legible buttons — each step
// carries its leading role's icon AND the step name AND a one-line hint,
// together, never separated (Arman, 2026-08-18: the tiny dim chips with the
// icons floating elsewhere were rejected outright). This is the primary
// navigation of the whole experience, not a breadcrumb.
//
// Clicking a stage sends a resume with `goto_stage` — a jump to ANY stage,
// forward or back. Jumps arm ONLY while the run is waiting_human (the resume
// payload is the only way a directive reaches the run); disabled states carry
// an honest tooltip, never a silent no-op. Stage keys never render raw —
// labels come from STAGES.

import { useState } from "react";
import { Check, ChevronRight, MessagesSquare, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectRoomSession,
  selectRunPhase,
} from "../redux/vision-interview.slice";
import {
  normalizeStage,
  ROLES,
  STAGE_ORDER,
  STAGES,
  type InterviewStage,
} from "../types";

interface StageRailProps {
  onGotoStage: (stage: InterviewStage) => Promise<void>;
}

export function StageRail({ onGotoStage }: StageRailProps) {
  const session = useAppSelector(selectRoomSession);
  const runPhase = useAppSelector(selectRunPhase);
  const [jumping, setJumping] = useState<InterviewStage | null>(null);

  if (!session) return null;

  const current = normalizeStage(session.stage);
  const steps = STAGE_ORDER.filter((s) => s !== "done");
  const isDone = current === "done";
  const currentIdx = isDone ? steps.length : steps.indexOf(current);
  const canJump = runPhase === "waiting_human";

  const jump = async (stage: InterviewStage) => {
    if (!canJump || jumping) return;
    setJumping(stage);
    try {
      await onGotoStage(stage);
    } finally {
      setJumping(null);
    }
  };

  return (
    <div className="flex shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-border bg-background/80 px-2 py-1.5 sm:px-3">
      {steps.map((key, idx) => {
        const meta = STAGES[key];
        const isCurrent = idx === currentIdx && !isDone;
        const isPast = idx < currentIdx || isDone;
        const role = meta.primaryRole ? ROLES[meta.primaryRole] : null;
        const Icon = role?.icon ?? MessagesSquare;
        const leader = role ? role.name : "Most eager voice";
        const title = isCurrent
          ? `${meta.label} — the room is here now (${leader} leads). ${meta.hint}.`
          : canJump
            ? `Jump to ${meta.label} — ${leader} leads. ${meta.hint}.`
            : `${meta.label}: ${meta.hint}. Jumps happen on your turn — the room will hand back shortly.`;
        return (
          <span key={key} className="flex shrink-0 items-center">
            {idx > 0 && (
              <ChevronRight
                className="mx-0.5 h-4 w-4 shrink-0 text-muted-foreground/50"
                aria-hidden
              />
            )}
            <button
              type="button"
              disabled={!canJump || isCurrent || jumping !== null}
              onClick={() => void jump(key)}
              title={title}
              aria-label={
                isCurrent ? `Current step: ${meta.label}` : `Jump to ${meta.label}`
              }
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "group flex min-w-[7.5rem] items-center gap-2.5 rounded-lg border px-3 py-1.5 text-left transition-colors",
                isCurrent
                  ? "border-primary/40 bg-primary/10 shadow-sm"
                  : isPast
                    ? "border-transparent bg-transparent"
                    : "border-transparent bg-transparent",
                canJump && !isCurrent && "hover:border-border hover:bg-accent",
                jumping === key && "animate-pulse",
              )}
            >
              <span
                className={cn(
                  "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  role ? role.accent.avatar : "bg-muted text-muted-foreground",
                  isCurrent && "ring-2 ring-offset-1 ring-offset-background",
                  isCurrent && role?.accent.ring,
                  !isCurrent && !isPast && "opacity-80",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {isPast && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-2.5 w-2.5" aria-hidden />
                  </span>
                )}
              </span>
              <span className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    "text-sm font-semibold leading-tight",
                    isCurrent ? "text-foreground" : "text-foreground/80",
                  )}
                >
                  {meta.label}
                </span>
                <span
                  className={cn(
                    "truncate text-[11px] leading-tight",
                    isCurrent ? (role?.accent.text ?? "text-primary") : "text-muted-foreground",
                  )}
                >
                  {isCurrent ? `${leader} is with you` : leader}
                </span>
              </span>
            </button>
          </span>
        );
      })}
      {isDone && (
        <span className="ml-1 flex shrink-0 items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Trophy className="h-4 w-4" aria-hidden />
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold leading-tight text-foreground">
              Done
            </span>
            <span className="text-[11px] leading-tight text-muted-foreground">
              Your vision, delivered
            </span>
          </span>
        </span>
      )}
    </div>
  );
}
