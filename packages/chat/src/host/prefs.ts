/**
 * The prefs seam (PACKAGE-INDEPENDENCE §2.3, slice P8) — the person's
 * preferences, the debug flags, and the settings register, read the way every
 * package call site read them from the host app before.
 *
 * Same names and shapes the call sites imported from the app
 * (`selectIsDebugMode`, `selectIsSuperAdminDebugger`, `selectShowCreatorPanel`,
 * `selectCreatorSettings`, `selectDesktopTargetInstanceId`, `setPreference`,
 * `setIsCreator`, `toggleShowCreatorPanel`, `toggleDebugMode`, `getSessionKnob`, `ensureEffectiveKnob`, `setKnobOverride`,
 * `knobRefusalSentence`, `DirectiveApplyPolicy`, `CodeAgentFilter`), so moving
 * a call site onto the prefs port changed only its import specifier. React
 * reads (`useSessionKnob`, `useEffectiveKnob`, `useDebugContext`, `SettingDoor`)
 * are in `./prefs-react`.
 *
 *   - Synchronous reads come from the package's own `chatHost.preferences`,
 *     which `<ChatProvider>` keeps equal to the prefs port's `preferences()`
 *     (and matrx-frontend's root reducer keeps equal to its own preference
 *     slices in the same reduction). A store with no `chatHost` reads the
 *     platform defaults — debug off, nothing bound.
 *   - Writes go to the port (`prefs.write`); the host applies them to its own
 *     store, and `preferences()` reflects them before the write returns.
 *   - Knobs go to the port's settings register (`prefs.knobs`).
 *
 * Debug flags are tooling, never power: `superAdminDebugger` is true on every
 * page for a super admin; admin POWER is identity's lane-aware level.
 */

import type {
  ChatConversationSurfaceFilter,
  ChatCreatorSettings,
  ChatDirectiveApplyPolicy,
  ChatKnobOverrideInput,
  ChatKnobOverrideResult,
  ChatKnobRef,
  ChatKnobScope,
  ChatKnobsPort,
  ChatPreferences,
  ChatPreferenceWrite,
  ChatPrefsPort,
  ChatSandboxBinding,
} from "./contract";
import { getChatHost, isChatHostConfigured } from "./configure";
import { announceOnce } from "./errors";
import { createUnhostedKnobs, DEFAULT_CHAT_PREFERENCES } from "./defaults/prefs";

// ── Types the call sites imported from the app ──────────────────────────────

export type DirectiveApplyPolicy = ChatDirectiveApplyPolicy;
export type CreatorDebugSettings = ChatCreatorSettings;
export type SandboxBinding = ChatSandboxBinding;
export type ConversationFilterSurfacePref = ChatConversationSurfaceFilter;
export type KnobRef = ChatKnobRef;
export type KnobScope = ChatKnobScope;

/** The agent filter a surface stores in the person's preferences (the /code workspace seed). */
export interface CodeAgentFilter {
  mode: "all" | "tags" | "categories" | "favorites" | "explicit";
  tags: string[];
  categories: string[];
  agentIds: string[];
}

// ── The port ────────────────────────────────────────────────────────────────

const UNHOSTED_KNOBS = createUnhostedKnobs();

/** The configured host's prefs port, or null before one is configured. */
function configuredPrefs(): ChatPrefsPort | null {
  return isChatHostConfigured() ? getChatHost().prefs : null;
}

/** The settings register: the configured host's, else none (said once). */
export function chatKnobs(prefs: ChatPrefsPort | null = configuredPrefs()): ChatKnobsPort {
  return prefs?.knobs ?? UNHOSTED_KNOBS;
}

/** Apply one change through the prefs port. With no host, or a host that keeps none, it is refused — said once. */
export function writeChatPreference(change: ChatPreferenceWrite): void {
  const prefs = configuredPrefs();
  if (prefs?.write) {
    prefs.write(change);
    return;
  }
  announceOnce(
    `prefs-write-refused:${change.kind}`,
    prefs
      ? "This chat host keeps no preferences, so a change was not kept. Pass a `prefs` port with `write`."
      : "A preference changed before a chat host was configured, so it was not kept. " +
          "Wrap the app in <ChatProvider host={{ db }}>.",
  );
}

// ── Selectors (any store that mounts `chatHost`) ─────────────────────────────

type WithChatHostPreferences =
  | { chatHost?: { preferences?: ChatPreferences } }
  | null
  | undefined;

/** The typed preferences; the platform defaults in a store without `chatHost`. */
export const selectChatPreferences = (state: unknown): ChatPreferences =>
  (state as WithChatHostPreferences)?.chatHost?.preferences ?? DEFAULT_CHAT_PREFERENCES;

/** False until the host's stored preferences loaded (a read before is the default, not a choice). */
export const selectPreferencesLoaded = (state: unknown): boolean =>
  selectChatPreferences(state).loaded;

/** Debug tooling for a super admin, on every page. Never admin power. */
export const selectIsSuperAdminDebugger = (state: unknown): boolean =>
  selectChatPreferences(state).superAdminDebugger;

export const selectIsDebugMode = (state: unknown): boolean =>
  selectChatPreferences(state).debugMode;

export const selectShowCreatorPanel = (state: unknown): boolean =>
  selectChatPreferences(state).showCreatorPanel;

export const selectCreatorSettings = (state: unknown): CreatorDebugSettings =>
  selectChatPreferences(state).creatorSettings;

export const selectDesktopTargetInstanceId = (state: unknown): string | null =>
  selectChatPreferences(state).desktopTargetInstanceId;

export const selectDirectiveApplyPolicy = (state: unknown): DirectiveApplyPolicy =>
  selectChatPreferences(state).directiveApplyPolicy;

export const selectRestoreUnsentDrafts = (state: unknown): boolean =>
  selectChatPreferences(state).restoreUnsentDrafts;

export const selectSandboxBySurface = (
  state: unknown,
): Readonly<Record<string, SandboxBinding>> => selectChatPreferences(state).sandboxBySurface;

export const selectSandboxCanvasAutoOpen = (state: unknown): boolean =>
  selectChatPreferences(state).sandboxCanvasAutoOpen;

export const selectStoredConversationLanes = (state: unknown): readonly string[] | undefined =>
  selectChatPreferences(state).conversationLanes;

export const selectConversationSurfaceFilters = (
  state: unknown,
): Readonly<Record<string, ConversationFilterSurfacePref>> | undefined =>
  selectChatPreferences(state).conversationSurfaces;

export const selectPreferredScratchpadId = (state: unknown): string | null =>
  selectChatPreferences(state).activeScratchpadId;

// ── Writes (dispatchable: `dispatch(setPreference(...))`) ───────────────────

type PreferenceThunk = () => void;

/** `module.preference = value` in the person's stored preferences. */
export function setPreference(payload: {
  module: string;
  preference: string;
  value: unknown;
}): PreferenceThunk {
  return () => writeChatPreference({ kind: "preference", ...payload });
}

/** Whether the person owns the agent in context (creator authority — never a UI toggle). */
export function setIsCreator(isCreator: boolean): PreferenceThunk {
  return () => writeChatPreference({ kind: "creator-ownership", isCreator });
}

/** Flip the inline creator run panel. */
export function toggleShowCreatorPanel(): PreferenceThunk {
  return () => writeChatPreference({ kind: "creator-panel-toggled" });
}

/** Flip the admin debug-mode switch. */
export function toggleDebugMode(): PreferenceThunk {
  return () => writeChatPreference({ kind: "debug-mode-toggled" });
}

// ── The settings register, outside React ────────────────────────────────────

/** Cached effective value for this session (warming the cache when cold); `undefined` until answered. */
export function getSessionKnob(ref: KnobRef): unknown {
  return chatKnobs().peekSession(ref);
}

/** The effective value, awaited. */
export function ensureEffectiveKnob(
  organizationId: string | null,
  userId: string | null,
  ref: KnobRef,
  scopes?: readonly KnobScope[],
): Promise<unknown> {
  return chatKnobs().ensure(organizationId, userId, ref, scopes);
}

/** Write (or clear, `value: null`) one override. A refusal is a result, never a throw. */
export function setKnobOverride(input: ChatKnobOverrideInput): Promise<ChatKnobOverrideResult> {
  return chatKnobs().setOverride(input);
}

/** A server refusal as ONE sentence a screen can show. */
export function knobRefusalSentence(result: {
  reason?: string | null;
  detail?: string | null;
}): string {
  return (
    [result.reason, result.detail].filter(Boolean).join(" — ") ||
    "The setting was refused and the door gave no reason."
  );
}
