"use client";

/**
 * promoter-signal — "they linked to us before."
 *
 * The derived prioritization signal for prospecting (WP2, consuming IC-5). A
 * domain that has ALREADY given this organization a confirmed win is not a cold
 * prospect: it is the single best-converting thing in a triage list, and every
 * serious outreach tool surfaces it. Pitchbox calls them promoters; the reason
 * they matter is not sentiment, it is that a publisher who linked to you once
 * has already made the decision the whole campaign is asking for.
 *
 * 🚨 **This file is READ-ONLY over WP4's table and owns nothing.** Only the
 * attribution pass writes `platform.outcome_event`, only
 * `platform.decide_outcome_event` decides one, and only `status='confirmed'`
 * counts here — a `proposed` row is a machine's guess and pretending otherwise
 * would show the user a "win" nobody confirmed. There is no promoter table, no
 * promoter column, and no cached score: the signal is the join, computed at
 * read time from rows that already exist. A materialized copy would be stale
 * the moment a human confirms the next win.
 *
 * The link back to a prospect is `crm.party.primary_domain` — the party
 * resolver's own key, the same one prospecting normalizes to. A second matching
 * rule here would credit the wrong company, which on this particular signal
 * means telling the user a stranger already said yes to them.
 *
 * Reads go DIRECT to Supabase (RLS scopes them to the user's organizations),
 * per the platform's client-data law. Nothing here calls the Python server.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";

/** Outcome kinds that mean "this domain has already said yes to us". */
const WIN_KINDS = [
  "link_appeared",
  "coverage_published",
  "mention_appeared",
  "page_corrected",
] as const;

/**
 * How many domains one lookup will ask about. The triage table is paged, so
 * this is the page size in practice; a larger ask means a caller is trying to
 * score a whole list client-side, which is a server job.
 */
const MAX_DOMAINS_PER_LOOKUP = 500;

export interface PromoterWin {
  outcome_id: string;
  outcome_kind: string;
  occurred_at: string | null;
  evidence_url: string | null;
  campaign_id: string | null;
}

/** What a prospect's prior wins amount to, for one domain. */
export interface PromoterSignal {
  normalized_domain: string;
  party_id: string;
  display_name: string;
  win_count: number;
  /** The most recent confirmed win — the one worth showing. */
  latest: PromoterWin;
  /** One sentence a non-technical expert can act on. */
  summary: string;
}

/** Keyed by normalized domain — the key the triage rows already carry. */
export type PromoterSignals = Record<string, PromoterSignal>;

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message — usually a gateway/PostgREST " +
        "failure rather than a query error.",
  );
}

const KIND_PHRASE: Record<string, string> = {
  link_appeared: "linked to you",
  coverage_published: "covered you and linked to you",
  mention_appeared: "wrote about you",
  page_corrected: "fixed a page for you",
};

function summarize(name: string, count: number, kind: string, at: string | null): string {
  const phrase = KIND_PHRASE[kind] ?? "said yes to you";
  const when = at ? ` in ${new Date(at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}` : "";
  if (count > 1) {
    return `${name} has ${phrase}${when} — ${count} confirmed wins in total. They have already said yes once; ask again.`;
  }
  return `${name} ${phrase}${when}. They have already said yes once; ask again.`;
}

/**
 * The confirmed-win signal for a page of prospect domains.
 *
 * Returns only domains that HAVE a confirmed win. A domain with none is absent
 * from the map rather than present with `win_count: 0` — an explicit zero reads
 * as a measured absence, and this measures nothing about a domain we have never
 * pitched.
 */
export async function listPromoterSignals(
  normalizedDomains: string[],
  signal?: AbortSignal,
): Promise<PromoterSignals> {
  const domains = Array.from(new Set(normalizedDomains.filter(Boolean))).slice(
    0,
    MAX_DOMAINS_PER_LOOKUP,
  );
  if (!domains.length) return {};

  await requireAuthenticatedSupabaseSession(supabase);

  const partyQuery = supabase
    .schema("crm")
    .from("party")
    .select("id, display_name, primary_domain")
    .in("primary_domain", domains)
    .is("deleted_at", null);
  const parties = await (signal ? partyQuery.abortSignal(signal) : partyQuery);
  if (parties.error) throw pgError(parties.error);
  const partyRows = (parties.data ?? []) as {
    id: string;
    display_name: string;
    primary_domain: string | null;
  }[];
  if (!partyRows.length) return {};

  const byPartyId = new Map(partyRows.map((row) => [row.id, row]));
  const outcomeQuery = supabase
    .schema("platform")
    .from("outcome_event")
    .select("id, party_id, outcome_kind, occurred_at, evidence_url, campaign_id")
    .in("party_id", Array.from(byPartyId.keys()))
    .in("outcome_kind", WIN_KINDS as unknown as string[])
    // 🚨 confirmed ONLY. A proposed row is the machine's guess; showing it as a
    // win would put a stranger's name behind "they already said yes to you".
    .eq("status", "confirmed")
    .order("occurred_at", { ascending: false });
  const outcomes = await (signal ? outcomeQuery.abortSignal(signal) : outcomeQuery);
  if (outcomes.error) throw pgError(outcomes.error);

  const signals: PromoterSignals = {};
  for (const row of (outcomes.data ?? []) as {
    id: string;
    party_id: string;
    outcome_kind: string;
    occurred_at: string | null;
    evidence_url: string | null;
    campaign_id: string | null;
  }[]) {
    const party = byPartyId.get(row.party_id);
    const domain = party?.primary_domain;
    if (!party || !domain) continue;
    const existing = signals[domain];
    if (existing) {
      existing.win_count += 1;
      existing.summary = summarize(
        existing.display_name,
        existing.win_count,
        existing.latest.outcome_kind,
        existing.latest.occurred_at,
      );
      continue;
    }
    // Rows arrive newest-first, so the first one seen for a domain IS the latest.
    const latest: PromoterWin = {
      outcome_id: row.id,
      outcome_kind: row.outcome_kind,
      occurred_at: row.occurred_at,
      evidence_url: row.evidence_url,
      campaign_id: row.campaign_id,
    };
    signals[domain] = {
      normalized_domain: domain,
      party_id: party.id,
      display_name: party.display_name,
      win_count: 1,
      latest,
      summary: summarize(party.display_name, 1, row.outcome_kind, row.occurred_at),
    };
  }
  return signals;
}

/**
 * Every promoter in this site's triage list, regardless of which PAGE of the
 * table they happen to be on.
 *
 * A chip on the current page is not prioritization — a promoter sitting on page
 * four of a list sorted by authority is exactly the prospect that gets missed.
 * So this asks the question the other way round: start from the confirmed wins
 * (there are never many — a win is rare and human-confirmed), and find which of
 * them are ALSO waiting in this site's prospect list.
 *
 * Returns only prospects still awaiting a decision (`pending`): a promoter the
 * user already approved or rejected has been dealt with, and re-surfacing it as
 * urgent teaches them to ignore the band.
 */
export async function listPromoterProspects(
  siteId: string,
  signal?: AbortSignal,
): Promise<{ opportunity_id: string; display_domain: string; promoter: PromoterSignal }[]> {
  if (!siteId) return [];
  await requireAuthenticatedSupabaseSession(supabase);

  const outcomes = await supabase
    .schema("platform")
    .from("outcome_event")
    .select("party_id")
    .eq("status", "confirmed")
    .in("outcome_kind", WIN_KINDS as unknown as string[])
    .not("party_id", "is", null)
    .limit(MAX_DOMAINS_PER_LOOKUP);
  if (outcomes.error) throw pgError(outcomes.error);
  const partyIds = Array.from(
    new Set(((outcomes.data ?? []) as { party_id: string }[]).map((r) => r.party_id)),
  );
  if (!partyIds.length) return [];

  const parties = await supabase
    .schema("crm")
    .from("party")
    .select("primary_domain")
    .in("id", partyIds)
    .not("primary_domain", "is", null)
    .is("deleted_at", null);
  if (parties.error) throw pgError(parties.error);
  const domains = Array.from(
    new Set(
      ((parties.data ?? []) as { primary_domain: string | null }[])
        .map((r) => r.primary_domain)
        .filter((d): d is string => Boolean(d)),
    ),
  );
  if (!domains.length) return [];

  const opportunities = await supabase
    .schema("seo")
    .from("serp_opportunity")
    .select("id, display_domain, normalized_domain")
    .eq("site_id", siteId)
    .eq("review_status", "pending")
    .in("normalized_domain", domains);
  if (opportunities.error) throw pgError(opportunities.error);
  const rows = (opportunities.data ?? []) as {
    id: string;
    display_domain: string;
    normalized_domain: string;
  }[];
  if (!rows.length) return [];

  // One more read, for the WHY — the same shape the table chips use, so the
  // band and the row can never tell the user two different stories.
  const signals = await listPromoterSignals(
    rows.map((row) => row.normalized_domain),
    signal,
  );
  return rows
    .map((row) => {
      const promoter = signals[row.normalized_domain];
      return promoter
        ? { opportunity_id: row.id, display_domain: row.display_domain, promoter }
        : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.promoter.win_count - a.promoter.win_count);
}

/**
 * The deep link to the proof — the Outcomes view on the campaign that earned
 * it, opened on that exact win. `null` when the win has no campaign (an
 * organic/manual outcome); the caller then falls back to the party.
 */
export function promoterProofHref(signal: PromoterSignal): string | null {
  const { campaign_id, outcome_id } = signal.latest;
  if (!campaign_id) return null;
  return `/crm/outreach-lists/${campaign_id}?view=outcomes&outcome=${outcome_id}`;
}
