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
          personal_organization_id: null,
          orgBootstrapResolved: false,
        },
        { fromRehydrate: true },
      ),
    );

    expect(state.orgBootstrapResolved).toBe(false);
    expect(selectShouldPromptForOrganization({ appContext: state })).toBe(false);
  });

  it("accepts a cached active organization as immediately resolved", () => {
    const state = reducer(
      undefined,
      buildRehydrateAction(
        "appContext",
        {
          organization_id: "org-default",
          organization_name: "Default org",
          personal_organization_id: "org-personal",
          orgBootstrapResolved: false,
        },
        { fromRehydrate: true },
      ),
    );

    expect(state.orgBootstrapResolved).toBe(true);
    expect(selectShouldPromptForOrganization({ appContext: state })).toBe(false);
  });

  it("prompts only after an authoritative no-active-org result", () => {
    const state = reducer(
      undefined,
      buildRehydrateAction(
        "appContext",
        {
          organization_id: null,
          organization_name: null,
          personal_organization_id: "org-personal",
          orgBootstrapResolved: true,
        },
        { fromRehydrate: true },
      ),
    );

    expect(state.orgBootstrapResolved).toBe(true);
    expect(selectShouldPromptForOrganization({ appContext: state })).toBe(true);
  });
});
