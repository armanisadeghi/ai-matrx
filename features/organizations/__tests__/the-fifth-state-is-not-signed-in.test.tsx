/**
 * 🚨 FIX-10C / VERIFIER-10 F11 — the FIFTH state: nobody is signed in, and that
 * is never the organization question.
 *
 * MEASURED, from the seat of a stranger. A records digest's own `deep_link`,
 * opened in a clean browser with no session, landed on:
 *
 *   "Data records need an organization
 *    Nothing was loaded because no organization is selected for this session.
 *    Every request is filed under one organization, so pick the one you are
 *    working in…"
 *
 * with **Sign In / Sign Up** in the header directly above it, and an empty
 * organization picker underneath. Every word of that screen is about an
 * organization; the reader's actual problem is that the platform has never met
 * them, and the picker they are pointed at can never fill.
 *
 * The link was not the defect and is asserted here so nobody "fixes" it twice:
 * `platform.link_carries_its_organization` stamps `?org=<uuid>` onto every
 * in-app notice link (the live `communication.notification` rows carry it), and
 * `resolveActiveOrgContext`'s rung −1 honours it above the remembered choice.
 * None of that can run for somebody with no identity, which is precisely why
 * the gate needed a state of its own rather than a better sentence.
 *
 * WHAT THIS PINS:
 *   1. the reading — auth finished with no identity is `signed_out`, and
 *      "still reading" is NEVER `signed_out` (the same discipline as R37's
 *      "a failed membership read is never the nudge");
 *   2. the screen — `OrganizationContextNotice` draws the sign-in notice, not
 *      the organization one, and the way back carries this exact address so the
 *      link's `?org=` survives the round trip;
 *   3. the control gate — a gated control says sign in, not "choose an
 *      organization".
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { selectSignedOut } from "@/lib/organizations/signedOut";

// The gate reads Redux through `useAppSelector`; every selector it uses is a
// pure function of state, so the whole reading can be driven from one object —
// which is the point of those selectors being leaves.
let STATE: unknown = {};
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector(STATE),
  useAppDispatch: () => jest.fn(),
}));

import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useOrganizationGatedControl } from "@/features/organizations/useOrganizationGatedControl";

/** A signed-out visitor whose boot finished: no identity, no organization. */
const STRANGER = {
  userAuth: { id: null, authReady: true },
  appContext: { orgBootstrapResolved: true, organization_id: null },
};
/** The same browser one tick earlier: nothing has answered yet. */
const STILL_READING = {
  userAuth: { id: null, authReady: false },
  appContext: { orgBootstrapResolved: false, organization_id: null },
};
/**
 * The nastier tick: the ORGANIZATION bootstrap resolved (it had nobody to ask
 * about, so it resolved instantly) while the auth read is still running. The
 * old gate called this `required` and told a person who may well be signed in
 * to choose an organization. `signed_out` must not claim it either — "still
 * reading" is never a verdict about anybody.
 */
const ORG_RESOLVED_AUTH_PENDING = {
  userAuth: { id: null, authReady: false },
  appContext: { orgBootstrapResolved: true, organization_id: null },
};
/** Rincon's office manager, signed in, belonging to nothing yet. */
const SIGNED_IN_NO_ORG = {
  userAuth: { id: "87a6e699-3622-4869-8843-d0867456c0dd", authReady: true },
  appContext: { orgBootstrapResolved: true, organization_id: null },
};

function readGate(state: unknown) {
  STATE = state;
  let seen: ReturnType<typeof useOrganizationRequired> | null = null;
  function Probe() {
    seen = useOrganizationRequired();
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<Probe />));
  act(() => root.unmount());
  return seen!;
}

function drawNotice(state: unknown, what: string) {
  STATE = state;
  function Screen() {
    const { organizationState } = useOrganizationRequired();
    return <OrganizationContextNotice state={organizationState} what={what} />;
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<Screen />));
  const html = host.innerHTML;
  const text = host.textContent ?? "";
  act(() => root.unmount());
  host.remove();
  return { html, text };
}

describe("the fifth state — nobody is signed in", () => {
  it("reads as signed_out only once the auth read has answered", () => {
    expect(selectSignedOut(STRANGER)).toBe(true);
    expect(selectSignedOut(STILL_READING)).toBe(false);
    expect(selectSignedOut(SIGNED_IN_NO_ORG)).toBe(false);
    // Every stand-in written before this field existed still answers "no".
    expect(selectSignedOut({})).toBe(false);
    expect(selectSignedOut(undefined)).toBe(false);

    expect(readGate(STRANGER).organizationState).toBe("signed_out");
    expect(readGate(STILL_READING).organizationState).toBe("resolving");
    expect(selectSignedOut(ORG_RESOLVED_AUTH_PENDING)).toBe(false);
    expect(readGate(ORG_RESOLVED_AUTH_PENDING).organizationState).toBe("required");
    expect(readGate(SIGNED_IN_NO_ORG).organizationState).toBe("required");
  });

  it("says sign in, and never blames a missing organization", () => {
    const { text, html } = drawNotice(STRANGER, "Data records");

    expect(text).toContain("Sign in to open data records");
    expect(text).toContain("You are not signed in");
    // The exact sentence the verifier photographed, gone.
    expect(text).not.toContain("need an organization");
    expect(text).not.toContain("no organization is selected");
    expect(text).not.toContain("pick the one you are working in");
    // And no picker: it is empty for a stranger and always will be.
    expect(html).not.toContain("organization-required-notice");
    expect(html).toContain("organization-signed-out-notice");
  });

  it("sends them back to the address they were sent, `?org=` and all", () => {
    const deepLink =
      "/data-v2/af3bfff6-a255-41e5-9ac2-879d53816163" +
      "?view=2e467657-77d4-44ff-bf25-910d381ef9ce&org=6069a466-1445-42df-a64e-cf37ecdc1b99";
    window.history.replaceState({}, "", deepLink);

    const { html } = drawNotice(STRANGER, "Data records");
    const href = /href="([^"]+)"/.exec(html)?.[1] ?? "";

    expect(href.startsWith("/login?returnUrl=")).toBe(true);
    // The organization the LINK named survives the round trip — that is what
    // makes `resolveActiveOrgContext`'s rung −1 fire on the way back in.
    expect(decodeURIComponent(href)).toContain("org=6069a466-1445-42df-a64e-cf37ecdc1b99");
    expect(decodeURIComponent(href)).toContain("/data-v2/af3bfff6-a255-41e5-9ac2-879d53816163");
  });

  it("a gated control asks for a sign-in, not for an organization", () => {
    STATE = STRANGER;
    let gate: ReturnType<typeof useOrganizationGatedControl> | null = null;
    function Probe() {
      gate = useOrganizationGatedControl("scheduling this job");
      return null;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<Probe />));
    act(() => root.unmount());

    expect(gate!.title).toContain("Sign in first");
    expect(gate!.title).not.toContain("Choose an organization");
  });
});
