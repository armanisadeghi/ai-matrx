/**
 * The link door, judged against the production defect of 2026-09-08: a Next
 * <Link> to /administration on the www build prefetched an RSC payload, the
 * proxy redirected it to manage.aimatrx.com, and the browser refused the
 * redirect on the preflight. See lib/deployment/surfaces.ts.
 */
const load = async (profile: string) => {
  jest.resetModules();
  process.env.NEXT_PUBLIC_MATRX_PROFILE = profile;
  return await import("@/lib/deployment/surfaces");
};

const originalProfile = process.env.NEXT_PUBLIC_MATRX_PROFILE;
afterAll(() => {
  process.env.NEXT_PUBLIC_MATRX_PROFILE = originalProfile;
});

describe("crossDeploymentHref — the www build (no (admin), no (dev))", () => {
  it("sends the exact href the walk broke on to the admin origin", async () => {
    const { crossDeploymentHref } = await load("slim");
    expect(crossDeploymentHref("/administration/launchpad")).toBe(
      "https://manage.aimatrx.com/administration/launchpad",
    );
  });

  it("carries the query and hash across, so a deep link survives the hop", async () => {
    const { crossDeploymentHref } = await load("slim");
    expect(crossDeploymentHref("/administration/users?user=abc#top")).toBe(
      "https://manage.aimatrx.com/administration/users?user=abc#top",
    );
  });

  it("sends /demos to the demos origin — the same class, the other surface", async () => {
    const { crossDeploymentHref } = await load("slim");
    expect(crossDeploymentHref("/demos/chat/a/x")).toBe(
      "https://demos.aimatrx.com/demos/chat/a/x",
    );
  });

  it("leaves an ordinary app path alone", async () => {
    const { crossDeploymentHref } = await load("slim");
    expect(crossDeploymentHref("/dashboard")).toBeNull();
    expect(crossDeploymentHref("/administrationish")).toBeNull();
  });

  it("never rewrites what is not an internal path", async () => {
    const { crossDeploymentHref } = await load("slim");
    expect(crossDeploymentHref("https://example.com/administration")).toBeNull();
    expect(crossDeploymentHref("//evil.example/administration")).toBeNull();
    expect(crossDeploymentHref("#section")).toBeNull();
    expect(crossDeploymentHref({ pathname: "/administration" })).toBeNull();
  });
});

describe("the satellite build sends everything that is not its own home", () => {
  // 🚨 Found by WALKING manage.aimatrx.com after the first fix shipped. The
  // admin shell's settings link produced the mirror image of the original
  // error: /settings?_rsc=… redirected to www, preflight refused. The first
  // model knew only the outbound direction.
  it("sends the exact href the walk broke on back to the main app", async () => {
    const { crossDeploymentHref } = await load("admin");
    expect(crossDeploymentHref("/settings")).toBe(
      "https://www.aimatrx.com/settings",
    );
  });

  it("sends any main-app route home, query and all", async () => {
    const { crossDeploymentHref } = await load("admin");
    expect(crossDeploymentHref("/dashboard?tab=x")).toBe(
      "https://www.aimatrx.com/dashboard?tab=x",
    );
    expect(crossDeploymentHref("/agents/all")).toBe(
      "https://www.aimatrx.com/agents/all",
    );
  });

  it("keeps the shared auth paths in place — login must work on every host", async () => {
    const { crossDeploymentHref } = await load("admin");
    expect(crossDeploymentHref("/login")).toBeNull();
    expect(crossDeploymentHref("/auth/callback")).toBeNull();
    expect(crossDeploymentHref("/api/version")).toBeNull();
  });

  it("holds for the demos satellite too, and sends it the admin surface", async () => {
    const { crossDeploymentHref } = await load("demos");
    expect(crossDeploymentHref("/dashboard")).toBe(
      "https://www.aimatrx.com/dashboard",
    );
    expect(crossDeploymentHref("/administration")).toBe(
      "https://manage.aimatrx.com/administration",
    );
    expect(crossDeploymentHref("/demos/chat")).toBeNull();
  });

  it("never sends anything home from the MAIN build", async () => {
    const { crossDeploymentHref } = await load("slim");
    expect(crossDeploymentHref("/settings")).toBeNull();
    expect(crossDeploymentHref("/dashboard")).toBeNull();
  });
});

describe("the deployment that owns the surface", () => {
  it("keeps /administration internal on the manage build", async () => {
    const { crossDeploymentHref } = await load("admin");
    expect(crossDeploymentHref("/administration/launchpad")).toBeNull();
  });

  it("keeps /demos internal on the demos build", async () => {
    const { crossDeploymentHref } = await load("demos");
    expect(crossDeploymentHref("/demos/chat")).toBeNull();
  });

  it("is a no-op on a dev machine, which compiles everything", async () => {
    const { crossDeploymentHref } = await load("full");
    expect(crossDeploymentHref("/administration/launchpad")).toBeNull();
    expect(crossDeploymentHref("/demos/chat")).toBeNull();
  });
});

export {};

/**
 * THE OTHER HALF OF THE SPLIT (found 2026-09-08 while fixing agent addressing).
 *
 * `manage` PARKS app/(core) (next.config.js § PROFILES), so `/agents/<id>` is
 * exactly as foreign there as `/administration/...` is on www. The table
 * described only one direction, so the mandate console on manage — which names
 * SYSTEM agents and USER agents side by side — linked every user agent to a
 * path its own build does not serve.
 */
describe("crossDeploymentHref — the manage build (only (admin))", () => {
  it("sends a user agent's address back to the main app", async () => {
    const { crossDeploymentHref } = await load("admin");
    expect(crossDeploymentHref("/agents/ac714b9b-9fb8-4c08-af62-190c0c4d86ff")).toBe(
      "https://www.aimatrx.com/agents/ac714b9b-9fb8-4c08-af62-190c0c4d86ff",
    );
    expect(crossDeploymentHref("/agents/go/ac714b9b-9fb8-4c08-af62-190c0c4d86ff")).toBe(
      "https://www.aimatrx.com/agents/go/ac714b9b-9fb8-4c08-af62-190c0c4d86ff",
    );
  });

  it("keeps a system agent's address internal on manage", async () => {
    const { crossDeploymentHref } = await load("admin");
    expect(
      crossDeploymentHref(
        "/administration/agents/system-agents/agents/8f0bbfc2-85d9-4913-8cea-b09a50c62be6",
      ),
    ).toBeNull();
  });

  it("never rewrites the paths every build shares", async () => {
    const { crossDeploymentHref } = await load("admin");
    for (const shared of ["/api/agents/x", "/auth/callback", "/login"]) {
      expect(crossDeploymentHref(shared)).toBeNull();
    }
  });

  it("leaves the main app's own links internal on www", async () => {
    const { crossDeploymentHref } = await load("slim");
    expect(crossDeploymentHref("/agents/abc")).toBeNull();
  });
});
