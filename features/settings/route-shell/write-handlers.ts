import {
  ASSISTANT_NAME_MAX_LENGTH,
  LANGUAGE_PATCH_FIELDS,
  TEXT_STYLE_FIELDS,
  THEME_MODE_ENUM_TEXT,
  VOICE_EMOTION_ENUM_TEXT,
  isThemeMode,
  isVoiceEmotion,
  type EnumPatchField,
} from "@/features/settings/agent-writable-settings";

export type PendingWrite = { path: string; value: unknown };

function requirePatch(
  target: string,
  value: unknown,
  accepted: readonly string[],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(
      `${target} expects an object with any subset of these keys: ${accepted.join(" | ")}.`,
    );
  const patch = value as Record<string, unknown>;
  const unsupported = Object.keys(patch).filter(
    (key) => !accepted.includes(key),
  );
  if (unsupported.length > 0)
    throw new Error(
      `${target} got unsupported key(s): ${unsupported.join(", ")}. Accepted keys: ${accepted.join(" | ")}.`,
    );
  if (!accepted.some((key) => key in patch))
    throw new Error(
      `${target} needs at least one of: ${accepted.join(" | ")}.`,
    );
  return patch;
}

function resolveEnumPatch(
  target: string,
  patch: Record<string, unknown>,
  fields: readonly EnumPatchField[],
): PendingWrite[] {
  const writes: PendingWrite[] = [];
  for (const field of fields) {
    if (!(field.key in patch)) continue;
    const next = patch[field.key];
    if (!field.guard(next))
      throw new Error(
        `${target}.${field.key} expects one of: ${field.enumText}. Got ${JSON.stringify(next)}.`,
      );
    writes.push({ path: field.path, value: next });
  }
  return writes;
}

function requireText(
  target: string,
  value: unknown,
  maxLength: number,
  { allowEmpty }: { allowEmpty: boolean },
): string {
  if (typeof value !== "string")
    throw new Error(
      `${target} expects a plain text string — not JSON and not JSON-encoded. Got ${typeof value}.`,
    );
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed)
    throw new Error(`${target} expects a non-empty plain text string.`);
  if (trimmed.length > maxLength)
    throw new Error(
      `${target} must be at most ${maxLength} characters (got ${trimmed.length}).`,
    );
  return trimmed;
}

export function createSettingsWriteHandlers(
  commit: (target: string, writes: PendingWrite[]) => void,
) {
  return {
    theme_mode: (value: unknown) => {
      if (!isThemeMode(value))
        throw new Error(
          `theme_mode expects one of: ${THEME_MODE_ENUM_TEXT}. Got ${JSON.stringify(value)}.`,
        );
      commit("theme_mode", [{ path: "theme.mode", value }]);
    },
    text_generation_style: (value: unknown) => {
      const patch = requirePatch(
        "text_generation_style",
        value,
        TEXT_STYLE_FIELDS.map((field) => field.key),
      );
      commit(
        "text_generation_style",
        resolveEnumPatch("text_generation_style", patch, TEXT_STYLE_FIELDS),
      );
    },
    language_defaults: (value: unknown) => {
      const patch = requirePatch(
        "language_defaults",
        value,
        LANGUAGE_PATCH_FIELDS.map((field) => field.key),
      );
      commit(
        "language_defaults",
        resolveEnumPatch("language_defaults", patch, LANGUAGE_PATCH_FIELDS),
      );
    },
    assistant_name: (value: unknown) => {
      const name = requireText(
        "assistant_name",
        value,
        ASSISTANT_NAME_MAX_LENGTH,
        { allowEmpty: false },
      );
      commit("assistant_name", [
        { path: "userPreferences.assistant.name", value: name },
      ]);
    },
    voice_persona: (value: unknown) => {
      // wake_word was retired from this contract (settings-truth-audit,
      // 2026-09-25): there is no wake-word detection in the frontend, so an
      // agent "setting" it used to save a value nothing ever read.
      const patch = requirePatch("voice_persona", value, ["emotion"]);
      const writes: PendingWrite[] = [];
      if ("emotion" in patch) {
        if (!isVoiceEmotion(patch.emotion))
          throw new Error(
            `voice_persona.emotion expects one of: ${VOICE_EMOTION_ENUM_TEXT}. Got ${JSON.stringify(patch.emotion)}.`,
          );
        writes.push({
          path: "userPreferences.voice.emotion",
          value: patch.emotion,
        });
      }
      commit("voice_persona", writes);
    },
  };
}
