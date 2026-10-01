import {
  classifyPerson,
  withOwnerCategory,
  type PersonSignals,
} from "./personSegments";
import { rowInSegment } from "./accountSegments";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

const base: PersonSignals = {
  email: "someone@gmail.com",
  isAnonymous: false,
  adminLevel: null,
  emailConfirmed: true,
  lastSignInAt: "2026-09-29T00:00:00Z",
  userAgent: CHROME_MAC,
  landingHost: "www.aimatrx.com",
  referrer: null,
  referrerState: "direct_or_withheld",
  aiRequests: 0,
  aiRequests7d: 0,
};

describe("classifyPerson — kind", () => {
  // The user agents below are the live shapes measured 2026-09-30.
  it.each([
    [{ userAgent: CHROME_MAC.replace("Chrome/", "HeadlessChrome/") }, "bot"],
    [{ userAgent: "curl/8.7.1" }, "bot"],
    [{ userAgent: "python-httpx/0.28.1" }, "bot"],
    [{ userAgent: `${CHROME_MAC} Claude/2.9939.2` }, "bot"],
    [{ userAgent: "MatrxExtendGuestIncidentProbe/1" }, "test"],
    [{ userAgent: "Mozilla/5.0 (X11; Linux x64) HappyDOM/20.14.5" }, "test"],
    [{ landingHost: "sdt22recipient.localhost:3001" }, "test"],
    [{ landingHost: "localhost:3001" }, "test"],
    [{ email: "admin@admin.com", adminLevel: "super_admin" }, "test"],
    [{ email: "proof@matrx-test.invalid" }, "test"],
    [{ adminLevel: "developer" }, "team"],
    [{ adminLevel: "developer", landingHost: "s1.localhost:3001" }, "team"],
    [
      { email: "l.o.xu.m.a.w.50.3@gmail.com", emailConfirmed: false, lastSignInAt: null },
      "bot",
    ],
    [{ email: "l.o.xu.m.a.w.50.3@gmail.com" }, "person"],
    [{ email: "jane.q.doe@gmail.com", emailConfirmed: false, lastSignInAt: null }, "person"],
    [{}, "person"],
    [{ userAgent: null }, "person"],
  ] as const)("%o → %s", (override, kind) => {
    expect(classifyPerson({ ...base, ...override }).kind).toBe(kind);
  });
});

describe("classifyPerson — stage", () => {
  it.each([
    [{ isAnonymous: true, email: null }, "guest"],
    [{ isAnonymous: true, email: null, aiRequests: 3 }, "guest_used_ai"],
    [{ lastSignInAt: null }, "signed_up"],
    [{}, "signed_in"],
    [{ aiRequests: 12 }, "used_ai"],
    [{ aiRequests: 12, aiRequests7d: 2 }, "active"],
  ] as const)("%o → %s", (override, stage) => {
    expect(classifyPerson({ ...base, ...override }).stage).toBe(stage);
  });
});

describe("rowInSegment", () => {
  const person = {
    kind: "person",
    is_anonymous: false,
    ai_requests: 0,
    email_confirmed: true,
    last_sign_in_at: "2026-09-29T00:00:00Z",
  } as const;
  it("defaults to signed-up people and keeps bots, tests and guests out", () => {
    expect(rowInSegment(person, "people")).toBe(true);
    expect(rowInSegment({ ...person, is_anonymous: true }, "people")).toBe(false);
    expect(rowInSegment({ ...person, kind: "bot" }, "people")).toBe(false);
    expect(rowInSegment({ ...person, kind: "test" }, "bots_tests")).toBe(true);
    const unverified = { ...person, email_confirmed: false, last_sign_in_at: null };
    expect(rowInSegment(unverified, "people")).toBe(false);
    expect(rowInSegment(unverified, "unverified")).toBe(true);
  });
  it("counts guests who used AI as using AI", () => {
    expect(
      rowInSegment({ ...person, is_anonymous: true, ai_requests: 1 }, "using_ai"),
    ).toBe(true);
  });
});

describe("withOwnerCategory", () => {
  const row = { kind: "person", kind_reason: "Ordinary browser" } as const;
  it("lets the owner's category win over the automatic kind", () => {
    expect(withOwnerCategory(row, "friend", "Friend")).toEqual({
      kind: "circle",
      kind_reason: "Your category: Friend",
    });
    expect(withOwnerCategory({ ...row, kind: "bot" }, "employee").kind).toBe("team");
    expect(withOwnerCategory(row, "test").kind).toBe("test");
  });
  it("keeps the automatic kind for categories that say nothing about who it is", () => {
    expect(withOwnerCategory(row, "unknown")).toBe(row);
    expect(withOwnerCategory({ ...row, kind: "bot" }, "real_user").kind).toBe("bot");
    expect(withOwnerCategory(row, undefined)).toBe(row);
  });
});
