"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setLoopbackApiTargetsAdminUnlock } from "@/lib/api/service-routing";
import { setLoopbackAccess } from "@/lib/redux/slices/apiConfigSlice";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";

/**
 * Bridges admin sign-in into loopback (localhost) API target access.
 *
 * A deployed bundle must never route an ordinary visitor's API traffic to
 * their own machine — and the selection persists browser-wide, not per
 * account, so it would otherwise survive logout into a non-admin session.
 * But an admin pointing the deployed frontend at their local Python server is
 * a first-class workflow, so admin presence — not `NODE_ENV` — is the gate.
 *
 * This is the ONLY writer of the module-level unlock in
 * `lib/api/service-routing.ts`. It sets that imperative mirror first (non-React
 * callers such as `configuredServiceUrl` and the slice reducers read it
 * synchronously), then dispatches `setLoopbackAccess` so Redux state — and
 * therefore the UI — agrees.
 *
 * Renders nothing. Mount inside StoreProvider — see app/Providers.tsx.
 */
export function LoopbackApiAccessSync() {
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsAdmin);

  useEffect(() => {
    setLoopbackApiTargetsAdminUnlock(isAdmin);
    dispatch(setLoopbackAccess());
  }, [isAdmin, dispatch]);

  return null;
}
