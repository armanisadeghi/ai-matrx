// packages/chat/src/store/chat-host.slice.ts
//
// `chatHost` — the host state the package reads, as one package-owned slice (PACKAGE-INDEPENDENCE.md
// §2.2, P3). `<ChatProvider>` writes it from the host ports (identity, active org, server, prefs) —
// XY Flow's StoreUpdater — before its children's first render and on every port change after.
// Selectors read `state.chatHost.*` the same way in an injected and a private store. P7/P8/P9 move
// the package's identity/org/prefs/server readers onto it.

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  ChatIdentity,
  ChatOrganization,
  ChatPreferences,
  ChatPreferenceWrite,
  ResolvedChatHost,
} from "../host/contract";
import { SIGNED_OUT_IDENTITY } from "../host/defaults/identity";
import { applyPreferenceWrite, DEFAULT_CHAT_PREFERENCES } from "../host/defaults/prefs";
import { DEFAULT_CHAT_SERVER_URL } from "../host/defaults/server";

export interface ChatHostState {
  /** False until a `<ChatProvider>` wrote the ports' values (an unsynced read is the empty default). */
  synced: boolean;
  identity: ChatIdentity;
  /** The active organization: where writes go and which org a server call runs in. Never a list filter. */
  org: ChatOrganization | null;
  server: { baseUrl: string };
  /** The prefs port's values (every key `prefs.snapshot()` lists, plus each key it reports changed). */
  prefs: Readonly<Record<string, string | null>>;
  /** The typed preferences and debug flags (P8) — the prefs port's `preferences()`. */
  preferences: ChatPreferences;
}

export type ChatHostSnapshot = Omit<ChatHostState, "synced">;

export const initialChatHostState: ChatHostState = {
  synced: false,
  identity: SIGNED_OUT_IDENTITY,
  org: null,
  server: { baseUrl: DEFAULT_CHAT_SERVER_URL },
  prefs: {},
  preferences: DEFAULT_CHAT_PREFERENCES,
};

const chatHostSlice = createSlice({
  name: "chatHost",
  initialState: initialChatHostState,
  reducers: {
    chatHostSynced(_state, action: PayloadAction<ChatHostSnapshot>) {
      return { synced: true, ...action.payload };
    },
    /**
     * A preference write (P8). Applied here for a host that does not keep
     * preferences; a host that does (matrx-frontend) turns this action into its
     * own before its reducers run, so this case never sees it there.
     */
    chatPreferenceWritten(state, action: PayloadAction<ChatPreferenceWrite>) {
      const next = applyPreferenceWrite(state.preferences as ChatPreferences, action.payload);
      if (next !== state.preferences) state.preferences = next;
    },
  },
});

export const { chatHostSynced, chatPreferenceWritten } = chatHostSlice.actions;
export const chatHostReducer = chatHostSlice.reducer;

// ── Reading the ports ────────────────────────────────────────────────────────

/**
 * The ports' current values. `prefs` is passed in: the full `prefs.snapshot()` is read once (the
 * first sync) and each changed key is merged after — never re-read on every store action.
 */
export function readChatHostSnapshot(
  host: ResolvedChatHost,
  prefs: Readonly<Record<string, string | null>>,
  /** What the store holds now — kept when the host does not keep preferences itself. */
  currentPreferences: ChatPreferences = DEFAULT_CHAT_PREFERENCES,
): ChatHostSnapshot {
  return {
    identity: host.identity.current(),
    org: host.org.active(),
    server: { baseUrl: host.server.baseUrl() },
    prefs,
    preferences: host.prefs.preferences?.() ?? currentPreferences,
  };
}

/** Every value the prefs port lists (empty when it cannot list). */
export function readChatHostPrefs(host: ResolvedChatHost): Readonly<Record<string, string | null>> {
  return { ...(host.prefs.snapshot?.() ?? {}) };
}

function sameIdentity(a: ChatIdentity, b: ChatIdentity): boolean {
  return (
    a.userId === b.userId &&
    a.isAuthenticated === b.isAuthenticated &&
    a.adminLevel === b.adminLevel &&
    a.email === b.email &&
    a.displayName === b.displayName &&
    a.avatarUrl === b.avatarUrl
  );
}

function sameRecord(
  a: Readonly<Record<string, string | null>>,
  b: Readonly<Record<string, string | null>>,
): boolean {
  if (a === b) return true;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => key in b && a[key] === b[key]);
}

/** Field by field, by reference: a host returns the same value object until it changes. */
export function samePreferences(a: ChatPreferences, b: ChatPreferences): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a) as (keyof ChatPreferences)[];
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

/** True when `state` already holds `snapshot` (a sync would change nothing). */
export function chatHostMatches(state: ChatHostState | undefined, snapshot: ChatHostSnapshot): boolean {
  if (!state || !state.synced) return false;
  return (
    sameIdentity(state.identity, snapshot.identity) &&
    (state.org?.id ?? null) === (snapshot.org?.id ?? null) &&
    (state.org?.name ?? null) === (snapshot.org?.name ?? null) &&
    state.server.baseUrl === snapshot.server.baseUrl &&
    sameRecord(state.prefs, snapshot.prefs) &&
    samePreferences(state.preferences, snapshot.preferences)
  );
}

// ── Selectors ────────────────────────────────────────────────────────────────

type WithChatHost = { chatHost: ChatHostState };

export const selectChatHost = (state: WithChatHost): ChatHostState => state.chatHost;
export const selectChatHostIdentity = (state: WithChatHost): ChatIdentity => state.chatHost.identity;
export const selectChatHostUserId = (state: WithChatHost): string | null => state.chatHost.identity.userId;
export const selectChatHostOrg = (state: WithChatHost): ChatOrganization | null => state.chatHost.org;
export const selectChatHostOrgId = (state: WithChatHost): string | null => state.chatHost.org?.id ?? null;
export const selectChatHostServerUrl = (state: WithChatHost): string => state.chatHost.server.baseUrl;
export const selectChatHostPref = (state: WithChatHost, key: string): string | null =>
  state.chatHost.prefs[key] ?? null;
export const selectChatHostPreferences = (state: WithChatHost): ChatPreferences =>
  state.chatHost.preferences;
