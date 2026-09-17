/**
 * A STANDING REFUSAL RENEWS THE GRANT — on EVERY consent surface, not just the
 * one whose author remembered.
 *
 * THE DEFECT THIS PINS (Cursor Bugbot, frontend PR 228, `f514f3b7`, MEDIUM).
 * `initialSelection` starts a `refused` product switched ON — correctly: the
 * account HAS it, and starting it off would read as "you never connected this".
 * But the dialog built its plan without the renew set, so a refusal whose scopes
 * are ALL present fell into `alreadyGranted`: `plan.empty` was true, the press
 * answered "Everything you switched on is already connected — there is nothing
 * to approve", and the provider window never opened. The one screen a person
 * reaches from "Not working" could not fix it. Settings → Reconnect passed the
 * renew set and worked, so the two surfaces disagreed about the same account.
 *
 * THE CLASS FIX PINNED BELOW: the renew set is DERIVED inside the one consent
 * plan entry point from the account's own recorded health, so no caller can
 * omit it and the two surfaces cannot drift again. The last test in this file
 * is the guard: no consent surface may hand-derive a renew set.
 *
 * The fixture is the live column the server writes — built from the real
 * `capability_health` jsonb shape (`aidream/aidream/services/google_integrations/
 * call_health.py`), through the real parser, marker and all. Nothing here
 * hand-builds the activity map the code under test reads.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { buildConsentPlan } from "../consent-plan";
import {
  googleActivityByProduct,
  parseGoogleCapabilityHealth,
  GOOGLE_CAPABILITY_HEALTH_KIND,
} from "../google-capability-health";
import { productHealth, type ConnectorAccount, type ConnectorCapabilityRollout } from "../health";
import { GOOGLE_CONNECTOR_PROVIDER, productByKey } from "../provider-config";

const provider = GOOGLE_CONNECTOR_PROVIDER;
const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";
const DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";

const LIVE: ConnectorCapabilityRollout[] = [
  ...new Set(provider.products.flatMap((product) => product.capabilityKeys)),
].map((capabilityKey) => ({
  capabilityKey,
  phase: "available" as const,
  eligible: true,
  requiredScopes: [],
  ineligibleReason: null,
}));

/**
 * The column exactly as the recording seam leaves it after Google answered a
 * `gmail.send` call with a 401 on a grant it will not honour any more — the
 * `grant_expired_or_revoked` case, whose disposition is `reconnect`.
 */
const REFUSED_COLUMN = {
  __kind: GOOGLE_CAPABILITY_HEALTH_KIND,
  gmail_send: {
    last_refusal: {
      at: "2026-09-17T14:02:11Z",
      action: "gmail.send",
      code: "grant_expired_or_revoked",
      sentence:
        "Google is no longer honouring this account's permission for Gmail. Reconnect it to send email again.",
      http_status: 401,
    },
  },
};

const ACTIVITY = googleActivityByProduct(
  provider,
  parseGoogleCapabilityHealth(REFUSED_COLUMN),
);

/** The real account shape: every Gmail scope held, and the refusal standing. */
const REFUSED_ACCOUNT: ConnectorAccount = {
  id: "c4",
  label: "info@aimatrx.com",
  ownerKind: "person",
  organizationId: null,
  providerSubject: "sub-c4",
  grantedScopes: [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    DRIVE_FILE,
    GMAIL_SEND,
  ],
  usable: true,
  statusLabel: "Connected",
  statusReason: "This account can authorize Google calls.",
  statusRemedy: null,
  lastVerifiedAt: "2026-09-14T22:11:00Z",
  lastError: null,
  activity: ACTIVITY,
};

describe("the fixture is the live refusal, not a convenient one", () => {
  it("parses the server's column into a standing refusal Gmail must act on", () => {
    expect(ACTIVITY.gmail?.lastRefusal?.code).toBe("grant_expired_or_revoked");
    const row = productHealth({
      provider,
      product: productByKey(provider, "gmail")!,
      account: REFUSED_ACCOUNT,
      rollout: LIVE,
    });
    // Every scope present, and still not connected: that is the whole case.
    expect(row.missingScopes).toEqual([]);
    expect(row.state).toBe("refused");
    expect(row.actionLabel).toBe("Reconnect");
  });
});

describe("the consent plan renews a standing refusal without being told to", () => {
  it("does NOT call it already granted, and asks the provider for the grant again", () => {
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: ["gmail"],
      account: REFUSED_ACCOUNT,
      rollout: LIVE,
    });
    expect(plan.alreadyGranted.map((product) => product.key)).toEqual([]);
    expect(plan.empty).toBe(false);
    expect(plan.request).not.toBeNull();
    // A renewal adds no scope: it asks for exactly what the account holds, which
    // is what mints a fresh grant. Nothing is dropped either.
    expect(plan.request?.addedScopes).toEqual([]);
    expect(plan.request?.scopes).toContain(GMAIL_SEND);
    expect(plan.request?.scopes).toContain(DRIVE_FILE);
    expect(plan.request?.capabilityKeys).toEqual(["gmail_send"]);
    expect(plan.request?.renewals.map((product) => product.key)).toEqual([
      "gmail",
    ]);
    expect(plan.request?.targetAccountId).toBe("c4");
  });

  it("still asks for nothing when the product is healthy and fully granted", () => {
    const healthy: ConnectorAccount = { ...REFUSED_ACCOUNT, activity: {} };
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: ["gmail"],
      account: healthy,
      rollout: LIVE,
    });
    expect(plan.empty).toBe(true);
    expect(plan.alreadyGranted.map((product) => product.key)).toEqual(["gmail"]);
  });

  it("does not renew a refusal a reconnect cannot clear", () => {
    // `platform_configuration` is OURS to repair: the row says so and offers no
    // button, so the plan must not manufacture one either.
    const ours = googleActivityByProduct(
      provider,
      parseGoogleCapabilityHealth({
        __kind: GOOGLE_CAPABILITY_HEALTH_KIND,
        gmail_send: {
          last_refusal: {
            at: "2026-09-17T14:02:11Z",
            action: "gmail.send",
            code: "platform_configuration",
            sentence: "We have not finished setting Gmail up on our side.",
            http_status: 500,
          },
        },
      }),
    );
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: ["gmail"],
      account: { ...REFUSED_ACCOUNT, activity: ours },
      rollout: LIVE,
    });
    expect(plan.request).toBeNull();
    expect(plan.empty).toBe(true);
  });
});

/**
 * THE GUARD FOR THE CLASS. The renew set is derived inside `buildConsentPlan`,
 * so a consent surface that hand-derives one is the divergence coming back.
 */
describe("no consent surface hand-derives a renew set", () => {
  it("leaves the renewal decision to the one consent plan entry point", () => {
    const dir = path.join(__dirname, "..");
    for (const file of [
      "ConnectorConsentDialog.tsx",
      "ConnectorsSettingsPanel.tsx",
    ]) {
      const source = readFileSync(path.join(dir, file), "utf8");
      expect(source).toContain("buildConsentPlan");
      expect(source).not.toContain("renewProductKeys");
    }
  });
});
