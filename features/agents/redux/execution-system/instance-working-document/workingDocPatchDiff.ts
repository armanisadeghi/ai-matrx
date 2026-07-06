/**
 * workingDocPatchDiff — the ONE derivation of a working-document `ctx_patch`
 * edit into a `before → after` diff frame, shared by every surface that shows
 * that edit: the inline tool-call message (`PatchDiffInline`) and the working-
 * document drawer (`WorkingDocumentPanel` → `useLiveWorkingDocPatch`).
 *
 * Before this existed the two surfaces each derived the diff their own way —
 * the inline renderer from the live tool args (exact, animated, reconciling)
 * and the drawer from a fuzzy "seen snapshot" heuristic (stale, non-animated,
 * often empty). Collapsing both onto this pure function is what makes them
 * structurally unable to disagree again.
 *
 * The model (identical to `PatchDiffInline`'s header): an agent patch arrives
 * WHOLE at `tool_started` — `arguments` carries the exact `old_str`/`new_str`.
 * So the entire diff is known immediately:
 *   - AFTER = the turn's patches applied optimistically over the frozen BEFORE
 *     (`applyWorkingDocPatch`), in order, until the tool completes and the
 *     server's authoritative re-read lands — then AFTER = the server content
 *     (a slightly-off optimistic apply is corrected). This is the "reconcile"
 *     step the caller signals via `reconcile`.
 *   - Structural-only edits (json_patch / json_merge) produce no text diff →
 *     `after = null`; the caller shows a compact summary instead of a spinner.
 *
 * Pure and framework-free — no React, no Redux, no diff engine. The reduce over
 * multiple patches makes a multi-patch turn read as one cumulative "what the
 * agent changed this turn" diff in the drawer, while the single-patch case is
 * byte-identical to the inline renderer's prior behavior.
 */

import {
  applyWorkingDocPatch,
  type WorkingDocPatchArgs,
} from "@/features/tool-call-visualization/renderers/working-document/applyWorkingDocPatch";

/** Commands that produce no text diff → a clean compact summary, not a spinner. */
export const STRUCTURAL_PATCH_COMMANDS = new Set(["json_patch", "json_merge"]);

export interface WorkingDocDiffFrame {
  /** The document text before the agent's edit(s). */
  before: string;
  /**
   * The document text after the agent's edit(s), or `null` when there is no
   * meaningful text diff (structural-only edit, or nothing applied). Callers
   * render a summary in the `null` case.
   */
  after: string | null;
  /** True when the (latest) command is structural (json_patch / json_merge). */
  isStructural: boolean;
  /** The latest command in the turn, for labelling. */
  command: string | null;
}

export interface DeriveWorkingDocDiffArgs {
  /** Document content frozen the instant the first patch of the turn began. */
  frozenBefore: string;
  /** The turn's patch arg sets, in stream order (one for the single-patch case). */
  patches: WorkingDocPatchArgs[];
  /** The server's authoritative current content (slice `content`). */
  serverContent: string;
  /**
   * True once the edit is settled AND the server re-read has diverged from
   * `frozenBefore` — render the server truth instead of the optimistic apply.
   */
  reconcile: boolean;
}

/**
 * Fold the turn's patches into a single before→after diff frame. Never throws;
 * defensive on empty/malformed patch sets.
 */
export function deriveWorkingDocDiffFrame(
  args: DeriveWorkingDocDiffArgs,
): WorkingDocDiffFrame {
  const { frozenBefore, patches, serverContent, reconcile } = args;
  const before = typeof frozenBefore === "string" ? frozenBefore : "";

  const command =
    patches.length > 0
      ? (patches[patches.length - 1].command ?? "")?.trim() || null
      : null;
  const isStructural = command !== null && STRUCTURAL_PATCH_COMMANDS.has(command);

  // Reconcile wins: once the server's content is authoritative and actually
  // changed, show it verbatim (even for a structural edit, which now has a
  // real text delta to render).
  if (reconcile && serverContent !== before) {
    return { before, after: serverContent, isStructural, command };
  }

  // Structural-only, not yet reconciled → no text diff to show.
  if (isStructural) {
    return { before, after: null, isStructural, command };
  }

  // Optimistic: apply each patch in order over the frozen base. A patch that
  // can't be applied (ok:false) leaves the accumulator unchanged.
  let applied = false;
  let next = before;
  for (const patch of patches) {
    const result = applyWorkingDocPatch(next, patch);
    if (result.ok) {
      next = result.next;
      applied = true;
    }
  }

  return { before, after: applied ? next : null, isStructural, command };
}
