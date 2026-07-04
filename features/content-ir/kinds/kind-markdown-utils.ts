/**
 * Shared plumbing for kind → markdown export facets (`toMarkdown`).
 *
 * The FORWARD leg of the artifact ⇄ markdown two-way layer: every facet
 * turns a kind's ZERO-LOSS value object into clean human-readable markdown
 * (headings / lists / bold — never a JSON dump), following two laws:
 *
 * 1. `__kind` discriminators are transport metadata — never rendered.
 * 2. Nothing silently vanishes: keys a facet doesn't understand (plus the
 *    declared `additionalDetails` bag every top-level kind schema carries)
 *    are appended under a small "Additional details" key: value section via
 *    `collectExtras` + `additionalDetailsSection`.
 *
 * `genericKindMarkdown` is the fallback for kinds WITHOUT a `toMarkdown`
 * facet (and for unregistered kinds): a heading + fenced json body — the
 * honest zero-loss floor when no renderer knows the shape.
 */

import { KIND_KEY } from "../core/kind-schema.types";

export function isRecordValue(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

/**
 * One-line rendering of an arbitrary value for key: value lists. Scalars
 * render as text, scalar arrays join with ", ", anything structural falls
 * back to inline JSON in a code span (zero loss, still one line).
 */
export function formatInlineValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (isScalar(value)) return String(value);
  if (Array.isArray(value) && value.every(isScalar)) {
    return value.map(String).join(", ");
  }
  try {
    return `\`${JSON.stringify(stripKindForDisplay(value))}\``;
  } catch {
    return String(value);
  }
}

/** Deep-copy with every `__kind` discriminator removed (display only). */
function stripKindForDisplay(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripKindForDisplay);
  if (isRecordValue(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === KIND_KEY) continue;
      out[key] = stripKindForDisplay(child);
    }
    return out;
  }
  return value;
}

/**
 * Collect the keys a facet does NOT understand. Skips `__kind`,
 * null/undefined, and the facet's known keys; merges the contents of a
 * declared `additionalDetails` object bag (the schema-blessed extras
 * channel) into the same flat map so both extra channels surface together.
 */
export function collectExtras(
  value: Record<string, unknown>,
  knownKeys: Iterable<string>,
): Record<string, unknown> {
  const known = new Set(knownKeys);
  known.add(KIND_KEY);
  known.add("additionalDetails");

  const extras: Record<string, unknown> = {};

  const details = value.additionalDetails;
  if (isRecordValue(details)) {
    for (const [key, child] of Object.entries(details)) {
      if (key === KIND_KEY || child === null || child === undefined) continue;
      extras[key] = child;
    }
  } else if (details !== null && details !== undefined) {
    extras.additionalDetails = details;
  }

  for (const [key, child] of Object.entries(value)) {
    if (known.has(key) || child === null || child === undefined) continue;
    extras[key] = child;
  }

  return extras;
}

/** Render extras as a key: value bullet list (no heading). Null when empty. */
export function extrasList(extras: Record<string, unknown>): string | null {
  const entries = Object.entries(extras);
  if (entries.length === 0) return null;
  return entries
    .map(([key, value]) => `- **${key}:** ${formatInlineValue(value)}`)
    .join("\n");
}

/**
 * The canonical "Additional details" section — appended at the END of a
 * kind's markdown so nothing silently vanishes. Null when there is nothing
 * to say (callers filter with `joinBlocks`).
 */
export function additionalDetailsSection(
  extras: Record<string, unknown>,
  headingLevel: "##" | "###" | "####" = "##",
): string | null {
  const list = extrasList(extras);
  if (!list) return null;
  return `${headingLevel} Additional details\n\n${list}`;
}

/** Join markdown blocks with blank lines, dropping empty/null ones. */
export function joinBlocks(
  blocks: Array<string | null | undefined>,
): string {
  return blocks
    .map((block) => (typeof block === "string" ? block.trim() : ""))
    .filter((block) => block.length > 0)
    .join("\n\n");
}

/** "flashcard_set" → "Flashcard set". */
export function humanizeKind(kind: string): string {
  const words = kind.replace(/[_-]+/g, " ").trim();
  if (!words) return "Artifact";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Fallback markdown for kinds with no `toMarkdown` facet (or unregistered
 * kinds): a heading + the full value as a fenced json body. Zero loss —
 * `__kind` discriminators stay in the dump because they are the only thing
 * identifying the shape once no renderer knows it.
 */
export function genericKindMarkdown(
  kind: string,
  value: Record<string, unknown>,
): string {
  const title =
    typeof value.title === "string" && value.title.trim() !== ""
      ? value.title
      : typeof value.name === "string" && value.name.trim() !== ""
        ? value.name
        : humanizeKind(kind);

  let body: string;
  try {
    body = JSON.stringify(value, null, 2);
  } catch {
    body = String(value);
  }

  return joinBlocks([
    `# ${title}`,
    `*${humanizeKind(kind)}*`,
    "```json\n" + body + "\n```",
  ]);
}
