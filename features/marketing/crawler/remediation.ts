/**
 * The ONE runner for a finding's typed remediation binding.
 *
 * A deterministic SEO check that cannot run because evidence is missing
 * answers `n_a` and attaches a `Remediation` — `{command, scope, label,
 * explainer}` — which the server persists verbatim into
 * `web.analysis_result.metadata.remediation`. The sentence the user reads
 * carries the MEANING ("We haven't checked this page's links yet"); this
 * binding carries the ACTION. Neither ever tells them to run a command.
 *
 * WHY THE BINDING LIVES ON THE RESULT ROW, NOT IN `platform.assists`:
 * an assist is a personal, deduped, addressed item — the ambient/page chip
 * layer. These are per-page EVIDENCE rows: one crawled site emits thousands of
 * `n_a` results (pages × blocked checks), all pointing at the same two or
 * three site-wide commands. Minting assist rows for them would flood the
 * ledger and break the assists doctrine's "loud, never nagging" law, and the
 * button belongs ON the finding anyway. So the row carries the binding and
 * this module is its runner — ONE path, no second mechanism, and it dispatches
 * to the SAME `direct-client` crawler commands every other surface uses.
 *
 * Source of truth for the shape: `matrx_scraper/seo_audit.py::Remediation`
 * (mirrored in `features/marketing/seo/audit/checks.ts`, parity-tested).
 */

import {
  checkSiteLinks,
  fetchPageNow,
  rescrapeSite,
  type CrawlStreamCallbacks,
  type CrawlStreamResult,
} from "@/features/marketing/crawler/direct-client";

/** Every command a remediation may name. Unknown values are ignored, loudly. */
export const REMEDIATION_COMMANDS = [
  "links_check",
  "page_fetch",
  "site_recrawl",
] as const;

export type RemediationCommand = (typeof REMEDIATION_COMMANDS)[number];

export interface Remediation {
  command: RemediationCommand;
  scope: "site" | "page";
  /** The button's verb, authored server-side in the user's language. */
  label: string;
  /** What will happen, shown BEFORE it happens. */
  explainer: string;
}

function isRemediationCommand(value: unknown): value is RemediationCommand {
  return (
    typeof value === "string" &&
    (REMEDIATION_COMMANDS as readonly string[]).includes(value)
  );
}

/**
 * Read the binding off an `analysis_result.metadata` jsonb blob.
 *
 * Returns null for anything malformed rather than throwing — a cosmetic
 * problem in one persisted row must never break the surface that renders it
 * (the reconcile-don't-raise rule). An unknown `command` is a scraper deploy
 * newer than this client; it degrades to "no button", never a broken one.
 */
export function readRemediation(metadata: unknown): Remediation | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const raw = (metadata as { remediation?: unknown }).remediation;
  if (typeof raw !== "object" || raw === null) return null;
  const { command, scope, label, explainer } = raw as Record<string, unknown>;
  if (!isRemediationCommand(command)) return null;
  if (scope !== "site" && scope !== "page") return null;
  if (typeof label !== "string" || !label.trim()) return null;
  if (typeof explainer !== "string" || !explainer.trim()) return null;
  return { command, scope, label, explainer };
}

export interface RemediationTarget {
  siteId: string;
  /** Required for a `page`-scoped command; ignored otherwise. */
  pageUrl?: string | null;
}

/**
 * Run one remediation through the existing crawler command endpoints. Streams
 * exactly like every other command; the caller refreshes its queries after.
 */
export function runRemediation(
  remediation: Remediation,
  target: RemediationTarget,
  callbacks?: CrawlStreamCallbacks,
): Promise<CrawlStreamResult> {
  switch (remediation.command) {
    case "links_check":
      return checkSiteLinks(target.siteId, callbacks);
    case "site_recrawl":
      return rescrapeSite(target.siteId, callbacks);
    case "page_fetch": {
      if (!target.pageUrl) {
        // A page-scoped fix with no page is a wiring bug in the caller, not a
        // user problem — say so plainly instead of firing a wrong command.
        return Promise.reject(
          new Error(
            "This fix applies to a single page, but no page address was available.",
          ),
        );
      }
      return fetchPageNow(target.siteId, target.pageUrl, callbacks);
    }
  }
}
