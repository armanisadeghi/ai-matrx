/**
 * applyWorkingDocPatch — pure, optimistic local application of a `ctx_patch`
 * operation against the CURRENT working-document text.
 *
 * The agent's patch arrives complete at `tool_started` (no char streaming), so
 * we can compute an instant before→after locally for snappy feedback while the
 * server's authoritative re-read is still in flight. A slightly-different local
 * fuzzy match is acceptable — the renderer reconciles to the server result on
 * completion (see PatchDiffInline).
 *
 * Text-shaped commands (str_replace / append / prepend / overwrite / insert)
 * produce a meaningful diff. Structural commands (json_patch / json_merge)
 * can't be text-diffed, so they return ok:false and the caller shows a summary
 * until the server truth lands.
 *
 * Mirrors the backend `ctx_patch` command vocabulary; reuses the shared fuzzy
 * matcher (`matchText`) rather than reinventing match logic.
 */

import { matchText } from "@/features/text-diff/lib/matchText";

/** The `ctx_patch` command vocabulary (mirrors the backend). */
export type WorkingDocPatchCommand =
  | "str_replace"
  | "insert"
  | "append"
  | "prepend"
  | "overwrite"
  | "json_patch"
  | "json_merge";

/** The subset of `ctx_patch` arguments this pure function reads. */
export interface WorkingDocPatchArgs {
  command?: string | null;
  old_str?: string | null;
  new_str?: string | null;
  separator?: string | null;
  operations?: unknown;
}

export interface WorkingDocPatchResult {
  /** The optimistic next content. Equals `current` when `ok` is false. */
  next: string;
  /** The [start, end) span of the change in `next`, when locatable. */
  matchedRange: { start: number; end: number } | null;
  /** True when we could apply the patch to text meaningfully. */
  ok: boolean;
}

function unchanged(current: string): WorkingDocPatchResult {
  return { next: current, matchedRange: null, ok: false };
}

/**
 * Apply a single `ctx_patch` operation to `current` text optimistically.
 * Never throws; defensive on missing fields (→ ok:false, next=current).
 */
export function applyWorkingDocPatch(
  current: string,
  args: WorkingDocPatchArgs,
): WorkingDocPatchResult {
  const command = (args.command ?? "").trim() as WorkingDocPatchCommand | "";
  const base = typeof current === "string" ? current : "";

  switch (command) {
    case "str_replace": {
      const oldStr = args.old_str;
      const newStr = args.new_str ?? "";
      if (typeof oldStr !== "string" || oldStr.length === 0) {
        return unchanged(base);
      }
      const match = matchText(base, oldStr);
      if (
        !match.found ||
        match.startIndex === undefined ||
        match.endIndex === undefined
      ) {
        return unchanged(base);
      }
      const next =
        base.slice(0, match.startIndex) + newStr + base.slice(match.endIndex);
      return {
        next,
        matchedRange: {
          start: match.startIndex,
          end: match.startIndex + newStr.length,
        },
        ok: true,
      };
    }

    case "append": {
      const newStr = args.new_str;
      if (typeof newStr !== "string") return unchanged(base);
      const sep = typeof args.separator === "string" ? args.separator : "";
      const start = base.length + sep.length;
      const next = base + sep + newStr;
      return { next, matchedRange: { start, end: next.length }, ok: true };
    }

    case "prepend": {
      const newStr = args.new_str;
      if (typeof newStr !== "string") return unchanged(base);
      const sep = typeof args.separator === "string" ? args.separator : "";
      const next = newStr + sep + base;
      return {
        next,
        matchedRange: { start: 0, end: newStr.length },
        ok: true,
      };
    }

    case "overwrite": {
      const newStr = args.new_str;
      if (typeof newStr !== "string") return unchanged(base);
      return {
        next: newStr,
        matchedRange: { start: 0, end: newStr.length },
        ok: true,
      };
    }

    case "insert": {
      // No reliable anchor in the patch args → best-effort append so the new
      // text still streams in. The server reconciles the exact position.
      const newStr = args.new_str;
      if (typeof newStr !== "string") return unchanged(base);
      const sep = typeof args.separator === "string" ? args.separator : "";
      const start = base.length + sep.length;
      const next = base + sep + newStr;
      return { next, matchedRange: { start, end: next.length }, ok: true };
    }

    case "json_patch":
    case "json_merge":
      // Structural edits can't be text-diffed meaningfully — defer to the
      // server result; the caller shows a summary in the meantime.
      return unchanged(base);

    default:
      return unchanged(base);
  }
}
