"use client";

// useKitInstall — the install state of ONE kit in the organization the person SET.
//
// It reads the organization through `useOrganizationRequired` (never a default,
// never the personal org), asks the record store's switch before anything else,
// and reads this kit's install record from the organization's "Kit installs" table.
// `runInstall()` captures the organization AT THE CLICK and hands that one id to
// every writer; a second tab (or person) racing it is refused by the store and this
// hook attaches to their install instead, re-reading it until it settles.

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";
import {
  InstallBusyError,
  installRunningElsewhere,
  kitRecordsClient,
  readInstall,
  removalFacts,
  removeInstall,
  runInstall,
  stepsFromInstall,
  type RemovalFacts,
} from "../installer";
import { KIT_WORD } from "../constants";
import type { InstallStepView, KitInstallRecord, KitManifest } from "../types";

export type KitInstallPhase = "loading" | "ready" | "installing" | "removing";

/** How often an attached tab re-reads somebody else's running install. */
const ATTACHED_POLL_MS = 4000;

function newRunId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useKitInstall(manifest: KitManifest) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const org = useOrganizationRequired();
  const organizationId = org.organizationState === "ready" ? org.organizationId : null;
  const store = useUnifiedDataCampaign({
    organizationId,
    organizationState: org.organizationState,
    storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.check(organization),
  });

  const [runId] = useState(newRunId);
  const [install, setInstall] = useState<KitInstallRecord | null>(null);
  const [steps, setSteps] = useState<InstallStepView[]>(() => stepsFromInstall(manifest, null));
  const [phase, setPhase] = useState<KitInstallPhase>("loading");
  const [readError, setReadError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  /** The failure of the last thing THIS tab did — a re-read never clears it. */
  const [actionError, setActionError] = useState<string | null>(null);
  /** Somebody else is installing this right now; this tab is watching their record. */
  const [attached, setAttached] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!organizationId || store.state !== "on") return;
    let cancelled = false;
    setPhase((p) => (p === "installing" || p === "removing" ? p : "loading"));
    setReadError(null);
    const client = kitRecordsClient(organizationId, userId);
    Promise.all([
      readInstall(client, organizationId, manifest.key),
      installRunningElsewhere(client, organizationId, manifest.key, runId),
    ])
      .then(([found, busyElsewhere]) => {
        if (cancelled) return;
        setInstall(found);
        setSteps(stepsFromInstall(manifest, found));
        setRunError(found?.status === "failed" && !busyElsewhere ? (found.error ?? null) : null);
        setAttached(
          busyElsewhere
            ? `This ${KIT_WORD.oneLower} is being installed right now in another tab or by someone else in this organization. This page follows along.`
            : null,
        );
        setPhase((p) => (p === "installing" || p === "removing" ? p : "ready"));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setReadError(err instanceof Error ? err.message : String(err));
        setPhase((p) => (p === "installing" || p === "removing" ? p : "ready"));
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, store.state, userId, manifest, runId, attempt]);

  // While attached to somebody else's run, re-read until it settles.
  useEffect(() => {
    if (!attached) return;
    const timer = setInterval(() => setAttempt((n) => n + 1), ATTACHED_POLL_MS);
    return () => clearInterval(timer);
  }, [attached]);

  async function install_(): Promise<KitInstallRecord | null> {
    // THE ORGANIZATION IS CAPTURED HERE, ONCE. Every writer below receives this id.
    const capturedOrg = organizationId;
    if (!capturedOrg || phase === "installing" || phase === "removing") return null;
    setPhase("installing");
    setRunError(null);
    setActionError(null);
    setAttached(null);
    const client = kitRecordsClient(capturedOrg, userId);
    try {
      const done = await runInstall({
        client,
        dispatch,
        organizationId: capturedOrg,
        manifest,
        runId,
        onProgress: (next, rec) => {
          setSteps(next);
          if (rec) setInstall(rec);
        },
      });
      setInstall(done);
      return done;
    } catch (err) {
      if (err instanceof InstallBusyError) {
        setAttached(err.message);
      } else {
        setActionError(err instanceof Error ? err.message : String(err));
      }
      try {
        const found = await readInstall(client, capturedOrg, manifest.key);
        setInstall(found);
        setSteps(stepsFromInstall(manifest, found));
      } catch {
        // The failure itself is already on screen.
      }
      return null;
    } finally {
      setPhase("ready");
    }
  }

  async function facts(): Promise<RemovalFacts | null> {
    if (!organizationId || !install) return null;
    return removalFacts(kitRecordsClient(organizationId, userId), install);
  }

  async function remove(): Promise<boolean> {
    const capturedOrg = organizationId;
    if (!capturedOrg || !install) return false;
    setPhase("removing");
    setRunError(null);
    setActionError(null);
    try {
      await removeInstall(kitRecordsClient(capturedOrg, userId), install, dispatch);
      setInstall(null);
      setSteps(stepsFromInstall(manifest, null));
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      setAttempt((n) => n + 1);
      return false;
    } finally {
      setPhase("ready");
    }
  }

  return {
    organizationId,
    organizationState: org.organizationState,
    store,
    install,
    steps,
    phase,
    readError,
    runError: actionError ?? runError,
    attached,
    retryRead: () => setAttempt((n) => n + 1),
    runInstall: install_,
    removalFacts: facts,
    remove,
  };
}
