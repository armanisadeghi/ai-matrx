/**
 * SURFACE WRITE PATCH — the anchored edit for a text write target.
 *
 * ## Why this exists
 *
 * Every text write target in the manifest set is a WHOLE-VALUE replacement:
 * the tool carries one `value` and the page handler takes what it is given.
 * For a short field (`agent_name`) that is exactly right. For a long one it is
 * a tax that gets paid in tokens and in risk — changing one sentence of a
 * 45,000-character system prompt meant re-transmitting all 45,000 characters,
 * where every one of them is a chance to silently drop a paragraph the model
 * never meant to touch.
 *
 * The workaround the repo reached for first was a SECOND TARGET
 * (`append_system_instruction` beside `system_instruction`). That buys append
 * and nothing else: there is no hand-written target shape that expresses
 * "replace this sentence", and adding one per field per operation multiplies
 * the manifest without ever covering the case.
 *
 * So the edit is expressed as a PATCH against the target's current text, and
 * resolved to a whole string HERE, at the seam, before anything downstream
 * looks at it. That ordering is the whole design:
 *
 *   patch → [resolve here] → value contract → approval card → page handler
 *
 * Downstream is unchanged and unaware. The kind contract still validates a
 * final value, the approval card still diffs a real before→after (which is why
 * `approvalComparison: "text-replacement"` keeps working, and in fact reads
 * better), and every page handler keeps its `(value: string)` signature. No
 * handler in the repo changes to gain patch support.
 *
 * ## Why this is not `applyWorkingDocPatch`
 *
 * `features/tool-call-visualization/.../applyWorkingDocPatch.ts` applies the
 * same `ctx_patch` vocabulary, and the overlap is deliberate — both mirror the
 * backend so the model writes one shape everywhere. It is NOT reused here
 * because it is documented as OPTIMISTIC: it exists to paint a fast local
 * preview that the server's authoritative result later reconciles. Two of its
 * compromises are correct there and unacceptable in a real write:
 *
 *  - `insert` with no anchor best-effort APPENDS. In a preview that is a
 *    cosmetic guess the server corrects a moment later; in a write it would
 *    silently put the model's text somewhere it did not ask for, and nothing
 *    downstream would ever correct it.
 *  - every failure collapses to `ok: false` with no reason, because the
 *    renderer only needs to know to fall back. A write has to tell the model
 *    WHICH anchor missed and whether it missed by being absent or by being
 *    ambiguous, or the model cannot fix its own call.
 *
 * What genuinely is shared is the matcher — `matchText`, the one fuzzy
 * anchor-finder in the repo (exact pass, then a whitespace-insensitive pass),
 * including its refusal to guess when a pattern matches more than once. That
 * is the part that must never fork, and it does not.
 *
 * The vocabulary here is therefore the SAFE SUBSET of `ctx_patch`: the four
 * commands whose meaning against a plain string is unambiguous. `insert`
 * (needs an anchor this envelope has no room for) and `json_patch` /
 * `json_merge` (structural, meaningless against text) are refused by name
 * rather than approximated, so a model that reaches for one is told to use
 * `str_replace` instead of quietly getting an append.
 */

import { matchText } from "@/features/text-diff/lib/matchText";

/**
 * The commands a surface text patch may use — the subset of the backend
 * `ctx_patch` vocabulary that is unambiguous against a plain string.
 */
export const SURFACE_PATCH_COMMANDS = [
  "str_replace",
  "append",
  "prepend",
  "overwrite",
] as const;

export type SurfaceWritePatchCommand = (typeof SURFACE_PATCH_COMMANDS)[number];

/** Commands the backend vocabulary has that a text target deliberately refuses. */
const REFUSED_COMMANDS: Record<string, string> = {
  insert:
    'needs an anchor this envelope cannot carry, and approximating it as an append would put your text somewhere you did not ask for. Use "str_replace" with the surrounding text as old_str.',
  json_patch:
    'is a structural edit and this target holds text. Use "str_replace" or "overwrite".',
  json_merge:
    'is a structural edit and this target holds text. Use "str_replace" or "overwrite".',
};

/** The patch envelope an agent sends as `value` for a patchable target. */
export interface SurfaceWritePatch {
  command: SurfaceWritePatchCommand;
  /** `str_replace`: the exact text to find. Must match exactly once. */
  old_str?: string;
  /** The replacement / appended / prepended text. */
  new_str?: string;
  /** `append` / `prepend`: text placed between the old and new text. */
  separator?: string;
}

export type SurfaceWritePatchOutcome =
  | {
      ok: true;
      next: string;
      matchedRange: { start: number; end: number } | null;
      /** One line for the toast and the audit trail. */
      summary: string;
    }
  | { ok: false; reason: string };

/**
 * Does this value LOOK like a patch envelope rather than a replacement value?
 *
 * Deliberately narrow: an object carrying a `command` string. A plain string
 * is never a patch, so a patchable target still accepts a whole-value write
 * unchanged — patchability ADDS an option, it never takes the simple one away.
 */
export function isSurfaceWritePatch(value: unknown): value is SurfaceWritePatch {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { command?: unknown }).command === "string"
  );
}

/** `true` when the command is one this seam will actually apply. */
function isSupportedCommand(
  command: string,
): command is SurfaceWritePatchCommand {
  return (SURFACE_PATCH_COMMANDS as readonly string[]).includes(command);
}

function refuse(reason: string): SurfaceWritePatchOutcome {
  return { ok: false, reason };
}

/**
 * Apply a patch envelope to the target's CURRENT text and return the whole
 * resulting value.
 *
 * Never throws and never silently no-ops: every path either returns the new
 * text or a `reason` written for the model that sent the patch — it names what
 * missed and what to do instead, because a refusal the caller cannot act on is
 * just a failure with better manners.
 */
export function resolveSurfaceWritePatch(
  current: unknown,
  patch: SurfaceWritePatch,
): SurfaceWritePatchOutcome {
  const command = String(patch.command ?? "").trim();

  if (command in REFUSED_COMMANDS) {
    return refuse(`Patch command "${command}" ${REFUSED_COMMANDS[command]}`);
  }
  if (!isSupportedCommand(command)) {
    return refuse(
      `Patch command "${command}" is not one this target accepts. Use one of: ${SURFACE_PATCH_COMMANDS.join(", ")}.`,
    );
  }

  // A patch edits text. A target holding null/undefined has nothing to anchor
  // against, and treating that as "" would turn a str_replace against a
  // missing document into a confusing anchor miss instead of the real problem.
  if (current === null || current === undefined) {
    if (command !== "overwrite") {
      return refuse(
        `This target currently holds no text, so there is nothing to ${command} against. Send the whole value, or use "overwrite".`,
      );
    }
  } else if (typeof current !== "string") {
    return refuse(
      `A patch only applies to a text value, and this target currently holds ${Array.isArray(current) ? "an array" : typeof current}. Send the whole value instead.`,
    );
  }

  const base = typeof current === "string" ? current : "";
  const newStr = patch.new_str;
  // A BLANK LINE IS THE DEFAULT JOIN, not "". Every patchable target today is
  // prose a person reads — a prompt, a description, a document — and gluing a
  // new paragraph onto the last word of the old one is never what was meant.
  // An explicit separator (including "") still wins, so a caller who really
  // wants no gap can say so.
  const separator = typeof patch.separator === "string" ? patch.separator : "\n\n";

  switch (command) {
    case "str_replace": {
      const oldStr = patch.old_str;
      if (typeof oldStr !== "string" || oldStr.length === 0) {
        return refuse(
          'A "str_replace" patch needs a non-empty old_str naming the exact text to replace.',
        );
      }
      if (typeof newStr !== "string") {
        return refuse(
          'A "str_replace" patch needs new_str (send an empty string to delete the matched text).',
        );
      }
      const match = matchText(base, oldStr);
      if (
        !match.found ||
        match.startIndex === undefined ||
        match.endIndex === undefined
      ) {
        // matchText's own message already distinguishes "not found" from
        // "ambiguous, N matches" — the two things the sender must tell apart.
        return refuse(
          `old_str did not resolve to exactly one place in the current text: ${match.error ?? "no match"}. Include more surrounding text so the anchor is unique.`,
        );
      }
      const next =
        base.slice(0, match.startIndex) + newStr + base.slice(match.endIndex);
      return {
        ok: true,
        next,
        matchedRange: {
          start: match.startIndex,
          end: match.startIndex + newStr.length,
        },
        summary:
          match.matchType === "exact"
            ? "replaced one exact match"
            : `replaced one ${match.matchType} match`,
      };
    }

    case "append": {
      if (typeof newStr !== "string") {
        return refuse('An "append" patch needs new_str.');
      }
      // There is no boundary to separate when the current value is empty.
      // Keeping the default blank-line join here would turn the first content
      // into a value that begins with two invisible newline bytes.
      const join = base.length === 0 ? "" : separator;
      const next = base + join + newStr;
      return {
        ok: true,
        next,
        matchedRange: { start: base.length + join.length, end: next.length },
        summary: "appended to the end",
      };
    }

    case "prepend": {
      if (typeof newStr !== "string") {
        return refuse('A "prepend" patch needs new_str.');
      }
      const join = base.length === 0 ? "" : separator;
      const next = newStr + join + base;
      return {
        ok: true,
        next,
        matchedRange: { start: 0, end: newStr.length },
        summary: "prepended to the start",
      };
    }

    case "overwrite": {
      if (typeof newStr !== "string") {
        return refuse('An "overwrite" patch needs new_str.');
      }
      return {
        ok: true,
        next: newStr,
        matchedRange: { start: 0, end: newStr.length },
        summary: "replaced the whole value",
      };
    }
  }
}

/**
 * The one sentence the injected tool spec uses to teach the patch envelope.
 *
 * Written once, here, beside the implementation that honours it — the wire
 * teaches, the seam enforces, and both read from the same file so they cannot
 * drift into describing different shapes.
 */
export function surfacePatchContractLine(): string {
  return (
    "A target marked [patchable] ALSO accepts an anchored edit instead of the " +
    "whole value, which is how you change part of a long text without " +
    "re-sending all of it: " +
    '{"command": "str_replace", "old_str": "<the exact text to find, unique>", "new_str": "<what replaces it>"}. ' +
    `Commands: ${SURFACE_PATCH_COMMANDS.join(", ")} ` +
    "(append/prepend also take an optional separator). old_str must match " +
    "exactly once — if it misses or is ambiguous the write is refused and " +
    "nothing changes, so widen the anchor and send it again. Sending a plain " +
    "string still replaces the whole value."
  );
}
