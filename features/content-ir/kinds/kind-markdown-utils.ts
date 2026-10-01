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
 * facet (and for unregistered kinds): readable markdown built from the value
 * itself — headings, bold-label lists, tables — never a JSON dump.
 */

import { KIND_KEY } from "@ai-matrx/content-ir";
import {
  deriveInstanceTitle,
  INSTANCE_TITLE_KEYS,
} from "@/features/content-ir/studio/instance-title";

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

/**
 * A field's own name, as words — `violations_not_fixed` → "Violations not
 * fixed", `wordCountAfter` → "Word count after".
 *
 * 🚨 WALK 18, DEFECT D. The finished Masterwork deliverable an Expert hands a
 * customer carried `violations_not_fixed: []` — a key out of a schema we
 * declared, printed at a person. A label is the one place a field name is
 * GUARANTEED to reach a reader, so the resolution lives here, beside the
 * extras plumbing, for every RENDERER that puts a structured field on a
 * screen: underscores and camel humps become spaces, the first letter is
 * capitalised, and nothing else changes.
 *
 * Deliberately NOT applied inside {@link extrasList}. That list is the
 * markdown/EXPORT leg (`features/canvas/export/exportArtifactMarkdown.ts`
 * writes a file somebody — or something — reads back), and a key spelled as
 * prose cannot be read back as a key. A screen resolves; a file keeps the key.
 */
export function plainFieldLabel(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
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

/** Renders a nested kind value as markdown (the registry's converter). */
export type NestedKindMarkdown = (value: Record<string, unknown>) => string;

function isKindValue(value: unknown): value is Record<string, unknown> {
  return (
    isRecordValue(value) &&
    typeof value[KIND_KEY] === "string" &&
    (value[KIND_KEY] as string).trim().length > 0
  );
}

function scalarText(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function cellText(value: unknown): string {
  return scalarText(value).replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

/** Visible fields of a record: never `__kind`, never empty. */
function visibleEntries(value: Record<string, unknown>): [string, unknown][] {
  return Object.entries(value).filter(
    ([key, child]) =>
      key !== KIND_KEY &&
      child !== null &&
      child !== undefined &&
      !(typeof child === "string" && child.trim() === "") &&
      !(Array.isArray(child) && child.length === 0),
  );
}

/** A table when every element is a non-kind record of scalars over one key set. */
function uniformTable(items: unknown[]): string | null {
  if (items.length === 0) return null;
  let columns: string[] | null = null;
  for (const item of items) {
    if (!isRecordValue(item) || isKindValue(item)) return null;
    const keys = Object.keys(item).filter((key) => key !== KIND_KEY);
    if (keys.length === 0) return null;
    if (!keys.every((key) => item[key] === null || isScalar(item[key]))) return null;
    if (columns === null) columns = keys;
    else if (keys.length !== columns.length || !keys.every((k, i) => k === columns![i]))
      return null;
  }
  const cols = columns!;
  const head = `| ${cols.map(plainFieldLabel).join(" | ")} |`;
  const rule = `| ${cols.map(() => "---").join(" | ")} |`;
  const rows = items.map(
    (item) =>
      `| ${cols
        .map((key) => {
          const cell = (item as Record<string, unknown>)[key];
          return cell === null || cell === undefined ? "—" : cellText(cell);
        })
        .join(" | ")} |`,
  );
  return [head, rule, ...rows].join("\n");
}

function indentBlock(text: string, indent: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim() ? indent + line : line))
    .join("\n");
}

/** Nested bullet lines for any value (lists inside lists, kinds as blocks). */
function listLines(value: unknown, indent: string, nested: NestedKindMarkdown): string[] {
  if (Array.isArray(value)) {
    const lines: string[] = [];
    for (const item of value) {
      if (item === null || item === undefined) continue;
      if (isScalar(item)) lines.push(`${indent}- ${scalarText(item)}`);
      else if (isKindValue(item)) {
        lines.push(`${indent}-`);
        lines.push(indentBlock(nested(item), indent + "  "));
      } else if (Array.isArray(item)) {
        lines.push(`${indent}-`);
        lines.push(...listLines(item, indent + "  ", nested));
      } else if (isRecordValue(item)) {
        const fields = listLines(item, indent + "  ", nested);
        // The record's first field rides on the bullet itself.
        if (fields.length > 0) {
          lines.push(`${indent}- ${fields[0].trimStart().replace(/^- /, "")}`);
          lines.push(...fields.slice(1));
        }
      }
    }
    return lines;
  }
  if (isRecordValue(value)) {
    if (isKindValue(value)) return [indentBlock(nested(value), indent)];
    const lines: string[] = [];
    for (const [key, child] of visibleEntries(value)) {
      const label = `**${plainFieldLabel(key)}:**`;
      if (isScalar(child)) lines.push(`${indent}- ${label} ${scalarText(child)}`);
      else if (Array.isArray(child) && child.every(isScalar))
        lines.push(`${indent}- ${label} ${child.map(scalarText).join(", ")}`);
      else {
        lines.push(`${indent}- ${label}`);
        lines.push(...listLines(child, indent + "  ", nested));
      }
    }
    return lines;
  }
  return isScalar(value) ? [`${indent}- ${scalarText(value)}`] : [];
}

function headingFor(depth: number): string {
  return "#".repeat(Math.min(Math.max(depth, 1), 6));
}

/** The body of a record: scalar list first, then one section per structure. */
function recordBody(
  value: Record<string, unknown>,
  depth: number,
  nested: NestedKindMarkdown,
  skipKey: string | null,
): string[] {
  const scalars: string[] = [];
  const sections: string[] = [];
  for (const [key, child] of visibleEntries(value)) {
    if (key === skipKey) continue;
    const label = plainFieldLabel(key);
    if (isScalar(child)) {
      scalars.push(`- **${label}:** ${scalarText(child)}`);
    } else if (Array.isArray(child) && child.every(isScalar)) {
      scalars.push(`- **${label}:** ${child.map(scalarText).join(", ")}`);
    } else if (isKindValue(child)) {
      sections.push(joinBlocks([`${headingFor(depth + 1)} ${label}`, nested(child)]));
    } else if (Array.isArray(child)) {
      sections.push(
        joinBlocks([
          `${headingFor(depth + 1)} ${label}`,
          uniformTable(child) ?? listLines(child, "", nested).join("\n"),
        ]),
      );
    } else if (isRecordValue(child)) {
      sections.push(
        joinBlocks([
          `${headingFor(depth + 1)} ${label}`,
          ...recordBody(child, depth + 1, nested, null),
        ]),
      );
    }
  }
  return [scalars.length ? scalars.join("\n") : null, ...sections].filter(
    (block): block is string => block !== null,
  );
}

/** Which key the derived title was read from, so it is not repeated below. */
function titleSourceKey(value: Record<string, unknown>, title: string | null): string | null {
  if (!title) return null;
  for (const key of INSTANCE_TITLE_KEYS) {
    const v = value[key];
    if (typeof v === "string" && v.trim() === title) return key;
  }
  return null;
}

/**
 * Fallback markdown for kinds with no `toMarkdown` facet (or unregistered
 * kinds): READABLE markdown built from the value itself (kind-never-raw,
 * Arman 2026-09-30 — a kind is never shown as raw JSON, an export included).
 * Heading = the instance title (`deriveInstanceTitle`), then the kind's
 * name; scalar fields as a bold-label list; arrays of uniform scalar records
 * as a table, other arrays as nested lists; nested plain objects as
 * sections; nested KINDS through `nested` (the registry converter —
 * `kindValueToMarkdown` passes itself; default: this function). Never the
 * `__kind` key, never a JSON fence. Every field still appears (zero loss in
 * content; the discriminator is named in words by the subtitle).
 */
export function genericKindMarkdown(
  kind: string,
  value: Record<string, unknown>,
  nested?: NestedKindMarkdown,
): string {
  const renderNested: NestedKindMarkdown =
    nested ??
    ((child) =>
      genericKindMarkdown(String(child[KIND_KEY] ?? "artifact"), child));
  const title = deriveInstanceTitle(value);
  return joinBlocks([
    `# ${title ?? humanizeKind(kind)}`,
    `*${humanizeKind(kind)}*`,
    ...recordBody(value, 1, renderNested, titleSourceKey(value, title)),
  ]);
}

/**
 * Readable markdown for a value that is NOT itself a kind — a kindless JSON
 * wrapper around kinds, or a run of plain values beside kinds in an array —
 * so a destination (export, copy) never prints it as JSON. Same rendering as
 * a kind's body in {@link genericKindMarkdown} (bold-label scalars, tables for
 * uniform records, nested lists, sections), nested kinds through `nested`.
 */
export function plainValueMarkdown(value: unknown, nested?: NestedKindMarkdown): string {
  const renderNested: NestedKindMarkdown =
    nested ??
    ((child) => genericKindMarkdown(String(child[KIND_KEY] ?? "artifact"), child));
  if (value === null || value === undefined) return "";
  if (isKindValue(value)) return renderNested(value);
  if (Array.isArray(value)) {
    return uniformTable(value) ?? listLines(value, "", renderNested).join("\n");
  }
  if (isRecordValue(value)) return joinBlocks(recordBody(value, 1, renderNested, null));
  return isScalar(value) ? scalarText(value) : String(value);
}
