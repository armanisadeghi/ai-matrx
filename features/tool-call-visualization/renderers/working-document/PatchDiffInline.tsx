"use client";

/**
 * PatchDiffInline — the human-friendly diff/content view for a `ctx_patch`
 * write. Works BOTH live and on reload (the old working-doc-only renderer
 * showed nothing after reload), for the working document AND any other ctx key.
 *
 * What the user sees: a beautiful boxed component with the new content — and,
 * when there's a before to compare, a HUMAN diff (the new text shown whole,
 * only the changed parts tinted, unchanged text plain, an insert NOT marking
 * everything as changed). The geeky id/command extras fold into a small header.
 * A "Changes" / "Result" toggle flips between the highlight diff and the
 * rendered markdown of the new content.
 *
 * before / after sourcing:
 *   - LIVE working-doc: BEFORE = the doc content frozen the moment the patch
 *     begins (a ref, so the post-completion re-read can't clobber it); AFTER =
 *     the patch applied locally (optimistic, `applyWorkingDocPatch`) until the
 *     server's authoritative content lands. → a FULL-document diff.
 *   - PERSISTED / general: the args are the source of truth and survive reload.
 *     str_replace → BEFORE = `old_str`, AFTER = `new_str` (the changed section,
 *     always accurate, any point in history). overwrite/append/insert → no
 *     before, so render the new content (markdown).
 *
 * The diff engine is the canonical `components/diff` highlight view (line + word
 * LCS, classifies inserts correctly) — NOT the deprecated react-diff-viewer.
 *
 * NOTE: the patch arrives WHOLE at `tool_started` (the backend doesn't yet
 * stream argument deltas), so this renders the content/diff the instant it
 * lands rather than token-by-token. True token streaming needs an aidream
 * change to emit incremental `new_str` fragments; the contract here is ready
 * for it (it re-diffs on every `entry` change).
 */

import React, { useRef, useState } from "react";
import { FileText, Loader2, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectWorkingDocContent } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import { DiffViewer } from "@/components/diff/DiffViewer";
import MarkdownStream from "@/components/MarkdownStream";
import { WORKING_DOCUMENT_CONTEXT_KEY } from "@/features/agents/utils/workingDocumentContext";

import type { ToolRendererProps } from "../../types";
import { getArg, isTerminal } from "../_shared";
import { humanizeKey } from "../../result-fields/shape";
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

const SCROLL = "max-h-96 overflow-auto rounded-md border border-border";

export const PatchDiffInline: React.FC<ToolRendererProps> = (props) => {
  const { entry, isPersisted, conversationId } = props;

  const key = (getArg<string>(entry, "key") ?? "").trim();
  const command = getArg<string>(entry, "command") ?? null;
  const newStr = getArg<string>(entry, "new_str");
  const oldStr = getArg<string>(entry, "old_str");
  const running = !isTerminal(entry);
  const isWorkingDoc = key === WORKING_DOCUMENT_CONTEXT_KEY;
  const live = !isPersisted && !!conversationId && isWorkingDoc;

  // Live working-doc content (unconditional hook; safe key when not live).
  const liveCurrent = useAppSelector(
    selectWorkingDocContent(conversationId ?? ""),
  );
  // Freeze BEFORE the first time we see content in the live path.
  const beforeRef = useRef<string | null>(null);
  if (live && beforeRef.current === null) beforeRef.current = liveCurrent;

  let before: string | null = null;
  let after: string | null = null;
  if (live) {
    before = beforeRef.current ?? "";
    const applied = applyWorkingDocPatch(before, readPatchArgs(entry.arguments));
    const serverChanged = isTerminal(entry) && liveCurrent !== before;
    after = serverChanged ? liveCurrent : applied.ok ? applied.next : null;
  } else {
    // Persisted / general — accurate from the args, which survive reload.
    after = typeof newStr === "string" ? newStr : null;
    // str_replace → diff old_str→new_str (the changed section). overwrite /
    // append / insert have no old_str → diff against empty so the highlight
    // view shows the whole new content as added (the new content, persisted).
    before = after !== null ? (typeof oldStr === "string" ? oldStr : "") : null;
  }

  const hasDiff = before !== null && after !== null && before !== after;
  const label = isWorkingDoc
    ? "Working document"
    : key
      ? humanizeKey(key)
      : "Context";

  const [view, setView] = useState<"changes" | "result">("changes");
  const effectiveView = hasDiff ? view : "result";

  let body: React.ReactNode;
  if (effectiveView === "changes" && hasDiff) {
    body = (
      <div className={SCROLL}>
        <DiffViewer
          engine="light"
          view="highlight"
          showToolbar={false}
          wrap
          original={before as string}
          modified={after as string}
        />
      </div>
    );
  } else if (after) {
    body = (
      <div className={cn(SCROLL, "bg-background p-2.5 text-sm text-foreground")}>
        <MarkdownStream content={after} isStreamActive={false} />
      </div>
    );
  } else {
    body = (
      <p className="text-xs text-muted-foreground">
        {running ? "Updating document…" : "Updated."}
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3 animate-in fade-in">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm text-foreground">{label}</span>
        {command && (
          <Badge variant="secondary" className="font-mono font-normal">
            {command}
          </Badge>
        )}
        {hasDiff ? (
          <div className="ml-auto flex overflow-hidden rounded border border-border text-xs">
            {(["changes", "result"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setView(v);
                }}
                className={cn(
                  "px-2 py-0.5 capitalize transition-colors",
                  effectiveView === v
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        ) : (
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
        )}
      </div>
      {body}
    </div>
  );
};

export default PatchDiffInline;
