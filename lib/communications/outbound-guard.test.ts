/** @jest-environment node */
/**
 * A server wired to a copy of production never reaches a real person or real provider state.
 *
 * Drives the REAL seams (sendEmail, test-email, sendSms, sendVerification, purchasePhoneNumber,
 * updateAllWebhookUrls, slack-proxy) with the providers mocked, and sets the server's database
 * identity through its one source, `NEXT_PUBLIC_SUPABASE_URL`. Every refusal has a positive
 * control on the SAME seam with production's URL, so a seam that simply stopped calling its
 * provider cannot pass. No live database, no live provider.
 */
import { readFileSync, existsSync } from "fs";
import path from "path";

import {
  LOOPBACK_TEST_HANDSETS,
  PRODUCTION_REF,
  SUPPRESSED_ON_CLONE,
  serverDatabase,
} from "./outbound-guard";

const CLONE_URL = "https://nwvvyzngqicrmnbuzauy.supabase.co";
const PROD_URL = "https://db.matrxserver.com";
const REAL_EMAIL = "someone@gmail.com";
const REAL_PHONE = "+13105550142";
const LOOPBACK = "+19498072145";

const resendSend = jest.fn();
jest.mock("resend", () => ({ Resend: jest.fn(() => ({ emails: { send: resendSend } })) }));

const messagesCreate = jest.fn();
const verificationsCreate = jest.fn();
const numbersCreate = jest.fn();
const numberUpdate = jest.fn();
jest.mock("@/lib/sms/client", () => {
  const incomingPhoneNumbers = Object.assign((_sid: string) => ({ update: numberUpdate }), {
    create: numbersCreate,
  });
  return {
    getTwilioClient: () => ({
      messages: { create: messagesCreate },
      verify: { v2: { services: () => ({ verifications: { create: verificationsCreate } }) } },
      incomingPhoneNumbers,
    }),
    getMessagingServiceSid: () => "MG_test",
    getVerifyServiceSid: () => "VA_test",
    getAppBaseUrl: () => "https://preview.localhost",
  };
});
jest.mock("@/lib/sms/test-handset-otp", () => ({
  isDesignatedTestHandset: jest.fn(async () => false),
  sendTestHandsetVerification: jest.fn(),
  checkTestHandsetVerification: jest.fn(),
}));
jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient: () => ({
    schema: () => ({
      from: () => ({
        insert: async () => ({ error: null }),
        select: () => ({ eq: async () => ({ data: [{ twilio_sid: "PN_live" }] }) }),
      }),
    }),
  }),
}));

const fetchMock = jest.fn();

function wire(url: string | undefined) {
  if (url) process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "AI Matrx <noreply@aimatrx.com>";
  resendSend.mockResolvedValue({ data: { id: "email-1" }, error: null });
  messagesCreate.mockResolvedValue({ sid: "SM1", status: "queued" });
  verificationsCreate.mockResolvedValue({ status: "pending" });
  numbersCreate.mockResolvedValue({ sid: "PN1", phoneNumber: "+15555550100", friendlyName: "x", capabilities: {} });
  numberUpdate.mockResolvedValue({});
  fetchMock.mockResolvedValue({ json: async () => ({ ok: true }) });
  global.fetch = fetchMock as unknown as typeof fetch;
});

// ── the identity answer ─────────────────────────────────────────────────────

test("production only when the Supabase URL is production's", () => {
  expect(serverDatabase({ NEXT_PUBLIC_SUPABASE_URL: PROD_URL } as NodeJS.ProcessEnv).isProduction).toBe(true);
  expect(
    serverDatabase({ NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co` } as NodeJS.ProcessEnv).isProduction,
  ).toBe(true);
  const clone = serverDatabase({ NEXT_PUBLIC_SUPABASE_URL: CLONE_URL } as NodeJS.ProcessEnv);
  expect(clone).toMatchObject({ isProduction: false, ref: "nwvvyzngqicrmnbuzauy" });
  expect(serverDatabase({ NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" } as NodeJS.ProcessEnv).isProduction).toBe(false);
  expect(serverDatabase({} as NodeJS.ProcessEnv).isProduction).toBe(false);
});

test("the loopback handsets agree with aidream's single home", () => {
  const home = path.resolve(__dirname, "../../../aidream/aidream/designated_test_recipients.py");
  if (!existsSync(home)) {
    // CI without the aidream checkout: say so, never pass silently.
    console.warn(`UNMEASURED: ${home} is not checked out; loopback handset agreement not verified`);
    return;
  }
  const source = readFileSync(home, "utf8");
  const block = source.match(/TEST_HANDSET_BY_ACCOUNT[^=]*=\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const numbers = new Set([...block.matchAll(/"(\+\d{8,15})"/g)].map((m) => m[1]));
  expect(numbers.size).toBeGreaterThan(0);
  expect([...LOOPBACK_TEST_HANDSETS].sort()).toEqual([...numbers].sort());
});

// ── email ───────────────────────────────────────────────────────────────────

test.each([REAL_EMAIL, "test@test.com"])("email on the clone to %s is refused before Resend", async (to) => {
  wire(CLONE_URL);
  const { sendEmail } = await import("@/lib/email/client");
  const result = await sendEmail({ to, subject: "s", html: "<p>b</p>" });
  expect(resendSend).not.toHaveBeenCalled();
  expect(result).toMatchObject({ success: false, suppressed: true, error: { code: SUPPRESSED_ON_CLONE } });
});

test("email on production reaches Resend", async () => {
  wire(PROD_URL);
  const { sendEmail } = await import("@/lib/email/client");
  await expect(sendEmail({ to: REAL_EMAIL, subject: "s", html: "<p>b</p>" })).resolves.toMatchObject({ success: true });
  expect(resendSend).toHaveBeenCalledTimes(1);
});

test("the test-email route on the clone is refused; on production it sends", async () => {
  const { GET } = await import("@/app/api/test-email/route");
  wire(CLONE_URL);
  const refused = await GET();
  expect(resendSend).not.toHaveBeenCalled();
  expect(await refused.json()).toMatchObject({ success: false, code: SUPPRESSED_ON_CLONE });
  wire(PROD_URL);
  await GET();
  expect(resendSend).toHaveBeenCalledTimes(1);
});

// ── SMS and Twilio Verify ───────────────────────────────────────────────────

test("SMS on the clone to a person is refused before Twilio", async () => {
  wire(CLONE_URL);
  const { sendSms } = await import("@/lib/sms/send");
  const result = await sendSms({ to: REAL_PHONE, body: "hi" });
  expect(messagesCreate).not.toHaveBeenCalled();
  expect(result).toMatchObject({ success: false, errorCode: SUPPRESSED_ON_CLONE });
});

test("SMS on the clone to a loopback handset is sent", async () => {
  wire(CLONE_URL);
  const { sendSms } = await import("@/lib/sms/send");
  await expect(sendSms({ to: LOOPBACK, body: "hi" })).resolves.toMatchObject({ success: true, sid: "SM1" });
  expect(messagesCreate).toHaveBeenCalledTimes(1);
});

test("SMS on production reaches Twilio", async () => {
  wire(PROD_URL);
  const { sendSms } = await import("@/lib/sms/send");
  await expect(sendSms({ to: REAL_PHONE, body: "hi" })).resolves.toMatchObject({ success: true });
  expect(messagesCreate).toHaveBeenCalledTimes(1);
});

test("a Verify code on the clone is refused; on production it is sent", async () => {
  const { sendVerification } = await import("@/lib/sms/verify");
  wire(CLONE_URL);
  await expect(sendVerification(REAL_PHONE)).resolves.toMatchObject({ success: false, errorCode: SUPPRESSED_ON_CLONE });
  expect(verificationsCreate).not.toHaveBeenCalled();
  wire(PROD_URL);
  await expect(sendVerification(REAL_PHONE)).resolves.toMatchObject({ success: true });
  expect(verificationsCreate).toHaveBeenCalledTimes(1);
});

// ── Twilio account writes ───────────────────────────────────────────────────

test("buying a number on the clone is refused; on production it is bought", async () => {
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  const { purchasePhoneNumber } = await import("@/lib/sms/numbers");
  wire(CLONE_URL);
  await expect(purchasePhoneNumber("org-1", "+15555550100")).resolves.toMatchObject({
    success: false,
    code: SUPPRESSED_ON_CLONE,
  });
  expect(numbersCreate).not.toHaveBeenCalled();
  wire(PROD_URL);
  await expect(purchasePhoneNumber("org-1", "+15555550100")).resolves.toMatchObject({ success: true });
  expect(numbersCreate).toHaveBeenCalledTimes(1);
});

test("repointing production's number webhooks from the clone is refused", async () => {
  const { updateAllWebhookUrls } = await import("@/lib/sms/numbers");
  wire(CLONE_URL);
  await expect(updateAllWebhookUrls()).rejects.toMatchObject({ code: SUPPRESSED_ON_CLONE });
  expect(numberUpdate).not.toHaveBeenCalled();
  wire(PROD_URL);
  await expect(updateAllWebhookUrls()).resolves.toMatchObject({ updated: 1 });
  expect(numberUpdate).toHaveBeenCalledTimes(1);
});

// ── Slack ───────────────────────────────────────────────────────────────────

test("the Slack proxy on the clone is refused; on production it posts", async () => {
  const { POST } = await import("@/app/api/slack-proxy/route");
  const request = () =>
    ({ json: async () => ({ endpoint: "chat.postMessage", payload: { text: "x" }, token: "xoxb" }) }) as never;
  wire(CLONE_URL);
  const refused = await POST(request());
  expect(fetchMock).not.toHaveBeenCalled();
  expect(refused.status).toBe(409);
  expect(await refused.json()).toMatchObject({ code: SUPPRESSED_ON_CLONE });
  wire(PROD_URL);
  await POST(request());
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
