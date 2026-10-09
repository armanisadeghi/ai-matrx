/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ConsentRequest } from "../consent-plan";
import type { ConnectorCapabilityRollout } from "../health";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const run = jest.fn<
  Promise<{ connectionId: string }>,
  [ConsentRequest, unknown?]
>(async () => ({ connectionId: "chat-reviewer" }));

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
jest.mock("@/providers/google-provider/GoogleApiProvider", () => ({
  isGoogleAuthorizationCancelled: () => false,
  useGoogleAPI: () => ({ isGoogleLoaded: true }),
}));
jest.mock("../gmail-read-disclosure", () => ({
  confirmGmailReadDisclosure: async () => true,
  confirmGmailChangesDisclosure: async () => true,
}));
jest.mock("../google-adapter", () => ({
  useGoogleConsentRunner: () => ({ run, ready: true }),
  consentFailureAnswer: (cause: unknown) => ({
    sentence: String(cause),
    details: null,
  }),
}));

import { ConnectorConsentBody } from "../ConnectorConsentDialog";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";
import { GOOGLE_IDENTITY_SCOPES, GOOGLE_SCOPE } from "@/lib/googleScopes";

const provider = GOOGLE_CONNECTOR_PROVIDER;
const rollout: ConnectorCapabilityRollout[] = [
  ...new Set(provider.products.flatMap((product) => product.capabilityKeys)),
].map((capabilityKey) => ({
  capabilityKey,
  phase: "available",
  eligible: capabilityKey === "chat_messages",
  requiredScopes: [],
  ineligibleReason: null,
}));

const personalAccount = {
  id: "chat-reviewer",
  label: "reviewer@harbordental.test",
  ownerKind: "person" as const,
  organizationId: null,
  providerSubject: "chat-reviewer-subject",
  grantedScopes: [...GOOGLE_IDENTITY_SCOPES],
  usable: true,
  statusLabel: "Connected",
  statusReason: "This account is connected.",
  statusRemedy: null,
  lastVerifiedAt: null,
  lastRefusalSentence: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  run.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test("the canonical dialog requests only Chat text preview for the selected personal account", async () => {
  await act(async () => {
    root.render(
      <ConnectorConsentBody
        provider={provider}
        accounts={[personalAccount]}
        rollout={rollout}
        isLoading={false}
        rolloutUnavailable={false}
        errorMessage={null}
        refetch={async () => {}}
        initialAccountId={personalAccount.id}
        initialProductKeys={["chat_messages"]}
      />,
    );
  });

  expect(
    container
      .querySelector('[role="switch"][aria-label="Do not connect Google Chat messages"]')
      ?.getAttribute("data-state"),
  ).toBe("checked");
  expect(container.textContent).toContain("Nothing is saved, synced, or sent to an AI model");

  const connect = Array.from(container.querySelectorAll("button")).find(
    (button) => (button.textContent ?? "").includes(provider.dialog.cta),
  );
  if (!connect) throw new Error("Google Chat connect control did not render.");
  await act(async () => {
    connect.click();
  });

  expect(run).toHaveBeenCalledTimes(1);
  const [request, options] = run.mock.calls[0] ?? [];
  expect(request?.connectionPurpose).toBe("google_products");
  expect(request?.capabilityKeys).toEqual(["chat_messages"]);
  expect(request?.products.map((product) => product.key)).toEqual(["chat_messages"]);
  expect(request?.scopes).toEqual([
    ...GOOGLE_IDENTITY_SCOPES,
    GOOGLE_SCOPE.chatMessagesReadonly,
  ]);
  expect(request?.addedScopes).toEqual([GOOGLE_SCOPE.chatMessagesReadonly]);
  expect(request?.targetAccountId).toBe(personalAccount.id);
  expect(options).toEqual({
    owner: { type: "user" },
    loginHint: personalAccount.label,
  });
});

test("the canonical dialog refuses Chat preview for an organization account", async () => {
  await act(async () => {
    root.render(
      <ConnectorConsentBody
        provider={provider}
        accounts={[{ ...personalAccount, id: "organization-chat", ownerKind: "organization" }]}
        rollout={rollout}
        isLoading={false}
        rolloutUnavailable={false}
        errorMessage={null}
        refetch={async () => {}}
        initialAccountId="organization-chat"
        initialProductKeys={["chat_messages"]}
      />,
    );
  });

  const connect = Array.from(container.querySelectorAll("button")).find(
    (button) => (button.textContent ?? "").includes(provider.dialog.cta),
  );
  if (!connect) throw new Error("Google Chat connect control did not render.");
  await act(async () => {
    connect.click();
  });

  expect(run).not.toHaveBeenCalled();
  expect(container.textContent).toContain(
    "Google Chat messages can connect only to your own Google account",
  );
});
