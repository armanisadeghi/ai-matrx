const sendEmail = jest.fn();

jest.mock("./client", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  emailTemplates: {},
}));

jest.mock("marked", () => ({ marked: jest.fn() }));

import { emailTableExport } from "./exportService";

beforeEach(() => {
  jest.clearAllMocks();
  sendEmail.mockResolvedValue({ success: true });
});

test("preserves the full artifact while escaping its label in email HTML", async () => {
  const content = `# Export\n\n${"x".repeat(50_001)}`;

  await expect(
    emailTableExport({
      to: "owner@matrx.test",
      tableName: "My <edited> table",
      format: "markdown",
      content,
    }),
  ).resolves.toMatchObject({ success: true });

  const [mail] = sendEmail.mock.calls[0] as [{ html: string; text: string }];
  expect(mail.html).toContain("My &lt;edited&gt; table");
  expect(mail.html).not.toContain("My <edited> table");
  expect(mail.text).toContain(content);
  expect(mail.text).not.toContain("... (truncated)");
});

export {};
