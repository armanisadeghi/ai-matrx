/**
 * Which of the platform's common data tools would reach a person as the generic tool card.
 *
 * A tool has a display when the app holds its own renderer for it (the static registry, after the
 * app's registrations), or when its renderer is a stored `tool.ui` row the web reads. `data` is the
 * one drawn by a stored row today (tool.ui, checked 2026-10-03: 1 row for `data`, 0 for records,
 * dataset, picklist — those three are drawn in code).
 */

/** The common data tools every agent may carry; each must draw its answer for a person. */
export const DATA_TOOLS = ["records", "table", "pick_list", "data"] as const;

/** Tools whose display is a stored `tool.ui` row rather than code. */
export const DRAWN_BY_A_STORED_ROW: ReadonlySet<string> = new Set(["data"]);

/** The tools that would fall to the generic card, given the registry the shell resolves from. */
export function toolsWithNoDisplay(
  registry: Readonly<Record<string, { InlineComponent?: unknown } | undefined>>,
  tools: readonly string[] = DATA_TOOLS,
  storedRows: ReadonlySet<string> = DRAWN_BY_A_STORED_ROW,
): string[] {
  return tools.filter((tool) => !registry[tool]?.InlineComponent && !storedRows.has(tool));
}
