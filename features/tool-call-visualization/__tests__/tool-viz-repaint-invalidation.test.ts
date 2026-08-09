/**
 * D115 — in-session tool-viz repaint via the invalidation-registry INVERSION.
 *
 * These tests pin the load-bearing shape: the ubiquitous stream-effects module
 * (`toolStateEffects`) reaches the heavy renderer clusters ONLY by firing a
 * name through `lib/invalidation/invalidation-registry` — never by import.
 * The previous implementation's `await import()` edge from `toolStateEffects`
 * into the content-ir registry added +14 GB build RSS and OOM-killed 12
 * straight Vercel builds; the source-guard test below makes that regression
 * a red test instead of a build autopsy.
 */
import { readFileSync } from "fs";
import { join } from "path";

import {
  INVALIDATION_KEYS,
  fireInvalidation,
  registerInvalidationCallback,
} from "@/lib/invalidation/invalidation-registry";

// Keep the cache module light in jest: the compiler + fetch paths are not
// under test here (invalidation + version bookkeeping are).
jest.mock("@/features/agent-apps/utils/compile-slot", () => ({
  compileSlotComponent: jest.fn(() => ({ Component: () => null })),
}));
jest.mock(
  "@/features/tool-call-visualization/db-renderer/fetchToolRendererRow",
  () => ({ fetchToolRendererRow: jest.fn(async () => null) }),
);
jest.mock(
  "@/features/tool-call-visualization/db-renderer/compileToolRenderer",
  () => ({ compileToolRenderer: jest.fn(() => ({ Component: () => null })) }),
);

describe("invalidation-registry (the tiny shared primitive)", () => {
  it("fires registered callbacks with detail; unregistered names are a no-op", () => {
    const seen: unknown[] = [];
    const unsubscribe = registerInvalidationCallback(
      INVALIDATION_KEYS.dbToolRenderers,
      (detail) => seen.push(detail),
    );
    expect(
      fireInvalidation(INVALIDATION_KEYS.dbToolRenderers, { toolName: "x" }),
    ).toBe(true);
    expect(seen).toEqual([{ toolName: "x" }]);
    unsubscribe();
  });

  it("a throwing callback never breaks the caller or its siblings", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const ran: string[] = [];
    const un1 = registerInvalidationCallback(
      INVALIDATION_KEYS.kindComponents,
      () => {
        throw new Error("boom");
      },
    );
    const un2 = registerInvalidationCallback(
      INVALIDATION_KEYS.kindComponents,
      () => ran.push("second"),
    );
    expect(() =>
      fireInvalidation(INVALIDATION_KEYS.kindComponents),
    ).not.toThrow();
    expect(ran).toEqual(["second"]);
    un1();
    un2();
    consoleError.mockRestore();
  });
});

describe("toolRendererCache registers the db-renderer invalidation at module init", () => {
  it("firing by name drops the cache and bumps the tool's version (targeted + all)", async () => {
    const cache = await import("../db-renderer/toolRendererCache");

    cache.setCachedToolRenderer("travel_get_weather", (() => null) as never);
    cache.markNoToolRenderer("some_other_tool");
    const v0 = cache.getToolRendererVersion("travel_get_weather");

    // Targeted: only the named tool is dropped + bumped.
    expect(
      fireInvalidation(INVALIDATION_KEYS.dbToolRenderers, {
        toolName: "travel_get_weather",
      }),
    ).toBe(true);
    expect(cache.getCachedToolRenderer("travel_get_weather")).toBeNull();
    expect(cache.isKnownNoToolRenderer("some_other_tool")).toBe(true);
    expect(cache.getToolRendererVersion("travel_get_weather")).toBe(v0 + 1);

    // No detail (write returned only a component_id): everything drops.
    const otherV0 = cache.getToolRendererVersion("some_other_tool");
    expect(fireInvalidation(INVALIDATION_KEYS.dbToolRenderers)).toBe(true);
    expect(cache.isKnownNoToolRenderer("some_other_tool")).toBe(false);
    expect(cache.getToolRendererVersion("some_other_tool")).toBe(otherV0 + 1);
  });

  it("version subscribers are notified on invalidation", async () => {
    const cache = await import("../db-renderer/toolRendererCache");
    const listener = jest.fn();
    const unsubscribe = cache.subscribeToolRendererVersions(listener);
    cache.invalidateToolRenderer("any_tool");
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});

describe("toolStateEffects fires the repaint invalidations by NAME", () => {
  const baseCtx = {
    args: {},
    result: {},
    dispatch: jest.fn(),
    getState: jest.fn(),
  };

  it("toolcomp_* writes fire db-renderer invalidation, targeted when the name is known", async () => {
    const { runToolStateEffects } = await import(
      "../effects/toolStateEffects"
    );
    const seen: unknown[] = [];
    const unsubscribe = registerInvalidationCallback(
      INVALIDATION_KEYS.dbToolRenderers,
      (detail) => seen.push(detail),
    );

    runToolStateEffects({
      ...baseCtx,
      toolName: "toolcomp_create_component",
      result: { tool_name: "travel_get_weather", component_id: "c1" },
    } as never);
    // toolcomp_update_code returns only component_id → untargeted (invalidate all).
    runToolStateEffects({
      ...baseCtx,
      toolName: "toolcomp_update_code",
      result: { component_id: "c1", updated_sections: ["inline_code"] },
    } as never);
    // Read tools must NOT fire.
    runToolStateEffects({
      ...baseCtx,
      toolName: "toolcomp_get_code",
    } as never);

    expect(seen).toEqual([{ toolName: "travel_get_weather" }, undefined]);
    unsubscribe();
  });

  it("kindcomp_* writes fire the content-ir kind-components invalidation", async () => {
    const { runToolStateEffects } = await import(
      "../effects/toolStateEffects"
    );
    const fired = jest.fn();
    const unsubscribe = registerInvalidationCallback(
      INVALIDATION_KEYS.kindComponents,
      fired,
    );

    runToolStateEffects({
      ...baseCtx,
      toolName: "kindcomp_update_code",
    } as never);
    runToolStateEffects({
      ...baseCtx,
      toolName: "kindcomp_get_context",
    } as never);

    expect(fired).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe("THE FRAGMENTATION LAW source guard (D115)", () => {
  it("toolStateEffects has NO import edge — static or dynamic — into content-ir or the db-renderer cluster", () => {
    const source = readFileSync(
      join(__dirname, "../effects/toolStateEffects.ts"),
      "utf8",
    );
    // The exact detonator class: any import() or static import reaching the
    // content-ir registry cluster or the Babel-adjacent db-renderer chunk
    // from this ubiquitous (process-stream-reachable) module.
    expect(source).not.toMatch(/from\s+["']@\/features\/content-ir/);
    expect(source).not.toMatch(/from\s+["'][^"']*db-renderer/);
    expect(source).not.toMatch(/import\s*\(/);
  });
});
