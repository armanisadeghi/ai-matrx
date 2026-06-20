"use client";

/**
 * WorkingDocDiffInline — LIVE before→after diff for `ctx_patch` writes that
 * target the working document.
 *
 * The agent's patch lands complete at `tool_started`, so we render the diff
 * immediately:
 *   1. BEFORE  — the working-doc content at the moment the patch begins,
 *                frozen once so the post-completion re-read can't overwrite it.
 *   2. INTENDED — BEFORE with the patch applied locally (optimistic; reuses the
 *                pure `applyWorkingDocPatch`). Shown while the tool runs.
 *   3. AFTER   — once terminal, the server's authoritative content (live Redux,
 *                updated by the `context_changed` re-read) replaces INTENDED.
 *                A slightly-different local fuzzy match is fine — we reconcile.
 *
 * Structural commands (json_patch / json_merge) can't be text-diffed, so we
 * show a "Updating document…" state and, on completion, diff before→server
 * truth if it changed (else a plain "Updated" confirmation).
 *
 * Live-only: a reloaded/persisted patch has no BEFORE to freeze, so the caller
 * routes those to the simple confirmation card instead of this component.
 */

import React, { useRef } from "react";
import { FileText, Loader2, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectWorkingDocContent } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";

import type { ToolRendererProps } from "../../types";
import { getArg, isTerminal } from "../_shared";
import {
  applyWorkingDocPatch,
  type WorkingDocPatchArgs,
} from "./applyWorkingDocPatch";

function readPatchArgs(
  args: ToolRendererProps["entry"]["arguments"],
): WorkingDocPatchArgs {
  const get = (key: string): string | null => {
    const v = (args as Record<string, unknown>)[key];
    return typeof v === "string" ? v : null;
  };
  return {
    command: get("command"),
    old_str: get("old_str"),
    new_str: get("new_str"),
    separator: get("separator"),
    operations: (args as Record<string, unknown>).operations,
  };
}

interface DiffShellProps {
  command: string | null;
  running: boolean;
  children: React.ReactNode;
}

/** Header (icon + "Working document" + command badge + state hint) over content. */
const DiffShell: React.FC<DiffShellProps> = ({ command, running, children }) => (
  <div className="rounded-lg border border-border bg-card p-3 space-y-2 animate-in fade-in">
    <div className="flex items-center gap-2">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-sm text-foreground">Working document</span>
      {command && (
        <Badge variant="secondary" className="font-mono font-normal">
          {command}
        </Badge>
      )}
      <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
        {running ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Applying…
          </>
        ) : (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            Updated
          </>
        )}
      </span>
    </div>
    {children}
  </div>
);

const WorkingDocDiffInline: React.FC<ToolRendererProps> = (props) => {
  const { entry, conversationId } = props;
  const isDark = useAppSelector((s) => s.theme.mode === "dark");
  const command = getArg<string>(entry, "command") ?? null;
  const running = !isTerminal(entry);

  // Live content for this conversation. Pre-completion this is BEFORE; after the
  // server re-read it transitions to AFTER. Hooks must run unconditionally, so
  // call the selector with a safe key and guard rendering below.
  const liveCurrent = useAppSelector(
    selectWorkingDocContent(conversationId ?? ""),
  );

  // Freeze BEFORE: the first content value we observe. We capture even an empty
  // string (agent building an empty doc → all-added diff), so the ref holds a
  // definitive snapshot rather than waiting for non-empty content that may
  // never come for an overwrite-from-empty.
  const beforeRef = useRef<string | null>(null);
  if (beforeRef.current === null) {
    beforeRef.current = liveCurrent;
  }
  const before = beforeRef.current;

  // No conversation → we can't read or freeze content. Simple confirmation.
  if (!conversationId) {
    return (
      <DiffShell command={command} running={running}>
        <p className="text-xs text-muted-foreground">
          Updated working document.
        </p>
      </DiffShell>
    );
  }

  const applied = applyWorkingDocPatch(before, readPatchArgs(entry.arguments));
  const serverChanged = isTerminal(entry) && liveCurrent !== before;

  // Choose the "after" side:
  //  - terminal & server differs → server truth (authoritative reconcile)
  //  - applied locally            → optimistic intended
  //  - neither (json_*/no-match, still running) → no text diff yet
  const after = serverChanged
    ? liveCurrent
    : applied.ok
      ? applied.next
      : null;

  if (after === null) {
    // Structural patch or unlocatable match and no server delta yet.
    return (
      <DiffShell command={command} running={running}>
        <p className="text-xs text-muted-foreground">
          {running ? "Updating document…" : "Updated."}
        </p>
      </DiffShell>
    );
  }

  if (after === before) {
    // Nothing actually changed (e.g. server reconciled to identical text).
    return (
      <DiffShell command={command} running={running}>
        <p className="text-xs text-muted-foreground">Updated.</p>
      </DiffShell>
    );
  }

  return (
    <DiffShell command={command} running={running}>
      <div className="max-h-96 overflow-auto rounded-md border border-border text-xs">
        <ReactDiffViewer
          oldValue={before}
          newValue={after}
          splitView={false}
          compareMethod={DiffMethod.WORDS}
          useDarkTheme={isDark}
          hideLineNumbers
        />
      </div>
    </DiffShell>
  );
};

export default WorkingDocDiffInline;
export { WorkingDocDiffInline };
