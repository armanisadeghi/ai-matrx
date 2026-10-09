/**
 * The retired `/settings/*` pages → the ONE settings surface at `/user-settings`.
 *
 * The old pages (app/(transitional)/settings/**, retired 2026-10-01) are gone;
 * their URLs live on in sent email (feedback notify, user-review-notify, the HR
 * digest's `/settings?tab=notifications`), in DM rows (`/settings/access-requests`),
 * bookmarks and other repos, so every one is a CONFIG redirect — never a route
 * shim, which renders the shell first and answers 200.
 *
 * 307 (permanent: false) on purpose: `routing.ts` plans to rename
 * `/user-settings` back to `/settings` once the overlay is retired, and a
 * browser-cached 308 `/settings → /user-settings` would then loop.
 *
 * `?tab=` (the old `/settings/preferences?tab=…` and `/settings?tab=…` deep
 * links) maps through LEGACY_TAB_ALIASES, then any registry tab id. The id list
 * is checked against `features/settings/registry.ts` and the hrefs against
 * `tabIdToHref` by `features/settings/route-shell/__tests__/legacy-settings-redirects.test.ts`,
 * so a new tab can never be missing here. Next.js keeps the original query on
 * the destination, so `?control=` (exact-setting focus) and `?box=` survive.
 */

const SETTINGS_BASE = "/user-settings";

/** Old preferences-modal tab ids → registry tab ids (from the retired page). */
const LEGACY_TAB_ALIASES = {
  display: "appearance.theme",
  messaging: "communication.messaging",
  voice: "voice.input",
  textToSpeech: "voice.voices",
  assistant: "ai.assistants",
  aiModels: "ai.models",
  email: "communication.email",
  videoConference: "communication.video",
  photoEditing: "ai.photoEditing",
  imageGeneration: "ai.imageGeneration",
  textGeneration: "ai.textGeneration",
  coding: "editor.coding",
  flashcard: "learning.flashcards",
  playground: "ai.models",
  agentContext: "ai.assistants",
  audioDevices: "devices",
  mediaDevices: "devices",
  // The tray of the residential-egress helper and the HR digest email.
  notifications: "general.notifications",
};

/**
 * Old tab ids with no screen of their own → the settings index. `prompts`: the
 * prompt preferences never had a reader-backed screen (see FEATURE.md).
 */
const LEGACY_TABS_TO_INDEX = ["prompts"];

/** Every id in `settingsRegistry` (drift-checked by the test). */
const REGISTRY_TAB_IDS = [
  "general", "general.notifications", "general.personalConfig", "general.language",
  "general.privacy", "general.conversationFilters", "general.lists", "general.calendarLinks", "general.system",
  "appearance", "appearance.theme", "appearance.density", "appearance.windows",
  "appearance.siteWorkbench", "ai", "ai.models", "ai.assistants", "ai.memory",
  "ai.textGeneration", "ai.imageGeneration", "ai.photoEditing", "editor", "editor.coding",
  "editor.codeWorkspace", "editor.notes", "editor.keybindings", "hardware", "devices",
  "files.devices", "voice", "voice.voices", "voice.input", "voice.diagnostics",
  "voice.dictionary", "apps", "communication.email", "communication.video",
  "communication.messaging", "learning.flashcards", "account", "account.identity",
  "account.contact", "account.addresses", "account.work", "account.emergency",
  "account.writingVoice", "plan", "organizations", "organizations.mediaCatalog",
  "integrations", "integrations.microsoft", "integrations.googleWorkspace",
  "sandboxStorage", "sandboxDefaults", "feedback", "accessRequests", "extension",
  "integrations.apiKeys", "admin", "admin.server",
];

/**
 * `/settings?tab=` only: the residential-egress helper's tray opens
 * `/settings?tab=devices` meaning "my computers" (features/residential-egress
 * types.ts), not the camera/microphone tab that `devices` names in the registry.
 */
const LEGACY_ROOT_TAB_OVERRIDES = { devices: "files.devices" };

/** Retired standalone pages → their tab in the one surface. */
const LEGACY_PAGE_TABS = {
  "/settings/profile": "account",
  "/settings/profile/voice": "account.writingVoice",
  "/settings/voice": "voice.diagnostics",
  "/settings/integrations": "integrations",
  "/settings/sandbox": "sandboxDefaults",
  "/settings/sandbox-storage": "sandboxStorage",
  "/settings/organizations": "organizations",
  "/settings/feedback": "feedback",
  "/settings/extension": "extension",
  "/settings/access-requests": "accessRequests",
};

/** Retired pages whose home is not settings at all (kept from their redirects). */
const LEGACY_PAGE_ELSEWHERE = {
  "/settings/secrets": "/vault",
  "/settings/projects": "/projects",
};

const camelToKebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/** Mirror of `tabIdToHref(SETTINGS_BASE, id)` (routing.ts) — equality is tested. */
function settingsTabHref(tabId) {
  if (!tabId || tabId === "firstScreen") return SETTINGS_BASE;
  return `${SETTINGS_BASE}/${tabId.split(".").map(camelToKebab).join("/")}`;
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function tabQueryRedirects(source, overrides = {}) {
  const byTab = new Map();
  for (const id of REGISTRY_TAB_IDS) byTab.set(id, settingsTabHref(id));
  for (const [legacy, id] of Object.entries(LEGACY_TAB_ALIASES)) byTab.set(legacy, settingsTabHref(id));
  for (const legacy of LEGACY_TABS_TO_INDEX) byTab.set(legacy, SETTINGS_BASE);
  for (const [legacy, id] of Object.entries(overrides)) byTab.set(legacy, settingsTabHref(id));
  return [...byTab.entries()].map(([tab, destination]) => ({
    source,
    has: [{ type: "query", key: "tab", value: `^${escapeRegex(tab)}$` }],
    destination,
    permanent: false,
  }));
}

const legacySettingsRedirects = [
  ...tabQueryRedirects("/settings/preferences"),
  ...tabQueryRedirects("/settings", LEGACY_ROOT_TAB_OVERRIDES),
  ...Object.entries(LEGACY_PAGE_TABS).map(([source, tabId]) => ({
    source,
    destination: settingsTabHref(tabId),
    permanent: false,
  })),
  ...Object.entries(LEGACY_PAGE_ELSEWHERE).map(([source, destination]) => ({
    source,
    destination,
    permanent: false,
  })),
  // No (or an unknown) tab: the settings index.
  { source: "/settings/preferences", destination: SETTINGS_BASE, permanent: false },
  { source: "/settings", destination: SETTINGS_BASE, permanent: false },
];

module.exports = {
  legacySettingsRedirects,
  LEGACY_TAB_ALIASES,
  LEGACY_TABS_TO_INDEX,
  LEGACY_ROOT_TAB_OVERRIDES,
  REGISTRY_TAB_IDS,
  LEGACY_PAGE_TABS,
  LEGACY_PAGE_ELSEWHERE,
  settingsTabHref,
};
