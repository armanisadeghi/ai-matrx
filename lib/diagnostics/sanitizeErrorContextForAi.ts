/**
 * sanitizeErrorContextForAi
 *
 * Strips Next.js static chunk URL noise from captured-error exports before
 * "Copy for AI". Minified `/_next/static/chunks/*.js` frames drown out the
 * signal an agent needs (source, tier, message, relation). The Error Inspector
 * still shows full stacks in the UI; the plain "Copy" button keeps them too.
 */

/** Replace absolute/bare chunk paths with a short `[chunk:…]` token. */
export function shortenChunkPaths(text: string): string {
  return text
    .replace(
      /https?:\/\/[^\s/]+(\/_next\/static\/chunks\/([^\s"'`,:)]+))(?::\d+:\d+)?/g,
      "[chunk:$2]",
    )
    .replace(
      /\/_next\/static\/chunks\/([^\s"'`,:)]+)(?::\d+:\d+)?/g,
      "[chunk:$1]",
    );
}

/** True when a stack/component-stack line is webpack/turbopack minified noise. */
function isNoiseStackLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;

  // Minified single-char callee at a chunk location.
  if (/^at [a-z] \((\[chunk:[^\]]+\]|https?:\/\/)/i.test(t)) return true;

  // Bare chunk URL / path frames.
  if (/^at \[chunk:[^\]]+\]$/i.test(t)) return true;
  if (/^at https?:\/\//i.test(t)) return true;

  // Turbopack/webpack runtime loaders — rarely actionable for an agent.
  if (/^at \[chunk:turbopack-/i.test(t)) return true;
  if (/^at \[chunk:webpack-/i.test(t)) return true;

  return false;
}

/** Sanitize a multi-line stack or React component stack for agent export. */
export function sanitizeStackTextForAi(
  text: string | undefined | null,
): string | undefined {
  if (!text?.trim()) return undefined;

  const lines = shortenChunkPaths(text).split("\n");
  const kept = lines.filter((line) => !isNoiseStackLine(line));

  const out = kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return out || undefined;
}

/** Sanitize a one-line error message that may embed chunk paths. */
export function sanitizeMessageForAi(message: string): string {
  return shortenChunkPaths(message);
}

const RAW_STACK_KEYS = new Set([
  "stack",
  "componentStack",
  "callSite",
  "message",
]);

/** Deep-sanitize `raw` error dumps — only known stack-bearing string fields. */
export function sanitizeRawForAi(raw: unknown): unknown {
  if (raw === null || raw === undefined) return raw;
  if (typeof raw === "string") return sanitizeStackTextForAi(raw) ?? raw;

  if (Array.isArray(raw)) {
    return raw.map((item) => sanitizeRawForAi(item));
  }

  if (typeof raw === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "string" && RAW_STACK_KEYS.has(key)) {
        out[key] =
          key === "message"
            ? sanitizeMessageForAi(value)
            : (sanitizeStackTextForAi(value) ?? value);
      } else if (typeof value === "object" && value !== null) {
        out[key] = sanitizeRawForAi(value);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  return raw;
}
