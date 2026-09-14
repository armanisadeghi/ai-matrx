const state = {
  organization: "org-a" as string | null,
  user: "user-a" as string | null,
  refresh: jest.fn(),
  scoped: {
    knobs: [] as Array<{ feature: string; key: string; effective_value: unknown }> ,
    isLoading: false,
    error: null as string | null,
    refresh: () => state.refresh(),
    missing: [],
  },
  resolve: jest.fn((values: Record<string, unknown>) => {
    if (values.mode === "manual") {
      return { mode: "manual", reason: values.reason, approvedBy: values.approvedBy, valid: true };
    }
    return { mode: "scroll", thresholdPx: values.thresholdPx, intentTimeoutMs: values.intentTimeoutMs, valid: true };
  }),
};

jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
  selectActiveOrganizationId: "organization",
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: "user" }));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: "organization" | "user") => state[selector],
}));
jest.mock("@/lib/scoped-config/useScopedKnobs", () => ({
  useScopedKnobs: () => state.scoped,
}));
jest.mock("@ai-matrx/data/react", () => ({
  resolveScrollPaginationPolicy: (values: Record<string, unknown>) => state.resolve(values),
  suspendScrollPaginationPolicy: (reason: string) => ({ mode: "suspended", reason, valid: false }),
}));

import { useTablePaginationPolicy } from "./useTablePaginationPolicy";

function knobs(values: Record<string, unknown>) {
  return Object.entries(values).map(([key, effective_value]) => ({
    feature: "tables.pagination", key, effective_value,
  }));
}

describe("useTablePaginationPolicy", () => {
  beforeEach(() => {
    state.organization = "org-a";
    state.user = "user-a";
    state.scoped = { knobs: [], isLoading: false, error: null, refresh: () => state.refresh(), missing: [] };
    state.refresh.mockReset();
    state.resolve.mockClear();
  });

  it("suspends while loading, then forwards the resolved scrolling knobs", () => {
    state.scoped.isLoading = true;
    expect(useTablePaginationPolicy().scroll).toEqual({
      mode: "suspended", valid: false,
      reason: "Automatic loading is paused while scrolling preferences load.",
    });
    expect(state.resolve).not.toHaveBeenCalled();

    state.scoped = {
      ...state.scoped,
      isLoading: false,
      knobs: knobs({ mode: "manual", reason: "Source has an external cursor.", approved_by: "Organization data owner" }),
    };
    const policy = useTablePaginationPolicy();
    expect(policy.scroll).toMatchObject({ mode: "manual", valid: true });
    expect(state.resolve).toHaveBeenLastCalledWith({
      mode: "manual",
      thresholdPx: undefined,
      intentTimeoutMs: undefined,
      reason: "Source has an external cursor.",
      approvedBy: "Organization data owner",
    });
  });

  it("keeps Load more recovery honest after an error and resolves after retry", () => {
    state.scoped.error = "network unavailable";
    const failed = useTablePaginationPolicy();
    expect(failed.scroll).toMatchObject({ mode: "suspended", valid: false });
    expect(failed.notice).toContain("could not load: network unavailable");
    failed.refresh();
    expect(state.refresh).toHaveBeenCalledTimes(1);

    state.scoped = { ...state.scoped, error: null, knobs: knobs({ mode: "scroll", threshold_px: 96, intent_timeout_ms: 1200 }) };
    expect(useTablePaginationPolicy().scroll).toEqual({ mode: "scroll", thresholdPx: 96, intentTimeoutMs: 1200, valid: true });
  });

  it("masks an old organization policy while the next organization loads", () => {
    state.scoped.knobs = knobs({ mode: "scroll", threshold_px: 96, intent_timeout_ms: 1200 });
    expect(useTablePaginationPolicy().scroll).toMatchObject({ mode: "scroll", valid: true });

    state.organization = "org-b";
    state.scoped = { ...state.scoped, isLoading: true };
    const next = useTablePaginationPolicy();
    expect(next.organizationId).toBe("org-b");
    expect(next.scroll).toEqual({
      mode: "suspended", valid: false,
      reason: "Automatic loading is paused while scrolling preferences load.",
    });
  });
});
