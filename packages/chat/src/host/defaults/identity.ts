/**
 * Default identity port: read from `db.auth` (getSession + onAuthStateChange),
 * admin level from `admin.admins` (RLS: a person reads their own row). Starts
 * on first use, never at import, so SSR and tests that never ask pay nothing.
 */

import type { User } from "@supabase/supabase-js";
import type {
  ChatAdminLevel,
  ChatDb,
  ChatDiagnosticsPort,
  ChatIdentity,
  ChatIdentityPort,
} from "../contract";

export const SIGNED_OUT_IDENTITY: ChatIdentity = Object.freeze({
  userId: null,
  isAuthenticated: false,
  adminLevel: null,
  email: null,
  displayName: null,
  avatarUrl: null,
  accessToken: null,
  authReady: false,
  fingerprintId: null,
  name: null,
  preferredUsername: null,
  picture: null,
});

const ADMIN_LEVELS: readonly ChatAdminLevel[] = [
  "developer",
  "senior_admin",
  "super_admin",
];

function metaString(
  meta: Record<string, unknown> | undefined,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = meta?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function identityFromUser(
  user: User | null | undefined,
  adminLevel: ChatAdminLevel | null,
  accessToken: string | null = null,
): ChatIdentity {
  if (!user) return { ...SIGNED_OUT_IDENTITY, authReady: true };
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  return {
    userId: user.id,
    isAuthenticated: true,
    adminLevel,
    email: user.email ?? null,
    displayName: metaString(meta, "full_name", "name", "preferred_username"),
    avatarUrl: metaString(meta, "avatar_url", "picture"),
    accessToken,
    authReady: true,
    fingerprintId: null,
    name: metaString(meta, "name"),
    preferredUsername: metaString(meta, "preferred_username"),
    picture: metaString(meta, "picture"),
  };
}

export function createDbIdentity(
  db: ChatDb,
  diagnostics: () => ChatDiagnosticsPort,
): ChatIdentityPort {
  let snapshot: ChatIdentity = SIGNED_OUT_IDENTITY;
  let started = false;
  const listeners = new Set<() => void>();

  function publish(next: ChatIdentity): void {
    const prev = snapshot;
    if (
      prev.userId === next.userId &&
      prev.isAuthenticated === next.isAuthenticated &&
      prev.adminLevel === next.adminLevel &&
      prev.email === next.email &&
      prev.displayName === next.displayName &&
      prev.avatarUrl === next.avatarUrl &&
      prev.accessToken === next.accessToken &&
      prev.authReady === next.authReady &&
      prev.name === next.name &&
      prev.preferredUsername === next.preferredUsername &&
      prev.picture === next.picture
    ) {
      return;
    }
    snapshot = next;
    for (const listener of listeners) listener();
  }

  async function readAdminLevel(
    userId: string,
  ): Promise<ChatAdminLevel | null> {
    try {
      const { data, error } = await db
        .schema("admin")
        .from("admins")
        .select("level")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      const level = (data as { level?: unknown } | null)?.level;
      return ADMIN_LEVELS.includes(level as ChatAdminLevel)
        ? (level as ChatAdminLevel)
        : null;
    } catch (error) {
      diagnostics().capture(error, {
        area: "identity",
        code: "admin-level-unreadable",
      });
      return null;
    }
  }

  async function adopt(
    user: User | null | undefined,
    accessToken: string | null = null,
  ): Promise<void> {
    publish(identityFromUser(user, snapshot.userId === user?.id ? snapshot.adminLevel : null, accessToken));
    if (!user) return;
    const level = await readAdminLevel(user.id);
    if (snapshot.userId === user.id) publish(identityFromUser(user, level, accessToken));
  }

  function start(): void {
    if (started) return;
    started = true;
    db.auth
      .getSession()
      .then(({ data }) => adopt(data.session?.user, data.session?.access_token ?? null))
      .catch((error: unknown) =>
        diagnostics().capture(error, {
          area: "identity",
          code: "session-unreadable",
        }),
      );
    db.auth.onAuthStateChange((_event, session) => {
      void adopt(session?.user, session?.access_token ?? null);
    });
  }

  return {
    current() {
      start();
      return snapshot;
    },
    subscribe(listener) {
      start();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async getAccessToken() {
      try {
        const { data } = await db.auth.getSession();
        return data.session?.access_token ?? null;
      } catch (error) {
        diagnostics().capture(error, {
          area: "identity",
          code: "access-token-unreadable",
        });
        return null;
      }
    },
  };
}
