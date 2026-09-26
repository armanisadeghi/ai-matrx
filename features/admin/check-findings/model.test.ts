import { execFileSync } from "node:child_process";
import { acceptCommand, shellQuote, summarizeChecks } from "./model";
import type { CheckCatalogEntry, CheckItemTally, CheckRunSummary } from "./service";

const NOW = Date.parse("2026-09-26T12:00:00Z");

function run(overrides: Partial<CheckRunSummary> = {}): CheckRunSummary {
  return {
    id: "run-1",
    status: "completed",
    verdict: "fail",
    headline: null,
    started_at: "2026-09-26T11:00:00Z",
    finished_at: "2026-09-26T11:00:05Z",
    duration_ms: 5000,
    exit_code: 1,
    scan_complete: true,
    run_scope: "full",
    skipped_reason: null,
    git_sha: "abc",
    host: "local",
    new_count: 1,
    known_count: 0,
    findings_count: 1,
    malformed_count: 0,
    applied: true,
    apply_note: null,
    ...overrides,
  };
}

function check(id: string, latest: CheckRunSummary | null, cadenceSeconds = 3600): CheckCatalogEntry {
  return {
    id,
    stable_id: `stable-${id}`,
    repo: "matrx-frontend",
    label: `Check ${id}`,
    level: "error",
    command: "pnpm check:x",
    live_every_seconds: cadenceSeconds,
    is_active: true,
    itemized: true,
    last_verdict: latest?.verdict ?? null,
    latest_run: latest,
  };
}

function item(check_id: string, item_key: string, state: string, created_at: string, title: string | null = null): CheckItemTally {
  return { check_id, item_key, state, title, created_at, updated_at: created_at };
}

describe("summarizeChecks", () => {
  it("counts open + claimed items, keeps reserved records out of the counts, and reports them as broken", () => {
    const [row] = summarizeChecks(
      [check("a", run())],
      [
        item("a", "k1", "open", "2026-09-20T00:00:00Z"),
        item("a", "k2", "handed_off", "2026-09-10T00:00:00Z"),
        item("a", "k3", "accepted", "2026-09-01T00:00:00Z"),
        item("a", "__check__", "check_broken", "2026-09-25T00:00:00Z", "exit 2: module not found"),
        item("a", "__summary__", "open", "2026-09-25T00:00:00Z", "fail with no new item"),
      ],
      NOW,
    );
    expect(row.openCount).toBe(2);
    expect(row.handedOffCount).toBe(1);
    expect(row.acceptedCount).toBe(1);
    expect(row.oldestOpenAt).toBe(Date.parse("2026-09-10T00:00:00Z"));
    expect(row.brokenReasons).toEqual(["exit 2: module not found", "fail with no new item"]);
    expect(row.overdue).toBe(false);
  });

  it("derives overdue as last run + 2 x cadence, and never for a check that never ran", () => {
    const rows = summarizeChecks(
      [check("late", run({ finished_at: "2026-09-26T09:00:00Z" })), check("never", null)],
      [],
      NOW,
    );
    expect(rows[0].overdue).toBe(true);
    expect(rows[1].overdue).toBe(false);
    expect(rows[1].run).toBeNull();
  });
});

describe("acceptCommand", () => {
  it("is the P2-COMMANDS accept verb for each repo, with the key and reason shell-safe", () => {
    expect(acceptCommand("matrx-frontend", "visibility-vocabulary", "onlyYouClaim|a.tsx|*", "by design")).toBe(
      "pnpm findings accept visibility-vocabulary 'onlyYouClaim|a.tsx|*' --reason 'by design'",
    );
    expect(acceptCommand("aidream", "raw-sql-markers", "x.py", "it's fine")).toBe(
      "uv run python scripts/findings.py accept raw-sql-markers 'x.py' --reason 'it'\\''s fine'",
    );
  });

  it("round-trips any key through a real shell unchanged", () => {
    const key = `detector|path with spaces/it's "quoted" $HOME \`tick\`|*`;
    const out = execFileSync("bash", ["-c", `printf %s ${shellQuote(key)}`], { encoding: "utf8" });
    expect(out).toBe(key);
  });
});
