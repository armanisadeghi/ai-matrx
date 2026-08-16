"use client";

// features/vision-interview/components/RoleStrip.tsx
//
// The subtle "who is in the room / who is speaking" strip: all six roles,
// each active / idle / done for the current round. Never a spinner — while
// the run works, the strip narrates real stages (CLAUDE.md § A SPINNER IS
// NEVER THE ANSWER).

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveSpeaker,
  selectRoleActivity,
  selectRoomSession,
  selectRunPhase,
} from "../redux/vision-interview.slice";
import { ROLE_ORDER, ROLES, STAGES } from "../types";

export function RoleStrip() {
  const activeSpeaker = useAppSelector(selectActiveSpeaker);
  const roleActivity = useAppSelector(selectRoleActivity);
  const session = useAppSelector(selectRoomSession);
  const runPhase = useAppSelector(selectRunPhase);

  const stageRoles = session ? STAGES[session.stage]?.activeRoles ?? [] : [];
  const speaking = activeSpeaker ? ROLES[activeSpeaker] : null;

  return (
    <div className="flex items-center gap-1 border-b border-border bg-background/60 px-2 py-1">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {ROLE_ORDER.map((key) => {
          const role = ROLES[key];
          const Icon = role.icon;
          const isActive = activeSpeaker === key;
          const isDone = roleActivity[key] === "done";
          const inStage = stageRoles.includes(key);
          return (
            <span
              key={key}
              title={`${role.name} — ${role.description}`}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                isActive
                  ? "border-primary bg-primary/10 text-primary"
                  : isDone
                    ? "border-border bg-muted text-foreground"
                    : inStage
                      ? "border-border text-muted-foreground"
                      : "border-transparent text-muted-foreground/50",
              )}
            >
              <Icon className="h-3 w-3" aria-hidden />
              {role.name}
              {isActive && (
                <span className="ml-0.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              )}
            </span>
          );
        })}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {speaking
          ? `${speaking.name} is speaking`
          : runPhase === "waiting_human"
            ? "Your turn"
            : runPhase === "running" || runPhase === "starting"
              ? "Working"
              : null}
      </span>
    </div>
  );
}
