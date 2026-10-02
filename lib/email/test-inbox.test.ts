/** @jest-environment node */
/**
 * A test account's email goes to info@aimatrx.com, never to admin.com / test.com — proven through
 * the REAL `sendEmail` seam with only Resend mocked, reading the payload Resend would receive.
 */
import { readFileSync, existsSync } from "fs";
import path from "path";

import {
  DESIGNATED_TEST_INBOX,
  ORIGINAL_RECIPIENT_HEADER,
  TEST_ACCOUNT_USER_IDS,
} from "@/lib/communications/test-inbox";

const providerSend = jest.fn();
jest.mock("resend", () => ({ Resend: jest.fn(() => ({ emails: { send: providerSend } })) }));

beforeEach(() => {
  providerSend.mockReset().mockResolvedValue({ data: { id: "email-1" }, error: null });
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "AI Matrx <noreply@aimatrx.com>";
  // Resend is mocked; declare production identity so the clone outbound guard lets it through.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.matrxserver.com";
});

async function send(to: string | string[]) {
  const { sendEmail } = await import("./client");
  await expect(
    sendEmail({ to, subject: "Ana accepted your invitation", html: "<p>b</p>" }),
  ).resolves.toMatchObject({ success: true });
  return providerSend.mock.calls[0][0] as {
    to: string[];
    subject: string;
    headers?: Record<string, string>;
  };
}

test.each(["admin@admin.com", "Test Bot <TEST@test.com>"])(
  "email to the test account %s goes to the test inbox, named",
  async (to) => {
    const payload = await send(to);
    expect(payload.to).toEqual([DESIGNATED_TEST_INBOX]);
    const original = to.includes("<") ? "test@test.com" : to;
    expect(payload.subject).toContain(original);
    expect(payload.subject).toContain("Ana accepted your invitation");
    expect(payload.headers?.[ORIGINAL_RECIPIENT_HEADER]).toBe(original);
  },
);

test("a mixed list redirects only the test account", async () => {
  const payload = await send(["host@example.org", "admin@admin.com", "test@test.com"]);
  expect(payload.to).toEqual(["host@example.org", DESIGNATED_TEST_INBOX]);
  expect(payload.headers?.[ORIGINAL_RECIPIENT_HEADER]).toBe("admin@admin.com, test@test.com");
});

test("email to a real person is untouched", async () => {
  const payload = await send("host@example.org");
  expect(payload.to).toEqual(["host@example.org"]);
  expect(payload.subject).toBe("Ana accepted your invitation");
  expect(payload.headers).toBeUndefined();
});

test("the test-account list agrees with aidream's designated_test_recipients.py", () => {
  const home = path.resolve(__dirname, "../../../aidream/aidream/designated_test_recipients.py");
  if (!existsSync(home)) {
    console.warn(`UNMEASURED: ${home} is not checked out; test-account agreement not verified`);
    return;
  }
  const source = readFileSync(home, "utf8");
  const block = source.match(/TEST_ACCOUNT_USER_IDS[^=]*=\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const pairs = Object.fromEntries(
    [...block.matchAll(/"([^"]+@[^"]+)":\s*"([0-9a-f-]{36})"/g)].map((m) => [m[1], m[2]]),
  );
  expect(Object.keys(pairs).length).toBeGreaterThan(0);
  expect(pairs).toEqual(TEST_ACCOUNT_USER_IDS);
  expect(source).toContain(`DESIGNATED_TEST_INBOX: Final[str] = "${DESIGNATED_TEST_INBOX}"`);
});

export {};
