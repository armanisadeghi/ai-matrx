"use client";

/**
 * PatchDiffInline — the human, animated diff/content view for a `ctx_patch`
 * write (the working document AND any other ctx text key). Works BOTH live and
 * on reload.
 *
 * The owner's model, implemented literally: an agent patch arrives WHOLE the
 * instant the tool starts — `entry.arguments` carries the exact text being
 * removed (`old_str`) and replacing it (`new_str`), or a whole new body
 * (overwrite/append/insert). So the ENTIRE diff is known immediately; there is
 * nothing to wait for. We:
 *   1. render the diff INSTANTLY from the args (never wait for completion);
 *   2. show it HUMAN — the removed span struck/destructive, the inserted span
 *      success, surrounding text plain (an insert does NOT mark the rest);
 *   3. when LIVE, animate the replacement filling into place (a snappy paced
 *      reveal — `AnimatedDiffReveal` / `useDiffReveal`), since `new_str` doesn't
 *      token-stream from the backend; persisted/reloaded shows the final diff at
 *      once (no animation);
 *   4. for the live working doc, RECONCILE to the server's authoritative content
 *      when the post-write re-read lands ("refresh just in case we got it
 *      wrong") — the optimistic local apply is replaced by the server truth.
 *
 * The diff engine is the canonical `components/diff` engine (`computeTextDiff` +
 * word/char segments) — never a hand-rolled or GitHub-style side-by-side.
 *
 * before / after sourcing:
 *   - LIVE working-doc: BEFORE = the doc content frozen the moment the patch
 *     begins (a ref, so the post-completion re-read can't clobber it); AFTER =
 *     the patch applied locally (optimistic, `applyWorkingDocPatch`) until the
 *     server's authoritative content lands, then the server content. → a full
 *     document diff that reconciles.
 *   - PERSISTED / general: the args are the source of truth and survive reload.
 *     str_replace → BEFORE = `old_str`, AFTER = `new_str`. overwrite → AFTER =
 *     the whole new body diffed against the prior (one big insert). append /
 *     prepend / insert → the added span against the base.
 */

import React, { useMemo, useState } from "react";
import { FileText } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectWorkingDocContent } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import { selectIsLatestToolActivity } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { AnimatedDiffReveal } from "@/components/diff/text/AnimatedDiffReveal";
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

const SCROLL = "max-h-96 overflow-auto rounded-md border border-border bg-background px-3 py-2.5";

/** Commands that produce no text diff → a clean compact summary, not a spinner. */
const STRUCTURAL = new Set(["json_patch", "json_merge"]);

export const PatchDiffInline: React.FC<ToolRendererProps> = (props) => {
  const { entry, isPersisted, conversationId, requestId } = props;

  const key = (getArg<string>(entry, "key") ?? "").trim();
  const command = (getArg<string>(entry, "command") ?? "").trim() || null;
  const newStr = getArg<string>(entry, "new_str");
  const oldStr = getArg<string>(entry, "old_str");
  const isWorkingDoc = key === WORKING_DOCUMENT_CONTEXT_KEY;
  const live = !isPersisted && !!conversationId && isWorkingDoc;

  // Live working-doc content (unconditional hook; safe key when not live).
  const liveCurrent = useAppSelector(
    selectWorkingDocContent(conversationId ?? ""),
  );
  // Freeze the BEFORE once, at mount — the doc content the moment the patch
  // begins. A lazy initializer captures it without reading a ref during render,
  // and it survives the post-write re-read that later mutates `liveCurrent`.
  // (Only meaningful in the live path; harmless otherwise.)
  const [frozenBefore] = useState(() => liveCurrent);

  // Animate while this is the stream's latest activity OR still running —
  // exactly the canonical search/scrape gating. Persisted snapshots and the
  // simulator (no requestId) fall back to the entry's own status.
  const isLatestActivity = useAppSelector(
    useMemo(
      () =>
        requestId
          ? selectIsLatestToolActivity(requestId, entry.callId)
          : () => false,
      [requestId, entry.callId],
    ),
  );
  const animate = !isPersisted && (!isTerminal(entry) || isLatestActivity);

  // ── Resolve before / after ────────────────────────────────────────────────
  let before: string | null = null;
  let after: string | null = null;
  if (live) {
    before = frozenBefore;
    const applied = applyWorkingDocPatch(before, readPatchArgs(entry.arguments));
    // RECONCILE: once the tool completes and the server re-read has changed the
    // doc, render the server's authoritative content (so a slightly-off
    // optimistic apply is corrected). Until then, the optimistic result.
    const serverChanged = isTerminal(entry) && liveCurrent !== before;
    after = serverChanged ? liveCurrent : applied.ok ? applied.next : null;
  } else if (typeof newStr === "string") {
    // Persisted / general — accurate from args, which survive reload.
    after = newStr;
    if (typeof oldStr === "string") {
      // str_replace → diff the removed section against its replacement.
      before = oldStr;
    } else {
      // overwrite / append / prepend / insert → one big insert vs the prior. We
      // have no prior here (args don't carry the whole-doc base), so diff
      // against empty → the whole new body shows as added (a clean insert).
      before = "";
    }
  }

  const label = isWorkingDoc
    ? "Working document"
    : key
      ? humanizeKey(key)
      : "Context";

  // Structural (json_*) or text-less patch → compact summary, never a spinner.
  const isStructural = command !== null && STRUCTURAL.has(command);
  const hasText = after !== null && before !== null;

  let body: React.ReactNode;
  if (isStructural || !hasText) {
    body = (
      <p className="text-xs text-muted-foreground">
        {isStructural
          ? "Structured update applied."
          : isTerminal(entry)
            ? "Updated."
            : "Updating…"}
      </p>
    );
  } else {
    body = (
      <div className={SCROLL}>
        <AnimatedDiffReveal
          before={before as string}
          after={after as string}
          reveal={{ active: animate, replayKey: entry.callId }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3 animate-in fade-in">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm text-foreground">{label}</span>
        {command && (
          <Badge variant="secondary" className="ml-auto font-mono font-normal">
            {command}
          </Badge>
        )}
      </div>
      {body}
    </div>
  );
};

export default PatchDiffInline;
