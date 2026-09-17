/**
 * WHAT A HEALTH ROW MAY SAY ABOUT ONE ACCOUNT (VERIFY-U-P2 D2, D3, D6, D7).
 *
 * The zero-authorship verification of the first Google moment found four ways
 * the rows spoke about something other than this account's truth, and each one
 * is pinned here:
 *
 *   D3 — every never-granted product offered "Reconnect". On the admin's
 *        `info@aimatrx.com` (drive.file + gmail.send only) SEVEN rows read
 *        "Not connected" and each carried a Reconnect button. "Reconnect" tells
 *        a person that something they HAD has broken.
 *   D6 — expanding a row printed `drive_files · generally available` and
 *        `youtube_analytics · still being certified`. Those are catalog keys.
 *   D7 — the consent dialog opened on the first row the inventory returned, so
 *        on the admin seat it opened on `arman26@gmail.com` and said "Docs,
 *        Sheets & Drive files — not connected" while Docs was connected on the
 *        account beside it.
 *   D2 — PLAN §5.3 asks for a per-product last success and last refusal. The
 *        server records neither yet, so the row must MODEL both, carry null
 *        honestly, and start showing them the moment an adapter supplies them.
 *
 * The four accounts below are the admin's real rows as the verifier read them
 * live on 2026-09-17 (VERIFY-U-P2 § Live rows this report is judged against).
 */

import {
  accountHealth,
  preferredAccountId,
  productHealth,
  rolloutSentence,
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
const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";
const YOUTUBE = "https://www.googleapis.com/auth/youtube.readonly";
const YT_ANALYTICS = "https://www.googleapis.com/auth/yt-analytics.readonly";
const CALENDAR =
  "https://www.googleapis.com/auth/calendar.events.owned.readonly";
const TASKS = "https://www.googleapis.com/auth/tasks.readonly";
const CONTACTS = "https://www.googleapis.com/auth/contacts.readonly";
const TAG_MANAGER = "https://www.googleapis.com/auth/tagmanager.readonly";
const ANALYTICS = "https://www.googleapis.com/auth/analytics.readonly";

/** Every catalog key live and eligible — the admin's own seat. */
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

function account(
  id: string,
  label: string,
  scopes: string[],
  overrides: Partial<ConnectorAccount> = {},
): ConnectorAccount {
  return {
    id,
    label,
    ownerKind: "person",
    organizationId: null,
    providerSubject: `sub-${id}`,
    grantedScopes: [...IDENTITY, ...scopes],
    usable: true,
    statusLabel: "Connected",
    statusReason: "This account can authorize Google calls.",
    statusRemedy: null,
    lastVerifiedAt: "2026-09-14T22:11:00Z",
    lastError: null,
    ...overrides,
  };
}

/** The admin's four real Google rows, 2026-09-17. */
const ARMAN26 = account("c1", "arman26@gmail.com", [YOUTUBE, YT_ANALYTICS]);
const PAGES = account("c2", "titanium-succes-4898@pages.plusgoogle.com", [
  CALENDAR,
  TASKS,
  CONTACTS,
  TAG_MANAGER,
  YT_ANALYTICS,
  YOUTUBE,
]);
const ARMANSADEGHI = account("c3", "arman@armansadeghi.com", [
  CALENDAR,
  TASKS,
  CONTACTS,
  TAG_MANAGER,
  YT_ANALYTICS,
  YOUTUBE,
]);
const INFO = account("c4", "info@aimatrx.com", [DRIVE_FILE, GMAIL_SEND]);

describe("D3 — the verb is Connect until this account has a grant", () => {
  it('offers "Connect", never "Reconnect", on the seven never-granted rows of info@aimatrx.com', () => {
    const rows = accountHealth({ provider, account: INFO, rollout: LIVE });
    const notConnected = rows.filter((row) => row.state === "not_connected");

    expect(notConnected.map((row) => row.product.key).sort()).toEqual(
      [
        "analytics",
        "calendar",
        "contacts",
        "search_console",
        "tag_manager",
        "tasks",
        "youtube",
      ].sort(),
    );
    for (const row of notConnected) {
      // The condition the old button rendered on — `missingScopes.length > 0 &&
      // togglable` — is TRUE for every one of these rows. It was never the wrong
      // condition for offering an action; it was the wrong condition for the
      // WORD, which is what this pins.
      expect(row.missingScopes.length).toBeGreaterThan(0);
      expect(row.togglable).toBe(true);
      expect(row.actionLabel).toBe("Connect");
    }
    expect(rows.filter((row) => row.actionLabel === "Reconnect")).toHaveLength(
      0,
    );
  });

  it('says "Reconnect" only when a grant exists and is incomplete', () => {
    // YouTube needs two scopes; this account holds one of them.
    const partial = account("c9", "half@aimatrx.com", [YOUTUBE]);
    const row = productHealth({
      provider,
      product: productByKey(provider, "youtube")!,
      account: partial,
      rollout: LIVE,
    });
    expect(row.state).toBe("scope_missing");
    expect(row.actionLabel).toBe("Reconnect");
  });

  it("offers no action at all on a fully connected row", () => {
    const row = productHealth({
      provider,
      product: productByKey(provider, "gmail")!,
      account: INFO,
      rollout: LIVE,
    });
    expect(row.state).toBe("connected");
    expect(row.actionLabel).toBeNull();
  });

  it("offers no action on a row the person may not switch on", () => {
    const gated: ConnectorCapabilityRollout[] = LIVE.map((row) =>
      row.capabilityKey === "analytics"
        ? {
            ...row,
            phase: "pending" as const,
            eligible: false,
            ineligibleReason: null,
          }
        : row,
    );
    const row = productHealth({
      provider,
      product: productByKey(provider, "analytics")!,
      account: INFO,
      rollout: gated,
    });
    expect(row.togglable).toBe(false);
    expect(row.actionLabel).toBeNull();
  });
});

describe("D6 — no machine key ever reaches the person", () => {
  it("turns the rollout state into a sentence naming the product", () => {
    const rows = accountHealth({ provider, account: INFO, rollout: LIVE });
    for (const row of rows) {
      const sentence = rolloutSentence(row);
      expect(sentence).not.toBeNull();
      for (const key of row.product.capabilityKeys) {
        expect(sentence).not.toContain(key);
      }
    }
    expect(
      rolloutSentence(
        rows.find((row) => row.product.key === "workspace_files")!,
      ),
    ).toBe("Docs, Sheets & Drive files is generally available on your account.");
  });

  it("prefers the server's own refusal sentence over anything we would invent", () => {
    const paused: ConnectorCapabilityRollout[] = LIVE.map((row) =>
      row.capabilityKey === "youtube"
        ? {
            ...row,
            phase: "pending" as const,
            eligible: false,
            ineligibleReason:
              "YouTube turns on automatically when ready for your account.",
          }
        : row,
    );
    const row = productHealth({
      provider,
      product: productByKey(provider, "youtube")!,
      account: INFO,
      rollout: paused,
    });
    expect(rolloutSentence(row)).toBe(
      "YouTube turns on automatically when ready for your account.",
    );
  });
});

describe("D7 — a consent surface opens on the account that holds the most", () => {
  const accounts = [ARMAN26, PAGES, ARMANSADEGHI, INFO];

  it("does not open on the first row the inventory happened to return", () => {
    const chosen = preferredAccountId({ provider, accounts, rollout: LIVE });
    expect(chosen).not.toBe(ARMAN26.id);
    // Calendar + Contacts + Tasks + Tag Manager + YouTube = five live products.
    expect(chosen).toBe(PAGES.id);
  });

  it("lets the calling surface name the account it is already using", () => {
    expect(
      preferredAccountId({
        provider,
        accounts,
        rollout: LIVE,
        preferAccountId: INFO.id,
      }),
    ).toBe(INFO.id);
  });

  it("ignores a named account that is not in the inventory", () => {
    expect(
      preferredAccountId({
        provider,
        accounts,
        rollout: LIVE,
        preferAccountId: "gone",
      }),
    ).toBe(PAGES.id);
  });

  it("returns null when nothing is connected, so the surface asks Google", () => {
    expect(
      preferredAccountId({ provider, accounts: [], rollout: LIVE }),
    ).toBeNull();
  });

  it("prefers a usable account over an unusable one that holds more", () => {
    const broken = account("c5", "broken@aimatrx.com", [
      CALENDAR,
      TASKS,
      CONTACTS,
      TAG_MANAGER,
      ANALYTICS,
    ], { usable: false });
    expect(
      preferredAccountId({
        provider,
        accounts: [broken, INFO],
        rollout: LIVE,
      }),
    ).toBe(INFO.id);
  });
});

describe("D2 — per-product last success and last refusal are modelled, never faked", () => {
  it("carries null for both while the server records neither", () => {
    const row = productHealth({
      provider,
      product: productByKey(provider, "workspace_files")!,
      account: INFO,
      rollout: LIVE,
    });
    expect(row.state).toBe("connected");
    // The account HAS a last_verified_at; the product must not borrow it.
    expect(INFO.lastVerifiedAt).not.toBeNull();
    expect(row.lastSuccessAt).toBeNull();
    expect(row.lastRefusal).toBeNull();
  });

  it("renders what the server supplies, the day it supplies it", () => {
    const rows = accountHealth({
      provider,
      account: INFO,
      rollout: LIVE,
      activity: {
        workspace_files: { lastSuccessAt: "2026-09-16T10:00:00Z" },
        gmail: {
          lastRefusal: {
            message: "Google refused: the grant was revoked in your account.",
            at: "2026-09-16T11:00:00Z",
          },
        },
      },
    });
    const files = rows.find((row) => row.product.key === "workspace_files")!;
    const gmail = rows.find((row) => row.product.key === "gmail")!;
    expect(files.lastSuccessAt).toBe("2026-09-16T10:00:00Z");
    expect(files.lastRefusal).toBeNull();
    expect(gmail.lastSuccessAt).toBeNull();
    expect(gmail.lastRefusal).toEqual({
      message: "Google refused: the grant was revoked in your account.",
      at: "2026-09-16T11:00:00Z",
    });
  });
});
