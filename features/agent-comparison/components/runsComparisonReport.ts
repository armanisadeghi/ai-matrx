/**
 * The runs comparison as a report — the SAME data the window draws, in the
 * shapes every outlet needs:
 *
 * - `runsReportMarkdown` — Copy, Publish (the web page editor) and every
 *   other document action;
 * - `runsReportHtml` — Print and Download HTML: the comparison as it looks on
 *   screen (standings, best/worst colors, places on every metric), then the
 *   setup and each column's answer;
 * - `sectionGrid` / `standingsGrid` — one table's rows, for Save to a table,
 *   CSV and Copy.
 *
 * Comparison first, answers after: the comparison is the point of the page.
 * Blind masking comes from `selectVisibleRunsComparison` (identities and
 * metric sections) and `buildBattleSnapshot` (answers), so a blind battle
 * prints and publishes masked exactly as it shows.
 */

import type { CostUnit } from "@ai-matrx/kit/format";
import { markdownToHtml } from "@ai-matrx/print/markdown";
import type { RootState } from "@/lib/redux/store";
import { buildBattleSnapshot, type BattleSnapshot } from "../shared/battleSnapshot";
import {
  computeRowHighlights,
  selectVisibleRunsComparison,
  type ColumnStats,
  type MetricSection,
} from "./runsComparisonData";
import { computeRanking, ordinal, rankRow, type RunsRanking } from "./runsRanking";

export interface Grid {
  headers: string[];
  rows: string[][];
}

/** One metric section as plain rows (values as shown, no decoration). */
export function sectionGrid(
  section: MetricSection,
  stats: ColumnStats[],
  costUnit: CostUnit,
): Grid {
  return {
    headers: ["Metric", ...stats.map((s) => s.agentName)],
    rows: section.rows
      .filter((row) => stats.some((s) => row.pick(s) != null))
      .map((row) => [
        row.label,
        ...stats.map((s) => row.format(row.pick(s), costUnit)),
      ]),
  };
}

/**
 * One metric section as DATA — what Save to a table, CSV, JSON and Sheets
 * carry: one row per column, one column per metric, raw numbers with the
 * unit in the header ("Cost (USD)"), so the saved table sorts, sums and
 * charts. The display grid above is the same numbers as people read them.
 */
export function sectionDataGrid(section: MetricSection, stats: ColumnStats[]): Grid {
  const rows = section.rows.filter((row) => stats.some((s) => row.pick(s) != null));
  return {
    headers: [
      "Column",
      ...rows.map((row) =>
        row.unit && !row.label.toLowerCase().includes(row.unit.toLowerCase())
          ? `${row.label} (${row.unit})`
          : row.label,
      ),
    ],
    rows: stats.map((s) => [
      s.agentName,
      ...rows.map((row) => {
        const v = row.pick(s);
        return v == null ? "" : String(v);
      }),
    ]),
  };
}

export function standingsGrid(ranking: RunsRanking): Grid {
  return {
    headers: ["Place", "Column", "Wins", "Average place", "Metrics ranked"],
    rows: ranking.standings.map((s) => [
      s.place > 0 ? ordinal(s.place) : "—",
      s.name,
      String(s.wins),
      s.averagePlace != null ? s.averagePlace.toFixed(1) : "—",
      String(s.ranked),
    ]),
  };
}

/** The standings as data: places and averages as numbers. */
export function standingsDataGrid(ranking: RunsRanking): Grid {
  return {
    headers: ["Place", "Column", "Wins", "Average place", "Metrics ranked"],
    rows: ranking.standings.map((s) => [
      s.place > 0 ? String(s.place) : "",
      s.name,
      String(s.wins),
      s.averagePlace != null ? s.averagePlace.toFixed(2) : "",
      String(s.ranked),
    ]),
  };
}

/** Rows as objects keyed by header — for JSON copy and CSV. */
export function gridObjects(grid: Grid): Array<Record<string, string>> {
  return grid.rows.map((row) =>
    Object.fromEntries(grid.headers.map((h, i) => [h, row[i] ?? ""])),
  );
}

const mdCell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

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

/** One metric section as Markdown: the best value bold, every place named. */
export function sectionMarkdown(
  section: MetricSection,
  stats: ColumnStats[],
  costUnit: CostUnit,
): string {
  const rows = section.rows.filter((row) => stats.some((s) => row.pick(s) != null));
  if (rows.length === 0) return "";
  const out = [
    `| Metric | ${stats.map((s) => mdCell(s.agentName)).join(" | ")} |`,
    `|---|${stats.map(() => "---:").join("|")}|`,
  ];
  for (const row of rows) {
    const places = rankRow(row, stats);
    const cells = stats.map((s) => {
      const text = mdCell(row.format(row.pick(s), costUnit));
      const place = places[s.columnId];
      const shown = place != null ? `${text} (${ordinal(place)})` : text;
      return place === 1 ? `**${shown}**` : shown;
    });
    out.push(`| ${mdCell(row.label)} | ${cells.join(" | ")} |`);
  }
  return out.join("\n");
}

interface ReportParts {
  title: string;
  snap: BattleSnapshot | null;
  stats: ColumnStats[];
  sections: MetricSection[];
  ranking: RunsRanking;
}

function reportParts(state: RootState, costUnit: CostUnit): ReportParts {
  const snap = buildBattleSnapshot(state);
  const { stats, sections } = selectVisibleRunsComparison(state);
  return {
    title: snap?.battle?.name ?? snap?.mode_label ?? "Runs comparison",
    snap,
    stats,
    sections,
    ranking: computeRanking(stats, sections, costUnit),
  };
}

function setupLines(snap: BattleSnapshot | null): string[] {
  if (!snap) return [];
  const lines = [`${snap.mode_label} — varies ${snap.varies}.`];
  if (snap.blind.active && !snap.blind.revealed) {
    lines.push("Blind comparison: column identities and metrics are hidden until revealed.");
  }
  if (snap.agent) lines.push(`Agent: ${snap.agent.name} (${snap.agent.version})`);
  return lines;
}

// =============================================================================
// Markdown — Copy, Publish and every document action
// =============================================================================

export function runsReportMarkdown(state: RootState, costUnit: CostUnit): {
  title: string;
  content: string;
} {
  const { title, snap, stats, sections, ranking } = reportParts(state, costUnit);
  if (stats.length === 0) return { title, content: "" };
  const out: string[] = [`# ${title}`, ...setupLines(snap)];

  if (ranking.standings.some((s) => s.ranked > 0)) {
    out.push("## Standings", gridMarkdown(standingsGrid(ranking)));
    if (ranking.leaders.length > 0) {
      out.push(
        ranking.leaders
          .map((l) => `- **${l.label}:** ${l.leaders.join(", ")} (${l.value})`)
          .join("\n"),
      );
    }
  }
  for (const section of sections) {
    const table = sectionMarkdown(section, stats, costUnit);
    if (table) out.push(`## ${section.title}`, table);
  }

  if (snap?.shared_request) {
    out.push("## Request", snap.shared_request.message || "_(no typed message)_");
    const vars = Object.entries(snap.shared_request.variables);
    if (vars.length > 0) {
      out.push(
        vars
          .map(([k, v]) => `- **${k}:** ${typeof v === "string" ? v : JSON.stringify(v)}`)
          .join("\n"),
      );
    }
  }
  snap?.columns.forEach((c) => {
    out.push(`## ${c.label}`);
    if (c.own_request) out.push(`**Request:** ${c.own_request.message || "_(none)_"}`);
    out.push(c.answer || (c.error ? `**Error:** ${c.error}` : "_No answer yet._"));
  });
  return { title, content: out.join("\n\n") };
}

// =============================================================================
// HTML — Print and Download HTML, styled like the window
// =============================================================================

const esc = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const REPORT_CSS = `
  .rc { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; }
  .rc h1 { font-size: 22px; margin: 0 0 4px; }
  .rc .rc-sub { color: #6b7280; font-size: 12px; margin: 0 0 2px; }
  .rc h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .06em; color: #374151; margin: 22px 0 8px; }
  .rc table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 6px; break-inside: avoid; }
  .rc th, .rc td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; text-align: right; }
  .rc th:first-child, .rc td:first-child { text-align: left; }
  .rc thead th { background: #f3f4f6; color: #111827; font-weight: 600; border: none; border-bottom: 1px solid #d1d5db; }
  .rc td { border-left: none; border-right: none; border-top: none; }
  @media print { .rc thead th, .rc .best, .rc .place { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  .rc td.num { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
  .rc .best { color: #047857; font-weight: 700; background: #ecfdf5; }
  .rc .worst { color: #be123c; font-weight: 600; }
  .rc .place { display: inline-block; min-width: 26px; margin-left: 6px; padding: 0 4px; border-radius: 9px; font-size: 10px; font-weight: 600; text-align: center; background: #f3f4f6; color: #4b5563; }
  .rc .place.p1 { background: #fde68a; color: #78350f; }
  .rc .place.p2 { background: #e5e7eb; color: #374151; }
  .rc .place.p3 { background: #fed7aa; color: #7c2d12; }
  .rc .leaders { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; }
  .rc .leaders li { border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; font-size: 11px; }
  .rc .leaders b { color: #047857; }
  .rc .legend { font-size: 11px; color: #6b7280; margin: 4px 0 0; }
  .rc .answer { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; margin: 8px 0 14px; break-inside: avoid-page; }
  .rc .answer h3 { margin: 0 0 6px; font-size: 14px; }
`;

function placeBadge(place: number | null): string {
  if (place == null) return "";
  const cls = place <= 3 ? ` p${place}` : "";
  return `<span class="place${cls}">${ordinal(place)}</span>`;
}

function sectionHtml(section: MetricSection, stats: ColumnStats[], costUnit: CostUnit): string {
  const rows = section.rows.filter((row) => stats.some((s) => row.pick(s) != null));
  if (rows.length === 0) return "";
  const head = `<tr><th>Metric</th>${stats.map((s) => `<th>${esc(s.agentName)}</th>`).join("")}</tr>`;
  const body = rows
    .map((row) => {
      const places = rankRow(row, stats);
      const highlights = computeRowHighlights(row, stats);
      const cells = stats
        .map((s) => {
          const hl = highlights[s.columnId];
          const cls = hl ? ` ${hl}` : "";
          return `<td class="num${cls}">${esc(row.format(row.pick(s), costUnit))}${placeBadge(places[s.columnId] ?? null)}</td>`;
        })
        .join("");
      return `<tr><td>${esc(row.label)}</td>${cells}</tr>`;
    })
    .join("");
  return `<h2>${esc(section.title)}</h2><table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function standingsHtml(ranking: RunsRanking): string {
  if (!ranking.standings.some((s) => s.ranked > 0)) return "";
  const grid = standingsGrid(ranking);
  const head = `<tr>${grid.headers
    .map((h, i) => `<th${i <= 1 ? ' style="text-align:left"' : ""}>${esc(h)}</th>`)
    .join("")}</tr>`;
  const body = ranking.standings
    .map(
      (s) =>
        `<tr${s.place === 1 ? ' class="best"' : ""}><td>${s.place > 0 ? placeBadge(s.place) : "—"}</td><td style="text-align:left">${esc(s.name)}</td><td class="num">${s.wins}</td><td class="num">${s.averagePlace != null ? s.averagePlace.toFixed(1) : "—"}</td><td class="num">${s.ranked}</td></tr>`,
    )
    .join("");
  const leaders = ranking.leaders.length
    ? `<ul class="leaders">${ranking.leaders
        .map((l) => `<li>${esc(l.label)}: <b>${esc(l.leaders.join(", "))}</b> · ${esc(l.value)}</li>`)
        .join("")}</ul>`
    : "";
  return `<h2>Standings</h2><table><thead>${head}</thead><tbody>${body}</tbody></table>${leaders}`;
}

/** The comparison report as body HTML plus its stylesheet. */
export function runsReportHtml(state: RootState, costUnit: CostUnit): {
  title: string;
  body: string;
  css: string;
} {
  const { title, snap, stats, sections, ranking } = reportParts(state, costUnit);
  const parts: string[] = [
    `<h1>${esc(title)}</h1>`,
    ...setupLines(snap).map((l) => `<p class="rc-sub">${esc(l)}</p>`),
    standingsHtml(ranking),
    ...sections.map((sec) => sectionHtml(sec, stats, costUnit)),
    `<p class="legend">Green is the best value in a row, red the worst; the badge is each column's place on that metric.</p>`,
  ];
  if (snap?.shared_request) {
    parts.push(
      `<h2>Request</h2>`,
      markdownToHtml(snap.shared_request.message || "_(no typed message)_"),
    );
  }
  if (snap && snap.columns.length > 0) {
    parts.push(`<h2>Answers</h2>`);
    for (const c of snap.columns) {
      parts.push(
        `<div class="answer"><h3>${esc(c.label)}</h3>${markdownToHtml(
          c.answer || (c.error ? `**Error:** ${c.error}` : "_No answer yet._"),
        )}</div>`,
      );
    }
  }
  return { title, body: `<div class="rc">${parts.join("")}</div>`, css: REPORT_CSS };
}
