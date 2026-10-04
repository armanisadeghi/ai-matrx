import { previewSelectedFormResponses } from "./service";

const postGoogleBackend = jest.fn();
const organizationId = "123e4567-e89b-42d3-a456-426614174000";
jest.mock("@/features/marketing/google/service", () => ({
  postGoogleBackend: (...args: unknown[]) => postGoogleBackend(...args),
}));

beforeEach(() => postGoogleBackend.mockReset());

it("sends the selected connection, Form, page and same organization header", async () => {
  const payload = {
    status: "next_page_available",
    provenance: { form_id: "form-1", form_title: "Survey", connection_id: "account-1", account_label: "person@example.com", organization_id: organizationId },
    responses: [{ response_id: "response-1", submitted_at: "2026-09-26T12:00:00Z", answers: [{ question_id: "q1", question_label: "Rating", values: ["Great"], file_upload_count: 0 }] }],
    next_page_token: "opaque-next",
  };
  postGoogleBackend.mockResolvedValue({ json: async () => payload });
  const request = { organization_id: organizationId, connection_id: "account-1", form_id: "form-1", page_token: "opaque-first" };
  await expect(previewSelectedFormResponses(request)).resolves.toEqual(payload);
  expect(postGoogleBackend).toHaveBeenCalledWith(
    "/google-integrations/forms/responses/preview",
    request,
    "Unable to preview Form responses.",
    organizationId,
  );
});

it("rejects a response from another Form or account", async () => {
  postGoogleBackend.mockResolvedValue({ json: async () => ({ status: "ready", provenance: { form_id: "other", form_title: "Other", connection_id: "account-1", account_label: "person@example.com", organization_id: organizationId }, responses: [] }) });
  await expect(previewSelectedFormResponses({ organization_id: organizationId, connection_id: "account-1", form_id: "form-1" })).rejects.toThrow("could not be read");
});

it("rejects a malformed respondent-data flag", async () => {
  postGoogleBackend.mockResolvedValue({ json: async () => ({ status: "ready", provenance: { form_id: "form-1", form_title: "Survey", connection_id: "account-1", account_label: "person@example.com", organization_id: organizationId }, responses: [], respondent_data_present: "yes" }) });
  await expect(previewSelectedFormResponses({ organization_id: organizationId, connection_id: "account-1", form_id: "form-1" })).rejects.toThrow("could not be read");
});
