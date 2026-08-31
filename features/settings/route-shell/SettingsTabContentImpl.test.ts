import { settingsManifest } from "@/features/surfaces/manifests/settings.manifest";
import { createSettingsWriteHandlers } from "./write-handlers";

describe("matrx-user/settings write-target handlers", () => {
  const accepted = [
    {
      target: "theme_mode",
      value: "dark",
      writes: [{ path: "theme.mode", value: "dark" }],
    },
    {
      target: "accent_theme",
      value: "forest",
      writes: [
        { path: "userPreferences.display.theme", value: "forest" },
      ],
    },
    {
      target: "display_layout",
      value: { sidebar_layout: "collapsed" },
      writes: [
        {
          path: "userPreferences.display.sidebarLayout",
          value: "collapsed",
        },
      ],
    },
    {
      target: "text_generation_style",
      value: { tone: "formal" },
      writes: [
        { path: "userPreferences.textGeneration.tone", value: "formal" },
      ],
    },
    {
      target: "language_defaults",
      value: { text_generation: "es" },
      writes: [
        { path: "userPreferences.textGeneration.language", value: "es" },
      ],
    },
    {
      target: "assistant_name",
      value: "  Jarvis  ",
      writes: [
        { path: "userPreferences.assistant.name", value: "Jarvis" },
      ],
    },
    {
      target: "voice_persona",
      value: { emotion: "  calm  ", wake_word: "  Matrx  " },
      writes: [
        { path: "userPreferences.voice.emotion", value: "calm" },
        { path: "userPreferences.voice.wakeWord", value: "Matrx" },
      ],
    },
  ] as const;

  const refused = [
    { target: "theme_mode", value: "system" },
    { target: "accent_theme", value: "violet" },
    { target: "display_layout", value: { unsupported: "compact" } },
    { target: "text_generation_style", value: { tone: "wobbly" } },
    { target: "language_defaults", value: { voice: "xx" } },
    { target: "assistant_name", value: "   " },
    { target: "voice_persona", value: { emotion: 42 } },
  ] as const;

  it("has one handler for every declared target and no undeclared handler", () => {
    const handlers = createSettingsWriteHandlers(jest.fn());
    expect(Object.keys(handlers).sort()).toEqual(
      (settingsManifest.writeTargets ?? [])
        .map((target) => target.name)
        .sort(),
    );
    expect(
      settingsManifest.writeTargets?.every(
        (target) => target.applyPolicy === "ask",
      ),
    ).toBe(true);
  });

  it.each(accepted)(
    "accepts and resolves $target",
    ({ target, value, writes }) => {
      const commit = jest.fn();
      const handlers = createSettingsWriteHandlers(commit);

      handlers[target](value);

      expect(commit).toHaveBeenCalledWith(target, writes);
    },
  );

  it.each(refused)(
    "refuses an invalid $target payload before commit",
    ({ target, value }) => {
      const commit = jest.fn();
      const handlers = createSettingsWriteHandlers(commit);

      expect(() => handlers[target](value)).toThrow();
      expect(commit).not.toHaveBeenCalled();
    },
  );
});
