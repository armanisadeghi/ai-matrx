"use client";

// features/vision-interview/components/RoleStrip.tsx
//
// Room presence: who is in the room, who is on this stage, who has spoken,
// and who is speaking RIGHT NOW. Six avatar discs (chart-token accents),
// the active speaker carries an accent halo with a CSS-only ping, roles that
// finished this round get a subtle check dot, and roles outside the current
// stage dim. The right side narrates the room's real state — never a
// spinner (CLAUDE.md § A SPINNER IS NEVER THE ANSWER).

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveSpeaker,
  selectRoleActivity,
  selectRoomSession,
  selectRunPhase,
} from "../redux/vision-interview.slice";
import { ROLE_ORDER, ROLES, STAGES } from "../types";
import { RoleAvatar } from "./RoleAvatar";

export function RoleStrip() {
  const activeSpeaker = useAppSelector(selectActiveSpeaker);
  const roleActivity = useAppSelector(selectRoleActivity);
  const session = useAppSelector(selectRoomSession);
  const runPhase = useAppSelector(selectRunPhase);

  const stageRoles = session ? (STAGES[session.stage]?.activeRoles ?? []) : [];
  const speaking = activeSpeaker ? ROLES[activeSpeaker] : null;
  const working = runPhase === "running" || runPhase === "starting";

  return (
    <div className="flex items-center gap-2 border-b border-border bg-background/80 px-3 py-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
        {ROLE_ORDER.map((key) => {
          const role = ROLES[key];
          const isActive = activeSpeaker === key;
          const isDone = roleActivity[key] === "done" && !isActive;
          const inStage = stageRoles.includes(key);
          return (
            <span
              key={key}
              className="relative inline-flex shrink-0"
              title={`${role.name} — ${role.description}`}
            >
              <RoleAvatar
                role={key}
                speaking={isActive}
                dimmed={!inStage && !isActive && !isDone}
              />
              {isDone && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full border border-background bg-muted"
                  aria-hidden
                >
                  <Check className="h-2 w-2 text-muted-foreground" />
                </span>
              )}
            </span>
          );
        })}
        {speaking && (
          <span
            className={cn(
              "ml-1 hidden shrink-0 text-xs font-medium sm:inline",
              speaking.accent.text,
            )}
          >
            {speaking.name}
          </span>
        )}
      </div>
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        {speaking ? (
          <>
            <span
              className={cn(
                "inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-current",
                speaking.accent.text,
              )}
              aria-hidden
            />
            {speaking.name} is speaking
          </>
        ) : runPhase === "waiting_human" ? (
          <span className="font-medium text-primary">Your turn</span>
        ) : working ? (
          <>
            <span
              className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-primary"
              aria-hidden
            />
            The room is working
          </>
        ) : runPhase === "complete" ? (
          "Interview complete"
        ) : null}
      </span>
    </div>
  );
}
