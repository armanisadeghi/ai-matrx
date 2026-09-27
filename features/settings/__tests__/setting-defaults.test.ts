import { getSliceBinding, parseSettingsPath } from "../slice-bindings";

// "Reset to default" writes back exactly what these return. A default that
// drifts from the slice's own initial state would make Reset write a value
// the person never had, so the declared defaults are pinned here.
const defaultOf = (path: string) => {
  const { slice, key } = parseSettingsPath(path);
  return getSliceBinding(slice).defaultValue?.(key);
};

describe("settings defaults behind Reset", () => {
  it("theme follows the device on a new browser", () => {
    expect(defaultOf("theme.mode")).toBe("system");
  });

  it("preferences default to the slice's own initial state", () => {
    expect(defaultOf("userPreferences.voice.language")).toBe("en");
    expect(defaultOf("userPreferences.textGeneration.language")).toBe("en");
  });

  it("a slice with no declared default offers no reset", () => {
    expect(defaultOf("windowManager.toggleHidden")).toBeUndefined();
    expect(defaultOf("theme.toggle")).toBeUndefined();
  });

  it("theme is labelled as saved in this browser, not the account", () => {
    expect(getSliceBinding("theme").persistence).toBe("local-only");
  });
});
