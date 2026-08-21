/**
 * PARITY CONFIG — reproduces the original "Backlink Checker" workbook exactly.
 *
 * This exists for one reason: it is the **regression anchor**. Any redesign is
 * only trustworthy if we can still produce the old answers on demand and see
 * precisely where the new model diverges. `__tests__/engine.test.ts` asserts it
 * against Appendix B of the source PRD.
 *
 * Do not "improve" anything in this file. Improvements go in `matrx-v1.ts`.
 *
 * KNOWN INCOMPLETE — the source document could not be fully reproduced:
 *   • The "Round" lookup table (PRD §3.4b) is unbuildable as documented: it
 *     contains ellipses, gives 7 dollar values for 3 keys, labels key 8 as both
 *     Low and Medium, labels key 9 as both Medium and Good, and omits key 10.
 *     Quality labels here therefore use the §3.5 table, which IS complete.
 *   • The relevance-bonus / Generic-Link-Value pair (§3.4a/b/c) produced a
 *     SECOND dollar figure that competed with Max Link Value and never had a
 *     stated precedence. Only the §3.5 curve — the one the payouts actually
 *     multiply — is modelled here.
 *   • The authorization table is marked "not real, only a sample" in the sheet.
 *     Its 31–34 / 31–39 overlap is corrected to 31–34 / 35–39 so bands are
 *     disjoint; the numbers remain placeholders.
 */

import type { LinkValuationConfig } from "../types";

const NUMBER_SCALE = {
  min: 0,
  max: 100,
  direction: "higher-better",
  unit: "score",
} as const;

export const SHEET_2018_CONFIG: LinkValuationConfig = {
  id: "sheet-2018",
  name: "Original Sheet (2018 parity)",
  version: "1.0.0",
  description:
    "Byte-for-byte reproduction of the Google Sheet the PRD was extracted from. Kept as the regression anchor — every number matches Appendix B.",
  scoreDecimals: 2,

  signals: [
    {
      key: "domain_authority",
      label: "Domain Authority",
      entity: "domain",
      valueKind: "number",
      semantic:
        "Log-scaled 0–100 estimate of a DOMAIN's ranking strength from its inbound link profile. Higher is better; each 10 points is meaningfully harder to gain than the last.",
      scale: NUMBER_SCALE,
      sources: [
        { kind: "api", label: "Moz DA (original)", priority: 1, trust: 1 },
      ],
      enabled: true,
    },
    {
      key: "page_authority",
      label: "Page Authority",
      entity: "page",
      valueKind: "number",
      semantic:
        // access-errors: ok — metric description for a prospective external page, not a failed read
        "The same 0–100 strength estimate scoped to ONE PAGE rather than the domain. Undefined for a page that does not exist yet.",
      scale: NUMBER_SCALE,
      sources: [
        { kind: "api", label: "Moz PA (original)", priority: 1, trust: 1 },
      ],
      enabled: true,
    },
    {
      key: "url_rating",
      label: "URL Rating",
      entity: "page",
      valueKind: "number",
      semantic:
        "Second opinion on page-level strength, 0–100, from a different link index.",
      scale: NUMBER_SCALE,
      sources: [
        { kind: "api", label: "Ahrefs UR (original)", priority: 1, trust: 1 },
      ],
      enabled: true,
    },
    {
      key: "domain_rating",
      label: "Domain Rating",
      entity: "domain",
      valueKind: "number",
      semantic:
        "Second opinion on domain-level strength, 0–100, from a different link index.",
      scale: NUMBER_SCALE,
      sources: [
        { kind: "api", label: "Ahrefs DR (original)", priority: 1, trust: 1 },
      ],
      enabled: true,
    },
    {
      key: "global_rank",
      label: "Global Rank",
      entity: "domain",
      valueKind: "number",
      semantic:
        "Ordinal position of this domain among ALL domains in a provider's index, 1 = strongest. SMALLER IS BETTER. Depends on index size — not comparable across providers without conversion to a percentile.",
      scale: {
        min: 1,
        max: 1_000_000_000,
        direction: "lower-better",
        unit: "rank",
      },
      sources: [
        { kind: "api", label: "Ahrefs Rank (original)", priority: 1, trust: 1 },
      ],
      enabled: true,
    },
    {
      key: "spam_score",
      label: "Spam Score",
      entity: "domain",
      valueKind: "number",
      semantic:
        "0–100 likelihood the domain is manipulative or penalised. LOWER IS BETTER. Scale-sensitive: the original tuned this against a 0–17 flag count, so a modern 0–100 percentage fed at the same weight will zero out ordinary sites.",
      scale: { min: 0, max: 100, direction: "lower-better", unit: "%" },
      sources: [
        {
          kind: "api",
          label: "Moz Spam Score (original)",
          priority: 1,
          trust: 1,
        },
      ],
      enabled: true,
    },
    {
      key: "trust_links",
      label: "Trust-weighted Links",
      entity: "domain",
      valueKind: "number",
      semantic:
        "0–100 measure of link EQUITY weighted by the trustworthiness of the linking sites. Must come from the same index as volume-weighted links or their ratio is meaningless.",
      scale: NUMBER_SCALE,
      sources: [
        {
          kind: "api",
          label: "Majestic Trust Flow (original)",
          priority: 1,
          trust: 1,
        },
      ],
      enabled: true,
    },
    {
      key: "volume_links",
      label: "Volume-weighted Links",
      entity: "domain",
      valueKind: "number",
      semantic:
        "0–100 measure of link QUANTITY irrespective of quality, from the same index as trust-weighted links.",
      scale: NUMBER_SCALE,
      sources: [
        {
          kind: "api",
          label: "Majestic Citation Flow (original)",
          priority: 1,
          trust: 1,
        },
      ],
      enabled: true,
    },
    {
      key: "organic_traffic",
      label: "Organic Traffic",
      entity: "domain",
      valueKind: "number",
      semantic:
        "Estimated organic search visits per month. Estimation method varies 2–3× between providers, which is ~24 raw points at this weight.",
      scale: {
        min: 0,
        max: 100_000_000,
        direction: "higher-better",
        unit: "visits/mo",
      },
      sources: [
        {
          kind: "api",
          label: "SEMrush Traffic (original)",
          priority: 1,
          trust: 1,
        },
      ],
      enabled: true,
    },
    {
      key: "url_length",
      label: "URL Length",
      entity: "domain",
      valueKind: "number",
      semantic:
        "Character count of the domain name. The source document never defined whether this includes the TLD or the path; it is worth up to 100 raw points, so it needs a ruling.",
      scale: { min: 0, max: 100, direction: "lower-better", unit: "chars" },
      sources: [
        {
          kind: "derived",
          label: "Computed from the URL",
          priority: 1,
          trust: 1,
        },
      ],
      enabled: true,
    },
    {
      key: "spam_keywords",
      label: "Spam Keyword Profile",
      entity: "domain",
      valueKind: "enum",
      semantic:
        "How much of the domain's ranking keyword set is spam-adjacent.",
      scale: { min: 0, max: 3, direction: "lower-better", unit: "band" },
      options: ["No Spam", "Low Spam", "Medium Spam", "High Spam"],
      sources: [
        { kind: "manual", label: "Operator judgement", priority: 1, trust: 1 },
      ],
      enabled: true,
    },
    {
      key: "is_us_site",
      label: "US-based Site",
      entity: "domain",
      valueKind: "enum",
      semantic: "Whether the site's audience and hosting are US-based.",
      scale: { min: 0, max: 1, direction: "higher-better", unit: "yes/no" },
      options: ["Yes", "No"],
      sources: [
        { kind: "manual", label: "Operator judgement", priority: 1, trust: 1 },
      ],
      enabled: true,
    },
    {
      key: "tld",
      label: "Top-level Domain",
      entity: "domain",
      valueKind: "enum",
      semantic: "The domain's TLD, as a proxy for institutional trust.",
      scale: { min: 0, max: 200, direction: "higher-better", unit: "points" },
      options: [".edu", ".gov", ".com", ".org", ".net", "other"],
      sources: [
        {
          kind: "derived",
          label: "Parsed from the URL",
          priority: 1,
          trust: 1,
        },
      ],
      enabled: true,
    },
    {
      key: "topical_trust",
      label: "Topical Trust Score",
      entity: "domain",
      valueKind: "number",
      semantic:
        "Trust the domain carries WITHIN our topic specifically, as opposed to overall. The source document gave no scale, range, or derivation for this.",
      scale: { min: 0, max: 100, direction: "higher-better", unit: "score" },
      sources: [
        {
          kind: "manual",
          label: "Operator-derived (undefined)",
          priority: 1,
          trust: 0.5,
        },
      ],
      enabled: true,
    },
    {
      key: "keyword_relevance",
      label: "Keyword Relevance",
      entity: "target",
      valueKind: "enum",
      semantic:
        "How closely the site's ranking keywords overlap our target keyword.",
      scale: { min: 0, max: 3, direction: "higher-better", unit: "band" },
      options: [
        "No Relevance",
        "Low Relevance",
        "Medium Relevance",
        "High Relevance",
      ],
      sources: [
        { kind: "manual", label: "Operator judgement", priority: 1, trust: 1 },
      ],
      enabled: true,
    },
    {
      key: "page_topic_relevance",
      label: "Page Topic Relevance",
      entity: "target",
      valueKind: "enum",
      semantic:
        "How closely the specific placement page's topic matches our target.",
      scale: { min: 0, max: 5, direction: "higher-better", unit: "band" },
      options: [
        "Exact Primary Keyword",
        "LSI Keyword",
        "Similar Keywords",
        "Related Keywords",
        "Low Relevance",
        "No Relevance",
      ],
      sources: [
        { kind: "manual", label: "Operator judgement", priority: 1, trust: 1 },
      ],
      enabled: true,
    },
    {
      key: "promote_social",
      label: "Social Promotion Promise",
      entity: "deal",
      valueKind: "enum",
      semantic:
        "What the publisher committed to in social amplification, by audience size.",
      scale: { min: 0, max: 5, direction: "higher-better", unit: "band" },
      options: [
        "Yes - 25k+",
        "Yes - 10-25k+",
        "Yes - 5-10k+",
        "Yes - 1-5k+",
        "Yes - Unknown",
        "No",
      ],
      sources: [{ kind: "manual", label: "Negotiated", priority: 1, trust: 1 }],
      enabled: true,
    },
    {
      key: "feature_placement",
      label: "On-site Feature Promise",
      entity: "deal",
      valueKind: "enum",
      semantic:
        "Where on the site the publisher committed to feature the placement.",
      scale: { min: 0, max: 5, direction: "higher-better", unit: "band" },
      options: [
        "Yes: Home Page",
        "Yes: Good Placement",
        "Yes: Moderate Placement",
        "Yes: Poor Placement",
        "Yes: Not Guaranteed",
        "No",
      ],
      sources: [{ kind: "manual", label: "Negotiated", priority: 1, trust: 1 }],
      enabled: true,
    },
  ],

  // The original summed seven correlated authority metrics directly, so parity
  // uses no composites. `matrx-v1` is where they collapse.
  groups: [],

  terms: [
    {
      key: "q_domain_authority",
      label: "Domain Authority",
      bucket: "quality",
      input: { kind: "signal", signalKey: "domain_authority" },
      curve: { kind: "linear", scale: 1, offset: 0 },
      mode: "additive",
      weight: 3,
      explain:
        "Domain-level ranking strength, weighted 3× — the heaviest single authority input.",
      enabled: true,
    },
    {
      key: "q_url_rating",
      label: "URL Rating",
      bucket: "quality",
      input: { kind: "signal", signalKey: "url_rating" },
      curve: { kind: "linear", scale: 1, offset: 0 },
      mode: "additive",
      weight: 1,
      explain: "Page-level strength from a second index.",
      enabled: true,
    },
    {
      key: "q_domain_rating",
      label: "Domain Rating",
      bucket: "quality",
      input: { kind: "signal", signalKey: "domain_rating" },
      curve: { kind: "linear", scale: 1, offset: 0 },
      mode: "additive",
      weight: 1,
      explain: "Domain-level strength from a second index.",
      enabled: true,
    },
    {
      key: "q_global_rank",
      label: "Global Rank",
      bucket: "quality",
      input: { kind: "signal", signalKey: "global_rank" },
      curve: { kind: "logDrop", base: 10, ceiling: 10, mult: 1, floorInput: 0 },
      mode: "additive",
      weight: 10,
      explain:
        "Rewards a strong global position. Every 10× better rank adds 10 more points.",
      enabled: true,
    },
    {
      key: "q_spam_score",
      label: "Spam Score",
      bucket: "quality",
      input: { kind: "signal", signalKey: "spam_score" },
      curve: { kind: "linear", scale: 1, offset: 0 },
      mode: "additive",
      weight: -30,
      explain:
        "Heavy penalty. At this weight a spam score of 10 costs 300 raw points.",
      enabled: true,
    },
    {
      key: "q_trust_links",
      label: "Trust-weighted Links",
      bucket: "quality",
      input: { kind: "signal", signalKey: "trust_links" },
      curve: { kind: "linear", scale: 1, offset: 0 },
      mode: "additive",
      weight: 1,
      explain: "Link equity weighted by how trustworthy the linking sites are.",
      enabled: true,
    },
    {
      key: "q_volume_links",
      label: "Volume-weighted Links",
      bucket: "quality",
      input: { kind: "signal", signalKey: "volume_links" },
      curve: { kind: "linear", scale: 1, offset: 0 },
      mode: "additive",
      weight: 1,
      explain: "Raw link quantity, unweighted by quality.",
      enabled: true,
    },
    {
      key: "q_trust_shape",
      label: "Trust vs Volume Shape",
      bucket: "quality",
      input: {
        kind: "ratio",
        numeratorKey: "volume_links",
        denominatorKey: "trust_links",
      },
      curve: {
        kind: "segments",
        segments: [
          { upTo: 1.1, intercept: 300, slope: -30 },
          { upTo: 1.5, intercept: 200, slope: -30 },
          { upTo: 1.85, intercept: 150, slope: -20 },
          { upTo: 2.2, intercept: 125, slope: -20 },
          { upTo: 2.5, intercept: 100, slope: -30 },
          { upTo: 3, intercept: 0, slope: 0 },
          { upTo: 4, intercept: -50, slope: 0 },
          { upTo: 5, intercept: -75, slope: 0 },
          { upTo: 6, intercept: -150, slope: 0 },
          { upTo: 7, intercept: -200, slope: 0 },
          { upTo: 8, intercept: -250, slope: 0 },
          { upTo: 9, intercept: -300, slope: 0 },
        ],
        fallback: { intercept: -350, slope: 0 },
        smooth: false,
      },
      mode: "additive",
      weight: 1,
      explain:
        "Lots of links but little trust is the classic bought-link signature. Unsmoothed this jumps 100 points between a ratio of 1.099 and 1.100.",
      enabled: true,
    },
    {
      key: "q_traffic",
      label: "Organic Traffic",
      bucket: "quality",
      input: { kind: "signal", signalKey: "organic_traffic" },
      curve: { kind: "logGain", base: 10, mult: 1, floorInput: 0 },
      mode: "additive",
      weight: 50,
      explain:
        "Real audience. The single largest positive contributor in the original example.",
      enabled: true,
    },
    {
      key: "q_url_length",
      label: "URL Length",
      bucket: "quality",
      input: { kind: "signal", signalKey: "url_length" },
      curve: {
        kind: "segments",
        segments: [
          { upTo: 10, intercept: 100, slope: 0 },
          { upTo: 13, intercept: 80, slope: 0 },
          { upTo: 15, intercept: 70, slope: 0 },
          { upTo: 16, intercept: 60, slope: 0 },
          { upTo: 18, intercept: 50, slope: 0 },
          { upTo: 19, intercept: 30, slope: 0 },
          { upTo: 20, intercept: 20, slope: 0 },
          { upTo: 22, intercept: 10, slope: 0 },
        ],
        fallback: { intercept: 0, slope: 0 },
        smooth: false,
      },
      mode: "additive",
      weight: 1,
      explain: "Short domains read as established brands.",
      enabled: true,
    },
    {
      key: "q_spam_keywords",
      label: "Spam Keyword Profile",
      bucket: "quality",
      input: { kind: "signal", signalKey: "spam_keywords" },
      curve: {
        kind: "categorical",
        map: {
          "No Spam": 0,
          "Low Spam": -50,
          "Medium Spam": -100,
          "High Spam": -200,
        },
        fallback: 0,
      },
      mode: "additive",
      weight: 1,
      explain: "Penalty for ranking on spam-adjacent terms.",
      enabled: true,
    },
    {
      key: "q_us_site",
      label: "US-based Site",
      bucket: "quality",
      input: { kind: "signal", signalKey: "is_us_site" },
      curve: { kind: "categorical", map: { Yes: 0, No: -300 }, fallback: 0 },
      mode: "additive",
      weight: 1,
      explain:
        "A −300 penalty for non-US sites — large enough to zero out most domains on its own.",
      enabled: true,
    },
    {
      key: "q_tld",
      label: "Top-level Domain",
      bucket: "quality",
      input: { kind: "signal", signalKey: "tld" },
      curve: {
        kind: "categorical",
        map: {
          ".edu": 200,
          ".gov": 150,
          ".com": 100,
          ".org": 80,
          ".net": 20,
          other: 0,
        },
        fallback: 0,
      },
      mode: "additive",
      weight: 1,
      explain: "Institutional TLDs carry inherent trust.",
      enabled: true,
    },

    {
      key: "r_topical_trust",
      label: "Topical Trust",
      bucket: "relevance",
      input: { kind: "signal", signalKey: "topical_trust" },
      curve: { kind: "linear", scale: 1 / 3, offset: 0 },
      mode: "additive",
      weight: 1,
      explain: "Trust the domain carries inside our topic specifically.",
      enabled: true,
    },
    {
      key: "r_keyword_relevance",
      label: "Keyword Relevance",
      bucket: "relevance",
      input: { kind: "signal", signalKey: "keyword_relevance" },
      curve: {
        kind: "categorical",
        map: {
          "No Relevance": 0,
          "Low Relevance": 5,
          "Medium Relevance": 10,
          "High Relevance": 15,
        },
        fallback: 0,
      },
      mode: "additive",
      weight: 1,
      explain: "Overlap between the site's keywords and ours.",
      enabled: true,
    },
    {
      key: "r_page_topic",
      label: "Page Topic Relevance",
      bucket: "relevance",
      input: { kind: "signal", signalKey: "page_topic_relevance" },
      curve: {
        kind: "categorical",
        map: {
          "Exact Primary Keyword": 20,
          "LSI Keyword": 15,
          "Similar Keywords": 10,
          "Related Keywords": 7,
          "Low Relevance": 4,
          "No Relevance": 0,
        },
        fallback: 0,
      },
      mode: "additive",
      weight: 1,
      explain: "How on-topic the actual placement page is.",
      enabled: true,
    },
    {
      key: "r_promote_social",
      label: "Social Promotion",
      bucket: "relevance",
      input: { kind: "signal", signalKey: "promote_social" },
      curve: {
        kind: "categorical",
        map: {
          "Yes - 25k+": 20,
          "Yes - 10-25k+": 20,
          "Yes - 5-10k+": 10,
          "Yes - 1-5k+": 6,
          "Yes - Unknown": 3,
          No: 0,
        },
        fallback: 0,
      },
      mode: "additive",
      weight: 1,
      explain:
        "A negotiated promise, scored inside RELEVANCE in the original. It is not a relevance fact.",
      enabled: true,
    },
    {
      key: "r_feature_placement",
      label: "Feature Placement",
      bucket: "relevance",
      input: { kind: "signal", signalKey: "feature_placement" },
      curve: {
        kind: "categorical",
        map: {
          "Yes: Home Page": 20,
          "Yes: Good Placement": 15,
          "Yes: Moderate Placement": 10,
          "Yes: Poor Placement": 6,
          "Yes: Not Guaranteed": 3,
          No: 0,
        },
        fallback: 0,
      },
      mode: "additive",
      weight: 1,
      explain:
        "Also a negotiated promise scored inside RELEVANCE. In the worked example it supplied 54% of the 'relevance' score.",
      enabled: true,
    },
    {
      key: "r_page_authority",
      label: "Page Authority",
      bucket: "relevance",
      input: { kind: "signal", signalKey: "page_authority" },
      curve: { kind: "linear", scale: 1 / 3, offset: 0 },
      mode: "additive",
      weight: 1,
      explain:
        "An AUTHORITY signal scored inside RELEVANCE. In the worked example it supplied 43% of the 'relevance' score while both topical inputs were 'No Relevance'.",
      enabled: true,
    },
  ],

  buckets: [
    {
      key: "quality",
      label: "Generic Quality",
      divisorMode: "fixed",
      divisor: 17,
      weight: 1,
      floorAtZero: true,
      enabled: true,
    },
    {
      key: "relevance",
      label: "Relevance",
      divisorMode: "fixed",
      divisor: 5,
      weight: 1,
      floorAtZero: false,
      enabled: true,
    },
    {
      key: "placement",
      label: "Placement Value",
      divisorMode: "fixed",
      divisor: 1,
      weight: 1,
      floorAtZero: true,
      enabled: false,
    },
  ],

  // The original had no reject rule at all — §1.2 promised one and no tab
  // implemented it. Parity keeps that: nothing is gated.
  gates: [],

  labels: {
    quality: {
      source: "total",
      bands: [
        { from: -1000, to: 15.5, label: "Not Acceptable!" },
        { from: 15.5, to: 24.5, label: "Very Low Quality" },
        { from: 24.5, to: 39.5, label: "Low Quality" },
        { from: 39.5, to: 54.5, label: "Medium Quality" },
        { from: 54.5, to: 69.5, label: "High Quality" },
        { from: 69.5, to: 84.5, label: "Exceptional Quality" },
        { from: 84.5, to: 95.5, label: "Top Quality!" },
        { from: 95.5, to: 10000, label: "UNREAL!!!" },
      ],
    },
    relevance: {
      source: "relevance",
      bands: [
        { from: -1000, to: 2.5, label: "Not Relevant" },
        { from: 2.5, to: 8.5, label: "Low Relevance" },
        { from: 8.5, to: 14.5, label: "Medium Relevance" },
        { from: 14.5, to: 20.5, label: "High Relevance" },
        { from: 20.5, to: 23.5, label: "Extreme Relevance" },
        { from: 23.5, to: 10000, label: "Incredible Relevance!" },
      ],
    },
  },

  money: {
    currency: "USD",
    // These 9 points reproduce all 136 rows of the source's Added Value array
    // exactly under linear interpolation. Verified against every published
    // checkpoint (25→$5, 35→$20, 40→$54, 45→$94, 100→$204, 135→$274).
    curve: [
      { at: 0, value: 0 },
      { at: 24, value: 0 },
      { at: 25, value: 5 },
      { at: 34, value: 14 },
      { at: 35, value: 20 },
      { at: 36, value: 26 },
      { at: 40, value: 54 },
      { at: 45, value: 94 },
      { at: 135, value: 274 },
    ],
    interpolate: true,
    roundScoreTo: 0,
    roundTo: 2,
    roles: [
      {
        key: "writer",
        label: "Writer",
        bands: [
          { from: 0, to: 10, multiplier: 0.75 },
          { from: 11, to: 40, multiplier: 0.75 },
          { from: 41, to: 43, multiplier: 0.7 },
          { from: 44, to: 50, multiplier: 0.65 },
          { from: 51, to: 10000, multiplier: 0.6 },
        ],
      },
      {
        key: "guest_post_manager",
        label: "Guest Post Manager",
        bands: [
          { from: 0, to: 10, multiplier: 0.75 },
          { from: 11, to: 40, multiplier: 0.85 },
          { from: 41, to: 43, multiplier: 0.8 },
          { from: 44, to: 50, multiplier: 0.75 },
          { from: 51, to: 10000, multiplier: 0.7 },
        ],
      },
      {
        key: "seo_manager",
        label: "SEO Manager",
        bands: [{ from: 0, to: 10000, multiplier: 1 }],
      },
    ],
    authorization: [
      {
        from: 0,
        to: 20,
        ceilings: { auto: "free", blogger_manager: "free", seo_manager: 15 },
      },
      {
        from: 21,
        to: 30,
        ceilings: { auto: "free", blogger_manager: 15, seo_manager: 30 },
      },
      {
        from: 31,
        to: 34,
        ceilings: { auto: 10, blogger_manager: 20, seo_manager: 35 },
      },
      {
        from: 35,
        to: 39,
        ceilings: { auto: 25, blogger_manager: 35, seo_manager: 45 },
      },
      {
        from: 40,
        to: 44,
        ceilings: { auto: 45, blogger_manager: 55, seo_manager: 65 },
      },
      {
        from: 45,
        to: 49,
        ceilings: { auto: 60, blogger_manager: 75, seo_manager: 95 },
      },
      {
        from: 50,
        to: 54,
        ceilings: { auto: 75, blogger_manager: 95, seo_manager: 115 },
      },
      {
        from: 55,
        to: 60,
        ceilings: { auto: 90, blogger_manager: 110, seo_manager: 125 },
      },
      {
        from: 61,
        to: 10000,
        ceilings: { auto: 100, blogger_manager: 130, seo_manager: 150 },
      },
    ],
  },
};
