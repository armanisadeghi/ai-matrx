"use client";

/**
 * Track the brand's own properties as role Own: one account, or every untracked one.
 * ONE flow for the Accounts tab and the KPI empty state (an empty account asks before it is
 * tracked anyway; a cost worth a warning is named first, in points — cost.ts).
 */

import { useState } from "react";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";

import { useInvalidateSocial } from "../hooks";
import { useSocialSpend } from "../cost";
import { socialErrorCode, socialErrorMessage, trackAccount } from "../server";
import { TRACKABLE_PLATFORMS, isSocialPlatform, type AccountRow } from "../types";

/** Own property rows the server can track now (its platform is wired). */
export function trackableOwn(row: AccountRow): boolean {
  return !row.trackedAccountId && Boolean(row.propertyId) && row.trackable !== false && TRACKABLE_PLATFORMS.has(row.platform);
}

export function useTrackOwn(organizationId: string, brandId: string) {
  const invalidate = useInvalidateSocial();
  const [busyRow, setBusyRow] = useState<string | null>(null);
  /** The server's live step line for the row being tracked ("Fetching posts · 2 of 3"). */
  const [progress, setProgress] = useState<string | null>(null);
  const { costText, confirmSpend } = useSocialSpend(organizationId);

  /** Track one own property as role Own; an empty account asks before tracking it anyway. */
  async function trackOwnRow(row: AccountRow, allowEmpty = false): Promise<"ok" | "failed"> {
    if (!row.profileUrl && !row.handle) return "failed";
    try {
      await trackAccount(
        {
          handleOrUrl: row.profileUrl ?? row.handle,
          platform: isSocialPlatform(row.platform) ? row.platform : undefined,
          role: "own",
          brandId,
          propertyId: row.propertyId ?? undefined,
          pages: 1,
          allowEmpty,
        },
        {
          organizationId,
          onProgress: (p) => setProgress(p.step && p.total ? `${p.message} · ${p.step} of ${p.total}` : p.message),
        },
      );
      return "ok";
    } catch (err) {
      if (!allowEmpty && socialErrorCode(err) === "social_profile_empty") {
        const again = await confirm({
          title: `Track @${row.handle} anyway?`,
          description: socialErrorMessage(err, "This account has no posts."),
          confirmLabel: "Track anyway",
        });
        if (again) return trackOwnRow(row, true);
        return "failed";
      }
      toast.error(`@${row.handle}: ${socialErrorMessage(err, "Couldn't track it")}`);
      return "failed";
    }
  }

  async function trackOwn(row: AccountRow) {
    const ok = await confirmSpend("track", 1, { title: `Track @${row.handle} as Own?`, confirmLabel: "Track" });
    if (!ok) return;
    setBusyRow(row.rowId);
    try {
      if ((await trackOwnRow(row)) === "ok") {
        await invalidate();
        toast.success(`Tracking @${row.handle}`);
      }
    } finally {
      setBusyRow(null);
      setProgress(null);
    }
  }

  async function trackAllOwn(list: AccountRow[]) {
    const ok = await confirm({
      title: `Track ${list.length} own account${list.length === 1 ? "" : "s"}?`,
      description: [list.map((r) => `@${r.handle}`).join(", "), costText("track", list.length)].filter(Boolean).join(" · "),
      confirmLabel: "Track all",
    });
    if (!ok) return;
    setBusyRow("bulk");
    let done = 0;
    try {
      for (const row of list) {
        if ((await trackOwnRow(row)) === "ok") done += 1;
      }
    } finally {
      await invalidate();
      setBusyRow(null);
      setProgress(null);
    }
    toast.success(`Tracked ${done} of ${list.length}`);
  }

  return { busyRow, setBusyRow, progress, trackOwn, trackAllOwn, costText, confirmSpend };
}
