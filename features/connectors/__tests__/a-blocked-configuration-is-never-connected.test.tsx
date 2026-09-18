/**
 * "CONNECTED" IS NEVER A BOOLEAN THAT LIES — INCLUDING WHEN THE FAULT IS OURS.
 *
 * THE DEFECT THIS PINS (VERIFY-U-P2-R5, V17-1; chair ruling R22). Google rejects
 * AI Matrx's OWN OAuth client configuration, so not one token can be minted for
 * any account. The server records that as `platform_configuration` and
 * deliberately leaves the row `connected`, because it is not a credential
 * failure and a Reconnect cannot help. Nothing then took over saying the account
 * was BLOCKED, so the verifier rendered this card from exactly the row below and
 * read:
 *
 *   account badge "Connected" · "9 of 9 products in use" · all nine rows
 *   "Connected" with their promises · and one warning line saying Google had
 *   rejected AI Matrx's own app configuration and approving it again would not
 *   help.
 *
 * The word "Connected" appeared TEN times on a card whose own law is that it
 * never says so falsely — directly above a sentence saying no Google account
 * could be used. Every sync, every agent read and every reviewed send through
 * that account failed while the screen said nine products were in use.
 *
 * THE CLASS FIX, measured here: the status vocabulary gained a third terminal
 * word (`unavailable`), the derived health answers it from the fault the row
 * already carries, `productHealth` renders it as `Blocked` with no press, and the
 * consent plan refuses to call it "already connected".
 *
 * RED before the fix, against this file's own inputs: `derived health` was
 * `connected`, nine rows were `connected`, the DOM carried "Connected" ten times
 * and "9 of 9 products in use", and `buildConsentPlan` reported all nine products
 * `alreadyGranted`.
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

import { diagnoseGoogleConnection } from "@/features/marketing/google/health";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import { googleAccount } from "../google-adapter";
import { ConnectedAccountHealth } from "../ConnectedAccountHealth";
import { accountHealth, type ConnectorCapabilityRollout } from "../health";
import { buildConsentPlan, emptyPlanAnswer } from "../consent-plan";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";
import {
  connectionSummary,
  type ConnectionRow,
} from "@/features/marketing/google/service";

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

/** The declared sentence aidream stores for this fault, verbatim. */
const SERVER_SENTENCE =
  "Google rejected AI Matrx's own app configuration, so no Google account can be used right now. This one is ours to repair — reconnecting will not help.";

/**
 * THE VERIFIER'S OWN ROW, read through the real column reader — `status`
 * `connected`, a live credential, and the server's typed stamp. Built through
 * the real `connectionSummary` rather than hand-setting `health`, because the
 * derivation IS the thing under test.
 */
function blockedRow(
  overrides: Partial<ConnectionRow> = {},
): GoogleConnectionSummary {
  return connectionSummary({
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
    status: "connected",
    last_verified_at: "2026-09-17T12:00:00Z",
    last_error: SERVER_SENTENCE,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-17T12:00:00Z",
    metadata: { credential_failure: { code: "platform_configuration" } },
    credential_present: true,
    credential_stable: true,
    capability_health: { __kind: "connection_capability_health" },
    ...overrides,
  });
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

function renderCard(connection: GoogleConnectionSummary): HTMLDivElement {
  const account = googleAccount(connection);
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
  return container;
}

describe("a Google account our own configuration blocks", () => {
  it("derives `unavailable` from the fault the row already carries", () => {
    const row = blockedRow();
    expect(row.status).toBe("connected");
    expect(row.credential_present).toBe(true);
    // The whole point: the STORED word says connected and the derived truth does
    // not, exactly as it already did for a row that lost its credential.
    expect(row.health).toBe("unavailable");
    expect(googleAccount(row).usable).toBe(false);
    expect(googleAccount(row).blocked).toBe(true);
  });

  it("states the declared sentence and offers no remedy at all", () => {
    const diagnosis = diagnoseGoogleConnection(blockedRow());
    expect(diagnosis.blocking).toBe(true);
    expect(diagnosis.remedy).toBeNull();
    expect(diagnosis.label).toBe("Ours to repair");
    expect(diagnosis.reason).toContain("ours to repair");
  });

  it("renders every product row as Blocked, with no press on any of them", () => {
    const account = googleAccount(blockedRow());
    const rows = accountHealth({ provider, account, rollout: LIVE });
    expect(rows.length).toBeGreaterThanOrEqual(9);
    for (const row of rows) {
      expect({ product: row.product.key, state: row.state }).toEqual({
        product: row.product.key,
        state: "unavailable",
      });
      expect(row.label).toBe("Blocked");
      expect(row.actionLabel).toBeNull();
      expect(row.actionScope).toBeNull();
      expect(row.togglable).toBe(false);
    }
  });

  it("never prints the word Connected, and never counts products in use", () => {
    const shown = renderCard(blockedRow()).textContent ?? "";
    expect(shown).not.toContain("Connected");
    expect(shown).not.toMatch(/\d+ of \d+ products in use/);
    expect(shown).toContain("None of these 9 products can be used right now");
    // The declared sentence, on the account line and on every row it breaks.
    expect(shown).toContain("This one is ours to repair");
    expect(shown).toContain("probe@example.com");
  });

  it("offers no Reconnect anywhere on the card", () => {
    const dom = renderCard(blockedRow());
    const labels = [...dom.querySelectorAll("button")].map(
      (button) => button.textContent ?? "",
    );
    expect(labels.filter((label) => /Reconnect/.test(label))).toEqual([]);
    expect(labels.filter((label) => /Connect\b/.test(label))).toEqual([]);
    // The one control that still makes sense is the account's own removal.
    expect(labels.some((label) => label.includes("Disconnect"))).toBe(true);
  });

  it("answers a consent press honestly instead of reporting it already connected", () => {
    const account = googleAccount(blockedRow());
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: provider.products.map((product) => product.key),
      account,
      rollout: LIVE,
    });
    expect(plan.request).toBeNull();
    expect(plan.empty).toBe(true);
    expect(plan.alreadyGranted).toEqual([]);
    expect(plan.blocked).toHaveLength(provider.products.length);
    const answer = emptyPlanAnswer(plan, provider.products.length);
    expect(answer).not.toContain("already connected — there is nothing to approve");
    expect(answer).toContain("ours to repair");
  });
});

describe("a status word this build has never heard of", () => {
  const row = () => blockedRow({ status: "suspended_by_provider", metadata: {} });

  it("is never read as connected, and keeps the word for an operator", () => {
    expect(row().status).toBe("unrecognized");
    expect(row().status_as_read).toBe("suspended_by_provider");
    expect(row().health).toBe("unrecognized");
    expect(googleAccount(row()).blocked).toBe(true);
  });

  it("renders with no live control and no machine token on the screen", () => {
    const dom = renderCard(row());
    const shown = dom.textContent ?? "";
    expect(shown).not.toContain("Connected");
    // D6: the raw word is an address, not a sentence — it belongs to the admin
    // diagnostics list, never to the person's card.
    expect(shown).not.toContain("suspended_by_provider");
    expect(shown).toContain("cannot tell what state");
    const labels = [...dom.querySelectorAll("button")].map(
      (button) => button.textContent ?? "",
    );
    expect(labels.filter((label) => /Reconnect|Connect\b/.test(label))).toEqual([]);
  });
});
