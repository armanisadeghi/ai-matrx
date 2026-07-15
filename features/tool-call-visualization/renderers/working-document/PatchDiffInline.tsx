"use client";

/**
 * PatchDiffInline — the human, animated diff/content view for a `ctx_patch`
 * write (the working document AND any other ctx text key). Works BOTH live and
 * on reload.
 *
 * DESIGN — "the seamless piece of paper" (owner-specified, 2026-07-14):
 * the body renders as ONE full-width sheet of paper: a subtle background +
 * hairline border that reads as a document, nothing else. NO header row, NO
 * icon, NO command badge, NO card-within-a-card — the shell's folded line
 * already says "Updated working document". The document IS the visualization.
 *
 * DIFF INTELLIGENCE: users want to see the document with the changed areas
 * highlighted — not pluses and minuses. And when the edit is effectively a
 * rewrite there is nothing meaningful to highlight, so:
 *   • before is empty (overwrite / append / first write), OR
 *   • ≥90% of the resulting lines changed
 * → show the FINAL content plainly, no diff markup at all.
 *
 * Data model (unchanged): an agent patch arrives WHOLE the instant the tool
 * starts — `entry.arguments` carries `old_str`/`new_str` (or a whole new
 * body), so the entire diff is known immediately. Live renders animate the
 * replacement filling in (`AnimatedDiffReveal`); persisted renders show the
 * final diff at once. The live working doc reconciles to the server's
 * authoritative content when the post-write re-read lands.
 *
 * The diff engine is the canonical `components/diff` engine (`computeTextDiff`)
 * — never a hand-rolled or GitHub-style side-by-side.
 */

import React, { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectWorkingDocContent } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import { selectIsLatestToolActivity } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { AnimatedDiffReveal } from "@/components/diff/text/AnimatedDiffReveal";
import { computeTextDiff } from "@/components/diff/text/engine/computeTextDiff";
import { WORKING_DOCUMENT_CONTEXT_KEY } from "@/features/agents/utils/workingDocumentContext";

import type { ToolRendererProps } from "../../types";
import { getArg, isTerminal } from "../_shared";
import type { WorkingDocPatchArgs } from "./applyWorkingDocPatch";
import {
  deriveWorkingDocDiffFrame,
  STRUCTURAL_PATCH_COMMANDS,
} from "@/features/agents/redux/execution-system/instance-working-document/workingDocPatchDiff";

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

/** Above this fraction of changed lines, a "diff" is really a rewrite. */
const REWRITE_RATIO = 0.9;

/**
 * True when highlighting would be noise: no prior text, or ≥90% of the
 * resulting document's lines changed. In both cases the final content alone
 * is the honest display.
 */
function isEffectivelyRewrite(before: string, after: string): boolean {
  if (before.trim().length === 0) return true;
  const { stats } = computeTextDiff(before, after);
  const changed = stats.additions + stats.modifications;
  const total = changed + stats.unchanged;
  return total > 0 && changed / total >= REWRITE_RATIO;
}

/**
 * The paper sheet — the ONE frame this renderer draws. It must read as a
 * physical page sitting on the chat background: a slightly different surface
 * tone + hairline border, full conversation width, and DOCUMENT-scale type
 * (13px — quieter than the message text around it, never louder).
 */
const Paper: React.FC<{ attached?: boolean; children: React.ReactNode }> = ({
  attached,
  children,
}) => (
  <div
    className={cn(
      "max-h-96 w-full overflow-auto border border-border/50 bg-card px-5 py-4 shadow-xs",
      // Attached: this sheet continues the ArtifactResultBar header above it —
      // square top, no top border, one continuous surface.
      attached ? "rounded-b-xl rounded-t-none border-t-0" : "rounded-xl",
    )}
  >
    {children}
  </div>
);

/** Document-scale typography shared by both paper bodies. */
const PAPER_TEXT = "text-[13px] leading-relaxed";

export const PatchDiffInline: React.FC<ToolRendererProps> = (props) => {
  const { entry, isPersisted, conversationId, requestId, attached } = props;

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
    // Shared derivation — the SAME `before → after` the drawer's live diff uses,
    // so the inline message and the drawer can never disagree. Single-patch here
    // (one entry per inline renderer); the drawer folds the whole turn.
    const frame = deriveWorkingDocDiffFrame({
      frozenBefore,
      patches: [readPatchArgs(entry.arguments)],
      serverContent: liveCurrent,
      reconcile: isTerminal(entry),
    });
    before = frame.before;
    after = frame.after;
  } else if (typeof newStr === "string") {
    // Persisted / general — accurate from args, which survive reload.
    after = newStr;
    // str_replace → diff the removed section against its replacement.
    // overwrite / append / prepend / insert → no prior in the args; the
    // rewrite rule below shows the new body plainly.
    before = typeof oldStr === "string" ? oldStr : "";
  }

  // Structural (json_*) or text-less patch → compact summary, never a spinner.
  const isStructural = command !== null && STRUCTURAL_PATCH_COMMANDS.has(command);
  const hasText = after !== null && before !== null;

  if (isStructural || !hasText) {
    return (
      <p className="text-xs text-muted-foreground">
        {isStructural
          ? "Structured update applied."
          : isTerminal(entry)
            ? "Updated."
            : "Updating…"}
      </p>
    );
  }

  const rewrite = isEffectivelyRewrite(before as string, after as string);

  return (
    <Paper attached={attached}>
      {rewrite ? (
        // Full rewrite (or fresh body): the final document, no highlights.
        <div className={`whitespace-pre-wrap break-words text-foreground ${PAPER_TEXT}`}>
          {after}
        </div>
      ) : (
        <AnimatedDiffReveal
          before={before as string}
          after={after as string}
          reveal={{ active: animate, replayKey: entry.callId }}
          className={PAPER_TEXT}
        />
      )}
    </Paper>
  );
};

export default PatchDiffInline;
