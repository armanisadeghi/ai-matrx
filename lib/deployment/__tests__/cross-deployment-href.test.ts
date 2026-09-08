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
