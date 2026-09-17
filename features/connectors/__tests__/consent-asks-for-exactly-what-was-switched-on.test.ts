/**
 * THE CONSENT REQUEST ASKS FOR EXACTLY WHAT WAS SWITCHED ON — no more, and
 * never less than the account already holds.
 *
 * Both failure directions are real and both have shipped in this codebase's
 * provider before:
 *
 *   - asking for MORE than was selected is what got a production Google
 *     authorization REJECTED outright when `include_granted_scopes=true` merged
 *     an extra grant (recorded in `lib/googleScopes.ts`, the
 *     `GOOGLE_OUTREACH_INBOX_SCOPES` header);
 *   - asking for LESS than the connection already holds is what the hub refuses
 *     as "this authorization would remove existing Google access" — and if the
 *     hub ever stopped refusing, it would silently drop a grant and strand every
 *     file the person had picked.
 *
 * The cases below are the real Google catalog keys and the real scope strings.
 */

import { buildConsentPlan, consentOutcomes } from "../consent-plan";
import type { ConnectorCapabilityRollout } from "../health";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";
import type { ConnectorAccount } from "../health";

const DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";
const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";
const CALENDAR = "https://www.googleapis.com/auth/calendar.events.owned.readonly";
const GSC = "https://www.googleapis.com/auth/webmasters.readonly";
const OPENID = "openid";

const provider = GOOGLE_CONNECTOR_PROVIDER;

function rollout(
  overrides: Partial<
    Record<string, Pick<ConnectorCapabilityRollout, "phase" | "eligible">>
  > = {},
): ConnectorCapabilityRollout[] {
  const keys = [
    ...new Set(provider.products.flatMap((product) => product.capabilityKeys)),
  ];
  return keys.map((capabilityKey) => ({
    capabilityKey,
    phase: overrides[capabilityKey]?.phase ?? "available",
    eligible: overrides[capabilityKey]?.eligible ?? true,
    requiredScopes: [],
    ineligibleReason: null,
  }));
}

function account(scopes: string[]): ConnectorAccount {
  return {
    id: "conn-1",
    label: "arman@aimatrx.com",
    ownerKind: "person",
    organizationId: null,
    providerSubject: "google-subject-1",
    grantedScopes: scopes,
    usable: true,
    statusLabel: "Connected",
    statusReason: "fine",
    statusRemedy: null,
    lastVerifiedAt: "2026-09-17T00:00:00Z",
    lastRefusalSentence: null,
  };
}

describe("buildConsentPlan", () => {
  it("asks only for the switched-on products, plus identity", () => {
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: ["workspace_files", "gmail"],
      account: null,
      rollout: rollout(),
    });
    expect(plan.request).not.toBeNull();
    expect(plan.request?.scopes).toContain(DRIVE_FILE);
    expect(plan.request?.scopes).toContain(GMAIL_SEND);
    expect(plan.request?.scopes).toContain(OPENID);
    // Nothing the person did not switch on.
    expect(plan.request?.scopes).not.toContain(GSC);
    expect(plan.request?.scopes).not.toContain(CALENDAR);
    // Four capabilities behind the files row since `slides` was given its home
    // there (V13-3), plus Gmail's one.
    expect(plan.request?.capabilityKeys.sort()).toEqual([
      "docs",
      "drive_files",
      "gmail_send",
      "sheets",
      "slides",
    ]);
  });

  it("carries every scope the account already holds, so none is dropped", () => {
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: ["search_console"],
      account: account([OPENID, DRIVE_FILE, GMAIL_SEND]),
      rollout: rollout(),
    });
    expect(plan.request?.scopes).toContain(DRIVE_FILE);
    expect(plan.request?.scopes).toContain(GMAIL_SEND);
    expect(plan.request?.scopes).toContain(GSC);
    // …while the person is only approving the new one.
    expect(plan.request?.addedScopes).toEqual([GSC]);
  });

  it("asks for nothing when the selection is already granted", () => {
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: ["workspace_files"],
      account: account([OPENID, DRIVE_FILE]),
      rollout: rollout(),
    });
    expect(plan.empty).toBe(true);
    expect(plan.request).toBeNull();
    expect(plan.alreadyGranted.map((product) => product.key)).toEqual([
      "workspace_files",
    ]);
  });

  it("refuses to request a product still behind the rollout gate, and says why", () => {
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: ["calendar"],
      account: account([OPENID, DRIVE_FILE]),
      rollout: rollout({ calendar: { phase: "pending", eligible: false } }),
    });
    expect(plan.request).toBeNull();
    expect(plan.blocked).toHaveLength(1);
    expect(plan.blocked[0]?.reason).toContain(
      "Turns on automatically when ready for your account",
    );
  });

  it("requests a gated product for a caller the server says is eligible", () => {
    // A super admin sees `rollout_phase: internal_test` AND `eligible: true`.
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: ["calendar"],
      account: account([OPENID, DRIVE_FILE]),
      rollout: rollout({ calendar: { phase: "pending", eligible: true } }),
    });
    expect(plan.request?.scopes).toContain(CALENDAR);
    expect(plan.request?.capabilityKeys).toEqual(["calendar"]);
  });
});

describe("consentOutcomes", () => {
  it("names the product the provider refused without hiding the ones that landed", () => {
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: ["workspace_files", "gmail"],
      account: null,
      rollout: rollout(),
    });
    // The provider granted Drive but not Gmail send.
    const outcomes = consentOutcomes({
      provider,
      plan,
      account: account([OPENID, DRIVE_FILE]),
      rollout: rollout(),
      // F-19 / VERIFY-U-P2-R3 N10: the exchange result is part of the answer —
      // scope presence alone cannot tell a renewal that landed from one that
      // never happened.
      exchange: { completed: true },
    });
    const byKey = Object.fromEntries(
      outcomes.map((outcome) => [outcome.product.key, outcome.state]),
    );
    expect(byKey.workspace_files).toBe("granted");
    expect(byKey.gmail).toBe("refused");
  });
});

/**
 * D4 (VERIFY-U-P2): a DIFFERENT Google login becomes a SECOND connected
 * account. Before 2026-09-17 the dialog always planned against the account it
 * had chosen, so `targetAccountId` was never null once one account existed and
 * there was no way to bring a second Google identity in at all — PLAN §2 asks
 * for exactly that. "Use a different Google account" in the switcher plans with
 * no account, which is what makes the hub create one instead of adding to one.
 */
describe("connecting a second Google account", () => {
  it("targets no existing account, and asks only for what that product needs", () => {
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: ["gmail"],
      account: null,
      rollout: rollout(),
    });
    expect(plan.request?.targetAccountId).toBeNull();
    expect(plan.request?.scopes).toContain(GMAIL_SEND);
    expect(plan.request?.scopes).not.toContain(DRIVE_FILE);
    expect(plan.request?.capabilityKeys).toEqual(["gmail_send"]);
  });

  it("does not inherit the scopes of the account already connected", () => {
    const existing = account([OPENID, DRIVE_FILE, GMAIL_SEND]);
    const addingToIt = buildConsentPlan({
      provider,
      selectedProductKeys: ["search_console"],
      account: existing,
      rollout: rollout(),
    });
    const brandNew = buildConsentPlan({
      provider,
      selectedProductKeys: ["search_console"],
      account: null,
      rollout: rollout(),
    });
    // Adding to the existing account carries its grants so none are dropped…
    expect(addingToIt.request?.scopes).toContain(DRIVE_FILE);
    expect(addingToIt.request?.targetAccountId).toBe(existing.id);
    // …while the new identity is asked for nothing it has not been offered.
    expect(brandNew.request?.scopes).not.toContain(DRIVE_FILE);
    expect(brandNew.request?.scopes).toContain(GSC);
  });
});
