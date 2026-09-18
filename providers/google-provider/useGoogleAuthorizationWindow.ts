"use client";

/**
 * 🚨 THE ONE DOOR TO A GOOGLE AUTHORIZATION WINDOW (V-23 NEW-3, lane F-103).
 *
 * Every surface that opens a Google consent window — popup or same-tab redirect
 * — goes through this hook. `useGoogleAPI().requestAuthorizationCode` and
 * `.startAuthorizationCodeRedirect` are the RAW provider primitives and are
 * called from nowhere but here and the consent runner; `check:google-auth-gate`
 * fails the build when a second call site appears.
 *
 * Why a door at all, when the primitives take the gate themselves: a press is
 * usually accepted SECONDS before the window opens (the consent runner waits for
 * the organization first, and other surfaces fetch an account or a scope plan).
 * The gate has to be held for that whole gap, so a caller takes it with
 * `beginAuthorization()` and the primitive JOINS the handle instead of taking a
 * second one. A caller that just wants a window calls the two convenience
 * methods below, which take and release the gate around the call.
 */

import { useCallback } from "react";
import {
  useGoogleAPI,
  type GoogleAuthorizationCodeOptions,
} from "./GoogleApiProvider";
import type { GoogleOAuthRedirectStartOptions } from "./oauthRedirect";
import {
  acquireGoogleAuthorizationGate,
  type GoogleAuthorizationGateHandle,
} from "./googleAuthorizationGate";

export interface GoogleAuthorizationWindow {
  /**
   * Accept a press NOW and hold the one-window gate across whatever the caller
   * must do before the window can open. Throws `GoogleAuthorizationBusyError`
   * when a window is already open — the caller shows that sentence.
   */
  beginAuthorization: (holder?: string) => GoogleAuthorizationGateHandle;
  /** Popup consent: one window, one authorization code. */
  openAuthorizationWindow: (
    scopes: string[],
    loginHint?: string,
    options?: GoogleAuthorizationCodeOptions,
    gate?: GoogleAuthorizationGateHandle | null,
  ) => Promise<string>;
  /** Same-tab redirect consent. The page leaves; the gate leaves with it. */
  openAuthorizationRedirect: (
    scopes: string[],
    options: GoogleOAuthRedirectStartOptions,
    gate?: GoogleAuthorizationGateHandle | null,
  ) => Promise<void>;
  /** Google's own script has to be up before any window can open. */
  ready: boolean;
}

export function useGoogleAuthorizationWindow(): GoogleAuthorizationWindow {
  const google = useGoogleAPI();

  const beginAuthorization = useCallback(
    (holder?: string) => acquireGoogleAuthorizationGate(holder ?? null),
    [],
  );

  const openAuthorizationWindow = useCallback(
    (
      scopes: string[],
      loginHint?: string,
      options?: GoogleAuthorizationCodeOptions,
      gate?: GoogleAuthorizationGateHandle | null,
    ) =>
      // An ABSENT gate is not passed on: the primitive's own arity is what a
      // hundred existing expectations read, and a trailing `undefined` is a
      // difference with no meaning. Without a handle the primitive takes the
      // gate itself.
      gate == null
        ? google.requestAuthorizationCode(scopes, loginHint, options)
        : google.requestAuthorizationCode(scopes, loginHint, options, gate),
    [google],
  );

  const openAuthorizationRedirect = useCallback(
    (
      scopes: string[],
      options: GoogleOAuthRedirectStartOptions,
      gate?: GoogleAuthorizationGateHandle | null,
    ) =>
      gate == null
        ? google.startAuthorizationCodeRedirect(scopes, options)
        : google.startAuthorizationCodeRedirect(scopes, options, gate),
    [google],
  );

  return {
    beginAuthorization,
    openAuthorizationWindow,
    openAuthorizationRedirect,
    ready: google.isGoogleLoaded,
  };
}
