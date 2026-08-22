/**
 * Matrx Authenticator — the ONE hook the manage surface consumes.
 *
 * Loads the user's enrolled authenticators (metadata only) and funnels every
 * mutation through `actions` so busy-state, toasts, and refresh behave
 * identically everywhere. Login creation is owned by the canonical Vault form;
 * no seed enters this hook, and current codes are fetched only by the
 * short-lived code component.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";

import {
  deleteAuthenticator,
  fetchAuthenticators,
  setAuthenticatorEnabled,
} from "../authenticator-service";
import type { AuthenticatorEntry } from "../authenticator-types";
import { updateVaultItem } from "../vault-service";

export function useAuthenticator() {
  const [entries, setEntries] = useState<AuthenticatorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchAuthenticators();
      if (!mounted.current) return;
      setEntries(list);
    } catch (err) {
      if (!mounted.current) return;
      setError(
        err instanceof Error ? err.message : "Failed to load authenticators",
      );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // The route's initial external fetch owns the loading state it updates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async <T>(op: () => Promise<T>, success: string): Promise<T | null> => {
      setBusy(true);
      try {
        const result = await op();
        toast.success(success);
        await refresh();
        return result;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Operation failed");
        return null;
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [refresh],
  );

  const actions = {
    rename: (itemId: string, displayName: string) =>
      run(
        () => updateVaultItem(itemId, { display_name: displayName }),
        "Login renamed.",
      ),
    setEnabled: (itemId: string, enabled: boolean) =>
      run(
        () => setAuthenticatorEnabled(itemId, enabled),
        enabled ? "Authenticator turned on." : "Authenticator turned off.",
      ),
    remove: (itemId: string) =>
      run(
        () => deleteAuthenticator(itemId),
        "Authenticator secret deleted. Your phone app and backup codes still work.",
      ),
  };

  return { entries, loading, busy, error, refresh, actions };
}
