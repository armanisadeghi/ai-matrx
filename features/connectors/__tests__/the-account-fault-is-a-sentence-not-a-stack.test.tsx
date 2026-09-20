/**
 * AN ACCOUNT THAT NEEDS ATTENTION SPEAKS OUR WORDS, NEVER THE SERVER'S.
 *
 * THE DEFECT THIS PINS (VERIFY-U-P2-R3, N9 — the worst finding of that round).
 * `features/marketing/google/health.ts` returned `connection.last_error`
 * VERBATIM as the `reason` of a `needs_attention` connection, `googleAccount`
 * copied it into `statusReason`, `health.ts` used it as the reason of the
 * `account_unusable` row for every product, and `ConnectedAccountHealth` ALSO
 * printed the raw column as "Last refusal recorded on this account: …". What
 * aidream writes there is operator text — "the vault item
 * google_oauth_…_refresh for Google connection 7f3e2b41-… could not be resolved
 * (KeyError: 'secret')" — so the vault item's name, the connection UUID and a
 * Python exception class rendered ELEVEN times on one card, in front of a
 * non-technical person (D6, law 10).
 *
 * THE CLASS FIX PINNED BELOW: the raw column is classified ONCE into a typed
 * fault with a plain sentence and a remedy, and the generic account shape no
 * longer has a field a raw provider string can travel in — `lastError` is gone,
 * `lastRefusalSentence` is what an adapter may set, and it is the translated
 * sentence. A server lane sanitizing what aidream writes changes nothing here:
 * an unclassifiable reason still renders one honest generic sentence.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
  useAppDispatch: () => jest.fn(),
}));

jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => null,
}));

jest.mock("@/providers/google-provider/GoogleApiProvider", () => ({
  isGoogleAuthorizationCancelled: () => false,
  useGoogleAPI: () => ({ isGoogleLoaded: true }),
}));

import {
  GOOGLE_ACCOUNT_FAULT_CODES,
  classifyGoogleAccountFault,
  diagnoseGoogleConnection,
  googleAccountFaultLanguage,
} from "@/features/marketing/google/health";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import { googleAccount } from "../google-adapter";
import { ConnectedAccountHealth } from "../ConnectedAccountHealth";
import { accountHealth, type ConnectorCapabilityRollout } from "../health";
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

/** aidream's own words, from `service.py::_record_credential_failure`. */
const OPERATOR_REASONS = [
  "the vault item google_oauth_7f3e2b41_refresh for Google connection 7f3e2b41-1c2d-4a5b-9e8f-0a1b2c3d4e5f could not be resolved (KeyError: 'secret') Reconnect Google from Settings.",
  "the credential item 91b2c3d4-5e6f-4071-8293-a4b5c6d7e8f9 for Google connection 7f3e2b41-1c2d-4a5b-9e8f-0a1b2c3d4e5f could not be resolved (LookupError: missing) Reconnect Google.",
  "Google connection 7f3e2b41-1c2d-4a5b-9e8f-0a1b2c3d4e5f has no vault credential Reconnect Google from Settings.",
  "Google connection 7f3e2b41-1c2d-4a5b-9e8f-0a1b2c3d4e5f does not record its oauth_client_id Reconnect Google.",
  "Google access-token refresh for connection 7f3e2b41-1c2d-4a5b-9e8f-0a1b2c3d4e5f returned non-JSON HTTP 502",
  "Google access-token refresh failed for connection 7f3e2b41-1c2d-4a5b-9e8f-0a1b2c3d4e5f: invalid_grant Reconnect Google.",
  "Google access is temporarily unavailable because the platform OAuth client configuration was rejected. This requires a platform repair.",
  "Google connection 7f3e2b41-1c2d-4a5b-9e8f-0a1b2c3d4e5f is missing required scope(s): https://www.googleapis.com/auth/drive.file. Reconnect the account and grant the requested access.",
  "CheckViolation: users_integration_connections_status_check on relation users.integration_connections",
];

/** The fragments that must never reach a person, whatever the reason was. */
const LEAKS = [
  "google_oauth_7f3e2b41_refresh",
  "7f3e2b41-1c2d-4a5b-9e8f-0a1b2c3d4e5f",
  "91b2c3d4-5e6f-4071-8293-a4b5c6d7e8f9",
  "KeyError",
  "LookupError",
  "oauth_client_id",
  "invalid_grant",
  "CheckViolation",
  "non-JSON",
  "https://www.googleapis.com/auth/drive.file",
];

function row(
  overrides: Partial<GoogleConnectionSummary> = {},
): GoogleConnectionSummary {
  return {
    id: "7f3e2b41-1c2d-4a5b-9e8f-0a1b2c3d4e5f",
    owner_type: "user",
    owner_user_id: "4cf62e4e-2679-484f-b652-034e697418df",
    organization_id: null,
    provider: "google",
    provider_subject: "10293847",
    account_email: "probe@example.com",
    account_name: null,
    scopes: [
      ...new Set([
        ...provider.identityScopes,
        ...provider.products.flatMap((product) => product.scopes),
      ]),
    ],
    status: "needs_attention",
    last_verified_at: "2026-09-17T12:00:00Z",
    last_error: OPERATOR_REASONS[0],
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-17T12:00:00Z",
    metadata: {},
    credential_present: true,
    credential_stable: true,
    capability_health: { __kind: "google_connection_capability_health" },
    health: "needs_reauth",
    ...overrides,
  };
}

describe("the account fault vocabulary", () => {
  it("classifies every reason aidream actually writes", () => {
    const classified = OPERATOR_REASONS.map((reason) =>
      classifyGoogleAccountFault(reason),
    );
    // The last one is a database dump nobody wrote for a person: it must land
    // on `unknown`, and every other one must land on a real fault.
    expect(classified.slice(0, -1)).not.toContain("unknown");
    expect(classified[classified.length - 1]).toBe("unknown");
    for (const fault of classified) {
      expect(GOOGLE_ACCOUNT_FAULT_CODES).toContain(fault);
    }
  });

  it("has a sentence with no machine text for every fault in the vocabulary", () => {
    for (const fault of GOOGLE_ACCOUNT_FAULT_CODES) {
      const language = googleAccountFaultLanguage(fault, "probe@example.com");
      expect(language.reason).toMatch(/[.!?]$/);
      expect(language.reason).not.toMatch(/[a-z0-9]_[a-z0-9]/i);
      expect(language.reason).not.toContain("http");
      expect(language.label).not.toContain("_");
    }
  });

  it("says something on our side needs repair when it cannot classify at all", () => {
    const language = googleAccountFaultLanguage("unknown", "probe@example.com");
    expect(language.reason.toLowerCase()).toContain("needs repair");
  });

  it("never returns the server's text as the reason of a flagged connection", () => {
    for (const reason of OPERATOR_REASONS) {
      const diagnosis = diagnoseGoogleConnection(row({ last_error: reason }));
      expect(diagnosis.blocking).toBe(true);
      for (const leak of LEAKS) {
        expect(diagnosis.reason).not.toContain(leak);
        expect(diagnosis.remedy ?? "").not.toContain(leak);
      }
      expect(diagnosis.reason).not.toBe(reason);
    }
  });
});

describe("the generic account shape", () => {
  it("carries a translated sentence and no raw provider text", () => {
    for (const reason of OPERATOR_REASONS) {
      const account = googleAccount(row({ last_error: reason }));
      const spoken = [
        account.statusLabel,
        account.statusReason,
        account.statusRemedy ?? "",
        account.lastRefusalSentence ?? "",
      ].join(" ");
      for (const leak of LEAKS) expect(spoken).not.toContain(leak);
    }
  });
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("the settings card for an account that needs attention", () => {
  it("prints no vault item, no connection id and no exception class anywhere", () => {
    const account = googleAccount(row());
    container = document.createElement("div");
    document.body.appendChild(container);
    const mounted = createRoot(container);
    root = mounted;
    act(() =>
      mounted.render(
        <ConnectedAccountHealth
          provider={provider}
          account={account}
          health={accountHealth({ provider, account, rollout: LIVE })}
          onReconnect={() => {}}
          onReconnectAccount={() => {}}
          onRevoke={() => {}}
          busy={[]}
        />,
      ),
    );
    const shown = container.textContent ?? "";
    // Eleven copies of the machine sentence is what this rendered before.
    for (const leak of LEAKS) expect(shown).not.toContain(leak);
    expect(shown).toContain("probe@example.com");
  });
});
