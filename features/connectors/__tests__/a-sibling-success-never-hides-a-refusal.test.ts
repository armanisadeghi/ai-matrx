/**
 * ONE PRODUCT ROW, SEVERAL CAPABILITIES: A STANDING REFUSAL ON ANY OF THEM KEEPS
 * THE ROW BROKEN.
 *
 * THE DEFECT THIS PINS (VERIFY-U-P2-R3, N11). `googleActivityByProduct` folded a
 * product's capabilities by taking the newest success and the newest refusal
 * INDEPENDENTLY, most-recent-wins. "Docs, Sheets & Drive files" covers
 * `drive_files`, `docs` and `sheets`; "YouTube" covers `youtube` and
 * `youtube_analytics`. So a `docs` refusal at 12:00 followed by a `drive_files`
 * success at 12:05 produced a row reading "Connected" with NO Reconnect control
 * anywhere on the card, whose own disclosure two lines below said "Reconnect it
 * and approve Docs." A sentence telling a person to reconnect beside no control
 * is the dead end this primitive exists to end, and the badge is the boolean
 * that lies. The server declares all three capabilities as needing the same one
 * scope, so the row's scope arithmetic can never catch it.
 *
 * THE CLASS FIX PINNED BELOW: the fold decides, per capability, whether that
 * capability's refusal has been overtaken by that capability's OWN success, and
 * states the answer on the activity it hands over (`refusalStands`). The health
 * row honours it instead of re-deriving a product-level comparison it does not
 * have the facts for. This holds for any provider whose product spans several
 * capabilities, not only for these two rows.
 */

import { googleActivityByProduct } from "../google-capability-health";
import { parseGoogleCapabilityHealth } from "../google-capability-health";
import { accountHealth, type ConnectorAccount, type ConnectorCapabilityRollout } from "../health";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";

const provider = GOOGLE_CONNECTOR_PROVIDER;

const LIVE: ConnectorCapabilityRollout[] = [
  ...new Set(provider.products.flatMap((product) => product.capabilityKeys)),
].map((capabilityKey) => ({
  capabilityKey,
  phase: "available" as const,
  eligible: true,
  requiredScopes: [],
  ineligibleReason: null,
}));

const EVERY_SCOPE = [
  ...new Set([
    ...provider.identityScopes,
    ...provider.products.flatMap((product) => product.scopes),
  ]),
];

function account(activity: ConnectorAccount["activity"]): ConnectorAccount {
  return {
    id: "conn-1",
    label: "probe@example.com",
    ownerKind: "person",
    organizationId: null,
    providerSubject: "sub-1",
    grantedScopes: EVERY_SCOPE,
    usable: true,
    statusLabel: "Connected",
    statusReason: "This account can authorize Google calls.",
    statusRemedy: null,
    lastVerifiedAt: "2026-09-17T12:00:00Z",
    lastRefusalSentence: null,
    activity,
  };
}

/** The live column shape, written the way `call_health.py` writes it. */
function column(
  capabilities: Record<string, unknown>,
): Record<string, unknown> {
  return { __kind: "google_connection_capability_health", ...capabilities };
}

const DOCS_REFUSAL = {
  at: "2026-09-17T12:00:00Z",
  action: "docs.read",
  code: "scope_missing",
  http_status: 403,
  sentence:
    "This Google account has not approved the access Docs needs. Reconnect it and approve Docs.",
};

function workspaceRow(raw: Record<string, unknown>) {
  const parsed = parseGoogleCapabilityHealth(raw);
  const activity = googleActivityByProduct(provider, parsed);
  const rows = accountHealth({ provider, account: account(activity), rollout: LIVE });
  const row = rows.find((candidate) =>
    candidate.product.capabilityKeys.includes("docs"),
  );
  if (!row) throw new Error("no product row covers the docs capability");
  return row;
}

describe("a product row spanning several capabilities", () => {
  it("stays broken when a sibling capability succeeded five minutes later", () => {
    const row = workspaceRow(
      column({
        docs: { last_refusal: DOCS_REFUSAL },
        drive_files: {
          last_success: { at: "2026-09-17T12:05:00Z", action: "drive.list" },
        },
      }),
    );
    // Before the fix: state "connected", label "Connected", actionLabel null —
    // with the refusal's own "Reconnect it and approve Docs." in the disclosure.
    expect(row.state).toBe("refused");
    expect(row.label).not.toBe("Connected");
    expect(row.actionLabel).toBe("Reconnect");
    expect(row.actionScope).toBe("product");
    expect(row.lastRefusal?.message).toBe(DOCS_REFUSAL.sentence);
  });

  it("goes green only when THAT capability's own call answered afterwards", () => {
    const row = workspaceRow(
      column({
        docs: {
          last_refusal: DOCS_REFUSAL,
          last_success: { at: "2026-09-17T12:30:00Z", action: "docs.read" },
        },
        drive_files: {
          last_success: { at: "2026-09-17T12:05:00Z", action: "drive.list" },
        },
      }),
    );
    expect(row.state).toBe("connected");
    expect(row.actionLabel).toBeNull();
  });

  it("does the same for YouTube's two capability keys", () => {
    const parsed = parseGoogleCapabilityHealth(
      column({
        youtube_analytics: {
          last_refusal: {
            ...DOCS_REFUSAL,
            action: "youtube_analytics.report",
            sentence:
              "This Google account has not approved the access YouTube analytics needs. Reconnect it and approve YouTube.",
          },
        },
        youtube: {
          last_success: { at: "2026-09-17T12:05:00Z", action: "youtube.list" },
        },
      }),
    );
    const activity = googleActivityByProduct(provider, parsed);
    const rows = accountHealth({
      provider,
      account: account(activity),
      rollout: LIVE,
    });
    const row = rows.find((candidate) =>
      candidate.product.capabilityKeys.includes("youtube_analytics"),
    );
    expect(row?.state).toBe("refused");
    expect(row?.actionLabel).toBe("Reconnect");
  });
});
