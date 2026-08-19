"use client";

/**
 * ShareControl — sharing a Cloud Browser (D-18).
 *
 * Multi-user is first-build scope and uses the CANONICAL access system only —
 * no bespoke share flow. This wraps the platform ShareButton/ShareModal
 * (features/sharing) against resourceType `browser_profile`. The only thing this
 * feature adds is the shared-session warning copy, because a Cloud Browser holds
 * live signed-in sessions and sharing it is not like sharing a document.
 */

import React from "react";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { isUuidValue } from "@/components/official/entity-ref/doors";
import { cn } from "@/utils/cn";
import { CLOUD_BROWSER_RESOURCE_TYPE } from "../constants";
import { AlertTriangle } from "lucide-react";

export const SHARED_SESSION_WARNING =
  "Anyone you share this with can see everything this browser is signed into. Share it only with people you trust with those accounts. You can revoke access instantly at any time.";

export function ShareControl({
  profileId,
  profileName,
  canShare,
  className,
}: {
  profileId: string;
  profileName: string;
  /** Only Edit+ can re-share; View cannot (S1 §2.17). */
  canShare: boolean;
  className?: string;
}) {
  const isPersistedProfile = isUuidValue(profileId);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">People</span>
        {canShare && isPersistedProfile ? (
          <ShareButton
            resourceType={CLOUD_BROWSER_RESOURCE_TYPE}
            resourceId={profileId}
            resourceName={profileName}
            size="sm"
          />
        ) : !isPersistedProfile ? (
          <span className="text-xs text-muted-foreground">
            Sharing becomes available when this Cloud Browser is saved.
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            You have view access — ask the owner to change who can reach this browser.
          </span>
        )}
      </div>
      <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {SHARED_SESSION_WARNING}
      </p>
    </div>
  );
}
