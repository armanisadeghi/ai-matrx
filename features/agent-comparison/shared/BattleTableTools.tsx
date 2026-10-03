"use client";

/**
 * BattleTableTools — the platform's own tools on any battle table: Copy /
 * Copy for AI / Export (Alchemy) and Save to (a custom data table, a
 * workbook, a Google Sheet). One component, so every table on the battle
 * page — the runs comparison sections, Standings, Decisions, an answer's run
 * numbers — offers exactly the same set.
 */

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { csvExportItem } from "@/components/agent-copy/export";
import { TableSaveToMenu } from "@/components/mardown-display/tables/TableSaveToMenu";
import { gridMarkdown, gridObjects, type Grid } from "./tableGrid";

export function BattleTableTools({
  name,
  grid,
  data = grid,
  aiContext,
  kind = "agent-battle-table",
  save = true,
}: {
  name: string;
  /** The table as people read it (copy for a person, the AI summary). */
  grid: Grid;
  /** The same numbers as data (save, CSV, JSON, Sheets, the AI's data). Defaults to `grid`. */
  data?: Grid;
  /** What the table is — sent with Copy for AI, never shown on screen. */
  aiContext: string;
  kind?: string;
  /** Offer Save to (off for a one-row card where a table would be odd). */
  save?: boolean;
}) {
  if (grid.rows.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      <CopyButtons
        label={name}
        size="xs"
        primarySource="table"
        human={() => gridMarkdown(grid)}
        json={() => gridObjects(data)}
        agent={() => ({
          kind,
          location: `AI Matrx — Agent Battle, "${name}"`,
          description: aiContext,
          summary: gridMarkdown(grid),
          data: gridObjects(data),
          attributes: { columns: data.headers.length, rows: data.rows.length },
        })}
        export={{
          items: [csvExportItem(() => gridObjects(data), "CSV")],
          sheetRows: () => gridObjects(data),
        }}
      />
      {save && <TableSaveToMenu headers={data.headers} rows={data.rows} title={name} />}
    </div>
  );
}
