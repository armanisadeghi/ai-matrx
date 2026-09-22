/**
 * A BUSY CONTROL BELONGS TO THE ACCOUNT IT WAS PRESSED ON.
 *
 * THE DEFECT THIS PINS (VERIFY-U-P2-R2, N6). `ConnectorsSettingsPanel` kept ONE
 * `busyProduct` string and handed it to every `ConnectedAccountHealth`, so with
 * two connected Google accounts — the normal case on this seat, which holds four
 * — pressing Reconnect on one account disabled and spun the SAME product's
 * control on all the others. Nothing was happening to them: a spinner that lies
 * about which work is running is law 4 in reverse.
 *
 * THE CLASS FIX PINNED BELOW: the prop is no longer a bare product key. It is
 * `{ accountId, productKey }`, and the component compares the account id to its
 * OWN account before it spins anything — so a caller cannot express "busy
 * everywhere" any more, whatever it holds in state. `productKey: null` is the
 * account-level press (one Reconnect for a dead credential).
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ConnectedAccountHealth } from "../ConnectedAccountHealth";
import { MANAGEMENT_ALLOWED } from "../shared-account-level";
import {
  accountHealth,
  type ConnectorAccount,
  type ConnectorCapabilityRollout,
} from "../health";
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

/** A healthy account holding Gmail only: the other eight rows say Connect. */
function account(id: string, label: string): ConnectorAccount {
  return {
    id,
    label,
    ownerKind: "person",
    organizationId: null,
    providerSubject: `sub-${id}`,
    grantedScopes: [
      ...provider.identityScopes,
      "https://www.googleapis.com/auth/gmail.send",
    ],
    usable: true,
    statusLabel: "Connected",
    statusReason: "This account can authorize Google calls.",
    statusRemedy: null,
    lastVerifiedAt: "2026-09-17T00:00:00Z",
    lastRefusalSentence: null,
    activity: {},
  };
}

let container: HTMLDivElement;
let root: Root;

function render(node: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
}

function actionFor(productName: string): HTMLButtonElement {
  const rows = [...container.querySelectorAll("li")];
  const row = rows.find((node) => (node.textContent ?? "").includes(productName));
  const button = [...(row?.querySelectorAll("button") ?? [])].find((node) =>
    /Connect|Reconnect/.test(node.textContent ?? ""),
  );
  if (!button) throw new Error(`no action control on the ${productName} row`);
  return button as HTMLButtonElement;
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("a press on one account", () => {
  // F-19 / VERIFY-U-P2-R3 N17: the panel holds a SET of in-flight presses, so a
  // second account's press cannot clear the first account's marker.
  const busy = [{ accountId: "acct-1", productKey: "calendar" }] as const;

  it("spins that account's control", () => {
    render(
      <ConnectedAccountHealth
        management={MANAGEMENT_ALLOWED}
        provider={provider}
        account={account("acct-1", "one@aimatrx.com")}
        health={accountHealth({
          provider,
          account: account("acct-1", "one@aimatrx.com"),
          rollout: LIVE,
        })}
        onReconnect={() => {}}
        onReconnectAccount={() => {}}
        onRevoke={() => {}}
        busy={busy}
      />,
    );
    expect(actionFor("Calendar").disabled).toBe(true);
  });

  it("leaves the SAME product alone on every other account", () => {
    render(
      <ConnectedAccountHealth
        management={MANAGEMENT_ALLOWED}
        provider={provider}
        account={account("acct-2", "two@aimatrx.com")}
        health={accountHealth({
          provider,
          account: account("acct-2", "two@aimatrx.com"),
          rollout: LIVE,
        })}
        onReconnect={() => {}}
        onReconnectAccount={() => {}}
        onRevoke={() => {}}
        busy={busy}
      />,
    );
    // Before the fix this control was disabled and spinning while nothing at
    // all was happening to this account.
    expect(actionFor("Calendar").disabled).toBe(false);
  });
});

/**
 * The guard for the class: the panel's busy state carries the account id, so it
 * cannot go back to one shared product key.
 */
describe("the panel's busy state is account-scoped", () => {
  it("never passes a bare product key to an account card", () => {
    const source = readFileSync(
      path.join(__dirname, "..", "ConnectorsSettingsPanel.tsx"),
      "utf8",
    );
    expect(source).not.toContain("busyProductKey");
    expect(source).toContain("accountId");
  });
});
