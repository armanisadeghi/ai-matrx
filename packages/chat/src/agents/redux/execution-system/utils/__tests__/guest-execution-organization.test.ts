/**
 * THE ONE GUEST EXCEPTION at the execution organization boundary.
 *
 * A fingerprint guest running a public app (`/p/<slug>`) must reach the
 * server with NO organization — aidream refuses a guest that names one and
 * resolves the guest's own organization itself. Until 2026-09-27 the client
 * asked every guest "Which workspace is this for?" instead, so no signed-out
 * visitor could run anything. Every signed-in lane still refuses with no
 * organization, exactly as before.
 */

import type { RootState } from "@/lib/redux/store";
import {
  ensureExecutionOrganization,
  executionOrganizationForRequest,
  isFingerprintGuestExecution,
} from "../required-organization";

const CONVERSATION = "11111111-1111-4111-8111-111111111111";

function storeState(opts: {
  accessToken: string | null;
  fingerprintId: string | null;
  organizationId: string | null;
}): RootState {
  return {
    userAuth: { accessToken: opts.accessToken },
    userProfile: { fingerprintId: opts.fingerprintId },
    appContext: { organization_id: opts.organizationId },
    conversations: {
      byConversationId: {
        [CONVERSATION]: { cacheOnly: true, organizationId: null },
      },
    },
  } as unknown as RootState;
}

describe("execution organization — the fingerprint guest", () => {
  const guest = storeState({
    accessToken: null,
    fingerprintId: "fp-guest-1",
    organizationId: null,
  });

  it("is recognised as the guest lane", () => {
    expect(isFingerprintGuestExecution(guest)).toBe(true);
  });

  it("names no organization on the start request", () => {
    expect(executionOrganizationForRequest(guest, CONVERSATION)).toBeUndefined();
  });

  it("is never asked to pick a workspace", async () => {
    await expect(ensureExecutionOrganization(guest, CONVERSATION)).resolves.toBeNull();
  });
});

describe("execution organization — every signed-in lane is unchanged", () => {
  it("refuses a signed-in person with nothing selected", () => {
    const signedIn = storeState({
      accessToken: "jwt",
      fingerprintId: "fp-also-present",
      organizationId: null,
    });
    expect(isFingerprintGuestExecution(signedIn)).toBe(false);
    expect(() => executionOrganizationForRequest(signedIn, CONVERSATION)).toThrow(
      /Select an organization/,
    );
  });

  it("carries the selected organization for a signed-in person", () => {
    const signedIn = storeState({
      accessToken: "jwt",
      fingerprintId: null,
      organizationId: "22222222-2222-4222-8222-222222222222",
    });
    expect(executionOrganizationForRequest(signedIn, CONVERSATION)).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
  });

  it("a visitor with neither a session nor a fingerprint is not the guest lane", () => {
    const nobody = storeState({ accessToken: null, fingerprintId: null, organizationId: null });
    expect(isFingerprintGuestExecution(nobody)).toBe(false);
    expect(() => executionOrganizationForRequest(nobody, CONVERSATION)).toThrow();
  });
});
