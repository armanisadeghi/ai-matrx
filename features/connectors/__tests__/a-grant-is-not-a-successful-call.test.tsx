/**
 * A GRANT IS NOT A CALL (aidream verifier N12, closed on the writer side in
 * `call_health.py::record_consent_grants`).
 *
 * A consent that (re-)grants a capability's scopes now writes to its OWN
 * `last_grant` slot and no longer touches `last_success` — before this, an
 * account-level reconnect wrote the approval into `last_success`, so one
 * minute later every product on the account claimed a "last successful use"
 * that never happened. This pins the client side: a product row that has a
 * `last_grant` and no `last_success` must say "connected, no calls yet" (never
 * borrowing the success label) and may say when it was granted.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { googleActivityByProduct, parseGoogleCapabilityHealth } from "../google-capability-health";
import {
  accountHealth,
  type ConnectorAccount,
  type ConnectorCapabilityRollout,
} from "../health";
import { ProductPermissionsDisclosure } from "../ProductPermissions";
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

function column(capabilities: Record<string, unknown>): Record<string, unknown> {
  return { __kind: "google_connection_capability_health", ...capabilities };
}

function calendarRow(raw: Record<string, unknown>) {
  const parsed = parseGoogleCapabilityHealth(raw);
  const activity = googleActivityByProduct(provider, parsed);
  const rows = accountHealth({ provider, account: account(activity), rollout: LIVE });
  const row = rows.find((candidate) => candidate.product.key === "calendar");
  if (!row) throw new Error("no product row covers the calendar capability");
  return row;
}

describe("the per-product fold, given only a grant", () => {
  it("carries lastGrantAt and leaves lastSuccessAt null — a grant is not a call", () => {
    const row = calendarRow(
      column({
        calendar: {
          last_grant: { at: "2026-09-17T09:00:00Z", action: "consent.grant" },
        },
      }),
    );
    expect(row.lastGrantAt).toBe("2026-09-17T09:00:00Z");
    expect(row.lastSuccessAt).toBeNull();
  });

  it("still carries no lastGrantAt when the server records nothing at all", () => {
    const row = calendarRow(column({}));
    expect(row.lastGrantAt).toBeNull();
    expect(row.lastSuccessAt).toBeNull();
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

describe("the disclosure, rendered over a grant-only product", () => {
  it("never renders a grant as a successful call", () => {
    const row = calendarRow(
      column({
        calendar: {
          last_grant: { at: "2026-09-17T09:00:00Z", action: "consent.grant" },
        },
      }),
    );
    mount(
      <ProductPermissionsDisclosure providerName="Google" health={row} />,
    );
    act(() => {
      container!.querySelector("button")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    const text = container!.textContent ?? "";
    expect(text).toContain("connected, no calls yet");
    expect(text).toContain("granted");
    expect(text).not.toContain("no calls recorded yet.");
  });

  it("still says 'no calls recorded yet' when there is no grant either", () => {
    const row = calendarRow(column({}));
    mount(
      <ProductPermissionsDisclosure providerName="Google" health={row} />,
    );
    act(() => {
      container!.querySelector("button")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    const text = container!.textContent ?? "";
    expect(text).toContain("no calls recorded yet.");
    expect(text).not.toContain("connected, no calls yet");
  });
});
