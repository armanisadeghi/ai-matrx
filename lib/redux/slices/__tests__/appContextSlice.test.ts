import reducer, {
  selectShouldPromptForOrganization,
} from "../appContextSlice";
import { buildRehydrateAction } from "@/lib/sync/engine/rehydrate";

describe("appContext organization resolution", () => {
  it("does not treat a hollow cache record as resolved", () => {
    const state = reducer(
      undefined,
      buildRehydrateAction(
        "appContext",
        {
          organization_id: null,
          organization_name: null,
          orgBootstrapResolved: false,
        },
        { fromRehydrate: true },
      ),
    );

    expect(state.orgBootstrapResolved).toBe(false);
    expect(selectShouldPromptForOrganization({ appContext: state })).toBe(false);
  });

  it("a cached organization only PAINTS — it never answers the load ladder", () => {
    const state = reducer(
      undefined,
      buildRehydrateAction(
        "appContext",
        {
          organization_id: "org-cached",
          organization_name: "Cached org",
          orgBootstrapResolved: false,
        },
        { fromRehydrate: true },
      ),
    );

    expect(state.organization_id).toBe("org-cached");
    expect(state.orgBootstrapResolved).toBe(false);
  });

  it("the ladder's answer replaces a painted cache organization", () => {
    const painted = reducer(
      undefined,
      buildRehydrateAction(
        "appContext",
        { organization_id: "org-cached", organization_name: "Cached org" },
        { fromRehydrate: true },
      ),
    );
    const state = reducer(
      painted,
      buildRehydrateAction(
        "appContext",
        {
          organization_id: "org-last-active",
          organization_name: "Last active",
          orgBootstrapResolved: true,
          orgBootstrapFailure: null,
        },
        { fromRehydrate: true },
      ),
    );
    expect(state.organization_id).toBe("org-last-active");
    expect(state.orgBootstrapResolved).toBe(true);
  });

  it("prompts only after an authoritative no-active-org result", () => {
    const state = reducer(
      undefined,
      buildRehydrateAction(
        "appContext",
        {
          organization_id: null,
          organization_name: null,
          orgBootstrapResolved: true,
        },
        { fromRehydrate: true },
      ),
    );

    expect(state.orgBootstrapResolved).toBe(true);
    expect(selectShouldPromptForOrganization({ appContext: state })).toBe(true);
  });
});
