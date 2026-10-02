/**
 * Editor Resource XML — serialization for code-editor resource pills.
 *
 * These resources (`editor_error`, `editor_code_snippet`) round-trip via
 * **XML embedded in the user message text**, not via structured ContentBlocks.
 * That's deliberate: storing the rendered representation in the message body
 * means the message displays identically whether it's freshly sent (from the
 * resource pills slice) or reloaded from the DB (parsed back from XML).
 *
 * Schema:
 *   <editor_error file="…" line="…" severity="…" source="…" code="…">
 *     <message>…</message>
 *     <surrounding_code>…</surrounding_code>
 *   </editor_error>
 *
 *   <editor_code_snippet file="…" language="…" range="…">
 *     …code…
 *   </editor_code_snippet>
 *
 * The chat-markdown renderer recognizes both tags and renders chips. Any text
 * content embedded inside is XML-escaped on serialize and unescaped on parse.
 */

import type { ManagedResource } from "@/features/agents/types/instance.types";

// =============================================================================
// Source shapes
// =============================================================================

/** Source payload for an `editor_error` resource. */
export interface EditorErrorSource {
  /** Tab/file path (display label). */
  file: string;
  /** 1-based line number where the diagnostic starts. */
  line: number;
  /** End line (1-based). May equal `line` for single-line diagnostics. */
  endLine?: number;
  /** Monaco severity name. */
  severity: "error" | "warning" | "info" | "hint";
  /** Diagnostic source ("typescript", "eslint", etc.). */
  source?: string;
  /** Diagnostic code (e.g. TS2322). */
  code?: string | number;
  /** The diagnostic message. */
  message: string;
  /** Optional snippet of surrounding code for context. */
  surroundingCode?: string;
  /** Editor language ID (`typescript`, `python`, etc.) — for syntax highlight in surrounding code. */
  language?: string;
}

/** Source payload for an `editor_code_snippet` resource. */
export interface EditorCodeSnippetSource {
  /** Tab/file path (display label). */
  file: string;
  /** Editor language ID. */
  language: string;
  /** 1-based start line. */
  startLine: number;
  /** 1-based end line. */
  endLine: number;
  /** The selected text. */
  text: string;
}

// =============================================================================
// XML escape / unescape
// =============================================================================

const XML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

const XML_UNESCAPE_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

/** Escape a string for safe inclusion in XML attribute values or text content. */
export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML_ESCAPE_MAP[c] ?? c);
}

/** Inverse of escapeXml. */
export function unescapeXml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_UNESCAPE_MAP[m] ?? m);
}

function escapeAttr(value: string | number | undefined): string {
  if (value === undefined || value === null) return "";
  return escapeXml(String(value));
}

// =============================================================================
// Serialize a single editor resource
// =============================================================================

/**
 * Convert one editor-type ManagedResource to an XML string. Returns null when
 * the resource isn't an editor type (caller should ignore those — they go on
 * the structured-block path).
 */
export function serializeEditorResourceToXml(
  resource: ManagedResource,
): string | null {
  switch (resource.blockType) {
    case "editor_error": {
      const src = resource.source as Partial<EditorErrorSource> | null;
      if (!src) return null;
      const attrs = [
        `file="${escapeAttr(src.file)}"`,
        `line="${escapeAttr(src.line)}"`,
        src.endLine !== undefined && src.endLine !== src.line
          ? `end_line="${escapeAttr(src.endLine)}"`
          : null,
        `severity="${escapeAttr(src.severity ?? "error")}"`,
        src.source ? `source="${escapeAttr(src.source)}"` : null,
        src.code !== undefined ? `code="${escapeAttr(src.code)}"` : null,
        src.language ? `language="${escapeAttr(src.language)}"` : null,
      ]
        .filter(Boolean)
        .join(" ");
      const messageXml = `<message>${escapeXml(src.message ?? "")}</message>`;
      const surroundingXml = src.surroundingCode
        ? `\n  <surrounding_code>${escapeXml(src.surroundingCode)}</surrounding_code>`
        : "";
      return `<editor_error ${attrs}>\n  ${messageXml}${surroundingXml}\n</editor_error>`;
    }
    case "editor_code_snippet": {
      const src = resource.source as Partial<EditorCodeSnippetSource> | null;
      if (!src) return null;
      const attrs = [
        `file="${escapeAttr(src.file)}"`,
        `language="${escapeAttr(src.language ?? "plaintext")}"`,
        `range="L${escapeAttr(src.startLine)}-L${escapeAttr(src.endLine)}"`,
      ].join(" ");
      return `<editor_code_snippet ${attrs}>\n${escapeXml(src.text ?? "")}\n</editor_code_snippet>`;
    }
    default:
      return null;
  }
}

/**
 * Concatenate all editor-type resources for a conversation into one XML
 * string (one resource per block, separated by blank lines). Returns the
 * empty string when there are none — caller can append unconditionally.
 */
export function serializeEditorResourcesAsXml(
  resources: readonly ManagedResource[],
): string {
  const out: string[] = [];
  for (const r of resources) {
    const xml = serializeEditorResourceToXml(r);
    if (xml) out.push(xml);
  }
  return out.join("\n\n");
}

/**
 * Returns true if the resource's blockType is one that serializes to XML
 * (editor pills) rather than to a structured ContentBlock.
 */
export function isEditorXmlResource(resource: ManagedResource): boolean {
  return (
    resource.blockType === "editor_error" ||
    resource.blockType === "editor_code_snippet"
  );
}
