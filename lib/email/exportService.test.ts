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

test("attaches the full UTF-8 artifact while escaping its label in email HTML", async () => {
  const content = "name,formula\nZoë,\"'=SUM(1,1)\"\n";

  await expect(
    emailTableExport({
      to: "owner@matrx.test",
      tableName: "My <edited> table",
      format: "csv",
      content,
      attachmentFilename: "reviewed-Ω.csv",
      attachmentMime: "text/csv;charset=utf-8",
    }),
  ).resolves.toMatchObject({ success: true });

  const [mail] = sendEmail.mock.calls[0] as [{
    html: string;
    text: string;
    attachments: Array<{ filename: string; content: Buffer; contentType: string }>;
  }];
  expect(mail.html).toContain("My &lt;edited&gt; table");
  expect(mail.html).not.toContain("My <edited> table");
  expect(mail.text).toContain(content);
  expect(mail.attachments).toHaveLength(1);
  expect(mail.attachments[0]).toMatchObject({
    filename: "reviewed-Ω.csv",
    contentType: "text/csv;charset=utf-8",
  });
  expect(mail.attachments[0].content.toString("utf8")).toBe(content);
});

export {};
