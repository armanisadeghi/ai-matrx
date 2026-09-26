/**
 * features/admin/check-findings/model.ts — pure derivations for the check-findings page.
 *
 * No React, no I/O: the summary row per check, the accept command, and the rules that decide
 * which control an item gets. Unit-tested in `model.test.ts`.
 */

import type {
  CheckCatalogEntry,
  CheckItemState,
  CheckItemTally,
  CheckRunSummary,
} from "./service";

/**
 * Keys the store reserves for records ABOUT the check, never items (design §3; the DB accept
 * refuses all three). They are fixed by repairing the check, never accepted.
 */
export const RESERVED_ITEM_KEYS = ["__check__", "__summary__", "__malformed__"] as const;

export function isReservedKey(key: string): boolean {
  return (RESERVED_ITEM_KEYS as readonly string[]).includes(key);
}

export type StateFilter = "open" | "accepted" | "fixed" | "broken" | "retired";

/** One page filter → the store states it covers. `handed_off` is still open work. */
export const STATE_FILTER_STATES: Record<StateFilter, readonly CheckItemState[]> = {
  open: ["open", "handed_off"],
  accepted: ["accepted"],
  fixed: ["fixed"],
  broken: ["check_broken"],
  retired: ["check_retired"],
};

export const STATE_FILTER_LABELS: Record<StateFilter, string> = {
  open: "Open",
  accepted: "Accepted",
  fixed: "Fixed",
  broken: "Check broken",
  retired: "Retired",
};

export function isStateFilter(value: string | null): value is StateFilter {
  return value != null && value in STATE_FILTER_STATES;
}

export interface CheckSummaryRow {
  check: CheckCatalogEntry;
  run: CheckRunSummary | null;
  /** `open` + `handed_off` items that are real items (not reserved records). */
  openCount: number;
  handedOffCount: number;
  acceptedCount: number;
  retiredCount: number;
  /** Oldest `created_at` among open items, epoch ms; null when nothing is open. */
  oldestOpenAt: number | null;
  /** The `__check__` / `__summary__` / `__malformed__` records currently raised, with their words. */
  brokenReasons: string[];
  /** Last run + 2 × cadence is in the past (design F11: derived at read time, never stored). */
  overdue: boolean;
}

export function summarizeChecks(
  checks: readonly CheckCatalogEntry[],
  items: readonly CheckItemTally[],
  now: number,
): CheckSummaryRow[] {
  const byCheck = new Map<string, CheckItemTally[]>();
  for (const item of items) {
    const list = byCheck.get(item.check_id);
    if (list) list.push(item);
    else byCheck.set(item.check_id, [item]);
  }

  return checks.map((check) => {
    const own = byCheck.get(check.id) ?? [];
    let openCount = 0;
    let handedOffCount = 0;
    let acceptedCount = 0;
    let retiredCount = 0;
    let oldestOpenAt: number | null = null;
    const brokenReasons: string[] = [];
    for (const item of own) {
      if (isReservedKey(item.item_key)) {
        if (item.state === "open" || item.state === "check_broken") {
          brokenReasons.push(item.title?.trim() || item.item_key);
        }
        continue;
      }
      if (item.state === "open" || item.state === "handed_off") {
        openCount += 1;
        if (item.state === "handed_off") handedOffCount += 1;
        const at = Date.parse(item.created_at);
        if (!Number.isNaN(at) && (oldestOpenAt == null || at < oldestOpenAt)) oldestOpenAt = at;
      } else if (item.state === "accepted") {
        acceptedCount += 1;
      } else if (item.state === "check_retired") {
        retiredCount += 1;
      } else if (item.state === "check_broken") {
        brokenReasons.push(item.title?.trim() || item.item_key);
      }
    }
    const run = check.latest_run;
    const lastAt = run ? Date.parse(run.finished_at ?? run.started_at) : NaN;
    const overdue =
      check.is_active &&
      run != null &&
      !Number.isNaN(lastAt) &&
      check.live_every_seconds > 0 &&
      now - lastAt > 2 * check.live_every_seconds * 1000;
    return {
      check,
      run,
      openCount,
      handedOffCount,
      acceptedCount,
      retiredCount,
      oldestOpenAt,
      brokenReasons,
      overdue,
    };
  });
}

/** The two repositories a static check can live in (`proof_check.repo` CHECK). */
export type CheckRepo = "matrx-frontend" | "aidream";

export function isCheckRepo(value: string | null): value is CheckRepo {
  return value === "matrx-frontend" || value === "aidream";
}

/** POSIX single-quote, the same rule as `shellQuote` in scripts/findings/findings.mjs. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * The one-line accept command for an item with a repo home (P2-COMMANDS.md). It edits the
 * check's OWN allowlist with the reason, re-runs the check, and commits only that file
 * (plan C1) — so CI, hand runs and this page agree.
 */
export function acceptCommand(
  repo: CheckRepo,
  checkId: string,
  itemKey: string,
  reason: string,
): string {
  const tail = `accept ${checkId} ${shellQuote(itemKey)} --reason ${shellQuote(reason.trim() || "<why this is fine>")}`;
  return repo === "matrx-frontend"
    ? `pnpm findings ${tail}`
    : `uv run python scripts/findings.py ${tail}`;
}

/** The directory the command runs in, relative to the workspace root. */
export const REPO_DIRECTORY: Record<CheckRepo, string> = {
  "matrx-frontend": "matrx-frontend",
  aidream: "aidream",
};

/** Human wording for `accept_basis`. */
export function acceptBasisLabel(basis: string | null): string {
  switch (basis) {
    case "allowlist":
      return "Allowlist (reasoned)";
    case "baseline":
      return "Baseline (debt)";
    case "db":
      return "Database accept";
    default:
      return "—";
  }
}

// ── One-click Mark OK: the in-between state (ops.check_item.metadata.pending_accept) ──────────

/**
 * What the server recorded while committing an accept (aidream
 * `aidream/services/platform_checks/accept.py`, written only by `ops.check_item_accept_begin`
 * / `_finish`). The item stays `open` until the next ingested run reads the allowlist.
 */
export interface PendingAccept {
  status: "committing" | "landed" | "failed";
  at: string | null;
  byName: string | null;
  reason: string | null;
  commitSha: string | null;
  commitUrl: string | null;
  error: string | null;
  remedy: string | null;
  finishedAt: string | null;
}

const PENDING_STATUSES = ["committing", "landed", "failed"] as const;

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** The marker as stored (jsonb), read defensively: anything malformed is no marker. */
export function parsePendingAccept(value: unknown): PendingAccept | null {
  if (!isRecord(value)) return null;
  const v = value;
  const status = PENDING_STATUSES.find((s) => s === v.status);
  if (!status) return null;
  const by = isRecord(v.by) ? v.by : {};
  return {
    status,
    at: str(v.at),
    byName: str(by.name),
    reason: str(v.reason),
    commitSha: str(v.commit_sha),
    commitUrl: str(v.commit_url),
    error: str(v.error),
    remedy: str(v.remedy),
    finishedAt: str(v.finished_at),
  };
}

/** `ops.check_item.metadata` → its `pending_accept` marker, if any. */
export function pendingAcceptFromMetadata(metadata: unknown): PendingAccept | null {
  return isRecord(metadata) ? parsePendingAccept(metadata.pending_accept) : null;
}

/** How long a `committing` marker is trusted before it reads as interrupted (the DB reclaims at 5 min). */
export const COMMITTING_STALE_MS = 5 * 60_000;

export type PendingAcceptView =
  | { kind: "none" }
  | { kind: "committing" }
  | { kind: "interrupted" }
  | { kind: "landing"; pending: PendingAccept }
  | { kind: "still_reported"; pending: PendingAccept }
  | { kind: "failed"; pending: PendingAccept };

/**
 * The one honest sentence for an open item carrying a marker. `still_reported`: the commit landed,
 * yet a run that STARTED after it still reports the item — the accept did not take, and the page
 * must say so instead of "landing" forever.
 */
export function pendingAcceptView(
  state: string,
  pending: PendingAccept | null,
  latestRunStartedAt: string | null,
  now: number,
): PendingAcceptView {
  if (!pending || state === "accepted" || state === "fixed") return { kind: "none" };
  if (pending.status === "failed") return { kind: "failed", pending };
  if (pending.status === "committing") {
    const at = pending.at ? Date.parse(pending.at) : NaN;
    return Number.isFinite(at) && now - at > COMMITTING_STALE_MS ? { kind: "interrupted" } : { kind: "committing" };
  }
  const landedAt = pending.finishedAt ? Date.parse(pending.finishedAt) : NaN;
  const runAt = latestRunStartedAt ? Date.parse(latestRunStartedAt) : NaN;
  if (Number.isFinite(landedAt) && Number.isFinite(runAt) && runAt > landedAt) return { kind: "still_reported", pending };
  return { kind: "landing", pending };
}
