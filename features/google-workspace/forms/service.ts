import type { components } from "@ai-matrx/agents/generated/api-types";
import { postGoogleBackend } from "@/features/marketing/google/service";
import { requireOrganizationContext } from "@/lib/api/organization-context";

export type FormResponsesRequest = components["schemas"]["SelectedFormResponsesHttpRequest"];
export type FormResponsesPreview = components["schemas"]["SelectedFormResponsesPreview"];

const PATH = "/google-integrations/forms/responses/preview";

export async function previewSelectedFormResponses(request: FormResponsesRequest): Promise<FormResponsesPreview> {
  const organizationId = requireOrganizationContext(request.organization_id);
  const response = await postGoogleBackend(
    PATH,
    { ...request, organization_id: organizationId },
    "Unable to preview Form responses.",
    organizationId,
  );
  const payload: unknown = await response.json();
  if (!isPreview(payload, request)) {
    throw new Error("The Form response page could not be read. Try again.");
  }
  return payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPreview(value: unknown, request: FormResponsesRequest): value is FormResponsesPreview {
  if (!isRecord(value) || !isRecord(value.provenance)) return false;
  if (!["forms_api_unavailable", "next_page_available", "no_responses", "ready", "selected_form_unavailable"].includes(String(value.status))) return false;
  const source = value.provenance;
  if (source.connection_id !== request.connection_id || source.form_id !== request.form_id || source.organization_id !== request.organization_id) return false;
  if (typeof source.form_title !== "string" || typeof source.account_label !== "string") return false;
  if (value.next_page_token != null && typeof value.next_page_token !== "string") return false;
  if (value.respondent_data_present !== undefined && typeof value.respondent_data_present !== "boolean") return false;
  if (value.unavailable_reason != null && typeof value.unavailable_reason !== "string") return false;
  if (value.responses === undefined) return true;
  return Array.isArray(value.responses) && value.responses.every((response: unknown) =>
    isRecord(response) && typeof response.response_id === "string" &&
    (response.submitted_at == null || typeof response.submitted_at === "string") &&
    Array.isArray(response.answers) && response.answers.every((answer: unknown) =>
      isRecord(answer) && typeof answer.question_id === "string" &&
      typeof answer.question_label === "string" &&
      Array.isArray(answer.values) && answer.values.every((item: unknown) => typeof item === "string") &&
      (answer.file_upload_count === undefined ||
        (typeof answer.file_upload_count === "number" && Number.isInteger(answer.file_upload_count) && answer.file_upload_count >= 0))
    )
  );
}
