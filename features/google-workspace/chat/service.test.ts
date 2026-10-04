import { previewChatMessages, validateChatPreview, type ChatMessagesRequest } from "./service";

const post = jest.fn();
const organizationId = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
jest.mock("@/features/marketing/google/service", () => ({ postGoogleBackend: (...args: unknown[]) => post(...args) }));

const request: ChatMessagesRequest = {
  connection_id: "personal-connection", space_resource_name: "spaces/support-triage",
  start_time: "2026-10-01T09:00:00Z", end_time: "2026-10-01T10:00:00Z",
  page_size: 25, order_by: "createTime ASC",
};
const page = {
  account_label: "reviewer account", ...request, messages: [{
    resource_name: "spaces/support-triage/messages/incident-a",
    content_state: "text", text: "Morning support handoff",
  }], omitted_system_messages: true as const, continuation: "signed-opaque-token",
};

beforeEach(() => post.mockReset());

it("sends exactly the selected query with organization in transport context", async () => {
  post.mockResolvedValue({ json: async () => page });
  expect(await previewChatMessages(request, organizationId)).toEqual(page);
  expect(post).toHaveBeenCalledWith(
    "/google-workspace/chat/messages/preview", request,
    "Google Chat messages could not load. Try again.", organizationId,
  );
  expect(Object.keys(post.mock.calls[0][1]).sort()).toEqual([
    "connection_id", "end_time", "order_by", "page_size", "space_resource_name", "start_time",
  ]);
});

it("sends the signed continuation only for a requested next page", async () => {
  post.mockResolvedValue({ json: async () => ({ ...page, continuation: null }) });
  await previewChatMessages({ ...request, continuation: "signed-opaque-token" }, organizationId);
  expect(post.mock.calls[0][1]).toEqual({ ...request, continuation: "signed-opaque-token" });
});

it.each([
  [{ ...page, connection_id: "another-connection" }, "invalid page"],
  [{ ...page, omitted_system_messages: false }, "invalid page"],
  [{ ...page, messages: [{ ...page.messages[0], content_state: "wrong" }] }, "invalid message"],
  [{ ...page, messages: [{ ...page.messages[0], resource_name: "spaces/other/messages/incident-a" }] }, "invalid message"],
])("rejects mismatched or malformed provider content", (response, message) => {
  expect(() => validateChatPreview(response, request)).toThrow(message);
});

it.each([
  { ...request, space_resource_name: "spaces/bad/path" },
  { ...request, start_time: request.end_time },
  { ...request, page_size: 1001 },
])("refuses invalid queries before transport", async (invalid) => {
  await expect(previewChatMessages(invalid, organizationId)).rejects.toThrow("Check the space");
  expect(post).not.toHaveBeenCalled();
});
