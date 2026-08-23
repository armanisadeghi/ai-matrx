/**
 * D-28 — a user may hold AS MANY cloud browsers as they want.
 *
 * The regression here is a SILENT VISION LOSS, not a crash. Arman ruled
 * (2026-08-23) *"they can have as many as they want… make it easy to start"* and
 * the shipped panel could only SELECT — there was no create path anywhere in the
 * platform — while rendering an invented "n/5 saved browsers" cap that nothing
 * enforced. Both halves are pinned below.
 */

import { postJson } from "@/lib/python-client";
import { createProfile } from "./service";
import { FIXTURE_QUOTAS } from "./fixtures";

jest.mock("@/lib/python-client", () => ({
  getJson: jest.fn(),
  postJson: jest.fn(),
}));

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "test-access-token" } },
        error: null,
      })),
    },
  },
}));

jest.mock("@/utils/permissions/access", () => ({
  getResourceAccess: jest.fn(),
}));

describe("createProfile — the create path that never existed (D-28)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a browser under the name the person chose", async () => {
    jest.mocked(postJson).mockResolvedValue({
      data: { profile_id: "prof_acme", display_name: "Client — Acme" },
      meta: { requestId: "r1", status: 201, serverRequestId: null },
    });

    await expect(createProfile("Client — Acme")).resolves.toBe("prof_acme");
    expect(postJson).toHaveBeenCalledWith("/browser-manager/profiles", {
      display_name: "Client — Acme",
    });
  });

  it("can be called again and again — there is no client-side ceiling", async () => {
    const names = Array.from({ length: 12 }, (_, i) => `Browser ${i + 1}`);
    jest
      .mocked(postJson)
      .mockImplementation(async (_path: string, body: unknown) => ({
        data: {
          profile_id: `prof_${(body as { display_name: string }).display_name}`,
        },
        meta: { requestId: "r", status: 201, serverRequestId: null },
      }));

    const ids = await Promise.all(names.map((n) => createProfile(n)));

    expect(new Set(ids).size).toBe(12);
    expect(postJson).toHaveBeenCalledTimes(12);
  });

  it("trims the name rather than sending whitespace", async () => {
    jest.mocked(postJson).mockResolvedValue({
      data: { profile_id: "prof_x" },
      meta: { requestId: "r", status: 201, serverRequestId: null },
    });

    await createProfile("  Work Google  ");

    expect(postJson).toHaveBeenCalledWith("/browser-manager/profiles", {
      display_name: "Work Google",
    });
  });
});

describe("ProfileQuota carries no fabricated ceiling (D-28)", () => {
  it("has a stored-profile COUNT and no maximum", () => {
    for (const quota of Object.values(FIXTURE_QUOTAS)) {
      expect(typeof quota.storedProfiles).toBe("number");
      // `maxStoredProfiles: 5` was an inline literal enforced by nothing and
      // rendered to the user as a cap. It must never come back as a constant.
      expect(quota).not.toHaveProperty("maxStoredProfiles");
      // `maxLiveRuns` stays — it is real, enforced by the control plane.
      expect(typeof quota.maxLiveRuns).toBe("number");
    }
  });
});
