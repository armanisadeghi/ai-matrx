/**
 * Surface manifest — Settings (`matrx-user/settings`).
 *
 * Drives `/user-settings/[[...path]]` — the route-driven settings surface
 * (`features/settings`, `SettingsRouteShell` + `SettingsTabContent` +
 * `SettingsTabHost`). The catch-all URL resolves to a tab id from the
 * settings registry ("general.notifications" ↔ /user-settings/general/
 * notifications); the bare `/user-settings` index resolves to NO tab (the
 * landing state), so the active-tab values are honest optionals.
 *
 * What the page loads: the resolved active tab's registry definition
 * (label, description, persistence tier), the visible sections tree (admin
 * tabs included only for admins), and the autosave flush status.
 *
 * There is still no registry of per-tab setting keys, so this surface does
 * NOT enumerate every setting on the open tab (see the settings-system
 * skill). What it does enumerate is the `preferences` group: the specific
 * subset that earned an agent WRITE target, plus a read twin for each. Those
 * are read straight from Redux, so they are populated on every tab — not
 * only on the tab that happens to own the control.
 *
 * Runtime emitter: `features/settings/route-shell/SettingsTabContent.tsx`
 * (mounts `SurfaceRuntimeProvider` and assembles the scope at Run time via
 * `createSettingsScope`).
 *
 * ── Why these targets and not the others ──────────────────────────────────
 *
 * Settings is an unusually dangerous surface to open up, so the exclusions
 * below are DELIBERATE, not oversights. Do not "complete" this list later
 * without re-arguing the line.
 *
 * NOT targets, at any policy:
 *  - ACCOUNT IDENTITY — the Profile tabs (identity, contact, addresses,
 *    emergency, work), the user's own name, email, avatar. An agent editing
 *    who the user *is* is out of bounds; `assistant_name` is the AI's
 *    nickname and is not this.
 *  - SECURITY — passwords, MFA, sessions, API keys and tokens. Same line
 *    that ruled `marketing-integrations` out of this campaign for being
 *    credentials, and it applies harder here because this is the user's own
 *    account rather than a project's config.
 *  - BILLING and ORGANIZATION MEMBERSHIP/ROLES (the Organizations tab) —
 *    entitlement and access-control changes are human decisions.
 *  - CAPABILITY GOVERNANCE — the AI Models and Admin Server tabs (server
 *    override, model enablement). Ruled out campaign-wide for
 *    `admin-ai-models` for exactly this reason.
 *  - PRIVACY / BACKGROUND CAPTURE — the whole Privacy tab. `alwaysWatching`
 *    turns on screen observation and auto knowledge-graph turns on
 *    background analysis of the user's notes and files. An agent widening
 *    its own observation window is a privacy escalation, not a preference.
 *  - INTEGRATIONS / connected accounts (Google Workspace, Extension) —
 *    credentials and grants again.
 *  - NAVIGATION — `active_tab_id` and friends. Those are read values that
 *    say where the user is; making them writable would be a mechanical
 *    "move the user around" toggle, which is not what this seam is for.
 *  - TRANSIENT / EXPERIMENTAL SHELL STATE — `layout.isInWindow` (flagged
 *    experimental, wraps the shell in a WindowPanel) and the windowManager
 *    session actions. Local-only, resets on reload, nothing an agent is
 *    better placed to decide than the user's own click.
 *
 * What's left — and what IS declared — is the honest answer: user-authored
 * preference content (assistant name, voice persona) and presentation /
 * default-style choices (color mode, accent, shell layout, writing style,
 * per-feature languages). These are the settings someone would plausibly
 * ask an assistant to set for them: "switch me to dark and make it compact",
 * "I work in Spanish now", "keep my drafts formal and factual".
 *
 * ── Mounts ────────────────────────────────────────────────────────────────
 *
 * `SettingsTabContentImpl` (the /user-settings route) is the ONLY mount that
 * registers this surface, and therefore the only one carrying write
 * handlers. The settings shell also renders inside a WindowPanel on desktop
 * and a Vaul drawer on mobile, but those never mount a
 * `SurfaceRuntimeProvider` for `matrx-user/settings` — they own no surface
 * state of their own, so they register nothing, by design.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  ACCENT_THEME_ENUM_TEXT,
  ASSISTANT_NAME_MAX_LENGTH,
  CREATIVITY_LEVEL_ENUM_TEXT,
  DASHBOARD_LAYOUT_ENUM_TEXT,
  HEADER_LAYOUT_ENUM_TEXT,
  LANGUAGE_DEFAULT_KEYS_TEXT,
  LANGUAGE_ENUM_TEXT,
  SIDEBAR_LAYOUT_ENUM_TEXT,
  TEXT_TONE_ENUM_TEXT,
  THEME_MODE_ENUM_TEXT,
  VOICE_EMOTION_MAX_LENGTH,
  VOICE_WAKE_WORD_MAX_LENGTH,
  WINDOW_MODE_ENUM_TEXT,
} from "@/features/settings/agent-writable-settings";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "active_section",
    label: "Active section",
    sortOrder: 100,
    description:
      "The settings tab the user currently has open, resolved from the URL.",
  },
  {
    key: "navigation",
    label: "Navigation",
    sortOrder: 200,
    description:
      "Every settings section visible to this user, and the visibility tier.",
  },
  {
    key: "sync_state",
    label: "Sync state",
    sortOrder: 300,
    description: "Autosave / preference-sync status of the settings store.",
  },
  {
    key: "preferences",
    label: "Agent-writable preferences",
    sortOrder: 400,
    description:
      "The subset of the user's preferences an agent may read and change here. Read from Redux regardless of which tab is open — these are NOT limited to the active tab.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Active section ────────────────────────────────────────────────────
  {
    name: "active_tab_id",
    label: "Active tab id",
    description:
      'Registry id of the open settings tab (dot-notation, e.g. "ai.textGeneration"). Empty on the /user-settings index landing (no tab selected) or when the URL names a tab that does not exist.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 26,
    sortOrder: 300,
    group: "active_section",
  },
  {
    name: "active_tab_label",
    label: "Active tab label",
    description:
      "Display label of the open settings tab as shown in the tree and breadcrumb. Empty when no tab is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 310,
    group: "active_section",
  },
  {
    name: "active_tab_description",
    label: "Active tab description",
    description:
      "Short registry description of what the open tab configures. Empty when no tab is open or the tab has no description.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 320,
    group: "active_section",
  },
  {
    name: "active_tab_path",
    label: "Active tab URL",
    description:
      'Site-relative URL of the open tab (e.g. "/user-settings/ai/text-generation"). Empty when no tab is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 44,
    sortOrder: 330,
    group: "active_section",
  },
  {
    name: "active_tab_persistence",
    label: "Active tab persistence",
    description:
      'Where the open tab\'s settings are persisted: "synced" (saved to the user\'s account across devices), "local-only", or "session". Empty when no tab is open. Lets an agent tell the user whether changes here survive a refresh.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 340,
    group: "active_section",
  },
  {
    name: "active_tab",
    label: "Active tab",
    description:
      "Composite of the open tab as one object: { id, label, description, path, persistence, requires_admin }. Mirrors the individual active-section values (completeness law). Absent when no tab is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 350,
    group: "active_section",
  },

  // ── Navigation ────────────────────────────────────────────────────────
  {
    name: "settings_sections",
    label: "All settings sections",
    description:
      "Every settings tab (leaf) visible to this user, flattened from the sidebar tree: one entry per tab with { id, label, path }. Always populated. Admin-only tabs appear only when the user is an admin. The map for guiding the user to the right setting.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 3000,
    sortOrder: 400,
    group: "navigation",
  },
  {
    name: "is_admin_view",
    label: "Admin view",
    description:
      "True when the user is an admin and admin-only settings tabs are included in the visible tree. Always populated.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 410,
    group: "navigation",
  },

  // ── Sync state ────────────────────────────────────────────────────────
  {
    name: "is_saving",
    label: "Saving in progress",
    description:
      "True while a preference autosave flush is in flight (the footer shows Saving…); false when everything is auto-saved and synced. Always populated.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 500,
    group: "sync_state",
  },

  // ── Agent-writable preferences (read twins of the write targets) ──────
  // Each of these is the READ half of a `writeTargets` entry below — the
  // evidence loop: the agent sees the current value, changes it, and sees
  // the new one. All are read straight from Redux by the route emitter, so
  // they are populated on EVERY settings tab, not only their own.
  {
    name: "theme_mode",
    label: "Color mode",
    description:
      `Current app color mode: ${THEME_MODE_ENUM_TEXT}. Applied before first paint and synced across the user's devices.`,
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 600,
    group: "preferences",
  },
  {
    name: "accent_theme",
    label: "Accent theme",
    description: `Current accent color scheme overlay: ${ACCENT_THEME_ENUM_TEXT}.`,
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 7,
    sortOrder: 610,
    group: "preferences",
  },
  {
    name: "display_layout",
    label: "Shell layout",
    description:
      "How the app shell is arranged, as one object: { dashboard_layout, sidebar_layout, header_layout, window_mode }. The four presentation selects in the Appearance tab's Layout section.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 120,
    sortOrder: 620,
    group: "preferences",
  },
  {
    name: "text_generation_style",
    label: "Text generation style",
    description:
      "Default writing style for text-generation surfaces, as one object: { tone, creativity }.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 630,
    group: "preferences",
  },
  {
    name: "language_defaults",
    label: "Language defaults",
    description:
      `Per-feature language defaults as one object, keyed by feature: { ${LANGUAGE_DEFAULT_KEYS_TEXT} }. There is no single global app language — each feature carries its own.`,
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 80,
    sortOrder: 640,
    group: "preferences",
  },
  {
    name: "assistant_name",
    label: "Assistant name",
    description:
      "What the user's AI assistant calls itself. Empty when the user has not named it. This is the ASSISTANT's nickname, never the user's own name.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 650,
    group: "preferences",
  },
  {
    name: "voice_persona",
    label: "Voice persona",
    description:
      "Spoken-reply persona as one object: { emotion, wake_word }. `emotion` is a free-text delivery hint (\"cheerful\", \"calm\"); `wake_word` is the phrase that activates the assistant. Either may be empty.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 660,
    group: "preferences",
  },
];

/**
 * Write targets — the preferences an agent may CHANGE here.
 *
 * Every one of these lands through `useSetting`'s own seam
 * (`getSliceBinding(slice).write(key, value)` dispatched to the store) — the
 * exact action the user's own click dispatches. There is no parallel write
 * path and nothing touches the persistence layer behind the store.
 *
 * `mode: "entity"` throughout, honestly: settings have no draft/save step —
 * they autosave, and the synced tiers follow the user to every device and
 * every future session. `applyPolicy: "ask"` throughout for the same reason.
 * Even the purely cosmetic targets, which a `ui`-mode surface might take on
 * `"auto"`, are DURABLE here: an agent silently repainting someone's app and
 * having it still be repainted on their phone tomorrow is not a cheap,
 * visible, self-correcting change. The confirm is the point.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "theme_mode",
    label: "Color mode",
    description: `Set the app's color mode. Expects exactly one of: ${THEME_MODE_ENUM_TEXT}. Applies immediately and is saved to the user's account (it follows them to other devices and survives reload).`,
    valueType: "string",
    updatesValue: "theme_mode",
    mode: "entity",
    applyPolicy: "ask",
    group: "preferences",
    sortOrder: 600,
  },
  {
    name: "accent_theme",
    label: "Accent theme",
    description: `Set the accent color scheme overlay. Expects exactly one of: ${ACCENT_THEME_ENUM_TEXT}. Saved to the user's account.`,
    valueType: "string",
    updatesValue: "accent_theme",
    mode: "entity",
    applyPolicy: "ask",
    group: "preferences",
    sortOrder: 610,
  },
  {
    name: "display_layout",
    label: "Shell layout",
    description: `Change how the app shell is arranged. Expects an OBJECT with any subset of these keys — send only the ones you want to change, the rest are left alone: dashboard_layout (${DASHBOARD_LAYOUT_ENUM_TEXT}), sidebar_layout (${SIDEBAR_LAYOUT_ENUM_TEXT}), header_layout (${HEADER_LAYOUT_ENUM_TEXT}), window_mode (${WINDOW_MODE_ENUM_TEXT}). At least one key is required; an unknown key or an out-of-vocabulary value is refused and NOTHING is applied. Saved to the user's account.`,
    valueType: "object",
    updatesValue: "display_layout",
    mode: "entity",
    applyPolicy: "ask",
    group: "preferences",
    sortOrder: 620,
  },
  {
    name: "text_generation_style",
    label: "Text generation style",
    description: `Set the default writing style for text-generation surfaces. Expects an OBJECT with any subset of: tone (${TEXT_TONE_ENUM_TEXT}), creativity (${CREATIVITY_LEVEL_ENUM_TEXT}). Send only the keys you want to change; at least one is required. Saved to the user's account.`,
    valueType: "object",
    updatesValue: "text_generation_style",
    mode: "entity",
    applyPolicy: "ask",
    group: "preferences",
    sortOrder: 630,
  },
  {
    name: "language_defaults",
    label: "Language defaults",
    description: `Set the per-feature default languages. Expects an OBJECT with any subset of these keys: ${LANGUAGE_DEFAULT_KEYS_TEXT}. Each value must be one of: ${LANGUAGE_ENUM_TEXT}. Send only the features you want to change; at least one is required. There is no global language setting — to switch the user's whole experience, send all three keys. Saved to the user's account.`,
    valueType: "object",
    updatesValue: "language_defaults",
    mode: "entity",
    applyPolicy: "ask",
    group: "preferences",
    sortOrder: 640,
  },
  {
    name: "assistant_name",
    label: "Assistant name",
    description: `Set what the user's AI assistant calls itself (e.g. "Jarvis"). Expects a non-empty plain-text string of at most ${ASSISTANT_NAME_MAX_LENGTH} characters — not JSON and not JSON-encoded. This is the ASSISTANT's nickname; it is NOT the user's own name and changes no account identity. Saved to the user's account.`,
    valueType: "string",
    updatesValue: "assistant_name",
    mode: "entity",
    applyPolicy: "ask",
    group: "preferences",
    sortOrder: 650,
  },
  {
    name: "voice_persona",
    label: "Voice persona",
    description: `Set how spoken replies are delivered. Expects an OBJECT with any subset of: emotion (free-text delivery hint like "cheerful" or "calm", max ${VOICE_EMOTION_MAX_LENGTH} characters), wake_word (the phrase that activates the assistant, max ${VOICE_WAKE_WORD_MAX_LENGTH} characters). Both are plain text, not JSON and not JSON-encoded. Send only the keys you want to change; at least one is required. Pass an empty string to clear a field. Saved to the user's account.`,
    valueType: "object",
    updatesValue: "voice_persona",
    mode: "entity",
    applyPolicy: "ask",
    group: "preferences",
    sortOrder: 660,
  },
];

export const settingsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/settings",
  readiness: "verified",
  label: "Settings",
  urlPattern: "/user-settings",
  intro: `<surface_intro>
You are on Settings: the user's preference center, organized as a tree of sections (appearance, AI, voice, profile, integrations, …) with one tab open at a time.
The Active section group tells you WHERE the user is: which tab is open, what it configures, and its persistence tier ("synced" settings follow the account across devices; "local-only"/"session" reset). All active-tab values are absent on the /user-settings landing page before a section is chosen.
settings_sections is the full map of every section this user can see (each with its URL) — use it to point the user at the right place.
The Agent-writable preferences group is the subset you can both READ and CHANGE: color mode, accent theme, shell layout, text-generation style, per-feature language defaults, the assistant's name, and the voice persona. These are readable and writable from ANY settings tab — you never have to navigate the user to a tab first. Every other setting on this page is read-only to you: identity, security, billing, organization roles, integrations, model governance, and the privacy/background-capture toggles are deliberately not writable, so decline rather than improvise if asked to change one.
Changes here are DURABLE — they save to the user's account and follow them to other devices — so every write asks the user first, and declining is a normal answer. Everything auto-saves; is_saving reflects a flush in flight, and writes are refused while one is in progress.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("context"), surfaceSpecific),
  writeTargets,
};

/** One visible settings tab (leaf) as emitted in `settings_sections`. */
export interface SettingsSectionEntry {
  id: string;
  label: string;
  path: string;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
/** The agent-writable preference block, as emitted and as written back. */
export interface SettingsDisplayLayout {
  dashboard_layout: string;
  sidebar_layout: string;
  header_layout: string;
  window_mode: string;
}

/** `text_generation_style` — the writing-style defaults. */
export interface SettingsTextGenerationStyle {
  tone: string;
  creativity: string;
}

/** `language_defaults` — one language per feature that carries one. */
export interface SettingsLanguageDefaults {
  voice: string;
  text_generation: string;
  flashcards: string;
}

/** `voice_persona` — free-text spoken-reply persona. */
export interface SettingsVoicePersona {
  emotion: string;
  wake_word: string;
}

export function createSettingsScope(values: {
  // alwaysAvailable: true → required
  settings_sections: SettingsSectionEntry[];
  is_admin_view: boolean;
  is_saving: boolean;
  theme_mode: string;
  accent_theme: string;
  display_layout: SettingsDisplayLayout;
  text_generation_style: SettingsTextGenerationStyle;
  language_defaults: SettingsLanguageDefaults;
  assistant_name: string;
  voice_persona: SettingsVoicePersona;
  // alwaysAvailable: false → optional (absent on the index landing)
  active_tab_id?: string;
  active_tab_label?: string;
  active_tab_description?: string;
  active_tab_path?: string;
  active_tab_persistence?: string;
  active_tab?: {
    id: string;
    label: string;
    description: string | null;
    path: string;
    persistence: string;
    requires_admin: boolean;
  };
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
