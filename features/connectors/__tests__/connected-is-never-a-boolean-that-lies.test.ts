/**
 * "CONNECTED" IS NEVER A BOOLEAN THAT LIES (PLAN §5.3).
 *
 * The failure this guards is the one every surveyed connector product ships
 * (PLAN §1, last row): the row says connected and the product returns nothing.
 * In this codebase it has a recorded instance — on 2026-07-25 a Search Console
 * sync failed with "CanonicalGscSync failed unexpectedly" while the connection
 * row said `status = 'connected'`; the credential reference was gone
 * (`features/marketing/google/health.ts` header).
 *
 * So a product row may only say Connected when all three are true at once: the
 * account can authorize a call, every scope the product needs is granted, and
 * the server says the capability is live for this caller. Each of the three is
 * removed below, one at a time, and each must change what the row says.
 *
 * It also pins the deliberate absence: `lastSuccessAt` stays null while the
 * server records no per-capability call, rather than borrowing the account's
 * `last_verified_at` and calling it a per-product success.
 */

import {
  productHealth,
  revokeConsequence,
  type ConnectorAccount,
  type ConnectorCapabilityRollout,
} from "../health";
import { GOOGLE_CONNECTOR_PROVIDER, productByKey } from "../provider-config";

const DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";
const YOUTUBE = "https://www.googleapis.com/auth/youtube.readonly";
const YT_ANALYTICS = "https://www.googleapis.com/auth/yt-analytics.readonly";
const OPENID = "openid";

const provider = GOOGLE_CONNECTOR_PROVIDER;
const workspace = productByKey(provider, "workspace_files")!;
const youtube = productByKey(provider, "youtube")!;

const LIVE: ConnectorCapabilityRollout[] = [
  "drive_files",
  "docs",
  "sheets",
  "youtube",
  "youtube_analytics",
].map((capabilityKey) => ({
  capabilityKey,
  phase: "available",
  eligible: true,
  requiredScopes: [],
  ineligibleReason: null,
}));

function account(
  scopes: string[],
  overrides: Partial<ConnectorAccount> = {},
): ConnectorAccount {
  return {
    id: "conn-1",
    label: "arman@aimatrx.com",
    ownerKind: "person",
    organizationId: null,
    providerSubject: "subject-1",
    grantedScopes: scopes,
    usable: true,
    statusLabel: "Connected",
    statusReason: "It can authorize Google requests.",
    statusRemedy: null,
    lastVerifiedAt: "2026-09-17T00:00:00Z",
    lastRefusalSentence: null,
    ...overrides,
  };
}

describe("productHealth", () => {
  it("says Connected only when account, scopes and rollout all agree", () => {
    const row = productHealth({
      provider,
      product: workspace,
      account: account([OPENID, DRIVE_FILE]),
      rollout: LIVE,
    });
    expect(row.state).toBe("connected");
    expect(row.missingScopes).toEqual([]);
  });

  it("does NOT say Connected when the account cannot authorize anything", () => {
    // The 2026-07-25 shape exactly: scope granted, credential gone.
    const row = productHealth({
      provider,
      product: workspace,
      account: account([OPENID, DRIVE_FILE], {
        usable: false,
        statusLabel: "Needs re-authentication",
        statusReason: "There is no credential on file for this account.",
        statusRemedy: "Reconnect it to mint a new credential.",
      }),
      rollout: LIVE,
    });
    expect(row.state).toBe("account_unusable");
    expect(row.reason).toContain("no credential on file");
    expect(row.remedy).toContain("Reconnect");
  });

  it("does NOT say Connected when one scope of a multi-scope product is missing", () => {
    const row = productHealth({
      provider,
      product: youtube,
      account: account([OPENID, YOUTUBE]),
      rollout: LIVE,
    });
    expect(row.state).toBe("scope_missing");
    expect(row.missingScopes).toEqual([YT_ANALYTICS]);
    // The reconnect asks for that ONE scope, not the whole bundle.
    expect(row.missingScopes).not.toContain(YOUTUBE);
  });

  it("does NOT say Connected when the server says the capability is not live", () => {
    const row = productHealth({
      provider,
      product: youtube,
      account: account([OPENID, YOUTUBE, YT_ANALYTICS]),
      rollout: LIVE.map((entry) =>
        entry.capabilityKey === "youtube_analytics"
          ? {
              ...entry,
              eligible: false,
              ineligibleReason: "YouTube turns on automatically when ready.",
            }
          : entry,
      ),
    });
    expect(row.state).not.toBe("connected");
    expect(row.reason).toContain("turns on automatically");
  });

  it("shows the rollout line and no toggle for a gated product", () => {
    const row = productHealth({
      provider,
      product: youtube,
      account: account([OPENID]),
      rollout: LIVE.map((entry) =>
        entry.capabilityKey === "youtube_analytics"
          ? { ...entry, phase: "pending" as const, eligible: false }
          : entry,
      ),
    });
    expect(row.state).toBe("pending_rollout");
    expect(row.reason).toBe(
      "Turns on automatically when ready for your account.",
    );
    expect(row.togglable).toBe(false);
  });

  it("never invents a per-product last success from the account timestamp", () => {
    const row = productHealth({
      provider,
      product: workspace,
      account: account([OPENID, DRIVE_FILE]),
      rollout: LIVE,
    });
    expect(row.lastSuccessAt).toBeNull();
  });

  it("widens the required scopes when the server asks for more than the config", () => {
    const row = productHealth({
      provider,
      product: workspace,
      account: account([OPENID, DRIVE_FILE]),
      rollout: LIVE.map((entry) =>
        entry.capabilityKey === "sheets"
          ? { ...entry, requiredScopes: ["https://example.test/new.scope"] }
          : entry,
      ),
    });
    expect(row.missingScopes).toEqual(["https://example.test/new.scope"]);
    expect(row.state).toBe("scope_missing");
  });
});

describe("revokeConsequence", () => {
  it("names what actually stops, not a generic warning", () => {
    const connected = productHealth({
      provider,
      product: workspace,
      account: account([OPENID, DRIVE_FILE]),
      rollout: LIVE,
    });
    const sentence = revokeConsequence(
      provider,
      account([OPENID, DRIVE_FILE]),
      [connected],
      3,
    );
    expect(sentence).toContain("arman@aimatrx.com");
    expect(sentence).toContain("the Docs and Sheets you picked");
    expect(sentence).toContain("3 items");
    expect(sentence).not.toContain("Are you sure");
  });

  it("says plainly when nothing is using the account", () => {
    const sentence = revokeConsequence(provider, account([OPENID]), [], 0);
    expect(sentence).toContain("nothing stops working");
  });
});
