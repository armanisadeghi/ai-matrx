"use client";

// features/vision-interview/components/StageRail.tsx
//
// The v2 stage rail: every stage of the arc (Capture … Shape, Revisit)
// rendered as a clickable stepper with the current position lit. Clicking a
// stage sends a resume with `goto_stage` — a jump to ANY stage, forward or
// back. Like the Advance control, jumps arm ONLY while the run is
// waiting_human (the resume payload is the only way a directive reaches the
// run); disabled states carry an honest tooltip, never a silent no-op.
// Stage keys never render raw — labels come from STAGES.

import { useState } from "react";
import { Check } from "lucide-react";
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
  const currentIdx = current === "done" ? steps.length : steps.indexOf(current);
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
    <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-background/80 px-2 py-1">
      {steps.map((key, idx) => {
        const meta = STAGES[key];
        const isCurrent = idx === currentIdx && current !== "done";
        const isPast = idx < currentIdx;
        const primary = meta.primaryRole ? ROLES[meta.primaryRole] : null;
        const title = isCurrent
          ? `${meta.label} — the room is here now${primary ? ` (${primary.name} leads)` : ""}`
          : canJump
            ? `Jump to ${meta.label}${primary ? ` — the ${primary.name} leads` : " — the most eager voice leads"}`
            : "Stage jumps happen on your turn — wait for the room to hand back";
        return (
          <span key={key} className="flex shrink-0 items-center gap-0.5">
            {idx > 0 && <span className="h-px w-2 bg-border" aria-hidden />}
            <button
              type="button"
              disabled={!canJump || isCurrent || jumping !== null}
              onClick={() => void jump(key)}
              title={title}
              aria-label={isCurrent ? `Current stage: ${meta.label}` : `Jump to ${meta.label}`}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                isCurrent
                  ? "bg-primary/10 text-primary"
                  : isPast
                    ? "text-muted-foreground"
                    : "text-muted-foreground/60",
                canJump && !isCurrent && "hover:bg-accent hover:text-foreground",
                !canJump && !isCurrent && "cursor-default",
                jumping === key && "animate-pulse",
              )}
            >
              {isPast && (
                <Check className="h-2.5 w-2.5 text-muted-foreground" aria-hidden />
              )}
              {meta.label}
            </button>
          </span>
        );
      })}
      {current === "done" && (
        <span className="ml-1 shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
          Done
        </span>
      )}
    </div>
  );
}
