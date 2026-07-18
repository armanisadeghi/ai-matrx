/**
 * React-level acceptance for the GRANULAR repaint (adversarial-review fix):
 * with two kinds mounted, a registry arrival for kind X re-renders ONLY the
 * kind-X consumer — the kind-Y consumer's render (where the kind route would
 * execute) does not run. Asserted via counting render spies on probe
 * components that use the real hook against the real singletons. React
 * Compiler is OFF in this repo, so this granularity is load-bearing, not a
 * compiler nicety.
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useContentIrKindVersion } from "../react/use-registry-repaint";
import { kindRegistry } from "../registry/kind-registry";

// React 19: silence the environment flag warning for act().
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const renderSpy = jest.fn<void, [string, number]>();

const Probe: React.FC<{ kind: string }> = ({ kind }) => {
  const version = useContentIrKindVersion(kind);
  // The route would execute here — counting renders counts route executions.
  renderSpy(kind, version);
  return <span data-kind={kind} data-version={version} />;
};

describe("granular repaint — React consumers", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    renderSpy.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("a version bump for kind X re-renders only kind-X blocks", () => {
    act(() => {
      root.render(
        <>
          <Probe kind="probe_kind_x" />
          <Probe kind="probe_kind_y" />
        </>,
      );
    });

    const rendersBefore = {
      x: renderSpy.mock.calls.filter(([k]) => k === "probe_kind_x").length,
      y: renderSpy.mock.calls.filter(([k]) => k === "probe_kind_y").length,
    };

    // A cold-arrival for X (the real upsert path the eager fetch lands on).
    act(() => {
      kindRegistry.upsertDefinition({
        kind: "probe_kind_x",
        schema: { kind: "probe_kind_x", fields: {} },
        schemaSource: "content_ir",
        tier: "cold",
      });
    });

    const rendersAfter = {
      x: renderSpy.mock.calls.filter(([k]) => k === "probe_kind_x").length,
      y: renderSpy.mock.calls.filter(([k]) => k === "probe_kind_y").length,
    };

    // X re-rendered (route re-executes for X)…
    expect(rendersAfter.x).toBeGreaterThan(rendersBefore.x);
    // …and Y did NOT (unrelated blocks' route does not re-execute).
    expect(rendersAfter.y).toBe(rendersBefore.y);

    // The rendered version actually advanced for X.
    const xEl = container.querySelector('[data-kind="probe_kind_x"]');
    expect(Number(xEl?.getAttribute("data-version"))).toBeGreaterThan(0);
  });
});
