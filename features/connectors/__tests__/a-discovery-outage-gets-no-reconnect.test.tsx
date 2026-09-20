/**
 * A DISCOVERY OUTAGE ON THE ACCOUNT CARD (aidream verifier N15, client half).
 *
 * A row shaped like `google_discovery_health`'s writer — `status: 'connected'`,
 * `last_error: null`, `metadata.discovery_outage` set — must map to a
 * `ConnectorAccount` that is still `usable`, offers the outage sentence with
 * NO Reconnect anywhere near it, and never flags the credential. Before this,
 * the same server condition landed on `needs_attention` and the account card
 * showed EVERY product as "Needs reconnecting" beside a press that changed
 * nothing.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { googleAccount } from "../google-adapter";
import { accountHealth, type ConnectorCapabilityRollout } from "../health";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";
import { ConnectedAccountHealth } from "../ConnectedAccountHealth";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";

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

const OUTAGE_SENTENCE =
  "Google did not answer when AI Matrx asked what this account can reach for " +
  "these products. The account itself is connected — try again in a few minutes.";

function connectionRow(): GoogleConnectionSummary {
  return {
    id: "conn-outage",
    owner_type: "user",
    owner_user_id: "user-1",
    organization_id: null,
    provider: "google",
    provider_subject: "sub-outage",
    account_email: "probe@example.com",
    account_name: null,
    scopes: [
      ...provider.identityScopes,
      ...provider.products.flatMap((product) => product.scopes),
    ],
    status: "connected",
    last_verified_at: "2026-09-17T20:00:00Z",
    last_error: null,
    created_at: "2026-09-17T19:00:00Z",
    updated_at: "2026-09-17T20:00:00Z",
    metadata: {
      discovery_outage: {
        products: ["analytics", "youtube"],
        sentence: OUTAGE_SENTENCE,
        at: "2026-09-17T20:00:00Z",
      },
    },
    credential_present: true,
    credential_stable: true,
    capability_health: { __kind: "google_connection_capability_health" },
    health: "connected",
  };
}

describe("googleAccount over a discovery-outage row", () => {
  it("stays usable and carries the server's outage sentence", () => {
    const account = googleAccount(connectionRow());
    expect(account.usable).toBe(true);
    expect(account.discoveryOutageSentence).toBe(OUTAGE_SENTENCE);
    expect(account.statusLabel).toBe("Connected");
  });
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(node: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(node));
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe("the account card, over the same row", () => {
  it("shows the outage sentence and offers no account-level Reconnect", () => {
    const account = googleAccount(connectionRow());
    const health = accountHealth({ provider, account, rollout: LIVE });
    mount(
      <ConnectedAccountHealth
        provider={provider}
        account={account}
        health={health}
        onReconnect={() => {}}
        onReconnectAccount={() => {}}
        onRevoke={() => {}}
      />,
    );
    const text = container!.textContent ?? "";
    expect(text).toContain(OUTAGE_SENTENCE);
    const buttons = [...container!.querySelectorAll("button")].map(
      (button) => button.textContent ?? "",
    );
    expect(buttons.some((label) => label.includes("Reconnect"))).toBe(false);
  });
});
