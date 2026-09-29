"use client";

import React, { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import type { Permission, ResourceType } from "@/utils/permissions/types";
import { ShareLinkPanel } from "../ShareLinkPanel";
import { Skeleton } from "@ai-matrx/design-system";
import { extractErrorMessage } from "@/utils/errors";
import { getShareCapabilities } from "@/utils/permissions/shareLinks";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { sharingLocation, type SharingCopyContext } from "@/features/sharing/format";

interface PublicAccessTabProps {
  /** The public permission row from the permissions table, if any (kept for hosts' tab dot). */
  publicPermission?: Permission;
  isOwner: boolean;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  /**
   * Identity + the page's leading KPIs, mirrored into this tab's payloads so a
   * copied answer is interpretable on its own.
   */
  copy?: SharingCopyContext;
}

/**
 * What "Anyone" means for this type, in words that never promise more than the
 * platform delivers. "No sign-in" only where a signed-out page exists
 * (utils/permissions/publicLane.ts); everywhere else public means every signed-in
 * person finds it under Public, and a signed-out visitor reaches it only through a
 * no-login link — when the type has one. Pure — exported for tests.
 */
export function anyoneReachWords(
  typeLabel: string,
  reach: { publicPage: boolean; noLoginLink: boolean },
): string {
  if (reach.publicPage) return `Open to everyone — anyone can view this ${typeLabel}, no sign-in.`;
  return (
    `Everyone signed in to AI Matrx can find and view this ${typeLabel}.` +
    (reach.noLoginLink
      ? " People without an account need a no-login link."
      : " People without an account cannot open it.")
  );
}

/**
 * PublicAccessTab — "Anyone with the link" (access ladder Words table, Link row).
 *
 * An Anyone link opens the record at its permission for whoever holds it, at EVERY level —
 * Private and Confidential records included — and is never indexed. The row controls ("Shown to",
 * "Published to the web") are not here: they sit at the top of the people tab
 * (`RowControls`), and only on Organization and Public records (T-13 phase 5).
 */
export function PublicAccessTab({
  isOwner,
  resourceType,
  resourceId,
  resourceName,
  copy,
}: PublicAccessTabProps) {
  const [linkShareable, setLinkShareable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setCapabilitiesError(null);
    getShareCapabilities(resourceType)
      .then((c) => {
        if (active) setLinkShareable(c.isLinkShareable);
      })
      .catch((error: unknown) => {
        if (active) setCapabilitiesError(extractErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [resourceType]);

  const location = sharingLocation(copy?.surface ?? "Anyone link");

  if (loading) return <Skeleton className="h-20 w-full" />;
  if (capabilitiesError) {
    // ERRORS FIRST: no link panel renders while this fails, so the sentence is the answer.
    return (
      <Alert variant="destructive" className="group">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-start gap-2">
          <span className="flex-1">{capabilitiesError}</span>
          <span className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <CopyButtons
              size="xs"
              label="Anyone link error"
              human={() =>
                [
                  "The Anyone link controls could not load.",
                  capabilitiesError,
                  `Resource: ${resourceType}:${resourceId} (${resourceName})`,
                ].join("\n")
              }
              json={() => ({
                error: capabilitiesError,
                resource_type: resourceType,
                resource_id: resourceId,
              })}
              agent={() => ({
                kind: "public-access-error",
                location,
                description:
                  "The share-capabilities lookup failed, so the Anyone link tab renders no controls. This is the error on screen, verbatim.",
                data: {
                  rendered_error: capabilitiesError,
                  resource_type: resourceType,
                  resource_id: resourceId,
                  resource_name: resourceName,
                  kpis: copy?.kpis ?? null,
                },
                attributes: { resource_type: resourceType, resource_id: resourceId, state: "error" },
              })}
            />
          </span>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="space-y-3">
      <ShareLinkPanel
        resourceType={resourceType}
        resourceId={resourceId}
        isOwner={isOwner}
        enabled={linkShareable}
      />
    </div>
  );
}
