/**
 * The identity seam (PACKAGE-INDEPENDENCE §2.3, slice P7) — who is signed in,
 * read the way every package call site read it from the host app before.
 *
 * Same names and shapes the call sites imported from the app
 * (`selectUserId`, `selectIsAuthenticated`, `selectIsAdmin`, `selectIsSuperAdmin`,
 * `getUserId`, `requireUserId`, `hasBrowserSession`), so moving a call site onto
 * the identity port changed only its import specifier.
 *
 * Synchronous reads come from the package's own `chatHost` slice, which
 * `<ChatProvider>` keeps equal to the host's identity port (and matrx-frontend's
 * root reducer keeps equal to its own auth state in the same reduction). A store
 * with no `chatHost` slice reads as signed out — never another person.
 *
 * Admin power is the host's to scope: `adminLevel` is what the host grants on
 * this page (matrx-frontend: only inside the admin section), so `selectIsAdmin` /
 * `selectIsSuperAdmin` are false wherever the host withholds it.
 */

import type { ChatIdentity } from "./contract";
import { SIGNED_OUT_IDENTITY } from "./defaults/identity";
import { getChatHost } from "./configure";
import { announceOnce } from "./errors";
import { getStoreSingleton } from "../store/store-singleton";

type WithChatHostIdentity = { chatHost?: { identity?: ChatIdentity } } | null | undefined;

function identityOf(state: unknown): ChatIdentity {
  return (state as WithChatHostIdentity)?.chatHost?.identity ?? SIGNED_OUT_IDENTITY;
}

// ── Selectors (any store that mounts `chatHost`) ─────────────────────────────

export const selectChatIdentity = (state: unknown): ChatIdentity => identityOf(state);

export const selectUserId = (state: unknown): string | null => identityOf(state).userId;

export const selectIsAuthenticated = (state: unknown): boolean =>
  identityOf(state).isAuthenticated;

/** Admin power of any tier, as the host grants it on this page. */
export const selectIsAdmin = (state: unknown): boolean => identityOf(state).adminLevel !== null;

/** Admin power at the highest tier, as the host grants it on this page. */
export const selectIsSuperAdmin = (state: unknown): boolean =>
  identityOf(state).adminLevel === "super_admin";

// ── Outside React ────────────────────────────────────────────────────────────

/** The signed-in person's id from the chat store, or null (signed out, or no store yet). */
export function getUserId(): string | null {
  const store = getStoreSingleton();
  return store ? identityOf(store.getState()).userId : null;
}

/**
 * What `requireUserId` throws for a signed-out visitor: a state (render the
 * signed-out view), not a failure. Same name as the app's, so a catcher that
 * matches by name keeps working.
 */
export class NotAuthenticatedError extends Error {
  override readonly name = "NotAuthenticatedError";
  constructor() {
    super("Not authenticated");
  }
}

export function isNotAuthenticatedError(error: unknown): error is NotAuthenticatedError {
  return (
    error instanceof NotAuthenticatedError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "NotAuthenticatedError")
  );
}

/** The signed-in person's id; throws `NotAuthenticatedError` when nobody is. */
export function requireUserId(): string {
  const id = getUserId();
  if (!id) throw new NotAuthenticatedError();
  return id;
}

/**
 * Does this client carry a signed-in session? A local read of the host's
 * `db.auth` (no network). For skipping reads only a signed-in person can make;
 * "no session" means an empty result, never a way around a reader a guest needs.
 */
export async function hasBrowserSession(): Promise<boolean> {
  let db;
  try {
    db = getChatHost().db;
  } catch (error) {
    announceOnce(
      "identity:no-host-session",
      `No chat host is configured, so there is no session to read (${String(
        (error as Error)?.message ?? error,
      )}).`,
    );
    return false;
  }
  try {
    const {
      data: { session },
    } = await db.auth.getSession();
    return Boolean(session);
  } catch {
    return false;
  }
}
