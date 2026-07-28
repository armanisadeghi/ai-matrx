import type { KindDefinition } from "../registry/kind-registry.types";

export const VIDEO_TRANSCRIPT_RESEARCH_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "video_transcript_research",
    schemaSource: "system",
    tier: "eager",
    persistence: { persistStructured: true },
    schema: {
      kind: "video_transcript_research",
      fields: {
        title: { type: "string", required: true },
        overview: { type: "string", required: true },
        keyPoints: { type: "string[]", required: true },
        segments: {
          type: "array",
          itemKinds: ["transcript_segment"],
          required: true,
        },
        claims: {
          type: "array",
          itemKinds: ["claim_evidence"],
          required: true,
        },
        entities: {
          type: "array",
          itemKinds: ["entity_mention"],
          required: true,
        },
        topics: {
          type: "array",
          itemKinds: ["topic_relevance"],
          required: true,
        },
        notableTimestamps: {
          type: "array",
          itemKinds: ["notable_timestamp"],
          required: true,
        },
        usage: {
          type: "object",
          kind: "transcript_usage",
          required: true,
        },
      },
    },
  },
  {
    kind: "evidence_source",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "evidence_source",
      fields: {
        summary: { type: "string", required: true },
        sourceTitle: { type: "string", required: true },
        sourceUrl: { type: "string", required: true },
      },
    },
  },
  {
    kind: "claim_evidence",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "claim_evidence",
      fields: {
        claim: { type: "string", required: true },
        speakerPosition: { type: "string", required: true },
        timecode: { type: "string", required: true },
        seconds: { type: "number", required: true },
        supportingEvidence: {
          type: "array",
          itemKinds: ["evidence_source"],
          required: true,
        },
        contrastingEvidence: {
          type: "array",
          itemKinds: ["evidence_source"],
          required: true,
        },
        recentDevelopments: { type: "string", required: true },
      },
    },
  },
  {
    kind: "entity_mention",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "entity_mention",
      fields: {
        name: { type: "string", required: true },
        entityType: { type: "string", required: true },
        role: { type: "string", required: true },
        mentions: { type: "string[]", required: true },
      },
    },
  },
  {
    kind: "topic_relevance",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "topic_relevance",
      fields: {
        topic: { type: "string", required: true },
        relevanceScore: { type: "number", required: true },
        rationale: { type: "string", required: true },
      },
    },
  },
  {
    kind: "notable_timestamp",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "notable_timestamp",
      fields: {
        timecode: { type: "string", required: true },
        seconds: { type: "number", required: true },
        label: { type: "string", required: true },
        type: { type: "string", required: true },
      },
    },
  },
  {
    kind: "transcript_usage",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "transcript_usage",
      fields: {
        model: { type: "string", required: true },
        videoDuration: { type: "string", required: true },
        timestampPrecision: { type: "string", required: true },
        inputTokens: { type: "number", required: true },
        outputTokens: { type: "number", required: true },
        totalTokens: { type: "number", required: true },
        notes: { type: "string", required: true },
      },
    },
  },
];
