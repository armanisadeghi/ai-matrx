// lib/redux/chat-host-from-app.ts
//
// This app's identity, active organization and preferences, as @ai-matrx/chat's `chatHost` slice
// holds them (PACKAGE-INDEPENDENCE.md P7, P8). ONE reading, used twice:
//   - the chat host adapter's identity / org / prefs ports (`providers/ChatHostAdapter.tsx`);
//   - `withAppChatHost`, which keeps `chatHost.identity` / `chatHost.org` / `chatHost.preferences`
//     equal to this app's auth, app-context and preference slices IN THE SAME REDUCTION — so the
//     package's selectors never lag the app by a dispatch, in every store this app builds (the
//     provider-less ones included).
//
// The active organization is where writes go, never a list filter. Admin level is lane-aware:
// null outside the admin section (`selectAdminLevel`), so admin power reaches the package only
// where this app grants it.

import type {
  ChatIdentity,
  ChatOrganization,
  ChatPreferences,
  ChatPreferenceWrite,
} from "@ai-matrx/chat/host";
import {
  chatPreferenceWritten,
  type ChatHostState,
} from "@ai-matrx/chat/store/chat-host.slice";
import { DEFAULT_CHAT_PREFERENCES } from "@ai-matrx/chat/host/defaults/prefs";
import {
  selectAccessToken,
  selectAdminLevel,
  selectAuthReady,
  selectFingerprintId,
  selectIsAuthenticated,
  selectUserName,
  selectUserPicture,
  selectUserPreferredUsername,
  selectUserAvatarUrl,
  selectUserEmail,
  selectUserFullName,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import {
  selectOrganizationId,
  selectOrganizationName,
} from "@/lib/redux/slices/appContextSlice";
import { selectIsSuperAdminDebugger } from "@/lib/redux/selectors/userSelectors";
import {
  clearDebugNamespace,
  selectIsDebugMode,
  toggleDebugMode,
  updateDebugData,
} from "@/lib/redux/preferences/adminDebugSlice";
import {
  setIsCreator,
  setShowCreatorPanel,
} from "@/lib/redux/preferences/creatorDebugSlice";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import type { RootState } from "@/lib/redux/rootReducer";

export function readAppChatIdentity(state: RootState): ChatIdentity {
  return {
    userId: selectUserId(state),
    isAuthenticated: selectIsAuthenticated(state),
    adminLevel: selectAdminLevel(state),
    email: selectUserEmail(state),
    displayName: selectUserFullName(state) || null,
    avatarUrl: selectUserAvatarUrl(state) || null,
    accessToken: selectAccessToken(state),
    authReady: selectAuthReady(state),
    fingerprintId: selectFingerprintId(state),
    name: selectUserName(state) || null,
    preferredUsername: selectUserPreferredUsername(state) || null,
    picture: selectUserPicture(state) || null,
  };
}

export function readAppChatOrg(state: RootState): ChatOrganization | null {
  const id = selectOrganizationId(state);
  return id ? { id, name: selectOrganizationName(state) } : null;
}

/**
 * This app's preferences and debug flags, as the package reads them. Value objects
 * (`creatorSettings`, `sandboxBySurface`, the history filters) are the app's own references, so
 * an unchanged slice reads as unchanged.
 */
export function readAppChatPreferences(state: RootState): ChatPreferences {
  // Optional reads throughout: a store built from part of this app's reducers (a test harness, a
  // preloaded partial slice) reads the platform default for what it lacks, never throws.
  const d = DEFAULT_CHAT_PREFERENCES;
  const user = state.userPreferences as Partial<RootState["userPreferences"]> | undefined;
  const creator = state.creatorDebug as Partial<RootState["creatorDebug"]> | undefined;
  const admin = state.adminPreferences as Partial<RootState["adminPreferences"]> | undefined;
  return {
    loaded: Boolean(user?._meta?.loadedPreferences),
    superAdminDebugger: state.userAuth?.adminLevel === "super_admin",
    debugMode: selectIsDebugMode(state),
    showCreatorPanel: user?.assistant?.showCreatorPanel ?? d.showCreatorPanel,
    creatorSettings: creator?.settings ?? d.creatorSettings,
    desktopTargetInstanceId: admin?.desktopTargetInstanceId ?? d.desktopTargetInstanceId,
    directiveApplyPolicy: user?.assistant?.directiveApplyPolicy ?? d.directiveApplyPolicy,
    restoreUnsentDrafts: user?.prompts?.restoreUnsentDrafts !== false,
    sandboxBySurface: user?.coding?.activeAgentSandboxBySurface ?? d.sandboxBySurface,
    sandboxCanvasAutoOpen: user?.coding?.sandboxCanvasAutoOpen !== false,
    conversationLanes: user?.conversationFilters?.lanes,
    conversationSurfaces: user?.conversationFilters?.surfaces,
    activeScratchpadId: user?.scratchpad?.activeId ?? d.activeScratchpadId,
  };
}

/** The package's preference write, as this app's own action (P8). */
export function appActionForPreferenceWrite(
  change: ChatPreferenceWrite,
  state?: Partial<RootState>,
): { type: string } {
  switch (change.kind) {
    case "preference":
      return setPreference({
        module: change.module as Parameters<typeof setPreference>[0]["module"],
        preference: change.preference,
        value: change.value,
      });
    case "creator-ownership":
      return setIsCreator(change.isCreator);
    case "creator-panel-toggled":
      // A saved preference: the flip is computed from the current value.
      return setShowCreatorPanel(!(state?.userPreferences?.assistant?.showCreatorPanel === true));
    case "debug-mode-toggled":
      return toggleDebugMode();
    case "debug-data":
      return updateDebugData({ ...change.data });
    case "debug-namespace-cleared":
      return clearDebugNamespace(change.namespace);
  }
}

/** Field by field, by reference. */
export function sameChatPreferences(a: ChatPreferences, b: ChatPreferences): boolean {
  if (a === b) return true;
  const keys = Object.keys(a) as (keyof ChatPreferences)[];
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

export function sameChatIdentity(a: ChatIdentity, b: ChatIdentity): boolean {
  return (
    a.userId === b.userId &&
    a.isAuthenticated === b.isAuthenticated &&
    a.adminLevel === b.adminLevel &&
    a.email === b.email &&
    a.displayName === b.displayName &&
    a.avatarUrl === b.avatarUrl &&
    a.accessToken === b.accessToken &&
    a.authReady === b.authReady &&
    a.fingerprintId === b.fingerprintId &&
    a.name === b.name &&
    a.preferredUsername === b.preferredUsername &&
    a.picture === b.picture
  );
}

export function sameChatOrg(a: ChatOrganization | null, b: ChatOrganization | null): boolean {
  return (a?.id ?? null) === (b?.id ?? null) && (a?.name ?? null) === (b?.name ?? null);
}

interface AppChatSources {
  userAuth: unknown;
  userProfile: unknown;
  appContext: unknown;
  userPreferences: unknown;
  adminPreferences: unknown;
  creatorDebug: unknown;
  adminDebug: unknown;
}

const SOURCE_KEYS: readonly (keyof AppChatSources)[] = [
  "userAuth",
  "userProfile",
  "appContext",
  "userPreferences",
  "adminPreferences",
  "creatorDebug",
  "adminDebug",
];
type WithChatHost = AppChatSources & { chatHost: ChatHostState };

/**
 * Wrap the app's root reducer: after every action, `chatHost.identity` / `chatHost.org` /
 * `chatHost.preferences` equal this app's state. A package preference write (`chatPreferenceWritten`)
 * is turned into this app's own action BEFORE the reducers run, so it lands in this app's slice. Returns the same state object when nothing they read changed. The wrapper
 * keeps the reducer's own type (so `RootState` never depends on this module).
 */
export function withAppChatHost<R extends (state: never, action: never) => unknown>(reducer: R): R {
  let lastSources: AppChatSources | null = null;
  const wrapped = (state: WithChatHost | undefined, incoming: unknown): WithChatHost => {
    const action = chatPreferenceWritten.match(incoming as { type: string })
      ? appActionForPreferenceWrite(
          (incoming as ReturnType<typeof chatPreferenceWritten>).payload,
          state as unknown as Partial<RootState> | undefined,
        )
      : incoming;
    const next = (reducer as unknown as (s: unknown, a: unknown) => WithChatHost)(state, action);
    if (
      lastSources &&
      SOURCE_KEYS.every((key) => lastSources![key] === next[key]) &&
      state?.chatHost === next.chatHost
    ) {
      return next;
    }
    lastSources = Object.fromEntries(
      SOURCE_KEYS.map((key) => [key, next[key]]),
    ) as unknown as AppChatSources;
    const appState = next as unknown as RootState;
    const identity = readAppChatIdentity(appState);
    const org = readAppChatOrg(appState);
    const preferences = readAppChatPreferences(appState);
    const current = next.chatHost;
    const identitySame = sameChatIdentity(current.identity, identity);
    const orgSame = sameChatOrg(current.org, org);
    const preferencesSame = sameChatPreferences(current.preferences, preferences);
    if (identitySame && orgSame && preferencesSame) return next;
    return {
      ...next,
      chatHost: {
        ...current,
        identity: identitySame ? current.identity : identity,
        org: orgSame ? current.org : org,
        preferences: preferencesSame ? current.preferences : preferences,
      },
    };
  };
  return wrapped as unknown as R;
}
