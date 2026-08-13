"use client";

/**
 * Deterministic Assists producer for the SEO analysis findings register — the
 * bridge the Growth Loop calls `analyze -> suggest` (gap `G-FINDING-ASSIST`).
 *
 * The 15-check catalogue writes `web.analysis_result` (immutable evidence) and
 * reconciles a `web.finding` register on every full crawl. Until this file,
 * not one of those findings was ever OFFERED to the user — they existed only
 * for someone who thought to open the register. Now the highest-value ones
 * that have a real action available today become chips where the user stands.
 *
 * Producer rules honored (features/assists/FEATURE.md):
 * - Stable `dedupeKey` per (check, site, page); `filterUndecidedKeys` first, so
 *   a dismissal is durable — re-noticing across reloads never resurrects it.
 * - Capped per sweep (MAX_PER_SWEEP), `expiresAt` set on every emission.
 * - Cheapest-first: ONE indexed read over the register; zero tokens to notice.
 * - The action DOES something real, and a finding with no real action today
 *   never becomes a chip. The allowlist is `aiRemedyItemKeys()` — derived from
 *   the remedy registry, so a check whose only remedy is a copy-able manual
 *   instruction (a robots tag, a redirect, a hosting fix) can never produce a
 *   button with nothing behind it. Metadata checks rank first because their
 *   chain is complete end to end: chip -> SEO agent -> SERP proposals ->
 *   `ApplyMetaToPage` -> `updatePageIntent` writes the page.
 *
 * Sibling work deliberately NOT done here (each is its own gap): making the
 * finding lifecycle user-writable (`G-FINDING-TRACK`), the accepted-finding ->
 * CMS draft fix path (`G-FINDING-FIX`), and absorbing kg-suggestions
 * (`G-SUGGEST-FORK`). Each plugs into this producer rather than replacing it:
 * a new action on a finding is a new remedy in `finding-remedies.ts`, and it
 * starts producing chips here with no change to this file.
 *
 * System-of-record: /Users/armanisadeghi/code/common-docs/systems/assists/FEATURE.md
 */

import type { AppDispatch } from "@/lib/redux/store";
import { filterUndecidedKeys } from "@/features/assists/service";
import { emitAssistTracked } from "@/features/assists/redux/emitTracked";
import type { Assist, EmitAssistInput } from "@/features/assists/types";
import { listActionableOpenFindings } from "@/features/marketing/data/analysis-service";
import type { FindingListRow } from "@/features/marketing/data/analysis-types";
import {
  APPLIABLE_METADATA_KEYS,
  aiRemedyItemKeys,
  humanizeItemKey,
  resolveFindingRemedy,
} from "@/features/marketing/lib/finding-remedies";

const SOURCE_PREFIX = "seo.finding";

/**
 * The findings register's surface (`features/surfaces/manifests/
 * marketing-findings.manifest.ts`). Every row this producer writes is
 * addressed here; the strip component is mounted on the register, the
 * priority queue, and the audit workspace, so the chips meet the user
 * wherever findings are actually being read.
 */
export const FINDINGS_ASSIST_SURFACE = "matrx-user/marketing-findings";

/** One read, bounded. Ranking happens client-side over this slice. */
const READ_LIMIT = 200;
/** Loud, never nagging: at most three chips per site per sweep. */
const MAX_PER_SWEEP = 3;
/** Individual page-level chips (the rest of the budget goes to a rollup). */
const MAX_PAGE_CHIPS = 2;
/** A check has to be genuinely widespread before it earns a rollup chip. */
const ROLLUP_MIN_PAGES = 5;
const EXPIRES_MS = 14 * 24 * 60 * 60 * 1000;

const SEVERITY_RANK: Record<string, number> = {
  info: 0,
  low: 1,
  med: 2,
  high: 3,
  critical: 4,
};

/** Is this pending assist one of ours, addressed to this site? (Site scope
 * rides the dedupe key — the row's entity is the page, not the site.)
 *
 * Both families count: page chips (`seo.finding.<check>`) AND the rollup
 * (`seo.finding_rollup.<check>`). Matching on `"seo.finding."` alone silently
 * dropped every rollup from the page strip while it sat in the ledger and the
 * global dock — the exact "emitted but invisible where the user stands"
 * failure this producer exists to end. */
export function isFindingAssist(assist: Assist, siteId: string): boolean {
  return (
    assist.sourceKey.startsWith(SOURCE_PREFIX) &&
    (assist.dedupeKey?.includes(`:${siteId}:`) ?? false)
  );
}

/**
 * Rank: severity first, then the checks whose fix lands back on the page in
 * one click, then most-recently detected. A user with 200 open findings gets
 * offered the two that matter most, not the two the database returned first.
 */
function rankFinding(row: FindingListRow): number {
  const severity = (SEVERITY_RANK[row.severity ?? ""] ?? 0) * 10;
  const appliable = APPLIABLE_METADATA_KEYS.includes(row.item_key) ? 5 : 0;
  return severity + appliable;
}

function pageLabel(row: FindingListRow): string {
  return row.page_path || row.page_url || "this page";
}

function findingChip(
  row: FindingListRow,
  siteId: string,
  siteDomain: string | null,
  expiresAt: string,
): EmitAssistInput | null {
  const resolved = resolveFindingRemedy({
    itemKey: row.item_key,
    itemLabel: row.item_label,
    category: row.category,
    subcategory: row.subcategory,
    severity: row.severity,
    reasoning: row.reasoning,
    pageUrl: row.page_url,
    pagePath: row.page_path,
    siteDomain,
  });
  // Defensive, not decorative: the allowlist already excludes manual remedies,
  // but a remedy registered as manual after this sweep was written must never
  // silently become a chip whose verb button has nothing to run.
  if (resolved.remedy.kind !== "ai") return null;

  return {
    sourceKey: `${SOURCE_PREFIX}.${row.item_key}`,
    title: `${resolved.remedy.title} — ${pageLabel(row)}`,
    body: `${resolved.explanation}\n\n${resolved.remedy.summary}`,
    action: resolved.remedy.action,
    entityType: "web_page",
    entityId: row.page_id ?? undefined,
    surfaceName: FINDINGS_ASSIST_SURFACE,
    dedupeKey: `${SOURCE_PREFIX}.${row.item_key}:${siteId}:${row.page_id ?? row.id}`,
    expiresAt,
    priority: rankFinding(row),
  };
}

/**
 * One chip for a check failing across many pages. The action is a real door,
 * not advice: the register filtered to exactly that check, which is where the
 * user (or the sibling `G-FINDING-FIX` work) acts on the batch.
 */
function rollupChip(
  itemKey: string,
  rows: FindingListRow[],
  siteId: string,
  sitePath: string,
  truncated: boolean,
  expiresAt: string,
): EmitAssistInput | null {
  if (rows.length < ROLLUP_MIN_PAGES) return null;
  const label = rows[0].item_label || humanizeItemKey(itemKey);
  const count = `${rows.length}${truncated ? "+" : ""}`;
  const worst = rows.reduce(
    (acc, row) => Math.max(acc, SEVERITY_RANK[row.severity ?? ""] ?? 0),
    0,
  );
  return {
    sourceKey: `${SOURCE_PREFIX}_rollup.${itemKey}`,
    title: `${count} pages share one problem: ${label}`,
    body: `The same check fails on ${count} pages of this site. Opening the register filtered to this check shows every page it affects, each with its own one-click fix.`,
    action: {
      kind: "navigate",
      href: `${sitePath}/findings?f_item_key=text:${encodeURIComponent(itemKey)}`,
    },
    surfaceName: FINDINGS_ASSIST_SURFACE,
    dedupeKey: `${SOURCE_PREFIX}_rollup.${itemKey}:${siteId}:site`,
    expiresAt,
    priority: worst * 10 + 1,
  };
}

/**
 * One sweep for one site. A failed read is loud-but-contained: the sweep is
 * skipped (console.error), never a thrown error into a page render.
 */
export async function produceFindingAssists(args: {
  siteId: string;
  /** Brand-first base path for this site — the rollup chip's door. */
  sitePath: string;
  /** Domain, used in chip bodies and the agent's brief. */
  siteDomain: string | null;
  userId: string;
  dispatch: AppDispatch;
}): Promise<void> {
  const { siteId, sitePath, siteDomain, userId, dispatch } = args;
  const itemKeys = aiRemedyItemKeys();

  let read;
  try {
    read = await listActionableOpenFindings(siteId, itemKeys, READ_LIMIT);
  } catch (error) {
    console.error("[finding-assists] register read failed:", error);
    return;
  }
  if (read.rows.length === 0) return;
  const truncated = read.total > read.rows.length;

  const ranked = [...read.rows].sort((a, b) => rankFinding(b) - rankFinding(a));

  // Page chips: at most one per check, so a site failing one check on forty
  // pages does not spend the whole budget saying the same thing twice.
  const candidates: EmitAssistInput[] = [];
  const chippedKeys = new Set<string>();
  for (const row of ranked) {
    if (candidates.length >= MAX_PAGE_CHIPS) break;
    if (chippedKeys.has(row.item_key)) continue;
    const chip = findingChip(row, siteId, siteDomain, expiresAtIso());
    if (!chip) continue;
    chippedKeys.add(row.item_key);
    candidates.push(chip);
  }

  // Rollup: the most widespread check that did NOT already get a page chip.
  const byKey = new Map<string, FindingListRow[]>();
  for (const row of read.rows) {
    if (chippedKeys.has(row.item_key)) continue;
    const list = byKey.get(row.item_key);
    if (list) list.push(row);
    else byKey.set(row.item_key, [row]);
  }
  const widest = Array.from(byKey.entries()).sort(
    (a, b) => b[1].length - a[1].length,
  )[0];
  if (widest && candidates.length < MAX_PER_SWEEP) {
    const chip = rollupChip(
      widest[0],
      widest[1],
      siteId,
      sitePath,
      truncated,
      expiresAtIso(),
    );
    if (chip) candidates.push(chip);
  }

  if (candidates.length === 0) return;

  // Durable dismissal: a key the user ever decided is never re-emitted.
  const emittable = new Set(
    await filterUndecidedKeys(candidates.map((c) => c.dedupeKey)),
  );
  for (const candidate of candidates.slice(0, MAX_PER_SWEEP)) {
    if (!emittable.has(candidate.dedupeKey)) continue;
    await emitAssistTracked(userId, candidate, dispatch);
  }
}

function expiresAtIso(): string {
  return new Date(Date.now() + EXPIRES_MS).toISOString();
}
