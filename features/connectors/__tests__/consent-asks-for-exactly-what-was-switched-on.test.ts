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
    lastError: null,
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
    expect(plan.request?.capabilityKeys.sort()).toEqual([
      "docs",
      "drive_files",
      "gmail_send",
      "sheets",
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
    });
    const byKey = Object.fromEntries(
      outcomes.map((outcome) => [outcome.product.key, outcome.state]),
    );
    expect(byKey.workspace_files).toBe("granted");
    expect(byKey.gmail).toBe("refused");
  });
});
