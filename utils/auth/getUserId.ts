/**
 * Auth helpers for service files — reads from Redux store synchronously.
 *
 * No network requests. Requires the store to be initialized (i.e., the app
 * must have mounted and the server-seeded identity landed in `state.userAuth`).
 *
 * Reads from `state.userAuth` — the post-split canonical home for the
 * caller's identity (id, email, isAdmin, accessToken, ...). The sibling
 * `state.userProfile` slice holds derived/profile data only
 * (userMetadata, fingerprintId) and is NOT where the
 * user id lives. The legacy `state.user` slice was deleted in the same
 * split — never read it.
 *
 * For client components and hooks, prefer reading directly from the store via
 * `useAppSelector(selectUserId)` (or `selectUser` for the legacy shape).
 */
// Imports from the leaf singleton module — NOT `@/lib/redux/store` — to
// avoid a circular import. tasksSlice (and many other slices) import this
// file at module level, so loading store.ts here would create a cycle:
//   tasksSlice.ts → getUserId.ts → store.ts → entity-rootReducer.ts →
//   rootReducer.ts → tasksSlice.ts (TDZ on tasksReducer).
//
// Do NOT import RootState from `@/lib/redux/store` here — same cycle, and
// the only typed read we need is the narrow `userAuth` shape declared
// inline below.
import { getStoreSingleton as getStore } from "@/lib/redux/store-singleton";

interface StoreUser {
  id: string | null;
  email: string | null;
}

function getStoreUser(): StoreUser {
  const store = getStore();
  if (!store) return { id: null, email: null };
  const { id, email } = (store.getState() as { userAuth: StoreUser }).userAuth;
  return { id, email };
}

export function getUserId(): string | null {
  return getStoreUser().id;
}

/**
 * What `requireUserId` / `requireUser` throw for a signed-out visitor. A typed
 * class so a caller can tell "nobody is signed in" (a state — render the
 * signed-out view) from a real failure, without matching on a message.
 */
export class NotAuthenticatedError extends Error {
  override readonly name = "NotAuthenticatedError";
  constructor() {
    super("Not authenticated");
  }
}

export function isNotAuthenticatedError(error: unknown): error is NotAuthenticatedError {
  return error instanceof NotAuthenticatedError;
}

/** Throws `NotAuthenticatedError` if no user ID is available in the store. */
export function requireUserId(): string {
  const id = getUserId();
  if (!id) throw new NotAuthenticatedError();
  return id;
}

/** Returns the current user's email from the store, or null. */
export function getUserEmail(): string | null {
  return getStoreUser().email;
}

/** Returns both id and email, throws if not authenticated. */
export function requireUser(): { id: string; email: string | null } {
  const { id, email } = getStoreUser();
  if (!id) throw new NotAuthenticatedError();
  return { id, email };
}
