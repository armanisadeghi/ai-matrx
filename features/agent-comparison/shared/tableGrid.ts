/**
 * A table as plain rows — the shape every battle table hands to Copy, Copy
 * for AI, CSV, Sheets and Save to a table. Kept apart from the report so the
 * answer cards can use it without loading the report and print code.
 */

export interface Grid {
  headers: string[];
  rows: string[][];
}

/** Rows as objects keyed by header — for JSON copy and CSV. */
export function gridObjects(grid: Grid): Array<Record<string, string>> {
  return grid.rows.map((row) =>
    Object.fromEntries(grid.headers.map((h, i) => [h, row[i] ?? ""])),
  );
}

export const mdCell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function gridMarkdown(grid: Grid, align: "left" | "right" = "right"): string {
  const rule = grid.headers
    .map((_, i) => (i === 0 || align === "left" ? "---" : "---:"))
    .join("|");
  return [
    `| ${grid.headers.map(mdCell).join(" | ")} |`,
    `|${rule}|`,
    ...grid.rows.map((r) => `| ${r.map(mdCell).join(" | ")} |`),
  ].join("\n");
}

