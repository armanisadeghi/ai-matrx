/**
 * canvasSource — what "Source" means for a canvas item.
 *
 * THE DEFECT THIS KILLS (independent live review, production 2026-09-14):
 * clicking `Source` on the docked canvas printed the REDUX ITEM verbatim to
 * the user —
 *
 *   {"type":"sandbox","data":{"sandboxRowId":"9aa2f6a6-…","fallbackName":"sbx-…"},
 *    "metadata":{"title":"Sandbox","conversationId":"bb458c1e-…","sourceMessageId":"sandbox:…"}}
 *
 * — a developer envelope (session pointers, message ids, internal keys) shipped
 * as a user-facing tab on a LIVE pane that has no source at all.
 *
 * The rule, one place:
 *   1. `Source` shows the ITEM'S OWN SOURCE — the document's markdown, the
 *      artifact's code, the structured artifact's markdown export. Never the
 *      canvas envelope, never `metadata`.
 *   2. A type with no meaningful source does not OFFER the tab. Live panes
 *      (sandbox, cloud browser, the document workspace, the ephemeral code
 *      editors) hold a pty, a browser session or their own editor — there is
 *      nothing to print, so `Preview`/`Source` is not a choice they have.
 *   3. The raw envelope stays where it belongs: the admin-only artifact debug
 *      panel (`CanvasArtifactDebugPanel`), behind the Bug toggle.
 *
 * PURE — no React, no Redux, no IO. `CanvasSourceView` owns pointer
 * resolution and presentation.
 */

import {
  NON_PERSISTABLE_CANVAS_TYPES,
  type CanvasContent,
} from "@/features/canvas/redux/canvasSlice";
import {
  artifactContentToMarkdown,
  kindValueToMarkdown,
} from "@/features/canvas/export/exportArtifactMarkdown";
import { isJsonObject } from "@/types/json";

/** The source text plus the language a viewer should highlight it as. */
export interface CanvasSourceText {
  text: string;
  /** A fence language — `markdown`, `html`, `svg`, `mermaid`, `tsx`, … */
  language: string;
}

/**
 * Passthrough surfaces: the canvas shows someone else's rendering (a remote
 * page, a bitmap). There is no authored text behind them.
 */
const PASSTHROUGH_TYPES: ReadonlySet<string> = new Set(["image", "iframe"]);

/**
 * NON_PERSISTABLE pointer types that nevertheless have a REAL authored source
 * of their own, read from the row they point at rather than from the canvas
 * envelope. A cloud document is the case: it is non-persistable because the
 * editor owns its own snapshot history, but its markdown is exactly what a
 * person means by "Source". `CanvasSourceView` resolves it.
 */
const SOURCE_BEARING_POINTER_TYPES: ReadonlySet<string> = new Set([
  "udt_document",
]);

/**
 * Types whose payload IS code/markup — print it as itself, not as markdown.
 * Value = the fence language.
 */
const CODE_LANGUAGE_BY_TYPE: Readonly<Record<string, string>> = {
  html: "html",
  svg: "svg",
  mermaid: "mermaid",
  react: "tsx",
  diff: "diff",
  code: "text",
};

/**
 * Does this content type offer a `Source` view at all?
 *
 * Static, type-only and synchronous ON PURPOSE: the header must decide whether
 * the switcher exists before any pointer resolves, or the control appears and
 * disappears under the user's cursor.
 *
 * FALSE for live panes (they hold a running session, not a document) and for
 * passthrough surfaces (someone else's rendering).
 */
export function canvasTypeHasSource(type: string): boolean {
  if (PASSTHROUGH_TYPES.has(type)) return false;
  if (SOURCE_BEARING_POINTER_TYPES.has(type)) return true;
  // Every other non-persistable type is a LIVE surface — a pty, a browser
  // session, an in-place editor. Printing its canvas envelope is exactly the
  // defect above.
  if (NON_PERSISTABLE_CANVAS_TYPES.has(type)) return false;
  return true;
}

function languageForType(type: string): string {
  return CODE_LANGUAGE_BY_TYPE[type] ?? "markdown";
}

/**
 * The source of a payload that is already resolved — a session item's
 * `content.data`, or a persisted row's stored `data`.
 *
 * Returns `null` when there is genuinely nothing to show, so the caller can
 * say so honestly instead of printing an envelope.
 */
export function resolveCanvasSourceFromData(
  data: unknown,
  type: string,
): CanvasSourceText | null {
  if (data === null || data === undefined || data === "") return null;

  const language = languageForType(type);

  if (typeof data === "string") {
    const text =
      language === "markdown"
        ? artifactContentToMarkdown(data, type)
        : data;
    return text.trim() ? { text, language } : null;
  }

  // `code` artifacts travel as `{ code, language }`.
  if (isJsonObject(data) && typeof data.code === "string") {
    const codeLanguage =
      typeof data.language === "string" && data.language.trim()
        ? data.language
        : "text";
    return data.code.trim()
      ? { text: data.code, language: codeLanguage }
      : null;
  }

  if (isJsonObject(data)) {
    // A structured (zero-loss `__kind`) payload: its SOURCE is the markdown the
    // kind registry exports — the same text "Copy as markdown" hands out.
    const text = kindValueToMarkdown(data as Record<string, unknown>, type);
    return text.trim() ? { text, language: "markdown" } : null;
  }

  return null;
}

/**
 * The source of a canvas item that is NOT a pointer (no persisted row to read).
 * Pointer-backed items resolve their row first — see `CanvasSourceView`.
 */
export function resolveCanvasSource(
  content: CanvasContent,
): CanvasSourceText | null {
  if (!canvasTypeHasSource(content.type)) return null;
  return resolveCanvasSourceFromData(content.data, content.type);
}
