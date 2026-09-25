"use client";

// useKitInstall — the install state of ONE kit in the organization the person SET.
//
// It reads the organization through `useOrganizationRequired` (never a default,
// never the personal org), asks the record store's switch before anything else
// (owner contract change, item 3), and reads this kit's install record from the
// organization's "Kit installs" table. `install()` runs or RESUMES the install;
// `remove()` archives exactly the recorded ids.

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";
import {
  kitRecordsClient,
  readInstall,
  removeInstall,
  runInstall,
  stepsFromInstall,
} from "../installer";
import type { InstallStepView, KitInstallRecord, KitManifest } from "../types";

export type KitInstallPhase = "loading" | "ready" | "installing" | "removing";

export function useKitInstall(manifest: KitManifest) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const org = useOrganizationRequired();
  const organizationId = org.organizationState === "ready" ? org.organizationId : null;
  const store = useUnifiedDataCampaign({
    organizationId,
    organizationState: org.organizationState,
    storeSwitch: UNIFIED_DATA_CAMPAIGN.check,
  });

  const [install, setInstall] = useState<KitInstallRecord | null>(null);
  const [steps, setSteps] = useState<InstallStepView[]>(() => stepsFromInstall(manifest, null));
  const [phase, setPhase] = useState<KitInstallPhase>("loading");
  const [readError, setReadError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!organizationId || store.state !== "on") return;
    let cancelled = false;
    setPhase("loading");
    setReadError(null);
    const client = kitRecordsClient(organizationId, userId);
    readInstall(client, organizationId, manifest.key)
      .then((found) => {
        if (cancelled) return;
        setInstall(found);
        setSteps(stepsFromInstall(manifest, found));
        setRunError(found?.status === "failed" ? (found.error ?? null) : null);
        setPhase("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setReadError(err instanceof Error ? err.message : String(err));
        setPhase("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, store.state, userId, manifest, attempt]);

  async function install_(): Promise<KitInstallRecord | null> {
    if (!organizationId || phase === "installing") return null;
    setPhase("installing");
    setRunError(null);
    try {
      const done = await runInstall({
        client: kitRecordsClient(organizationId, userId),
        dispatch,
        organizationId,
        manifest,
        onProgress: (next, rec) => {
          setSteps(next);
          if (rec) setInstall(rec);
        },
      });
      setInstall(done);
      return done;
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
      // Re-read what the record now says so the stepper shows exactly what exists.
      try {
        const found = await readInstall(kitRecordsClient(organizationId, userId), organizationId, manifest.key);
        setInstall(found);
      } catch {
        // The failure itself is already on screen.
      }
      return null;
    } finally {
      setPhase("ready");
    }
  }

  async function remove(): Promise<boolean> {
    if (!organizationId || !install) return false;
    setPhase("removing");
    setRunError(null);
    try {
      await removeInstall(kitRecordsClient(organizationId, userId), install);
      setInstall(null);
      setSteps(stepsFromInstall(manifest, null));
      return true;
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
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
    runError,
    retryRead: () => setAttempt((n) => n + 1),
    runInstall: install_,
    remove,
  };
}
