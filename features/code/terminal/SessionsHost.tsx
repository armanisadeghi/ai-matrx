"use client";

/**
 * SessionsHost — the "terminal" tab body inside the bottom panel.
 *
 * Layout: [active session viewport] | [SessionList sidebar].
 *
 * All sessions stay mounted simultaneously; only the active session is
 * visible (via `display:none` toggling). This preserves xterm scrollback
 * and the live-logs polling buffer across session switches.
 *
 * On sandbox connect (activeSandboxId transitions to a non-null id we
 * haven't auto-spawned for), this component dispatches a fresh shell + a
 * logs viewer. On disconnect, it tears down all sessions tied to the old
 * sandbox so we don't render dead PTY connections.
 */

import React, { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  addSession,
  clearSessionsForSandbox,
  selectActiveSessionId,
  selectAllSessions,
  selectLastAutoSpawnedSandboxId,
  setLastAutoSpawnedSandboxId,
} from "../redux/terminalSessionsSlice";
import { selectActiveSandboxId } from "../redux/codeWorkspaceSlice";
import { TerminalTab } from "./TerminalTab";
import { SimpleTerminal } from "./SimpleTerminal";
import { SandboxLogsView } from "./SandboxLogsView";
import { SessionList } from "./SessionList";

interface SessionsHostProps {
  className?: string;
  /** Whether the bottom-panel "terminal" tab is currently selected. Passed
   *  down so xterm can throttle redraws when invisible. */
  visible?: boolean;
}

export const SessionsHost: React.FC<SessionsHostProps> = ({
  className,
  visible = true,
}) => {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector(selectAllSessions);
  const activeId = useAppSelector(selectActiveSessionId);
  const activeSandboxId = useAppSelector(selectActiveSandboxId);
  const lastAutoSpawnedSandboxId = useAppSelector(
    selectLastAutoSpawnedSandboxId,
  );

  // Auto-spawn shell + logs on sandbox transition. Runs exactly once per
  // unique activeSandboxId (the slice tracks the last-spawned id) so HMR /
  // re-renders don't multiply terminals.
  useEffect(() => {
    if (lastAutoSpawnedSandboxId === activeSandboxId) return;

    // Sandbox switched — drop the previous sandbox's sessions. PTY
    // connections + log polls there are pointing at a container we no
    // longer have credentials / proxy URL for.
    if (lastAutoSpawnedSandboxId !== "__init__") {
      dispatch(
        clearSessionsForSandbox({
          sandboxId: lastAutoSpawnedSandboxId ?? null,
        }),
      );
    }

    // Spawn defaults for the new sandbox. Mock mode (null) gets just one
    // shell — a logs viewer doesn't make sense without a real container.
    dispatch(
      addSession({
        kind: "shell",
        label: "Shell",
        sandboxId: activeSandboxId ?? null,
        activate: true,
      }),
    );
    if (activeSandboxId) {
      dispatch(
        addSession({
          kind: "logs",
          label: "Logs",
          sandboxId: activeSandboxId,
          activate: false,
        }),
      );
    }

    dispatch(setLastAutoSpawnedSandboxId(activeSandboxId ?? null));
  }, [activeSandboxId, dispatch, lastAutoSpawnedSandboxId]);

  return (
    <div className={cn("flex h-full min-h-0", className)}>
      {/* Left: viewports for every session, only the active one visible. */}
      <div className="relative min-w-0 flex-1">
        {sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[12px] text-neutral-500 dark:text-neutral-400">
            No terminals open. Click + on the right to start a shell.
          </div>
        ) : (
          sessions.map((s) => {
            const isActive = s.id === activeId;
            return (
              <div
                key={s.id}
                aria-hidden={!isActive}
                className={cn("absolute inset-0", !isActive && "hidden")}
              >
                {s.kind === "shell" ? (
                  s.sandboxId ? (
                    <TerminalTab visible={visible && isActive} />
                  ) : (
                    <SimpleTerminal
                      sandboxId={null}
                      visible={visible && isActive}
                    />
                  )
                ) : s.sandboxId ? (
                  <SandboxLogsView
                    sandboxId={s.sandboxId}
                    visible={visible && isActive}
                  />
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Right: sidebar list of sessions. */}
      <SessionList />
    </div>
  );
};

export default SessionsHost;
