/**
 * The ONE fixture file for the Press Room.
 *
 * `seo.story_angle` and `seo.source_request` have no seeded rows yet, so this
 * file stands in for a real analysis run of ONE believable business — All Green
 * Electronics Recycling, a nationwide R2v3 + NAID AAA certified IT asset
 * disposition company. Every object is typed as the GENERATED DB row, so:
 *
 *   • a real Supabase row and a fixture row are the same type,
 *   • a schema change breaks this file instead of the page, and
 *   • deleting this file is the only change needed to go live.
 *
 * The workspace treats fixture data as SAMPLE and says so, loudly, in the UI —
 * it is never presented as the user's own press room.
 *
 * Deadlines are generated relative to `now` on purpose: a demo whose urgency
 * expired last Tuesday teaches the reader nothing about the urgency design.
 */

import type {
  CoverageMention,
  SourceRequest,
  StoryAngle,
} from "@/features/marketing/pr/refine/types";

const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const SAMPLE_SITE = "00000000-0000-4000-8000-0000000005e0";

/** Deterministic uuid-shaped ids so React keys and doors stay stable. */
function sampleId(seed: number): string {
  const hex = seed.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

interface AngleSeed {
  key: string;
  endowment: string;
  angleType: string;
  headline: string;
  summary: string;
  whyNow: string | null;
  beat: string;
  outletKind: string | null;
  status: string;
  action: string;
  actionReason: string;
  scores: [number, number, number, number, number];
  proof: ReadonlyArray<[string, string, string]>;
  missing: ReadonlyArray<[string, string, string]>;
  facts: readonly string[];
  requiresReview?: boolean;
}

const ANGLE_SEEDS: readonly AngleSeed[] = [
  {
    key: "warranty-laptop-waste-q3",
    endowment: "data",
    angleType: "data_story",
    headline:
      "US companies scrapped 41,000 laptops still under manufacturer warranty last quarter",
    summary:
      "Every device that comes through our intake is serial-scanned against the manufacturer warranty database before it is wiped. Last quarter 41,382 of the machines corporate clients sent us for destruction were still covered — an asset write-off of roughly $18.6M that the finance teams involved never saw as a line item.",
    whyNow:
      "Q3 corporate refresh cycles just closed and CFOs are signing off on FY asset write-downs this month.",
    beat: "Enterprise IT / CFO",
    outletKind: "trade",
    status: "accepted",
    action: "pitch_now",
    actionReason:
      "The warranty match is machine-generated from your own intake scans, so the number is defensible line by line.",
    scores: [94, 88, 91, 86, 82],
    proof: [
      [
        "Serial-to-warranty match export",
        "The intake scan file with warranty status per serial, quarter to date.",
        "Your intake system",
      ],
      [
        "Client anonymisation sign-off",
        "Written confirmation that aggregate figures may be published without naming clients.",
        "Your legal counsel",
      ],
      [
        "Replacement-cost basis",
        "How the $18.6M was valued — list price, depreciated book, or resale.",
        "Your finance lead",
      ],
    ],
    missing: [
      [
        "Replacement-cost basis",
        "A reporter will ask how the dollar figure was reached within the first two questions. Right now we cannot answer it.",
        "Your finance lead",
      ],
    ],
    facts: [
      "41,382 in-warranty devices received Jul–Sep",
      "Warranty status resolved for 96.4% of serials",
      "$18.6M gross replacement value",
    ],
  },
  {
    key: "certificate-of-destruction-audit-gap",
    endowment: "expertise",
    angleType: "contrarian",
    headline:
      "The certificate of destruction most companies file away would not survive a HIPAA audit",
    summary:
      "A certificate of destruction is only as good as the chain of custody behind it. In practice most of the certificates we see reissued from prior vendors list a weight and a date and nothing else — no serials, no witness, no NAID-verified operator. That document is what a health system hands an auditor.",
    whyNow:
      "OCR enforcement actions on improper media disposal are up sharply this year and hospital compliance teams are re-papering vendor files.",
    beat: "Healthcare compliance",
    outletKind: "trade",
    status: "developing",
    action: "needs_expert_input",
    actionReason:
      "The claim is strong but it rests on your judgment as a NAID AAA operator, and we have not captured that judgment in your words yet.",
    scores: [88, 74, 79, 91, 46],
    proof: [
      [
        "Named standard the certificate fails",
        "The specific NAID AAA or HIPAA §164.310(d)(2)(i) requirement an incomplete certificate misses.",
        "You",
      ],
      [
        "Redacted example certificates",
        "Two or three prior-vendor certificates with client identifiers removed.",
        "Your compliance file",
      ],
      [
        "Frequency claim",
        "How many of the certificates you have reviewed were incomplete, out of how many.",
        "Your audit log",
      ],
      [
        "Your on-record quote",
        "One or two sentences a reporter can print with your name and NAID credential attached.",
        "You",
      ],
    ],
    missing: [
      [
        "Named standard the certificate fails",
        "Without the exact clause this reads as a vendor attacking competitors instead of an expert citing a rule.",
        "You",
      ],
      [
        "Frequency claim",
        "\"Most\" needs a number behind it or the desk will cut it.",
        "Your audit log",
      ],
      [
        "Your on-record quote",
        "A compliance reporter will not run this without an attributable expert.",
        "You",
      ],
    ],
    facts: [
      "NAID AAA certified since 2019",
      "1,240 prior-vendor certificates reviewed during onboarding",
    ],
    requiresReview: true,
  },
  {
    key: "residual-data-on-intake-drives",
    endowment: "place",
    angleType: "local_impact",
    headline:
      "Inside the Phoenix warehouse where one in forty donated hard drives still holds someone's records",
    summary:
      "A reporter can stand on the intake line, watch a drive come out of a donation bin, and watch it fail verification. It is a physically legible story about an abstract risk, in a building fifteen minutes from downtown Phoenix.",
    whyNow:
      "Arizona's e-waste collection season runs through November and the city is promoting drop-off events.",
    beat: "Local news / consumer",
    outletKind: "local",
    status: "accepted",
    action: "pitch_now",
    actionReason:
      "This is a site visit, not a claim — the newsroom does the verifying, which is the easiest yes a local desk ever gives.",
    scores: [86, 92, 84, 78, 88],
    proof: [
      [
        "Media access approval",
        "Confirmation that a camera crew can be on the intake floor.",
        "Your operations manager",
      ],
      [
        "Residual-data rate",
        "The share of intake drives that fail pre-wipe verification, with the period it covers.",
        "Your intake system",
      ],
      [
        "Safety and PPE briefing",
        "What a visiting crew has to wear and sign.",
        "Your EHS lead",
      ],
    ],
    missing: [],
    facts: [
      "2.4% of donated drives fail pre-wipe verification",
      "Phoenix facility processes 180,000 lbs/month",
    ],
  },
  {
    key: "gpu-refresh-second-life",
    endowment: "demand",
    angleType: "trend_commentary",
    headline:
      "The AI datacenter refresh is about to dump a decade of GPUs onto the secondary market",
    summary:
      "Intake requests for rack-scale GPU decommissioning have tripled year over year. What happens to that hardware — resold, harvested, or shredded — is a question no one in the AI infrastructure conversation is asking yet.",
    whyNow:
      "Three hyperscalers disclosed accelerated depreciation schedules on last week's earnings calls.",
    beat: "AI infrastructure",
    outletKind: "national",
    status: "proposed",
    action: "hold_for_timing",
    actionReason:
      "Strong angle, but the earnings cycle already peaked this week — the next window is the January calls.",
    scores: [72, 81, 41, 69, 64],
    proof: [
      [
        "Intake volume trend",
        "GPU decommissioning tonnage or unit count, year over year.",
        "Your intake system",
      ],
      [
        "Resale-vs-shred split",
        "What share of received accelerators are resold rather than destroyed.",
        "Your operations data",
      ],
    ],
    missing: [
      [
        "Resale-vs-shred split",
        "The whole point of the piece is what happens next to the hardware.",
        "Your operations data",
      ],
    ],
    facts: ["GPU decommissioning requests up 214% YoY"],
  },
  {
    key: "hundred-million-pounds",
    endowment: "capital",
    angleType: "milestone",
    headline:
      "All Green passes 100 million pounds of electronics kept out of landfill",
    summary:
      "A round-number milestone with a fifteen-year operating history behind it, and a per-state breakdown that gives every regional desk a local number to lead with.",
    whyNow: "The threshold will be crossed in the next four to six weeks.",
    beat: "Business / sustainability",
    outletKind: "regional",
    status: "developing",
    action: "develop_evidence",
    actionReason:
      "Milestones only run when the number is auditable. Two of the three supporting figures are not sourced yet.",
    scores: [64, 58, 66, 72, 38],
    proof: [
      [
        "Cumulative tonnage ledger",
        "The all-time weight total, with the method used to accumulate it.",
        "Your reporting system",
      ],
      [
        "Per-state breakdown",
        "Tonnage by state so regional desks get a local figure.",
        "Your reporting system",
      ],
      [
        "Third-party verification",
        "An R2v3 auditor or state agency figure that corroborates the total.",
        "Your certifying body",
      ],
    ],
    missing: [
      [
        "Per-state breakdown",
        "Without it this is one national story instead of eleven regional ones.",
        "Your reporting system",
      ],
      [
        "Third-party verification",
        "A self-reported round number is a press release, not a story.",
        "Your certifying body",
      ],
    ],
    facts: ["98.1M lbs processed to date", "Operating since 2008"],
  },
  {
    key: "shredding-is-the-wrong-answer",
    endowment: "process",
    angleType: "expertise",
    headline:
      "Shredding every drive is the expensive, high-carbon answer — and usually the wrong one",
    summary:
      "Verified erasure returns a drive to service; shredding turns a $180 asset into scrap steel and a carbon line item. Most corporate destruction policies were written before verified erasure was auditable, and nobody has revisited them.",
    whyNow: null,
    beat: "Sustainability / procurement",
    outletKind: "trade",
    status: "proposed",
    action: "develop_evidence",
    actionReason:
      "The argument is good and entirely unproven in our data today.",
    scores: [58, 61, 22, 64, 24],
    proof: [
      [
        "Carbon comparison",
        "kg CO2e for shredding versus verified erasure per drive.",
        "Your sustainability data",
      ],
      [
        "Recovered value per drive",
        "Average resale value of an erased and re-certified drive.",
        "Your resale data",
      ],
      [
        "Erasure verification standard",
        "The standard your erasure is verified against, and by whom.",
        "You",
      ],
    ],
    missing: [
      [
        "Carbon comparison",
        "This is the entire claim and we have no figure for it.",
        "Your sustainability data",
      ],
      [
        "Recovered value per drive",
        "Needed to make the procurement case land.",
        "Your resale data",
      ],
    ],
    facts: [],
  },
  {
    key: "state-mail-back-programs",
    endowment: "people",
    angleType: "customer_impact",
    headline:
      "What happens when a school district has to erase 9,000 student Chromebooks in one summer",
    summary:
      "A district IT director walks through a compressed summer decommissioning: the FERPA exposure, the six-week window, and what the process cost against what a shred-everything policy would have.",
    whyNow: "Districts plan next summer's refresh during Q1 budgeting.",
    beat: "Education technology",
    outletKind: "trade",
    status: "dismissed",
    action: "park",
    actionReason:
      "The district declined to be named, and the story does not work anonymously.",
    scores: [30, 44, 28, 52, 40],
    proof: [
      [
        "Named district participant",
        "An IT director willing to be quoted on the record.",
        "Your account team",
      ],
    ],
    missing: [
      [
        "Named district participant",
        "The district declined. Reopen if another one will go on record.",
        "Your account team",
      ],
    ],
    facts: [],
  },
];

function jsonProof(entries: ReadonlyArray<[string, string, string]>) {
  return entries.map(([label, detail, owner]) => ({ label, detail, owner }));
}

function buildAngles(now: number): StoryAngle[] {
  return ANGLE_SEEDS.map((seed, index) => {
    const [priority, newsworthiness, timeliness, confidence, evidenceQuality] =
      seed.scores;
    const analyzedAt = iso(now - (index + 1) * 6 * HOUR);
    return {
      id: sampleId(100 + index),
      organization_id: ORG,
      created_by: null,
      updated_by: null,
      site_id: SAMPLE_SITE,
      angle_key: seed.key,
      endowment: seed.endowment,
      angle_type: seed.angleType,
      headline: seed.headline,
      summary: seed.summary,
      why_now: seed.whyNow,
      target_beat: seed.beat,
      target_outlet_kind: seed.outletKind,
      priority,
      confidence,
      newsworthiness,
      timeliness,
      evidence_quality: evidenceQuality,
      recommended_action: seed.action,
      action_reason: seed.actionReason,
      facts: seed.facts.map((statement) => ({ statement })),
      inferences: [],
      evidence_refs: [{ source: "intake_system", scope: "sample dataset" }],
      proof_required: jsonProof(seed.proof),
      missing_evidence: jsonProof(seed.missing),
      contradictions: [],
      analysis: {},
      human_ruling: {},
      evidence_fingerprint: null,
      analysis_version: "sample",
      requires_human_review: seed.requiresReview ?? false,
      status: seed.status,
      analyzed_at: analyzedAt,
      human_reviewed_at: null,
      accepted_at:
        seed.status === "accepted" || seed.status === "developing"
          ? iso(now - (index + 1) * 4 * HOUR)
          : null,
      pitched_at: null,
      landed_at: null,
      dismissed_at: seed.status === "dismissed" ? iso(now - 3 * DAY) : null,
      expires_at: null,
      created_at: analyzedAt,
      updated_at: analyzedAt,
      deleted_at: null,
      version: 1,
      metadata: {},
    };
  });
}

interface RequestSeed {
  platform: string;
  outlet: string;
  journalist: string;
  /** A real `crm.party` would carry this — sample rows have no party yet. */
  partyId: string | null;
  title: string;
  body: string;
  beat: string;
  matchScore: number;
  matchReason: string;
  hoursOut: number;
  status: string;
  draft: string | null;
  angleIndex: number | null;
  requirements: readonly string[];
}

const REQUEST_SEEDS: readonly RequestSeed[] = [
  {
    platform: "haro",
    outlet: "CIO Dive",
    journalist: "Marisa Elkin",
    partyId: null,
    title: "Need ITAD expert on what happens to in-warranty gear at refresh",
    body: "Writing about asset write-offs at the Q3 refresh. Looking for someone who actually sees what companies throw away — hard numbers preferred over opinion. Two or three sentences, attributable, plus any data you can share.",
    beat: "Enterprise IT",
    matchScore: 96,
    matchReason:
      "Your warranty-match dataset answers the exact question asked, and the reporter explicitly wants numbers over opinion.",
    hoursOut: 4.5,
    status: "drafted",
    draft:
      "We serial-scan every device against the manufacturer warranty database before it is wiped. Last quarter 41,382 of the machines corporate clients sent us for destruction were still under warranty — roughly $18.6M of gross replacement value written off without appearing as a line item anywhere in the refresh budget. The pattern is consistent: refresh cycles are scheduled by fleet age, not by device condition.",
    angleIndex: 0,
    requirements: [
      "Two to three sentences, attributable",
      "Include title and company",
      "Data welcome",
    ],
  },
  {
    platform: "qwoted",
    outlet: "Modern Healthcare",
    journalist: "Dev Raghunathan",
    partyId: null,
    title: "Sources: media disposal failures behind recent OCR enforcement",
    body: "Looking for compliance-side voices on what a defensible chain of custody looks like for retired media. Prefer NAID or R2 certified operators.",
    beat: "Healthcare compliance",
    matchScore: 91,
    matchReason:
      "You are NAID AAA certified and the query names that credential as a preference.",
    hoursOut: 19,
    status: "matched",
    draft: null,
    angleIndex: 1,
    requirements: ["NAID or R2 certified", "On the record", "By Thursday 5pm ET"],
  },
  {
    platform: "featured",
    outlet: "Phoenix Business Journal",
    journalist: "Tasha Boone",
    partyId: null,
    title: "Local angle wanted: where does Phoenix e-waste actually go?",
    body: "Doing a visual piece for the November collection season. Open to a facility visit.",
    beat: "Local business",
    matchScore: 84,
    matchReason:
      "Your Phoenix intake facility matches the geography and the piece is explicitly open to a site visit.",
    hoursOut: 61,
    status: "new",
    draft: null,
    angleIndex: 2,
    requirements: ["Phoenix metro", "Facility access preferred"],
  },
  {
    platform: "sourcebottle",
    outlet: "The Register",
    journalist: "Ollie Marchetti",
    partyId: null,
    title: "What happens to decommissioned AI accelerators?",
    body: "Chasing the secondary market for datacenter GPUs. Want someone who handles the physical hardware, not an analyst.",
    beat: "AI infrastructure",
    matchScore: 77,
    matchReason:
      "You physically process decommissioned accelerators, which is what the query asks for — but the resale-versus-shred figure it needs is not in hand.",
    hoursOut: 96,
    status: "new",
    draft: null,
    angleIndex: 3,
    requirements: ["Hands-on operator", "UK/US either"],
  },
  {
    platform: "haro",
    outlet: "Waste Dive",
    journalist: "Grace Oyelaran",
    partyId: null,
    title: "Comment: state e-waste bill amendments",
    body: "Short reaction quotes on the proposed amendments.",
    beat: "Waste & recycling policy",
    matchScore: 58,
    matchReason:
      "Adjacent to your beat, but the query wants policy commentary and your strongest material is operational.",
    hoursOut: -7,
    status: "expired",
    draft: null,
    angleIndex: null,
    requirements: ["One paragraph"],
  },
];

function buildRequests(now: number, angles: readonly StoryAngle[]): SourceRequest[] {
  return REQUEST_SEEDS.map((seed, index) => ({
    id: sampleId(200 + index),
    organization_id: ORG,
    created_by: null,
    updated_by: null,
    site_id: SAMPLE_SITE,
    platform: seed.platform,
    external_id: `${seed.platform}-sample-${index + 1}`,
    external_url: `https://example.com/${seed.platform}/sample-${index + 1}`,
    outlet: seed.outlet,
    journalist_name: seed.journalist,
    party_id: seed.partyId,
    query_title: seed.title,
    query_body: seed.body,
    beat: seed.beat,
    requirements: seed.requirements.map((text) => ({ label: text })),
    deadline_at: iso(now + seed.hoursOut * HOUR),
    match_score: seed.matchScore,
    match_reason: seed.matchReason,
    story_angle_id:
      seed.angleIndex === null ? null : (angles[seed.angleIndex]?.id ?? null),
    draft_response: seed.draft,
    draft_generated_at: seed.draft ? iso(now - 2 * HOUR) : null,
    status: seed.status,
    submitted_at: null,
    won_at: null,
    created_at: iso(now - 12 * HOUR),
    updated_at: iso(now - 2 * HOUR),
    deleted_at: null,
    version: 1,
    metadata: {},
  }));
}

interface CoverageSeed {
  outlet: string;
  domain: string;
  title: string;
  author: string;
  daysAgo: number;
  quote: string;
  linksToSite: boolean;
  prominence: string;
  prominenceScore: number;
  /** Which angle produced it — see `angleIdFromMention` in data.ts. */
  angleIndex: number;
}

const COVERAGE_SEEDS: readonly CoverageSeed[] = [
  {
    outlet: "CIO Dive",
    domain: "ciodive.com",
    title: "The hidden write-off inside every hardware refresh",
    author: "Marisa Elkin",
    daysAgo: 9,
    quote:
      "Refresh cycles are scheduled by fleet age, not by device condition — so perfectly serviceable hardware gets destroyed on a calendar.",
    linksToSite: true,
    prominence: "feature",
    prominenceScore: 88,
    angleIndex: 0,
  },
  {
    outlet: "Phoenix Business Journal",
    domain: "bizjournals.com",
    title: "Inside the warehouse that sees what Phoenix throws away",
    author: "Tasha Boone",
    daysAgo: 24,
    quote:
      "One in forty drives that arrives here still has readable data on it when it comes off the truck.",
    linksToSite: true,
    prominence: "feature",
    prominenceScore: 81,
    angleIndex: 2,
  },
  {
    outlet: "Waste Dive",
    domain: "wastedive.com",
    title: "R2v3 operators press states on collection standards",
    author: "Grace Oyelaran",
    daysAgo: 41,
    quote: "Certification is the floor, not the ceiling.",
    linksToSite: false,
    prominence: "mention",
    prominenceScore: 34,
    angleIndex: 1,
  },
];

function buildCoverage(now: number, angles: readonly StoryAngle[]): CoverageMention[] {
  return COVERAGE_SEEDS.map((seed, index) => {
    const publishedAt = iso(now - seed.daysAgo * DAY);
    return {
      id: sampleId(300 + index),
      organization_id: ORG,
      created_by: null,
      updated_by: null,
      site_id: SAMPLE_SITE,
      tracker_id: sampleId(399),
      brand_key: "all-green",
      source: "sample",
      url: `https://www.${seed.domain}/sample/${index + 1}`,
      normalized_url: `${seed.domain}/sample/${index + 1}`,
      dedupe_key: `${seed.domain}-sample-${index + 1}`,
      domain: seed.domain,
      title: seed.title,
      medium: "article",
      author_name: seed.author,
      author_party_id: null,
      published_at: publishedAt,
      discovered_at: publishedAt,
      captured_at: publishedAt,
      capture_status: "captured",
      alerted_at: null,
      analyzed_at: publishedAt,
      analysis: {},
      links_to_site: seed.linksToSite,
      link_urls: seed.linksToSite ? ["https://allgreenrecycling.com/"] : [],
      sentiment: "positive",
      sentiment_score: 72,
      prominence: seed.prominence,
      prominence_score: seed.prominenceScore,
      topics: [{ label: "ITAD" }],
      key_quote: seed.quote,
      is_competitor: false,
      competitor_key: null,
      matched_terms: ["All Green"],
      hit_score: seed.prominenceScore,
      hit_reason: "Brand name in body",
      outcome_event_id: null,
      external_id: null,
      language: "en",
      source_capture: {},
      created_at: publishedAt,
      updated_at: publishedAt,
      version: 1,
      // The ONLY tie back to the angle that produced this coverage. There is no
      // FK from coverage_mention to story_angle, so it lives in metadata under
      // a documented key that `data.ts` is the sole reader of.
      metadata: { story_angle_id: angles[seed.angleIndex]?.id ?? null },
    };
  });
}

export interface PressRoomFixture {
  siteId: string;
  brandName: string;
  angles: StoryAngle[];
  requests: SourceRequest[];
  coverage: CoverageMention[];
}

export function buildPressRoomFixture(now: number): PressRoomFixture {
  const angles = buildAngles(now);
  return {
    siteId: SAMPLE_SITE,
    brandName: "All Green Electronics Recycling",
    angles,
    requests: buildRequests(now, angles),
    coverage: buildCoverage(now, angles),
  };
}
