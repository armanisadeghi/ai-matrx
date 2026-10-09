"use client";

/**
 * Track the brand's own properties as role Own: one account, or every untracked one.
 * ONE flow for the Accounts tab and the KPI empty state (an empty account asks before it is
 * tracked anyway; every call names its credit cost first).
 */

import { useState } from "react";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";

import { useInvalidateSocial } from "../hooks";
import { socialErrorCode, socialErrorCredits, socialErrorMessage, trackAccount } from "../server";
import { TRACKABLE_PLATFORMS, isSocialPlatform, type AccountRow } from "../types";

/** One profile fetch + one page of posts. */
export const TRACK_CREDITS = 2;

/** Own property rows the server can track now (its platform is wired). */
export function trackableOwn(row: AccountRow): boolean {
  return !row.trackedAccountId && Boolean(row.propertyId) && TRACKABLE_PLATFORMS.has(row.platform);
}

export function useTrackOwn(organizationId: string, brandId: string) {
  const invalidate = useInvalidateSocial();
  const [busyRow, setBusyRow] = useState<string | null>(null);

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
        { organizationId },
      );
      return "ok";
    } catch (err) {
      if (!allowEmpty && socialErrorCode(err) === "social_profile_empty") {
        const again = await confirm({
          title: `Track @${row.handle} anyway?`,
          description: `${socialErrorMessage(err, "This account has no posts.")} Tracking it fetches it again: about ${TRACK_CREDITS} credits.`,
          confirmLabel: "Track anyway",
        });
        if (again) return trackOwnRow(row, true);
        return "failed";
      }
      const credits = socialErrorCredits(err);
      toast.error(`@${row.handle}: ${socialErrorMessage(err, "Couldn't track it")}${credits ? ` · ${credits} credit charged` : ""}`);
      return "failed";
    }
  }

  async function trackOwn(row: AccountRow) {
    const ok = await confirm({
      title: `Track @${row.handle} as Own?`,
      description: `Fetches the account and its latest posts. About ${TRACK_CREDITS} credits, billed to this organization.`,
      confirmLabel: "Track",
    });
    if (!ok) return;
    setBusyRow(row.rowId);
    try {
      if ((await trackOwnRow(row)) === "ok") {
        await invalidate();
        toast.success(`Tracking @${row.handle}`);
      }
    } finally {
      setBusyRow(null);
    }
  }

  async function trackAllOwn(list: AccountRow[]) {
    const ok = await confirm({
      title: `Track ${list.length} own account${list.length === 1 ? "" : "s"}?`,
      description: `${list.map((r) => `@${r.handle}`).join(", ")}. About ${list.length * TRACK_CREDITS} credits in total, billed to this organization.`,
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
    }
    toast.success(`Tracked ${done} of ${list.length}`);
  }

  return { busyRow, setBusyRow, trackOwn, trackAllOwn };
}
