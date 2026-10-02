// lib/redux/chat-host-from-app.ts
//
// This app's identity and active organization, as @ai-matrx/chat's `chatHost` slice holds them
// (PACKAGE-INDEPENDENCE.md P7). ONE reading, used twice:
//   - the chat host adapter's identity / org ports (`providers/ChatHostAdapter.tsx`);
//   - `withAppChatHost`, which keeps `chatHost.identity` / `chatHost.org` equal to this app's
//     auth and app-context state IN THE SAME REDUCTION — so the package's selectors never lag the
//     app by a dispatch, in every store this app builds (the provider-less ones included).
//
// The active organization is where writes go, never a list filter. Admin level is lane-aware:
// null outside the admin section (`selectAdminLevel`), so admin power reaches the package only
// where this app grants it.

import type { ChatIdentity, ChatOrganization } from "@ai-matrx/chat/host";
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
}
type WithChatHost = AppChatSources & { chatHost: ChatHostState };

/**
 * Wrap the app's root reducer: after every action, `chatHost.identity` / `chatHost.org` equal
 * this app's state. Returns the same state object when nothing they read changed. The wrapper
 * keeps the reducer's own type (so `RootState` never depends on this module).
 */
export function withAppChatHost<R extends (state: never, action: never) => unknown>(reducer: R): R {
  let lastSources: AppChatSources | null = null;
  const wrapped = (state: WithChatHost | undefined, action: unknown): WithChatHost => {
    const next = (reducer as unknown as (s: unknown, a: unknown) => WithChatHost)(state, action);
    if (
      lastSources &&
      lastSources.userAuth === next.userAuth &&
      lastSources.userProfile === next.userProfile &&
      lastSources.appContext === next.appContext &&
      state?.chatHost === next.chatHost
    ) {
      return next;
    }
    lastSources = {
      userAuth: next.userAuth,
      userProfile: next.userProfile,
      appContext: next.appContext,
    };
    const appState = next as unknown as RootState;
    const identity = readAppChatIdentity(appState);
    const org = readAppChatOrg(appState);
    const current = next.chatHost;
    const identitySame = sameChatIdentity(current.identity, identity);
    const orgSame = sameChatOrg(current.org, org);
    if (identitySame && orgSame) return next;
    return {
      ...next,
      chatHost: {
        ...current,
        identity: identitySame ? current.identity : identity,
        org: orgSame ? current.org : org,
      },
    };
  };
  return wrapped as unknown as R;
}
