// features/context-menu-v3/utils/json-menu-actions.ts
//
// The JSON section of the universal context menu. Highlight something that
// looks like JSON — fenced or bare — and the menu offers the things you
// actually want for JSON: condense it, squeeze it onto one line, open it back
// up, sort its keys, add or strip the code fence.
//
// Design rules:
//   - The menu ASKS the engine, it does not sniff. Detection and formatting
//     both come from `lib/json-format` (the shared primitive), so the notes
//     cleanup pass and this menu can never disagree about what "condensed"
//     means.
//   - Every action carries a REAL before/after hint ("13 lines -> 3 lines"),
//     computed from the actual formatted output. No action promises a change
//     it will not make: one that would be a no-op is dropped.
//   - On an EDITABLE surface the action rewrites the text in place (the exact
//     selection when there is one, the whole field otherwise). On a read-only
//     surface it copies the formatted text instead — the same intent, the only
//     verb available.
//   - Unparseable-but-JSON-shaped text still produces a section: one disabled
//     row carrying the parse error. Silently showing nothing on a selection
//     the user clearly believes is JSON is the "fake menu" failure this
//     codebase kills on sight.
//
// Pure except for the two side-effect callbacks handed in by the hook.

import { detectJson } from "@/lib/json-format/detect";
import { formatJsonText } from "@/lib/json-format/format";
import type {
  JsonDetection,
  JsonFenceMode,
  JsonFormatStyle,
} from "@/lib/json-format/types";

export interface JsonMenuAction {
  id: string;
  label: string;
  /** Real before -> after size, e.g. "13 lines -> 3 lines". */
  hint?: string;
  disabled?: boolean;
  run: () => void | Promise<void>;
}

export interface JsonMenuSection {
  /** The detection that produced this section (null when the text isn't JSON-ish). */
  detection: JsonDetection;
  /** True when the surface will rewrite text; false when actions copy instead. */
  writes: boolean;
  actions: JsonMenuAction[];
}

export interface BuildJsonMenuActionsParams {
  /** The text the menu is acting on (selection, else resolved content). */
  text: string;
  /** True when the action should REWRITE the text rather than copy it. */
  canWrite: boolean;
  /** Rewrite the acted-on text with `next`. Only called when `canWrite`. */
  onReplace: (next: string) => void;
  /** Copy `next` to the clipboard. Used on read-only surfaces. */
  onCopy: (next: string) => void | Promise<void>;
}

function lineCount(text: string): number {
  let n = text === "" ? 0 : 1;
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") n++;
  return n;
}

function sizeHint(before: string, after: string): string {
  const b = lineCount(before);
  const a = lineCount(after);
  if (b !== a) {
    return `${b} line${b !== 1 ? "s" : ""} -> ${a} line${a !== 1 ? "s" : ""}`;
  }
  return `${before.length} -> ${after.length} chars`;
}

/**
 * The style that preserves the user's rough layout — used by actions whose
 * point is NOT re-layout (sort keys, fence toggling). Re-printing a hand-
 * formatted blob as something else because the user asked to sort its keys is
 * a change they did not request.
 */
function shapePreservingStyle(detection: JsonDetection): JsonFormatStyle {
  return detection.payload.includes("\n") ? "pretty" : "minify";
}

/**
 * Build the JSON section for the given text, or `null` when the text is not
 * JSON-shaped at all (the overwhelmingly common case — the section simply
 * does not render).
 */
export function buildJsonMenuSection(
  params: BuildJsonMenuActionsParams,
): JsonMenuSection | null {
  const { text, canWrite, onReplace, onCopy } = params;
  if (!text.trim()) return null;

  const detection = detectJson(text);
  if (!detection.looksLikeJson) return null;

  // JSON-shaped but broken: one honest, disabled row.
  if (!detection.ok) {
    return {
      detection,
      writes: false,
      actions: [
        {
          id: "json-invalid",
          label: "Invalid JSON",
          hint: detection.error,
          disabled: true,
          run: () => {},
        },
      ],
    };
  }

  const apply = (next: string) => {
    if (canWrite) onReplace(next);
    else void onCopy(next);
  };

  const verb = canWrite ? "" : "Copy ";
  const actions: JsonMenuAction[] = [];

  const addFormat = (
    id: string,
    label: string,
    style: JsonFormatStyle,
    fence: JsonFenceMode = "preserve",
    sortKeys = false,
  ) => {
    const result = formatJsonText(text, { style, fence, sortKeys });
    if (!result.ok) return;
    // Copying an identical string is still useful; rewriting it is not.
    if (canWrite && !result.changed) return;
    actions.push({
      id,
      label,
      hint: result.changed ? sizeHint(text, result.text) : undefined,
      run: () => apply(result.text),
    });
  };

  addFormat("json-condense", `${verb}Condense`, "compact");
  addFormat("json-minify", `${verb}Minify (one line)`, "minify");
  addFormat("json-expand", `${verb}Expand`, "pretty");
  addFormat(
    "json-sort-keys",
    `${verb}Sort keys A-Z`,
    shapePreservingStyle(detection),
    "preserve",
    true,
  );

  // Fence toggle — only the direction that applies.
  if (detection.fence) {
    addFormat(
      "json-strip-fence",
      `${verb}Remove code fence`,
      shapePreservingStyle(detection),
      "strip",
    );
  } else {
    addFormat(
      "json-add-fence",
      `${verb}Wrap in json code fence`,
      shapePreservingStyle(detection),
      "add",
    );
  }

  // An editable surface still benefits from a plain "give me the one-liner on
  // the clipboard" that does NOT touch the document.
  if (canWrite) {
    const minified = formatJsonText(text, { style: "minify", fence: "strip" });
    if (minified.ok) {
      actions.push({
        id: "json-copy-minified",
        label: "Copy minified",
        hint: sizeHint(text, minified.text),
        run: () => void onCopy(minified.text),
      });
    }
  }

  if (actions.length === 0) return null;
  return { detection, writes: canWrite, actions };
}

/** Short label for the submenu trigger, e.g. "JSON · 13 lines". */
export function jsonSectionLabel(section: JsonMenuSection): string {
  const { detection } = section;
  if (!detection.ok) return "JSON (invalid)";
  const n = detection.lineCount;
  const kind = detection.root === "array" ? "array" : "object";
  return `JSON ${kind} · ${n} line${n !== 1 ? "s" : ""}`;
}
