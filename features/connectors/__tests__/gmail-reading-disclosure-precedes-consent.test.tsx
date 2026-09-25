/**
 * Gmail reading has secondary CRM and agent/model uses, so the connector row
 * alone cannot stand in for affirmative consent. These tests drive the real
 * consent body and prove the disclosure is the final gate before OAuth.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { ConsentRequest } from "../consent-plan";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const confirmDisclosure = jest.fn<Promise<boolean>, [unknown]>();
let mockOrganizations: Array<{ id: string; name: string; role: string }> = [];
let mockActiveOrganizationId: string | null = null;
const run = jest.fn<
  Promise<{ connectionId: string }>,
  [ConsentRequest, unknown?]
>(async () => ({ connectionId: "connection-1" }));

jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: (options: unknown) => confirmDisclosure(options),
}));

jest.mock("@/lib/toast", () => ({
  toast: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
  useAppDispatch: () => jest.fn(),
}));

jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => mockActiveOrganizationId,
}));

jest.mock("@/features/scopes/redux/selectors/tree", () => ({
  selectOrganizationsList: () => mockOrganizations,
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

jest.mock("../google-adapter", () => ({
  useGoogleConsentRunner: () => ({ run, ready: true }),
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
  consentFailureAnswer: (cause: unknown) => ({
    sentence: String(cause),
    details: null,
  }),
}));

import { ConnectorConsentBody } from "../ConnectorConsentDialog";
import type { ConnectorCapabilityRollout } from "../health";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";

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

let container: HTMLDivElement;
let root: Root;

function mount(productKey: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <ConnectorConsentBody
        provider={provider}
        accounts={[]}
        rollout={LIVE}
        isLoading={false}
        rolloutUnavailable={false}
        errorMessage={null}
        refetch={async () => {}}
        initialProductKeys={[productKey]}
      />,
    );
  });
}

async function pressConnect() {
  const button = [...container.querySelectorAll("button")].find((node) =>
    (node.textContent ?? "").includes(provider.dialog.cta),
  );
  if (!button) throw new Error("Connector consent button was not rendered.");
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  confirmDisclosure.mockReset();
  run.mockClear();
  mockOrganizations = [];
  mockActiveOrganizationId = null;
});

describe("Gmail reading disclosure", () => {
  it("shows both Gmail uses, retention, and user-initiated model exposure", async () => {
    confirmDisclosure.mockResolvedValue(false);
    mount("gmail_read");

    await pressConnect();

    expect(confirmDisclosure).toHaveBeenCalledTimes(1);
    const firstCall = confirmDisclosure.mock.calls[0];
    if (!firstCall) throw new Error("Gmail disclosure was not requested.");
    const options = firstCall[0] as {
      title: React.ReactNode;
      description: React.ReactNode;
      confirmLabel: string;
      cancelLabel: string;
    };
    const disclosure = renderToStaticMarkup(<>{options.description}</>);
    expect(options.title).toBe("Allow AI Matrx to read Gmail?");
    expect(options.confirmLabel).toBe("Allow Gmail reading");
    expect(options.cancelLabel).toBe("Back");
    expect(disclosure).toContain("search or open Gmail");
    expect(disclosure).toContain("separately register this mailbox for outreach");
    expect(disclosure).toContain("up to 20,000 characters");
    expect(disclosure).toContain("does not erase reply data already saved in CRM");
    expect(disclosure).toContain("not automatically added to an agent");
    expect(disclosure).toContain("choose to provide Gmail content to an agent");
    expect(disclosure).toContain("configured model provider may process it");
    expect(disclosure).toContain('href="/privacy-policy"');
  });

  it("treats Back as refusal and never starts OAuth", async () => {
    confirmDisclosure.mockResolvedValue(false);
    mount("gmail_read");

    await pressConnect();

    expect(run).not.toHaveBeenCalled();
  });

  it("starts OAuth only after the affirmative Gmail-reading action", async () => {
    confirmDisclosure.mockResolvedValue(true);
    mount("gmail_read");

    await pressConnect();

    expect(confirmDisclosure).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0].capabilityKeys).toContain("gmail_read");
  });

  it("does not insert the Gmail disclosure into another scope's consent", async () => {
    mount("gmail");

    await pressConnect();

    expect(confirmDisclosure).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0].capabilityKeys).toContain("gmail_send");
    expect(run.mock.calls[0]?.[0].capabilityKeys).not.toContain("gmail_read");
  });
});

describe("Gmail changes disclosure", () => {
  it("offers only personal connection when an organization owner selects Gmail changes", () => {
    mockOrganizations = [{ id: "org-1", name: "Example Team", role: "owner" }];
    mockActiveOrganizationId = "org-1";
    mount("gmail_modify");
    expect(container.textContent).toContain("Gmail changes connect only to your personal Google account");
    expect(container.querySelector('[aria-label="Connect for Example Team"]')).toBeNull();
  });
  it("explains Google's broader grant and blocks OAuth when declined", async () => {
    confirmDisclosure.mockResolvedValue(false);
    mount("gmail_modify");
    await pressConnect();
    expect(run).not.toHaveBeenCalled();
    const options = confirmDisclosure.mock.calls[0]?.[0] as {
      title: string;
      description: React.ReactNode;
      confirmLabel: string;
    };
    expect(options.title).toBe("Allow AI Matrx to change Gmail messages?");
    expect(options.confirmLabel).toBe("Allow Gmail changes");
    const disclosure = renderToStaticMarkup(<>{options.description}</>);
    expect(disclosure).toContain("read, compose");
    expect(disclosure).toContain("send, and change mail");
    expect(disclosure).toContain("does not offer");
    expect(disclosure).toContain("Gmail Snooze");
  });

  it("requests the separate modify capability only after affirmative consent", async () => {
    confirmDisclosure.mockResolvedValue(true);
    mount("gmail_modify");
    await pressConnect();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0].capabilityKeys).toContain("gmail_modify");
    expect(run.mock.calls[0]?.[0].capabilityKeys).not.toContain("gmail_read");
    expect(run.mock.calls[0]?.[0].scopes).not.toContain(GOOGLE_SCOPE.gmailReadonly);
    expect(run.mock.calls[0]?.[0].scopes).toContain(GOOGLE_SCOPE.gmailModify);
  });
});
