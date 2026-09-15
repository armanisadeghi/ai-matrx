import type { Artifact } from "@ai-matrx/kit/content-transfer";

import { sendAlchemyEmail } from "./alchemy-email";

const artifact = (overrides: Partial<Artifact> = {}): Artifact => ({
  snapshotId: "snapshot-1",
  draftRevision: 2,
  format: "markdown",
  plainText: "# Filtered and edited\n\nOnly this revision is emailed.",
  omissions: [],
  ...overrides,
});

describe("sendAlchemyEmail", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: jest.fn(),
    });
  });

  it("sends the sealed artifact's exact text and caller label", async () => {
    const fetchMock = jest.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as Response);
    const controller = new AbortController();

    await expect(
      sendAlchemyEmail(artifact(), {
        label: "Current filtered view",
        signal: controller.signal,
      }),
    ).resolves.toMatchObject({ status: "success", delivered: "action" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/export/email-table",
      expect.objectContaining({
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          label: "Current filtered view",
          format: "markdown",
          content: "# Filtered and edited\n\nOnly this revision is emailed.",
        }),
      }),
    );
  });

  it("does not make a request for an unsupported artifact format", async () => {
    const fetchMock = jest.mocked(globalThis.fetch);

    await expect(
      sendAlchemyEmail(artifact({ format: "html" }), {
        label: "Prepared content",
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      status: "error",
      code: "unsupported_email_format",
      retryable: false,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the server failure without claiming delivery", async () => {
    jest.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ success: false, msg: "Email is not configured" }),
    } as Response);

    await expect(
      sendAlchemyEmail(artifact(), {
        label: "Prepared content",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: "error",
      code: "email_send_failed",
      message: "Email is not configured",
      retryable: true,
    });
  });
});
