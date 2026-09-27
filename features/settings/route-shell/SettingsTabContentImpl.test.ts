import { readFileSync } from "node:fs";
import path from "node:path";
import { settingsManifest } from "@/features/surfaces/manifests/settings.manifest";
import { createSettingsWriteHandlers } from "./write-handlers";

/**
 * Targets whose state lives in one tab, registered by that tab with
 * `useSurfaceWriteHandlers` (not by the route emitter). Each must be
 * registered in the file named here, so a declared target can never lose its
 * handler silently.
 */
const DESCENDANT_OWNED_TARGETS: Readonly<Record<string, string>> = {
  ai_voice_defaults: "features/settings/tabs/FirstScreenTab.tsx",
  default_organization: "features/settings/tabs/FirstScreenTab.tsx",
  notification_preferences: "features/settings/tabs/NotificationsTab.tsx",
  hidden_models: "components/user-preferences/AiModelsPreferences.tsx",
};

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
        .filter((name) => !(name in DESCENDANT_OWNED_TARGETS))
        .sort(),
    );
    for (const [target, file] of Object.entries(DESCENDANT_OWNED_TARGETS)) {
      expect(settingsManifest.writeTargets?.some((t) => t.name === target)).toBe(true);
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source).toContain("useSurfaceWriteHandlers");
      expect(source).toMatch(new RegExp(`\\b${target}:`));
    }
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
