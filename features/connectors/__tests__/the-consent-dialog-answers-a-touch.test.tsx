/**
 * THE CONSENT DIALOG ANSWERS A FINGER, A KEY AND A PRESS (VERIFY-U-P2 D1, D4,
 * D5, D8) — driven through a real DOM, with real clicks, on the real component.
 *
 * Four things the zero-authorship verification found, each pinned below:
 *
 *   D1 — Google's own scope wording lived only inside a Radix `Tooltip` whose
 *        trigger was a `<button>` with NO click handler. Radix tooltips open on
 *        hover and focus; a tap opens nothing. On every phone and tablet the
 *        info control beside all nine rows was dead — on the exact affordance
 *        PLAN §2 puts the dialog's honesty on. The click below is what a tap
 *        dispatches, and before the fix it revealed nothing.
 *   D5 — PLAN §2 asks for two groups, "each collapsible". They were a plain
 *        `<section>` and an `<h3>`: nothing to collapse, on a dialog that is
 *        nine rows and two headers long on a phone.
 *   D4 — the account line was `Connecting as info@aimatrx.com.` with no control,
 *        and every consent the dialog could start added to an account that
 *        already existed. PLAN §2 asks for "change", and for a different Google
 *        login to become a second connected account.
 *   D8 — pressing "Connect selected" with nothing switched on was impossible
 *        rather than answered: a disabled button, which on a phone cannot be
 *        interrogated at all.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ConnectorAccount, ConnectorCapabilityRollout } from "../health";

const toastInfo = jest.fn();

jest.mock("@/lib/toast", () => ({
  toast: {
    info: (...args: unknown[]) => toastInfo(...args),
    success: jest.fn(),
    error: jest.fn(),
  },
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

const run = jest.fn();

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
  multiProductConsentUnsupported: () => false,
  MULTI_PRODUCT_CONSENT_UNSUPPORTED_MESSAGE: "not supported",
}));

import { ConnectorConsentBody } from "../ConnectorConsentDialog";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";

const provider = GOOGLE_CONNECTOR_PROVIDER;

const LIVE: ConnectorCapabilityRollout[] = [
  "drive_files",
  "docs",
  "sheets",
  "gmail_send",
  "calendar",
  "contacts",
  "tasks",
  "search_console",
  "analytics",
  "tag_manager",
  "youtube",
  "youtube_analytics",
].map((capabilityKey) => ({
  capabilityKey,
  phase: "available" as const,
  eligible: true,
  requiredScopes: [],
  ineligibleReason: null,
}));

/** The admin's real `info@aimatrx.com` row, 2026-09-17. */
const INFO: ConnectorAccount = {
  id: "c4",
  label: "info@aimatrx.com",
  ownerKind: "person",
  organizationId: null,
  providerSubject: "sub-c4",
  grantedScopes: [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/gmail.send",
  ],
  usable: true,
  statusLabel: "Connected",
  statusReason: "This account can authorize Google calls.",
  statusRemedy: null,
  lastVerifiedAt: "2026-09-14T22:11:00Z",
  lastRefusalSentence: null,
};

let container: HTMLDivElement;
let root: Root;

function mount(props: Partial<React.ComponentProps<typeof ConnectorConsentBody>>) {
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
        {...props}
      />,
    );
  });
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function buttonsByText(text: string): HTMLButtonElement[] {
  return [...container.querySelectorAll("button")].filter((node) =>
    (node.textContent ?? "").includes(text),
  );
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  toastInfo.mockReset();
  run.mockReset();
});

describe("D1 — the scope wording opens on a tap", () => {
  it("gives every product row a real disclosure button, not a hover-only trigger", () => {
    mount({ accounts: [INFO] });
    const triggers = buttonsByText("What Google is asked for");
    expect(triggers).toHaveLength(provider.products.length);
    for (const trigger of triggers) {
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(trigger.getAttribute("aria-controls")).toBeTruthy();
    }
  });

  it("reveals Google's own scope strings when the control is CLICKED", () => {
    mount({ accounts: [INFO] });
    expect(container.textContent).not.toContain(
      "https://www.googleapis.com/auth/gmail.send",
    );

    const gmailTrigger = buttonsByText("What Google is asked for")[1]!;
    click(gmailTrigger);

    expect(gmailTrigger.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(
      gmailTrigger.getAttribute("aria-controls")!,
    );
    expect(panel?.textContent).toContain(
      "https://www.googleapis.com/auth/gmail.send",
    );
    expect(panel?.textContent).toContain(
      "Send an email as you, after you have reviewed it",
    );

    click(gmailTrigger);
    expect(gmailTrigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("never prints a capability key to the person", () => {
    mount({ accounts: [INFO] });
    for (const trigger of buttonsByText("What Google is asked for")) {
      click(trigger);
    }
    const text = container.textContent ?? "";
    // Only the machine-shaped keys can be told apart from ordinary words such
    // as "calendar" and "tasks", and they are exactly the ones that leaked:
    // "drive_files · generally available", "youtube_analytics · still being
    // certified" (VERIFY-U-P2 D6).
    const machineKeys = provider.products
      .flatMap((product) => product.capabilityKeys)
      .filter((key) => key.includes("_"));
    expect(machineKeys.length).toBeGreaterThan(4);
    for (const key of machineKeys) {
      expect(text).not.toContain(key);
    }
    expect(text).not.toContain("· generally available");
    expect(text).not.toContain("still being certified");
  });
});

describe("D5 — each group is a real disclosure, open by default", () => {
  it("opens with both groups expanded and every row visible", () => {
    mount({ accounts: [INFO] });
    const groupTriggers = provider.groups.map(
      (group) => buttonsByText(group.label)[0]!,
    );
    expect(groupTriggers).toHaveLength(2);
    for (const trigger of groupTriggers) {
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
    }
    expect(container.textContent).toContain("Docs, Sheets & Drive files");
    expect(container.textContent).toContain("Search Console");
  });

  it("collapses the group it is told to collapse, and only that one", () => {
    mount({ accounts: [INFO] });
    const marketing = buttonsByText("Marketing")[0]!;
    click(marketing);
    expect(marketing.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("Search Console");
    expect(container.textContent).toContain("Docs, Sheets & Drive files");
  });
});

describe("D4 + D7 — the account is named, changeable, and can be a new one", () => {
  it("offers a labelled control for changing which account this connects", () => {
    mount({ accounts: [INFO] });
    const trigger = container.querySelector(
      "#connector-consent-account",
    ) as HTMLElement | null;
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute("aria-label")).toBe(
      "Change which Google account this connects",
    );
    expect(container.textContent).toContain("Connecting as");
    expect(container.textContent).toContain("info@aimatrx.com");
  });

  it("says plainly what happens when nothing is connected yet", () => {
    mount({ accounts: [] });
    expect(container.querySelector("#connector-consent-account")).toBeNull();
    expect(container.textContent).toContain(
      "a Google account you choose next — Google asks you to sign in.",
    );
  });
});

describe("D8 — a press that would do nothing says so", () => {
  it("keeps Connect pressable with nothing switched on and answers the press", () => {
    mount({ accounts: [] });
    const connect = buttonsByText(provider.dialog.cta)[0]!;
    expect(connect.hasAttribute("disabled")).toBe(false);

    click(connect);

    const answer = container.querySelector('[role="status"]');
    expect(answer?.textContent).toBe(
      "Nothing is switched on yet, so there is nothing to connect. Switch on what you want and press this again.",
    );
    expect(toastInfo).toHaveBeenCalledWith(
      "Nothing is switched on yet, so there is nothing to connect. Switch on what you want and press this again.",
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("answers with the other sentence when everything picked is already connected", () => {
    mount({ accounts: [INFO], initialProductKeys: ["gmail"] });
    const connect = buttonsByText(provider.dialog.cta)[0]!;
    expect(connect.hasAttribute("disabled")).toBe(false);

    click(connect);

    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "Everything you switched on is already connected — there is nothing to approve.",
    );
    expect(run).not.toHaveBeenCalled();
  });
});
