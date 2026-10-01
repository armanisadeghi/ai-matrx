import { toSandboxCreateDefaults } from "../sandbox-defaults";

// The knob values a person sets in Settings › Sandbox defaults are what the
// "New sandbox" request carries — and nothing the orchestrator would refuse.
describe("toSandboxCreateDefaults", () => {
  it("carries template, tier, a numeric auto-stop and a cloneable repo", () => {
    expect(
      toSandboxCreateDefaults({
        template: "bare",
        tier: "hosted",
        auto_stop: "7200",
        git_repo: " https://github.com/acme/app.git ",
        git_branch: "main",
        auto_clone: true,
      }),
    ).toEqual({
      template: "bare",
      tier: "hosted",
      ttl_seconds: 7200,
      labels: {
        default_git_repo: "https://github.com/acme/app.git",
        default_git_branch: "main",
        auto_clone: "true",
      },
    });
  });

  it("lets the service decide the lifetime when auto-stop is the service default", () => {
    expect(toSandboxCreateDefaults({ auto_stop: "service_default" }).ttl_seconds).toBeUndefined();
  });

  it("never sends an SSH or empty repository, nor a branch or clone flag without one", () => {
    expect(
      toSandboxCreateDefaults({ git_repo: "git@github.com:acme/app.git", git_branch: "main", auto_clone: true })
        .labels,
    ).toEqual({});
    expect(toSandboxCreateDefaults({ git_repo: "", auto_clone: true }).labels).toEqual({});
  });

  it("drops a tier the orchestrator does not accept", () => {
    expect(toSandboxCreateDefaults({ tier: "gpu" }).tier).toBeUndefined();
  });
});
