/**
 * Press Room fixtures — THE ONLY file in this feature that invents data.
 *
 * Explicit instruction from the requester for this bake-off: `seo.story_angle`
 * and `seo.source_request` have no seeded rows yet, so the console is built
 * against believable fixtures. Two rules keep that from becoming a lie the
 * codebase has to live with:
 *
 *   1. Every fixture is a COMPLETE generated row type — `StoryAngleRow`,
 *      `SourceRequestRow`, `CoverageMentionRow`. Not a view model, not a
 *      subset. If a column is added or a name changes, this file stops
 *      compiling, which is exactly what should happen.
 *   2. Nothing outside this file knows fixtures exist. `source.ts` is the only
 *      importer, and its job is to be swapped for a Supabase read.
 *
 * The brand is All Green Electronics Recycling — a real shape of business for
 * this product: nationwide e-waste recycling and on-site data destruction,
 * R2v3 and NAID AAA certified, the classic "world-class at the craft, invisible
 * to the press" customer.
 *
 * Deadlines are generated RELATIVE to `now` because the deadline rail's entire
 * job is to show time running out; a frozen timestamp would render it inert and
 * hide the state that matters most. Every other timestamp is absolute.
 */

import type { Json } from "@/types/database.types";
import type {
  CoverageMentionRow,
  SourceRequestRow,
  StoryAngleRow,
} from "./types";

const ORG = "8a1f6f0e-0000-4000-8000-000000000001";
const SITE = "9b2e7a1d-0000-4000-8000-0000000000a1";
const USER = "7c3d5b2c-0000-4000-8000-0000000000f1";
const TRACKER = "6d4c9e33-0000-4000-8000-0000000000c1";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function iso(offsetMs: number, from = Date.now()): string {
  return new Date(from + offsetMs).toISOString();
}

/* ── row factories — defaults live here, not in every literal ─────────────── */

function angle(
  partial: Pick<
    StoryAngleRow,
    | "id"
    | "angle_key"
    | "endowment"
    | "angle_type"
    | "headline"
    | "summary"
    | "recommended_action"
    | "status"
    | "priority"
    | "confidence"
    | "newsworthiness"
    | "timeliness"
    | "evidence_quality"
  > &
    Partial<StoryAngleRow>,
): StoryAngleRow {
  return {
    organization_id: ORG,
    site_id: SITE,
    created_by: USER,
    updated_by: USER,
    why_now: null,
    target_beat: null,
    target_outlet_kind: null,
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
    analysis_version: "seo.story_angle/2026.08.3",
    requires_human_review: false,
    analyzed_at: iso(-6 * DAY),
    human_reviewed_at: null,
    accepted_at: null,
    pitched_at: null,
    landed_at: null,
    dismissed_at: null,
    expires_at: null,
    created_at: iso(-6 * DAY),
    updated_at: iso(-2 * DAY),
    deleted_at: null,
    version: 1,
    metadata: {},
    ...partial,
  };
}

function request(
  partial: Pick<
    SourceRequestRow,
    "id" | "platform" | "query_title" | "status" | "match_score"
  > &
    Partial<SourceRequestRow>,
): SourceRequestRow {
  return {
    organization_id: ORG,
    site_id: SITE,
    created_by: USER,
    updated_by: USER,
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
    created_at: iso(-2 * DAY),
    updated_at: iso(-1 * HOUR),
    deleted_at: null,
    version: 1,
    metadata: {},
    ...partial,
  };
}

function coverage(
  partial: Pick<
    CoverageMentionRow,
    "id" | "url" | "domain" | "title" | "medium" | "source"
  > &
    Partial<CoverageMentionRow>,
): CoverageMentionRow {
  return {
    organization_id: ORG,
    site_id: SITE,
    tracker_id: TRACKER,
    brand_key: "all-green",
    created_by: USER,
    updated_by: USER,
    normalized_url: partial.url.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    dedupe_key: partial.id,
    external_id: null,
    author_name: null,
    author_party_id: null,
    capture_status: "captured",
    captured_at: iso(-3 * DAY),
    discovered_at: iso(-3 * DAY),
    published_at: iso(-3 * DAY),
    analyzed_at: iso(-3 * DAY),
    alerted_at: null,
    analysis: {},
    competitor_key: null,
    is_competitor: false,
    hit_reason: null,
    hit_score: null,
    key_quote: null,
    language: "en",
    link_urls: [],
    links_to_site: false,
    matched_terms: ["All Green Electronics Recycling"],
    metadata: {},
    outcome_event_id: null,
    prominence: null,
    prominence_score: null,
    sentiment: null,
    sentiment_score: null,
    source_capture: {},
    topics: [],
    created_at: iso(-3 * DAY),
    updated_at: iso(-3 * DAY),
    version: 1,
    ...partial,
  };
}

/* ── the angles ───────────────────────────────────────────────────────────── */

export const ANGLE_IDS = {
  hardDriveGap: "1a000000-0000-4000-8000-000000000001",
  dataCenterRefresh: "1a000000-0000-4000-8000-000000000002",
  schoolChromebooks: "1a000000-0000-4000-8000-000000000003",
  shreddingMyth: "1a000000-0000-4000-8000-000000000004",
  lithiumFires: "1a000000-0000-4000-8000-000000000005",
  hospitalMri: "1a000000-0000-4000-8000-000000000006",
  ceoOrigin: "1a000000-0000-4000-8000-000000000007",
  taxSeason: "1a000000-0000-4000-8000-000000000008",
  cobaltIndex: "1a000000-0000-4000-8000-000000000009",
  r2Audit: "1a000000-0000-4000-8000-00000000000a",
} as const;

function storyAngles(): StoryAngleRow[] {
  return [
    angle({
      id: ANGLE_IDS.hardDriveGap,
      angle_key: "resold-drives-still-hold-data",
      endowment: "data",
      angle_type: "data_story",
      headline:
        "Nearly a third of resold corporate hard drives still hold recoverable company data",
      summary:
        "Across 4,812 drives received for destruction in the last 18 months, 31% arrived from third-party resellers still carrying recoverable files — payroll, patient names, and in two cases live VPN credentials. The drives were supposed to have been wiped.",
      why_now:
        "The FTC's updated Safeguards Rule enforcement sweep starts in October, and 'we wiped it' is about to stop being a defence.",
      target_beat: "Cybersecurity",
      target_outlet_kind: "national",
      priority: 94,
      confidence: 81,
      newsworthiness: 92,
      timeliness: 76,
      evidence_quality: 68,
      recommended_action: "develop_evidence",
      action_reason:
        "The number is the story and the number is yours. It cannot go out until the sample is documented in a way a reporter's editor will accept.",
      requires_human_review: true,
      status: "accepted",
      accepted_at: iso(-4 * DAY),
      facts: [
        {
          statement:
            "4,812 drives intake-scanned between Feb 2025 and Jul 2026 across 6 facilities.",
          source: "Intake ledger export, verified against facility manifests",
        },
        {
          statement:
            "1,492 of those drives returned recoverable data on forensic sampling (31.0%).",
          source: "NAID AAA sampling log",
        },
        {
          statement:
            "Two drives contained unexpired VPN credentials for a regional health network.",
          source: "Incident report 2026-0417, disclosed to the client",
        },
      ] as unknown as Json,
      inferences: [
        {
          statement:
            "Most 'certified wiped' resale inventory is wiped by software that does not touch remapped sectors.",
          basis: "Pattern across 3 reseller sources, not proven per-drive",
        },
      ] as unknown as Json,
      evidence_refs: [
        {
          label: "Intake ledger export (Feb 2025 – Jul 2026)",
          url: "https://drive.example.com/all-green/intake-ledger",
          kind: "spreadsheet",
        },
        {
          label: "NAID AAA certificate #A-11482",
          url: "https://naidaaa.example.org/cert/A-11482",
          kind: "certificate",
        },
      ] as unknown as Json,
      proof_required: [
        {
          key: "sample-method",
          claim: "The 31% is a defensible sample, not a cherry-pick.",
          kind: "method",
          why: "The first question any editor asks is how the drives were selected.",
        },
        {
          key: "raw-counts",
          claim: "Raw intake counts by facility and month.",
          kind: "data",
          why: "A reporter will want to see the denominator.",
        },
        {
          key: "third-party-check",
          claim: "An independent forensic lab confirms the recovery rate.",
          kind: "third_party",
          why: "Self-reported security findings get discounted without one.",
        },
        {
          key: "client-consent",
          claim: "Written consent to describe the VPN-credential incident anonymously.",
          kind: "document",
          why: "Naming the sector at all needs the client's sign-off.",
        },
        {
          key: "regulator-context",
          claim: "The Safeguards Rule timeline, cited to the FTC's own notice.",
          kind: "document",
          why: "Ties the story to a date, which is what makes it this month's story.",
        },
      ] as unknown as Json,
      missing_evidence: [
        {
          key: "third-party-check",
          need: "An independent lab re-runs 100 drives from the same intake pool.",
          how: "Two labs quoted; Kroll can turn it in 3 weeks for $6,400.",
          owner: "Ops — Marisol",
          effort: "deep",
        },
        {
          key: "client-consent",
          need: "Countersigned anonymised-disclosure consent from the health network.",
          how: "Legal already drafted it. It needs one signature.",
          owner: "Legal — Dan",
          effort: "quick",
        },
      ] as unknown as Json,
      contradictions: [
        {
          statement:
            "The Q1 2025 facility report puts the recovery rate at 24%, not 31%.",
          note: "Different denominator — Q1 excluded reseller intake. Reconcile before publishing either number.",
        },
      ] as unknown as Json,
      analysis: {
        journalist_read:
          "This is a numbers story with a named villain (resellers) and a deadline (FTC). It is the single most pitchable thing this business owns.",
        risk: "If the 31% moves after independent testing, the correction is public. Lock the number first.",
        headline_strength: 88,
      } as unknown as Json,
      analyzed_at: iso(-6 * DAY),
      human_reviewed_at: iso(-4 * DAY),
      human_ruling: {
        ruling: "accept",
        by: "Arman",
        note: "Yes — but nothing goes out before the lab confirms.",
      } as unknown as Json,
    }),

    angle({
      id: ANGLE_IDS.taxSeason,
      angle_key: "tax-records-shredding-window",
      endowment: "expertise",
      angle_type: "seasonal",
      headline:
        "The seven-year rule is wrong: what small businesses can legally destroy this month",
      summary:
        "Most owners keep everything forever because nobody tells them what the retention windows actually are. A practical, jurisdiction-aware destruction calendar — which records can go now, which cannot, and what 'destroyed' has to mean legally.",
      why_now:
        "Post-filing cleanup runs September through November; searches for 'how long to keep business records' triple in that window.",
      target_beat: "Small business",
      target_outlet_kind: "trade",
      priority: 71,
      confidence: 88,
      newsworthiness: 54,
      timeliness: 90,
      evidence_quality: 84,
      recommended_action: "pitch_now",
      action_reason:
        "Everything needed already exists, and the seasonal window closes in about six weeks.",
      status: "accepted",
      accepted_at: iso(-9 * DAY),
      facts: [
        {
          statement:
            "IRS retention guidance ranges 3–7 years depending on the claim type; state windows differ in 11 states.",
          source: "Compliance team's retention matrix, updated Jun 2026",
        },
      ] as unknown as Json,
      evidence_refs: [
        {
          label: "Retention matrix (50-state)",
          url: "https://drive.example.com/all-green/retention-matrix",
          kind: "spreadsheet",
        },
      ] as unknown as Json,
      proof_required: [
        {
          key: "matrix-current",
          claim: "The 50-state matrix is current as of this quarter.",
          kind: "document",
          why: "A stale legal table is worse than none.",
        },
        {
          key: "attribution",
          claim: "A named expert who will be quoted by name.",
          kind: "quote",
          why: "Trade desks need a human byline source.",
        },
      ] as unknown as Json,
      missing_evidence: [] as unknown as Json,
      analysis: {
        journalist_read:
          "Service journalism. Low novelty, high pickup — trade and regional business desks run this every autumn.",
        risk: "Reads as an advertorial unless the expert gives away something that costs the business money.",
      } as unknown as Json,
    }),

    angle({
      id: ANGLE_IDS.lithiumFires,
      angle_key: "recycling-facility-lithium-fires",
      endowment: "process",
      angle_type: "trend_commentary",
      headline:
        "Recycling plants are burning down and everyone is blaming the wrong battery",
      summary:
        "Vape pens and Bluetooth earbuds — not laptops or EVs — account for the majority of ignition events on sorting lines. An operator who runs six facilities can say what actually starts the fires and what the industry keeps mis-reporting.",
      why_now:
        "Three facility fires made national news in the last five weeks, all attributed to 'lithium batteries' with no further detail.",
      target_beat: "Climate & waste",
      target_outlet_kind: "national",
      priority: 87,
      confidence: 64,
      newsworthiness: 89,
      timeliness: 95,
      evidence_quality: 41,
      recommended_action: "needs_expert_input",
      action_reason:
        "The contrarian claim is only credible from someone who will attach their name to the incident counts.",
      requires_human_review: true,
      status: "proposed",
      facts: [
        {
          statement:
            "Six facilities logged 41 thermal events in 2025; 27 were traced to disposable vapes or earbuds.",
          source: "Facility EHS logs",
        },
      ] as unknown as Json,
      inferences: [
        {
          statement:
            "National reporting attributes these to 'e-waste lithium' without distinguishing device class.",
          basis: "Reading of the three recent fire stories, not a systematic survey",
        },
      ] as unknown as Json,
      evidence_refs: [
        {
          label: "EHS thermal-event log 2025",
          url: "https://drive.example.com/all-green/ehs-2025",
          kind: "spreadsheet",
        },
      ] as unknown as Json,
      proof_required: [
        {
          key: "event-classification",
          claim: "Each of the 41 events is classified by device type on the record.",
          kind: "data",
          why: "The whole claim is the breakdown.",
        },
        {
          key: "named-expert",
          claim: "An operations leader will be quoted by name and title.",
          kind: "quote",
          why: "An anonymous operator cannot carry a contrarian claim.",
        },
        {
          key: "industry-baseline",
          claim: "Some indication this is not unique to our facilities.",
          kind: "third_party",
          why: "Otherwise it is one company's anecdote.",
        },
      ] as unknown as Json,
      missing_evidence: [
        {
          key: "named-expert",
          need: "Confirm the VP of Operations will go on record about fires at our own plants.",
          how: "15-minute conversation. This is the only real blocker.",
          owner: "You",
          effort: "quick",
        },
        {
          key: "industry-baseline",
          need: "Any published industry figure on ignition sources, even a trade-body estimate.",
          how: "ISRI and the R2 registry both publish incident summaries.",
          owner: "Research",
          effort: "medium",
        },
      ] as unknown as Json,
      analysis: {
        journalist_read:
          "Fastest-moving angle you have. The news hook is live right now and will be cold in three weeks.",
        risk: "Talking publicly about fires at your own facilities. Decide that before pitching, not after.",
      } as unknown as Json,
      analyzed_at: iso(-2 * DAY),
      expires_at: iso(21 * DAY),
    }),

    angle({
      id: ANGLE_IDS.hospitalMri,
      angle_key: "medical-imaging-drive-disposal",
      endowment: "expertise",
      angle_type: "customer_impact",
      headline:
        "Hospitals are decommissioning imaging machines with patient scans still inside them",
      summary:
        "MRI and CT consoles hold years of studies on internal drives that hospital IT often does not know exist. Three health systems found scans on decommissioned units after the machines had already left the building.",
      why_now:
        "A wave of 2016-era imaging hardware is hitting end-of-life this year.",
      target_beat: "Health IT",
      target_outlet_kind: "trade",
      priority: 79,
      confidence: 72,
      newsworthiness: 81,
      timeliness: 58,
      evidence_quality: 55,
      recommended_action: "develop_evidence",
      action_reason:
        "Strong story, but every fact in it belongs to a HIPAA-covered client.",
      requires_human_review: true,
      status: "developing",
      accepted_at: iso(-12 * DAY),
      facts: [
        {
          statement:
            "Three health systems in 2025–26 had imaging consoles arrive with studies still resident.",
          source: "Service tickets 2025-8841, 2026-0193, 2026-0402",
        },
      ] as unknown as Json,
      evidence_refs: [
        {
          label: "Service ticket 2026-0402 (redacted)",
          url: "https://drive.example.com/all-green/ticket-2026-0402",
          kind: "document",
        },
      ] as unknown as Json,
      proof_required: [
        {
          key: "hipaa-clearance",
          claim: "Legal clearance to describe the incidents without identifying the systems.",
          kind: "document",
          why: "Non-negotiable before a word of this is said out loud.",
        },
        {
          key: "vendor-response",
          claim: "The imaging vendors' position on console storage.",
          kind: "third_party",
          why: "A reporter will call them anyway. Better to know the answer first.",
        },
        {
          key: "incident-detail",
          claim: "Dated, ticketed detail for each of the three incidents.",
          kind: "data",
          why: "Turns an assertion into a record.",
        },
      ] as unknown as Json,
      missing_evidence: [
        {
          key: "hipaa-clearance",
          need: "Written HIPAA sign-off on the anonymised description.",
          how: "Outside counsel review — quoted at two weeks.",
          owner: "Legal — Dan",
          effort: "deep",
        },
        {
          key: "vendor-response",
          need: "A statement, or a documented refusal to comment, from at least one vendor.",
          how: "Their press desks answer; ask in writing.",
          owner: "You",
          effort: "medium",
        },
      ] as unknown as Json,
      analysis: {
        journalist_read:
          "Health IT trades will take this on sight. National desks need a named health system, which you will not get.",
        risk: "Client relationships. This story is about your customers' mistakes.",
      } as unknown as Json,
    }),

    angle({
      id: ANGLE_IDS.schoolChromebooks,
      angle_key: "school-district-chromebook-cliff",
      endowment: "demand",
      angle_type: "local_impact",
      headline:
        "The pandemic Chromebook cliff hits school districts this school year",
      summary:
        "Devices bought with 2020 emergency funding are expiring together. Districts have no disposal budget line, and the machines are stacking up in gymnasiums.",
      why_now: "Districts are writing next year's budgets right now.",
      target_beat: "Education",
      target_outlet_kind: "regional",
      priority: 66,
      confidence: 69,
      newsworthiness: 63,
      timeliness: 72,
      evidence_quality: 47,
      recommended_action: "hold_for_timing",
      action_reason:
        "Regional education desks pick this up in budget season — six weeks out.",
      status: "proposed",
      facts: [
        {
          statement:
            "Intake from K-12 districts rose 240% year over year across four states.",
          source: "Intake ledger, segment = education",
        },
      ] as unknown as Json,
      evidence_refs: [
        {
          label: "Education segment intake, 2024 vs 2026",
          url: "https://drive.example.com/all-green/edu-intake",
          kind: "spreadsheet",
        },
      ] as unknown as Json,
      proof_required: [
        {
          key: "district-voice",
          claim: "One named district administrator describing the problem.",
          kind: "quote",
          why: "Local desks need a local human, not a vendor.",
        },
        {
          key: "funding-trace",
          claim: "The devices trace to a named 2020 federal funding programme.",
          kind: "document",
          why: "That link is what makes it a story and not a shrug.",
        },
      ] as unknown as Json,
      missing_evidence: [
        {
          key: "district-voice",
          need: "A district willing to be named.",
          how: "Two current clients plausibly would. Ask the account manager.",
          owner: "Sales — Priya",
          effort: "medium",
        },
      ] as unknown as Json,
      analysis: {
        journalist_read: "Good regional story with a calendar attached.",
        risk: "Nothing serious. It is just early.",
      } as unknown as Json,
      expires_at: iso(70 * DAY),
    }),

    angle({
      id: ANGLE_IDS.shreddingMyth,
      angle_key: "degaussing-does-not-work-on-ssd",
      endowment: "expertise",
      angle_type: "contrarian",
      headline: "Degaussing an SSD does nothing, and half the industry still sells it",
      summary:
        "Magnetic erasure is meaningless on flash storage, yet degaussing is still offered — and bought — as SSD sanitisation. A certified operator saying so publicly is unusual.",
      why_now: null,
      target_beat: "Cybersecurity",
      target_outlet_kind: "trade",
      priority: 58,
      confidence: 92,
      newsworthiness: 49,
      timeliness: 18,
      evidence_quality: 90,
      recommended_action: "park",
      action_reason:
        "True, provable, and evergreen — but no hook. Hold until something makes it news.",
      status: "proposed",
      facts: [
        {
          statement: "NIST SP 800-88 does not list degaussing as valid for flash media.",
          source: "NIST SP 800-88 Rev. 1, Appendix A",
        },
      ] as unknown as Json,
      evidence_refs: [
        {
          label: "NIST SP 800-88 Rev. 1",
          url: "https://nvlpubs.nist.gov/",
          kind: "standard",
        },
      ] as unknown as Json,
      proof_required: [
        {
          key: "standard-citation",
          claim: "The standard says what we say it says.",
          kind: "document",
          why: "It is the entire argument.",
        },
      ] as unknown as Json,
      missing_evidence: [] as unknown as Json,
      analysis: {
        journalist_read: "Correct and boring until a breach makes it topical.",
        risk: "None.",
      } as unknown as Json,
    }),

    angle({
      id: ANGLE_IDS.dataCenterRefresh,
      angle_key: "ai-datacenter-hardware-churn",
      endowment: "data",
      angle_type: "trend_commentary",
      headline:
        "AI buildouts are retiring three-year-old servers, and the resale market cannot absorb them",
      summary:
        "GPU-era refresh cycles are pushing barely-used enterprise hardware into disposal years early. Tonnage from data-centre clients has doubled while resale value per unit has fallen.",
      why_now: "Every publication is looking for a physical angle on the AI build-out.",
      target_beat: "Enterprise tech",
      target_outlet_kind: "national",
      priority: 83,
      confidence: 58,
      newsworthiness: 86,
      timeliness: 88,
      evidence_quality: 34,
      recommended_action: "develop_evidence",
      action_reason:
        "The hook is excellent. The evidence is currently one chart with no methodology.",
      status: "proposed",
      facts: [
        {
          statement: "Data-centre segment tonnage up 104% year over year.",
          source: "Weighbridge records",
        },
      ] as unknown as Json,
      inferences: [
        {
          statement: "The driver is AI-era refresh rather than general growth.",
          basis: "Client mix, not causally established",
        },
      ] as unknown as Json,
      evidence_refs: [
        {
          label: "Weighbridge tonnage by segment",
          url: "https://drive.example.com/all-green/tonnage",
          kind: "spreadsheet",
        },
      ] as unknown as Json,
      proof_required: [
        {
          key: "tonnage-method",
          claim: "Tonnage is normalised for facilities added during the period.",
          kind: "method",
          why: "Otherwise the growth is just more buildings.",
        },
        {
          key: "resale-curve",
          claim: "Resale value per unit over the same window.",
          kind: "data",
          why: "Half the headline depends on it.",
        },
        {
          key: "causal-link",
          claim: "Evidence the hardware is coming from AI-driven refreshes.",
          kind: "third_party",
          why: "Without it the AI framing is our guess.",
        },
      ] as unknown as Json,
      missing_evidence: [
        {
          key: "tonnage-method",
          need: "Same-facility tonnage series excluding the two plants opened in 2025.",
          how: "The weighbridge export already has facility codes. An afternoon.",
          owner: "Ops — Marisol",
          effort: "quick",
        },
        {
          key: "resale-curve",
          need: "Per-unit resale realisation by quarter.",
          how: "Finance has it. It has never been pulled for this purpose.",
          owner: "Finance",
          effort: "medium",
        },
        {
          key: "causal-link",
          need: "Two client accounts confirming their refresh was AI-capacity driven.",
          how: "Anonymised is fine for a trade desk; national will want names.",
          owner: "Sales — Priya",
          effort: "deep",
        },
      ] as unknown as Json,
      contradictions: [
        {
          statement: "Q2 tonnage fell 8% against Q1.",
          note: "One facility was down for retooling. Mention it before a reporter finds it.",
        },
      ] as unknown as Json,
      analysis: {
        journalist_read:
          "The most wanted subject in tech right now, from an angle nobody else can supply.",
        risk: "Thin evidence against a very high-scrutiny topic.",
      } as unknown as Json,
      analyzed_at: iso(-3 * DAY),
    }),

    angle({
      id: ANGLE_IDS.ceoOrigin,
      angle_key: "founder-origin-story",
      endowment: "people",
      angle_type: "people",
      headline: "From one truck to six facilities: how a recycler built a national footprint",
      summary: "Founder profile tracing the company from a single route to nationwide coverage.",
      why_now: null,
      target_beat: "Business profiles",
      target_outlet_kind: "regional",
      priority: 22,
      confidence: 74,
      newsworthiness: 19,
      timeliness: 12,
      evidence_quality: 62,
      recommended_action: "park",
      action_reason:
        "Founder profiles land only after the company is already in the news for something else.",
      status: "dismissed",
      dismissed_at: iso(-5 * DAY),
      human_reviewed_at: iso(-5 * DAY),
      human_ruling: {
        ruling: "dismiss",
        by: "Arman",
        note: "Not until we have landed a real story first.",
      } as unknown as Json,
      evidence_refs: [
        { label: "Company timeline", url: null, kind: "internal" },
      ] as unknown as Json,
      proof_required: [] as unknown as Json,
      missing_evidence: [] as unknown as Json,
      analysis: {
        journalist_read: "Every business desk gets ten of these a week.",
        risk: "None. It is just not a story yet.",
      } as unknown as Json,
    }),

    angle({
      id: ANGLE_IDS.r2Audit,
      angle_key: "r2v3-audit-pass-milestone",
      endowment: "process",
      angle_type: "milestone",
      headline: "Sixth facility certified R2v3 with zero non-conformities",
      summary:
        "All six facilities now hold R2v3 with a clean audit — rare enough in the sector to be worth a trade note.",
      why_now: "The certificate was issued eleven days ago.",
      target_beat: "Waste & recycling trade",
      target_outlet_kind: "trade",
      priority: 44,
      confidence: 95,
      newsworthiness: 31,
      timeliness: 66,
      evidence_quality: 97,
      recommended_action: "pitch_now",
      action_reason: "Fully provable, short shelf life, low effort. Send it as a brief.",
      status: "pitched",
      accepted_at: iso(-11 * DAY),
      pitched_at: iso(-7 * DAY),
      facts: [
        {
          statement: "Certificate SERI-R2-2026-2214 issued 2026-08-07, zero non-conformities.",
          source: "SERI certificate registry",
        },
      ] as unknown as Json,
      evidence_refs: [
        {
          label: "SERI R2v3 certificate SERI-R2-2026-2214",
          url: "https://sustainableelectronics.example.org/cert/2214",
          kind: "certificate",
        },
      ] as unknown as Json,
      proof_required: [
        {
          key: "certificate",
          claim: "The certificate exists and is public.",
          kind: "certificate",
          why: "It is the whole item.",
        },
      ] as unknown as Json,
      missing_evidence: [] as unknown as Json,
      analysis: {
        journalist_read: "A trade brief, not a feature. Two paragraphs, maybe a photo.",
        risk: "None.",
      } as unknown as Json,
    }),

    angle({
      id: ANGLE_IDS.cobaltIndex,
      angle_key: "recovered-cobalt-price-index",
      endowment: "data",
      angle_type: "research",
      headline:
        "A price index for recovered cobalt, built from what recyclers actually get paid",
      summary:
        "Published commodity prices and what a recycler realises for recovered material diverge sharply. An index from real settlement data would be cited by everyone in the sector.",
      why_now: "Battery-material pricing is unusually volatile this quarter.",
      target_beat: "Commodities",
      target_outlet_kind: "trade",
      priority: 61,
      confidence: 47,
      newsworthiness: 74,
      timeliness: 51,
      evidence_quality: 29,
      recommended_action: "needs_expert_input",
      action_reason:
        "Publishing an index is a commitment, not a pitch. Somebody has to own it quarterly.",
      status: "proposed",
      requires_human_review: true,
      facts: [
        {
          statement: "18 months of settlement records exist across three downstream buyers.",
          source: "Finance settlement ledger",
        },
      ] as unknown as Json,
      evidence_refs: [
        { label: "Settlement ledger extract", url: null, kind: "internal" },
      ] as unknown as Json,
      proof_required: [
        {
          key: "index-method",
          claim: "A published, defensible index methodology.",
          kind: "method",
          why: "An index without a method is a marketing chart.",
        },
        {
          key: "buyer-consent",
          claim: "Downstream buyers accept aggregate publication.",
          kind: "document",
          why: "Their pricing is commercially sensitive.",
        },
        {
          key: "cadence-owner",
          claim: "A named internal owner committed to updating it quarterly.",
          kind: "people",
          why: "A dead index damages credibility more than no index.",
        },
      ] as unknown as Json,
      missing_evidence: [
        {
          key: "index-method",
          need: "Methodology drafted and reviewed by someone who does this for a living.",
          how: "An economics-trained analyst, a week of work.",
          owner: "Unassigned",
          effort: "deep",
        },
        {
          key: "buyer-consent",
          need: "Written consent from all three buyers.",
          how: "Relationship conversation, not a legal one.",
          owner: "Sales — Priya",
          effort: "medium",
        },
        {
          key: "cadence-owner",
          need: "Somebody's name against the quarterly update.",
          how: "A decision, not a task.",
          owner: "You",
          effort: "quick",
        },
      ] as unknown as Json,
      analysis: {
        journalist_read:
          "If this existed it would be cited for years. It is the highest-ceiling item here and the furthest from ready.",
        risk: "Committing to something the business will not maintain.",
      } as unknown as Json,
    }),
  ];
}

/* ── source requests — journalist queries with live deadlines ─────────────── */

const PARTY_IDS = {
  reuters: "2b000000-0000-4000-8000-0000000000b1",
  wired: "2b000000-0000-4000-8000-0000000000b2",
  ehsToday: "2b000000-0000-4000-8000-0000000000b3",
  healthcareItNews: "2b000000-0000-4000-8000-0000000000b4",
  inc: "2b000000-0000-4000-8000-0000000000b5",
} as const;

function sourceRequests(): SourceRequestRow[] {
  return [
    request({
      id: "3c000000-0000-4000-8000-000000000001",
      platform: "qwoted",
      outlet: "WIRED",
      journalist_name: "Nadia Osei",
      party_id: PARTY_IDS.wired,
      beat: "Security",
      query_title:
        "Need a data-destruction operator who can talk about what's actually on resold drives",
      query_body:
        "Working on a piece about the secondhand hardware market ahead of the FTC sweep. Looking for someone who physically handles decommissioned enterprise drives and can speak to how often 'wiped' isn't. Numbers strongly preferred over anecdotes — if you have a sample size I will use it. Need to be able to attribute to a named person and company.",
      requirements: [
        "Named attribution, no anonymous sourcing",
        "A quantified finding with a stated sample size",
        "Available for a 20-minute call this week",
      ] as unknown as Json,
      deadline_at: iso(4 * HOUR + 40 * 60_000),
      match_score: 96,
      match_reason:
        "Your resold-drive angle answers this query almost line for line — same claim, same sample, same regulatory hook. This is the closest match the system has ever scored for this site.",
      story_angle_id: ANGLE_IDS.hardDriveGap,
      status: "drafted",
      external_url: "https://app.qwoted.example.com/requests/88412",
      external_id: "qw-88412",
      draft_generated_at: iso(-40 * 60_000),
      draft_response:
        "Hi Nadia — I run intake for six facilities that take in decommissioned enterprise drives for destruction.\n\nOver the last 18 months we scanned 4,812 drives at intake. 1,492 of them — 31% — still had recoverable data when they reached us, and almost all of that came through third-party resellers who had certified the drives as wiped. Two of them still had live VPN credentials for a healthcare network.\n\nThe reason is boring and fixable: most 'certified wipe' software never touches remapped sectors, and nobody verifies afterwards.\n\nHappy to be quoted by name, and I can share the intake methodology. One caveat I would rather you hear from me: an independent lab is currently re-running a 100-drive subsample, so treat 31% as our figure until that lands.",
    }),

    request({
      id: "3c000000-0000-4000-8000-000000000002",
      platform: "haro",
      outlet: "EHS Today",
      journalist_name: "Grant Whitfield",
      party_id: PARTY_IDS.ehsToday,
      beat: "Workplace safety",
      query_title: "What is actually causing the wave of recycling facility fires?",
      query_body:
        "Following three facility fires in five weeks. Every report says 'lithium batteries' and stops there. I want an operator who can break down ignition sources by device type. Will accept operations-level sourcing.",
      requirements: [
        "Facility operator or EHS lead",
        "Willing to discuss incidents at their own sites",
      ] as unknown as Json,
      deadline_at: iso(19 * HOUR),
      match_score: 91,
      match_reason:
        "Your lithium-fire angle exists precisely because of these three fires. The one blocker — a named operations voice — is the same blocker this query has.",
      story_angle_id: ANGLE_IDS.lithiumFires,
      status: "matched",
      external_url: "https://haro.example.com/q/2026-08-1188",
      external_id: "haro-2026-08-1188",
    }),

    request({
      id: "3c000000-0000-4000-8000-000000000003",
      platform: "featured",
      outlet: "Healthcare IT News",
      journalist_name: "Dr. Yvonne Park",
      party_id: PARTY_IDS.healthcareItNews,
      beat: "Health IT",
      query_title: "End-of-life imaging equipment and PHI — who is responsible?",
      query_body:
        "Sourcing for a piece on decommissioning imaging hardware. Specifically interested in whether PHI persists on consoles after removal and where the chain of custody breaks.",
      requirements: [
        "HIPAA-literate source",
        "Cannot identify covered entities",
      ] as unknown as Json,
      deadline_at: iso(2 * DAY + 6 * HOUR),
      match_score: 84,
      match_reason:
        "Directly matches the imaging-console angle. Their 'cannot identify covered entities' constraint removes the exact obstacle blocking that angle.",
      story_angle_id: ANGLE_IDS.hospitalMri,
      status: "new",
      external_url: "https://featured.example.com/q/44120",
    }),

    request({
      id: "3c000000-0000-4000-8000-000000000004",
      platform: "haro",
      outlet: "Inc.",
      journalist_name: "Callum Reyes",
      party_id: PARTY_IDS.inc,
      beat: "Small business",
      query_title: "How long should a small business keep its records?",
      query_body:
        "Standard service piece for the autumn cleanup season. Need someone who can be specific about retention windows and what 'destroy' has to mean.",
      requirements: ["Named expert", "Specific, citable retention windows"] as unknown as Json,
      deadline_at: iso(-9 * HOUR),
      match_score: 77,
      match_reason:
        "Matches the retention-calendar angle exactly, and every proof it needs was already in hand.",
      story_angle_id: ANGLE_IDS.taxSeason,
      status: "expired",
      external_url: "https://haro.example.com/q/2026-08-1042",
      draft_generated_at: iso(-2 * DAY),
      draft_response:
        "Happy to help — the short answer is that 'seven years' is a myth that costs businesses money. Our 50-state retention matrix says…",
    }),

    request({
      id: "3c000000-0000-4000-8000-000000000005",
      platform: "qwoted",
      outlet: "Reuters",
      journalist_name: "Ingrid Halvorsen",
      party_id: PARTY_IDS.reuters,
      beat: "Enterprise technology",
      query_title: "Where does retired AI infrastructure physically go?",
      query_body:
        "Reporting on the physical downstream of the AI build-out. Looking for recyclers, resellers, or data-centre operators who can describe volumes and what happens to the hardware.",
      requirements: [
        "Verifiable volume figures",
        "Willing to be named",
        "Photos of the facility if possible",
      ] as unknown as Json,
      deadline_at: iso(3 * DAY + 2 * HOUR),
      match_score: 88,
      match_reason:
        "Matches the data-centre churn angle. Note the mismatch: they want verifiable volumes and that angle's tonnage methodology is its biggest gap.",
      story_angle_id: ANGLE_IDS.dataCenterRefresh,
      status: "new",
      external_url: "https://app.qwoted.example.com/requests/88530",
    }),

    request({
      id: "3c000000-0000-4000-8000-000000000006",
      platform: "sourcebottle",
      outlet: "Green Business Weekly",
      journalist_name: null,
      party_id: null,
      beat: "Sustainability",
      query_title: "Certification bodies in e-waste — does R2 actually mean anything?",
      query_body:
        "Sceptical piece on certification value. Want operators on both sides of the argument.",
      requirements: ["Certified operator"] as unknown as Json,
      deadline_at: iso(6 * DAY),
      match_score: 41,
      match_reason:
        "Weak match: the outlet is small and the framing is adversarial toward the certification you just earned.",
      status: "new",
      external_url: "https://sourcebottle.example.com/q/9921",
    }),

    request({
      id: "3c000000-0000-4000-8000-000000000007",
      platform: "featured",
      outlet: "CIO Dive",
      journalist_name: "Marcus Lindqvist",
      party_id: null,
      beat: "Enterprise IT",
      query_title: "ITAD vendor selection: what should IT leaders be asking?",
      query_body: "Buyer's-guide format. Looking for practitioner input on vendor due diligence.",
      requirements: ["Practitioner, not a vendor pitch"] as unknown as Json,
      deadline_at: iso(-3 * DAY),
      match_score: 69,
      match_reason: "Good fit, submitted on time, no response yet from the desk.",
      status: "submitted",
      submitted_at: iso(-4 * DAY),
      external_url: "https://featured.example.com/q/43980",
      draft_response:
        "Three questions that separate a real ITAD vendor from a broker: ask for the downstream chain in writing, ask which sanitisation standard they certify to per media type, and ask to see a single serialised item's full audit trail.",
    }),

    request({
      id: "3c000000-0000-4000-8000-000000000008",
      platform: "journorequest",
      outlet: "Local ABC affiliate",
      journalist_name: "Tasha Boone",
      party_id: null,
      beat: "Consumer",
      query_title: "Where can people safely recycle old phones and laptops?",
      query_body: "Short consumer segment. Need a local drop-off explainer.",
      requirements: ["Local to the metro area"] as unknown as Json,
      deadline_at: iso(30 * HOUR),
      match_score: 34,
      match_reason:
        "Low match: consumer drop-off is not this business's line, and the segment will not carry the brand.",
      status: "passed",
    }),
  ];
}

/* ── coverage won ─────────────────────────────────────────────────────────── */

function coverageMentions(): CoverageMentionRow[] {
  return [
    coverage({
      id: "4d000000-0000-4000-8000-000000000001",
      url: "https://www.reuters.com/technology/ai-hardware-downstream-2026",
      domain: "reuters.com",
      title:
        "The AI boom's other output: mountains of three-year-old servers",
      medium: "news",
      source: "reuters",
      author_name: "Ingrid Halvorsen",
      author_party_id: PARTY_IDS.reuters,
      published_at: iso(-9 * DAY),
      discovered_at: iso(-9 * DAY),
      sentiment: "positive",
      sentiment_score: 0.62,
      prominence: "quoted",
      prominence_score: 74,
      links_to_site: true,
      link_urls: ["https://allgreenrecycling.example.com/data-center-services"],
      key_quote:
        "\"We are taking in machines that are barely warm,\" said the recycler's operations lead.",
      hit_score: 91,
      hit_reason: "Brand named, quoted, and linked in a tier-one outlet.",
      topics: ["ai-infrastructure", "e-waste"] as unknown as Json,
      metadata: { story_angle_id: ANGLE_IDS.dataCenterRefresh } as unknown as Json,
    }),
    coverage({
      id: "4d000000-0000-4000-8000-000000000002",
      url: "https://www.ehstoday.com/facility-fires-vape-batteries",
      domain: "ehstoday.com",
      title: "It is not the laptops: what is really igniting sorting lines",
      medium: "trade",
      source: "ehs_today",
      author_name: "Grant Whitfield",
      author_party_id: PARTY_IDS.ehsToday,
      published_at: iso(-16 * DAY),
      discovered_at: iso(-15 * DAY),
      sentiment: "positive",
      sentiment_score: 0.48,
      prominence: "mentioned",
      prominence_score: 41,
      links_to_site: false,
      key_quote:
        "Operators report disposable vapes as a disproportionate ignition source.",
      hit_score: 58,
      hit_reason: "Mentioned without a link; the quote is paraphrased.",
      topics: ["facility-safety"] as unknown as Json,
      metadata: { story_angle_id: ANGLE_IDS.lithiumFires } as unknown as Json,
    }),
    coverage({
      id: "4d000000-0000-4000-8000-000000000003",
      url: "https://www.wasteandrecyclingnews.example.com/r2v3-sixth-facility",
      domain: "wasteandrecyclingnews.example.com",
      title: "All Green certifies sixth facility under R2v3",
      medium: "trade",
      source: "wrn",
      author_name: null,
      author_party_id: null,
      published_at: iso(-5 * DAY),
      discovered_at: iso(-5 * DAY),
      sentiment: "neutral",
      sentiment_score: 0.11,
      prominence: "headline",
      prominence_score: 88,
      links_to_site: true,
      link_urls: ["https://allgreenrecycling.example.com/certifications"],
      hit_score: 66,
      hit_reason: "Headline mention with a link, but a very small trade audience.",
      topics: ["certification"] as unknown as Json,
      metadata: { story_angle_id: ANGLE_IDS.r2Audit } as unknown as Json,
    }),
    coverage({
      id: "4d000000-0000-4000-8000-000000000004",
      url: "https://securityledger.example.com/secondhand-drive-risk",
      domain: "securityledger.example.com",
      title: "Secondhand drives are a breach waiting to be filed",
      medium: "blog",
      source: "security_ledger",
      author_name: "Priyanka Raman",
      author_party_id: null,
      published_at: iso(-22 * DAY),
      discovered_at: iso(-21 * DAY),
      sentiment: "neutral",
      sentiment_score: 0.05,
      prominence: "passing",
      prominence_score: 18,
      links_to_site: false,
      hit_score: 24,
      hit_reason:
        "Cites the resold-drive figure without naming the source. Worth a correction request.",
      topics: ["data-security"] as unknown as Json,
      metadata: {} as unknown as Json,
    }),
    coverage({
      id: "4d000000-0000-4000-8000-000000000005",
      url: "https://competitorwatch.example.com/greenloop-expansion",
      domain: "competitorwatch.example.com",
      title: "GreenLoop opens two facilities in the Southeast",
      medium: "trade",
      source: "competitor_watch",
      author_name: null,
      author_party_id: null,
      published_at: iso(-11 * DAY),
      discovered_at: iso(-11 * DAY),
      is_competitor: true,
      competitor_key: "greenloop",
      sentiment: "neutral",
      sentiment_score: 0,
      prominence: "none",
      prominence_score: 0,
      hit_score: 12,
      hit_reason: "Competitor coverage — tracked, not ours.",
      matched_terms: ["GreenLoop"],
      topics: ["competitor"] as unknown as Json,
    }),
  ];
}

export interface PressRoomBundle {
  angles: StoryAngleRow[];
  requests: SourceRequestRow[];
  coverage: CoverageMentionRow[];
  siteId: string;
  siteName: string;
  brandName: string;
}

export function buildFixtureBundle(): PressRoomBundle {
  return {
    angles: storyAngles(),
    requests: sourceRequests(),
    coverage: coverageMentions(),
    siteId: SITE,
    siteName: "allgreenrecycling.com",
    brandName: "All Green Electronics Recycling",
  };
}
