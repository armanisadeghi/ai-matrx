/**
 * Matrx Authenticator — the ONE hook the manage surface consumes.
 *
 * Loads the user's enrolled authenticators (metadata only), the login items
 * eligible to enroll onto, and funnels every mutation through `actions` so
 * busy-state, toasts, and refresh behave identically everywhere. No seed and no
 * code ever enter this hook — the service cannot return them.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";

import {
  deleteAuthenticator,
  enrollAuthenticator,
  enrollAuthenticatorFromQr,
  fetchAuthenticators,
  setAuthenticatorEnabled,
} from "../authenticator-service";
import type { AuthenticatorEntry } from "../authenticator-types";
import { fetchVaultItems } from "../vault-service";
import type { VaultItem } from "../types";

export interface EnrollableItem {
  id: string;
  displayName: string;
  loginUrls: string[];
}

export function useAuthenticator() {
  const [entries, setEntries] = useState<AuthenticatorEntry[]>([]);
  const [enrollable, setEnrollable] = useState<EnrollableItem[]>([]);
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
      const [list, items] = await Promise.all([
        fetchAuthenticators(),
        fetchVaultItems({ kind: "mine" }).catch(() => [] as VaultItem[]),
      ]);
      if (!mounted.current) return;
      setEntries(list);
      const enrolledIds = new Set(list.map((e) => e.credential_item_id));
      // Eligible = website-login items that do not already hold an authenticator.
      setEnrollable(
        items
          .filter(
            (it) =>
              it.definition_key === "website_login" &&
              !enrolledIds.has(it.id),
          )
          .map((it) => ({
            id: it.id,
            displayName: it.display_name,
            loginUrls: it.login_urls,
          })),
      );
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Failed to load authenticators");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async <T,>(op: () => Promise<T>, success: string): Promise<T | null> => {
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
    enroll: (itemId: string, input: string) =>
      run(
        () => enrollAuthenticator(itemId, input),
        "Authenticator enrolled — Matrx can now produce this account's codes.",
      ),
    enrollFromQr: (itemId: string, image: File) =>
      run(
        () => enrollAuthenticatorFromQr(itemId, image),
        "Authenticator enrolled from QR code.",
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

  return { entries, enrollable, loading, busy, error, refresh, actions };
}
