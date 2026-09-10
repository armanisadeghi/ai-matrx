#!/usr/bin/env npx tsx
/**
 * `pnpm review-queue:sweep` — THE MIDDLE STAGE, MADE OPERATIONAL.
 *
 * Arman, 2026-09-07: *"I'm trying to find what you need me to review in
 * agent-review but I can't seem to find it — it's one of the biggest weaknesses
 * of the system."*
 *
 * The pipeline the `agent-review-queue` skill defines has three stages —
 * an agent FILES at `submitted`, an INDEPENDENT agent reviews and promotes to
 * `ready_for_human`, and only then does Arman see it. On 2026-09-07 the live
 * split was 573 `submitted` against 74 `ready_for_human`, with the oldest
 * submission from 2026-07-24: the promotion stage had no worker that could keep
 * up (`agent-review-first-pass` processes exactly ONE row per 30-minute window,
 * and 182 of those rows were not even eligible for it — no triage envelope, or
 * no `browser` tool). So nearly everything agents build was invisible to him by
 * design, not by accident.
 *
 * This script is the entry point for a review pass: it shows the backlog
 * grouped by lane and repository, with each row's DIRECT URL, and points to the
 * canonical claim protocol a reviewer agent runs next. It is a REPORT — it changes no
 * row. Promotion still happens through the skill's atomic claim + evidence SQL,
 * run by an agent that did not build the thing.
 *
 * Usage:
 *   pnpm review-queue:sweep                    # submitted rows older than 24h
 *   pnpm review-queue:sweep --hours 0          # every submitted row
 *   pnpm review-queue:sweep --lane print-package
 *   pnpm review-queue:sweep --repo matrx-frontend --limit 40
 *   pnpm review-queue:sweep --json             # machine-readable
 *
 * No schedule is created here. Per the no-unapproved-schedules law
 * (common-docs/policies/no-unapproved-schedules.md) a recurring sweep is
 * PROPOSED in common-docs/operations/scheduled-tasks.md and waits for Arman's
 * approval by exact name and interval.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { unwrapRows } from "../lib/integrity/unwrap";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Where a reviewer (or Arman) opens a row. Never a "find it in the queue". */
const REVIEW_BASE =
  "https://manage.aimatrx.com/administration/users/agent-review";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

type SweepRow = {
  id: string;
  title: string;
  url: string;
  repo_slug: string;
  agent_label: string | null;
  lane: string | null;
  priority: string | null;
  assignment_state: string | null;
  has_triage: boolean;
  has_browser_tool: boolean;
  has_conversation: boolean;
  age_hours: number;
};

function loadEnv(): { url: string; key: string } | null {
  const env: Record<string, string> = {};
  // ONE name for the Supabase URL — no second candidate, no fallback chain.
  const want = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"];
  for (const k of want) if (process.env[k]) env[k] = process.env[k] as string;

  if (!env.SUPABASE_SECRET_KEY || !env.NEXT_PUBLIC_SUPABASE_URL) {
    for (const f of [
      ".env.local",
      ".env.production.local",
      ".env.production",
      ".env",
    ]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const [, k, raw] = m;
        if (want.includes(k as string) && !env[k as string])
          env[k as string] = (raw ?? "").replace(/^['"]|['"]$/g, "");
      }
    }
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = env.SUPABASE_SECRET_KEY ?? "";
  return url && key ? { url, key } : null;
}

function argValue(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1] as string;
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : null;
}

/** SQL string literal — the two filters below are the only user input. */
function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildQuery(opts: {
  hours: number;
  lane: string | null;
  repo: string | null;
  limit: number;
}): string {
  const filters = [
    `status = 'submitted'`,
    `created_at < now() - interval '${opts.hours} hours'`,
  ];
  if (opts.lane)
    filters.push(`metadata->'origin'->>'agent_label' = ${quote(opts.lane)}`);
  if (opts.repo) filters.push(`repo_slug = ${quote(opts.repo)}`);

  return `
    select
      id::text as id,
      title,
      url,
      repo_slug,
      metadata->'origin'->>'agent_label' as agent_label,
      metadata->'triage'->>'lane' as lane,
      metadata->'triage'->>'priority' as priority,
      metadata->'triage'->'assignment'->>'state' as assignment_state,
      (metadata->'triage' is not null) as has_triage,
      (metadata->'triage'->'required_tools' @> '["browser"]'::jsonb) as has_browser_tool,
      (conversation_id is not null) as has_conversation,
      round(extract(epoch from (now() - created_at)) / 3600.0)::int as age_hours
    from agent.review_queue
    where ${filters.join("\n      and ")}
    order by created_at asc
    limit ${opts.limit}
  `;
}

const COUNTS_QUERY = `
  select status, count(*)::int as count
  from agent.review_queue
  group by status
  order by count desc
`;

function groupCount<T>(rows: T[], key: (row: T) => string): [string, number][] {
  const map = new Map<string, number>();
  for (const row of rows) map.set(key(row), (map.get(key(row)) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function printGroup(
  title: string,
  rows: SweepRow[],
  key: (row: SweepRow) => string,
): void {
  console.log(`\n${C.bold}${title}${C.reset}`);
  for (const [label, count] of groupCount(rows, key)) {
    console.log(`  ${String(count).padStart(4)}  ${label}`);
  }
}

async function main(): Promise<number> {
  const env = loadEnv();
  if (!env) {
    console.error(
      `${C.red}Supabase credentials absent${C.reset} — this sweep reads the live queue and cannot guess.\n` +
        `Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (they are already in matrx-frontend/.env.local).`,
    );
    return 2;
  }

  const hours = Number(argValue("hours") ?? 24);
  const lane = argValue("lane");
  const repo = argValue("repo");
  const limit = Number(argValue("limit") ?? 60);
  const asJson = process.argv.includes("--json");

  if (!Number.isFinite(hours) || hours < 0) {
    console.error(`${C.red}--hours must be a non-negative number${C.reset}`);
    return 2;
  }
  if (!Number.isFinite(limit) || limit < 1) {
    console.error(`${C.red}--limit must be a positive number${C.reset}`);
    return 2;
  }

  const supabase = createClient(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function run<T>(query: string): Promise<T[]> {
    const { data, error } = await supabase.rpc("execute_admin_query", {
      query,
    });
    if (error) throw new Error(error.message);
    return unwrapRows(data) as unknown as T[];
  }

  let counts: { status: string; count: number }[];
  let rows: SweepRow[];
  try {
    [counts, rows] = await Promise.all([
      run<{ status: string; count: number }>(COUNTS_QUERY),
      run<SweepRow>(buildQuery({ hours, lane, repo, limit })),
    ]);
  } catch (err) {
    console.error(`${C.red}Queue read failed${C.reset} — ${String(err)}`);
    return 2;
  }

  if (asJson) {
    console.log(JSON.stringify({ counts, rows }, null, 2));
    return 0;
  }

  const byStatus = new Map(counts.map((c) => [c.status, c.count]));
  const submitted = byStatus.get("submitted") ?? 0;
  const readyForHuman = byStatus.get("ready_for_human") ?? 0;

  console.log(
    `\n${C.bold}Agent review sweep${C.reset} ${C.dim}— submitted rows older than ${hours}h${lane ? `, lane ${lane}` : ""}${repo ? `, repo ${repo}` : ""}${C.reset}`,
  );
  console.log(
    `${C.cyan}Pipeline:${C.reset} ` +
      counts.map((c) => `${c.status}=${c.count}`).join("  "),
  );
  if (submitted > readyForHuman) {
    console.log(
      `${C.yellow}${submitted} rows sit at 'submitted' against ${readyForHuman} at 'ready_for_human'.${C.reset} ` +
        `Only 'ready_for_human' reaches Arman — everything above is invisible to him until an independent reviewer promotes it.`,
    );
  }

  if (rows.length === 0) {
    console.log(`\n${C.green}Nothing matches this sweep.${C.reset}`);
    return 0;
  }

  printGroup("Backlog by lane (metadata.origin.agent_label)", rows, (row) =>
    row.agent_label ? row.agent_label : "(no lane tag — THE LANE TAG RULE)",
  );
  printGroup("Backlog by repository", rows, (row) => row.repo_slug);

  const blocked = rows.filter(
    (row) => !row.has_triage || !row.has_browser_tool || !row.has_conversation,
  );
  if (blocked.length > 0) {
    console.log(
      `\n${C.yellow}${blocked.length} of these ${rows.length} rows are NOT eligible for the 'agent-review-first-pass' worker${C.reset} ` +
        `(missing triage envelope, no 'browser' required tool, or no conversation). Reconcile malformed routing/conversations through the skill; leave non-browser work in its appropriate lane.`,
    );
  }

  console.log(`\n${C.bold}Rows (oldest first)${C.reset}`);
  for (const row of rows) {
    const flags = [
      row.has_triage ? null : "no-triage",
      row.has_browser_tool ? null : "no-browser-tool",
      row.has_conversation ? null : "no-conversation",
      row.assignment_state && row.assignment_state !== "ready"
        ? `assignment=${row.assignment_state}`
        : null,
    ].filter(Boolean);
    console.log(
      `\n  ${C.bold}${row.title}${C.reset}\n` +
        `    ${REVIEW_BASE}/${row.id}\n` +
        `    ${C.dim}${row.age_hours}h old · ${row.repo_slug} · lane ${row.agent_label ?? "—"} · ${row.lane ?? "no lane"} · ${row.priority ?? "no priority"}${flags.length ? ` · ${C.yellow}${flags.join(", ")}` : ""}${C.reset}\n` +
        `    ${C.dim}target: ${row.url}${C.reset}`,
    );
  }

  console.log(`
${C.bold}What a reviewer agent does next${C.reset}
  Read .claude/skills/agent-review-queue/SKILL.md for the current selection,
  atomic ownership, conversation, repair, and independent verification protocol.
  This report is ordered by age; it does not select or authorize a claim.
  Never claim the oldest displayed row merely because it appears first.

  The recurring worker claims its schedule window and proves the in-app Browser
  admin session before the skill's atomic candidate claim. Preserve active owners;
  repair routing defects from current evidence instead of bypassing eligibility.
  On a defect, own the repair and follow independent live verification in this run.
  A finding or status change alone is not completion. Record fresh, attributed
  evidence and re-read every mutation; only an independent reviewer promotes.
`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(
      `${C.red}review-queue:sweep crashed${C.reset} — ${String(err)}`,
    );
    process.exit(2);
  });
