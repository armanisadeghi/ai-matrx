/**
 * organization-required-class.test.tsx — the RENDER-side contract of the
 * "no organization selected" class, as three invariants that were each broken
 * on 2026-09-12 and each produced a lying screen.
 *
 * SUT is the real code in every case: the real `requireSelectedOrgId`, the real
 * recogniser, the real kernel, and the real selector `useOrganizationRequired`
 * reads. The only double is the Redux store singleton — the one input the live
 * system hands `requireSelectedOrgId`, which cannot exist in jsdom.
 *
 * The notice component's own prop contract is not re-asserted here: `tsc`
 * already fails the build on it across all ~20 call sites, which is a stronger
 * check than any render assertion, and is how tonight's break was caught.
 */

const getStoreSingleton = jest.fn();
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: (...args: unknown[]) => getStoreSingleton(...args),
}));

import { requireSelectedOrgId } from "@/lib/organizations/activeOrg";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";
import { requireOrganizationContext } from "@/lib/api/organization-context";
import { selectShouldPromptForOrganization } from "@/lib/redux/slices/appContextSlice";

function storeWith(organizationId: string | null) {
  return {
    getState: () => ({
      appContext: {
        organization_id: organizationId,
        personal_organization_id: "11111111-1111-1111-1111-111111111111",
      },
    }),
  };
}

describe("ONE error type for one fact", () => {
  // Before this class was fixed, `requireSelectedOrgId` threw a BARE Error
  // while the kernel threw OrganizationContextError. The recogniser matched
  // only the second, so every surface fed by `requireSelectedOrgId` — Vault,
  // the authenticator, message templates, HR — fell through to raw-message
  // rendering no matter how correctly it asked.
  it("requireSelectedOrgId throws what the recogniser recognises", () => {
    getStoreSingleton.mockReturnValue(storeWith(null));
    let thrown: unknown;
    try {
      requireSelectedOrgId();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeDefined();
    expect(isOrganizationRequiredError(thrown)).toBe(true);
  });

  it("the transport kernel throws the same recognisable refusal", () => {
    let thrown: unknown;
    try {
      requireOrganizationContext(null);
    } catch (error) {
      thrown = error;
    }
    expect(isOrganizationRequiredError(thrown)).toBe(true);
  });

  it("a bare Error with the same sentence is NOT recognised — which is exactly why the old throw site was invisible", () => {
    // The regression this whole class rests on. If `requireSelectedOrgId` ever
    // goes back to `throw new Error(...)`, the first test in this block fails
    // — and this one shows why: the recogniser matches the TYPE, never the
    // copy, so a message match cannot be substituted to make it pass.
    expect(
      isOrganizationRequiredError(
        new Error("Select an organization before sending this request."),
      ),
    ).toBe(false);
  });

  it("a real organization is not a refusal", () => {
    getStoreSingleton.mockReturnValue(
      storeWith("22222222-2222-2222-2222-222222222222"),
    );
    expect(requireSelectedOrgId()).toBe("22222222-2222-2222-2222-222222222222");
  });
});

describe("resolving is not refused", () => {
  // The `/workflows/waiting` bug: a bare `if (!organizationId) return;` guard
  // cannot tell "boot has not finished" from "boot finished with nothing", so
  // the second state held a loading skeleton forever. `useOrganizationRequired`
  // reads this selector to separate them.
  const appContext = (organization_id: string | null, orgBootstrapResolved: boolean) =>
    ({ appContext: { organization_id, orgBootstrapResolved } }) as never;

  it("says nothing while boot is still resolving", () => {
    expect(selectShouldPromptForOrganization(appContext(null, false))).toBe(false);
  });

  it("refuses only once boot has settled with no selection", () => {
    expect(selectShouldPromptForOrganization(appContext(null, true))).toBe(true);
  });

  it("never refuses when an organization is selected", () => {
    expect(
      selectShouldPromptForOrganization(
        appContext("22222222-2222-2222-2222-222222222222", true),
      ),
    ).toBe(false);
  });
});
