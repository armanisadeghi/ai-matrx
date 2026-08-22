/**
 * ADVERSARIAL (kinds-program review, 2026-08-21): the FE structural leg vs
 * the one-shape doctrine's REQUIRED `__kind`.
 *
 * `validateStructuralLeg` (features/content-ir/registry/kind-dual-gate.ts)
 * strips `__kind` RECURSIVELY before validating, under the old law that
 * `emitted_json_schema` represents plain SOURCE data. The one-shape doctrine
 * (KINDS_EVERYWHERE_PLAN.md §4.2) made `__kind` a DECLARED model field, and
 * several LIVE schemas now list it in `required` — measured live 2026-08-21
 * on project brsgrqvjdzwihsvnfqkf:
 *
 *   select kind from content_ir.kind_definition
 *   where deleted_at is null
 *     and (emitted_json_schema->'required')::text like '%__kind%';
 *   -- claim_evidence, competitor_opportunity_autopsy_v1,
 *   -- competitor_page_autopsy_v1, seo_authority_route_analysis,
 *   -- video_transcript_research (all ACTIVE), ...
 *
 * For those kinds strip-then-validate can NEVER pass: with `__kind` present
 * the leg strips it and `required` fails; without it `required` fails
 * directly. Every sample is rejected — including the canonical example
 * `claim_evidence` is waiting on (its ledger row says the example is now
 * "authorable"; through this gate it is not).
 *
 * The schema below is the LIVE `claim_evidence.emitted_json_schema`
 * (rebuilt 2026-08-21 by aidream/scripts/repair_dangling_kind_defs.py from
 * the pydantic contract), verbatim minus `title` noise. The sample satisfies
 * it completely, `__kind` markers included.
 *
 * `test.failing`: this documents a real defect without breaking CI. The fix
 * is a ruling — either the leg treats a DECLARED `__kind` as validatable
 * (skip the strip when the schema declares it), or publishers must never
 * mark `__kind` required. When either lands, these start passing and jest
 * will flag them as "obsolete failing" — then promote them to plain tests.
 */
import { validateStructuralLeg } from "@ai-matrx/content-ir";

const LIVE_CLAIM_EVIDENCE_SCHEMA = {
  type: "object",
  $defs: {
    EvidenceSource: {
      type: "object",
      required: ["__kind", "summary", "sourceTitle", "sourceUrl"],
      properties: {
        __kind: { type: "string", const: "evidence_source" },
        summary: { type: "string" },
        sourceUrl: { type: "string" },
        sourceTitle: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  required: [
    "__kind",
    "claim",
    "speakerPosition",
    "timecode",
    "seconds",
    "supportingEvidence",
    "contrastingEvidence",
    "recentDevelopments",
  ],
  properties: {
    __kind: { type: "string", const: "claim_evidence" },
    claim: { type: "string" },
    seconds: { type: "integer", minimum: 0 },
    timecode: { type: "string" },
    speakerPosition: { type: "string" },
    recentDevelopments: { type: "string" },
    supportingEvidence: {
      type: "array",
      items: { $ref: "#/$defs/EvidenceSource" },
    },
    contrastingEvidence: {
      type: "array",
      items: { $ref: "#/$defs/EvidenceSource" },
    },
  },
  additionalProperties: false,
} as const;

/** A COMPLETE, schema-true instance — `__kind` present at every level. */
const FULLY_VALID_SAMPLE = {
  __kind: "claim_evidence",
  claim: "The moon landing used a 2kB guidance computer.",
  speakerPosition: "host",
  timecode: "00:12:31",
  seconds: 751,
  supportingEvidence: [
    {
      __kind: "evidence_source",
      summary: "AGC had roughly 2K words of erasable memory.",
      sourceTitle: "Apollo Guidance Computer, NASA archive",
      sourceUrl: "https://history.nasa.gov/agc",
    },
  ],
  contrastingEvidence: [],
  recentDevelopments: "Restored AGC booted in 2019.",
};

describe("structural leg vs a schema that REQUIRES the declared __kind", () => {
  // RED — the defect: a fully valid instance is rejected because the leg
  // strips the very field the schema requires.
  test.failing(
    "a schema-true instance (with __kind) passes the structural leg",
    () => {
      const result = validateStructuralLeg(
        FULLY_VALID_SAMPLE,
        LIVE_CLAIM_EVIDENCE_SCHEMA,
      );
      expect(result.ok).toBe(true);
    },
  );

  // RED — the other door is closed too: omitting __kind fails `required`
  // directly, so NO sample whatsoever can pass. (Also test.failing so the
  // pair reads as "both doors shut", and flips loudly when a fix lands.)
  test.failing("omitting __kind passes the structural leg", () => {
    const { __kind: _root, ...rest } = FULLY_VALID_SAMPLE;
    const sample = {
      ...rest,
      supportingEvidence: FULLY_VALID_SAMPLE.supportingEvidence.map(
        ({ __kind: _child, ...src }) => src,
      ),
    };
    const result = validateStructuralLeg(sample, LIVE_CLAIM_EVIDENCE_SCHEMA);
    expect(result.ok).toBe(true);
  });

  // CONTROL (green): the same shape with __kind DECLARED but not required —
  // the KindModel default — passes after the strip. This pins that the
  // defect is specifically `required: ["__kind", ...]`, not declaration.
  test("control: __kind declared-but-optional validates after the strip", () => {
    const relaxed = JSON.parse(JSON.stringify(LIVE_CLAIM_EVIDENCE_SCHEMA));
    relaxed.required = relaxed.required.filter((k: string) => k !== "__kind");
    relaxed.$defs.EvidenceSource.required =
      relaxed.$defs.EvidenceSource.required.filter(
        (k: string) => k !== "__kind",
      );
    const result = validateStructuralLeg(FULLY_VALID_SAMPLE, relaxed);
    expect(result.ok).toBe(true);
  });
});
