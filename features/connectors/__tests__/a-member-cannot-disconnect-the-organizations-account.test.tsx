/**
 * THE SHARED CREDENTIAL IS NOT EVERY MEMBER'S TO REMOVE.
 *
 * `connectors / shared_account.member_default_level` was a registered knob that
 * NO code read (`pnpm check:settings-orphans`, LANE SETTINGS-3): an admin could
 * set the clinic's shared mailbox to "Viewer", the app said saved, and the
 * Connectors panel still offered every member of the clinic a Disconnect button
 * on it. This is the forcing function for the read.
 *
 * It fails on the code as it was: with the knob at "editor" — the seeded
 * default — the card below rendered Disconnect and the per-product Reconnect
 * for a plain member, because nothing consulted the knob at all.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { googleAccount } from "../google-adapter";
import { accountHealth, type ConnectorCapabilityRollout } from "../health";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";
import { ConnectedAccountHealth } from "../ConnectedAccountHealth";
import {
  SHARED_CONNECTOR_MEMBER_LEVEL_KNOB,
  resolveSharedConnectorManagement,
} from "../shared-account-level";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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

/** The clinic's shared info@ mailbox, connected FOR the organization. */
function sharedConnectionRow(): GoogleConnectionSummary {
  return {
    id: "conn-shared",
    owner_type: "organization",
    owner_user_id: "user-admin",
    organization_id: "org-clinic",
    provider: "google",
    provider_subject: "sub-shared",
    account_email: "info@clinic.example",
    account_name: null,
    scopes: [
      ...provider.identityScopes,
      ...provider.products.flatMap((product) => product.scopes),
    ],
    status: "connected",
    last_verified_at: "2026-09-21T20:00:00Z",
    last_error: null,
    created_at: "2026-09-01T19:00:00Z",
    updated_at: "2026-09-21T20:00:00Z",
    metadata: {},
    credential_present: true,
    credential_stable: true,
    capability_health: { __kind: "google_connection_capability_health" },
    health: "connected",
  };
}

describe("the knob's address", () => {
  it("is the register's own pair, never a dotted string a helper re-splits", () => {
    expect(SHARED_CONNECTOR_MEMBER_LEVEL_KNOB).toEqual({
      feature: "connectors",
      key: "shared_account.member_default_level",
    });
  });
});

describe("resolveSharedConnectorManagement", () => {
  const shared = {
    ownerKind: "organization" as const,
    organizationName: "Riverside Clinic",
    orgRole: "member" as const,
  };

  it("refuses a member at the seeded default of editor", () => {
    const answer = resolveSharedConnectorManagement({
      ...shared,
      knobValue: "editor",
    });
    expect(answer.allowed).toBe(false);
    expect(answer.sentence).toContain("Riverside Clinic");
  });

  it("allows a member the organization raised to admin", () => {
    expect(
      resolveSharedConnectorManagement({ ...shared, knobValue: "admin" })
        .allowed,
    ).toBe(true);
  });

  it("never guesses a level while the knob has not answered", () => {
    const answer = resolveSharedConnectorManagement({
      ...shared,
      knobValue: undefined,
    });
    expect(answer.allowed).toBe(false);
    expect(answer.sentence).toContain("Checking");
  });

  it("says so, and refuses, when the value is not a level we know", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const answer = resolveSharedConnectorManagement({
      ...shared,
      knobValue: "superuser",
    });
    expect(answer.allowed).toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("leaves the organization's own owners and admins in full control", () => {
    for (const orgRole of ["owner", "admin"] as const) {
      expect(
        resolveSharedConnectorManagement({
          ...shared,
          orgRole,
          knobValue: "viewer",
        }).allowed,
      ).toBe(true);
    }
  });

  it("never consults the knob for a personal account", () => {
    expect(
      resolveSharedConnectorManagement({
        ownerKind: "person",
        organizationName: null,
        orgRole: null,
        knobValue: undefined,
      }).allowed,
    ).toBe(true);
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

function buttonLabels(): string[] {
  return [...container!.querySelectorAll("button")].map(
    (button) => button.textContent ?? "",
  );
}

describe("the account card for a member of the organization", () => {
  it("offers no Disconnect, and says why, at the seeded default", () => {
    const account = googleAccount(sharedConnectionRow());
    mount(
      <ConnectedAccountHealth
        provider={provider}
        account={account}
        health={accountHealth({ provider, account, rollout: LIVE })}
        organizationName="Riverside Clinic"
        onReconnect={() => {}}
        onReconnectAccount={() => {}}
        onRevoke={() => {}}
        management={resolveSharedConnectorManagement({
          ownerKind: "organization",
          organizationName: "Riverside Clinic",
          orgRole: "member",
          knobValue: "editor",
        })}
      />,
    );
    expect(buttonLabels().some((label) => label.includes("Disconnect"))).toBe(
      false,
    );
    // Absent or honest, never dead: the card says what happened to the control.
    expect(container!.textContent ?? "").toContain("organization admin");
  });

  it("offers Disconnect once the organization sets members to admin", () => {
    const account = googleAccount(sharedConnectionRow());
    mount(
      <ConnectedAccountHealth
        provider={provider}
        account={account}
        health={accountHealth({ provider, account, rollout: LIVE })}
        organizationName="Riverside Clinic"
        onReconnect={() => {}}
        onReconnectAccount={() => {}}
        onRevoke={() => {}}
        management={resolveSharedConnectorManagement({
          ownerKind: "organization",
          organizationName: "Riverside Clinic",
          orgRole: "member",
          knobValue: "admin",
        })}
      />,
    );
    expect(buttonLabels().some((label) => label.includes("Disconnect"))).toBe(
      true,
    );
  });
});
