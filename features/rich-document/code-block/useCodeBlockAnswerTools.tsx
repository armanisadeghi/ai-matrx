"use client";

// features/rich-document/code-block/useCodeBlockAnswerTools.tsx
//
// The code-block host half of RC-B9: resolves the registry's `code-block-*`
// actions for one block (Open in code editor · Apply to <file> · Run · Chart)
// into CodeBlock's existing `extraMenuItems` slot, and renders what those
// actions produce UNDER the block (run output, CSV chart). CodeBlock itself is
// untouched — the wrapper that already injects "Add to conversation context"
// mounts this.
//
// The registry bridge loads after the stream settles (never in an answer's
// first paint); until then the block shows its own built-in menu.

import React, { useEffect, useState } from "react";
import { Loader2, TerminalSquare, X } from "lucide-react";
import type { MenuItem } from "@/components/official/AdvancedMenu";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { TableChartPanel } from "@/components/mardown-display/blocks/chart/TableChart";
import { parseDelimitedTable } from "@/components/mardown-display/blocks/chart/table-chart";
import type { CodeRunState } from "./code-block-context";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

type Bridge = typeof import("./code-block-registry-bridge");

export function useCodeBlockAnswerTools(args: {
  code: string;
  language: string;
  conversationId?: string | null;
  messageId?: string | null;
  isStreamActive?: boolean;
}): { items: MenuItem[]; panel: React.ReactNode } {
  const { code, language, conversationId, messageId, isStreamActive } = args;
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const isAuthenticated = useAppSelector((s) => Boolean(s.userAuth?.id));
  const organizationId = useAppSelector(selectOrganizationId);
  // Visibility inputs — re-resolve when a file tab opens or a sandbox binds.
  useAppSelector((s) => (s as unknown as { codeTabs?: { activeId: string | null } }).codeTabs?.activeId ?? null);
  useAppSelector((s) =>
    conversationId ? (s.conversations.byConversationId[conversationId]?.sandboxBinding?.rowId ?? null) : null,
  );

  const [bridge, setBridge] = useState<Bridge | null>(null);
  const [run, setRun] = useState<CodeRunState | null>(null);
  const [showChart, setShowChart] = useState(false);

  useEffect(() => {
    if (isStreamActive || bridge) return;
    let live = true;
    import("./code-block-registry-bridge")
      .then((m) => {
        if (live) setBridge(m);
      })
      .catch((err: unknown) => console.error("[code-block] answer tools failed to load", err));
    return () => {
      live = false;
    };
  }, [isStreamActive, bridge]);

  const items =
    bridge && !isStreamActive
      ? bridge.resolveCodeBlockMenuItems(
          bridge.codeBlockContext({
            facts: {
              code,
              language,
              conversationId: conversationId ?? null,
              messageId: messageId ?? null,
              onRunResult: setRun,
              onToggleChart: () => setShowChart((v) => !v),
            },
            dispatch,
            getState: store.getState,
            isAuthenticated,
            organizationId,
          }),
        )
      : [];

  const table = showChart ? parseDelimitedTable(code) : null;

  const panel = (
    <>
      {table && <TableChartPanel table={table} onClose={() => setShowChart(false)} />}
      {run && <CodeRunOutput state={run} onClose={() => setRun(null)} />}
    </>
  );
  return { items, panel };
}

function CodeRunOutput({ state, onClose }: { state: CodeRunState; onClose: () => void }) {
  const failed = state.status === "error" || (state.status === "done" && state.result.exitCode !== 0);
  return (
    <div
      className="my-2 overflow-hidden rounded-lg border border-border bg-card text-sm"
      role="region"
      aria-label="Run output"
      aria-live="polite"
      data-find-ignore=""
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-1">
        <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          {state.status === "running" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          ) : (
            <TerminalSquare className={failed ? "h-3.5 w-3.5 text-destructive" : "h-3.5 w-3.5 text-primary"} />
          )}
          {state.status === "running" && "Running in the sandbox…"}
          {state.status === "error" && "The sandbox could not run this"}
          {state.status === "done" &&
            `Exit ${state.result.exitCode} · ${state.result.durationMs} ms · ${state.result.command}`}
        </span>
        {state.status !== "running" && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close output"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {state.status === "error" && <p className="px-3 py-2 text-xs text-destructive">{state.message} <ErrorAlchemyMenu error={state.message} /></p>}
      {state.status === "done" && (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs text-foreground">
          {state.result.stdout}
          {state.result.stderr && <span className="text-destructive">{state.result.stderr}</span>}
          {!state.result.stdout && !state.result.stderr && (
            <span className="text-muted-foreground">(no output)</span>
          )}
        </pre>
      )}
    </div>
  );
}
