import {
  getManifest,
  surfaceAcceptsAgentBindings,
} from "@/features/surfaces/manifests/registry";

describe("surface agent roster mode", () => {
  it("makes Chat a universal host with no surface bindings", () => {
    expect(getManifest("matrx-user/chat")?.agentRosterMode).toBe("universal");
    expect(surfaceAcceptsAgentBindings("matrx-user/chat")).toBe(false);
  });

  it("keeps ordinary and legacy surfaces bindable by default", () => {
    expect(surfaceAcceptsAgentBindings("matrx-user/dashboard")).toBe(true);
    expect(surfaceAcceptsAgentBindings("legacy/unregistered-surface")).toBe(
      true,
    );
  });
});
