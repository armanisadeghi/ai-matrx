import { selectedResponsesGrid } from "./transform";
import type { FormResponsesPreview } from "./service";

it("keeps account, Form, response, timestamp and distinct question IDs with all answers", () => {
  const preview: FormResponsesPreview = {
    status: "ready",
    provenance: { form_id: "form-1", form_title: "Survey", connection_id: "account-1", account_label: "person@example.com", organization_id: "org-1" },
    responses: [
      { response_id: "r1", submitted_at: "2026-09-26T12:00:00Z", answers: [
        { question_id: "q1", question_label: "Name", values: ["A", "B"], file_upload_count: 0 },
        { question_id: "q2", question_label: "Name", values: [], file_upload_count: 2 },
      ] },
      { response_id: "r2", submitted_at: null, answers: [] },
    ],
  };
  const result = selectedResponsesGrid(preview, new Set(["r1"]));
  expect(result.headers).toContain("Name (q1)");
  expect(result.headers).toContain("Name (q2)");
  expect(result.rows).toEqual([["Google Forms", "person@example.com", "account-1", "Survey", "form-1", "r1", "2026-09-26T12:00:00Z", "A; B", "2 file uploads"]]);
});
