/**
 * 🚨 PLAN §4 (fixed sections) + §5.3 — A SYNCED RECORD'S HEALTH STRIP TELLS THE
 * TRUTH FROM THE SERVER'S OWN `capability_health` ROW, AND OFFERS THE SAME
 * RECONNECT THE CONNECTOR ROWS OFFER.
 *
 * THE DEFECT THIS PINS (VERIFY-U-P1-R4, § The health strip). The primitive's
 * strip has been complete since its first commit and NO record could render it:
 * `resolveItemDetailType` — the ONE producer of registrations in app code — never
 * set `health`, so with a live refusal recorded against the grant a record
 * depends on, the record said nothing at all. Four verification rounds could not
 * answer the brief's own question.
 *
 * The fixture is the live column the recording seam writes (aidream
 * `services/google_integrations/call_health.py`), read through the REAL parser
 * and the REAL `productHealth` derivation — this file hand-builds no activity
 * map, and it is not a second reader of `capability_health`.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { DetailBody } from "@/lib/detail/core/DetailBody";
import { useDetailCore } from "@/lib/detail/core/useDetailCore";
import { DetailHostProvider, type DetailHostPorts } from "@/lib/detail/host";
import { GOOGLE_CAPABILITY_HEALTH_KIND } from "@/features/connectors/google-capability-health";
import type { DetailRow } from "@/lib/detail/types";

import { sourceHealthProducerFor } from "../sourceHealth";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";

/** Exactly what the seam leaves behind after Google answered a send with a 401. */
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

const CONNECTION = {
  id: "conn-1",
  owner_type: "user" as const,
  owner_user_id: "u1",
  organization_id: null,
  provider: "google" as const,
  provider_subject: "sub-1",
  account_email: "info@aimatrx.com",
  account_name: "Matrx",
  scopes: [GMAIL_SEND],
  status: "connected" as const,
  last_verified_at: "2026-09-17T13:00:00Z",
  last_error: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-09-17T13:00:00Z",
  metadata: {},
  credential_present: true,
  credential_stable: true,
  health: "connected" as const,
  capability_health: REFUSED_COLUMN,
};

/** Same account, but Google (or our own configuration) refuses everything —
 * V17-1's "blocked" reading, never merely "unusable". No `capability_health`
 * refusal is needed: `account.blocked` alone outranks every other state. */
const BLOCKED_CONNECTION = {
  ...CONNECTION,
  id: "conn-2",
  health: "unavailable" as const,
  capability_health: null,
};

jest.mock("@/features/marketing/google/service", () => ({
  listGoogleConnectionInventory: jest.fn(async () => ({
    connections: [CONNECTION],
    resources: [],
  })),
  listGoogleCapabilities: jest.fn(async () => [
    {
      key: "gmail_send",
      rollout_phase: "available",
      eligible: true,
      required_scopes: [{ scope: GMAIL_SEND }],
      admission_error: null,
    },
  ]),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires -- the mocked
// module's own factory above, re-imported so a test can swap its resolved
// value per-mount without a second `jest.mock` block.
const googleService = jest.requireMock("@/features/marketing/google/service") as {
  listGoogleConnectionInventory: jest.Mock;
};

/** A Gmail message mirrored into the platform — the row a Detail would load. */
const SYNCED_EMAIL: DetailRow = {
  id: "11111111-2222-3333-4444-555555555555",
  provider: "google",
  external_id: "18f0c0ffee",
  subject: "Quarterly plan",
  last_refreshed_at: "2026-09-17T12:00:00Z",
  web_url: "https://mail.google.com/mail/u/0/#inbox/18f0c0ffee",
};

const EMAIL_TYPE = {
  type: "email",
  label: "Email",
  icon: ({ className }: { className?: string }) => <span className={className} />,
  accent: null,
  entityToken: null,
  load: async () => ({ row: SYNCED_EMAIL }),
  title: () => "Quarterly plan",
  fields: () => [],
  // The wiring under test: the same producer `resolveItemDetailType` attaches.
  health: sourceHealthProducerFor("email"),
};

const reconnect = jest.fn();

function ports(): DetailHostPorts {
  return {
    resolveType: () => EMAIL_TYPE,
    usePresentationSetting: () => ({ value: "window", error: null }),
    resolvePresentation: async () => "window",
    warmPresentation: () => {},
    open: () => {},
    close: () => {},
    navigate: {
      pageHref: () => "/detail/email/x",
      toPage: () => {},
      back: () => {},
      canGoBack: () => false,
      toRecordHome: () => {},
    },
    shells: {},
    doors: {
      RecordDoors: () => null,
      RefCell: ({ value }: { value: string }) => <span>{value}</span>,
      tokenFromColumnName: () => null,
      isUuidValue: (v: unknown): v is string => typeof v === "string",
      hasDoor: () => false,
    },
    associations: { defaultTokens: [], canAnchor: () => false },
    history: { list: async () => [] },
    notify: { error: () => {}, success: () => {} },
    copyText: async () => true,
    reconnectSource: reconnect,
  } as unknown as DetailHostPorts;
}

function Detail() {
  const core = useDetailCore(
    { type: "email", id: SYNCED_EMAIL.id as string, seed: null, list: null },
    "window",
    { onClose: () => {} },
  );
  return <DetailBody core={core} />;
}

async function mountDetail() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <DetailHostProvider ports={ports()}>
        <Detail />
      </DetailHostProvider>,
    );
  });
  // The row load and the health read are two awaited hops.
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("a Gmail-synced record whose grant has been refused", () => {
  it("shows the health strip at all", async () => {
    const m = await mountDetail();
    expect(m.container.querySelector("[data-detail-health]")).not.toBeNull();
    m.unmount();
  });

  it("states the provider's own sentence, and names the source", async () => {
    const m = await mountDetail();
    const strip = m.container.querySelector("[data-detail-health]")!;
    expect(strip.textContent).toContain("Google");
    expect(strip.textContent).toContain("no longer honouring");
    m.unmount();
  });

  it("offers the SAME Reconnect the connector rows offer, and it reaches the host", async () => {
    reconnect.mockClear();
    const m = await mountDetail();
    const strip = m.container.querySelector("[data-detail-health]")!;
    const button = Array.from(strip.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Reconnect"),
    );
    expect(button).toBeDefined();
    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(reconnect).toHaveBeenCalledTimes(1);
    m.unmount();
  });

  it("still opens the record at its source", async () => {
    const m = await mountDetail();
    const link = m.container
      .querySelector("[data-detail-health]")!
      .querySelector("a[href]");
    expect(link?.getAttribute("href")).toContain("mail.google.com");
    m.unmount();
  });
});

/**
 * 🚨 THE `blocked` WORD (chair, 2026-09-18) — `lib/detail/types.ts`'s grant
 * vocabulary gained a THIRD reading between "reconnect will fix it" (expired
 * missing / revoked) and "we do not know" (unknown): a source the provider or
 * our own configuration refuses OUTRIGHT, where no control anywhere repairs
 * it. `sourceHealth.ts::grantStateFor` used to fold this into `unknown`
 * because the word did not exist yet — the case a real reconnect button
 * would offer for nothing. `reconnectFor` in `useDetailHealth.ts` already
 * refuses a `blocked` grant a press structurally; this pins the PRODUCER side.
 */
describe("a synced record the provider (or our own configuration) blocks outright", () => {
  afterEach(() => {
    // Every hop the health producer makes re-resolves this mock — restore the
    // default (the standing-refusal connection) so later files/tests never
    // inherit the blocked fixture.
    googleService.listGoogleConnectionInventory.mockImplementation(async () => ({
      connections: [CONNECTION],
      resources: [],
    }));
  });

  it("renders the BLOCKED state word and offers no Reconnect", async () => {
    googleService.listGoogleConnectionInventory.mockImplementation(async () => ({
      connections: [BLOCKED_CONNECTION],
      resources: [],
    }));
    const m = await mountDetail();
    const strip = m.container.querySelector("[data-detail-health]")!;
    const stateWord = strip.querySelector("[data-detail-health-state]");
    expect(stateWord?.getAttribute("data-detail-health-state")).toBe("blocked");
    expect(strip.textContent).toContain("Blocked");
    const button = Array.from(strip.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Reconnect"),
    );
    expect(button).toBeUndefined();
    m.unmount();
  });

  it("positive control — a needs-attention (revoked/expired) connection still offers Reconnect", async () => {
    // The default mock (CONNECTION) carries a `grant_expired_or_revoked`
    // refusal — the ordinary "reconnect will fix it" case this file has
    // pinned since its first commit. Proves the assertions above are not
    // vacuous: a real Reconnect control still renders when one is warranted.
    const m = await mountDetail();
    const strip = m.container.querySelector("[data-detail-health]")!;
    const stateWord = strip.querySelector("[data-detail-health-state]");
    expect(stateWord?.getAttribute("data-detail-health-state")).not.toBe("blocked");
    const button = Array.from(strip.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Reconnect"),
    );
    expect(button).toBeDefined();
    m.unmount();
  });
});
