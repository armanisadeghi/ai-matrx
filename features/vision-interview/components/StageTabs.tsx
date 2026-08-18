"use client";

// features/vision-interview/components/StageTabs.tsx
//
// The v3 room's stage tabs — the bar across the top of the CENTRE panel.
// ONE tab per stage that has a primary role (capture · ground · enhance ·
// articulate · stress · shape), and one tab IS one expert IS one ordinary
// agent conversation.
//
// Arman's rejection (2026-08-18) that shaped this: tiny dim chips with the
// icon floating apart from the name. So every tab is a substantial button —
// the role's Lucide icon in its accent disc, the role NAME and the stage
// label together, the live tab clearly lit and its expert named.

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import {
  activeRoleTabChanged,
  selectActiveRoleTab,
  selectRoleBindings,
  selectRoomSession,
} from "../redux/vision-interview.slice";
import {
  normalizeStage,
  ROLES,
  ROLE_TABS,
  STAGES,
  roleBinding,
  type RoleKey,
} from "../types";

export function StageTabs({ className }: { className?: string }) {
  const dispatch = useAppDispatch();
  const activeRole = useAppSelector(selectActiveRoleTab);
  const session = useAppSelector(selectRoomSession);
  // Server-resolved bindings merged over the session row — the tab is "joined"
  // the instant `/roles` lands, without waiting on a realtime echo.
  const roleBindings = useAppSelector(selectRoleBindings);
  const currentStage = session ? normalizeStage(session.stage) : null;

  const select = (role: RoleKey) => {
    if (role !== activeRole) dispatch(activeRoleTabChanged(role));
  };

  return (
    <div
      role="tablist"
      aria-label="The room's experts"
      className={cn(
        "flex shrink-0 flex-wrap items-stretch gap-1 border-b border-border bg-card px-2 py-2",
        className,
      )}
    >
      {ROLE_TABS.map(({ stage, role }) => {
        const meta = ROLES[role];
        const Icon = meta.icon;
        const isActive = role === activeRole;
        const isCurrentStage = stage === currentStage;
        const hasJoined = roleBinding({ role_bindings: roleBindings }, role) !== null;
        return (
          <button
            key={role}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => select(role)}
            title={meta.description}
            className={cn(
              "group flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1 text-left transition-colors",
              isActive
                ? "border-border bg-muted shadow-sm"
                : "border-transparent hover:border-border hover:bg-muted/60",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                meta.accent.avatar,
                isActive && `ring-2 ${meta.accent.ring}`,
                !isActive && !hasJoined && "opacity-60",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="flex flex-col leading-tight">
              <span
                className={cn(
                  "text-[13px] font-semibold leading-tight",
                  isActive ? meta.accent.text : "text-foreground",
                )}
              >
                {meta.name}
              </span>
              <span className="text-[10px] leading-tight text-muted-foreground">
                {STAGES[stage].label}
                {isCurrentStage ? " · now" : ""}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
