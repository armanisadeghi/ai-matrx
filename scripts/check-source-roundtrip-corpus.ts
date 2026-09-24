#!/usr/bin/env npx tsx
/**
 * THE SOURCE ROUND-TRIP CORPUS — rich-content PLAN decision 6's gate, over EVERY stored row.
 *
 * "Switching between their rich text and our previews and displays will never make the core
 * data change unless we make that change into the rule." (Arman, 2026-09-23)
 *
 * For every stored text below, this runs the canonical `@ai-matrx/content-ir/source` tokenizer
 * and splice save and proves, per row:
 *
 *   join        tokenize → join is byte-identical to the stored text
 *   contiguous  blocks cover the text with no gap or overlap; code-point offsets agree
 *   noop_save   open → save with every block handed back unchanged = the original string
 *   edit_local  replacing the first and last prose block changes bytes ONLY inside that block,
 *               and every protected island outside it survives at its mapped position
 *
 * Sources: every row of the stored rich-text corpus (`scripts/lib/rich-content-corpus.ts`, shared
 * with the editor gate `check-rich-editor-roundtrip-corpus.ts`), READ ONLY — the session is set
 * read-only before the first query.
 *
 * PRIVACY: nothing a person wrote is ever printed. Failures report the row id (a chat part is
 * `<message id>#<part index>`) and the reason only.
 *
 * Usage:
 *   npx tsx scripts/check-source-roundtrip-corpus.ts               # every source, summary + failures
 *   … --only notes                   # one source (notes|chat|agent_messages|
 *                                                   #   template_messages|message_templates|skills)
 *   … --json <file>                  # also write the full report as JSON
 *   … --module <path>                # judge a candidate build of the package
 *
 * Exit 0 only when every row passes every check.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain, installBlockingStdio } from "./lib/exit-after-drain";
import {
  CORPUS_SOURCES,
  readCorpusSource,
  type CorpusSourceName,
} from "./lib/rich-content-corpus";

type SourceModule = typeof import("@ai-matrx/content-ir/source");

type SourceName = CorpusSourceName;
const SOURCES = CORPUS_SOURCES;

interface SourceStats {
  rows: number;
  identical: number;
  chars: number;
  islands: number;
  incompleteIslands: number;
  failures: Array<{ id: string; reason: string }>;
  slow: Array<{ id: string; ms: number }>;
}

const args = process.argv.slice(2);
const argValue = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};
const only = argValue("--only") as SourceName | undefined;
const jsonOut = argValue("--json");
const modulePath = argValue("--module");
const SLOW_MS = 2000;

const islandTypeCounts = new Map<string, number>();

/** Every check for one stored text. Returns the failure reason, or null. */
function judge(m: SourceModule, text: string, stats: SourceStats): string | null {
  const blocks = m.tokenizeSource(text);
  if (m.joinSource(blocks) !== text) return "join_not_identical";

  let cursor = 0;
  for (const block of blocks) {
    if (block.start !== cursor || block.end <= block.start) return "blocks_not_contiguous";
    cursor = block.end;
  }
  if (cursor !== text.length) return "blocks_do_not_cover_text";
  const cp = m.buildCodePointIndex(text);
  const last = blocks[blocks.length - 1];
  if (last && last.endCp !== cp.lengthCp) return "codepoint_offsets_disagree";

  for (const island of m.listIslands(blocks)) {
    stats.islands++;
    if (!island.complete) stats.incompleteIslands++;
    const key = `${island.inline ? "inline" : "block"}:${island.islandType}${island.complete ? "" : " (unclosed)"}`;
    islandTypeCounts.set(key, (islandTypeCounts.get(key) ?? 0) + 1);
  }

  const noop = m.spliceSave(text, blocks.map((block) => m.blockEdit(block, block.raw)), { blocks });
  if (noop.changed || noop.text !== text) return "noop_save_changed_bytes";

  const prose = blocks.filter((block) => block.kind === "prose");
  const targets = prose.length > 1 ? [prose[0], prose[prose.length - 1]] : prose;
  for (const target of targets) {
    if (!target) continue;
    const replacement = `${target.raw} [edited]`;
    const result = m.spliceSave(text, [m.blockEdit(target, replacement)], { blocks });
    const expected = text.slice(0, target.start) + replacement + text.slice(target.end);
    if (result.text !== expected) return "edit_changed_bytes_outside_block";
    if (!result.integrity.bytesOutsideEditsIdentical) return "edit_outside_bytes_differ";
    if (!result.integrity.ok) {
      const types = [...new Set(result.integrity.disturbed.map((island) => island.islandType))].join(",");
      return `edit_disturbed_islands:${types}`;
    }
  }
  return null;
}

async function main(): Promise<number> {
  installBlockingStdio();
  const m: SourceModule = modulePath
    ? ((await import(pathToFileURL(resolve(modulePath)).href)) as SourceModule)
    : await import("@ai-matrx/content-ir/source");

  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `UNMEASURED: no database connection — set ${env.missing.join(", ")} (looked in ${env.looked.join(", ") || "nothing"}).`,
    );
    return 2;
  }
  console.log(`Database connection from ${env.from}; session READ ONLY.`);
  const cx = await connectDirect(env, "source-roundtrip-corpus");
  await cx.query("set session characteristics as transaction read only");
  await cx.query("set statement_timeout = '120s'");

  const report: Record<string, SourceStats> = {};
  const started = Date.now();
  try {
    for (const source of SOURCES) {
      if (only && only !== source) continue;
      const stats: SourceStats = {
        rows: 0,
        identical: 0,
        chars: 0,
        islands: 0,
        incompleteIslands: 0,
        failures: [],
        slow: [],
      };
      report[source] = stats;
      for await (const row of readCorpusSource(cx, source)) {
        stats.rows++;
        stats.chars += row.text.length;
        const t0 = Date.now();
        let reason: string | null;
        try {
          reason = judge(m, row.text, stats);
        } catch (error) {
          reason = `threw:${error instanceof Error ? error.name : "unknown"}`;
        }
        const ms = Date.now() - t0;
        if (ms > SLOW_MS) stats.slow.push({ id: row.id, ms });
        if (reason) stats.failures.push({ id: row.id, reason });
        else stats.identical++;
        if (stats.rows % 20000 === 0) console.log(`  ${source}: ${stats.rows} rows…`);
      }
      console.log(
        `${source.padEnd(18)} rows ${String(stats.rows).padStart(7)}  identical ${String(stats.identical).padStart(7)}  failures ${String(stats.failures.length).padStart(4)}  islands ${stats.islands} (${stats.incompleteIslands} unclosed)  chars ${stats.chars}`,
      );
    }
  } finally {
    await cx.end();
  }

  const totals = Object.values(report).reduce(
    (acc, s) => ({ rows: acc.rows + s.rows, identical: acc.identical + s.identical }),
    { rows: 0, identical: 0 },
  );
  const byReason = new Map<string, number>();
  for (const stats of Object.values(report)) {
    for (const failure of stats.failures) byReason.set(failure.reason, (byReason.get(failure.reason) ?? 0) + 1);
  }
  console.log(`\nTOTAL rows ${totals.rows}, identical ${totals.identical}, failing ${totals.rows - totals.identical}  (${Math.round((Date.now() - started) / 1000)}s)`);
  for (const [reason, count] of [...byReason].sort((a, b) => b[1] - a[1])) console.log(`  ${reason}: ${count}`);
  for (const [source, stats] of Object.entries(report)) {
    for (const failure of stats.failures.slice(0, 200)) console.log(`  FAIL ${source} ${failure.id} ${failure.reason}`);
    for (const slow of stats.slow.slice(0, 50)) console.log(`  SLOW ${source} ${slow.id} ${slow.ms}ms`);
  }
  console.log("\nIsland census:");
  for (const [type, count] of [...islandTypeCounts].sort((a, b) => b[1] - a[1])) console.log(`  ${type}: ${count}`);

  if (jsonOut) {
    writeFileSync(
      jsonOut,
      JSON.stringify({ at: new Date().toISOString(), totals, report, islandTypes: Object.fromEntries(islandTypeCounts) }, null, 2),
    );
    console.log(`Report written to ${jsonOut}`);
  }
  return totals.rows === totals.identical ? 0 : 1;
}

main()
  .then((code) => exitAfterDrain(code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    exitAfterDrain(2);
  });
