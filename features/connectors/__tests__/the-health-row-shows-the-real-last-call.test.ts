/**
 * THE HEALTH ROW SHOWS THE REAL LAST CALL (VERIFY-U-P2 D2, closed here).
 *
 * PLAN §5.3 promises, per connected account and per product: "the last
 * successful call, the last refusal (what and why)". Until the recording seam
 * shipped, the server kept ONE account-level `last_verified_at` and ONE
 * account-level `last_error`, so the rows modelled both fields and carried
 * null. It now records, per capability, the last call Google answered and the
 * last call Google refused — with a classified code, a person-facing sentence
 * and the HTTP status — in
 * `users.integration_connections.capability_health`.
 *
 * THE FIXTURES BELOW ARE THE LIVE SHAPE, not a convenient one:
 *   • `LIVE_DEFAULT` is byte-for-byte what all ELEVEN live Google connections
 *     carried when this was built (read 2026-09-17 through the Supabase MCP on
 *     project brsgrqvjdzwihsvnfqkf): the bare `__kind` default, nothing else.
 *     A row over it must say "no calls recorded yet" — never a green line.
 *   • the populated fixtures are the exact object
 *     `aidream/aidream/services/google_integrations/call_health.py` writes:
 *     `{"<capability>": {"last_success": {"at","action"},
 *       "last_refusal": {"at","action","code","sentence","http_status"}}}`.
 *
 * 🚨 The `__kind` marker is DATA: it is carried through the parse and ignored
 * as a capability, never stripped and never treated as a product.
 */

import {
  GOOGLE_CAPABILITY_HEALTH_KIND,
  googleActivityByProduct,
  parseGoogleCapabilityHealth,
} from "../google-capability-health";
import {
  accountHealth,
  productHealth,
  refusalDisposition,
  type ConnectorAccount,
  type ConnectorCapabilityRollout,
} from "../health";
import { GOOGLE_CONNECTOR_PROVIDER, productByKey } from "../provider-config";

const provider = GOOGLE_CONNECTOR_PROVIDER;

const IDENTITY = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];
const DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";
const DOCS = "https://www.googleapis.com/auth/documents";
const SHEETS = "https://www.googleapis.com/auth/spreadsheets";
const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";

const LIVE: ConnectorCapabilityRollout[] = [
  "drive_files",
  "docs",
  "sheets",
  "gmail_send",
  "calendar",
  "contacts",
  "tasks",
  "search_console",
  "analytics",
  "tag_manager",
  "youtube",
  "youtube_analytics",
].map((capabilityKey) => ({
  capabilityKey,
  phase: "available" as const,
  eligible: true,
  requiredScopes: [],
  ineligibleReason: null,
}));

/** Exactly what every live Google connection carried on 2026-09-17. */
const LIVE_DEFAULT = { __kind: GOOGLE_CAPABILITY_HEALTH_KIND };

function account(overrides: Partial<ConnectorAccount> = {}): ConnectorAccount {
  return {
    id: "c4",
    label: "info@aimatrx.com",
    ownerKind: "person",
    organizationId: null,
    providerSubject: "sub-c4",
    grantedScopes: [...IDENTITY, DRIVE_FILE, DOCS, SHEETS, GMAIL_SEND],
    usable: true,
    statusLabel: "Connected",
    statusReason: "This account can authorize Google calls.",
    statusRemedy: null,
    lastVerifiedAt: "2026-09-14T22:11:00Z",
    lastRefusalSentence: null,
    ...overrides,
  };
}

const files = productByKey(provider, "workspace_files")!;

describe("reading the column", () => {
  it("reads the live default as NOTHING recorded, and keeps the marker", () => {
    const read = parseGoogleCapabilityHealth(LIVE_DEFAULT);
    expect(read.recognized).toBe(true);
    expect(read.kind).toBe(GOOGLE_CAPABILITY_HEALTH_KIND);
    expect(read.capabilities).toEqual({});
    expect(googleActivityByProduct(provider, read)).toEqual({});
  });

  it("never treats the marker as a capability", () => {
    const read = parseGoogleCapabilityHealth({
      ...LIVE_DEFAULT,
      docs: {
        last_success: { at: "2026-09-17T09:00:00Z", action: "docs.read" },
      },
    });
    expect(Object.keys(read.capabilities)).toEqual(["docs"]);
  });

  it("refuses a value it cannot vouch for rather than guessing", () => {
    for (const raw of [null, undefined, 7, "x", {}, { __kind: "something_else" }]) {
      const read = parseGoogleCapabilityHealth(raw);
      expect(read.recognized).toBe(false);
      expect(read.capabilities).toEqual({});
    }
  });

  it("drops half a refusal instead of rendering it", () => {
    const read = parseGoogleCapabilityHealth({
      ...LIVE_DEFAULT,
      // No sentence: nothing a person could act on.
      docs: { last_refusal: { at: "2026-09-17T09:00:00Z", code: "call_failed" } },
      // A code this client does not know — the server moved ahead of it.
      sheets: {
        last_refusal: {
          at: "2026-09-17T09:00:00Z",
          code: "teleported_away",
          sentence: "Something new happened.",
        },
      },
    });
    expect(read.capabilities).toEqual({});
  });
});

describe("folding capabilities into the product the person sees", () => {
  it("shows the MOST RECENT fact across the capabilities behind one product", () => {
    const activity = googleActivityByProduct(
      provider,
      parseGoogleCapabilityHealth({
        ...LIVE_DEFAULT,
        drive_files: {
          last_success: { at: "2026-09-16T08:00:00Z", action: "drive.list" },
        },
        docs: {
          last_success: { at: "2026-09-17T08:00:00Z", action: "docs.read" },
        },
        sheets: {
          last_refusal: {
            at: "2026-09-17T09:30:00Z",
            action: "sheets.read",
            code: "quota_exhausted",
            sentence: "Google is rate-limiting this account for Sheets.",
            http_status: 429,
          },
        },
      }),
    );
    expect(activity.workspace_files).toEqual({
      lastSuccessAt: "2026-09-17T08:00:00Z",
      lastRefusal: {
        message: "Google is rate-limiting this account for Sheets.",
        at: "2026-09-17T09:30:00Z",
        code: "quota_exhausted",
        httpStatus: 429,
      },
      // F-19 / VERIFY-U-P2-R3 N11: the fold now STATES whether the refusal it
      // carries still stands, because only it can compare a capability's refusal
      // with that capability's OWN success. Sheets has never succeeded, so the
      // quota refusal stands — it is self-healing, so the row stays connected
      // with the quota sentence beside it either way.
      refusalStands: true,
    });
    // A product with no recorded call is absent, not zeroed.
    expect(activity.gmail).toBeUndefined();
  });
});

describe("what the row is then allowed to say", () => {
  const rowFor = (health: unknown) =>
    productHealth({
      provider,
      product: files,
      account: account({
        activity: googleActivityByProduct(
          provider,
          parseGoogleCapabilityHealth(health),
        ),
      }),
      rollout: LIVE,
    });

  it("says nothing was recorded while the column is at its live default", () => {
    const row = rowFor(LIVE_DEFAULT);
    expect(row.state).toBe("connected");
    expect(row.lastSuccessAt).toBeNull();
    expect(row.lastRefusal).toBeNull();
    expect(row.activityNote).toBeNull();
    // The account HAS a timestamp; the product must not borrow it.
    expect(row.lastSuccessAt).not.toBe(account().lastVerifiedAt);
  });

  it("shows the real last success on a product that worked", () => {
    const row = rowFor({
      ...LIVE_DEFAULT,
      docs: { last_success: { at: "2026-09-17T08:00:00Z", action: "docs.read" } },
    });
    expect(row.state).toBe("connected");
    expect(row.lastSuccessAt).toBe("2026-09-17T08:00:00Z");
    expect(row.actionLabel).toBeNull();
  });

  it("stops saying Connected when the provider's last word was a revoked grant", () => {
    const row = rowFor({
      ...LIVE_DEFAULT,
      docs: {
        last_success: { at: "2026-09-16T08:00:00Z", action: "docs.read" },
        last_refusal: {
          at: "2026-09-17T08:00:00Z",
          action: "docs.read",
          code: "grant_expired_or_revoked",
          sentence:
            "Google would not renew this account's permission — it expired, or it was removed in the Google account. Reconnect the account to use Docs again.",
          http_status: 401,
        },
      },
    });
    expect(row.state).toBe("refused");
    expect(row.label).toBe("Not working");
    expect(row.reason).toContain("would not renew");
    // Every scope is present, and the ONE action is still offered, because the
    // GRANT is what has to be renewed.
    expect(row.missingScopes).toEqual([]);
    expect(row.actionLabel).toBe("Reconnect");
    expect(row.lastRefusal).toEqual({
      message: expect.stringContaining("would not renew"),
      at: "2026-09-17T08:00:00Z",
      code: "grant_expired_or_revoked",
      httpStatus: 401,
      disposition: "reconnect",
    });
  });

  it("keeps a refusal the next success already answered out of the badge", () => {
    const row = rowFor({
      ...LIVE_DEFAULT,
      docs: {
        last_success: { at: "2026-09-17T10:00:00Z", action: "docs.read" },
        last_refusal: {
          at: "2026-09-17T08:00:00Z",
          action: "docs.read",
          code: "grant_expired_or_revoked",
          sentence: "Google would not renew this account's permission.",
          http_status: 401,
        },
      },
    });
    expect(row.state).toBe("connected");
    expect(row.actionLabel).toBeNull();
    // Still visible in the disclosure — overtaken, not erased.
    expect(row.lastRefusal?.at).toBe("2026-09-17T08:00:00Z");
  });

  it("offers NO button for a refusal that clears by itself, and says so", () => {
    const row = rowFor({
      ...LIVE_DEFAULT,
      docs: {
        last_refusal: {
          at: "2026-09-17T08:00:00Z",
          action: "docs.read",
          code: "quota_exhausted",
          sentence:
            "Google is rate-limiting this account for Docs. It usually clears within an hour; nothing about the connection is broken.",
          http_status: 429,
        },
      },
    });
    expect(row.state).toBe("connected");
    expect(row.actionLabel).toBeNull();
    expect(row.activityNote).toContain("clears within an hour");
  });

  it("offers NO button when the fault is ours, and never blames the account", () => {
    const row = rowFor({
      ...LIVE_DEFAULT,
      docs: {
        last_refusal: {
          at: "2026-09-17T08:00:00Z",
          action: "docs.read",
          code: "platform_configuration",
          sentence:
            "Google rejected AI Matrx's own app configuration, so no call can be made for any account. This is ours to repair — reconnecting will not help.",
          http_status: 400,
        },
      },
    });
    expect(row.state).toBe("refused");
    expect(row.actionLabel).toBeNull();
    expect(row.remedy).toBeNull();
    expect(row.reason).toContain("ours to repair");
  });

  it("leaves the OTHER products of the same account alone", () => {
    const rows = accountHealth({
      provider,
      account: account({
        activity: googleActivityByProduct(
          provider,
          parseGoogleCapabilityHealth({
            ...LIVE_DEFAULT,
            docs: {
              last_refusal: {
                at: "2026-09-17T08:00:00Z",
                action: "docs.read",
                code: "grant_expired_or_revoked",
                sentence: "Google would not renew this account's permission.",
                http_status: 401,
              },
            },
          }),
        ),
      }),
      rollout: LIVE,
    });
    expect(rows.find((r) => r.product.key === "workspace_files")?.state).toBe(
      "refused",
    );
    expect(rows.find((r) => r.product.key === "gmail")?.state).toBe("connected");
  });
});

describe("every code has one meaning, in one place", () => {
  it("routes the four the person must act on and the two that heal themselves", () => {
    expect(refusalDisposition("scope_missing")).toBe("reconnect");
    expect(refusalDisposition("grant_expired_or_revoked")).toBe("reconnect");
    expect(refusalDisposition("provider_denied")).toBe("reconnect");
    expect(refusalDisposition("platform_configuration")).toBe("ours");
    expect(refusalDisposition("quota_exhausted")).toBe("self_healing");
    expect(refusalDisposition("provider_unavailable")).toBe("self_healing");
    expect(refusalDisposition("resource_unavailable")).toBe("retry");
    expect(refusalDisposition("call_failed")).toBe("retry");
    expect(refusalDisposition(null)).toBeNull();
  });
});
