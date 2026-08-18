/**
 * The Press Room — fixture rows.
 *
 * 🚨 THIS IS THE ONLY FILE IN THIS FOLDER THAT INVENTS DATA. It exists because
 * `seo.story_angle` and `seo.source_request` have no seeded rows yet, and the
 * requester explicitly authorised fixtures for this bake-off. Everything it
 * returns is a real generated DB Row — no widened shapes, no extra fields — so
 * replacing this module with a Supabase select is a one-import change in
 * `usePressRoom.ts` and nothing else in the folder moves.
 *
 * The brand is All Green Electronics Recycling / Data Destruction Inc: a
 * nationwide R2 + NAID-certified electronics recycler. Chosen because it is the
 * exact persona in the brief — world-class at a craft, invisible to the press.
 *
 * Deadlines are built RELATIVE to a passed-in `now` so the urgency states in the
 * UI are genuinely live rather than a screenshot of a moment in 2026.
 */

import type {
  CoverageMentionRow,
  SourceRequestRow,
  StoryAngleRow,
} from "./types";

const SITE_ID = "9d2c1f4a-6b8e-4c31-9a07-3f5b2d8e1c44";
const ORG_ID = "1a7f0c93-5d2b-4e88-b6c1-92e4a7d30f15";
const TRACKER_ID = "5b3e9a71-2c46-4f0d-8e19-7a6b4c2d5e83";
const BRAND_KEY = "all-green";
const USER_ID = "3c8a1e57-9f24-4d6b-a013-58e7b9c2f461";

/**
 * The site this hub is scoped to. In the real build this comes from the site
 * context (`useMarketingSite`) or from a brand picker — it is exported here
 * ONLY so the header can name and open the site while the rows are fixtures.
 */
export const FIXTURE_SITE = {
  id: SITE_ID,
  name: "All Green Electronics Recycling",
  domain: "allgreenrecycling.com",
} as const;

/** Journalist parties — REAL crm.party ids in the fixture, so doors resolve. */
export const FIXTURE_PARTIES = {
  reyes: "b1c4e7a2-3d59-4f80-9e16-2a7c5b8d0f39",
  okonjo: "c2d5f8b3-4e60-4a91-8f27-3b8d6c9e1a40",
  lindqvist: "d3e6a9c4-5f71-4b02-9a38-4c9e7d0f2b51",
  patel: "e4f7b0d5-6a82-4c13-8b49-5d0f8e1a3c62",
} as const;

/** The outreach list this workspace enrols journalists into. A real door. */
export const FIXTURE_MEDIA_LIST_ID = "f5a8c1e6-7b93-4d24-9c50-6e1a9f2b4d73";

function angle(
  partial: Partial<StoryAngleRow> &
    Pick<
      StoryAngleRow,
      | "id"
      | "angle_key"
      | "endowment"
      | "angle_type"
      | "headline"
      | "summary"
      | "recommended_action"
      | "status"
    >,
): StoryAngleRow {
  return {
    organization_id: ORG_ID,
    created_by: USER_ID,
    updated_by: USER_ID,
    site_id: SITE_ID,
    why_now: null,
    target_beat: null,
    target_outlet_kind: null,
    priority: 50,
    confidence: 50,
    newsworthiness: 50,
    timeliness: 50,
    evidence_quality: 50,
    action_reason: null,
    facts: [],
    inferences: [],
    evidence_refs: [],
    proof_required: [],
    missing_evidence: [],
    contradictions: [],
    analysis: {},
    human_ruling: {},
    evidence_fingerprint: null,
    analysis_version: "story-angle/2026.08.3",
    requires_human_review: false,
    analyzed_at: null,
    human_reviewed_at: null,
    accepted_at: null,
    pitched_at: null,
    landed_at: null,
    dismissed_at: null,
    expires_at: null,
    created_at: "2026-08-14T09:12:00Z",
    updated_at: "2026-08-18T07:40:00Z",
    deleted_at: null,
    version: 1,
    metadata: {},
    ...partial,
  };
}

function request(
  partial: Partial<SourceRequestRow> &
    Pick<
      SourceRequestRow,
      "id" | "platform" | "query_title" | "status" | "match_score"
    >,
): SourceRequestRow {
  return {
    organization_id: ORG_ID,
    created_by: USER_ID,
    updated_by: USER_ID,
    site_id: SITE_ID,
    external_id: null,
    external_url: null,
    outlet: null,
    journalist_name: null,
    party_id: null,
    query_body: null,
    beat: null,
    requirements: [],
    deadline_at: null,
    match_reason: null,
    story_angle_id: null,
    draft_response: null,
    draft_generated_at: null,
    submitted_at: null,
    won_at: null,
    created_at: "2026-08-18T05:00:00Z",
    updated_at: "2026-08-18T05:00:00Z",
    deleted_at: null,
    version: 1,
    metadata: {},
    ...partial,
  };
}

function coverage(
  partial: Partial<CoverageMentionRow> &
    Pick<CoverageMentionRow, "id" | "url" | "domain" | "title">,
): CoverageMentionRow {
  return {
    organization_id: ORG_ID,
    created_by: USER_ID,
    updated_by: USER_ID,
    site_id: SITE_ID,
    tracker_id: TRACKER_ID,
    brand_key: BRAND_KEY,
    source: "coverage_scan",
    normalized_url: partial.url,
    dedupe_key: partial.id,
    medium: "news",
    author_name: null,
    author_party_id: null,
    published_at: null,
    discovered_at: "2026-08-18T04:00:00Z",
    captured_at: "2026-08-18T04:02:00Z",
    capture_status: "captured",
    links_to_site: false,
    link_urls: [],
    sentiment: "positive",
    sentiment_score: 0.7,
    prominence: "feature",
    prominence_score: 0.6,
    topics: [],
    key_quote: null,
    analysis: {},
    is_competitor: false,
    competitor_key: null,
    matched_terms: ["All Green Electronics Recycling"],
    hit_score: 80,
    hit_reason: null,
    outcome_event_id: null,
    alerted_at: null,
    analyzed_at: "2026-08-18T04:05:00Z",
    language: "en",
    external_id: null,
    source_capture: {},
    metadata: {},
    created_at: "2026-08-18T04:00:00Z",
    updated_at: "2026-08-18T04:05:00Z",
    version: 1,
    ...partial,
  };
}

const hours = (n: number) => n * 3_600_000;

export interface PressRoomData {
  angles: StoryAngleRow[];
  requests: SourceRequestRow[];
  coverage: CoverageMentionRow[];
}

export function buildPressRoomFixture(now: Date): PressRoomData {
  const iso = (msFromNow: number) => new Date(now.getTime() + msFromNow).toISOString();

  const angles: StoryAngleRow[] = [
    angle({
      id: "a1000000-0000-4000-8000-000000000001",
      angle_key: "hard-drive-shred-audit-gap",
      endowment: "data",
      angle_type: "data_story",
      status: "accepted",
      recommended_action: "pitch_now",
      headline:
        "1 in 6 corporate hard drives sent for “secure destruction” still held recoverable data on arrival",
      summary:
        "Across 41,800 drives processed in the last 12 months, 17.4% arrived from certified IT-asset vendors with data still recoverable — meaning the chain of custody, not the shredder, is where corporate data leaks.",
      why_now:
        "The FTC's updated Safeguards Rule enforcement window opens 1 October, and every covered firm is re-papering its disposal vendor contracts this quarter.",
      target_beat: "Cybersecurity",
      target_outlet_kind: "national",
      priority: 94,
      confidence: 88,
      newsworthiness: 91,
      timeliness: 86,
      evidence_quality: 82,
      action_reason:
        "Original dataset, a regulatory deadline six weeks out, and a NAID-certified auditor willing to be quoted.",
      analyzed_at: iso(-hours(19)),
      accepted_at: iso(-hours(16)),
      requires_human_review: false,
      facts: [
        {
          statement:
            "41,802 drives were processed across 9 facilities between Aug 2025 and Jul 2026.",
          source_key: "intake_ledger",
        },
        {
          statement:
            "7,273 of them (17.4%) failed the pre-destruction wipe verification.",
          source_key: "verification_log",
        },
        {
          statement:
            "94% of the failures arrived from third-party ITAD vendors, not from the client directly.",
          source_key: "intake_ledger",
        },
      ],
      inferences: [
        {
          statement:
            "The failure concentrates in transport and staging, not in destruction itself.",
          confidence: 0.78,
        },
      ],
      evidence_refs: [
        {
          key: "intake_ledger",
          label: "12-month drive intake ledger (41,802 rows)",
          source: "Internal — NAID AAA audited",
          url: null,
          captured_at: iso(-hours(30)),
        },
        {
          key: "verification_log",
          label: "Pre-destruction wipe verification log",
          source: "Blancco verification export",
          url: null,
          captured_at: iso(-hours(30)),
        },
        {
          key: "naid_cert",
          label: "NAID AAA certification, current",
          source: "i-SIGMA registry",
          url: "https://isigmaonline.org/certification-search/",
          captured_at: iso(-hours(200)),
        },
      ],
      proof_required: [
        {
          key: "dataset",
          label: "The underlying dataset, shareable under NDA",
          kind: "data",
          note: "Reporters on this beat will ask for row-level access.",
        },
        {
          key: "method",
          label: "A written method note: how a drive is judged 'recoverable'",
          kind: "document",
          note: null,
        },
        {
          key: "third_party",
          label: "An independent auditor who will confirm the method",
          kind: "third_party",
          note: null,
        },
        {
          key: "quote",
          label: "A named executive quote on the record",
          kind: "quote",
          note: null,
        },
      ],
      missing_evidence: [
        {
          key: "third_party",
          label: "An independent auditor who will confirm the method",
          how_to_get:
            "Ask your i-SIGMA audit contact for a two-sentence confirmation you may quote.",
          owner: "you",
          effort: "quick",
        },
      ],
    }),
    angle({
      id: "a1000000-0000-4000-8000-000000000002",
      angle_key: "ai-datacenter-teardown-wave",
      endowment: "demand",
      angle_type: "trend_commentary",
      status: "proposed",
      recommended_action: "develop_evidence",
      headline:
        "The first big wave of AI-era GPU servers is being scrapped — and nobody planned for what is inside them",
      summary:
        "Decommission requests for dense GPU racks tripled year over year. They carry rare-earth loads and thermal-paste contaminants that standard e-waste lines are not permitted to process.",
      why_now:
        "The 2022–2023 datacenter buildout is hitting its three-year refresh cycle right now.",
      target_beat: "Climate / Infrastructure",
      target_outlet_kind: "trade",
      priority: 81,
      confidence: 64,
      newsworthiness: 84,
      timeliness: 79,
      evidence_quality: 41,
      action_reason:
        "The trend read is strong but rests on your own intake volume alone — one outside number makes it publishable.",
      analyzed_at: iso(-hours(19)),
      requires_human_review: true,
      facts: [
        {
          statement:
            "GPU-dense rack decommission requests rose from 34 to 112 units year over year.",
          source_key: "work_orders",
        },
      ],
      inferences: [
        {
          statement:
            "This is the leading edge of an industry-wide refresh, not a local anomaly.",
          confidence: 0.55,
        },
      ],
      contradictions: [
        {
          statement:
            "Two of the three largest requests came from a single reseller.",
          detail:
            "Concentration risk: the 'wave' may be one customer's inventory move.",
        },
      ],
      evidence_refs: [
        {
          key: "work_orders",
          label: "Decommission work orders, 24 months",
          source: "Internal operations system",
          url: null,
          captured_at: iso(-hours(28)),
        },
      ],
      proof_required: [
        {
          key: "market_size",
          label: "A third-party estimate of the national refresh volume",
          kind: "data",
          note: "Your own volume proves a slope, not a market.",
        },
        {
          key: "chemistry",
          label: "Lab result on the thermal-compound contaminant claim",
          kind: "metric",
          note: null,
        },
        {
          key: "customer_ok",
          label: "A customer willing to be named as a decommission source",
          kind: "quote",
          note: null,
        },
      ],
      missing_evidence: [
        {
          key: "market_size",
          label: "A third-party estimate of the national refresh volume",
          how_to_get:
            "Pull the Uptime Institute refresh-cycle figure and cite it alongside your slope.",
          owner: "team",
          effort: "quick",
        },
        {
          key: "chemistry",
          label: "Lab result on the thermal-compound contaminant claim",
          how_to_get:
            "Send three sample units to your R2 lab partner — 2 week turnaround.",
          owner: "third_party",
          effort: "heavy",
        },
        {
          key: "customer_ok",
          label: "A customer willing to be named as a decommission source",
          how_to_get:
            "One email to the two accounts whose contracts already allow attribution.",
          owner: "you",
          effort: "medium",
        },
      ],
    }),
    angle({
      id: "a1000000-0000-4000-8000-000000000003",
      angle_key: "e-stewards-vs-r2-honesty",
      endowment: "expertise",
      angle_type: "contrarian",
      status: "developing",
      recommended_action: "needs_expert_input",
      headline:
        "“Certified recycler” is not one thing — and the certificate most buyers ask for is not the one that governs data",
      summary:
        "Procurement teams routinely ask for the environmental certification and never ask for the data-security one, then assume both are covered. The two audits do not overlap.",
      why_now:
        "Procurement cycles for FY27 open in September; this is the month the RFP language gets written.",
      target_beat: "Enterprise IT",
      target_outlet_kind: "trade",
      priority: 72,
      confidence: 91,
      newsworthiness: 66,
      timeliness: 74,
      evidence_quality: 58,
      action_reason:
        "You are one of very few people who can say this credibly — but the piece needs your own words, not the model's.",
      analyzed_at: iso(-hours(19)),
      requires_human_review: true,
      facts: [
        {
          statement:
            "R2v3 governs environmental and downstream handling; NAID AAA governs data destruction.",
          source_key: "standards",
        },
        {
          statement:
            "All Green holds both, and is audited separately against each.",
          source_key: "our_certs",
        },
      ],
      evidence_refs: [
        {
          key: "standards",
          label: "R2v3 and NAID AAA published scopes",
          source: "SERI / i-SIGMA",
          url: "https://sustainableelectronics.org/r2/",
          captured_at: iso(-hours(300)),
        },
        {
          key: "our_certs",
          label: "Both certifications, current, publicly verifiable",
          source: "SERI + i-SIGMA registries",
          url: null,
          captured_at: iso(-hours(300)),
        },
      ],
      proof_required: [
        {
          key: "rfp_sample",
          label: "Redacted RFP language showing the mismatch in the wild",
          kind: "document",
          note: "Without a real RFP this reads as an opinion piece.",
        },
        {
          key: "expert_voice",
          label: "Your own explanation of the gap, in your words",
          kind: "quote",
          note: null,
        },
      ],
      missing_evidence: [
        {
          key: "rfp_sample",
          label: "Redacted RFP language showing the mismatch in the wild",
          how_to_get:
            "Pick two RFPs you answered this year and redact the buyer name.",
          owner: "you",
          effort: "medium",
        },
        {
          key: "expert_voice",
          label: "Your own explanation of the gap, in your words",
          how_to_get:
            "Answer one question: what is the worst thing you have seen this mistake cause?",
          owner: "you",
          effort: "quick",
        },
      ],
    }),
    angle({
      id: "a1000000-0000-4000-8000-000000000004",
      angle_key: "school-district-donation-program",
      endowment: "place",
      angle_type: "local_impact",
      status: "pitched",
      recommended_action: "pitch_now",
      headline:
        "Refurbished laptops from three Fortune 500 refreshes are landing in Riverside County classrooms this month",
      summary:
        "2,400 devices that would have been shredded were remarketed and donated across 11 districts, with data destruction certified before handover.",
      why_now: "Back-to-school week. This is a two-week window, then it is old.",
      target_beat: "Education",
      target_outlet_kind: "regional",
      priority: 77,
      confidence: 86,
      newsworthiness: 63,
      timeliness: 95,
      evidence_quality: 88,
      action_reason: "Fully provable and the timing window is closing.",
      analyzed_at: iso(-hours(19)),
      accepted_at: iso(-hours(40)),
      pitched_at: iso(-hours(6)),
      facts: [
        {
          statement: "2,412 devices delivered across 11 districts since 22 July.",
          source_key: "donation_log",
        },
      ],
      evidence_refs: [
        {
          key: "donation_log",
          label: "Signed district receipt log",
          source: "Internal — countersigned",
          url: null,
          captured_at: iso(-hours(50)),
        },
        {
          key: "photos",
          label: "Delivery photography, 3 districts, cleared for press",
          source: "Field team",
          url: null,
          captured_at: iso(-hours(48)),
        },
      ],
      proof_required: [
        {
          key: "donation_log",
          label: "Signed receipts from the districts",
          kind: "document",
          note: null,
        },
        {
          key: "photos",
          label: "Photography a newsroom can actually run",
          kind: "document",
          note: null,
        },
      ],
      missing_evidence: [],
    }),
    angle({
      id: "a1000000-0000-4000-8000-000000000005",
      angle_key: "founder-twenty-years",
      endowment: "people",
      angle_type: "people",
      status: "proposed",
      recommended_action: "hold_for_timing",
      headline:
        "The man who has watched every American computer die twice",
      summary:
        "A profile angle: two decades of running the loading dock where corporate America's hardware ends up, and what it reveals about how companies actually behave.",
      why_now: null,
      target_beat: "Business features",
      target_outlet_kind: "national",
      priority: 48,
      confidence: 71,
      newsworthiness: 58,
      timeliness: 22,
      evidence_quality: 64,
      action_reason:
        "Strong profile material with no hook to today. It gets much stronger attached to the 20-year anniversary in March.",
      analyzed_at: iso(-hours(19)),
      expires_at: iso(hours(24 * 200)),
      facts: [
        {
          statement: "The company reaches its 20th year in March 2027.",
          source_key: "company_record",
        },
      ],
      evidence_refs: [
        {
          key: "company_record",
          label: "Incorporation record",
          source: "CA Secretary of State",
          url: null,
          captured_at: iso(-hours(500)),
        },
      ],
      proof_required: [
        {
          key: "anecdotes",
          label: "Three specific, checkable stories from the dock",
          kind: "quote",
          note: null,
        },
      ],
      missing_evidence: [
        {
          key: "anecdotes",
          label: "Three specific, checkable stories from the dock",
          how_to_get:
            "Record a 20-minute conversation. We will pull the three strongest.",
          owner: "you",
          effort: "medium",
        },
      ],
    }),
    angle({
      id: "a1000000-0000-4000-8000-000000000006",
      angle_key: "zero-landfill-audit",
      endowment: "process",
      angle_type: "process",
      status: "landed",
      recommended_action: "pitch_now",
      headline:
        "What “zero landfill” actually requires: a walkthrough of the 14 downstream vendors behind one claim",
      summary:
        "Most zero-landfill claims stop at the first vendor. This traces one pallet through every downstream handler to final disposition.",
      why_now: "Greenwashing enforcement is an active FTC priority.",
      target_beat: "Sustainability",
      target_outlet_kind: "trade",
      priority: 69,
      confidence: 83,
      newsworthiness: 71,
      timeliness: 55,
      evidence_quality: 90,
      analyzed_at: iso(-hours(19 + 24 * 30)),
      accepted_at: iso(-hours(24 * 28)),
      pitched_at: iso(-hours(24 * 24)),
      landed_at: iso(-hours(24 * 11)),
      evidence_refs: [
        {
          key: "downstream_map",
          label: "Full downstream vendor map with R2 audit dates",
          source: "Internal — R2v3 appendix",
          url: null,
          captured_at: iso(-hours(24 * 35)),
        },
      ],
      proof_required: [
        {
          key: "downstream_map",
          label: "Full downstream vendor map",
          kind: "document",
          note: null,
        },
      ],
      missing_evidence: [],
    }),
    angle({
      id: "a1000000-0000-4000-8000-000000000007",
      angle_key: "battery-fire-near-miss",
      endowment: "process",
      angle_type: "customer_impact",
      status: "proposed",
      recommended_action: "develop_evidence",
      headline:
        "Lithium fires in waste facilities are up — and the failure is almost always at the loading dock, not the furnace",
      summary:
        "Incident data from mixed-load intake shows swollen cells arriving inside sealed corporate assets that were declared battery-free.",
      why_now:
        "Two municipal facility fires made national news in the last month.",
      target_beat: "Public safety",
      target_outlet_kind: "national",
      priority: 66,
      confidence: 59,
      newsworthiness: 88,
      timeliness: 81,
      evidence_quality: 33,
      action_reason:
        "The newsiest angle you have, and the least provable. Do not pitch it before the incident log is clean.",
      analyzed_at: iso(-hours(19)),
      requires_human_review: true,
      facts: [
        {
          statement:
            "31 swollen-cell interceptions were logged at intake in 12 months.",
          source_key: "incident_log",
        },
      ],
      contradictions: [
        {
          statement:
            "The incident log's severity field was only introduced in March.",
          detail: "Pre-March counts are not comparable. Any trend claim is unsafe.",
        },
      ],
      evidence_refs: [
        {
          key: "incident_log",
          label: "Intake incident log (partial schema before March)",
          source: "Internal EHS system",
          url: null,
          captured_at: iso(-hours(26)),
        },
      ],
      proof_required: [
        {
          key: "clean_log",
          label: "A consistent 12-month incident series",
          kind: "data",
          note: "Needed before any 'up' claim can survive a fact-check.",
        },
        {
          key: "fire_marshal",
          label: "A fire marshal or NFPA source who will corroborate",
          kind: "third_party",
          note: null,
        },
        {
          key: "photo",
          label: "Photography of an intercepted cell",
          kind: "document",
          note: null,
        },
      ],
      missing_evidence: [
        {
          key: "clean_log",
          label: "A consistent 12-month incident series",
          how_to_get:
            "EHS can backfill severity from the paper forms — roughly a day of work.",
          owner: "team",
          effort: "medium",
        },
        {
          key: "fire_marshal",
          label: "A fire marshal or NFPA source who will corroborate",
          how_to_get:
            "Ask your county fire marshal contact whether they will speak to it.",
          owner: "third_party",
          effort: "medium",
        },
      ],
    }),
    angle({
      id: "a1000000-0000-4000-8000-000000000008",
      angle_key: "crypto-mining-rig-dump",
      endowment: "capital",
      angle_type: "milestone",
      status: "dismissed",
      recommended_action: "park",
      headline: "Mining rig disposal volumes after the last halving",
      summary:
        "Volume moved, but the story has been written repeatedly and our numbers are not distinctive.",
      priority: 21,
      confidence: 74,
      newsworthiness: 24,
      timeliness: 18,
      evidence_quality: 55,
      action_reason: "Covered to death elsewhere. Nothing here is ours.",
      analyzed_at: iso(-hours(24 * 20)),
      dismissed_at: iso(-hours(24 * 19)),
      evidence_refs: [
        {
          key: "volume",
          label: "Mining hardware intake volume",
          source: "Internal operations system",
          url: null,
          captured_at: iso(-hours(24 * 21)),
        },
      ],
    }),
  ];

  const requests: SourceRequestRow[] = [
    request({
      id: "b2000000-0000-4000-8000-000000000001",
      platform: "haro",
      status: "drafted",
      match_score: 96,
      outlet: "The Wall Street Journal",
      journalist_name: "Dana Reyes",
      party_id: FIXTURE_PARTIES.reyes,
      beat: "Cybersecurity",
      external_url: "https://www.helpareporter.com/queries/wsj-data-disposal",
      external_id: "haro-2026-08-18-0442",
      query_title:
        "Looking for a data-destruction operator who can speak to where corporate data actually leaks",
      query_body:
        "Working on a piece about the Safeguards Rule and vendor chain of custody. I want someone who physically handles decommissioned drives — not a consultant. Numbers strongly preferred. Please include your certification and whether you can share underlying data.",
      requirements: [
        { label: "Operator, not consultant", met: true },
        { label: "Named certification", met: true },
        { label: "Shareable underlying data", met: true },
        { label: "Available for a call before Friday", met: null },
      ],
      match_reason:
        "Your accepted angle already answers this query almost exactly, and the proof is in hand.",
      story_angle_id: "a1000000-0000-4000-8000-000000000001",
      deadline_at: iso(hours(4.5)),
      draft_generated_at: iso(-hours(1)),
      draft_response:
        "Hi Dana — I run intake and destruction across nine facilities for All Green Electronics Recycling (NAID AAA and R2v3 certified, both verifiable in the i-SIGMA and SERI registries).\n\nOver the last twelve months we processed 41,802 drives. 17.4% arrived from certified third-party ITAD vendors with data still recoverable at our verification step. 94% of those failures came through a vendor rather than direct from the client — which points at chain of custody, not at destruction technique.\n\nI can share the row-level dataset under NDA and walk you through the wipe-verification method. Available for a call any time before Friday.",
      created_at: iso(-hours(5)),
      updated_at: iso(-hours(1)),
    }),
    request({
      id: "b2000000-0000-4000-8000-000000000002",
      platform: "qwoted",
      status: "matched",
      match_score: 88,
      outlet: "CNBC",
      journalist_name: "Adaeze Okonjo",
      party_id: FIXTURE_PARTIES.okonjo,
      beat: "Technology",
      external_url: "https://app.qwoted.com/source_requests/88214",
      query_title:
        "What happens to the first generation of AI datacenter hardware?",
      query_body:
        "Need someone in the recycling/ITAD chain who is seeing GPU-dense server decommissions come through. Interested in volumes, materials, and whether existing facilities can handle them.",
      requirements: [
        { label: "Seeing GPU decommissions first-hand", met: true },
        { label: "Can quantify volume", met: true },
        { label: "Can speak to materials handling", met: null },
      ],
      match_reason:
        "Direct hit on your AI-teardown angle — but that angle's evidence is still thin, so answer carefully.",
      story_angle_id: "a1000000-0000-4000-8000-000000000002",
      deadline_at: iso(hours(20)),
      created_at: iso(-hours(9)),
      updated_at: iso(-hours(9)),
    }),
    request({
      id: "b2000000-0000-4000-8000-000000000003",
      platform: "featured",
      status: "new",
      match_score: 71,
      outlet: "EdSurge",
      journalist_name: "Marta Lindqvist",
      party_id: FIXTURE_PARTIES.lindqvist,
      beat: "Education technology",
      external_url: "https://featured.com/questions/school-device-donation",
      query_title:
        "Districts sourcing refurbished devices — who is actually supplying them?",
      query_body:
        "Short quotes wanted from suppliers, refurbishers or district IT leads about where donated classroom hardware comes from and how data is handled before handover.",
      requirements: [
        { label: "Active district relationships", met: true },
        { label: "Data-handling detail", met: true },
      ],
      match_reason:
        "Your Riverside donation angle is live right now and fully provable.",
      story_angle_id: "a1000000-0000-4000-8000-000000000004",
      deadline_at: iso(hours(54)),
      created_at: iso(-hours(2)),
      updated_at: iso(-hours(2)),
    }),
    request({
      id: "b2000000-0000-4000-8000-000000000004",
      platform: "sourcebottle",
      status: "new",
      match_score: 34,
      outlet: "Small Business Trends",
      journalist_name: null,
      party_id: null,
      beat: "Small business",
      external_url: "https://www.sourcebottle.com/callout/119043",
      query_title: "Tips for small businesses going paperless",
      query_body:
        "Looking for practical, quotable tips on paperless offices. Any industry welcome.",
      requirements: [{ label: "Practical tips", met: true }],
      match_reason:
        "Weak fit: adjacent topic, no named journalist, and nothing here needs your expertise.",
      deadline_at: iso(hours(70)),
      created_at: iso(-hours(11)),
      updated_at: iso(-hours(11)),
    }),
    request({
      id: "b2000000-0000-4000-8000-000000000005",
      platform: "journorequest",
      status: "submitted",
      match_score: 79,
      outlet: "The Verge",
      journalist_name: "Ravi Patel",
      party_id: FIXTURE_PARTIES.patel,
      beat: "Consumer tech",
      external_url: "https://x.com/search?q=%23journorequest",
      query_title: "Where do trade-in phones actually end up?",
      query_body:
        "Tracing the downstream path of carrier trade-in devices. Want someone who processes them.",
      requirements: [{ label: "Processes trade-in devices", met: true }],
      match_reason: "Good fit on downstream traceability.",
      story_angle_id: "a1000000-0000-4000-8000-000000000006",
      deadline_at: iso(-hours(30)),
      submitted_at: iso(-hours(38)),
      draft_generated_at: iso(-hours(44)),
      draft_response:
        "Happy to walk you through the downstream chain — we publish the full vendor map with audit dates.",
      created_at: iso(-hours(48)),
      updated_at: iso(-hours(38)),
    }),
    request({
      id: "b2000000-0000-4000-8000-000000000006",
      platform: "haro",
      status: "expired",
      match_score: 62,
      outlet: "Fast Company",
      journalist_name: null,
      party_id: null,
      beat: "Sustainability",
      query_title: "Circular economy wins from mid-size manufacturers",
      deadline_at: iso(-hours(80)),
      match_reason: "Fair fit, but it closed before anyone opened it.",
      created_at: iso(-hours(120)),
      updated_at: iso(-hours(80)),
    }),
    request({
      id: "b2000000-0000-4000-8000-000000000007",
      platform: "qwoted",
      status: "won",
      match_score: 84,
      outlet: "E-Scrap News",
      journalist_name: "Marta Lindqvist",
      party_id: FIXTURE_PARTIES.lindqvist,
      beat: "Recycling industry",
      query_title: "Downstream transparency practices",
      deadline_at: iso(-hours(24 * 14)),
      submitted_at: iso(-hours(24 * 15)),
      won_at: iso(-hours(24 * 11)),
      story_angle_id: "a1000000-0000-4000-8000-000000000006",
      match_reason: "Answered with the downstream vendor map. It ran.",
      created_at: iso(-hours(24 * 16)),
      updated_at: iso(-hours(24 * 11)),
    }),
  ];

  const coverageRows: CoverageMentionRow[] = [
    coverage({
      id: "c3000000-0000-4000-8000-000000000001",
      url: "https://resource-recycling.com/e-scrap/2026/08/07/tracing-one-pallet-through-fourteen-vendors/",
      domain: "resource-recycling.com",
      title: "Tracing one pallet through fourteen downstream vendors",
      author_name: "Marta Lindqvist",
      author_party_id: FIXTURE_PARTIES.lindqvist,
      published_at: iso(-hours(24 * 11)),
      medium: "trade",
      links_to_site: true,
      link_urls: ["https://allgreenrecycling.com/downstream"],
      sentiment: "positive",
      sentiment_score: 0.82,
      prominence: "feature",
      prominence_score: 0.88,
      key_quote:
        "“If your recycler cannot name every downstream handler, the claim is decoration.”",
      hit_score: 93,
      topics: ["downstream transparency", "R2v3"],
      // No FK exists from coverage_mention → story_angle. The tie is recorded in
      // `metadata.story_angle_id` and surfaced as a door in the UI. Say what you did.
      metadata: { story_angle_id: "a1000000-0000-4000-8000-000000000006" },
    }),
    coverage({
      id: "c3000000-0000-4000-8000-000000000002",
      url: "https://www.theverge.com/2026/08/02/trade-in-phone-afterlife",
      domain: "theverge.com",
      title: "The afterlife of your trade-in phone",
      author_name: "Ravi Patel",
      author_party_id: FIXTURE_PARTIES.patel,
      published_at: iso(-hours(24 * 16)),
      medium: "news",
      links_to_site: false,
      sentiment: "neutral",
      sentiment_score: 0.12,
      prominence: "mention",
      prominence_score: 0.31,
      key_quote: null,
      hit_score: 58,
      topics: ["trade-in", "downstream"],
      metadata: { story_angle_id: "a1000000-0000-4000-8000-000000000006" },
    }),
    coverage({
      id: "c3000000-0000-4000-8000-000000000003",
      url: "https://www.pressenterprise.com/2026/08/12/riverside-classrooms-laptops",
      domain: "pressenterprise.com",
      title: "2,400 refurbished laptops head to Riverside County classrooms",
      author_name: null,
      author_party_id: null,
      published_at: iso(-hours(24 * 6)),
      medium: "news",
      links_to_site: true,
      link_urls: ["https://allgreenrecycling.com/"],
      sentiment: "positive",
      sentiment_score: 0.74,
      prominence: "feature",
      prominence_score: 0.6,
      key_quote: null,
      hit_score: 71,
      topics: ["education", "donation"],
      metadata: { story_angle_id: "a1000000-0000-4000-8000-000000000004" },
    }),
    coverage({
      id: "c3000000-0000-4000-8000-000000000004",
      url: "https://securitybrief.example.com/2026/07/22/itad-market-consolidation",
      domain: "securitybrief.example.com",
      title: "ITAD market consolidation accelerates",
      author_name: "Dana Reyes",
      author_party_id: FIXTURE_PARTIES.reyes,
      published_at: iso(-hours(24 * 27)),
      medium: "trade",
      links_to_site: false,
      sentiment: "neutral",
      sentiment_score: 0.0,
      prominence: "passing",
      prominence_score: 0.14,
      hit_score: 41,
      topics: ["ITAD"],
      metadata: {},
    }),
  ];

  return { angles, requests, coverage: coverageRows };
}
