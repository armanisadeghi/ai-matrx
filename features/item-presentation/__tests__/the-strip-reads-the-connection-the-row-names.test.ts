/**
 * 🚨 THE HEALTH STRIP ANSWERS FOR THE CONNECTION THE ROW NAMES — AND THE ROW
 * NAMES IT IN THE LIVE COLUMN, `synced_via_connection_id`.
 *
 * THE DEFECT THIS PINS (lane F-51, escalated from U-W2). `sourceHealth.ts` looked
 * for the connected account in `refreshed_via_account` / `connection_id` /
 * `account_id` — three spellings NO table in `types/database.types.ts` carries.
 * Both synced tables that exist (`workbench.google_document`,
 * `communication.calendar_event`) spell it `synced_via_connection_id`, so the
 * producer found nothing on every real row, silently fell back to ranking the
 * accounts by how many products they hold, and answered for whichever account had
 * the biggest collection. Each registration then paid a PROJECTION to rename its
 * own column into the fiction — and a projection is exactly what nobody adds for
 * the next synced table.
 *
 * Both accounts below hold Calendar and both are healthy, so the ranking cannot
 * be what makes this test pass: the only thing that distinguishes them is WHICH
 * account's recorded last call the strip reports. The row names the account with
 * FEWER products, which the ranking would never choose.
 */

import type { DetailRow } from "@/lib/detail/types";

import { sourceHealthProducerFor } from "../sourceHealth";

const IDENTITY = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];
const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.owned.readonly";
const DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";
const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";
const CONTACTS = "https://www.googleapis.com/auth/contacts.readonly";
const TASKS = "https://www.googleapis.com/auth/tasks.readonly";

/** When each account last had Calendar answer — the fact that identifies it. */
const NAMED_ACCOUNT_LAST_CALL = "2026-09-17T09:15:00Z";
const BIGGER_ACCOUNT_LAST_CALL = "2026-09-18T08:00:00Z";

function connection(
  id: string,
  email: string,
  scopes: string[],
  calendarLastCallAt: string,
) {
  return {
    id,
    owner_type: "user" as const,
    owner_user_id: "u1",
    organization_id: null,
    provider: "google" as const,
    provider_subject: `sub-${id}`,
    account_email: email,
    account_name: email,
    scopes: [...IDENTITY, ...scopes],
    status: "connected" as const,
    last_verified_at: "2026-09-18T07:00:00Z",
    last_error: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-09-18T07:00:00Z",
    metadata: {},
    credential_present: true,
    credential_stable: true,
    health: "connected" as const,
    capability_health: {
      __kind: "connection_capability_health",
      calendar: { last_success: { at: calendarLastCallAt, action: "calendar.agenda" } },
    },
  };
}

/** Holds Calendar and nothing else. The row names THIS one. */
const NAMED = connection(
  "11111111-aaaa-bbbb-cccc-000000000001",
  "calendar-only@aimatrx.com",
  [CALENDAR_SCOPE],
  NAMED_ACCOUNT_LAST_CALL,
);

/** Holds Calendar too, plus four more products — the ranking's favourite. */
const BIGGER = connection(
  "22222222-aaaa-bbbb-cccc-000000000002",
  "everything@aimatrx.com",
  [CALENDAR_SCOPE, DRIVE_FILE, GMAIL_SEND, CONTACTS, TASKS],
  BIGGER_ACCOUNT_LAST_CALL,
);

jest.mock("@/features/marketing/google/service", () => ({
  // Inventory order deliberately puts the small account first, so the test
  // cannot pass merely because the ranking happened to return it.
  listGoogleConnectionInventory: jest.fn(async () => ({
    connections: [NAMED, BIGGER],
    resources: [],
  })),
  listGoogleCapabilities: jest.fn(async () => [
    "drive_files",
    "docs",
    "sheets",
    "slides",
    "gmail_send",
    "calendar",
    "contacts",
    "tasks",
  ].map((key) => ({
    key,
    rollout_phase: "available",
    eligible: true,
    required_scopes: [],
    admission_error: null,
  }))),
}));

/**
 * A `communication.calendar_event` row as the table really spells it, minus the
 * columns the strip does not read. No projection: this is the row.
 */
const EVENT: DetailRow = {
  id: "aaaaaaaa-1111-2222-3333-444444444444",
  provider: "google",
  external_id: "g-event-1",
  title: "Consult",
  // Deliberately absent: `synced_at`. When the row carries no freshness of its
  // own the strip reports the ACCOUNT's last recorded call, which is how this
  // test can see which account answered.
  synced_via_connection_id: NAMED.id,
};

function ctx() {
  return {
    ref: { type: "calendar_event", id: EVENT.id as string },
    signal: new AbortController().signal,
  };
}

describe("a synced record's health strip and the connection its row names", () => {
  it("answers for the account in `synced_via_connection_id`, not the account holding the most products", async () => {
    const health = await sourceHealthProducerFor("calendar_event")(EVENT, ctx());
    expect(health).not.toBeNull();
    expect(health?.lastRefreshedAt).toBe(NAMED_ACCOUNT_LAST_CALL);
    expect(health?.lastRefreshedAt).not.toBe(BIGGER_ACCOUNT_LAST_CALL);
  });

  it("still names the product's own grant, so the strip reads Calendar and not the account", async () => {
    const health = await sourceHealthProducerFor("calendar_event")(EVENT, ctx());
    expect(health?.source).toBe("Google Calendar");
    expect(health?.grant).toBe("ok");
  });

  it("falls back to the product-holding account when the row names no connection", async () => {
    const orphan: DetailRow = { ...EVENT, synced_via_connection_id: null };
    const health = await sourceHealthProducerFor("calendar_event")(orphan, ctx());
    // Nothing is invented: it is one of the two real accounts, and it is a
    // Calendar holder, so the strip never claims the grant is missing while an
    // account that holds it sits beside it.
    expect(health?.grant).toBe("ok");
    expect([NAMED_ACCOUNT_LAST_CALL, BIGGER_ACCOUNT_LAST_CALL]).toContain(
      health?.lastRefreshedAt,
    );
  });
});
