import type { ShareLink } from "@/utils/permissions/shareLinks";
import {
  createSafeShareMessage,
  describeShareLinkAccess,
  describeShareLinkExpiry,
  evaluateShareLinkHandoff,
  shareLinkSecurityStateMatches,
  shareLinkUnavailableReason,
} from "../shareText";

function link(overrides: Partial<ShareLink> = {}): ShareLink {
  return {
    id: "4bd3a1a9-0318-4ce8-ae99-720d6f493a88",
    token: "d1594251038c4cb592610a6cd00417d3",
    shortToken: null,
    permissionLevel: "viewer",
    label: "Fleet dispatch plan",
    expiresAt: "2026-09-23T12:00:00.000Z",
    maxUses: 4,
    useCount: 1,
    isActive: true,
    createdAt: "2026-09-22T11:00:00.000Z",
    lastUsedAt: "2026-09-22T11:30:00.000Z",
    ...overrides,
  };
}

describe("safe share-by-text messages", () => {
  it.each([
    [
      "https://app.matrx.com/s/d1594251038c4cb592610a6cd00417d3",
      "I shared an AI Matrx item with you: https://app.matrx.com/s/d1594251038c4cb592610a6cd00417d3",
    ],
    [
      "https://app.matrx.com/r/4f5c9082",
      "I shared an AI Matrx item with you: https://app.matrx.com/r/4f5c9082",
    ],
  ])(
    "uses the exact canonical URL without adding private resource details",
    (url, expected) => {
      const message = createSafeShareMessage(url);

      expect(message).toBe(expected);
      expect(message).not.toContain("Fleet dispatch plan");
    },
  );
});

describe("canonical link review", () => {
  const now = Date.parse("2026-09-22T12:00:00.000Z");

  // `evaluateShareLinkHandoff` calls `shareLinkUnavailableReason` with no
  // explicit clock, so it falls through to that function's real-wall-clock
  // default. The fixture's `expiresAt` is a fixed instant relative to `now`
  // above — freeze the clock to `now` for this suite so the fixture's
  // "not yet expired" case stays true no matter what day this test runs on,
  // instead of drifting into "expired" once real time passes it.
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
    jest.setSystemTime(now);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("refuses inactive, expired, exhausted, and unverifiable links", () => {
    expect(shareLinkUnavailableReason(link({ isActive: false }), now)).toBe(
      "This link has been turned off.",
    );
    expect(
      shareLinkUnavailableReason(
        link({ expiresAt: "2026-09-22T12:00:00.000Z" }),
        now,
      ),
    ).toBe("This link has expired.");
    expect(shareLinkUnavailableReason(link({ useCount: 4 }), now)).toBe(
      "This link has reached its view limit.",
    );
    expect(
      shareLinkUnavailableReason(link({ expiresAt: "not-a-date" }), now),
    ).toBe("This link's expiry can't be verified.");
  });

  it("allows only a still-live link under its view limit", () => {
    expect(shareLinkUnavailableReason(link({ useCount: 3 }), now)).toBeNull();
    expect(
      shareLinkUnavailableReason(link({ expiresAt: null, maxUses: null }), now),
    ).toBeNull();
  });

  it("rejects a revoked refreshed link before reporting changed review details", () => {
    expect(
      evaluateShareLinkHandoff(
        link(),
        link({ isActive: false, token: "rotated-token" }),
      ),
    ).toEqual({
      status: "unavailable",
      reason: "This link has been turned off.",
    });
    expect(
      evaluateShareLinkHandoff(link(), link({ permissionLevel: "editor" })),
    ).toEqual({ status: "changed" });
    expect(evaluateShareLinkHandoff(link(), link())).toEqual({
      status: "ready",
    });
  });

  it("requires another review when access, expiry, or view count changed", () => {
    const reviewed = link();

    expect(shareLinkSecurityStateMatches(reviewed, link())).toBe(true);
    expect(
      shareLinkSecurityStateMatches(reviewed, link({ token: "changed-token" })),
    ).toBe(false);
    expect(
      shareLinkSecurityStateMatches(
        reviewed,
        link({ shortToken: "changed-alias" }),
      ),
    ).toBe(false);
    expect(
      shareLinkSecurityStateMatches(
        reviewed,
        link({ permissionLevel: "editor" }),
      ),
    ).toBe(false);
    expect(
      shareLinkSecurityStateMatches(reviewed, link({ expiresAt: null })),
    ).toBe(false);
    expect(shareLinkSecurityStateMatches(reviewed, link({ useCount: 2 }))).toBe(
      false,
    );
  });

  it("shows the actual access level and expiry to the sharer", () => {
    expect(describeShareLinkAccess("viewer")).toBe(
      "Anyone with the link: viewer access",
    );
    expect(describeShareLinkExpiry(null)).toBe("Does not expire");
    expect(describeShareLinkExpiry("2026-09-23T12:00:00.000Z")).toContain(
      "Expires ",
    );
  });
});
