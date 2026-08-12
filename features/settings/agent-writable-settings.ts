/**
 * features/settings/agent-writable-settings.ts
 *
 * The VOCABULARY of every settings value an agent may write on
 * `matrx-user/settings` — the one place that knows what each of those
 * preferences is allowed to say. Deliberately dependency-free (no React, no
 * Redux, no imports at all) so all three consumers share it without a cycle:
 *
 *  - the settings TABS (`AppearanceTab`, `LanguageTab`, `TextGenerationTab`,
 *    `VoiceTab`) render their `<SettingsSelect>` options from these lists,
 *  - `settings.manifest.ts` interpolates the same lists into its
 *    `writeTargets` contract prose, so the enum an agent is TOLD about is
 *    generated from the list the UI renders,
 *  - `SettingsTabContentImpl`'s write handlers validate agent input against
 *    the same guards before dispatching.
 *
 * The point is that the enum an agent is TOLD about, the enum its value is
 * CHECKED against, and the enum the UI actually renders cannot drift apart —
 * they are all these lists. Never re-type these literals at a call site.
 *
 * Scope note: this file covers ONLY the preferences that earned an agent
 * write target. It is not a registry of every setting — most settings stay
 * agent-unwritable on purpose (see the manifest docblock for the exclusions
 * and why they are excluded).
 */

/** One selectable option, in the shape the settings primitives render. */
export interface SettingOption<T extends string = string> {
  value: T;
  label: string;
}

/** Build `"a | b | c"` enum prose from an option list. Never hand-write it. */
export function enumText(options: readonly SettingOption[]): string {
  return options.map((o) => o.value).join(" | ");
}

/** Runtime guard factory — the check a write handler runs on agent input. */
export function isOneOf<T extends string>(
  options: readonly SettingOption<T>[],
) {
  return (value: unknown): value is T =>
    typeof value === "string" &&
    options.some((option) => option.value === value);
}

// ── Theme mode (slice: theme.mode — boot-critical, synced) ────────────────
// NOTE: `slice-bindings.ts` independently rejects anything but light/dark on
// the way into the slice. This list is the UI + contract twin of that guard.

export const THEME_MODE_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies readonly SettingOption[];

export type ThemeMode = (typeof THEME_MODE_OPTIONS)[number]["value"];
export const THEME_MODE_ENUM_TEXT = enumText(THEME_MODE_OPTIONS);
export const isThemeMode = isOneOf(THEME_MODE_OPTIONS);

// ── Accent theme (userPreferences.display.theme) ──────────────────────────

export const ACCENT_THEME_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "night", label: "Night" },
  { value: "forest", label: "Forest" },
  { value: "ocean", label: "Ocean" },
  { value: "sunset", label: "Sunset" },
] as const satisfies readonly SettingOption[];

export type AccentTheme = (typeof ACCENT_THEME_OPTIONS)[number]["value"];
export const ACCENT_THEME_ENUM_TEXT = enumText(ACCENT_THEME_OPTIONS);
export const isAccentTheme = isOneOf(ACCENT_THEME_OPTIONS);

// ── Shell layout family (userPreferences.display.*) ───────────────────────
// Four independent selects that live in ONE "Layout" section of the
// Appearance tab and are chosen together as a single presentation decision —
// hence one bundled write target with four optional keys.

export const DASHBOARD_LAYOUT_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "compact", label: "Compact" },
  { value: "spacious", label: "Spacious" },
  { value: "grid", label: "Grid" },
] as const satisfies readonly SettingOption[];

export const SIDEBAR_LAYOUT_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "collapsed", label: "Auto-collapse" },
  { value: "expanded", label: "Always expanded" },
  { value: "floating", label: "Floating" },
] as const satisfies readonly SettingOption[];

export const HEADER_LAYOUT_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "compact", label: "Compact" },
  { value: "minimal", label: "Minimal" },
  { value: "expanded", label: "Expanded" },
] as const satisfies readonly SettingOption[];

export const WINDOW_MODE_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "fullscreen", label: "Fullscreen" },
  { value: "windowed", label: "Windowed" },
  { value: "minimal", label: "Minimal" },
] as const satisfies readonly SettingOption[];

export const DASHBOARD_LAYOUT_ENUM_TEXT = enumText(DASHBOARD_LAYOUT_OPTIONS);
export const SIDEBAR_LAYOUT_ENUM_TEXT = enumText(SIDEBAR_LAYOUT_OPTIONS);
export const HEADER_LAYOUT_ENUM_TEXT = enumText(HEADER_LAYOUT_OPTIONS);
export const WINDOW_MODE_ENUM_TEXT = enumText(WINDOW_MODE_OPTIONS);

export const isDashboardLayout = isOneOf(DASHBOARD_LAYOUT_OPTIONS);
export const isSidebarLayout = isOneOf(SIDEBAR_LAYOUT_OPTIONS);
export const isHeaderLayout = isOneOf(HEADER_LAYOUT_OPTIONS);
export const isWindowMode = isOneOf(WINDOW_MODE_OPTIONS);

// ── Text-generation style (userPreferences.textGeneration.*) ──────────────

export const TEXT_TONE_OPTIONS = [
  { value: "neutral", label: "Neutral" },
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "friendly", label: "Friendly" },
  { value: "formal", label: "Formal" },
  { value: "creative", label: "Creative" },
  { value: "technical", label: "Technical" },
  { value: "persuasive", label: "Persuasive" },
] as const satisfies readonly SettingOption[];

export const CREATIVITY_LEVEL_OPTIONS = [
  { value: "low", label: "Low — factual" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High — creative" },
] as const satisfies readonly SettingOption[];

export type TextTone = (typeof TEXT_TONE_OPTIONS)[number]["value"];
export type CreativityLevel =
  (typeof CREATIVITY_LEVEL_OPTIONS)[number]["value"];

export const TEXT_TONE_ENUM_TEXT = enumText(TEXT_TONE_OPTIONS);
export const CREATIVITY_LEVEL_ENUM_TEXT = enumText(CREATIVITY_LEVEL_OPTIONS);

export const isTextTone = isOneOf(TEXT_TONE_OPTIONS);
export const isCreativityLevel = isOneOf(CREATIVITY_LEVEL_OPTIONS);

// ── Language defaults (voice / textGeneration / flashcard) ────────────────
// There is no global app language — each feature keeps its own `language`
// preference, and the Language tab exists to set them in one place. Before
// this list existed the three tabs carried three DIFFERENT hand-typed
// language lists (text generation was missing hi/nl/pl/sv/tr); they now all
// render this one, which is the union.

export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "ru", label: "Russian" },
  { value: "hi", label: "Hindi" },
  { value: "nl", label: "Dutch" },
  { value: "pl", label: "Polish" },
  { value: "sv", label: "Swedish" },
  { value: "tr", label: "Turkish" },
] as const satisfies readonly SettingOption[];

export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]["value"];
export const LANGUAGE_ENUM_TEXT = enumText(LANGUAGE_OPTIONS);
export const isLanguageCode = isOneOf(LANGUAGE_OPTIONS);

/**
 * The three per-feature language preferences the Language tab sets, keyed by
 * the name the `language_defaults` write target accepts. One table, so the
 * target's accepted keys and the paths they dispatch to cannot drift.
 */
export const LANGUAGE_DEFAULT_FIELDS = [
  {
    /** Key accepted by the `language_defaults` write target. */
    key: "voice",
    /** The `useSetting` path this key writes. */
    path: "userPreferences.voice.language",
    /** Model-facing gloss, interpolated into the contract prose. */
    summary: "speech-to-text recognition language",
  },
  {
    key: "text_generation",
    path: "userPreferences.textGeneration.language",
    summary: "default language for generated text",
  },
  {
    key: "flashcards",
    path: "userPreferences.flashcard.language",
    summary: "default language for study content",
  },
] as const;

export type LanguageDefaultKey =
  (typeof LANGUAGE_DEFAULT_FIELDS)[number]["key"];

/** `"voice | text_generation | flashcards"` — interpolate, never re-type. */
export const LANGUAGE_DEFAULT_KEYS_TEXT = LANGUAGE_DEFAULT_FIELDS.map(
  (f) => f.key,
).join(" | ");

// ── Bundled-target field tables ───────────────────────────────────────────
// A write target that patches several enum fields at once needs, per key:
// the `useSetting` path it dispatches to, the guard its value must pass, and
// the enum prose the contract quotes. Keeping all three in ONE row is what
// stops the contract, the check, and the dispatch from drifting apart.

/** One patchable enum field inside a bundled write target. */
export interface EnumPatchField {
  /** Key the write target accepts in its object value. */
  key: string;
  /** The `useSetting` path this key writes. */
  path: string;
  /** Runtime guard the value must pass. */
  guard: (value: unknown) => boolean;
  /** `"a | b | c"` — quoted back to the agent on a bad value. */
  enumText: string;
}

/** `display_layout` — the Appearance tab's four Layout selects. */
export const DISPLAY_LAYOUT_FIELDS: readonly EnumPatchField[] = [
  {
    key: "dashboard_layout",
    path: "userPreferences.display.dashboardLayout",
    guard: isDashboardLayout,
    enumText: DASHBOARD_LAYOUT_ENUM_TEXT,
  },
  {
    key: "sidebar_layout",
    path: "userPreferences.display.sidebarLayout",
    guard: isSidebarLayout,
    enumText: SIDEBAR_LAYOUT_ENUM_TEXT,
  },
  {
    key: "header_layout",
    path: "userPreferences.display.headerLayout",
    guard: isHeaderLayout,
    enumText: HEADER_LAYOUT_ENUM_TEXT,
  },
  {
    key: "window_mode",
    path: "userPreferences.display.windowMode",
    guard: isWindowMode,
    enumText: WINDOW_MODE_ENUM_TEXT,
  },
];

/** `text_generation_style` — tone + creativity. */
export const TEXT_STYLE_FIELDS: readonly EnumPatchField[] = [
  {
    key: "tone",
    path: "userPreferences.textGeneration.tone",
    guard: isTextTone,
    enumText: TEXT_TONE_ENUM_TEXT,
  },
  {
    key: "creativity",
    path: "userPreferences.textGeneration.creativityLevel",
    guard: isCreativityLevel,
    enumText: CREATIVITY_LEVEL_ENUM_TEXT,
  },
];

/** `language_defaults` — the same three rows as {@link LANGUAGE_DEFAULT_FIELDS}. */
export const LANGUAGE_PATCH_FIELDS: readonly EnumPatchField[] =
  LANGUAGE_DEFAULT_FIELDS.map((field) => ({
    key: field.key,
    path: field.path,
    guard: isLanguageCode,
    enumText: LANGUAGE_ENUM_TEXT,
  }));

// ── Free-text bounds ──────────────────────────────────────────────────────
// The authored (non-enum) targets still need a shape contract, so the handler
// has something concrete to refuse on and the agent is told the limit up
// front rather than discovering it via an error.

/** Max length for the assistant name (`userPreferences.assistant.name`). */
export const ASSISTANT_NAME_MAX_LENGTH = 60;
/** Max length for the voice emotion hint (`userPreferences.voice.emotion`). */
export const VOICE_EMOTION_MAX_LENGTH = 80;
/** Max length for the voice wake word (`userPreferences.voice.wakeWord`). */
export const VOICE_WAKE_WORD_MAX_LENGTH = 40;
