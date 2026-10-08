"use client";

/**
 * RunsComparisonTable — the comparison the Runs window draws.
 *
 * Standings first (overall place, wins, average place, and who leads each
 * scored metric), then every metric section with the best value green, the
 * worst red, and each column's place on that metric. Every table carries the
 * platform's own tools: Copy / Copy for AI / Export (Alchemy) and Save to (a
 * custom data table, a workbook, a Google Sheet). The data and its masking
 * come from `runsComparisonData`; the rankings from `runsRanking`; the report
 * shapes (Markdown, rows, HTML) from `runsComparisonReport`.
 */

import { EyeOff, Trophy } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { useCatalogBoundSelector } from "../shared/useCatalogBoundSelector";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { BattleTableTools as TableTools } from "../shared/BattleTableTools";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { cn } from "@/lib/utils";
import { selectBlindActive } from "../redux/selectors";
import { selectMountedBattleName } from "../shared/activeBattleColumns";
import {
  selectVisibleRunsComparison,
  type ColumnStats,
  type MetricSection,
} from "./runsComparisonData";
import {
  computeRanking,
  ordinal,
  rankRow,
  rowHighlights,
  type RunsRanking,
} from "./runsRanking";
import {
  rowsWithData,
  sectionDataGrid,
  sectionGrid,
  standingsDataGrid,
  standingsGrid,
} from "./runsComparisonReport";

export function RunsComparisonTable() {
  const { stats, sections } = useCatalogBoundSelector(selectVisibleRunsComparison);
  const blindActive = useAppSelector(selectBlindActive);
  const { unit: costUnit } = useCostDisplay();

  const battleName = useAppSelector(selectMountedBattleName);

  if (stats.length === 0) return null;
  const ranking = computeRanking(stats, sections, costUnit);
  // A saved table is named after its battle, never a bare "Summary".
  const tableName = (section: string) =>
    battleName ? `${battleName} — ${section}` : `Runs comparison — ${section}`;
  // Sections nobody has data for yet are named in one line, not drawn as
  // tables of dashes — the window matches what prints and publishes.
  const withData = sections.filter((sec) => rowsWithData(sec, stats).length > 0);
  const empty = sections.filter((sec) => rowsWithData(sec, stats).length === 0);

  return (
    <div className="space-y-3 p-3">
      <ColumnHeaderStrip stats={stats} />
      {blindActive && (
        <div className="flex items-center gap-2 rounded-md border border-violet-500/30 bg-violet-500/5 px-3 py-2">
          <EyeOff className="w-3.5 h-3.5 text-violet-500 shrink-0" />
          <span className="text-[11px] text-muted-foreground">
            Blind test: metrics hidden until you reveal.
          </span>
        </div>
      )}
      <StandingsCard ranking={ranking} name={tableName("Standings")} />
      {withData.map((section) => (
        <SectionTable
          key={section.title}
          section={section}
          stats={stats}
          name={tableName(section.title)}
        />
      ))}
      {empty.length > 0 && (
        <p className="text-[10px] text-muted-foreground px-1">
          {/* read-gate-exempt: these sections are computed from this session's runs in the store, not a read */}
          No data yet: {empty.map((sec) => sec.title).join(", ")}
        </p>
      )}
    </div>
  );
}

function ColumnHeaderStrip({ stats }: { stats: ColumnStats[] }) {
  return (
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
      Comparing {stats.length} column{stats.length === 1 ? "" : "s"} ·
      <span className="ml-1 text-emerald-500 font-semibold">green</span> = best,
      {/* Best/worst is computed per row across the columns that have a value. */}
      <span className="ml-1 text-rose-500 font-semibold">red</span> = worst ·
      badge = place
    </div>
  );
}

function PlaceBadge({ place }: { place: number | null }) {
  if (place == null) return null;
  return (
    <span
      className={cn(
        "ml-1.5 inline-block min-w-[26px] rounded-full px-1 text-center text-[9px] font-semibold leading-4 align-middle",
        place === 1 && "bg-amber-200 text-amber-900 dark:bg-amber-500/25 dark:text-amber-300",
        place === 2 && "bg-slate-200 text-slate-700 dark:bg-slate-500/25 dark:text-slate-300",
        place === 3 && "bg-orange-200 text-orange-900 dark:bg-orange-500/25 dark:text-orange-300",
        place > 3 && "bg-muted text-muted-foreground",
      )}
      title={`${ordinal(place)} place on this metric`}
    >
      {ordinal(place)}
    </span>
  );
}

function StandingsCard({ ranking, name }: { ranking: RunsRanking; name: string }) {
  if (!ranking.standings.some((s) => s.ranked > 0)) return null;
  const grid = standingsGrid(ranking);
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-1 bg-muted/40">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          <Trophy className="w-3 h-3 text-amber-500" />
          Standings
        </span>
        <TableTools
          name={name}
          grid={grid}
          data={standingsDataGrid(ranking)}
          aiContext="Each column's overall place, first places and average place across your scores, tokens, cost and speed."
        />
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border bg-card/50">
            {grid.headers.map((h, i) => (
              <th
                key={h}
                className={cn(
                  "px-3 py-1.5 font-semibold text-muted-foreground",
                  i <= 1 ? "text-left" : "text-right",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ranking.standings.map((s) => (
            <tr
              key={s.columnId}
              className={cn(
                "border-b border-border/40 last:border-b-0",
                s.place === 1 && "bg-emerald-500/5",
              )}
            >
              <td className="px-3 py-1">
                {s.place > 0 ? <PlaceBadge place={s.place} /> : "—"}
              </td>
              <td className={cn("px-3 py-1", s.place === 1 && "font-semibold text-foreground")}>
                {s.name}
              </td>
              <td className="px-3 py-1 text-right font-mono">{s.wins}</td>
              <td className="px-3 py-1 text-right font-mono">
                {s.averagePlace != null ? s.averagePlace.toFixed(1) : "—"}
              </td>
              <td className="px-3 py-1 text-right font-mono">{s.ranked}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ranking.leaders.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 border-t border-border/60">
          {ranking.leaders.map((l) => (
            <span
              key={l.label}
              className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
              title={`${l.label}: ${l.leaders.join(", ")} (${l.value})`}
            >
              {l.label}:{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {l.leaders.join(", ")}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionTable({
  section,
  stats,
  name,
}: {
  section: MetricSection;
  stats: ColumnStats[];
  name: string;
}) {
  const { unit: costUnit } = useCostDisplay();
  const grid = sectionGrid(section, stats, costUnit);
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-1 bg-muted/40">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          {section.title}
        </span>
        <TableTools
          name={name}
          grid={grid}
          data={sectionDataGrid(section, stats, costUnit)}
          aiContext={`The "${section.title}" metrics for each column of an Agent Battle, side by side.`}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border bg-card/50">
              <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground sticky left-0 bg-card/50 min-w-[160px]">
                Metric
              </th>
              {stats.map((s) => (
                <th
                  key={s.columnId}
                  className="text-right px-3 py-1.5 font-semibold text-foreground min-w-[140px]"
                  title={`${s.agentName} · ${s.versionLabel}`}
                >
                  {s.agentId ? (
                    <EntityRef
                      token="agent"
                      id={s.agentId}
                      name={s.agentName}
                      showIcon={false}
                      openInNewTab
                      className="max-w-[180px] justify-end"
                      nameClassName="max-w-[180px]"
                    />
                  ) : (
                    <div className="truncate max-w-[180px] inline-block align-bottom">
                      {s.agentName}
                    </div>
                  )}
                  <div className="text-[10px] font-mono text-muted-foreground/70 font-normal">
                    {s.versionLabel}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => {
              const highlights = rowHighlights(row, stats, costUnit);
              const places = rankRow(row, stats, costUnit);
              return (
                <tr
                  key={row.label}
                  className="border-b border-border/40 last:border-b-0 hover:bg-muted/10"
                >
                  <td
                    className={cn(
                      "px-3 py-1 text-muted-foreground sticky left-0 bg-background",
                      row.emphasized && "font-semibold text-foreground",
                    )}
                  >
                    {row.label}
                  </td>
                  {stats.map((s) => {
                    const v = row.pick(s);
                    const hl = highlights[s.columnId] ?? null;
                    return (
                      <td
                        key={s.columnId}
                        className={cn(
                          "px-3 py-1 text-right font-mono whitespace-nowrap",
                          hl === "best" && "text-emerald-500 font-semibold",
                          hl === "worst" && "text-rose-500 font-semibold",
                        )}
                      >
                        {row.format(v, costUnit)}
                        <PlaceBadge place={places[s.columnId] ?? null} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
