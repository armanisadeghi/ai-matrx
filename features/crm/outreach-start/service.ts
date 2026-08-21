// features/crm/outreach-start/service.ts
//
// THE DOOR from an SEO opportunity to a real conversation (outreach handoff
// §3 G1 + G9). An opportunity in `seo.*` names a DOMAIN; a person you can
// write to is a `crm.party`. This module is the one client-side bridge
// between the two, and it owns nothing of its own:
//
//   * the fold is the LIVE aidream contract (`seo_domains.py`) — the ONLY
//     sanctioned way a domain becomes a party, because `crm.resolve_party`
//     (canonicalize + dedupe + provenance edge) is server-side. Never
//     hand-roll domain→party matching here; that is how you manufacture the
//     duplicates `/crm/duplicates` exists to clean up;
//   * enrollment is `features/crm/outreach-lists/service.ts`;
//   * sending stays behind `crm.check_send_eligibility()`.
//
// 🚨 The real mounted paths are `/seo/sites/{site_id}/crm/...` — aidream
// router prefixes are BARE, so the `/api/...` form written in the handoff is
// unreachable at runtime even though it appears in `/openapi.json`. They are
// typed against `types/python-generated/api-types.ts` through
// `@/lib/api/typed-client`, so a wrong path is a compile error, not a 404 a
// user discovers.

import type { components } from "@/types/python-generated/api-types";
import { apiGet, apiPost, apiPut, buildPath } from "@/lib/api/typed-client";
import { supabase } from "@/utils/supabase/client";
import { operationFailed } from "@/utils/errors";
import type { PartyRow } from "../types";

export type DomainFoldReport = components["schemas"]["DomainFoldReport"];
export type FoldedDomain = components["schemas"]["FoldedDomain"];
export type SiteCrmFoldSettings = components["schemas"]["SiteCrmFoldSettings"];
export type CrmFoldSettings = components["schemas"]["CrmFoldSettings"];
export type CrmFoldMode = NonNullable<CrmFoldSettings["mode"]>;

/** The three modes the server persists on `web.site.settings->'crm_fold'`. */
export const CRM_FOLD_MODES = ["auto", "manual", "off"] as const;

export const CRM_FOLD_MODE_LABEL: Record<CrmFoldMode, string> = {
  auto: "Automatically, after each crawl",
  manual: "Only when I press the button",
  off: "Never",
};

export const CRM_FOLD_MODE_HELP: Record<CrmFoldMode, string> = {
  auto: "Every completed backlink or reputation run adds the new organizations to your CRM.",
  manual:
    "Nothing is added on its own. The button on this page is the only way in.",
  off: "Nothing is ever added — the button on this page refuses too, and says so.",
};

/**
 * The reputation verdicts that mean "write to this outlet".
 *
 * 🚨 Deliberately NARROWER than aidream's `OUTREACH_VERDICTS`, which also
 * folds `strengthen`. `strengthen` is a verdict about OUR OWN page ("make
 * this asset better"), not about an outlet, so offering a "Start outreach"
 * button on it would be a button that pretends — the exact failure this
 * slice exists to kill. The extra server verdict is harmless (it only means
 * a `strengthen` outlet may already exist as a discovered party); it is
 * flagged in `features/marketing/components/reputation/FEATURE.md`.
 */
export const REPUTATION_OUTREACH_VERDICTS = [
  "pitch",
  "request_update",
  "correct",
  "respond",
] as const;

export type ReputationOutreachVerdict =
  (typeof REPUTATION_OUTREACH_VERDICTS)[number];

export function isReputationOutreachVerdict(
  verdict: string,
): verdict is ReputationOutreachVerdict {
  return (REPUTATION_OUTREACH_VERDICTS as readonly string[]).includes(verdict);
}

/**
 * A referring domain we resolved as a link farm. The server skips it during
 * the fold WITH the reason; the client refuses the outreach door for the same
 * reason rather than offering a button the server would reject.
 */
export const NON_PROSPECT_DOMAIN_VERDICTS = ["toxic"] as const;

export function isNonProspectDomainVerdict(verdict: string | null): boolean {
  return (NON_PROSPECT_DOMAIN_VERDICTS as readonly string[]).includes(
    verdict ?? "",
  );
}

// ── The live G1 contract ────────────────────────────────────────────────────

export async function readSiteCrmFoldSettings(
  siteId: string,
): Promise<SiteCrmFoldSettings> {
  const { data } = await apiGet(
    buildPath("/seo/sites/{site_id}/crm/fold-settings", { site_id: siteId }),
  );
  return data;
}

export async function writeSiteCrmFoldSettings(
  siteId: string,
  patch: components["schemas"]["UpdateCrmFoldSettingsRequest"],
): Promise<SiteCrmFoldSettings> {
  const { data } = await apiPut(
    buildPath("/seo/sites/{site_id}/crm/fold-settings", { site_id: siteId }),
    patch,
  );
  return data;
}

export type FoldSource = "backlink" | "reputation";

/**
 * Fold this site's discovered domains into `crm.party` organizations.
 * Idempotent on the domain key: a re-run is a no-op that costs one query per
 * producer, and a domain already in the CRM is ENRICHED, never duplicated.
 */
export async function foldSiteDomains(args: {
  siteId: string;
  source: FoldSource;
  body?: components["schemas"]["FoldDomainsRequest"];
}): Promise<DomainFoldReport> {
  const path =
    args.source === "backlink"
      ? buildPath("/seo/sites/{site_id}/crm/referring-domains", {
          site_id: args.siteId,
        })
      : buildPath("/seo/sites/{site_id}/crm/reputation-outlets", {
          site_id: args.siteId,
        });
  const { data } = await apiPost(path, args.body ?? {});
  return data;
}

/** A refusal the fold control must render as a REASON, never a dead button. */
export function foldRefusalForMode(mode: CrmFoldMode): string | null {
  return mode === "off"
    ? "Adding these organizations to your CRM is turned off for this site. Switch it to “Only when I press the button” (or automatic) to use this."
    : null;
}

// ── Resolving the folded outlet back to its party ───────────────────────────

/**
 * The TS twin of aidream's `crm.canonicalize.normalize_domain` — the function
 * that decides what `crm.party.primary_domain` actually holds.
 *
 * 🚨 Paid for once: a reputation case carries `source_domain =
 * "www.andysowards.com"` while the fold stored the party as
 * `andysowards.com`, so looking the outlet up by the raw column found nothing
 * and the door reported "could not be turned into an organization" about a
 * record that had just been created. Any client-side lookup against
 * `primary_domain` must normalize first. If this ever diverges from the
 * server's rules, the symptom is exactly that false refusal.
 */
export function normalizeDomainKey(raw: string): string {
  let value = raw.trim().toLowerCase();
  for (const prefix of ["https://", "http://"]) {
    if (value.startsWith(prefix)) value = value.slice(prefix.length);
  }
  if (value.startsWith("www.")) value = value.slice(4);
  value = value.replace(/\/+$/, "").split("/")[0].split("?")[0].split("#")[0];
  return value.replace(/\.+$/, "");
}

/**
 * The organization behind a domain, INCLUDING platform-discovered rows.
 *
 * Every other domain lookup in `features/crm/service.ts` is deliberately
 * contact-only (`record_class='contact'`) so found records cannot drown the
 * CRM — see `features/crm/FEATURE.md` § record_class. A freshly folded outlet
 * is `discovered` by construction, so this is one of the "dedicated
 * discovered-record surfaces" allowed to opt in. It never creates anything:
 * creation is the server resolver's job, above.
 */
export async function findOutletPartyByDomain(args: {
  orgId: string;
  domain: string;
}): Promise<PartyRow | null> {
  const domain = normalizeDomainKey(args.domain);
  if (!domain) return null;
  const { data, error } = await supabase
    .schema("crm")
    .from("party")
    .select("*")
    .eq("organization_id", args.orgId)
    .eq("party_kind", "organization")
    .eq("primary_domain", domain)
    .is("deleted_at", null)
    .is("canonical_id", null)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw operationFailed("look up that company by its domain", error);
  return (data?.[0] as PartyRow | undefined) ?? null;
}

/**
 * One folded row, said in the user's words — what the fold DID, including
 * what it refused and why. A silent skip is a dead end.
 */
export function describeFoldReport(report: DomainFoldReport): string {
  const parts: string[] = [];
  if (report.created) parts.push(`${report.created} added`);
  if (report.matched)
    parts.push(`${report.matched} matched to organizations you already had`);
  if (report.already_linked)
    parts.push(`${report.already_linked} already linked`);
  if (report.skipped?.length) parts.push(`${report.skipped.length} skipped`);
  if (!parts.length)
    return `Nothing new — all ${report.scanned ?? 0} domains were already handled.`;
  return parts.join(" · ");
}
