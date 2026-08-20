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
  fetchAuthenticators,
  setAuthenticatorEnabled,
} from "../authenticator-service";
import type { AuthenticatorEntry } from "../authenticator-types";
import { createVaultItem, fetchVaultItems } from "../vault-service";
import { WEBSITE_LOGIN_DEFINITION_KEY, type VaultItem } from "../types";
import type { EnrollTarget } from "../components/authenticator/AuthenticatorEnrollDialog";

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
      // Eligible = ANY item the user holds that does not already carry an
      // authenticator. A seed is one more sealed field on a credential item —
      // the server never required a website_login, and filtering to that key
      // is what made the surface dead-end with "no eligible logins". Website
      // logins sort first because they are the common case.
      const eligible = items.filter((it) => !enrolledIds.has(it.id));
      const rank = (it: VaultItem) =>
        it.definition_key === WEBSITE_LOGIN_DEFINITION_KEY ? 0 : 1;
      setEnrollable(
        eligible
          .sort(
            (a, b) =>
              rank(a) - rank(b) || a.display_name.localeCompare(b.display_name),
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
    /**
     * Enroll a seed. When the target is a new login, the vault item is created
     * first and the seed lands on it — one user action, one toast, so nobody
     * has to leave and go build a Vault entry before they can save the code
     * that is on screen in front of them right now.
     */
    enroll: (target: EnrollTarget, secret: string) =>
      run(async () => {
        let itemId = target.itemId;
        if (target.kind === "new") {
          const created = await createVaultItem({
            display_name: target.displayName || "New login",
            definition_key: WEBSITE_LOGIN_DEFINITION_KEY,
            login_urls: target.loginUrl ? [target.loginUrl] : undefined,
          });
          itemId = created.id;
        }
        if (!itemId) throw new Error("No login chosen for this authenticator.");
        return enrollAuthenticator(itemId, secret);
      }, "Authenticator on — Matrx can now produce this account's codes."),
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
