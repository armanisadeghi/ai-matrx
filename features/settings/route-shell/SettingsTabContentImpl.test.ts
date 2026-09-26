import { settingsManifest } from "@/features/surfaces/manifests/settings.manifest";
import { createSettingsWriteHandlers } from "./write-handlers";

describe("matrx-user/settings write-target handlers", () => {
  const accepted = [
    {
      target: "theme_mode",
      value: "system",
      writes: [{ path: "theme.mode", value: "system" }],
    },
    {
      target: "theme_mode",
      value: "dark",
      writes: [{ path: "theme.mode", value: "dark" }],
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
      value: { emotion: "calm" },
      writes: [{ path: "userPreferences.voice.emotion", value: "calm" }],
    },
  ] as const;

  const refused = [
    { target: "theme_mode", value: "violet" },
    { target: "text_generation_style", value: { tone: "wobbly" } },
    { target: "language_defaults", value: { voice: "xx" } },
    { target: "assistant_name", value: "   " },
    { target: "voice_persona", value: { emotion: 42 } },
    // "cheerful" used to be silently accepted and silently ignored by
    // Cartesia — the write handler now refuses anything outside the
    // enum Cartesia actually supports (settings-truth-audit, 2026-09-25).
    { target: "voice_persona", value: { emotion: "cheerful" } },
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
