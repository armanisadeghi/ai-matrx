/**
 * Meet operation-result kinds → the shared `flow_step_result` renderer.
 *
 * These are data contracts emitted by the Meet service. They answer one
 * reader question: what did this durable operation do? The shared operation
 * renderer already owns that posture, so this module supplies the compiled
 * schema and routing floor only; it deliberately creates no Meet-local view.
 *
 * The live `emitted_json_schema` rows are the authority. Keep this eager
 * mirror aligned so a cold client can route an active result before the warm
 * registry fetch completes.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";

const FLOW_STEP_RESULT_COMPONENT = "flow_step_result";

const meetIntelligenceResultSchema: KindSchema = {
  kind: "meet_intelligence_result",
  fields: {
    __kind: { type: "string" },
    status: { type: "string", required: true },
    meeting_id: { type: "string", required: true },
    rows_written: { type: "number" },
    segment_count: { type: "number" },
    reason: { type: "string" },
  },
};

const meetRecordingLandingResultSchema: KindSchema = {
  kind: "meet_recording_landing_result",
  fields: {
    __kind: { type: "string" },
    outcome: { type: "string", required: true },
    recording_id: { type: "string", required: true },
    file_id: { type: "string" },
    detail: { type: "string" },
  },
};

const meetRecordingTranscriptionResultSchema: KindSchema = {
  kind: "meet_recording_transcription_result",
  fields: {
    __kind: { type: "string" },
    status: { type: "string", required: true },
    recording_id: { type: "string", required: true },
    segment_count: { type: "number" },
    reason: { type: "string" },
  },
};

export const MEET_RESULT_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "meet_intelligence_result",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: FLOW_STEP_RESULT_COMPONENT,
    schema: meetIntelligenceResultSchema,
  },
  {
    kind: "meet_recording_landing_result",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: FLOW_STEP_RESULT_COMPONENT,
    schema: meetRecordingLandingResultSchema,
  },
  {
    kind: "meet_recording_transcription_result",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: FLOW_STEP_RESULT_COMPONENT,
    schema: meetRecordingTranscriptionResultSchema,
  },
];
