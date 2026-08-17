"use client";

// features/crm/sending-identities/hooks.ts
//
// Fetch + mutate hooks for the sending-identity surface. Every mutation
// re-reads the record it changed, because the server's answer is the truth:
// pressing "Check the domain now" can move the identity from `draft` to
// `verifying` — or, when a record was removed, PAUSE it — and optimistically
// guessing which would put a wrong, safety-critical status on screen.

import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "@/utils/errors";
import * as Api from "./service";
import type {
  ConnectableMailbox,
  SendingEventRecord,
  SendingIdentityDetail,
  SendingIdentityView,
  SendingPolicyView,
} from "./types";

export function useSendingIdentities() {
  const [identities, setIdentities] = useState<SendingIdentityView[] | null>(null);
  const [policy, setPolicy] = useState<SendingPolicyView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([Api.listSendingIdentities(), Api.getSendingPolicy()])
      .then(([rows, orgPolicy]) => {
        if (cancelled) return;
        setIdentities(rows);
        setPolicy(orgPolicy);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(extractErrorMessage(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return { identities, policy, loading, error, reload };
}

export function useConnectableMailboxes(enabled: boolean) {
  const [mailboxes, setMailboxes] = useState<ConnectableMailbox[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken((token) => token + 1);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Api.listConnectableMailboxes()
      .then((rows) => {
        if (cancelled) return;
        setMailboxes(rows);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(extractErrorMessage(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, reloadToken]);

  return { mailboxes, loading, error, reload };
}

export function useSendingIdentity(identityId: string) {
  const [identity, setIdentity] = useState<SendingIdentityDetail | null>(null);
  const [events, setEvents] = useState<SendingEventRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Which one-click fix is currently running, so its button can show it. */
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([Api.getSendingIdentity(identityId), Api.listSendingEvents(identityId, 100)])
      .then(([detail, rows]) => {
        if (cancelled) return;
        setIdentity(detail);
        setEvents(rows);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(extractErrorMessage(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [identityId, reloadToken]);

  /**
   * Run one fix and take the SERVER's resulting record. A failure is reported
   * on the surface and never leaves a stale-but-hopeful status behind.
   */
  const run = useCallback(
    async (
      key: string,
      action: () => Promise<SendingIdentityDetail | { identity: SendingIdentityDetail }>,
      successMessage?: string,
    ) => {
      setBusy(key);
      setNotice(null);
      setError(null);
      try {
        const result = await action();
        const next = "identity" in result ? result.identity : result;
        setIdentity(next);
        if (successMessage) setNotice(successMessage);
        setEvents(await Api.listSendingEvents(identityId, 100));
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setBusy(null);
      }
    },
    [identityId],
  );

  return {
    identity,
    events,
    loading,
    error,
    busy,
    notice,
    clearNotice: useCallback(() => setNotice(null), []),
    reload: useCallback(() => setReloadToken((n) => n + 1), []),
    checkDomain: useCallback(
      () => run("check_domain", () => Api.checkDomain(identityId)),
      [identityId, run],
    ),
    checkAuthentication: useCallback(
      () => run("check_authentication", () => Api.checkAuthentication(identityId)),
      [identityId, run],
    ),
    startWarmup: useCallback(
      () =>
        run("start_warmup", () => Api.startWarmup(identityId), "Warm-up started."),
      [identityId, run],
    ),
    pause: useCallback(
      (reason: string) => run("pause", () => Api.pauseSendingIdentity(identityId, reason)),
      [identityId, run],
    ),
    resume: useCallback(
      () =>
        run(
          "review_and_resume",
          () => Api.resumeSendingIdentity(identityId),
          "Resumed. Keep an eye on the health for the next few days.",
        ),
      [identityId, run],
    ),
    refreshHealth: useCallback(
      () => run("refresh_health", () => Api.refreshIdentityHealth(identityId)),
      [identityId, run],
    ),
    savePacing: useCallback(
      (patch: Record<string, unknown>) =>
        run("save_pacing", () => Api.updateSendingIdentity(identityId, patch), "Saved."),
      [identityId, run],
    ),
  };
}
