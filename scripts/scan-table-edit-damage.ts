#!/usr/bin/env npx tsx
/**
 * READ-ONLY census of tables possibly damaged by a table edit (verify-RC-B4 R4-1/R4-2).
 *
 * For every note version and every edited chat answer written since the table
 * writer went live, compare each table with the version before it, as read by
 * an INDEPENDENT GFM parser (scripts/lib/gfm-table-oracle.ts): a row whose
 * cell count changed, or a cell that became empty while its right-hand
 * neighbour grew by the old cell's text (R4-1 merge), is REPORTED — row id,
 * version, table, row, and what changed.
 *
 * It never writes. By Arman's law (2026-09-25) damaged data is reported to him,
 * never repaired by a script, SQL or an admin tool.
 *
 *   npx tsx scripts/scan-table-edit-damage.ts [--since 2026-09-24]
 */
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { oracleTableGrids } from "./lib/gfm-table-oracle";

const args = process.argv.slice(2);
const since = args[args.indexOf("--since") + 1] && args.includes("--since") ? args[args.indexOf("--since") + 1] : "2026-09-24";

interface Finding {
  source: string;
  id: string;
  version: string;
  table: number;
  row: number;
  change: string;
}

function compare(source: string, id: string, version: string, before: string, after: string, out: Finding[]): void {
  if (!before.includes("|") || !after.includes("|")) return;
  const a = oracleTableGrids(before);
  const b = oracleTableGrids(after);
  if (a.length !== b.length) return; // a table added or removed is an edit, not damage
  a.forEach((gridA, t) => {
    const gridB = b[t] ?? [];
    if (gridA.length !== gridB.length) return; // rows added/removed — not this class
    const columnsChanged = (gridA[0]?.length ?? 0) !== (gridB[0]?.length ?? 0);
    gridA.forEach((rowA, r) => {
      const rowB = gridB[r] ?? [];
      if (!columnsChanged && rowA.length !== rowB.length) {
        out.push({ source, id, version, table: t, row: r, change: `row went from ${rowA.length} to ${rowB.length} cells with the header unchanged` });
        return;
      }
      const nonEmptyA = rowA.filter((cell) => cell !== "").length;
      const nonEmptyB = rowB.filter((cell) => cell !== "").length;
      for (let c = 0; c + 1 < Math.max(rowA.length, rowB.length); c += 1) {
        const neighbourWas = rowA[c + 1] ?? "";
        const neighbourNow = rowB[c + 1] ?? "";
        // R4-1: the edited cell's text absorbed its right-hand neighbour, which emptied.
        if (neighbourWas !== "" && neighbourNow === "" && (rowB[c] ?? "").includes(`|${neighbourWas}`)) {
          out.push({ source, id, version, table: t, row: r, change: `cell ${c} absorbed neighbour ${c + 1} (${JSON.stringify(neighbourWas)})` });
          return;
        }
      }
      // R4-2: a stored cell split or two cells joined without the person clearing one.
      if (rowA.length === rowB.length && nonEmptyA - nonEmptyB >= 1 && rowB.some((cell, c) => cell.includes("|") && !(rowA[c] ?? "").includes("|"))) {
        out.push({ source, id, version, table: t, row: r, change: "a cell gained a pipe while another emptied" });
      }
    });
  });
}

async function main(): Promise<number> {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(`UNMEASURED: no database connection — set ${env.missing.join(", ")}.`);
    return 2;
  }
  const cx = await connectDirect(env, "scan-table-edit-damage");
  await cx.query("set session characteristics as transaction read only");
  const findings: Finding[] = [];
  try {
    const notes = await cx.query<{ row_id: string; version: number; content: string | null; prev: string | null }>(
      `select row_id, version, content, prev from (
         select row_id, version, occurred_at, row_data->>'content' as content,
                lag(row_data->>'content') over (partition by row_id order by version) as prev
         from history.row_versions where entity_type = 'note') v
       where occurred_at >= $1 and prev is not null and content is not null and content <> prev
         and content like '%|%'`,
      [since],
    );
    for (const row of notes.rows) compare("note", row.row_id, `v${row.version}`, row.prev ?? "", row.content ?? "", findings);

    const answers = await cx.query<{ id: string; content: string; history: string | null }>(
      `select id, content::text as content, content_history::text as history
       from chat.message
       where status = 'edited' and updated_at >= $1 and jsonb_typeof(content_history) = 'array'
         and jsonb_array_length(content_history) > 0 and content::text like '%|%'`,
      [since],
    );
    const textOf = (json: string | null): string => {
      if (!json) return "";
      try {
        // content is an array of parts; a content_history entry is { content: [...parts] }.
        const parsed = JSON.parse(json) as unknown;
        const inner = !Array.isArray(parsed) && parsed && typeof parsed === "object" && Array.isArray((parsed as { content?: unknown }).content)
          ? (parsed as { content: unknown[] }).content
          : parsed;
        const list = (Array.isArray(inner) ? inner : [inner]) as Array<{ type?: string; text?: string } | null>;
        return list.map((part) => (part?.type === "text" && typeof part.text === "string" ? part.text : "")).join("\n\n");
      } catch {
        return "";
      }
    };
    for (const row of answers.rows) {
      // Every edit in the answer's history, oldest first, then the current content.
      const history = (() => {
        try {
          return (JSON.parse(row.history ?? "[]") as unknown[]).map((entry) => JSON.stringify(entry));
        } catch {
          return [];
        }
      })();
      const versions = [...history, row.content];
      for (let i = 1; i < versions.length; i += 1) {
        compare("chat answer", row.id, `edit ${i} of ${versions.length - 1}`, textOf(versions[i - 1] ?? null), textOf(versions[i] ?? null), findings);
      }
    }
    console.log(`scanned ${notes.rowCount} note versions and ${answers.rowCount} edited answers since ${since}`);
  } finally {
    await cx.end();
  }
  if (!findings.length) {
    console.log("no table damaged by an edit was found");
    return 0;
  }
  for (const finding of findings) {
    console.log(`${finding.source} ${finding.id} ${finding.version} table ${finding.table} row ${finding.row}: ${finding.change}`);
  }
  return 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  },
);
