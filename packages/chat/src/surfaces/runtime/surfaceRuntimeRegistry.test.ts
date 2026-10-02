/**
 * Depth-aware winner selection in the surface runtime registry.
 *
 * The regression this guards: React fires passive effects child-first, so a
 * route-level layout provider (depth 1) re-registers AFTER a nested vertical
 * provider (depth 2) in the same commit. Pure last-registered-wins let the
 * layout's generic scope shadow the vertical's rich scope; depth must decide,
 * with registration recency only breaking ties.
 */
import {
  getSurfaceRuntime,
  getSurfaceRuntimeForName,
  getRegisteredSurfaceScopeContributions,
  registerSurfaceRuntime,
  registerSurfaceScopeContribution,
} from "./SurfaceRuntimeContext";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

const scope = (): SurfaceScopePayload => ({});

function entry(surfaceName: string) {
  return { surfaceName, getScope: scope };
}

describe("surface runtime registry — depth beats registration order", () => {
  it("returns null when nothing is registered", () => {
    expect(getSurfaceRuntime()).toBeNull();
  });

  it("deeper provider wins even when the shallower one registers LAST (the child-first effect order)", () => {
    // Same commit: vertical (deep) registers first, layout (shallow) last.
    const offVertical = registerSurfaceRuntime(
      entry("matrx-user/marketing-findings"),
      2,
    );
    const offLayout = registerSurfaceRuntime(
      entry("matrx-user/marketing-site"),
      1,
    );
    expect(getSurfaceRuntime()?.surfaceName).toBe(
      "matrx-user/marketing-findings",
    );
    offVertical();
    // Vertical unmounts (route change) → layout takes over.
    expect(getSurfaceRuntime()?.surfaceName).toBe("matrx-user/marketing-site");
    offLayout();
    expect(getSurfaceRuntime()).toBeNull();
  });

  it("equal depth falls back to latest registration (split-pane siblings)", () => {
    const offA = registerSurfaceRuntime(entry("matrx-user/notes"), 1);
    const offB = registerSurfaceRuntime(entry("matrx-user/scratchpad"), 1);
    expect(getSurfaceRuntime()?.surfaceName).toBe("matrx-user/scratchpad");
    offB();
    expect(getSurfaceRuntime()?.surfaceName).toBe("matrx-user/notes");
    offA();
  });

  it("unregister removes only its own entry", () => {
    const offDeep = registerSurfaceRuntime(entry("deep/one"), 3);
    const offShallow = registerSurfaceRuntime(entry("shallow/one"), 1);
    offShallow();
    expect(getSurfaceRuntime()?.surfaceName).toBe("deep/one");
    offDeep();
    expect(getSurfaceRuntime()).toBeNull();
  });

  it("resolves the conversation's named surface even when another overlay is deeper", () => {
    const offPage = registerSurfaceRuntime(entry("matrx-public/p"), 1);
    const offOverlay = registerSurfaceRuntime(
      entry("matrx-user/quick-tasks"),
      3,
    );

    expect(getSurfaceRuntime()?.surfaceName).toBe("matrx-user/quick-tasks");
    expect(getSurfaceRuntimeForName("matrx-public/p")?.surfaceName).toBe(
      "matrx-public/p",
    );
    expect(getSurfaceRuntimeForName("matrx-user/missing")).toBeNull();

    offOverlay();
    offPage();
  });
});

describe("surface runtime registry — composable scope contributions", () => {
  it("merges descendant-owned value fragments and removes only the unmounted owner", () => {
    const offFilters = registerSurfaceScopeContribution(
      "matrx-user/settings",
      "integration-filters",
      () => ({ integration_filters: { search: "github" } }),
    );
    const offGitHub = registerSurfaceScopeContribution(
      "matrx-user/settings",
      "github-account",
      () => ({ github_connection: { connected: true } }),
    );

    expect(
      getRegisteredSurfaceScopeContributions("matrx-user/settings"),
    ).toEqual({
      integration_filters: { search: "github" },
      github_connection: { connected: true },
    });

    offFilters();
    expect(
      getRegisteredSurfaceScopeContributions("matrx-user/settings"),
    ).toEqual({ github_connection: { connected: true } });
    offGitHub();
  });

  it("refuses duplicate value ownership instead of silently overwriting", () => {
    const offA = registerSurfaceScopeContribution(
      "matrx-user/settings",
      "owner-a",
      () => ({ integration_filters: { search: "a" } }),
    );
    const offB = registerSurfaceScopeContribution(
      "matrx-user/settings",
      "owner-b",
      () => ({ integration_filters: { search: "b" } }),
    );

    expect(() =>
      getRegisteredSurfaceScopeContributions("matrx-user/settings"),
    ).toThrow(/owner-a.*owner-b/);
    offB();
    offA();
  });
});
