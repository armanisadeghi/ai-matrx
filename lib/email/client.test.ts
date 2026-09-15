/** @jest-environment node */

const providerSend = jest.fn();

jest.mock("resend", () => ({
  Resend: jest.fn(() => ({ emails: { send: providerSend } })),
}));

test("passes attachment bytes unchanged to the Resend email payload", async () => {
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "AI Matrx <mail@matrx.test>";
  providerSend.mockResolvedValue({ data: { id: "email-1" }, error: null });

  const { sendEmail } = await import("./client");
  const bytes = Buffer.from("Zoë,\"'=SUM(1,1)\"\n", "utf8");
  await expect(
    sendEmail({
      to: "owner@matrx.test",
      subject: "Exact attachment",
      html: "<p>body</p>",
      attachments: [{
        filename: "table.csv",
        content: bytes,
        contentType: "text/csv; charset=utf-8",
      }],
    }),
  ).resolves.toMatchObject({ success: true });

  const [payload] = providerSend.mock.calls[0] as [{
    attachments: Array<{ filename?: string; content?: Buffer; contentType?: string }>;
  }];
  expect(payload.attachments[0]).toMatchObject({
    filename: "table.csv",
    contentType: "text/csv; charset=utf-8",
  });
  expect(payload.attachments[0].content?.toString("utf8")).toBe(
    "Zoë,\"'=SUM(1,1)\"\n",
  );
});

export {};
