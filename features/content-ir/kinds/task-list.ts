/**
 * task_list / task_item kinds → the legacy `tasks` checklist surface.
 *
 * The existing renderable is the ```tasks fence family: TasksBlock /
 * TasksArtifact / TaskChecklist all consume ONE input representation — a
 * GitHub-style markdown checklist STRING parsed by `parseMarkdownChecklist`
 * (components/mardown-display/blocks/tasks/tasklist-parser.tsx). Unlike the
 * quiz/presentation bridges (whose components take structured serverData),
 * the tasks component family has no structured input path, so this bridge
 * SERIALIZES the canonical kind value back into that exact grammar and emits
 * `{ content: <markdown checklist> }`. The serializer targets the REAL
 * parser's accepted grammar (verified against its regexes, live 2026-07-06):
 *
 *   - section:  `## Title` (two hashes + space; `#`/`###` are ignored)
 *   - task:     `- [ ] Title` / `- [x] Title` at column 0 (`*` also works)
 *   - subtask:  2+ space indent before `- [ ]` (one visual level; the parser
 *               attaches EVERY indented line to the last top-level task)
 *   - checked:  lowercase `x` ONLY — `[X]` does not match and the line drops
 *   - a space is REQUIRED between `]` and the title or the line drops
 *   - bold:     a title fully wrapped in `**…**` renders bold (markers strip)
 *
 * Legacy-surface flattening (documented, not silent): the kind value allows
 * arbitrary `children` depth, but the checklist grammar carries exactly
 * section → task → subtask. Deeper descendants serialize as subtasks in
 * order, and a top-level `subtask` promotes to a task line (an indented line
 * with no parent task above it would be DROPPED by the parser). Unknown item
 * keys are unrepresentable in the string — they stay on the envelope /
 * artifact value (zero loss at the source of truth) and ride the toMarkdown
 * export as nested plain bullets, which the parser ignores on re-parse.
 *
 * INTEGRATION NOTE: TasksArtifact currently reads `data` / `raw` only —
 * wiring `serverData.content` into it is part of the central integration
 * pass (this bridge's output shape is designed so that hop is one line).
 */

import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import { makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  extrasList,
  isRecordValue,
  joinBlocks,
} from "./kind-markdown-utils";

// ---------------------------------------------------------------------------
// Canonical schemas — the single authored source. The migration's
// kind_definition.data / emitted schemas are CONVERTER-EMITTED from these
// (kindSchemaToStorage / kindSchemaToJsonSchema), never hand-written.
// ---------------------------------------------------------------------------

export const TASK_ITEM_KIND_SCHEMA: KindSchema = {
  kind: "task_item",
  fields: {
    title: { type: "string", required: true },
    // Omitted item_type means "task". `section` = a grouping header (no
    // checkbox, excluded from progress); `subtask` = nested one level under
    // the previous task on the legacy surface.
    item_type: { type: "enum", values: ["section", "task", "subtask"] },
    checked: { type: "boolean" },
    bold: { type: "boolean" },
    // Recursive: a section's children are tasks; a task's children are
    // subtasks. (The legacy checklist grammar flattens depth beyond that.)
    children: { type: "array", itemKinds: ["task_item"] },
  },
};

export const TASK_LIST_KIND_SCHEMA: KindSchema = {
  kind: "task_list",
  fields: {
    // Optional: the ```tasks fence carries no title and the block header is
    // fixed ("Tasks"); a title still travels for artifact/markdown surfaces.
    title: { type: "string" },
    items: { type: "array", itemKinds: ["task_item"], required: true },
  },
};

// ---------------------------------------------------------------------------
// Serializer — canonical value → the exact grammar parseMarkdownChecklist
// accepts. Shared by the legacy bridge (pure grammar) and the toMarkdown
// facet (grammar + extras + heading).
// ---------------------------------------------------------------------------

const ITEM_KNOWN_KEYS = ["title", "item_type", "checked", "bold", "children"];
const SET_KNOWN_KEYS = ["title", "items"];

type ItemType = "section" | "task" | "subtask";

function itemTypeOf(item: Record<string, unknown>): ItemType {
  return item.item_type === "section" || item.item_type === "subtask"
    ? item.item_type
    : "task";
}

/** Line-based grammar: titles must be single-line, non-empty after trim. */
function itemTitleOf(item: Record<string, unknown>): string {
  const raw = typeof item.title === "string" ? item.title : "";
  return raw.replace(/\s*\n\s*/g, " ").trim();
}

function childrenOf(item: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(item.children)
    ? item.children.filter(isRecordValue)
    : [];
}

/**
 * `- [x] **Title**` — lowercase `x`, mandatory space after `]`, full-title
 * bold wrap only (the parser strips a LEADING `**…**` pair; mid-title
 * asterisks pass through verbatim). Returns null for an empty title — the
 * parser would drop the line anyway, so nothing pretends to emit it.
 */
function checklistLine(
  item: Record<string, unknown>,
  indent: string,
): string | null {
  const title = itemTitleOf(item);
  if (title === "") return null;
  const marker = item.checked === true ? "x" : " ";
  const text = item.bold === true ? `**${title}**` : title;
  return `${indent}- [${marker}] ${text}`;
}

/** Extras as indented PLAIN bullets — visible in markdown, ignored on re-parse. */
function pushItemExtras(
  item: Record<string, unknown>,
  indent: string,
  lines: string[],
): void {
  const extras = extrasList(collectExtras(item, ITEM_KNOWN_KEYS));
  if (extras) lines.push(extras.replace(/^- /gm, `${indent}  - `));
}

/** Every descendant (any depth) as ordered 2-space subtask lines. */
function pushDescendantsAsSubtasks(
  item: Record<string, unknown>,
  lines: string[],
  includeExtras: boolean,
): void {
  for (const child of childrenOf(item)) {
    const line = checklistLine(child, "  ");
    if (line) {
      lines.push(line);
      if (includeExtras) pushItemExtras(child, "  ", lines);
    }
    pushDescendantsAsSubtasks(child, lines, includeExtras);
  }
}

function pushTask(
  item: Record<string, unknown>,
  lines: string[],
  includeExtras: boolean,
): void {
  const line = checklistLine(item, "");
  if (line) {
    lines.push(line);
    if (includeExtras) pushItemExtras(item, "", lines);
    pushDescendantsAsSubtasks(item, lines, includeExtras);
  } else {
    // Untitled task can't exist as a line; its children still surface as
    // top-level tasks so no content silently vanishes.
    for (const child of childrenOf(item)) {
      pushTask(child, lines, includeExtras);
    }
  }
}

function pushItems(
  items: Record<string, unknown>[],
  lines: string[],
  includeExtras: boolean,
): void {
  for (const item of items) {
    if (itemTypeOf(item) === "section") {
      const title = itemTitleOf(item);
      if (title !== "") {
        if (lines.length > 0) lines.push("");
        lines.push(`## ${title}`);
        if (includeExtras) pushItemExtras(item, "", lines);
      }
      // Direct children of a section are top-level task lines (the parser
      // groups them under the header); nested sections open a new header.
      pushItems(childrenOf(item), lines, includeExtras);
    } else {
      // Top-level `subtask` promotes to a task line: an indented line with
      // no parent task above it is DROPPED by the parser.
      pushTask(item, lines, includeExtras);
    }
  }
}

/**
 * Canonical task_list value → markdown checklist text (the tasks component
 * family's one input representation). Empty string when no item survives.
 */
export function taskListToChecklistMarkdown(
  value: Record<string, unknown>,
  options?: { includeExtras?: boolean },
): string {
  const items = Array.isArray(value.items)
    ? value.items.filter(isRecordValue)
    : [];
  const lines: string[] = [];
  pushItems(items, lines, options?.includeExtras === true);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Legacy bridge — complete task_list envelope → TasksArtifact serverData.
// ---------------------------------------------------------------------------

export const tasksServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  "task_list",
  (value) => {
    const content = taskListToChecklistMarkdown(value);
    if (content === "") return undefined; // no renderable item — decline loud
    return { content };
  },
);

// ---------------------------------------------------------------------------
// toMarkdown facet — human-readable document export. The checklist grammar
// IS readable markdown, so the export is heading + checklist + extras; it
// stays re-parseable by the real parser (extras render as plain bullets the
// parser ignores).
// ---------------------------------------------------------------------------

export function taskListMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const title =
    typeof value.title === "string" && value.title !== ""
      ? value.title
      : "Tasks";
  const checklist = taskListToChecklistMarkdown(value, { includeExtras: true });

  return joinBlocks([
    `# ${title}`,
    checklist === "" ? null : checklist,
    additionalDetailsSection(collectExtras(value, SET_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Registry entries — NOT registered here (system-kinds.ts is untouched);
// the central integration pass spreads these into SYSTEM_KIND_DEFINITIONS.
// ---------------------------------------------------------------------------

export const TASK_LIST_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "task_list",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "tasks",
    toLegacyServerData: tasksServerDataFromEnvelope,
    toMarkdown: taskListMarkdownFromValue,
    artifact: { canvasType: "tasks" },
    persistence: { persistStructured: true },
    schema: TASK_LIST_KIND_SCHEMA,
  },
  {
    kind: "task_item",
    schemaSource: "system",
    tier: "eager",
    schema: TASK_ITEM_KIND_SCHEMA,
  },
];
