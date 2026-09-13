import reducer, {
  acknowledgeRetiredEc2ServerOverrideNotice,
  migrateRetiredEc2ServerOverride,
  selectEffectiveServer,
} from "./adminPreferencesSlice";

describe("retired admin API selection", () => {
  it("migrates a stale runtime EC2 override to production and retains the notice", () => {
    let state = reducer(
      {
        ...reducer(undefined, { type: "test/init" }),
        serverOverride: "ec2",
      },
      migrateRetiredEc2ServerOverride(),
    );

    expect(state.serverOverride).toBe("production");
    expect(state.retiredEc2ApiSelectionNotice).toBe(true);
    expect(selectEffectiveServer({ adminPreferences: state })).toBe(
      "production",
    );

    state = reducer(state, acknowledgeRetiredEc2ServerOverrideNotice());
    expect(state.retiredEc2ApiSelectionNotice).toBe(false);
  });

  it("fails closed to production before normalizing a stale preloaded literal", () => {
    const staleState = {
      ...reducer(undefined, { type: "test/init" }),
      serverOverride: "ec2" as const,
    };

    expect(selectEffectiveServer({ adminPreferences: staleState })).toBe(
      "production",
    );

    const migrated = reducer(staleState, migrateRetiredEc2ServerOverride());
    expect(migrated.serverOverride).toBe("production");
    expect(migrated.retiredEc2ApiSelectionNotice).toBe(true);
  });
});
