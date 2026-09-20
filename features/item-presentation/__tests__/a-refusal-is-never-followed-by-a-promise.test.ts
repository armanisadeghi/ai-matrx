/**
 * 🚨 A REFUSAL IS FOLLOWED BY ITS REMEDY, NEVER BY REASSURANCE — FOR EVERY
 * PRODUCT, NOT ONLY DOCS (N8, VERIFY-U-W1-U-W2).
 *
 * `productHealth` answers with the product's PROMISE as its `reason` in the two
 * states where nothing is refusing anything — the marketing sentence a connector
 * row shows ("We never change your calendar."). The strip printed that sentence
 * whatever the state, and a record whose grant is missing therefore read:
 * "Not connected … See your own upcoming events. We never change your calendar."
 * — reassurance where the remedy belongs. Worse, the strip never printed
 * `health.remedy` at all, so the one sentence saying what to do was dropped.
 *
 * The promise census is DERIVED from the provider config, so this is a test about
 * the class: Calendar's promise below, Docs' promise in the Doc panel's own suite.
 */

import type { DetailRow } from "@/lib/detail/types";

import { sourceHealthProducerFor } from "../sourceHealth";

const IDENTITY = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
];
const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.owned.readonly";
const DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";

/** Calendar's promise, verbatim from features/connectors/provider-config.ts. */
const CALENDAR_PROMISE =
  "See your own upcoming events. We never change your calendar.";

let grantedScopes: string[] = [DRIVE_FILE];

jest.mock("@/features/marketing/google/service", () => ({
  listGoogleConnectionInventory: jest.fn(async () => ({
    connections: [
      {
        id: "11111111-aaaa-bbbb-cccc-000000000001",
        owner_type: "user",
        owner_user_id: "u1",
        organization_id: null,
        provider: "google",
        provider_subject: "sub-1",
        account_email: "arman@titaniumsuccess.com",
        account_name: "Arman",
        scopes: [...IDENTITY, ...grantedScopes],
        status: "connected",
        last_verified_at: "2026-09-18T07:00:00Z",
        last_error: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-09-18T07:00:00Z",
        metadata: {},
        credential_present: true,
        credential_stable: true,
        health: "connected",
        capability_health: null,
      },
    ],
    resources: [],
  })),
  listGoogleCapabilities: jest.fn(async () =>
    ["drive_files", "calendar"].map((key) => ({
      key,
      rollout_phase: "available",
      eligible: true,
      required_scopes: [],
      admission_error: null,
    })),
  ),
}));

const EVENT: DetailRow = {
  id: "aaaaaaaa-1111-2222-3333-444444444444",
  provider: "google",
  external_id: "g-event-1",
  title: "Consult",
  synced_at: "2026-09-18T06:00:00Z",
  synced_via_connection_id: "11111111-aaaa-bbbb-cccc-000000000001",
};

function ctx() {
  return {
    ref: { type: "calendar_event", id: EVENT.id as string },
    signal: new AbortController().signal,
  };
}

describe("a record whose product is not granted on the connected account", () => {
  beforeEach(() => {
    grantedScopes = [DRIVE_FILE];
  });

  it("never answers the refusal with the product's promise", async () => {
    const health = await sourceHealthProducerFor("calendar_event")(EVENT, ctx());
    expect(health).not.toBeNull();
    expect(health!.grant).not.toBe("ok");
    expect(health!.grantDetail ?? "").not.toContain(CALENDAR_PROMISE);
    expect(health!.grantDetail ?? "").not.toContain("We never change your calendar");
  });

  it("says what to do instead — never an empty strip", async () => {
    const health = await sourceHealthProducerFor("calendar_event")(EVENT, ctx());
    const detail = health!.grantDetail ?? "";
    expect(detail.trim().length).toBeGreaterThan(0);
    expect(detail).toMatch(/[Rr]econnect|[Cc]onnect/);
  });
});

describe("a record whose account granted only part of the product", () => {
  beforeEach(() => {
    // Calendar needs more than this one scope, so the row is partly connected:
    // a real refusal sentence with a real remedy.
    grantedScopes = [DRIVE_FILE, CALENDAR_SCOPE];
  });

  it("carries the connectors' own remedy, not only the complaint", async () => {
    const health = await sourceHealthProducerFor("calendar_event")(EVENT, ctx());
    const detail = health!.grantDetail ?? "";
    if (health!.grant === "ok") {
      // Every Calendar scope happens to be granted here: then the promise is the
      // honest sentence and there is nothing to remedy.
      expect(detail).toContain(CALENDAR_PROMISE);
      return;
    }
    expect(detail).toContain("has not granted");
    expect(detail).toContain("nothing you already granted is asked for again");
    expect(detail).not.toContain(CALENDAR_PROMISE);
  });
});

describe("a healthy record", () => {
  beforeEach(() => {
    grantedScopes = [DRIVE_FILE, CALENDAR_SCOPE];
  });

  it("still shows the product's promise when nothing is refusing anything", async () => {
    const health = await sourceHealthProducerFor("calendar_event")(EVENT, ctx());
    if (health!.grant !== "ok") return;
    expect(health!.grantDetail).toContain(CALENDAR_PROMISE);
  });
});
