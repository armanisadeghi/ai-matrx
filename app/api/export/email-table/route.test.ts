/** @jest-environment node */
import { withClaims as mockWithClaims } from "@/test-utils/supabase-auth";

const getUser = jest.fn();
const emailTableExport = jest.fn();

jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: mockWithClaims({ getUser: () => getUser() }) }),
}));

jest.mock("@/lib/email/exportService", () => ({
  emailTableExport: (...args: unknown[]) => emailTableExport(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST } = require("./route") as typeof import("./route");

function request(body: Record<string, unknown>) {
  return new Request("https://www.aimatrx.com/api/export/email-table", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: "reviewed-export.csv",
      mime: "text/csv;charset=utf-8",
      ...body,
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({
    // `id` is the JWT's `sub`: a real access token always carries it, and
    // without it the claims the route verifies resolve to no user at all.
    data: { user: { id: "owner-1", email: "owner@matrx.test" } },
  });
  emailTableExport.mockResolvedValue({
    success: true,
    message: "Export emailed successfully",
  });
});

test("emails the exact prepared artifact only to the authenticated account", async () => {
  const filteredAndEditedArtifact = "name,score\nAva,9\nEdited row,10\n";

  const response = await POST(
    request({
      label: "My <edited> view",
      format: "csv",
      content: filteredAndEditedArtifact,
      filename: "reviewed-Ω.csv",
      to: "attacker@example.test",
      recipient: "attacker@example.test",
      tableId: "table-that-must-never-be-read",
    }),
  );

  expect(response.status).toBe(200);
  expect(emailTableExport).toHaveBeenCalledWith({
    to: "owner@matrx.test",
    tableName: "My <edited> view",
    format: "csv",
    content: filteredAndEditedArtifact,
    attachmentFilename: "reviewed-Ω.csv",
    attachmentMime: "text/csv;charset=utf-8",
  });
});

test("rejects malformed artifacts before attempting an email", async () => {
  const response = await POST(
    request({ label: "Table", format: "xlsx", content: "data" }),
  );

  expect(response.status).toBe(400);
  expect(emailTableExport).not.toHaveBeenCalled();
});

test("rejects control characters in a label before it reaches the email header", async () => {
  const response = await POST(
    request({ label: "table\nBcc: attacker@example.test", format: "csv", content: "data" }),
  );

  expect(response.status).toBe(400);
  expect(emailTableExport).not.toHaveBeenCalled();
});

test("rejects a path-like filename and mismatched MIME before attempting an email", async () => {
  const response = await POST(
    request({
      label: "Table",
      format: "csv",
      content: "data",
      filename: "../reviewed.csv",
      mime: "application/json;charset=utf-8",
    }),
  );

  expect(response.status).toBe(400);
  expect(emailTableExport).not.toHaveBeenCalled();
});

test("enforces the byte cap even when Content-Length is absent", async () => {
  const content = "x".repeat(1_000_000);
  const response = await POST(
    new Request("https://www.aimatrx.com/api/export/email-table", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: "Table",
        format: "csv",
        content,
        filename: "reviewed.csv",
        mime: "text/csv;charset=utf-8",
      }),
    }),
  );

  expect(response.status).toBe(413);
  expect(emailTableExport).not.toHaveBeenCalled();
});

test("reports a mail-provider failure honestly", async () => {
  emailTableExport.mockResolvedValue({
    success: false,
    message: "Failed to send email",
    error: "provider unavailable",
  });

  const response = await POST(
    request({
      label: "Table",
      format: "markdown",
      content: "# exact",
      filename: "reviewed.md",
      mime: "text/markdown;charset=utf-8",
    }),
  );
  const body = await response.json();

  expect(response.status).toBe(500);
  expect(body).toEqual({
    success: false,
    msg: "Failed to send email",
    error: "provider unavailable",
  });
});

export {};
