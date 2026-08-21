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
 * THE DISTRIBUTION IS THE POINT (backend fact 1). The producer only emits
 * `pitch_now` for an angle with NO `missing_evidence`, NO `proof_required`, NO
 * `contradictions` and `evidence_quality >= 50`; everything else arrives as
 * `develop_evidence` with `requires_human_review = true`. So this dataset is
 * mostly angles with proof still to gather, with two genuinely pitchable ones —
 * which is what a HEALTHY account looks like, not a backlog of errors. The two
 * human-ruled actions (`hold_for_timing`, `needs_expert_input`) carry a
 * `human_ruling` and a `human_reviewed_at`, because only a person can set them.
 *
 * Deadlines are generated relative to `now` on purpose: a demo whose urgency
 * expired last Tuesday teaches the reader nothing about the urgency design.
 *
 * NOTE on doors: no sample journalist has a `party_id` and no sample coverage
 * has an `author_party_id`, because inventing a `crm.party` UUID would render a
 * door that opens onto a 404. The unresolved-reference treatment (name + a
 * one-click "not in CRM — add") is what shows instead, which is exactly what a
 * real un-enriched row does.
 */

import type { Json } from "@/types/database.types";
import type {
  CoverageMention,
  SourceRequest,
  StoryAngle,
} from "@/features/marketing/pr/types";

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

/** [key, label, kind, note, satisfied?] — an explicit `false` is a declared gap. */
type ProofSeed = readonly [string, string, string, string | null, boolean?];
/** [key, label, how_to_get, owner, effort] */
type GapSeed = readonly [string, string, string, string, string];
/** [key, label, source, url | null] */
type EvidenceSeed = readonly [string, string, string, string | null];

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
  /** [priority, newsworthiness, timeliness, confidence, evidenceQuality] */
  scores: [number, number, number, number, number];
  proof: readonly ProofSeed[];
  missing: readonly GapSeed[];
  evidence: readonly EvidenceSeed[];
  facts: readonly string[];
  contradictions?: readonly (readonly [string, string])[];
  humanRuled?: boolean;
  /** Deliberately unreadable jsonb entries, to exercise the malformed counter. */
  malformedProof?: number;
}

const ANGLE_SEEDS: readonly AngleSeed[] = [
  // ── genuinely pitchable: no proof outstanding, nothing required, no
  //    contradictions, evidence_quality well over 50 ──────────────────────────
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
      "Nothing is outstanding: the warranty match is machine-generated from your own intake scans, the dollar basis is documented, and legal has signed off on publishing aggregates.",
    scores: [94, 91, 88, 86, 92],
    proof: [],
    missing: [],
    evidence: [
      [
        "warranty-export",
        "Serial-to-warranty match export",
        "Intake system · Q3 export",
        "https://example.com/all-green/warranty-q3.csv",
      ],
      [
        "anonymisation-signoff",
        "Client anonymisation sign-off",
        "Legal counsel memo, 14 Oct",
        null,
      ],
      [
        "cost-basis",
        "Replacement-cost basis",
        "Finance — depreciated book value method",
        null,
      ],
    ],
    facts: [
      "41,382 in-warranty devices received Jul–Sep",
      "Warranty status resolved for 96.4% of serials",
      "$18.6M gross replacement value",
    ],
  },
  {
    key: "drive-readable-data-rate",
    endowment: "data",
    angleType: "research",
    headline:
      "One in forty drives arriving for destruction still holds readable customer data",
    summary:
      "Before every wipe we sample-image a fixed share of incoming drives to verify the sender's own erasure claims. Across 12 months and 214,000 drives, 2.4% still carried recoverable data at the point they left the client's building — including seven that carried payroll files.",
    whyNow:
      "State privacy regulators opened three disposal-related investigations this quarter.",
    beat: "Security / privacy",
    outletKind: "national",
    status: "accepted",
    action: "pitch_now",
    actionReason:
      "The sampling protocol, the sample size and the third-party lab attestation are all in hand, so a fact-checker can verify every number in this one.",
    scores: [90, 95, 74, 84, 88],
    proof: [],
    missing: [],
    evidence: [
      [
        "sampling-protocol",
        "Written sampling protocol",
        "Operations SOP v4.2",
        "https://example.com/all-green/sampling-sop.pdf",
      ],
      [
        "lab-attestation",
        "Third-party lab attestation",
        "Independent forensics lab, signed",
        null,
      ],
      ["twelve-month-dataset", "12-month drive dataset", "Intake system export", null],
    ],
    facts: [
      "214,000 drives sampled over 12 months",
      "2.4% carried recoverable data on arrival",
      "Seven drives carried payroll records",
    ],
  },

  // ── the common case: real stories with proof still to gather ──────────────
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
    action: "develop_evidence",
    actionReason:
      "The claim is yours to make and you are certified to make it — what is missing is a defensible sample of the certificates you are describing.",
    scores: [88, 86, 71, 79, 44],
    proof: [
      [
        "certificate-sample",
        "Anonymised sample of prior-vendor certificates",
        "document",
        "The claim rests on what those documents actually omit.",
      ],
      [
        "naid-credential",
        "Your NAID AAA certification record",
        "third_party",
        "Establishes standing to make the criticism.",
      ],
      [
        "ocr-enforcement-cites",
        "Citations for the enforcement trend",
        "third_party",
        null,
      ],
      [
        "counsel-review",
        "Counsel review of the wording",
        "document",
        "Naming a practice as audit-failing is a legal claim.",
      ],
    ],
    missing: [
      [
        "certificate-sample",
        "Anonymised sample of prior-vendor certificates",
        "Pull 20 reissued certificates from the last year and redact the client names. Your intake team already scans them.",
        "team",
        "medium",
      ],
      [
        "counsel-review",
        "Counsel review of the wording",
        "Send the headline and summary to your counsel and ask only whether the wording is defensible.",
        "you",
        "quick",
      ],
    ],
    evidence: [
      [
        "naid-credential",
        "Your NAID AAA certification record",
        "NAID member directory",
        "https://example.com/naid/all-green",
      ],
      [
        "ocr-enforcement-cites",
        "Citations for the enforcement trend",
        "HHS OCR enforcement bulletin",
        "https://example.com/ocr/bulletin",
      ],
    ],
    facts: [
      "Reissued certificates seen from 40+ prior vendors",
      "Certificates listing serials: under 15%",
    ],
    contradictions: [
      [
        "Two of your own 2023 certificates also omit serials",
        "Before this goes out, the reporter will find them. Either explain the change or narrow the claim.",
      ],
    ],
  },
  {
    key: "phoenix-facility-visual",
    endowment: "place",
    angleType: "local_impact",
    headline:
      "What actually happens to the electronics Phoenix throws away — inside the warehouse that sorts them",
    summary:
      "The Phoenix intake floor handles about 1.1M pounds a month across 14 sort lines. It photographs well, it is walkable, and the sorting logic is genuinely counter-intuitive — the newest devices are the ones most likely to be destroyed rather than resold.",
    whyNow:
      "The city's November collection season starts in three weeks and local desks look for the visual piece every year.",
    beat: "Local business",
    outletKind: "local",
    status: "developing",
    action: "develop_evidence",
    actionReason:
      "A visual piece needs access cleared and a named guide before a photo desk will commit a shooter.",
    scores: [76, 68, 88, 72, 38],
    proof: [
      ["site-access", "Cleared facility access for press", "document", null],
      ["named-guide", "A named person to walk the floor", "quote", null],
      ["throughput-figure", "Monthly throughput figure", "metric", null],
      ["safety-briefing", "Visitor safety briefing", "document", null],
    ],
    missing: [
      [
        "site-access",
        "Cleared facility access for press",
        "Your plant manager signs the standard visitor waiver — it exists already for client tours.",
        "team",
        "quick",
      ],
      [
        "named-guide",
        "A named person to walk the floor",
        "Pick the shift lead who does the client tours and ask if they are willing to be quoted.",
        "you",
        "quick",
      ],
      [
        "safety-briefing",
        "Visitor safety briefing",
        "The EHS team has a one-page briefing for contractors; press use needs the same document.",
        "team",
        "quick",
      ],
    ],
    evidence: [
      [
        "throughput-figure",
        "Monthly throughput figure",
        "Plant reporting, September",
        null,
      ],
    ],
    facts: [
      "1.1M pounds a month through Phoenix intake",
      "14 sort lines, 3 shifts",
    ],
  },
  {
    key: "gpu-secondary-market",
    endowment: "demand",
    angleType: "trend_commentary",
    headline:
      "Datacenter GPUs are arriving for destruction while a resale market is still bidding for them",
    summary:
      "Decommissioned accelerators are showing up in destruction lots under blanket security policies written for spinning disks. We are physically handling the hardware a very active secondary market wants, and the policy gap between the two is the story.",
    whyNow:
      "The first large-scale accelerator refresh wave is landing now.",
    beat: "AI infrastructure",
    outletKind: "trade",
    status: "proposed",
    action: "develop_evidence",
    actionReason:
      "The observation is strong but the resale-versus-shred split is the number that makes it a story, and it is not compiled yet.",
    scores: [71, 82, 79, 62, 26],
    proof: [
      ["shred-vs-resale", "Resale-versus-shred split for accelerators", "data", null],
      ["policy-language", "Client policy language that mandates destruction", "document", null],
      ["market-price-ref", "Secondary-market price reference", "third_party", null],
    ],
    missing: [
      [
        "shred-vs-resale",
        "Resale-versus-shred split for accelerators",
        "Filter last year's intake by device class and export the disposition column. Nobody has run that cut yet.",
        "team",
        "medium",
      ],
      [
        "policy-language",
        "Client policy language that mandates destruction",
        "Ask two enterprise clients for permission to quote their disposal policy anonymously.",
        "client",
        "heavy",
      ],
      [
        "market-price-ref",
        "Secondary-market price reference",
        "A broker quote or a public listing average would do — a reporter will not take your word on price.",
        "third_party",
        "medium",
      ],
    ],
    evidence: [],
    facts: ["Accelerator units in destruction lots up sharply year on year"],
    // Two entries the readers cannot understand — a real column does contain
    // these, and the ladder must SAY so rather than quietly dropping them.
    malformedProof: 2,
  },
  {
    key: "right-to-repair-throughput",
    endowment: "process",
    angleType: "expertise",
    headline:
      "Repairability rules changed what we can resell — here is the before and after in our own numbers",
    summary:
      "Since the parts-availability rules took effect, the share of incoming devices we can refurbish rather than shred moved measurably. We are one of the few operators with the same intake mix on both sides of the change.",
    whyNow: null,
    beat: "Policy / consumer tech",
    outletKind: "national",
    status: "proposed",
    action: "develop_evidence",
    actionReason:
      "The before/after cut is defensible only if the intake mix is genuinely comparable, and that has not been checked.",
    scores: [64, 74, 41, 58, 31],
    proof: [
      ["mix-normalisation", "Proof the intake mix is comparable", "data", null],
      ["refurb-rate-series", "Refurbishment-rate time series", "data", null],
    ],
    missing: [
      [
        "mix-normalisation",
        "Proof the intake mix is comparable",
        "Compare device-class shares either side of the rule date. If they moved, the comparison needs weighting.",
        "team",
        "heavy",
      ],
    ],
    evidence: [
      ["refurb-rate-series", "Refurbishment-rate time series", "Operations BI export", null],
    ],
    facts: ["Refurbishment share moved after the rule date"],
  },
  {
    key: "veteran-hiring-sort-floor",
    endowment: "people",
    angleType: "people",
    headline:
      "Two thirds of the sort floor came through a veteran hiring pipeline",
    summary:
      "The Phoenix and Atlanta floors hire almost entirely through a veterans' employment program, and the retention numbers are unlike anything else in the sector.",
    whyNow: "Veterans Day desks start commissioning in six weeks.",
    beat: "Workforce",
    outletKind: "regional",
    status: "developing",
    action: "develop_evidence",
    actionReason:
      "A people story lives or dies on a person willing to be named, and nobody has been asked yet.",
    scores: [58, 66, 63, 70, 35],
    proof: [
      ["employee-consent", "A named employee willing to be interviewed", "quote", null],
      ["retention-figures", "Retention figures versus sector average", "data", null],
      // Recorded as NOT satisfied, and `missing_evidence` never names it — the
      // ladder must still treat it as a gap rather than a silent green tick.
      [
        "program-confirmation",
        "Confirmation from the veterans' program",
        "third_party",
        null,
        false,
      ],
    ],
    missing: [
      [
        "employee-consent",
        "A named employee willing to be interviewed",
        "Ask the two shift leads who already speak on client tours. Consent must be written.",
        "you",
        "quick",
      ],
      [
        "retention-figures",
        "Retention figures versus sector average",
        "HR has the internal number; the sector comparison needs an industry association figure.",
        "team",
        "medium",
      ],
    ],
    // A proof marked satisfied with NO artefact behind it — the ladder says so
    // instead of rendering a tick it did not earn.
    evidence: [],
    facts: ["Roughly 66% of floor staff hired through the program"],
  },

  // ── human-ruled states: only a person sets these ──────────────────────────
  {
    key: "state-ewaste-bill-reaction",
    endowment: "expertise",
    angleType: "trend_commentary",
    headline:
      "The state e-waste amendments move the cost, not the volume",
    summary:
      "The proposed amendments shift collection cost onto manufacturers without changing what actually reaches a certified processor. That is worth saying, but only once the committee reports.",
    whyNow: "The committee reports in November.",
    beat: "Waste & recycling policy",
    outletKind: "trade",
    status: "accepted",
    action: "hold_for_timing",
    actionReason:
      "You ruled this one held until the committee reports — commenting before the text is final invites a correction.",
    scores: [55, 61, 22, 68, 40],
    proof: [["bill-text", "The final amended bill text", "document", null]],
    missing: [
      [
        "bill-text",
        "The final amended bill text",
        "Published when the committee reports. Nothing to do until then.",
        "third_party",
        "quick",
      ],
    ],
    evidence: [],
    facts: ["Amendments shift collection cost to manufacturers"],
    humanRuled: true,
  },
  {
    key: "data-destruction-pricing-truth",
    endowment: "capital",
    angleType: "contrarian",
    headline: "Per-pound destruction pricing is why data gets missed",
    summary:
      "Charging by weight rewards throughput and punishes the careful handling that catches a drive with data still on it. You have said this privately for years; whether you are willing to say it on the record about your own industry is your call.",
    whyNow: "Procurement season for enterprise ITAD contracts.",
    beat: "Enterprise IT",
    outletKind: "trade",
    status: "developing",
    action: "needs_expert_input",
    actionReason:
      "This one criticises how your own market prices work. Nobody in the system can decide whether you want your name on it.",
    scores: [72, 84, 55, 51, 30],
    proof: [
      ["your-position", "Your decision on going on the record", "quote", null],
      ["pricing-comparison", "Pricing-model comparison", "data", null],
    ],
    missing: [
      [
        "your-position",
        "Your decision on going on the record",
        "This needs your answer. Say yes and the rest is assemblable in a day.",
        "you",
        "quick",
      ],
      [
        "pricing-comparison",
        "Pricing-model comparison",
        "Compare per-pound and per-device contracts on drives-with-data-found rate.",
        "team",
        "medium",
      ],
    ],
    evidence: [],
    facts: ["Per-pound contracts dominate enterprise ITAD"],
    humanRuled: true,
  },
  {
    key: "holiday-donation-drive",
    endowment: "media",
    angleType: "seasonal",
    headline: "Holiday device-donation drive",
    summary:
      "A seasonal collection push. Real, but it is a press release, not a story, and it was dismissed on that basis.",
    whyNow: null,
    beat: "Community",
    outletKind: "local",
    status: "dismissed",
    action: "park",
    actionReason: "Dismissed: promotional, with no reportable claim inside it.",
    scores: [22, 18, 44, 61, 20],
    proof: [],
    missing: [],
    evidence: [["drive-dates", "Drive dates and locations", "Marketing calendar", null]],
    facts: [],
    humanRuled: true,
  },
];

function proofJson(items: readonly ProofSeed[], malformed = 0): Json {
  const parsed = items.map(([key, label, kind, note, satisfied]) => ({
    key,
    label,
    kind,
    note,
    // Only emitted when the seed says something. Silence lets
    // `missing_evidence` decide, which is the analyzer's authority.
    ...(satisfied === undefined ? {} : { satisfied }),
  }));
  // Entries with no readable label at all — exactly what an older analyzer
  // version or a hand-edited row leaves behind.
  const broken = Array.from({ length: malformed }, (_, index) => ({
    legacy_requirement_id: index + 1,
  }));
  return [...parsed, ...broken] as unknown as Json;
}

function gapJson(items: readonly GapSeed[]): Json {
  return items.map(([key, label, how_to_get, owner, effort]) => ({
    key,
    label,
    how_to_get,
    owner,
    effort,
  })) as unknown as Json;
}

function evidenceJson(items: readonly EvidenceSeed[], now: number): Json {
  return items.map(([key, label, source, url], index) => ({
    key,
    label,
    source,
    url,
    captured_at: new Date(now - (index + 2) * DAY).toISOString(),
  })) as unknown as Json;
}

function buildAngles(now: number): StoryAngle[] {
  return ANGLE_SEEDS.map((seed, index) => {
    const [priority, newsworthiness, timeliness, confidence, evidenceQuality] =
      seed.scores;
    const analyzedAt = iso(now - (index + 1) * 6 * HOUR);
    const humanReviewedAt = seed.humanRuled
      ? iso(now - (index + 1) * 2 * HOUR)
      : null;
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
      facts: seed.facts.map((statement) => ({ statement })) as unknown as Json,
      inferences: [] as unknown as Json,
      evidence_refs: evidenceJson(seed.evidence, now),
      proof_required: proofJson(seed.proof, seed.malformedProof ?? 0),
      missing_evidence: gapJson(seed.missing),
      contradictions: (seed.contradictions ?? []).map(([statement, detail]) => ({
        statement,
        detail,
      })) as unknown as Json,
      analysis: {} as unknown as Json,
      human_ruling: (seed.humanRuled
        ? { ruled_action: seed.action, note: seed.actionReason }
        : {}) as unknown as Json,
      evidence_fingerprint: null,
      analysis_version: "sample",
      // Backend fact 1: anything that is not `pitch_now` came back needing a
      // human look. The two human-ruled rows have already had one.
      requires_human_review: seed.action !== "pitch_now" && !seed.humanRuled,
      status: seed.status,
      analyzed_at: analyzedAt,
      human_reviewed_at: humanReviewedAt,
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
      metadata: {} as unknown as Json,
      visibility: "internal",
    } satisfies StoryAngle;
  });
}

interface RequestSeed {
  platform: string;
  outlet: string;
  journalist: string | null;
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
    title: "Sources: media disposal failures behind recent OCR enforcement",
    body: "Looking for compliance-side voices on what a defensible chain of custody looks like for retired media. Prefer NAID or R2 certified operators.",
    beat: "Healthcare compliance",
    matchScore: 91,
    matchReason:
      "You are NAID AAA certified and the query names that credential as a preference.",
    hoursOut: 19,
    status: "matched",
    draft: null,
    angleIndex: 2,
    requirements: ["NAID or R2 certified", "On the record", "By Thursday 5pm ET"],
  },
  {
    platform: "featured",
    outlet: "Phoenix Business Journal",
    journalist: "Tasha Boone",
    title: "Local angle wanted: where does Phoenix e-waste actually go?",
    body: "Doing a visual piece for the November collection season. Open to a facility visit.",
    beat: "Local business",
    matchScore: 84,
    matchReason:
      "Your Phoenix intake facility matches the geography and the piece is explicitly open to a site visit.",
    hoursOut: 61,
    status: "new",
    draft: null,
    angleIndex: 3,
    requirements: ["Phoenix metro", "Facility access preferred"],
  },
  {
    platform: "sourcebottle",
    outlet: "The Register",
    journalist: null,
    title: "What happens to decommissioned AI accelerators?",
    body: "Chasing the secondary market for datacenter GPUs. Want someone who handles the physical hardware, not an analyst.",
    beat: "AI infrastructure",
    matchScore: 77,
    matchReason:
      "You physically process decommissioned accelerators, which is what the query asks for — but the resale-versus-shred figure it needs is not in hand.",
    hoursOut: 96,
    status: "new",
    draft: null,
    angleIndex: 4,
    requirements: ["Hands-on operator", "UK/US either"],
  },
  {
    platform: "haro",
    outlet: "Security Ledger",
    journalist: "Priya Mahajan",
    title: "Data left on drives sent for destruction — sources wanted",
    body: "Need an operator who can speak to how often erasure claims fail verification.",
    beat: "Security",
    matchScore: 93,
    matchReason: "Your sampling programme measures exactly this.",
    hoursOut: -30,
    status: "submitted",
    draft:
      "Across 214,000 drives sampled over twelve months, 2.4% still carried recoverable data when they arrived for destruction — after the sender had certified erasure.",
    angleIndex: 1,
    requirements: ["On the record", "Numbers preferred"],
  },
  {
    // BACKEND FACT 2: `expired` carries no draft and no subject line.
    platform: "haro",
    outlet: "Waste Dive",
    journalist: "Grace Oyelaran",
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
  {
    // BACKEND FACT 2: `passed` likewise — the journalist moved on.
    platform: "qwoted",
    outlet: "Fast Company",
    journalist: "Leon Vasquez",
    title: "Looking for repair-economy voices",
    body: "Sources on how repairability rules changed operations.",
    beat: "Consumer tech",
    matchScore: 66,
    matchReason: "Your refurbishment series is relevant but was not yet compiled.",
    hoursOut: -52,
    status: "passed",
    draft: null,
    angleIndex: 5,
    requirements: ["US-based"],
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
    // The original query stays reachable even for expired and passed rows —
    // that door is the only thing left to open on a closed request.
    external_url: `https://example.com/${seed.platform}/sample-${index + 1}`,
    outlet: seed.outlet,
    journalist_name: seed.journalist,
    party_id: null,
    query_title: seed.title,
    query_body: seed.body,
    beat: seed.beat,
    requirements: seed.requirements.map((text) => ({
      label: text,
    })) as unknown as Json,
    deadline_at: iso(now + seed.hoursOut * HOUR),
    match_score: seed.matchScore,
    match_reason: seed.matchReason,
    story_angle_id:
      seed.angleIndex === null ? null : (angles[seed.angleIndex]?.id ?? null),
    draft_response: seed.draft,
    draft_generated_at: seed.draft ? iso(now - 2 * HOUR) : null,
    status: seed.status,
    submitted_at: seed.status === "submitted" ? iso(now - 26 * HOUR) : null,
    won_at: null,
    created_at: iso(now - 12 * HOUR),
    updated_at: iso(now - 2 * HOUR),
    deleted_at: null,
    version: 1,
    metadata: {} as unknown as Json,
    visibility: "internal",
  })) satisfies SourceRequest[];
}

interface CoverageSeed {
  domain: string;
  title: string;
  author: string;
  daysAgo: number;
  quote: string;
  linksToSite: boolean;
  prominence: string;
  prominenceScore: number;
  /** Which angle produced it — see `angleIdFromMention` in data.ts. */
  angleIndex: number | null;
}

const COVERAGE_SEEDS: readonly CoverageSeed[] = [
  {
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
    domain: "bizjournals.com",
    title: "Inside the warehouse that sees what Phoenix throws away",
    author: "Tasha Boone",
    daysAgo: 24,
    quote:
      "One in forty drives that arrives here still has readable data on it when it comes off the truck.",
    linksToSite: true,
    prominence: "feature",
    prominenceScore: 81,
    angleIndex: 1,
  },
  {
    domain: "wastedive.com",
    title: "R2v3 operators press states on collection standards",
    author: "Grace Oyelaran",
    daysAgo: 41,
    quote: "Certification is the floor, not the ceiling.",
    linksToSite: false,
    prominence: "mention",
    prominenceScore: 34,
    // No angle recorded — the row SAYS so rather than quietly rendering nothing.
    angleIndex: null,
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
      analysis: {} as unknown as Json,
      links_to_site: seed.linksToSite,
      link_urls: seed.linksToSite ? ["https://allgreenrecycling.com/"] : [],
      sentiment: "positive",
      sentiment_score: 72,
      prominence: seed.prominence,
      prominence_score: seed.prominenceScore,
      topics: [{ label: "ITAD" }] as unknown as Json,
      key_quote: seed.quote,
      is_competitor: false,
      competitor_key: null,
      matched_terms: ["All Green"],
      hit_score: seed.prominenceScore,
      hit_reason: "Brand name in body",
      outcome_event_id: null,
      external_id: null,
      language: "en",
      source_capture: {} as unknown as Json,
      created_at: publishedAt,
      updated_at: publishedAt,
      deleted_at: null,
      version: 1,
      // The ONLY tie back to the angle that produced this coverage. There is no
      // FK from coverage_mention to story_angle, so it lives in metadata under
      // a documented key that `data.ts` is the sole reader of.
      metadata: {
        story_angle_id:
          seed.angleIndex === null ? null : (angles[seed.angleIndex]?.id ?? null),
      } as unknown as Json,
    } satisfies CoverageMention;
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
