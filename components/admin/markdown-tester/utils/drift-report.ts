// components/admin/markdown-tester/utils/drift-report.ts
// THE full block-parser drift report: one self-describing XML block — route,
// tool, source, Redux mode, server address, timings, per-row status, the
// CDATA contents of every drifting row and the full raw input — built to be
// pasted straight into an agent prompt. Shared by the Markdown Studio's
// Analysis view ("Copy full report") and the admin tester.

import type { ReduxParseMode } from "./run-redux-parser";
import type { DiffCell, DiffReport } from "./diff-blocks";

export interface DriftReportInput {
  raw: string;
  report: DiffReport;
  timings: { v2: number; redux: number; server: number };
}

function xmlAttr(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Wrap text in CDATA, neutralizing any embedded `]]>` so the block stays valid. */
function cdata(text: string): string {
  return `<![CDATA[${text.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

export interface DriftReportContext {
  route: string;
  tool: string;
  source: string;
  reduxMode: ReduxParseMode;
  serverUrl: string;
}

/**
 * Builds a single self-describing XML block: route + what was clicked + the
 * raw input + per-row drift, with the actual block content for every drifting
 * row. Designed to be pasted straight into an agent prompt with zero extra
 * context — drop it in and go.
 */
export function buildDriftReportXml(
  result: DriftReportInput,
  ctx: DriftReportContext,
): string {
  const r = result.report;
  const out: string[] = [];
  out.push(`<block-parser-drift-report>`);
  out.push(`  <context>`);
  out.push(`    <route>${xmlAttr(ctx.route)}</route>`);
  out.push(`    <tool>${xmlAttr(ctx.tool)}</tool>`);
  out.push(`    <source>${xmlAttr(ctx.source)}</source>`);
  out.push(`    <redux-mode>${xmlAttr(ctx.reduxMode)}</redux-mode>`);
  out.push(`    <server-url>${xmlAttr(ctx.serverUrl)}</server-url>`);
  out.push(`    <input-chars>${result.raw.length}</input-chars>`);
  out.push(
    `    <timing v2-ms="${result.timings.v2.toFixed(1)}" redux-ms="${result.timings.redux.toFixed(1)}" server-ms="${result.timings.server.toFixed(1)}" />`,
  );
  out.push(
    `    <baseline>V2 (every redux/server diff is measured against the V2 block at the same index)</baseline>`,
  );
  out.push(`  </context>`);
  out.push(`  <summary>`);
  out.push(`    <drift-rows>${r.driftCount} of ${r.rows.length}</drift-rows>`);
  out.push(
    `    <byte-equality v2-vs-redux="${(r.v2VsRedux * 100).toFixed(1)}%" v2-vs-server="${(r.v2VsServer * 100).toFixed(1)}%" redux-vs-server="${(r.reduxVsServer * 100).toFixed(1)}%" />`,
  );
  out.push(`  </summary>`);
  out.push(`  <rows>`);
  for (const row of r.rows) {
    const drift =
      row.v2.status !== "match" ||
      row.redux.status !== "match" ||
      row.server.status !== "match";
    out.push(`    <row index="${row.index}" drift="${drift}">`);
    const cellLine = (name: string, cell: DiffCell) =>
      `      <${name} type="${xmlAttr(cell.block?.type ?? "—")}" status="${cell.status}" chars="${cell.block?.content.length ?? 0}"${cell.firstDiffAt >= 0 ? ` first-diff-char="${cell.firstDiffAt}"` : ""} />`;
    out.push(cellLine("v2", row.v2));
    out.push(cellLine("redux", row.redux));
    out.push(cellLine("server", row.server));
    if (drift) {
      out.push(`      <contents>`);
      out.push(`        <v2>${cdata(row.v2.block?.content ?? "")}</v2>`);
      out.push(
        `        <redux>${cdata(row.redux.block?.content ?? "")}</redux>`,
      );
      out.push(
        `        <server>${cdata(row.server.block?.content ?? "")}</server>`,
      );
      out.push(`      </contents>`);
    }
    out.push(`    </row>`);
  }
  out.push(`  </rows>`);
  out.push(`  <raw-input>${cdata(result.raw)}</raw-input>`);
  out.push(`</block-parser-drift-report>`);
  return out.join("\n");
}
