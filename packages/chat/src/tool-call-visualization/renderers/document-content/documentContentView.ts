import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { getArg, resultAsObject } from "../_shared";

/**
 * The ONE resolver for "which view of the document did `document_content`
 * return?". The registry header and `DocumentContentInline` both dispatch on
 * this — two independent copies of the mapping would drift the first time the
 * wire changes (it already changed once, on 2026-07-18).
 *
 * ─── The wire, and why this is not a straight arg read ──────────────────────
 *
 * The 2026-07-18 knowledge-family consolidation replaced the `representation`
 * ARGUMENT with `action` (+ `format` for text):
 *
 *   representation="clean"            → action="read",  format="clean"
 *   representation="raw"              → action="read",  format="raw"
 *   representation="pages"            → action="page_index"
 *   representation="knowledge_assets" → action="assets"
 *   representation="pdf"              → action="images"
 *
 * The tool's INTERNALS and its OUTPUT deliberately kept the old vocabulary —
 * aidream `document_content_tool.py` still emits `"representation": <clean|raw|
 * pdf>`. But it emits it for the `read` and `images` actions ONLY: the
 * `page_index` and `assets` payloads carry no `representation` key at all. So
 * neither source alone is sufficient — reading the result key alone would send
 * every page-index and assets call to the plain-text body.
 *
 * Resolution order:
 *   1. `action` (the current, required wire arg) — authoritative.
 *      For `read`, a `representation` in the RESULT wins over the requested
 *      `format`, because the server falls back clean→raw when no clean text
 *      exists and reports the effective value there.
 *   2. `representation` in the result — covers a row whose args are missing.
 *   3. `representation` in the args — persisted tool calls from BEFORE the
 *      rename. Old conversations must keep rendering correctly.
 */
export type DocumentContentView =
  | "clean"
  | "raw"
  | "pages"
  | "knowledge_assets"
  | "pdf";

const VIEWS: readonly DocumentContentView[] = [
  "clean",
  "raw",
  "pages",
  "knowledge_assets",
  "pdf",
];

const ACTION_TO_VIEW: Record<string, DocumentContentView> = {
  page_index: "pages",
  assets: "knowledge_assets",
  images: "pdf",
};

function asView(v: unknown): DocumentContentView | null {
  return typeof v === "string" && (VIEWS as readonly string[]).includes(v)
    ? (v as DocumentContentView)
    : null;
}

export function resolveDocumentContentView(
  entry: ToolLifecycleEntry,
): DocumentContentView {
  const result = resultAsObject(entry);
  const resultView = asView(result?.representation);
  const action = getArg<unknown>(entry, "action");

  if (typeof action === "string") {
    if (action === "read") {
      // The server reports the EFFECTIVE format here (clean can fall back to
      // raw); the requested `format` is only the ask.
      if (resultView === "clean" || resultView === "raw") return resultView;
      const format = getArg<unknown>(entry, "format");
      return format === "raw" ? "raw" : "clean";
    }
    const mapped = ACTION_TO_VIEW[action];
    if (mapped) return mapped;
  }

  if (resultView) return resultView;

  // Pre-rename persisted calls.
  const legacy = asView(getArg<unknown>(entry, "representation"));
  if (legacy) return legacy;

  return "clean";
}
