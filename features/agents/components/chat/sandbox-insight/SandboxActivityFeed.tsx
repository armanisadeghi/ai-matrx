"use client";

/**
 * SandboxActivityFeed — "what has the agent actually done inside the box?"
 *
 * One line per sandbox tool call, oldest → newest: the tool, its subject (the
 * command, or the path), how it ended (exit code / failed / still running),
 * how long it took, and the output on expand. It is the transcript's sandbox
 * work, extracted and put in one place — reading the SAME tool calls the
 * thread renders from (`sandbox-activity.ts` merges the live lifecycle map
 * with the persisted `cx_tool_call` rows), never a second data path.
 */

import React from "react";
import { AlertTriangle, ChevronRight, Loader2, Terminal } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectToolCallsForConversation } from "@/features/agents/redux/execution-system/observability/observability.selectors";
import { selectLiveToolLifecycleByConversation } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import {
  buildSandboxActivity,
  type SandboxActivityRow,
} from "./sandbox-activity";
import { DURABLE_VFS_BADGE_TEXT } from "@/features/tool-call-visualization/renderers/shell/ShellInline";

function formatDuration(ms: number | null): string | null {
  if (ms === null) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

const ActivityRow: React.FC<{ row: SandboxActivityRow }> = ({ row }) => {
  const [open, setOpen] = React.useState(false);
  const duration = formatDuration(row.durationMs);
  const body = row.output ?? row.errorMessage;
  const failed = row.status === "failed";

  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent/40"
      >
        <ChevronRight
          className={cn(
            "mt-0.5 size-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs text-foreground">
            {row.subject ?? row.toolName}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            <span>{row.toolName}</span>
            {row.exitCode !== null && (
              <span
                data-testid="activity-exit-code"
                className={cn(
                  "tabular-nums",
                  failed && "font-medium text-red-600 dark:text-red-400",
                )}
              >
                exit {row.exitCode}
              </span>
            )}
            {row.status === "running" && (
              <span className="flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" />
                running
              </span>
            )}
            {failed && row.exitCode === null && (
              <span className="font-medium text-red-600 dark:text-red-400">
                failed
              </span>
            )}
            {duration && <span className="tabular-nums">{duration}</span>}
            {row.backend && row.backend !== "durable_vfs" && (
              <span>{row.backend}</span>
            )}
          </p>
          {row.backend === "durable_vfs" && (
            <p
              role="alert"
              className="mt-1 flex items-start gap-1 text-[11px] font-medium text-red-600 dark:text-red-400"
            >
              <AlertTriangle className="mt-px size-3 shrink-0" />
              {DURABLE_VFS_BADGE_TEXT}
            </p>
          )}
        </div>
      </button>
      {open && (
        <pre className="max-h-64 overflow-auto whitespace-pre border-t border-border/30 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground">
          {body && body.trim() !== "" ? body : "No output."}
        </pre>
      )}
    </div>
  );
};

export function SandboxActivityFeed({
  conversationId,
}: {
  conversationId: string;
}) {
  const records = useAppSelector(
    selectToolCallsForConversation(conversationId),
  );
  const live = useAppSelector(
    selectLiveToolLifecycleByConversation(conversationId),
  );
  const rows = buildSandboxActivity(records, live);

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Terminal className="size-5 text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">
          No sandbox work yet
        </p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Every command the agent runs and every file it reads or writes in this
          box will appear here as it happens.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" data-testid="sandbox-activity-feed">
      {rows.map((row) => (
        <ActivityRow key={row.callId} row={row} />
      ))}
    </div>
  );
}
