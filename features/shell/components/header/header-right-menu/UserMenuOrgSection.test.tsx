/**
 * THE NO-WORKSPACE STATE IS REACHABLE, AND IT IS NOT A BLANK RECTANGLE.
 *
 * Cold walk 13 (2026-09-20, defect N1) found the account menu's ORGANIZATION
 * section rendering as an empty ~350px panel — one stray `Personal` pill, one
 * unlabelled toggle — in the one state every first-time Expert is in: signed
 * in, no workspace chosen. The walker could not re-check it after the fix,
 * because the running app offers no way back to "no organization selected"
 * once a workspace has been picked. This file IS that way back: it renders the
 * real section, in that state, with no app, no store and no browser.
 *
 * It asserts what a human would see. The measured half of the defect — that
 * the rows were laid out 467px wide inside a 226px disclosure and clipped off
 * the edge — is jsdom's blind spot, and lives in the real-engine gate
 * `features/shell/layout-gate/user-menu-org-disclosure.spec.ts`. The one
 * structural fact this file does pin is the `min-w-0` that gate proves
 * load-bearing, so nobody deletes it as tidy-up between runs of that gate.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/hooks/use-is-mounted", () => ({ useIsMounted: () => true }));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: unknown) =>
    typeof selector === "function" ? (selector as () => unknown)() : selector,
}));

jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  // No organization chosen ⇒ the red prompt state.
  selectShouldPromptForOrganization: () => true,
}));

const ORGANIZATIONS = Array.from({ length: 48 }, (_, index) => ({
  id: `org-${index}`,
  name: `Organization Number ${index} With A Fairly Long Workspace Name Inc`,
  abbreviation: `O${index}`,
  is_personal: index === 3,
}));

jest.mock("@/features/organizations/hooks/useActiveOrganizationPicker", () => ({
  useActiveOrganizationPicker: () => ({
    activeOrgId: null,
    organizations: ORGANIZATIONS,
    loading: false,
    loadFailed: false,
    selectOrganization: () => {},
  }),
}));

jest.mock("@/features/organizations/hooks/useDefaultOrganization", () => ({
  useDefaultOrganization: () => ({
    defaultOrganizationId: null,
    setDefaultOrganization: () => {},
  }),
}));

import UserMenuOrgSection from "./UserMenuOrgSection";

describe("the account menu's Organization section with no workspace chosen", () => {
  const markup = renderToStaticMarkup(<UserMenuOrgSection />);
  const text = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("says in plain words that nothing is selected, and what to do about it", () => {
    expect(text).toMatch(/No organization selected/i);
    expect(text).toMatch(/pick one below/i);
  });

  it("puts that sentence ABOVE the list, not after it", () => {
    const sentence = markup.indexOf("No organization selected");
    const list = markup.indexOf('role="listbox"');
    expect(sentence).toBeGreaterThan(-1);
    expect(list).toBeGreaterThan(-1);
    expect(sentence).toBeLessThan(list);
  });

  it("names every workspace the person can choose", () => {
    expect(markup.match(/role="option"/g)).toHaveLength(ORGANIZATIONS.length);
    for (const organization of ORGANIZATIONS) {
      expect(text).toContain(organization.name);
    }
  });

  it("is not the blank rectangle: the section has real rows, not just the pill and the toggle", () => {
    expect(text).toContain("Personal");
    // 🚨 THE CONTROL IS NO LONGER CALLED "Set as my default", AND THAT IS THE
    // POINT. A default organization is at most a per-client DISPLAY preference
    // — nothing may pick a workspace for the person from it — so the shared
    // picker (`@ai-matrx/design-system`'s OrganizationPicker) now offers to
    // keep one at the top of this list instead of to be their default.
    expect(text).toContain("Keep it at the top");
    // And with nothing selected it says why it cannot be used, rather than
    // sitting there dead: the row is honest or it is absent.
    expect(text).toContain("Select an organization first");
    // The walk saw ONLY those two. A row's abbreviation chip is the third thing
    // that must be there, 48 times.
    expect(markup.match(/aria-label="Organization abbreviation /g)).toHaveLength(
      ORGANIZATIONS.length,
    );
  });

  it("keeps `min-w-0` on the disclosure's grid item, where the clip cannot rescue it", () => {
    // `MenuGroup` clips on the OUTER grid, so the grid item keeps
    // `min-width: auto` (= min-content) unless this class says otherwise, and
    // every name goes off the edge. Proven in a real engine by
    // features/shell/layout-gate/user-menu-org-disclosure.spec.ts.
    expect(markup).toContain('class="min-h-0 min-w-0"');
  });

  it("flags the section in red while nothing is chosen", () => {
    expect(markup).toContain("text-red-500");
  });
});
