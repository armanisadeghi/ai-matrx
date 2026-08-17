import type { ContextObjectType } from "@/features/agents/types/agent-api-types";

/**
 * Backend "rich context object" envelope — `{ content, type?, label?, … }`.
 * The agent sees `content`; the UI must unwrap it instead of JSON-dumping the
 * whole wrapper (war_room, working_document, recording_NN_*, etc.).
 */
export function unwrapRichContextValue(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "content" in value
  ) {
    const content = (value as { content: unknown }).content;
    if (content !== undefined && content !== null) return content;
  }
  return value;
}

export type ContextValueDisplayKind =
  "json" | "markdown-text" | "plain-text" | "scalar";

export function classifyContextValue(
  value: unknown,
  type: ContextObjectType,
): {
  kind: ContextValueDisplayKind;
  /** JSON-serializable payload when kind === "json". */
  data: unknown;
  /** Plain string when kind is text/scalar. */
  text: string | null;
} {
  const unwrapped = unwrapRichContextValue(value);

  if (unwrapped === undefined || unwrapped === null) {
    return { kind: "plain-text", data: null, text: null };
  }

  if (type === "file_url" && typeof unwrapped === "string") {
    return { kind: "plain-text", data: unwrapped, text: unwrapped };
  }

  if (
    type === "variable" &&
    (typeof unwrapped === "string" || typeof unwrapped === "number")
  ) {
    return { kind: "scalar", data: unwrapped, text: String(unwrapped) };
  }

  if (type === "json") {
    return { kind: "json", data: unwrapped, text: null };
  }

  if (typeof unwrapped === "object") {
    return { kind: "json", data: unwrapped, text: null };
  }

  if (typeof unwrapped === "string") {
    const trimmed = unwrapped.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return { kind: "json", data: JSON.parse(trimmed), text: null };
      } catch {
        // Not JSON — fall through to text handling.
      }
    }
    if (looksLikeMarkup(trimmed)) {
      return { kind: "plain-text", data: unwrapped, text: unwrapped };
    }
    if (type === "text") {
      return { kind: "markdown-text", data: unwrapped, text: unwrapped };
    }
    return { kind: "plain-text", data: unwrapped, text: unwrapped };
  }

  return { kind: "json", data: unwrapped, text: null };
}

function looksLikeMarkup(text: string): boolean {
  return text.startsWith("<") && text.includes(">");
}
