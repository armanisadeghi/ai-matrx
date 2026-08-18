/**
 * The ONE fixture file for the Newsroom Desk.
 *
 * `seo.story_angle` and `seo.source_request` have no seeded rows yet, so the
 * bake-off brief explicitly authorises fixtures HERE and nowhere else. The
 * rules that make them a stepping stone rather than a lie:
 *
 *   1. Every object is typed as the GENERATED row type — a column that does
 *      not exist cannot be invented, and a column that changes shape breaks
 *      this file at compile time.
 *   2. Nothing outside this file knows fixtures exist. `PressDeskWorkspace`
 *      takes `DeskData`; swapping in a Supabase read is a one-import change.
 *   3. Deadlines are relative to load, because a countdown that never moves
 *      cannot show you what the urgent states look like.
 *
 * Three client businesses, because this desk is an AGENCY surface: the
 * operator runs press for several brands at once and needs one queue, not
 * three logins.
 */

import type { Json } from "@/types/database.types";

import type {
  CoverageMentionRow,
  DeskData,
  DeskSite,
  SourceRequestRow,
  StoryAngleRow,
} from "./types";

const ORG = "6c1b0f9a-9d51-4c2e-9d09-2a4bd7f1a001";
const NOW = Date.now();

const hours = (value: number): string =>
  new Date(NOW + value * 3_600_000).toISOString();
const days = (value: number): string => hours(value * 24);

export const PRESS_SITES: DeskSite[] = [
  {
    siteId: "11111111-1111-4111-8111-111111111111",
    brandId: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
    brandName: "All Green Electronics Recycling",
    domain: "allgreenrecycling.com",
    brandKey: "all-green",
  },
  {
    siteId: "22222222-2222-4222-8222-222222222222",
    brandId: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb",
    brandName: "Northbeam Pediatric Dental",
    domain: "northbeampediatric.com",
    brandKey: "northbeam",
  },
  {
    siteId: "33333333-3333-4333-8333-333333333333",
    brandId: "cccccccc-3333-4333-8333-cccccccccccc",
    brandName: "Cordwell Structural",
    domain: "cordwellstructural.com",
    brandKey: "cordwell",
  },
];

const [ALL_GREEN, NORTHBEAM, CORDWELL] = PRESS_SITES;

/* ── angle factory ─────────────────────────────────────────────────────── */

type AngleSeed = Partial<StoryAngleRow> &
  Pick<
    StoryAngleRow,
    | "id"
    | "site_id"
    | "angle_key"
    | "endowment"
    | "angle_type"
    | "headline"
    | "summary"
    | "recommended_action"
  >;

function angle(seed: AngleSeed): StoryAngleRow {
  return {
    accepted_at: null,
    action_reason: null,
    analysis: {},
    analysis_version: "story-engine@2026.08.3",
    analyzed_at: hours(-9),
    confidence: 70,
    contradictions: [],
    created_at: days(-6),
    created_by: null,
    deleted_at: null,
    dismissed_at: null,
    evidence_fingerprint: `fp_${seed.angle_key}`,
    evidence_quality: 55,
    evidence_refs: [],
    expires_at: null,
    facts: [],
    human_reviewed_at: null,
    human_ruling: {},
    inferences: [],
    landed_at: null,
    metadata: {},
    missing_evidence: [],
    newsworthiness: 60,
    organization_id: ORG,
    pitched_at: null,
    priority: 60,
    proof_required: [],
    requires_human_review: false,
    status: "proposed",
    target_beat: null,
    target_outlet_kind: null,
    timeliness: 55,
    updated_at: hours(-9),
    updated_by: null,
    version: 1,
    why_now: null,
    ...seed,
  };
}

const ANGLES: StoryAngleRow[] = [
  angle({
    id: "a1000000-0000-4000-8000-000000000001",
    site_id: ALL_GREEN.siteId,
    angle_key: "residual-data-on-retired-laptops",
    endowment: "data",
    angle_type: "data_story",
    headline:
      "One in three corporate laptops arrives for recycling with recoverable data still on it",
    summary:
      "Across 4,218 machines received from Fortune 1000 IT departments in the last two quarters, 31.4% still held recoverable data at intake — despite every one arriving with a signed internal wipe attestation. The gap is not malice; it is that a 'wipe' performed by IT staff on a machine with a failed drive controller silently does nothing.",
    why_now:
      "The Q1 corporate refresh cycle just closed, and three states opened data-disposal enforcement dockets this month.",
    target_beat: "enterprise IT / cybersecurity",
    target_outlet_kind: "national",
    priority: 94,
    newsworthiness: 92,
    timeliness: 81,
    evidence_quality: 58,
    confidence: 86,
    recommended_action: "develop_evidence",
    action_reason:
      "The number is the story, and the number is not yet defensible to a hostile editor. Two artefacts close it.",
    requires_human_review: true,
    facts: [
      {
        label: "4,218 machines received Jan–Jun 2026 from 41 enterprise clients",
        source: "intake ledger",
      },
      {
        label: "1,325 (31.4%) held recoverable data at forensic intake scan",
        source: "NAID AAA intake scan log",
      },
    ] as unknown as Json,
    inferences: [
      {
        label:
          "Failed-controller drives are the dominant cause, not policy failure",
        detail:
          "89% of the affected machines had SMART pre-fail flags, which is where an in-house wipe silently no-ops.",
      },
    ] as unknown as Json,
    evidence_refs: [
      {
        label: "Intake forensic scan log, Jan–Jun 2026",
        source: "Internal NAID AAA audit trail",
        satisfied: true,
      },
      {
        label: "Client attestation forms (41 enterprises, redacted)",
        source: "Contracts system",
        satisfied: true,
      },
    ] as unknown as Json,
    proof_required: [
      { label: "Intake forensic scan log, Jan–Jun 2026" },
      { label: "Client attestation forms (41 enterprises, redacted)" },
      {
        label: "Third-party chain-of-custody audit covering the sample window",
        detail:
          "A journalist will ask who watched the drives between the loading dock and the scanner.",
        owner: "Compliance lead",
      },
      {
        label: "Counsel sign-off on the anonymisation method",
        detail:
          "Client names must be unrecoverable from the dataset before anything is shared.",
        owner: "Outside counsel",
      },
      {
        label: "One named client willing to be quoted on the record",
        detail: "Optional but it doubles the pickup rate on a story like this.",
        owner: "Account management",
      },
    ] as unknown as Json,
    missing_evidence: [
      {
        label: "Third-party chain-of-custody audit covering the sample window",
        detail:
          "A journalist will ask who watched the drives between the loading dock and the scanner.",
        owner: "Compliance lead",
      },
      {
        label: "Counsel sign-off on the anonymisation method",
        detail:
          "Client names must be unrecoverable from the dataset before anything is shared.",
        owner: "Outside counsel",
      },
      {
        label: "One named client willing to be quoted on the record",
        detail: "Optional but it doubles the pickup rate on a story like this.",
        owner: "Account management",
      },
    ] as unknown as Json,
    contradictions: [
      {
        label:
          "Your own 2025 marketing page claims 'zero residual data across all intakes'",
        detail:
          "A reporter will find it. Either the page changes or the claim needs a defined scope.",
        url: "https://allgreenrecycling.com/data-destruction",
      },
    ] as unknown as Json,
  }),
  angle({
    id: "a1000000-0000-4000-8000-000000000002",
    site_id: ALL_GREEN.siteId,
    angle_key: "certificate-of-destruction-means-little",
    endowment: "expertise",
    angle_type: "contrarian",
    headline:
      "The 'certificate of destruction' most companies file away is not evidence of anything",
    summary:
      "A certificate of destruction is issued by the vendor about its own work. Nothing in the document requires an independent witness, a serial-level manifest, or a retention period. Our operations director can walk a reporter through what a defensible certificate actually contains and why 90% of the ones in circulation would not survive a discovery request.",
    why_now:
      "Two large breach settlements this quarter turned on disposal records that could not be substantiated.",
    target_beat: "cybersecurity / risk & compliance",
    target_outlet_kind: "trade",
    priority: 88,
    newsworthiness: 79,
    timeliness: 72,
    evidence_quality: 91,
    confidence: 90,
    recommended_action: "pitch_now",
    action_reason:
      "Provable today, an expert is available, and the news hook is live. Nothing is blocking this.",
    status: "accepted",
    accepted_at: days(-2),
    human_reviewed_at: days(-2),
    evidence_refs: [
      {
        label: "NAID AAA certification, current",
        source: "i-SIGMA registry",
        url: "https://isigmaonline.org/certification-search/",
        satisfied: true,
      },
      {
        label: "Sample serial-level manifest (redacted)",
        source: "Operations",
        satisfied: true,
      },
      {
        label: "Operations director available for interview, 48h notice",
        source: "Internal",
        satisfied: true,
      },
    ] as unknown as Json,
    proof_required: [
      { label: "NAID AAA certification, current" },
      { label: "Sample serial-level manifest (redacted)" },
      { label: "Operations director available for interview, 48h notice" },
    ] as unknown as Json,
    facts: [
      {
        label:
          "No US federal standard defines the minimum contents of a certificate of destruction",
      },
    ] as unknown as Json,
  }),
  angle({
    id: "a1000000-0000-4000-8000-000000000003",
    site_id: ALL_GREEN.siteId,
    angle_key: "sb1215-landfill-ban-quiet-start",
    endowment: "process",
    angle_type: "trend_commentary",
    headline:
      "A whole class of electronics became illegal to landfill on January 1 and almost nobody noticed",
    summary:
      "SB 1215 extended covered-device rules to battery-embedded products. Facilities managers who have been treating cordless tools and vape hardware as ordinary waste are now out of compliance, and the enforcement grace period ends this quarter.",
    why_now:
      "The enforcement grace period ends in 41 days; nobody has written the practical explainer yet.",
    target_beat: "state policy / facilities management",
    target_outlet_kind: "regional",
    priority: 82,
    newsworthiness: 74,
    timeliness: 96,
    evidence_quality: 84,
    confidence: 81,
    recommended_action: "pitch_now",
    action_reason:
      "Timeliness is the entire value here and it decays to zero after the grace period.",
    status: "landed",
    accepted_at: days(-21),
    pitched_at: days(-16),
    landed_at: days(-9),
    human_reviewed_at: days(-21),
    expires_at: days(41),
    evidence_refs: [
      {
        label: "SB 1215 text and effective dates",
        source: "California Legislative Information",
        url: "https://leginfo.legislature.ca.gov/",
        satisfied: true,
      },
      { label: "CalRecycle covered-device list, 2026 revision", satisfied: true },
    ] as unknown as Json,
    proof_required: [
      { label: "SB 1215 text and effective dates" },
      { label: "CalRecycle covered-device list, 2026 revision" },
    ] as unknown as Json,
  }),
  angle({
    id: "a1000000-0000-4000-8000-000000000004",
    site_id: ALL_GREEN.siteId,
    angle_key: "mass-balance-where-every-pound-went",
    endowment: "data",
    angle_type: "milestone",
    headline:
      "1.1 million pounds of electronics came through the door last year — here is where every pound went",
    summary:
      "A full mass-balance breakdown by material stream, downstream processor, and final disposition. Most recyclers publish a tonnage headline and stop; the interesting story is the 3.8% that could not be accounted for and why that number is honest rather than embarrassing.",
    why_now: null,
    target_beat: "sustainability / circular economy",
    target_outlet_kind: "trade",
    priority: 64,
    newsworthiness: 66,
    timeliness: 28,
    evidence_quality: 47,
    confidence: 72,
    recommended_action: "develop_evidence",
    action_reason:
      "Strong once verified. Self-reported mass balance without an auditor is not a story a trade desk will run.",
    status: "developing",
    accepted_at: days(-11),
    human_reviewed_at: days(-11),
    requires_human_review: true,
    evidence_refs: [
      { label: "Internal 2025 mass-balance workbook", satisfied: true },
    ] as unknown as Json,
    proof_required: [
      { label: "Internal 2025 mass-balance workbook" },
      {
        label: "Third-party verification of the mass-balance figures",
        detail: "R2 auditor can attest; the engagement has not been booked.",
        owner: "Compliance lead",
      },
      {
        label: "Downstream processor confirmations (7 vendors)",
        detail: "Four returned, three outstanding.",
        owner: "Operations",
      },
    ] as unknown as Json,
    missing_evidence: [
      {
        label: "Third-party verification of the mass-balance figures",
        detail: "R2 auditor can attest; the engagement has not been booked.",
        owner: "Compliance lead",
      },
      {
        label: "Downstream processor confirmations (7 vendors)",
        detail: "Four returned, three outstanding.",
        owner: "Operations",
      },
    ] as unknown as Json,
  }),
  angle({
    id: "a2000000-0000-4000-8000-000000000005",
    site_id: NORTHBEAM.siteId,
    angle_key: "varnish-uptake-collapse",
    endowment: "data",
    angle_type: "local_impact",
    headline:
      "Fluoride varnish uptake in our patient base fell 31% in eighteen months",
    summary:
      "Across 2,900 paediatric patients, acceptance of in-office fluoride varnish dropped from 74% to 51% between late 2024 and mid 2026, concentrated almost entirely in the 2–5 age band. The clinical consequence shows up two years later, which is why nobody has reported it yet.",
    why_now:
      "Back-to-school checkup season starts in six weeks and this is when parents make the decision.",
    target_beat: "health / parenting",
    target_outlet_kind: "national",
    priority: 79,
    newsworthiness: 83,
    timeliness: 64,
    evidence_quality: 52,
    confidence: 68,
    recommended_action: "needs_expert_input",
    action_reason:
      "The data is real but the clinical claim needs Dr Okonjo to state what it does and does not imply. Publishing the inference without her is how a practice ends up in a correction.",
    requires_human_review: true,
    facts: [
      { label: "Acceptance 74% (Q4 2024) → 51% (Q2 2026), n=2,900" },
    ] as unknown as Json,
    inferences: [
      {
        label: "The decline tracks a national advisory cycle, not local factors",
        detail: "Unverified — needs comparison against state-level data.",
      },
    ] as unknown as Json,
    evidence_refs: [
      { label: "Practice management export, de-identified", satisfied: true },
    ] as unknown as Json,
    proof_required: [
      { label: "Practice management export, de-identified" },
      {
        label: "Dr Okonjo on the record about clinical implications",
        owner: "Dr Amara Okonjo",
        detail:
          "One 20-minute call. Without it this is a chart, not a health story.",
      },
      {
        label: "State or national comparison series",
        owner: "Analyst",
        detail: "Otherwise a reporter cannot tell local from national.",
      },
    ] as unknown as Json,
    missing_evidence: [
      {
        label: "Dr Okonjo on the record about clinical implications",
        owner: "Dr Amara Okonjo",
        detail:
          "One 20-minute call. Without it this is a chart, not a health story.",
      },
      {
        label: "State or national comparison series",
        owner: "Analyst",
        detail: "Otherwise a reporter cannot tell local from national.",
      },
    ] as unknown as Json,
  }),
  angle({
    id: "a2000000-0000-4000-8000-000000000006",
    site_id: NORTHBEAM.siteId,
    angle_key: "twenty-minute-rule",
    endowment: "expertise",
    angle_type: "process",
    headline:
      "Why a paediatric dentist will not treat a three-year-old in under twenty minutes",
    summary:
      "The behavioural protocol behind the appointment length — tell-show-do, the reason a rushed first visit produces a decade of avoidance, and what parents should watch for in a practice that schedules eight-minute slots.",
    why_now: null,
    target_beat: "parenting",
    target_outlet_kind: "national",
    priority: 51,
    newsworthiness: 58,
    timeliness: 22,
    evidence_quality: 88,
    confidence: 84,
    recommended_action: "hold_for_timing",
    action_reason:
      "Fully provable and genuinely useful, but evergreen. Hold it for back-to-school or a Children's Dental Health Month peg.",
    status: "accepted",
    accepted_at: days(-30),
    human_reviewed_at: days(-30),
    evidence_refs: [
      { label: "AAPD behaviour guidance reference", satisfied: true },
      { label: "Dr Okonjo interview availability confirmed", satisfied: true },
    ] as unknown as Json,
    proof_required: [
      { label: "AAPD behaviour guidance reference" },
      { label: "Dr Okonjo interview availability confirmed" },
    ] as unknown as Json,
  }),
  angle({
    id: "a2000000-0000-4000-8000-000000000007",
    site_id: NORTHBEAM.siteId,
    angle_key: "first-birthday-rule-ignored",
    endowment: "expertise",
    angle_type: "expertise",
    headline:
      "The 'first dental visit by the first birthday' rule that almost no parent follows",
    summary:
      "Every major paediatric body recommends it; local first-visit age averages 3.4 years. What the missing two years costs, in plain terms.",
    why_now: null,
    target_beat: "parenting / local health",
    target_outlet_kind: "local",
    priority: 60,
    newsworthiness: 62,
    timeliness: 40,
    evidence_quality: 90,
    confidence: 88,
    recommended_action: "pitch_now",
    status: "landed",
    accepted_at: days(-48),
    pitched_at: days(-40),
    landed_at: days(-27),
    human_reviewed_at: days(-48),
    evidence_refs: [
      { label: "AAPD policy statement", satisfied: true },
      { label: "Practice first-visit age distribution", satisfied: true },
    ] as unknown as Json,
    proof_required: [
      { label: "AAPD policy statement" },
      { label: "Practice first-visit age distribution" },
    ] as unknown as Json,
  }),
  angle({
    id: "a3000000-0000-4000-8000-000000000008",
    site_id: CORDWELL.siteId,
    angle_key: "parking-structures-past-design-life",
    endowment: "expertise",
    angle_type: "local_impact",
    headline:
      "Every parking structure built in this state between 1978 and 1994 is now past its design life",
    summary:
      "Post-tensioned decks of that era were designed to a 40-year service life under de-icing exposure assumptions that no longer hold. Our engineers have inspected 61 of them; the failure mode is not dramatic collapse, it is a slow tendon corrosion nobody inspects for because the visual surface looks fine.",
    why_now:
      "The state's inspection mandate proposal goes to committee in three weeks.",
    target_beat: "infrastructure / local government",
    target_outlet_kind: "regional",
    priority: 90,
    newsworthiness: 88,
    timeliness: 86,
    evidence_quality: 79,
    confidence: 83,
    recommended_action: "pitch_now",
    action_reason:
      "Provable, timely, and there is a hearing to hang it on. Pitch before the committee date, not after.",
    status: "pitched",
    accepted_at: days(-8),
    pitched_at: days(-3),
    human_reviewed_at: days(-8),
    expires_at: days(21),
    evidence_refs: [
      { label: "61 structural inspection reports, 2019–2026", satisfied: true },
      { label: "Original design-life specifications, PTI 1978 guidance", satisfied: true },
      { label: "Principal engineer PE licence and availability", satisfied: true },
    ] as unknown as Json,
    proof_required: [
      { label: "61 structural inspection reports, 2019–2026" },
      { label: "Original design-life specifications, PTI 1978 guidance" },
      { label: "Principal engineer PE licence and availability" },
      {
        label: "Owner consent to name any specific structure",
        detail: "Not obtained — the pitch is written to work without naming one.",
        owner: "Client relations",
      },
    ] as unknown as Json,
    missing_evidence: [
      {
        label: "Owner consent to name any specific structure",
        detail: "Not obtained — the pitch is written to work without naming one.",
        owner: "Client relations",
      },
    ] as unknown as Json,
  }),
  angle({
    id: "a3000000-0000-4000-8000-000000000009",
    site_id: CORDWELL.siteId,
    angle_key: "fourteen-projects-turned-down",
    endowment: "process",
    angle_type: "contrarian",
    headline:
      "We turned down fourteen projects last year for the same structural reason",
    summary:
      "Developers keep asking for a lateral system that works on paper and fails the moment the architect's atrium is added back. Naming the pattern publicly is uncomfortable and useful.",
    why_now: null,
    target_beat: "architecture / construction",
    target_outlet_kind: "trade",
    priority: 55,
    newsworthiness: 61,
    timeliness: 30,
    evidence_quality: 41,
    confidence: 63,
    recommended_action: "develop_evidence",
    action_reason:
      "The claim is about clients. Nothing goes out until the anonymisation is airtight.",
    status: "developing",
    accepted_at: days(-14),
    human_reviewed_at: days(-14),
    requires_human_review: true,
    evidence_refs: [
      { label: "Declined-engagement log, 2025", satisfied: true },
    ] as unknown as Json,
    proof_required: [
      { label: "Declined-engagement log, 2025" },
      {
        label: "Anonymisation review so no developer is identifiable",
        owner: "Principal",
      },
    ] as unknown as Json,
    missing_evidence: [
      {
        label: "Anonymisation review so no developer is identifiable",
        owner: "Principal",
      },
    ] as unknown as Json,
    contradictions: [
      {
        label: "Two of the fourteen later became public case studies on your site",
        detail: "They are identifiable. Either remove them from the set or the claim.",
      },
    ] as unknown as Json,
  }),
  angle({
    id: "a3000000-0000-4000-8000-000000000010",
    site_id: CORDWELL.siteId,
    angle_key: "founder-marathon",
    endowment: "people",
    angle_type: "people",
    headline: "Our founder completed his fourth marathon this spring",
    summary:
      "A personal milestone with no connection to structural engineering, no data behind it, and no beat that would run it.",
    why_now: null,
    priority: 8,
    newsworthiness: 6,
    timeliness: 12,
    evidence_quality: 30,
    confidence: 94,
    recommended_action: "park",
    action_reason:
      "Not newsworthy to any outlet that covers this business. Kept visible so it is not proposed again.",
    status: "dismissed",
    dismissed_at: days(-4),
    human_reviewed_at: days(-4),
    human_ruling: {
      ruling: "dismissed",
      by: "Operator",
      note: "Nice, not news.",
    } as unknown as Json,
    evidence_refs: [{ label: "Race result page", satisfied: true }] as unknown as Json,
  }),
];

/* ── source request factory ────────────────────────────────────────────── */

type RequestSeed = Partial<SourceRequestRow> &
  Pick<SourceRequestRow, "id" | "platform" | "query_title">;

function request(seed: RequestSeed): SourceRequestRow {
  return {
    beat: null,
    created_at: hours(-4),
    created_by: null,
    deadline_at: null,
    deleted_at: null,
    draft_generated_at: null,
    draft_response: null,
    external_id: null,
    external_url: null,
    journalist_name: null,
    match_reason: null,
    match_score: 50,
    metadata: {},
    organization_id: ORG,
    outlet: null,
    party_id: null,
    query_body: null,
    requirements: [],
    site_id: null,
    status: "new",
    story_angle_id: null,
    submitted_at: null,
    updated_at: hours(-4),
    updated_by: null,
    version: 1,
    won_at: null,
    ...seed,
  };
}

const REQUESTS: SourceRequestRow[] = [
  request({
    id: "b1000000-0000-4000-8000-000000000001",
    site_id: ALL_GREEN.siteId,
    platform: "qwoted",
    external_id: "QW-884213",
    external_url: "https://app.qwoted.com/source_requests/884213",
    outlet: "The Wall Street Journal",
    journalist_name: "Marcus Reyes",
    party_id: "dddddddd-1111-4111-8111-dddddddddddd",
    query_title:
      "Need a data-disposal expert on why corporate wipe attestations fail",
    query_body:
      "Writing on enterprise device disposal after two settlements this quarter turned on disposal records. Looking for someone who handles the physical intake and can say — specifically — what goes wrong between an IT department's wipe attestation and what actually arrives. No vendor pitches. Named attribution, title and company will run.",
    beat: "enterprise technology",
    deadline_at: hours(2.2),
    match_score: 93,
    match_reason:
      "Directly matches the accepted 'certificate of destruction' angle: you hold the intake data AND an interviewable operations director.",
    story_angle_id: "a1000000-0000-4000-8000-000000000002",
    status: "drafted",
    draft_generated_at: hours(-1),
    draft_response:
      "The failure point is almost never policy — it is the drive that no longer answers. When an in-house wipe runs against a disk with a failed controller, the tool reports success and writes nothing. We see it at intake: of 4,218 enterprise machines received in the last two quarters, 31.4% still held recoverable data, and 89% of those had SMART pre-fail flags set.\n\nThe practical fix is not a better wipe tool. It is verification at a different physical location than the one that performed the wipe, with a serial-level manifest that survives a discovery request. Happy to walk through what a defensible chain of custody looks like, on the record.\n\n— Operations Director, All Green Electronics Recycling (NAID AAA certified)",
    requirements: [
      { label: "Named attribution — title and company will run" },
      { label: "No vendor pitches or product mentions" },
      { label: "Response under 250 words" },
    ] as unknown as Json,
  }),
  request({
    id: "b1000000-0000-4000-8000-000000000002",
    site_id: ALL_GREEN.siteId,
    platform: "haro",
    external_id: "HARO-2026-08-18-tech-04",
    external_url: "https://www.helpareporter.com/",
    outlet: "TechCrunch",
    journalist_name: "Dana Whitfield",
    party_id: "dddddddd-2222-4222-8222-dddddddddddd",
    query_title: "Sources on what actually happens to a returned corporate laptop",
    query_body:
      "Piece on the second life of enterprise hardware. Want to hear from people at the physical end of the chain — refurbishers, recyclers, ITAD. Especially interested in anything counter-intuitive about resale value vs destruction.",
    beat: "enterprise IT",
    deadline_at: hours(5.5),
    match_score: 88,
    match_reason:
      "You are literally at the physical end of this chain and have the mass-balance data the reporter is asking for.",
    story_angle_id: "a1000000-0000-4000-8000-000000000004",
    status: "matched",
    requirements: [
      { label: "Must be at the physical processing end of the chain" },
      { label: "Counter-intuitive angle preferred" },
    ] as unknown as Json,
  }),
  request({
    id: "b2000000-0000-4000-8000-000000000003",
    site_id: NORTHBEAM.siteId,
    platform: "featured",
    external_id: "FE-33122",
    external_url: "https://featured.com/questions/33122",
    outlet: "Parents",
    journalist_name: "Ilana Cross",
    party_id: null,
    query_title:
      "Paediatric dentists: what should parents ask at a first dental visit?",
    query_body:
      "Round-up piece for back-to-school. Looking for practising paediatric dentists. Short, practical answers — three questions a parent should ask and why.",
    beat: "parenting / health",
    deadline_at: hours(31),
    match_score: 84,
    match_reason:
      "Dr Okonjo is a practising paediatric dentist and the 'first birthday' angle already landed once — the material exists.",
    story_angle_id: "a2000000-0000-4000-8000-000000000007",
    status: "new",
    requirements: [
      { label: "Must be a practising paediatric dentist" },
      { label: "Three questions, one sentence of reasoning each" },
      { label: "Headshot required" },
    ] as unknown as Json,
  }),
  request({
    id: "b3000000-0000-4000-8000-000000000004",
    site_id: CORDWELL.siteId,
    platform: "sourcebottle",
    external_id: "SB-71904",
    external_url: "https://www.sourcebottle.com/",
    outlet: "Construction Dive",
    journalist_name: "Ben Okafor",
    party_id: null,
    query_title: "Structural engineers on ageing parking infrastructure",
    query_body:
      "Following the state inspection mandate proposal. Want engineers who have actually inspected these structures, not association spokespeople.",
    beat: "construction / infrastructure",
    deadline_at: hours(70),
    match_score: 71,
    match_reason:
      "61 inspections on file and an already-pitched angle on exactly this. Lower score only because this outlet has never run you.",
    story_angle_id: "a3000000-0000-4000-8000-000000000008",
    status: "new",
    requirements: [
      { label: "Must have performed inspections personally" },
      { label: "PE licence number for verification" },
    ] as unknown as Json,
  }),
  request({
    id: "b1000000-0000-4000-8000-000000000005",
    site_id: ALL_GREEN.siteId,
    platform: "qwoted",
    external_id: "QW-871003",
    external_url: "https://app.qwoted.com/source_requests/871003",
    outlet: "Bloomberg",
    journalist_name: "Priya Anand",
    party_id: "dddddddd-3333-4333-8333-dddddddddddd",
    query_title: "The economics of the e-waste battery problem",
    beat: "commodities / sustainability",
    query_body:
      "Looking at where battery-embedded devices actually go and who pays. Need someone who handles the volume.",
    deadline_at: hours(14),
    match_score: 90,
    match_reason: "SB 1215 angle already landed coverage on this exact subject.",
    story_angle_id: "a1000000-0000-4000-8000-000000000003",
    status: "submitted",
    submitted_at: hours(-20),
    draft_generated_at: hours(-26),
    draft_response:
      "Battery-embedded devices broke the economics because the recovery value never covered the handling cost, and SB 1215 removed the landfill escape valve on January 1. What changed this year is not the chemistry — it is that the cheap disposal option became illegal, and the facilities managers who were quietly using it have 41 days left of grace period.",
    requirements: [
      { label: "Must handle meaningful volume" },
    ] as unknown as Json,
  }),
  request({
    id: "b3000000-0000-4000-8000-000000000006",
    site_id: CORDWELL.siteId,
    platform: "journorequest",
    external_url: "https://x.com/search?q=%23journorequest",
    outlet: "The Verge",
    journalist_name: "Unnamed (via #journorequest)",
    party_id: null,
    query_title: "Anyone with smart-building sensor failure stories?",
    query_body:
      "Short turnaround. Looking for engineers with first-hand smart-building sensor failure experience.",
    beat: "technology",
    deadline_at: hours(-6),
    match_score: 44,
    match_reason:
      "Weak match — you inspect structures, not building automation. Window closed before anyone looked at it.",
    status: "new",
  }),
];

/* ── coverage ──────────────────────────────────────────────────────────── */

type CoverageSeed = Partial<CoverageMentionRow> &
  Pick<
    CoverageMentionRow,
    "id" | "site_id" | "brand_key" | "url" | "normalized_url" | "domain"
  >;

function coverage(seed: CoverageSeed): CoverageMentionRow {
  return {
    alerted_at: null,
    analysis: {},
    analyzed_at: days(-1),
    author_name: null,
    author_party_id: null,
    capture_status: "captured",
    captured_at: days(-1),
    competitor_key: null,
    created_at: days(-1),
    created_by: null,
    dedupe_key: seed.normalized_url,
    discovered_at: days(-1),
    external_id: null,
    hit_reason: null,
    hit_score: null,
    is_competitor: false,
    key_quote: null,
    language: "en",
    link_urls: [],
    links_to_site: false,
    matched_terms: [],
    medium: "news",
    metadata: {},
    organization_id: ORG,
    outcome_event_id: null,
    prominence: null,
    prominence_score: null,
    published_at: null,
    sentiment: null,
    sentiment_score: null,
    source: "news_search",
    source_capture: {},
    title: null,
    topics: [],
    tracker_id: "eeeeeeee-1111-4111-8111-eeeeeeeeeeee",
    updated_at: days(-1),
    updated_by: null,
    version: 1,
    ...seed,
  };
}

const COVERAGE: CoverageMentionRow[] = [
  coverage({
    id: "c1000000-0000-4000-8000-000000000001",
    site_id: ALL_GREEN.siteId,
    brand_key: ALL_GREEN.brandKey,
    url: "https://resource-recycling.com/e-scrap/2026/08/09/battery-rules-catch-facilities-off-guard/",
    normalized_url:
      "resource-recycling.com/e-scrap/2026/08/09/battery-rules-catch-facilities-off-guard",
    domain: "resource-recycling.com",
    title: "Battery rules catch facilities managers off guard",
    author_name: "Colin Staub",
    author_party_id: "dddddddd-4444-4444-8444-dddddddddddd",
    published_at: days(-9),
    prominence: "feature",
    prominence_score: 88,
    sentiment: "positive",
    sentiment_score: 72,
    links_to_site: true,
    link_urls: ["https://allgreenrecycling.com/services/battery-recycling"],
    matched_terms: ["All Green Electronics Recycling", "SB 1215"],
    hit_score: 91,
    hit_reason: "Named source, quoted twice, dofollow link to a service page.",
    key_quote:
      "The cheap disposal option became illegal on January 1, and a lot of people are still using it.",
    medium: "trade",
    topics: ["policy", "e-waste", "batteries"] as unknown as Json,
    metadata: {
      story_angle_id: "a1000000-0000-4000-8000-000000000003",
      tie_source: "operator",
    } as unknown as Json,
  }),
  coverage({
    id: "c2000000-0000-4000-8000-000000000002",
    site_id: NORTHBEAM.siteId,
    brand_key: NORTHBEAM.brandKey,
    url: "https://www.krvn-local.com/health/first-dental-visit-age-gap",
    normalized_url: "krvn-local.com/health/first-dental-visit-age-gap",
    domain: "krvn-local.com",
    title: "Most local kids see a dentist two years later than they should",
    author_name: "Renata Fields",
    author_party_id: null,
    published_at: days(-27),
    prominence: "feature",
    prominence_score: 74,
    sentiment: "positive",
    sentiment_score: 65,
    links_to_site: false,
    matched_terms: ["Northbeam Pediatric Dental", "Dr Amara Okonjo"],
    hit_score: 68,
    hit_reason: "Feature interview, no link.",
    key_quote:
      "The two missing years are where the preventable damage happens.",
    medium: "broadcast",
    topics: ["health", "parenting"] as unknown as Json,
    metadata: {
      story_angle_id: "a2000000-0000-4000-8000-000000000007",
      tie_source: "analyzer",
    } as unknown as Json,
  }),
  coverage({
    id: "c3000000-0000-4000-8000-000000000003",
    site_id: CORDWELL.siteId,
    brand_key: CORDWELL.brandKey,
    url: "https://www.enr.com/articles/parking-deck-inspection-mandate-debate",
    normalized_url: "enr.com/articles/parking-deck-inspection-mandate-debate",
    domain: "enr.com",
    title: "States weigh parking deck inspection mandates",
    author_name: "Hollis Mangan",
    author_party_id: null,
    published_at: days(-2),
    prominence: "mention",
    prominence_score: 41,
    sentiment: "neutral",
    sentiment_score: 8,
    links_to_site: false,
    matched_terms: ["Cordwell Structural"],
    hit_score: 52,
    hit_reason: "Single-sentence mention, no quote, no link.",
    medium: "trade",
    topics: ["infrastructure", "policy"] as unknown as Json,
    metadata: {} as unknown as Json,
  }),
  coverage({
    id: "c1000000-0000-4000-8000-000000000004",
    site_id: ALL_GREEN.siteId,
    brand_key: ALL_GREEN.brandKey,
    url: "https://podcasts.example.com/circular/ep-212",
    normalized_url: "podcasts.example.com/circular/ep-212",
    domain: "podcasts.example.com",
    title: "The Circular Economy Show — Ep. 212: What a wipe attestation is worth",
    author_name: "Sam Iyer",
    author_party_id: null,
    published_at: days(-16),
    prominence: "interview",
    prominence_score: 79,
    sentiment: "positive",
    sentiment_score: 61,
    medium: "podcast",
    matched_terms: ["All Green Electronics Recycling"],
    hit_score: 77,
    hit_reason: "38-minute interview with the operations director.",
    topics: ["data security", "e-waste"] as unknown as Json,
    metadata: {
      story_angle_id: "a1000000-0000-4000-8000-000000000002",
      tie_source: "operator",
    } as unknown as Json,
  }),
];

export const PRESS_DESK_FIXTURE: DeskData = {
  angles: ANGLES,
  requests: REQUESTS,
  coverage: COVERAGE,
  sites: PRESS_SITES,
  lastAnalyzedAt: hours(-9),
};

/** Same shape, zero rows — the empty desk is a real state, not a blank page. */
export const PRESS_DESK_EMPTY: DeskData = {
  angles: [],
  requests: [],
  coverage: [],
  sites: PRESS_SITES,
  lastAnalyzedAt: null,
};
