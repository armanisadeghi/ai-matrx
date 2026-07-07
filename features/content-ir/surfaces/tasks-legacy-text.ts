/**
 * `tasks_legacy_text` — the named parser strategy behind the ```tasks fence
 * surface (kind_surface: fence_lang/tasks → task_list).
 *
 * WRAPS the one existing legacy text parser — `parseMarkdownChecklist`, the
 * exact code TasksBlock / TasksArtifact / TaskChecklist render the fence
 * body through today. It NEVER re-implements that grammar; it only maps the
 * parser's items onto the canonical task_list value, so the fence surface
 * converges to the SAME shape a `__kind` JSON arrival carries (THE
 * KEYSTONE). The real parser's behavior therefore IS the strategy's
 * behavior, including its verified failure modes (live regexes, 2026-07-06):
 *
 *   - checked marker is lowercase `x` ONLY — a `[X]` line matches nothing
 *     and is dropped entirely (not "rendered unchecked": DROPPED);
 *   - a space is REQUIRED between `]` and the title (`- [ ]Title` drops);
 *   - plain bullets without a checkbox and `#`/`###` headings are ignored;
 *   - an indented subtask with no top-level task above it is dropped.
 *
 * Title: task_list.title is OPTIONAL in the schema precisely because the
 * legacy fence carries none — unlike flashcards, no default is injected; the
 * converged value simply omits it.
 *
 * HOST NOTE: the fence-finalize convergence hook does not exist yet (hosts
 * converge XML regions only today — surfaces/xml-finalize.ts). This strategy
 * + its kind_surface row are ready; the central integration pass wires the
 * hosts. Accepts BOTH framings (full ```tasks fence, or inner body only) so
 * either host contract converges to identical values.
 */

import { parseMarkdownChecklist } from "@/components/mardown-display/blocks/tasks/tasklist-parser";
import type { TaskItemType } from "@/components/mardown-display/blocks/tasks/TaskChecklist";
import { KIND_KEY } from "../core/kind-schema.types";

/** Opening fence line, e.g. ```tasks (with optional trailing annotations). */
const OPENING_FENCE_RE = /^\s*```+[ \t]*tasks[^\n]*\n?/i;
/** Trailing closing fence, tolerant of trailing whitespace. */
const CLOSING_FENCE_RE = /\n?[ \t]*```+[ \t]*$/;

function toKindItem(item: TaskItemType): Record<string, unknown> {
  const out: Record<string, unknown> = {
    [KIND_KEY]: "task_item",
    title: item.title,
    item_type: item.type,
  };
  // Sections carry no checkbox; the parser stamps `checked` on tasks and
  // subtasks only — mirror exactly, never invent state.
  if (item.type !== "section" && typeof item.checked === "boolean") {
    out.checked = item.checked;
  }
  if (item.bold === true) out.bold = true;
  if (item.children && item.children.length > 0) {
    out.children = item.children.map(toKindItem);
  }
  return out;
}

function hasCheckableItem(items: TaskItemType[]): boolean {
  return items.some(
    (item) =>
      item.type !== "section" || hasCheckableItem(item.children ?? []),
  );
}

/**
 * Completed ```tasks region text → canonical task_list value, or null when
 * the region yields no checkable item (the caller treats null as parse
 * failure: loud, legacy rendering untouched — a fence of only headers or
 * prose is not a task list).
 */
export function tasksLegacyTextToKindValue(
  regionText: string,
): Record<string, unknown> | null {
  const inner = regionText
    .replace(OPENING_FENCE_RE, "")
    .replace(CLOSING_FENCE_RE, "");

  const parsed = parseMarkdownChecklist(inner);
  if (parsed.length === 0 || !hasCheckableItem(parsed)) return null;

  return {
    [KIND_KEY]: "task_list",
    items: parsed.map(toKindItem),
  };
}
