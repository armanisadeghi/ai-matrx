import type { components } from "@ai-matrx/agents/generated/api-types";

type Preview = components["schemas"]["SelectedFormResponsesPreview"];
type Response = components["schemas"]["SelectedFormResponse"];

function answerText(answer: Response["answers"][number]): string {
  const values = answer.values.join("; ");
  const uploads = answer.file_upload_count ?? 0;
  return uploads ? [values, `${uploads} file upload${uploads === 1 ? "" : "s"}`].filter(Boolean).join("; ") : values;
}

/** One row per selected response; question IDs distinguish duplicate labels. */
export function selectedResponsesGrid(preview: Preview, selectedIds: ReadonlySet<string>): {
  headers: string[];
  rows: string[][];
} {
  const responses = (preview.responses ?? []).filter((row) => selectedIds.has(row.response_id));
  const questions = new Map<string, string>();
  for (const response of responses) {
    for (const answer of response.answers) questions.set(answer.question_id, answer.question_label);
  }
  const headers = ["Source", "Account", "Connection ID", "Form", "Form ID", "Response ID", "Last submitted", ...[...questions].map(([id, label]) => `${label} (${id})`)];
  const rows = responses.map((response) => {
    const byQuestion = new Map<string, string[]>();
    for (const answer of response.answers) {
      byQuestion.set(answer.question_id, [...(byQuestion.get(answer.question_id) ?? []), answerText(answer)]);
    }
    return [
      "Google Forms", preview.provenance.account_label, preview.provenance.connection_id,
      preview.provenance.form_title, preview.provenance.form_id, response.response_id,
      response.submitted_at ?? "", ...[...questions.keys()].map((id) => (byQuestion.get(id) ?? []).join("; ")),
    ];
  });
  return { headers, rows };
}
