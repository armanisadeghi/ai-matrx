#!/usr/bin/env npx tsx
/**
 * `pnpm ledger:census-window` — EVERY PRODUCTION LEDGER ROW APPLIED OUTSIDE THE 1–4 AM PACIFIC
 * WINDOW SINCE 2026-09-20, WITH WHATEVER ATTRIBUTION EXISTS (lane LEDGER-LANE, 2026-09-23).
 *
 * Nothing is backfilled. For each row this prints what is actually on record, and says where it
 * came from:
 *   · the ledger itself — `chair_step` (who named it with --confirm-chair-step), the attribution
 *     columns once they exist, the lane and attribution inside every rebase receipt;
 *   · git — the commit that FIRST put the file into `migrations/LEDGER.json` (matrx-frontend) or
 *     `db/migrations/LEDGER.json` (aidream). The runner writes that snapshot on every production
 *     apply, so the commit that carries the entry is usually the applying lane's own commit.
 *     That is a lead, not proof: a peer sweep can carry another lane's snapshot line.
 *
 * READ-ONLY: the session is `default_transaction_read_only = on`. `--since=YYYY-MM-DD` (Pacific
 * date, default 2026-09-20), `--target` (default production), `--json` for machine output.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { parseTargetFlag } from "./lib/migration-target";
import { connectReadOnly, PT_HHMM_SQL } from "./ledger-who";

const ROOT = process.cwd();
/** More entries than this in one commit = a bulk snapshot write, not one lane's apply. */
const BULK_ENTRIES = 25;
/** A snapshot commit is credited only when it lands within this long after the apply. */
const CREDIT_WINDOW_MS = 24 * 3600 * 1000;

interface SnapshotCommit {
  sha: string;
  when: string;
  subject: string;
  repo: string;
}

/** filename -> the earliest commit (since `since`) whose diff ADDED it to a LEDGER.json snapshot. */
function snapshotCommits(since: string): Map<string, SnapshotCommit> {
  const out = new Map<string, SnapshotCommit>();
  const repos: Array<[string, string, string]> = [
    ["matrx-frontend", ROOT, "migrations/LEDGER.json"],
    ["aidream", resolve(process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream")), "db/migrations/LEDGER.json"],
  ];
  for (const [repo, dir, file] of repos) {
    if (!existsSync(resolve(dir, file))) continue;
    let log: string;
    try {
      log = execFileSync(
        "git",
        ["-C", dir, "log", "--reverse", `--since=${since}T00:00:00-07:00`, "--format=@@%H%x09%aI%x09%s", "-p", "--unified=0", "--", file],
        { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 },
      );
    } catch {
      continue;
    }
    // A commit that adds MANY entries at once is the snapshot's creation or the nightly whole
    // refresh — it names nobody's apply, so it is never credited (BULK_ENTRIES).
    const commits: Array<{ c: SnapshotCommit; files: string[] }> = [];
    for (const line of log.split("\n")) {
      if (line.startsWith("@@") && line.includes("\t") && !line.startsWith("@@ -")) {
        const [sha, when, ...subj] = line.slice(2).split("\t");
        commits.push({ c: { sha: sha!.slice(0, 10), when: when!, subject: subj.join("\t"), repo }, files: [] });
        continue;
      }
      const m = line.match(/^\+\s*"filename":\s*"([^"]+)"/);
      if (m && commits.length) commits[commits.length - 1]!.files.push(m[1]!);
    }
    for (const { c, files } of commits) {
      if (files.length > BULK_ENTRIES) continue;
      for (const f of files) if (!out.has(`${repo}:${f}`)) out.set(`${repo}:${f}`, c);
    }
  }
  return out;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const since = argv.find((a) => a.startsWith("--since="))?.slice(8) ?? "2026-09-20";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    console.error(`--since must be YYYY-MM-DD, got ${since}`);
    return 2;
  }
  const target = parseTargetFlag(argv);
  const client = await connectReadOnly(target, "ledger:census-window (read-only)");
  let rows: Array<{ j: Record<string, unknown>; pt: string; pt_hhmm: number }>;
  try {
    const r = await client.query<{ j: Record<string, unknown>; pt: string; pt_hhmm: number }>(
      `select to_jsonb(m) - 'checksum' as j,
              to_char(m.applied_at at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI:SS') as pt,
              ${PT_HHMM_SQL("m.applied_at")} as pt_hhmm
         from public._schema_migrations m
        where m.applied_at >= ($1::date::timestamp at time zone 'America/Los_Angeles')
          and not (${PT_HHMM_SQL("m.applied_at")} between 100 and 400)
        order by m.applied_at`,
      [since],
    );
    rows = r.rows;
  } finally {
    await client.end().catch(() => {});
  }
  const snaps = snapshotCommits(since);
  const report = rows.map(({ j, pt }) => {
    const receipts = Array.isArray(j.rebase_receipts) ? (j.rebase_receipts as Array<Record<string, unknown>>) : [];
    const repo = String(j.source) === "aidream" ? "aidream" : "matrx-frontend";
    const found = snaps.get(`${repo}:${String(j.filename)}`) ?? null;
    const appliedMs = Date.parse(String(j.applied_at));
    const snap =
      found && Date.parse(found.when) >= appliedMs - 60_000 && Date.parse(found.when) - appliedMs <= CREDIT_WINDOW_MS
        ? found
        : null;
    const chair = typeof j.chair_step === "string" ? j.chair_step : null;
    const namedBy = chair?.match(/named with --confirm-chair-step by (\S+)/)?.[1] ?? null;
    return {
      applied_pt: pt,
      source: String(j.source),
      filename: String(j.filename),
      lane: (j.applied_by_lane as string | null | undefined) ?? null,
      os_user: (j.applied_by_os_user as string | null | undefined) ?? null,
      host: (j.applied_by_host as string | null | undefined) ?? null,
      session: (j.applied_by_session as string | null | undefined) ?? null,
      chair_step_named_by: namedBy,
      rebase_lanes: receipts.map((x) => String(x.lane ?? "(none)")),
      snapshot_commit: snap,
    };
  });
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ target, since, rows: report }, null, 2));
    return 0;
  }
  console.log(
    `ledger:census-window — --target ${target}, rows applied since ${since} (Pacific) OUTSIDE ` +
      `01:00–04:00 Pacific: ${report.length}`,
  );
  console.log(`applied (PT)         | source/filename | ledger attribution | chair step named by | first LEDGER.json commit`);
  for (const r of report) {
    const attr = r.os_user
      ? `lane ${r.lane ?? "-"}, ${r.os_user}@${r.host}${r.session ? `, ${r.session}` : ""}`
      : "none recorded";
    const snap = r.snapshot_commit
      ? `${r.snapshot_commit.repo} ${r.snapshot_commit.sha} "${r.snapshot_commit.subject.slice(0, 90)}"`
      : "no per-apply snapshot commit";
    console.log(
      `${r.applied_pt} | ${r.source}/${r.filename} | ${attr}` +
        `${r.rebase_lanes.length ? ` (rebased by ${r.rebase_lanes.join(", ")})` : ""} | ` +
        `${r.chair_step_named_by ?? "-"} | ${snap}`,
    );
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`ledger:census-window failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  },
);
