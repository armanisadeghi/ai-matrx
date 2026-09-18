/**
 * 🚨 F-40 — THE DOOR ON A PERSON'S NAME.
 *
 * The approvals queue's contact-import card names the matched Person and every
 * ambiguous candidate through `EntityRef token="party"`. RED before this change:
 * the only door was a link, so a reviewer had to leave the queue (or open a new
 * tab) to find out who the proposal was about — `hasPeek("party")` was false and
 * no window opener named an EXISTING Person.
 *
 * GREEN: the token carries a peek, so every surface that names a Person offers
 * the in-place Quick look, with no change at the call site. The registration
 * behind it — the ONE Detail primitive type map — is covered by
 * `features/item-presentation/__tests__/a-person-opens-in-place.test.tsx`.
 *
 * Browser verification cannot cover this here (the surface needs live Supabase
 * data under RLS), so the door resolution is pinned by test.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EntityRef } from "../EntityRef";

const PARTY_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

jest.mock("@/utils/supabase/client", () => ({
  __esModule: true,
  createClient: () => ({ rpc: async () => ({ data: [], error: null }) }),
  supabase: {},
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// The peek host statically drags the peek components in; this test only cares
// that EntityRef OFFERS the control for the token.
jest.mock("@/features/organizations/peek/ResourcePeekHost", () => ({
  __esModule: true,
  ResourcePeekHost: () => null,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("a Person named anywhere has an in-place door", () => {
  it("offers Quick look beside the name, and the record's route", () => {
    act(() =>
      root.render(
        <EntityRef token="party" id={PARTY_ID} name="Dana Whitfield" />,
      ),
    );
    // RED: this button did not exist for `party` — no peek was registered.
    expect(
      container.querySelector('button[title="Quick look at Dana Whitfield"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('a[title="Open Dana Whitfield"]')?.getAttribute("href"),
    ).toBe(`/crm/${PARTY_ID}`);
  });

  it("keeps Quick look when the name itself opens in a new tab (window-panel surfaces)", () => {
    // The shape the contact-import card uses: the card lives inside a window
    // panel, so the NAME must not navigate the tab underneath it. The peek is
    // the door that answers "who is this?" without leaving the queue at all.
    act(() =>
      root.render(
        <EntityRef
          token="party"
          id={PARTY_ID}
          name="Dana Whitfield"
          openInNewTab
        />,
      ),
    );
    expect(
      container.querySelector('button[title="Quick look at Dana Whitfield"]'),
    ).not.toBeNull();
    const link = container.querySelector('a[title="Open Dana Whitfield in a new tab"]');
    expect(link?.getAttribute("target")).toBe("_blank");
  });
});
