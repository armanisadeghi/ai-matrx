/**
 * 🚨 THE HEADER CONTROL NAMES THE WORKSPACE IT IS SITTING IN.
 *
 * The Acquisition Console walk (2026-09-20, round 3, `console-1440-light.png`)
 * caught this trigger still reading "Choose org" — in red — with "AI Matrx"
 * plainly selected and checked in its own still-open dropdown. The control was
 * telling the person the opposite of what was true about its own state, which
 * is the same class as a dead-looking control: a screen is absent or honest,
 * never lying by omission (root CLAUDE.md law 4).
 *
 * This button stays mounted after a selection for exactly one reason — the
 * popover is still open, so the user can reach "Set as default", which only
 * enables once an org is active. That beat is the whole defect: the label was
 * written for the pre-selection state and never re-read for the one state the
 * component deliberately keeps itself alive for.
 *
 * The second case is the forcing one: against the pre-fix component it fails on
 * the label ("Choose org"), the colour (warning red) and the `aria-label`.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const store = {
  organization_id: null as string | null,
  organization_name: null as string | null,
  orgBootstrapResolved: true,
  orgBootstrapFailure: null as string | null,
};

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({ appContext: store }),
  useAppDispatch: () => () => {},
}));

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

// The picker body is the canonical primitive and carries its own proofs; this
// file is about the TRIGGER's own label, so the body renders nothing.
jest.mock("@/features/organizations/components/OrganizationPickerPanel", () => ({
  OrganizationPickerPanel: () => null,
}));

// Radix's Popover needs layout APIs jsdom does not implement. The trigger is
// handed to it through `asChild`, so a pass-through keeps the real button
// markup — which is the only thing under test — and drops the portal.
jest.mock("@ai-matrx/design-system", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require("react") as typeof import("react");
  const KEY = "__onOpenChange";
  return {
    Popover: ({
      children,
      onOpenChange,
    }: {
      children: React.ReactNode;
      onOpenChange?: (open: boolean) => void;
    }) =>
      R.Children.toArray(children).map((child, index) =>
        R.isValidElement(child)
          ? R.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
              key: index,
              [KEY]: onOpenChange,
            })
          : child,
      ),
    PopoverTrigger: ({
      children,
      ...rest
    }: {
      children: React.ReactNode;
    } & Record<string, unknown>) =>
      R.cloneElement(
        R.Children.only(children) as React.ReactElement<Record<string, unknown>>,
        {
          onClick: () =>
            (rest[KEY] as ((open: boolean) => void) | undefined)?.(true),
        },
      ),
    PopoverContent: () => null,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const HeaderChooseOrgButton =
  require("./HeaderChooseOrgButton").default as React.ComponentType;

let host: HTMLElement;
let root: Root;

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(React.createElement(HeaderChooseOrgButton));
  });
}

function rerender() {
  act(() => {
    root.render(React.createElement(HeaderChooseOrgButton));
  });
}

function trigger(): HTMLButtonElement {
  const button = host.querySelector("button");
  if (!button) throw new Error("the header org control did not render at all");
  return button as HTMLButtonElement;
}

/** Open the popover the way a person does, so the button stays mounted. */
function openPicker() {
  act(() => {
    trigger().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("HeaderChooseOrgButton — the trigger tells the truth about itself", () => {
  beforeEach(() => {
    store.organization_id = null;
    store.organization_name = null;
    store.orgBootstrapResolved = true;
    store.orgBootstrapFailure = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  it("asks for a workspace, in warning red, while none is chosen", () => {
    mount();

    expect(trigger().textContent).toContain("Choose org");
    expect(trigger().className).toContain("text-red-600");
    expect(trigger().getAttribute("aria-label")).toBe("Choose an organization");
  });

  it("names the chosen workspace, and drops the warning red, the moment one is chosen", () => {
    mount();
    openPicker();

    // The selection the still-open picker just made.
    store.organization_id = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
    store.organization_name = "AI Matrx";
    rerender();

    expect(trigger().textContent).toContain("AI Matrx");
    expect(trigger().textContent).not.toContain("Choose org");
    expect(trigger().className).not.toContain("text-red-600");
    expect(trigger().getAttribute("aria-label")).toBe(
      "Workspace: AI Matrx. Change workspace",
    );
  });

  it("never falls back to 'Choose org' when the chosen workspace has no name yet", () => {
    mount();
    openPicker();

    store.organization_id = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
    store.organization_name = null;
    rerender();

    expect(trigger().textContent).not.toContain("Choose org");
    expect(trigger().textContent).toContain("Change workspace");
    expect(trigger().className).not.toContain("text-red-600");
  });
});
