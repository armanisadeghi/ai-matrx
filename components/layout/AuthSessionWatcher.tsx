"use client";

/**
 * Auth Session Watcher — thin client shell.
 *
 * Subscribes to `supabase.auth.onAuthStateChange` immediately on mount
 * (the listener has to be active before the user can sign out). Only
 * the lightweight Supabase client + listener setup live in this file.
 *
 * The full-screen "Session Expired" overlay (lucide icons, Button, the
 * dialog markup) lives in `AuthSessionWatcherImpl.tsx` and is
 * `next/dynamic`-loaded ONLY on `SIGNED_OUT` — i.e. nearly never — so
 * the modal's dep graph never enters the static graph of any route.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/utils/supabase/client";
import { useAppDispatch } from "@/lib/redux/hooks";
// Surface A lifecycle write: reset the global active context on sign-out so the
// previous user's org/scope/context never bleeds into the next same-tab session.
// eslint-disable-next-line no-restricted-syntax -- Surface A: logout active-context reset
import { clearContext } from "@/lib/redux/slices/appContextSlice";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { contextValuesActions } from "@/features/scopes/redux/contextValuesSlice";

const AuthSessionWatcherImpl = dynamic(
  () => import("./AuthSessionWatcherImpl"),
  { ssr: false, loading: () => null },
);

export default function AuthSessionWatcher() {
  const [sessionExpired, setSessionExpired] = useState(false);
  const dispatch = useAppDispatch();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setSessionExpired(true);
        // The store is a module-level singleton that survives a same-tab
        // sign-out → re-login. Reset the org/scope/context state so the
        // previous user's active context and cached scope tree never bleed
        // into the next session. (Legacy agent-context slices have no reset
        // actions — they are torn down in Phase 5.)
        dispatch(clearContext());
        dispatch(scopesActions.scopesReset());
        dispatch(contextValuesActions.contextValuesReset());
      }
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        setSessionExpired(false);
      }
    });
    return () => subscription.unsubscribe();
  }, [dispatch]);

  if (!sessionExpired) return null;
  return <AuthSessionWatcherImpl />;
}
