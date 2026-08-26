import {
  deriveShapeRenderStatus,
  type ShapeRenderStatusInput,
} from "./shape-render-status";

function base(overrides: Partial<ShapeRenderStatusInput> = {}): ShapeRenderStatusInput {
  return {
    kindIsActive: true,
    dataOnly: false,
    resolution: null,
    candidateCount: 0,
    dispatchResolves: null,
    ...overrides,
  };
}

describe("deriveShapeRenderStatus", () => {
  it("custom component, default row, no problems", () => {
    const status = deriveShapeRenderStatus(
      base({
        resolution: {
          componentKey: "competitor_page_autopsy_default",
          source: "db",
          isActive: true,
          isDefault: true,
        },
        candidateCount: 2,
      }),
    );
    expect(status).toEqual({
      source: "custom",
      componentKey: "competitor_page_autopsy_default",
      sourceLabel: "custom component (stored in the database)",
      why: "it's the default component for this shape",
      problems: [],
    });
  });

  it("custom component, only row (no is_default flag set)", () => {
    const status = deriveShapeRenderStatus(
      base({
        resolution: {
          componentKey: "study_notes_document",
          source: "db",
          isActive: true,
          isDefault: false,
        },
        candidateCount: 1,
      }),
    );
    expect(status.why).toBe("it's the only component registered for this shape");
    expect(status.problems).toEqual([]);
  });

  it("built-in component that resolves cleanly", () => {
    const status = deriveShapeRenderStatus(
      base({
        resolution: {
          componentKey: "quiz_set",
          source: "bundled",
          isActive: true,
          isDefault: true,
        },
        candidateCount: 1,
        dispatchResolves: true,
      }),
    );
    expect(status.source).toBe("builtin");
    expect(status.sourceLabel).toBe("built-in component (compiled into the app)");
    expect(status.problems).toEqual([]);
  });

  it("built-in component with a dangling dispatch key", () => {
    const status = deriveShapeRenderStatus(
      base({
        resolution: {
          componentKey: "ghost_component",
          source: "bundled",
          isActive: true,
          isDefault: true,
        },
        candidateCount: 1,
        dispatchResolves: false,
      }),
    );
    expect(status.sourceLabel).toBe("built-in component (broken reference)");
    expect(status.problems).toEqual([
      "This shape points at a built-in component key the app build doesn't actually have — nothing renders through it until the reference is fixed or the app is redeployed with that key.",
    ]);
  });

  it("built-in component whose dispatch status is not yet known reports no problem", () => {
    const status = deriveShapeRenderStatus(
      base({
        resolution: {
          componentKey: "quiz_set",
          source: "bundled",
          isActive: true,
        },
        candidateCount: 1,
        dispatchResolves: null,
      }),
    );
    expect(status.problems).toEqual([]);
  });

  it("generic viewer, no rows at all", () => {
    const status = deriveShapeRenderStatus(base({ candidateCount: 0 }));
    expect(status).toEqual({
      source: "generic",
      componentKey: null,
      sourceLabel: "generic viewer — no component yet",
      why: "no component has been created for this shape yet",
      problems: [],
    });
  });

  it("generic viewer with candidate rows that are all inactive", () => {
    const status = deriveShapeRenderStatus(base({ candidateCount: 2 }));
    expect(status.why).toBe("no registered component for this shape is turned on");
  });

  it("inactive component row is flagged as a problem, source still reported", () => {
    const status = deriveShapeRenderStatus(
      base({
        resolution: {
          componentKey: "wheel_spin_component",
          source: "db",
          isActive: false,
          isDefault: true,
        },
        candidateCount: 1,
      }),
    );
    expect(status.source).toBe("custom");
    expect(status.problems).toEqual([
      "The component registered for this shape is turned off, so it currently falls back to the generic viewer.",
    ]);
  });

  it("data_only flagged while an active custom component exists — the lie the incident was about", () => {
    const status = deriveShapeRenderStatus(
      base({
        dataOnly: true,
        resolution: {
          componentKey: "competitor_page_autopsy_default",
          source: "db",
          isActive: true,
          isDefault: true,
        },
        candidateCount: 1,
      }),
    );
    expect(status.problems).toEqual([
      "This shape is marked \"data only\", which hides its component tools and monitoring — but it has an active component and renders as itself. That flag looks wrong.",
    ]);
  });

  it("data_only flagged with no component at all is consistent — no problem raised", () => {
    const status = deriveShapeRenderStatus(base({ dataOnly: true, candidateCount: 0 }));
    expect(status.source).toBe("generic");
    expect(status.problems).toEqual([]);
  });

  it("kind not active adds its own problem regardless of component state", () => {
    const status = deriveShapeRenderStatus(
      base({
        kindIsActive: false,
        resolution: {
          componentKey: "quiz_set",
          source: "bundled",
          isActive: true,
          isDefault: true,
        },
        candidateCount: 1,
        dispatchResolves: true,
      }),
    );
    expect(status.problems).toEqual([
      "This shape is not live, so it can't be bound to an agent's output yet.",
    ]);
  });

  it("combines multiple problems in order: not-live, data-only lie, inactive row", () => {
    const status = deriveShapeRenderStatus(
      base({
        kindIsActive: false,
        dataOnly: true,
        resolution: {
          componentKey: "custom_x",
          source: "db",
          isActive: false,
          isDefault: true,
        },
        candidateCount: 1,
      }),
    );
    expect(status.problems).toHaveLength(3);
    expect(status.problems[0]).toMatch(/not live/);
    expect(status.problems[1]).toMatch(/data only/);
    expect(status.problems[2]).toMatch(/turned off/);
  });
});
