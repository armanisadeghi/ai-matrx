import { sanitizeLoadedPreferences } from "../userPreferencesSlice";

// The retired `aiModels.activeModels` allow-list is stripped at the load
// boundary so the next save persists without it; the hidden list survives.
describe("retired activeModels", () => {
  it("is dropped and inactiveModels is kept", () => {
    const out = sanitizeLoadedPreferences({
      aiModels: { defaultModel: null, activeModels: ["a"], inactiveModels: ["b"], newModels: [], favoriteModels: [] },
    } as never);
    expect(out.aiModels).not.toHaveProperty("activeModels");
    expect(out.aiModels?.inactiveModels).toEqual(["b"]);
  });
});
