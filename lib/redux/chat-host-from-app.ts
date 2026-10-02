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

import type { ChatIdentity, ChatOrganization, ChatPreferences } from "@ai-matrx/chat/host";
import type { ChatHostState } from "@ai-matrx/chat/store/chat-host.slice";
import {
  selectAdminLevel,
  selectIsAuthenticated,
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
import { selectIsDebugMode } from "@/lib/redux/preferences/adminDebugSlice";
import type { RootState } from "@/lib/redux/rootReducer";

export function readAppChatIdentity(state: RootState): ChatIdentity {
  return {
    userId: selectUserId(state),
    isAuthenticated: selectIsAuthenticated(state),
    adminLevel: selectAdminLevel(state),
    email: selectUserEmail(state),
    displayName: selectUserFullName(state) || null,
    avatarUrl: selectUserAvatarUrl(state) || null,
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
  const user = state.userPreferences;
  return {
    loaded: Boolean(user._meta?.loadedPreferences),
    superAdminDebugger: selectIsSuperAdminDebugger(state),
    debugMode: selectIsDebugMode(state),
    showCreatorPanel: state.creatorDebug.showCreatorPanel,
    creatorSettings: state.creatorDebug.settings,
    desktopTargetInstanceId: state.adminPreferences.desktopTargetInstanceId,
    directiveApplyPolicy: user.assistant.directiveApplyPolicy,
    restoreUnsentDrafts: user.prompts?.restoreUnsentDrafts !== false,
    sandboxBySurface: user.coding.activeAgentSandboxBySurface,
    sandboxCanvasAutoOpen: user.coding.sandboxCanvasAutoOpen !== false,
    conversationLanes: user.conversationFilters?.lanes,
    conversationSurfaces: user.conversationFilters?.surfaces,
    activeScratchpadId: user.scratchpad.activeId,
  };
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
    a.avatarUrl === b.avatarUrl
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
 * `chatHost.preferences` equal this app's state. Returns the same state object when nothing they read changed. The wrapper
 * keeps the reducer's own type (so `RootState` never depends on this module).
 */
export function withAppChatHost<R extends (state: never, action: never) => unknown>(reducer: R): R {
  let lastSources: AppChatSources | null = null;
  const wrapped = (state: WithChatHost | undefined, action: unknown): WithChatHost => {
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
