"use client";

// useKitInstalls — where this kit is installed, across ALL the organizations the
// person belongs to (or the one the page's organization filter names).
//
// This is a LIST read: the active organization is never an input (common-docs
// /policies/active-org-is-never-a-list-filter.md). Each install carries its own
// organization id; every action on an install (update, remove, open its tables)
// runs in THAT organization, never in whichever one is active.

import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { kitRecordsClient, readInstall } from "../installer";
import type { KitInstallRecord } from "../types";

export interface KitInstallIn {
  organizationId: string;
  install: KitInstallRecord;
}

export interface KitInstallsFailure {
  organizationId: string;
  message: string;
}

export interface KitInstallsState {
  loading: boolean;
  installs: KitInstallIn[];
  failures: KitInstallsFailure[];
  retry: () => void;
}

/** `organizationIds` = the organizations to look in; null = not known yet (still loading). */
export function useKitInstalls(kitKey: string, organizationIds: readonly string[] | null): KitInstallsState {
  const userId = useAppSelector(selectUserId);
  const [attempt, setAttempt] = useState(0);
  const orgKey = organizationIds ? [...organizationIds].sort().join(",") : null;
  const question = orgKey !== null ? `${kitKey}|${userId ?? ""}|${attempt}|${orgKey}` : null;
  const [answered, setAnswered] = useState<{ question: string; installs: KitInstallIn[]; failures: KitInstallsFailure[] } | null>(null);

  useEffect(() => {
    if (orgKey === null || !question) return;
    const ids = orgKey.split(",").filter(Boolean);
    let cancelled = false;
    void (async () => {
      const results = await Promise.all(
        ids.map(async (organizationId) => {
          try {
            const store = await UNIFIED_DATA_CAMPAIGN.check(organizationId);
            // An organization whose record store is off cannot hold an install: nothing to list.
            if (store.state === "off") return { organizationId, install: null, message: null };
            if (store.state !== "on") {
              return { organizationId, install: null, message: "We could not check this organization's data switch." };
            }
            const install = await readInstall(kitRecordsClient(organizationId, userId), organizationId, kitKey);
            return { organizationId, install, message: null };
          } catch (err) {
            return { organizationId, install: null, message: err instanceof Error ? err.message : String(err) };
          }
        }),
      );
      if (cancelled) return;
      setAnswered({
        question,
        installs: results.flatMap((r) => (r.install ? [{ organizationId: r.organizationId, install: r.install }] : [])),
        failures: results.flatMap((r) => (r.message ? [{ organizationId: r.organizationId, message: r.message }] : [])),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [orgKey, question, kitKey, userId]);

  const current = answered && answered.question === question ? answered : null;
  return {
    loading: current === null,
    installs: current?.installs ?? [],
    failures: current?.failures ?? [],
    retry: () => setAttempt((n) => n + 1),
  };
}
