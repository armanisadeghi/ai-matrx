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
  registerSurfaceRuntime,
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
});
