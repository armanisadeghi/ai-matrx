/**
 * @ai-matrx/chat/host — the host contract (no React). React door: `@ai-matrx/chat/host/react`.
 */

export * from "./contract";
export {
  configureChat,
  getChatHost,
  isChatHostConfigured,
  resolveChatHost,
  _resetChatHostForTests,
} from "./configure";
export {
  ChatHostInvalidError,
  ChatHostNotConfiguredError,
  ChatOrganizationRequiredError,
} from "./errors";
export {
  createLogClientErrorDiagnostics,
  isChatSourceApp,
  CHAT_SOURCE_FEATURE,
  DIAGNOSTICS_FLUSH_DELAY_MS,
  DIAGNOSTICS_MAX_PER_FLUSH,
} from "./defaults/diagnostics";
export { createDbIdentity, SIGNED_OUT_IDENTITY } from "./defaults/identity";
export { createNoPickerOrg } from "./defaults/org";
export {
  createDefaultServer,
  DEFAULT_CHAT_SERVER_URL,
} from "./defaults/server";
export { createDomNotifier } from "./defaults/notify";
export { createWebPrefs, CHAT_PREFS_PREFIX } from "./defaults/prefs";
export { createWindowNavigation } from "./defaults/navigation";
export { createUnhostedWindows } from "./defaults/windows";
export {
  CHAT_WINDOWS,
  CHAT_WINDOW_IDS,
  DEFAULT_WINDOW_INSTANCE_ID,
  isChatWindowId,
  type ChatWindowId,
} from "./windows";
export { createDbCatalogGetter } from "./defaults/catalog";
export { createDefaultChrome, DEFAULT_CHROME_STYLES } from "./defaults/chrome";
export { createDbFeedback } from "./defaults/feedback";
export { DEFAULT_CHAT_ROUTES } from "./configure";
