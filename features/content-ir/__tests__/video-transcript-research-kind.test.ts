import { kindSchemaToJsonSchema } from "../convert/kind-to-json-schema";
import type { KindSchema } from "../core/kind-schema.types";
import { validateStructuralLeg } from "../registry/kind-dual-gate";
import { VIDEO_TRANSCRIPT_RESEARCH_KIND_DEFINITIONS } from "../kinds/video-transcript-research";
import { TRANSCRIPT_KIND_DEFINITIONS } from "../kinds/transcript";

const definitionFor = (kind: string) =>
  [
    ...VIDEO_TRANSCRIPT_RESEARCH_KIND_DEFINITIONS,
    ...TRANSCRIPT_KIND_DEFINITIONS,
  ].find((definition) => definition.kind === kind);

const resolveSchema = (kind: string): KindSchema | undefined =>
  definitionFor(kind)?.schema ?? undefined;

const VALID_EXAMPLE = {
  __kind: "video_transcript_research",
  title: "A research video",
  overview: "A neutral overview.",
  keyPoints: ["First takeaway"],
  segments: [
    {
      __kind: "transcript_segment",
      id: "seg-0001",
      text: "Verbatim text.",
      speaker: "Unknown",
      timecode: "00:00:03",
      seconds: 3,
      isHighlighted: false,
    },
  ],
  claims: [
    {
      __kind: "claim_evidence",
      claim: "A claim",
      speakerPosition: "The speaker supports it.",
      timecode: "00:00:03",
      seconds: 3,
      supportingEvidence: [
        {
          __kind: "evidence_source",
          summary: "Supporting finding",
          sourceTitle: "Source",
          sourceUrl: "https://example.com/source",
        },
      ],
      contrastingEvidence: [],
      recentDevelopments: "",
    },
  ],
  entities: [
    {
      __kind: "entity_mention",
      name: "Jane Doe",
      entityType: "person",
      role: "researcher",
      mentions: ["00:00:03"],
    },
  ],
  topics: [
    {
      __kind: "topic_relevance",
      topic: "Research",
      relevanceScore: 0.9,
      rationale: "Central to the video.",
    },
  ],
  notableTimestamps: [
    {
      __kind: "notable_timestamp",
      timecode: "00:00:03",
      seconds: 3,
      label: "Key claim",
      type: "key_claim",
    },
  ],
  usage: {
    __kind: "transcript_usage",
    model: "gemini-test",
    videoDuration: "00:01:00",
    timestampPrecision: "exact",
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    notes: "",
  },
};

describe("video transcript research kind", () => {
  it("exports the exact nested contract and accepts a complete result", () => {
    const exported = kindSchemaToJsonSchema(
      "video_transcript_research",
      resolveSchema,
      { strict: true, injectKind: false },
    );
    if (!exported) throw new Error("video transcript schema failed to export");

    expect(exported.unresolved).toEqual([]);
    expect(validateStructuralLeg(VALID_EXAMPLE, exported.schema)).toEqual({
      ok: true,
    });
  });

  it("rejects a partial result so the raw fallback path can preserve it", () => {
    const exported = kindSchemaToJsonSchema(
      "video_transcript_research",
      resolveSchema,
      { strict: true, injectKind: false },
    );
    if (!exported) throw new Error("video transcript schema failed to export");

    const partial = { ...VALID_EXAMPLE, usage: undefined };
    expect(validateStructuralLeg(partial, exported.schema).ok).toBe(false);
  });
});
