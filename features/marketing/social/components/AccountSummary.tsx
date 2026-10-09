"use client";

/**
 * The designed summary of an account that has no page of its own yet (an own property not tracked, no
 * stored profile): who it is, how big it is when known, and the two things a person does next -
 * Track it, or open it on its platform. A row click on the Accounts table lands here, never on a
 * raw-fields inspector.
 */

import { ExternalLink, Loader2, UserPlus } from "lucide-react";

import { Button } from "@ai-matrx/design-system/controls";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PropertyKindMark } from "@/features/marketing/components/shared/PropertyKindMark";
import { formatSocialHandle } from "@/features/marketing/lib/social-handle";

import { accountLabels } from "../mappers";
import { formatCompact } from "../outlier";
import { profileAvatarDoor } from "../server";
import type { AccountRow } from "../types";
import { PlatformMark, platformLabel } from "./PlatformMark";
import { SocialImage } from "./SocialImage";

export function AccountSummary({
  row,
  onClose,
  canTrack,
  tracking,
  onTrack,
}: {
  row: AccountRow | null;
  onClose: () => void;
  canTrack: boolean;
  tracking: boolean;
  onTrack: (row: AccountRow) => void;
}) {
  const labels = row ? accountLabels(row.displayName, row.handle, row.platform) : null;
  const handle = row ? formatSocialHandle({ platform: row.platform, handle: row.handle, url: row.profileUrl }) : "";
  return (
    <Dialog open={row !== null} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="max-w-sm">
        {row && labels ? (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">{labels.primary}</DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-3">
              <span className="relative h-12 w-12 shrink-0">
                <span className="relative block h-12 w-12 overflow-hidden rounded-full bg-muted">
                  <SocialImage
                    door={row.profileId && row.avatarFileId ? profileAvatarDoor(row.profileId) : null}
                    url={row.avatarHint}
                    fallback={<PropertyKindMark kind={row.platform} size={48} />}
                  />
                </span>
                <span className="absolute -bottom-1 -right-1">
                  <PlatformMark platform={row.platform} size={20} />
                </span>
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-base font-semibold text-foreground">{labels.primary}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {[platformLabel(row.platform), labels.secondary ? handle : null].filter(Boolean).join(" · ")}
                </span>
              </span>
            </div>
            {row.followers !== null ? (
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Followers</span>
                <span className="text-sm tabular-nums text-foreground">{formatCompact(row.followers)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              {row.externalUrl ? (
                <Button variant="outline" icon={<ExternalLink />} asChild>
                  <a href={row.externalUrl} target="_blank" rel="noreferrer noopener">
                    Open on {platformLabel(row.platform)}
                  </a>
                </Button>
              ) : null}
              {canTrack ? (
                <Button
                  variant="primary"
                  icon={tracking ? <Loader2 className="animate-spin" /> : <UserPlus />}
                  disabled={tracking}
                  onClick={() => onTrack(row)}
                >
                  {tracking ? "Tracking…" : "Track"}
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
