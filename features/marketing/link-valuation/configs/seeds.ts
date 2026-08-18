/**
 * One worked example per config.
 *
 * The seed has to match the config it loads under, or the page opens on a
 * half-fed model and shows a score nobody can check. `sheet-2018` seeds the
 * source PRD's Appendix B — the one candidate whose correct answer is
 * independently known, so the first thing anyone sees is a case they can verify
 * against the original spreadsheet. `matrx-v1` seeds a complete candidate of its
 * own, because its signals are deliberately not the 2018 ones.
 */

import type { EvaluationInput, Provenance, SignalValue } from "../types";

const at = (
  value: number | string,
  provenance: Provenance = "api",
): SignalValue => ({
  value,
  provenance,
  confidence: provenance === "ai" ? 0.65 : 1,
});

/** The source PRD's Appendix B, verbatim. Expect 35.52 and a $26 ceiling. */
const SHEET_2018_SEED: EvaluationInput = {
  domain: "example.com",
  target: { keyword: "", page: "", campaign: "" },
  values: {
    domain_authority: at(36),
    url_rating: at(40),
    domain_rating: at(37),
    global_rank: at(2_017_142),
    spam_score: at(0),
    trust_links: at(23),
    volume_links: at(29),
    organic_traffic: at(12_200),
    url_length: at(9, "derived"),
    spam_keywords: at("No Spam", "manual"),
    is_us_site: at("No", "manual"),
    tld: at(".com", "derived"),
    topical_trust: at(2, "manual"),
    keyword_relevance: at("No Relevance", "manual"),
    page_topic_relevance: at("No Relevance", "manual"),
    promote_social: at("No", "manual"),
    feature_placement: at("Yes: Moderate Placement", "manual"),
    page_authority: at(24),
  },
};

/**
 * A plausible mid-tier trade publication for the redesigned model: decent
 * authority, real traffic, clean risk profile, strong topical fit, an ordinary
 * placement. Every signal is filled so the confidence reading starts honest.
 */
const MATRX_V1_SEED: EvaluationInput = {
  domain: "example.com",
  target: {
    keyword: "commercial roof inspection",
    page: "/services/roof-inspection",
    campaign: "Q3 link building",
  },
  values: {
    domain_authority: at(48),
    domain_rating: at(52),
    global_rank_percentile: at(61, "derived"),
    referring_domains: at(1_850),
    page_authority: at(31),
    page_prominence: at(45, "ai"),
    trust_volume_ratio: at(1.35),
    link_profile_health: at(72, "ai"),
    spam_score: at(8),
    sells_links: at(22, "ai"),
    organic_traffic: at(41_000),
    editorial_quality: at(68, "ai"),
    author_credibility: at(61, "ai"),
    content_originality: at(74, "ai"),
    topical_match: at(70, "ai"),
    topical_authority: at(55, "ai"),
    keyword_relevance: at("Medium Relevance", "manual"),
    tld: at(".com", "derived"),
    geo_match: at("Target market", "manual"),
    promote_social: at("Yes - 5-10k+", "manual"),
    feature_placement: at("Yes: Moderate Placement", "manual"),
    dofollow: at("Followed", "manual"),
  },
};

const SEEDS: Readonly<Record<string, EvaluationInput>> = {
  "sheet-2018": SHEET_2018_SEED,
  "matrx-v1": MATRX_V1_SEED,
};

/** An empty candidate — the honest starting point for a config we know nothing about. */
export function blankInput(): EvaluationInput {
  return {
    domain: "",
    target: { keyword: "", page: "", campaign: "" },
    values: {},
  };
}

export function seedFor(configId: string): EvaluationInput {
  return SEEDS[configId] ?? blankInput();
}
