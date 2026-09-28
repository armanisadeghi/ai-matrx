import type { StudyMediaRow } from "@/features/education/media/types";
import { parseCreateSummaries, parseUpdateSummaries } from "../summaryWrites";

const row = (): StudyMediaRow => ({
  audio_file_id: null, audio_format: null, config: {}, created_at: "2026-09-27T00:00:00Z",
  created_by: "user-1", custom_fields: {}, deleted_at: null, description: null,
  diagram_kind: null, duration_seconds: null, episode_id: null, id: "summary-1",
  ir_envelope: {
    __kind: "study_summary", title: "Original", summary_markdown: "Original body",
    key_points: ["First"], trust: { confidence: "grounded", citations: [] },
    metadata: { source: "converter" }, nested_kind: { __kind: "citation_bundle", keep: true },
  },
  media_kind: "summary", metadata: {}, organization_id: "org-1", run_id: null,
  shown_to: null, source_id: "source-1", source_kind: "note", source_title: "Lecture",
  status: "ready", title: "Original", trust: { confidence: "grounded", citations: [] },
  updated_at: "2026-09-27T00:00:00Z", updated_by: "user-1", version: 7, visibility: "personal",
});

describe("summary writes", () => {
  it("allows manually authored summaries without takeaways", () => {
    expect(parseCreateSummaries([{ title: "Handwritten", summary_markdown: "A useful body.", key_points: [] }])[0]).toMatchObject({
      __kind: "study_summary", key_points: [],
    });
  });

  it("preserves envelope metadata and nested kind markers while downgrading edited trust", () => {
    const plan = parseUpdateSummaries([{ id: "summary-1", summary_markdown: "Changed body" }], [row()])[0];
    expect(plan.irEnvelope).toMatchObject({
      __kind: "study_summary", metadata: { source: "converter" }, nested_kind: { __kind: "citation_bundle", keep: true },
      summary_markdown: "Changed body",
    });
    expect(plan.trust).toEqual({ confidence: "inferred", citations: [] });
    expect(plan.version).toBe(7);
  });

  it("refuses an agent write against a stale expected revision before approval", () => {
    expect(() => parseUpdateSummaries([{ id: "summary-1", title: "Changed", expected_revision: 6 }], [row()]))
      .toThrow(/expected_revision is stale/);
  });
});
