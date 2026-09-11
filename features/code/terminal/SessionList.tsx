"use client";

/**
 * SessionList — VSCode-style sidebar listing the open terminal sessions.
 *
 * Renders on the right side of the bottom panel's "terminal" tab. Each row
 * is a session (shell or logs) with a kind icon, label, and a close button.
 * The "+" button at the top spawns a fresh shell tied to the active sandbox
 * (or the mock adapter when no sandbox is connected).
 */

import React, { useCallback } from "react";
import { Plus, X, TerminalSquare, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  addSession,
  removeSession,
  selectActiveSessionId,
  selectAllSessions,
  setActiveSession,
  type TerminalSession,
} from "../redux/terminalSessionsSlice";
import { ACTIVE_ROW } from "../styles/tokens";
import { selectActiveSandboxId } from "../redux/codeWorkspaceSlice";

interface SessionListProps {
  className?: string;
}

const KIND_LABEL: Record<TerminalSession["kind"], string> = {
  shell: "Shell",
  logs: "Logs",
};

export const SessionList: React.FC<SessionListProps> = ({ className }) => {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector(selectAllSessions);
  const activeId = useAppSelector(selectActiveSessionId);
  const activeSandboxId = useAppSelector(selectActiveSandboxId);

  const handleAddShell = useCallback(() => {
    const idx = sessions.filter((s) => s.kind === "shell").length + 1;
    dispatch(
      addSession({
        kind: "shell",
        label: `Shell ${idx}`,
        sandboxId: activeSandboxId ?? null,
      }),
    );
  }, [activeSandboxId, dispatch, sessions]);

  const handleAddLogs = useCallback(() => {
    if (!activeSandboxId) return;
    dispatch(
      addSession({
        kind: "logs",
        label: "Logs",
        sandboxId: activeSandboxId,
      }),
    );
  }, [activeSandboxId, dispatch]);

  return (
    <div
      className={cn(
        "flex h-auto max-h-40 w-full shrink-0 flex-col border-t border-border bg-muted/30 lg:h-full lg:max-h-none lg:w-36 lg:border-l lg:border-t-0",
        className,
      )}
    >
      <div className="flex min-h-11 lg:min-h-7 shrink-0 items-center justify-between border-b border-border px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Terminals</span>
        <div className="flex items-center gap-0.5">
          {activeSandboxId && (
            <button
              type="button"
              onClick={handleAddLogs}
              title="New logs viewer"
              className="flex h-11 w-11 lg:h-6 lg:w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ScrollText size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={handleAddShell}
            title="New shell"
            className="flex h-11 w-11 lg:h-6 lg:w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="px-2 py-2 text-[11px] text-neutral-500 dark:text-neutral-400">
            No terminals open. Click + to start a shell.
          </div>
        ) : (
          <ul className="py-1">
            {sessions.map((s) => {
              const isActive = s.id === activeId;
              const Icon = s.kind === "logs" ? ScrollText : TerminalSquare;
              return (
                <li
                  key={s.id}
                  className={cn(
                    "group flex items-center",
                    isActive && ACTIVE_ROW,
                  )}
                >
                  <button
                    type="button"
                    onClick={() => dispatch(setActiveSession(s.id))}
                    title={`${KIND_LABEL[s.kind]} · ${s.label}`}
                    className={cn(
                      "flex min-h-11 lg:min-h-7 min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left text-xs",
                      isActive
                        ? "text-accent-foreground"
                        : "text-foreground hover:bg-accent",
                    )}
                  >
                    <Icon size={12} className="shrink-0 opacity-70" />
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Close ${s.label}`}
                    title="Close terminal"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch(removeSession(s.id));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        dispatch(removeSession(s.id));
                      }
                    }}
                    className="ml-0.5 flex h-11 w-11 lg:h-7 lg:w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <X size={11} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default SessionList;
