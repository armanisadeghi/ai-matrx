/**
 * MATRX V1 — the redesigned model. This is the one meant to be tuned.
 *
 * What changed from the 2018 sheet, and why each change is a knob rather than a
 * rewrite:
 *
 * 1. **Correlated inputs collapse into composites.** The original summed seven
 *    authority metrics as though they were seven independent opinions — 52% of
 *    a domain's positive points came from what is essentially one fact measured
 *    seven ways. Here they are members of ONE group averaged over whatever
 *    arrived, so a fifth source raises CONFIDENCE, not score. Four dials became
 *    one dial and a member list.
 *
 * 2. **Every signal is normalised to 0–100 before it is weighted.** That is what
 *    makes a source swappable: an AI estimate, a different vendor, or a human
 *    typing a number are interchangeable as long as they answer the same
 *    question on the same scale. It also removes the index-size trap — global
 *    rank enters as a PERCENTILE, never a raw ordinal.
 *
 * 3. **Placement promises left the relevance score.** Social amplification and
 *    feature placement are things the publisher agreed to do, not facts about
 *    topical fit. In the original worked example they supplied 54% of the
 *    "relevance" number while both topical inputs read "No Relevance".
 *
 * 4. **Page authority left the relevance score** for the same reason — it is an
 *    authority fact and supplied another 43% of that same number.
 *
 * 5. **AI carries the signals nobody could buy in 2018.** Topical fit, editorial
 *    quality, outbound-link hygiene and author credibility are judgements a
 *    capable model plus a crawl makes better than any 2018 metric, and they are
 *    the signals that actually separate a real publication from a link farm.
 *
 * 6. **Hard gates exist.** §1.2 of the source promised that bad domains are
 *    "rejected" and no tab implemented it.
 *
 * 🚨 AI-sourced signals name a MANDATE, never an agent and never a prompt. Code
 * names the job; the database decides which agent fulfils it. The mandates below
 * are declared and not yet seeded — until they are, those signals are entered by
 * hand in the UI, which is exactly the "we'd like it from a vendor, for now we
 * estimate it" path.
 *
 * Every number in this file is a starting point, not a finding. They are
 * deliberate, defensible defaults — they are not calibrated, because calibration
 * requires the owner's historical rulings, which is the regression corpus still
 * to be collected.
 */

import type { LinkValuationConfig, SignalDef } from "../types";

const AI = (mandateKey: string, label: string) => [
  { kind: "ai" as const, label, mandateKey, priority: 1, trust: 0.65 },
];

const zeroToHundred = {
  min: 0,
  max: 100,
  direction: "higher-better",
  unit: "0–100",
} as const;

const signals: SignalDef[] = [
  // --- Domain authority: one fact, many possible witnesses -------------------
  {
    key: "domain_authority",
    label: "Domain Authority",
    entity: "domain",
    valueKind: "number",
    semantic:
      "0–100 log-scaled estimate of a DOMAIN's ranking strength from its inbound link profile.",
    scale: zeroToHundred,
    sources: [
      {
        kind: "api",
        label: "Any licensed domain-strength metric",
        priority: 1,
        trust: 1,
      },
      ...AI(
        "marketing.link_valuation.domain_authority",
        "AI estimate from live SERP + link evidence",
      ),
    ],
    enabled: true,
  },
  {
    key: "domain_rating",
    label: "Domain Rating (second opinion)",
    entity: "domain",
    valueKind: "number",
    semantic:
      "A SECOND independent 0–100 domain-strength estimate from a different index.",
    scale: zeroToHundred,
    sources: [
      { kind: "api", label: "Any second link index", priority: 1, trust: 1 },
    ],
    enabled: true,
  },
  {
    key: "global_rank_percentile",
    label: "Global Rank Percentile",
    entity: "domain",
    valueKind: "number",
    semantic:
      "Where this domain sits among ALL indexed domains, as a percentile (100 = strongest). A PERCENTILE, never a raw ordinal — an ordinal is a function of index size and is not comparable between providers.",
    scale: zeroToHundred,
    sources: [
      {
        kind: "derived",
        label: "Converted from a provider rank + index size",
        priority: 1,
        trust: 1,
      },
    ],
    enabled: true,
  },
  {
    key: "referring_domains",
    label: "Referring Domains",
    entity: "domain",
    valueKind: "number",
    semantic:
      "How many DISTINCT sites link to this domain. The closest thing to editorial consensus, and the hardest of the link primitives to manufacture.",
    scale: {
      min: 0,
      max: 10_000_000,
      direction: "higher-better",
      unit: "domains",
    },
    sources: [
      {
        kind: "api",
        label: "DataForSEO backlink summary",
        priority: 1,
        trust: 1,
      },
    ],
    enabled: true,
  },

  // --- Page-level ------------------------------------------------------------
  {
    key: "page_authority",
    label: "Page Authority",
    entity: "page",
    valueKind: "number",
    semantic:
      "0–100 strength of the SPECIFIC placement page. Leave empty when the page does not exist yet — that is the normal case for a guest post, and empty is honest where 0 would be a lie.",
    scale: zeroToHundred,
    sources: [
      { kind: "api", label: "Any page-strength metric", priority: 1, trust: 1 },
    ],
    enabled: true,
  },
  {
    key: "page_prominence",
    label: "Page Prominence",
    entity: "page",
    valueKind: "number",
    semantic:
      "0–100 judgement of how reachable the placement page is inside the site — clicks from the home page, presence in main navigation, internal links pointing at it.",
    scale: zeroToHundred,
    sources: AI(
      "marketing.link_valuation.page_prominence",
      "AI read of the site's own structure",
    ),
    enabled: true,
  },

  // --- Link-profile health ---------------------------------------------------
  {
    key: "trust_volume_ratio",
    label: "Volume ÷ Trust Ratio",
    entity: "domain",
    valueKind: "number",
    semantic:
      "Volume-weighted links divided by trust-weighted links, BOTH from the same index. LOWER IS BETTER: many links carrying little trust is the classic bought-link signature. This is the one signal genuinely worth licensing a vendor for — nothing else measures it as cheaply.",
    scale: { min: 0, max: 10, direction: "lower-better", unit: "ratio" },
    sources: [
      {
        kind: "api",
        label: "Trust/volume link index (Majestic-class)",
        priority: 1,
        trust: 1,
      },
    ],
    enabled: true,
  },
  {
    key: "link_profile_health",
    label: "Link Profile Health",
    entity: "domain",
    valueKind: "number",
    semantic:
      "0–100 judgement of whether the inbound link profile looks earned or bought — anchor-text distribution, linking-site diversity, velocity, and neighbourhood.",
    scale: zeroToHundred,
    sources: AI(
      "marketing.link_valuation.link_profile_health",
      "AI review of the backlink sample",
    ),
    enabled: true,
  },

  // --- Risk ------------------------------------------------------------------
  {
    key: "spam_score",
    label: "Spam Score",
    entity: "domain",
    valueKind: "number",
    semantic:
      "0–100 likelihood the domain is manipulative or penalised. LOWER IS BETTER. Any substitute must be restated on 0–100 before it is fed here.",
    scale: { min: 0, max: 100, direction: "lower-better", unit: "0–100" },
    sources: [
      { kind: "api", label: "DataForSEO spam score", priority: 1, trust: 1 },
    ],
    enabled: true,
  },
  {
    key: "sells_links",
    label: "Sells Links Openly",
    entity: "domain",
    valueKind: "number",
    semantic:
      "0–100 confidence that this site sells placements to anyone — a 'write for us' page with pricing, sponsored-post density, unrelated commercial outbound links. HIGHER IS WORSE. This is a judgement no 2018 metric could make and a model reading the site makes easily.",
    scale: { min: 0, max: 100, direction: "lower-better", unit: "0–100" },
    sources: AI(
      "marketing.link_valuation.link_selling_risk",
      "AI review of the live site",
    ),
    enabled: true,
  },

  // --- Audience --------------------------------------------------------------
  {
    key: "organic_traffic",
    label: "Organic Traffic",
    entity: "domain",
    valueKind: "number",
    semantic: "Estimated organic search visits per month.",
    scale: {
      min: 0,
      max: 100_000_000,
      direction: "higher-better",
      unit: "visits/mo",
    },
    sources: [
      { kind: "api", label: "Any traffic estimator", priority: 1, trust: 0.8 },
    ],
    enabled: true,
  },

  // --- Editorial quality: the capability that did not exist in 2018 ----------
  {
    key: "editorial_quality",
    label: "Editorial Quality",
    entity: "domain",
    valueKind: "number",
    semantic:
      "0–100 judgement of whether this reads as a real publication: original reporting or expertise, consistent editorial voice, evidence of standards, not thin aggregation.",
    scale: zeroToHundred,
    sources: AI(
      "marketing.link_valuation.editorial_quality",
      "AI review of representative pages",
    ),
    enabled: true,
  },
  {
    key: "author_credibility",
    label: "Author Credibility",
    entity: "domain",
    valueKind: "number",
    semantic:
      "0–100 judgement of the bylines: real, identifiable authors with traceable expertise, versus anonymous or fabricated ones.",
    scale: zeroToHundred,
    sources: AI(
      "marketing.link_valuation.author_credibility",
      "AI review of author pages",
    ),
    enabled: true,
  },
  {
    key: "content_originality",
    label: "Content Originality",
    entity: "domain",
    valueKind: "number",
    semantic:
      "0–100 judgement of how much of the site is original rather than syndicated, spun, or machine-generated filler.",
    scale: zeroToHundred,
    sources: AI(
      "marketing.link_valuation.content_originality",
      "AI review of a content sample",
    ),
    enabled: true,
  },

  // --- Topical relevance: the biggest AI upgrade in the model ----------------
  {
    key: "topical_match",
    label: "Topical Match",
    entity: "target",
    valueKind: "number",
    semantic:
      "0–100 judgement of how closely this site and page relate to OUR target keyword and service. Replaces two coarse human dropdowns with a continuous, explainable read of the actual content — the single largest quality gain available over the 2018 model.",
    scale: zeroToHundred,
    sources: AI(
      "marketing.link_valuation.topical_match",
      "AI comparison of the page against our target",
    ),
    enabled: true,
  },
  {
    key: "topical_authority",
    label: "Topical Authority",
    entity: "target",
    valueKind: "number",
    semantic:
      "0–100 judgement of authority WITHIN our topic specifically, as opposed to overall. A giant general-news domain can be strong overall and weak here.",
    scale: zeroToHundred,
    sources: AI(
      "marketing.link_valuation.topical_authority",
      "AI + ranking evidence in our topic",
    ),
    enabled: true,
  },
  {
    key: "keyword_relevance",
    label: "Keyword Relevance (human)",
    entity: "target",
    valueKind: "enum",
    semantic:
      "The operator's own read of keyword overlap. Kept so a human can override the model.",
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

  // --- Site qualities --------------------------------------------------------
  {
    key: "tld",
    label: "Top-level Domain",
    entity: "domain",
    valueKind: "enum",
    semantic: "The domain's TLD, as a weak proxy for institutional trust.",
    scale: { min: 0, max: 100, direction: "higher-better", unit: "points" },
    options: [".edu", ".gov", ".com", ".org", ".net", "other"],
    sources: [
      { kind: "derived", label: "Parsed from the URL", priority: 1, trust: 1 },
    ],
    enabled: true,
  },
  {
    key: "geo_match",
    label: "Audience Geography",
    entity: "domain",
    valueKind: "enum",
    semantic:
      "Whether the site's audience is in our target market. Generalised from the original's US-only test, which cost a flat −300 and zeroed most domains on its own.",
    scale: { min: 0, max: 2, direction: "higher-better", unit: "band" },
    options: [
      "Target market",
      "Adjacent market",
      "Different market",
      "Unknown",
    ],
    sources: [
      { kind: "manual", label: "Operator or AI", priority: 1, trust: 1 },
    ],
    enabled: true,
  },

  // --- Negotiated placement (its own bucket now) -----------------------------
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
  {
    key: "dofollow",
    label: "Link is Followed",
    entity: "deal",
    valueKind: "enum",
    semantic:
      "Whether the placed link passes authority. A nofollow/sponsored link is worth a fraction of a followed one — the original model had no field for this at all.",
    scale: { min: 0, max: 1, direction: "higher-better", unit: "yes/no" },
    options: ["Followed", "Nofollow / Sponsored", "Unknown"],
    sources: [
      {
        kind: "manual",
        label: "Negotiated or observed",
        priority: 1,
        trust: 1,
      },
    ],
    enabled: true,
  },
];

export const MATRX_V1_CONFIG: LinkValuationConfig = {
  id: "matrx-v1",
  name: "Matrx v1 (redesigned)",
  version: "1.0.0",
  description:
    "Source-agnostic rebuild: correlated metrics collapsed into composites, every signal normalised 0–100, placement promises and page authority moved out of relevance, AI carrying the editorial and topical judgements no 2018 vendor sold, and real reject gates. Every number is a starting point to be tuned against real rulings.",
  scoreDecimals: 1,
  signals,

  groups: [
    {
      key: "domain_authority",
      label: "Domain Authority",
      description:
        "How strong is this domain? Four possible witnesses to ONE fact, averaged over whichever arrived. Adding a source raises confidence, not score.",
      members: [
        {
          signalKey: "domain_authority",
          weight: 3,
          curve: { kind: "linear", scale: 1, offset: 0 },
        },
        {
          signalKey: "domain_rating",
          weight: 2,
          curve: { kind: "linear", scale: 1, offset: 0 },
        },
        {
          signalKey: "global_rank_percentile",
          weight: 2,
          curve: { kind: "linear", scale: 1, offset: 0 },
        },
        {
          // ~25 points per order of magnitude: 10 domains ≈ 25, 10k ≈ 100.
          signalKey: "referring_domains",
          weight: 2,
          curve: { kind: "logGain", base: 10, mult: 25, floorInput: 0 },
        },
      ],
      minMembers: 1,
      enabled: true,
    },
    {
      key: "page_authority",
      label: "Page Authority",
      description:
        "How strong is the specific placement page? Legitimately absent for a page that does not exist yet.",
      members: [
        {
          signalKey: "page_authority",
          weight: 2,
          curve: { kind: "linear", scale: 1, offset: 0 },
        },
        {
          signalKey: "page_prominence",
          weight: 1,
          curve: { kind: "linear", scale: 1, offset: 0 },
        },
      ],
      minMembers: 1,
      enabled: true,
    },
    {
      key: "link_health",
      label: "Link Profile Health",
      description:
        "Does the link profile look earned or bought? The licensed ratio and the AI read answer the same question — whichever we have.",
      members: [
        {
          signalKey: "trust_volume_ratio",
          weight: 2,
          // ratio → 0–100, smoothed so a hairline difference cannot reprice a link
          curve: {
            kind: "segments",
            segments: [
              { upTo: 1.1, intercept: 100, slope: 0 },
              { upTo: 1.5, intercept: 120, slope: -20 },
              { upTo: 2.2, intercept: 110, slope: -25 },
              { upTo: 3, intercept: 80, slope: -20 },
              { upTo: 5, intercept: 40, slope: -8 },
            ],
            fallback: { intercept: 0, slope: 0 },
            smooth: true,
          },
        },
        {
          signalKey: "link_profile_health",
          weight: 2,
          curve: { kind: "linear", scale: 1, offset: 0 },
        },
      ],
      minMembers: 1,
      enabled: true,
    },
    {
      key: "editorial",
      label: "Editorial Quality",
      description:
        "Is this a real publication? Entirely AI-and-crawl sourced — the class of judgement that did not exist when the original was built.",
      members: [
        {
          signalKey: "editorial_quality",
          weight: 3,
          curve: { kind: "linear", scale: 1, offset: 0 },
        },
        {
          signalKey: "author_credibility",
          weight: 2,
          curve: { kind: "linear", scale: 1, offset: 0 },
        },
        {
          signalKey: "content_originality",
          weight: 2,
          curve: { kind: "linear", scale: 1, offset: 0 },
        },
      ],
      minMembers: 1,
      enabled: true,
    },
    {
      key: "topical",
      label: "Topical Relevance",
      description:
        "How related is this to what WE are trying to rank for? The AI read leads; the human dropdown can override it.",
      members: [
        {
          signalKey: "topical_match",
          weight: 3,
          curve: { kind: "linear", scale: 1, offset: 0 },
        },
        {
          signalKey: "topical_authority",
          weight: 2,
          curve: { kind: "linear", scale: 1, offset: 0 },
        },
        {
          signalKey: "keyword_relevance",
          weight: 1,
          curve: {
            kind: "categorical",
            map: {
              "No Relevance": 0,
              "Low Relevance": 33,
              "Medium Relevance": 66,
              "High Relevance": 100,
            },
            fallback: 0,
          },
        },
      ],
      minMembers: 1,
      enabled: true,
    },
    {
      key: "risk",
      label: "Spam & Selling Risk",
      description:
        "How likely is this to hurt us? Higher is worse; feeds a penalty, not a score.",
      members: [
        {
          signalKey: "spam_score",
          weight: 2,
          curve: { kind: "linear", scale: 1, offset: 0 },
        },
        {
          signalKey: "sells_links",
          weight: 2,
          curve: { kind: "linear", scale: 1, offset: 0 },
        },
      ],
      minMembers: 1,
      enabled: true,
    },
  ],

  terms: [
    // Quality — averaged over what arrived.
    {
      key: "q_domain_authority",
      label: "Domain Authority",
      bucket: "quality",
      input: { kind: "group", groupKey: "domain_authority" },
      curve: { kind: "linear", scale: 1, offset: 0 },
      mode: "average",
      weight: 3,
      explain: "How strong the domain is overall.",
      enabled: true,
    },
    {
      key: "q_page_authority",
      label: "Page Authority",
      bucket: "quality",
      input: { kind: "group", groupKey: "page_authority" },
      curve: { kind: "linear", scale: 1, offset: 0 },
      mode: "average",
      weight: 1,
      explain:
        "How strong the specific page is. Absent for a page that does not exist yet.",
      enabled: true,
    },
    {
      key: "q_link_health",
      label: "Link Profile Health",
      bucket: "quality",
      input: { kind: "group", groupKey: "link_health" },
      curve: { kind: "linear", scale: 1, offset: 0 },
      mode: "average",
      weight: 2,
      explain: "Whether the site's own links look earned rather than bought.",
      enabled: true,
    },
    {
      key: "q_editorial",
      label: "Editorial Quality",
      bucket: "quality",
      input: { kind: "group", groupKey: "editorial" },
      curve: { kind: "linear", scale: 1, offset: 0 },
      mode: "average",
      weight: 2,
      explain: "Whether this is a real publication a human would respect.",
      enabled: true,
    },
    {
      key: "q_traffic",
      label: "Organic Traffic",
      bucket: "quality",
      input: { kind: "signal", signalKey: "organic_traffic" },
      // 100k visits/mo ≈ 100 points; 100/mo ≈ 40.
      curve: { kind: "logGain", base: 10, mult: 20, floorInput: 0 },
      mode: "average",
      weight: 2,
      explain: "Real audience — the clearest evidence a site is alive.",
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
          ".edu": 100,
          ".gov": 100,
          ".org": 70,
          ".com": 60,
          ".net": 40,
          other: 30,
        },
        fallback: 30,
      },
      mode: "average",
      weight: 0.5,
      explain:
        "Institutional TLDs carry some inherent trust. Deliberately a light thumb.",
      enabled: true,
    },
    // Quality — penalties, outside the average.
    {
      key: "q_risk_penalty",
      label: "Spam & Selling Risk",
      bucket: "quality",
      input: { kind: "group", groupKey: "risk" },
      curve: { kind: "linear", scale: -0.6, offset: 0 },
      mode: "additive",
      weight: 1,
      explain:
        "A maximum-risk domain loses 60 points. Severe, but it cannot alone drive a score negative.",
      enabled: true,
    },
    {
      key: "q_geo_penalty",
      label: "Audience Geography",
      bucket: "quality",
      input: { kind: "signal", signalKey: "geo_match" },
      curve: {
        kind: "categorical",
        map: {
          "Target market": 0,
          "Adjacent market": -10,
          "Different market": -30,
          Unknown: -5,
        },
        fallback: 0,
      },
      mode: "additive",
      weight: 1,
      explain:
        "Graduated, where the original applied a flat −300 that zeroed most domains outright.",
      enabled: true,
    },

    // Relevance.
    {
      key: "rel_topical",
      label: "Topical Relevance",
      bucket: "relevance",
      input: { kind: "group", groupKey: "topical" },
      curve: { kind: "linear", scale: 1, offset: 0 },
      mode: "average",
      weight: 1,
      explain: "How close this is to what we are trying to rank for.",
      enabled: true,
    },

    // Placement — its own bucket, so a promise can never masquerade as relevance.
    {
      key: "p_feature_placement",
      label: "Feature Placement",
      bucket: "placement",
      input: { kind: "signal", signalKey: "feature_placement" },
      curve: {
        kind: "categorical",
        map: {
          "Yes: Home Page": 100,
          "Yes: Good Placement": 75,
          "Yes: Moderate Placement": 50,
          "Yes: Poor Placement": 30,
          "Yes: Not Guaranteed": 15,
          No: 0,
        },
        fallback: 0,
      },
      mode: "average",
      weight: 2,
      explain: "Where on the site the placement lands.",
      enabled: true,
    },
    {
      key: "p_promote_social",
      label: "Social Promotion",
      bucket: "placement",
      input: { kind: "signal", signalKey: "promote_social" },
      curve: {
        kind: "categorical",
        map: {
          "Yes - 25k+": 100,
          "Yes - 10-25k+": 80,
          "Yes - 5-10k+": 55,
          "Yes - 1-5k+": 35,
          "Yes - Unknown": 15,
          No: 0,
        },
        fallback: 0,
      },
      mode: "average",
      weight: 1,
      explain: "Amplification the publisher committed to.",
      enabled: true,
    },
    {
      key: "p_dofollow",
      label: "Followed Link",
      bucket: "placement",
      input: { kind: "signal", signalKey: "dofollow" },
      curve: {
        kind: "categorical",
        map: { Followed: 100, "Nofollow / Sponsored": 20, Unknown: 50 },
        fallback: 50,
      },
      mode: "average",
      weight: 2,
      explain:
        "A nofollow link passes no authority. The original model had no field for this at all.",
      enabled: true,
    },
  ],

  buckets: [
    {
      key: "quality",
      label: "Site Quality",
      divisorMode: "meanOfPresent",
      divisor: 1,
      weight: 0.6,
      floorAtZero: true,
      enabled: true,
    },
    {
      key: "relevance",
      label: "Relevance",
      divisorMode: "meanOfPresent",
      divisor: 1,
      weight: 0.3,
      floorAtZero: true,
      enabled: true,
    },
    {
      key: "placement",
      label: "Placement Value",
      divisorMode: "meanOfPresent",
      divisor: 1,
      weight: 0.1,
      floorAtZero: true,
      enabled: true,
    },
  ],

  gates: [
    {
      key: "gate_spam",
      label: "Spam ceiling",
      signalKey: "spam_score",
      op: "gte",
      value: 60,
      action: "reject",
      message:
        "Spam score is at or above the ceiling — this link is refused regardless of its other numbers.",
      enabled: true,
    },
    {
      key: "gate_sells_links",
      label: "Open link seller",
      signalKey: "sells_links",
      op: "gte",
      value: 85,
      action: "reject",
      message:
        "This site openly sells placements to anyone, which is what a manual action looks for.",
      enabled: true,
    },
    {
      key: "gate_geo",
      label: "Wrong market",
      signalKey: "geo_match",
      op: "eq",
      value: "Different market",
      action: "flag",
      message:
        "Audience is in a different market — penalised, not refused. Switch to 'reject' if that is the policy.",
      enabled: true,
    },
    {
      key: "gate_nofollow",
      label: "Nofollow link",
      signalKey: "dofollow",
      op: "eq",
      value: "Nofollow / Sponsored",
      action: "flag",
      message:
        "Link will not pass authority. Priced down, not refused — it can still be worth buying for referral traffic.",
      enabled: true,
    },
  ],

  labels: {
    quality: {
      source: "total",
      bands: [
        { from: -1000, to: 20, label: "Not Acceptable" },
        { from: 20, to: 32, label: "Very Low Quality" },
        { from: 32, to: 45, label: "Low Quality" },
        { from: 45, to: 58, label: "Medium Quality" },
        { from: 58, to: 70, label: "Good Quality" },
        { from: 70, to: 82, label: "High Quality" },
        { from: 82, to: 92, label: "Exceptional Quality" },
        { from: 92, to: 10000, label: "Top Quality" },
      ],
    },
    relevance: {
      source: "relevance",
      bands: [
        { from: -1000, to: 15, label: "Not Relevant" },
        { from: 15, to: 35, label: "Low Relevance" },
        { from: 35, to: 60, label: "Medium Relevance" },
        { from: 60, to: 80, label: "High Relevance" },
        { from: 80, to: 10000, label: "Extreme Relevance" },
      ],
    },
  },

  money: {
    currency: "USD",
    curve: [
      { at: 0, value: 0 },
      { at: 35, value: 0 },
      { at: 40, value: 15 },
      { at: 50, value: 45 },
      { at: 60, value: 90 },
      { at: 70, value: 150 },
      { at: 80, value: 230 },
      { at: 90, value: 330 },
      { at: 100, value: 450 },
    ],
    interpolate: true,
    // Continuous — no rounding cliff at every band edge. Set to 0 to price the
    // way the spreadsheet did.
    roundScoreTo: null,
    roundTo: 2,
    roles: [
      {
        key: "writer",
        label: "Writer",
        bands: [
          { from: 0, to: 45, multiplier: 0.75 },
          { from: 45, to: 60, multiplier: 0.7 },
          { from: 60, to: 75, multiplier: 0.65 },
          { from: 75, to: 10000, multiplier: 0.6 },
        ],
      },
      {
        key: "guest_post_manager",
        label: "Guest Post Manager",
        bands: [
          { from: 0, to: 45, multiplier: 0.85 },
          { from: 45, to: 60, multiplier: 0.8 },
          { from: 60, to: 75, multiplier: 0.75 },
          { from: 75, to: 10000, multiplier: 0.7 },
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
        to: 39,
        ceilings: {
          auto: "free",
          blogger_manager: "free",
          seo_manager: "free",
        },
      },
      {
        from: 39,
        to: 50,
        ceilings: { auto: 25, blogger_manager: 40, seo_manager: 60 },
      },
      {
        from: 50,
        to: 60,
        ceilings: { auto: 45, blogger_manager: 75, seo_manager: 110 },
      },
      {
        from: 60,
        to: 70,
        ceilings: { auto: 75, blogger_manager: 130, seo_manager: 180 },
      },
      {
        from: 70,
        to: 82,
        ceilings: { auto: 110, blogger_manager: 200, seo_manager: 280 },
      },
      {
        from: 82,
        to: 10000,
        ceilings: { auto: 150, blogger_manager: 300, seo_manager: 450 },
      },
    ],
  },
};
