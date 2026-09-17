/**
 * A SERVER CODE NEVER REACHES THE SCREEN — and the code the hub can actually
 * raise always has a sentence.
 *
 * THE DEFECT THIS PINS (VERIFY-U-P2-R2, N4). `resolve_google_product_selection`
 * can refuse a whole selection with `google_products_rollout_conflict` and the
 * message "None of the selected Google products is available to this account yet:
 * calendar (google_oauth_internal_test_required)". That code was missing from
 * `GOOGLE_ADMISSION_CODES` — the round-1 census regex only matched a code written
 * as the FIRST token of the raise, and this one sits inside a conditional
 * expression — and both consent surfaces rendered exchange failures with
 * `extractErrorMessage(cause)` verbatim, so capability keys and codes reached the
 * person (D6 in reverse).
 *
 * THE RULING: add the code with a plain sentence; every unmapped server code
 * renders ONE honest generic sentence plus a "details" disclosure, never the raw
 * code inline.
 *
 * THE CLASS FIX PINNED BELOW: one translator (`consentFailureAnswer`) owns every
 * press failure on every consent surface, a sentence-safety rule keeps machine
 * text out of the inline answer whether or not the code is known, and the census
 * in `admission-codes-are-the-servers-codes.test.ts` now reads the code out of
 * the conditional it lives in.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/lib/toast", () => ({
  toast: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
  useAppDispatch: () => jest.fn(),
}));

jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => null,
}));

jest.mock("@/features/scopes/redux/selectors/tree", () => ({
  selectOrganizationsList: () => [],
}));

jest.mock("@/providers/google-provider/LazyGoogleAPIProvider", () => ({
  LazyGoogleAPIProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("@/providers/google-provider/GoogleApiProvider", () => ({
  isGoogleAuthorizationCancelled: () => false,
  useGoogleAPI: () => ({ isGoogleLoaded: true }),
}));

/**
 * The real translator and the real map — only the two hooks are replaced, and
 * the runner rejects with the hub's verbatim refusal.
 */
jest.mock("../google-adapter", () => {
  const actual = jest.requireActual("../google-adapter");
  return {
    ...actual,
    useGoogleConsentRunner: () => ({
      run: () => Promise.reject(rejection()),
      ready: true,
    }),
    useGoogleConnectorState: () => ({
      accounts: [],
      rollout: [],
      resourceCountByAccount: {},
      isLoading: false,
      rolloutUnavailable: false,
      isError: false,
      errorMessage: null,
      refetch: async () => {},
    }),
  };
});

import { BackendApiError } from "@/lib/api/errors";
import { ConnectorConsentBody } from "../ConnectorConsentDialog";
import {
  ADMISSION_LANGUAGE,
  GOOGLE_ADMISSION_CODES,
  GOOGLE_FAILURE_LANGUAGE,
  GOOGLE_GENERIC_FAILURE_SENTENCE,
  consentFailureAnswer,
} from "../google-adapter";
import type { ConnectorAccount, ConnectorCapabilityRollout } from "../health";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";

const provider = GOOGLE_CONNECTOR_PROVIDER;

/** The hub's real refusal, verbatim — codes and capability keys included. */
const ROLLOUT_CONFLICT = new BackendApiError({
  code: "google_products_rollout_conflict",
  detail:
    "None of the selected Google products is available to this account yet: calendar (google_oauth_internal_test_required)",
  userMessage:
    "None of the selected Google products is available to this account yet: calendar (google_oauth_internal_test_required)",
  status: 403,
});

function rejection(): unknown {
  return ROLLOUT_CONFLICT;
}

describe("the admission map carries the selection-wide refusal", () => {
  it("has a sentence for it, with no code in it", () => {
    expect(GOOGLE_ADMISSION_CODES).toContain("google_products_rollout_conflict");
    const sentence = ADMISSION_LANGUAGE.google_products_rollout_conflict;
    expect(sentence).toBeTruthy();
    expect(sentence).not.toContain("_");
  });
});

describe("the one press-failure translator", () => {
  it("answers a known code with our sentence and keeps the server text in details", () => {
    const answer = consentFailureAnswer(ROLLOUT_CONFLICT);
    expect(answer.sentence).toBe(
      GOOGLE_FAILURE_LANGUAGE.google_products_rollout_conflict,
    );
    expect(answer.sentence).not.toContain("_");
    expect(answer.details).toContain("google_oauth_internal_test_required");
  });

  it("answers an UNKNOWN code with one honest sentence, never the code", () => {
    const answer = consentFailureAnswer(
      new BackendApiError({
        code: "google_something_the_hub_learned_today",
        detail: "capability_key=drive_files rejected by policy_engine",
        userMessage: "capability_key=drive_files rejected by policy_engine",
        status: 409,
      }),
    );
    expect(answer.sentence).toBe(GOOGLE_GENERIC_FAILURE_SENTENCE);
    expect(answer.sentence).not.toContain("_");
    expect(answer.details).toContain("capability_key=drive_files");
  });

  it("keeps our own plain-English failures exactly as written", () => {
    const ours = new Error(
      "Choose an organization before connecting Google — every connection is recorded against one.",
    );
    const answer = consentFailureAnswer(ours);
    expect(answer.sentence).toBe(ours.message);
    expect(answer.details).toBeNull();
  });

  it("refuses to inline anything that reads like machine text", () => {
    const answer = consentFailureAnswer(
      new Error("PGRST205 relation users.integration_connections does not exist"),
    );
    expect(answer.sentence).toBe(GOOGLE_GENERIC_FAILURE_SENTENCE);
    expect(answer.details).toContain("PGRST205");
  });

  it("every sentence it can produce is free of machine text", () => {
    for (const sentence of [
      ...Object.values(GOOGLE_FAILURE_LANGUAGE),
      GOOGLE_GENERIC_FAILURE_SENTENCE,
    ]) {
      expect(sentence).not.toContain("_");
      expect(sentence).not.toContain("http");
    }
  });
});

const LIVE: ConnectorCapabilityRollout[] = [
  ...new Set(provider.products.flatMap((product) => product.capabilityKeys)),
].map((capabilityKey) => ({
  capabilityKey,
  phase: "available" as const,
  eligible: true,
  requiredScopes: [],
  ineligibleReason: null,
}));

const ACCOUNT: ConnectorAccount = {
  id: "c1",
  label: "one@aimatrx.com",
  ownerKind: "person",
  organizationId: null,
  providerSubject: "sub-c1",
  grantedScopes: [...provider.identityScopes],
  usable: true,
  statusLabel: "Connected",
  statusReason: "This account can authorize Google calls.",
  statusRemedy: null,
  lastVerifiedAt: "2026-09-17T00:00:00Z",
  lastError: null,
  activity: {},
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("the dialog's failure area", () => {
  it("shows the sentence, and the raw text only behind the details control", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const mounted = createRoot(container);
    root = mounted;
    act(() =>
      mounted.render(
        <ConnectorConsentBody
          provider={provider}
          accounts={[ACCOUNT]}
          rollout={LIVE}
          isLoading={false}
          rolloutUnavailable={false}
          errorMessage={null}
          refetch={async () => {}}
          initialProductKeys={["calendar"]}
        />,
      ),
    );
    const cta = [...container!.querySelectorAll("button")].find((node) =>
      (node.textContent ?? "").includes(provider.dialog.cta),
    );
    await act(async () => {
      cta!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const shown = container!.textContent ?? "";
    expect(shown).toContain(
      GOOGLE_FAILURE_LANGUAGE.google_products_rollout_conflict,
    );
    expect(shown).not.toContain("google_oauth_internal_test_required");
    const details = [...container!.querySelectorAll("button")].find((node) =>
      /details/i.test(node.textContent ?? ""),
    );
    expect(details).toBeDefined();
    act(() => {
      details!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container!.textContent ?? "").toContain(
      "google_oauth_internal_test_required",
    );
  });
});
