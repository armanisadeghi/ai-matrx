/** @jest-environment node */

const getUser = jest.fn();
const emailTableExport = jest.fn();

jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: () => getUser() } }),
}));

jest.mock("@/lib/email/exportService", () => ({
  emailTableExport: (...args: unknown[]) => emailTableExport(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST } = require("./route") as typeof import("./route");

function request(body: unknown) {
  return new Request("https://www.aimatrx.com/api/export/email-table", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({
    data: { user: { email: "owner@matrx.test" } },
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
  });
});

test("rejects malformed artifacts before attempting an email", async () => {
  const response = await POST(
    request({ label: "Table", format: "xlsx", content: "data" }),
  );

  expect(response.status).toBe(400);
  expect(emailTableExport).not.toHaveBeenCalled();
});

test("reports a mail-provider failure honestly", async () => {
  emailTableExport.mockResolvedValue({
    success: false,
    message: "Failed to send email",
    error: "provider unavailable",
  });

  const response = await POST(
    request({ label: "Table", format: "markdown", content: "# exact" }),
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
