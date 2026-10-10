/**
 * features/files/components/surfaces/FileShareTab.tsx
 *
 * The "Share" tab inside [PreviewPane](./PreviewPane.tsx). Surfaces every
 * sharing-related affordance the app has for cld_files-backed records in
 * one scannable view so the user never has to hunt through dialogs:
 *
 *   STATUS         Ownership badge, active-link count.
 *   SHOWN TO / PUBLISHED  The access ladder's row controls (`RowControls`, the same control
 *                  the Share dialog draws): "Shown to" and "Published to the web". Absent on a
 *                  file that is a child of another record (T-13 phase 5).
 *   QUICK SHARE    One-click "Copy public link" — reuses an existing
 *                  read-only share token or creates one on demand.
 *   SHARE LINKS    Embeds <ShareLinkDialogBody/> — create / list /
 *                  revoke tokenized links with expiry + max uses.
 *   PEOPLE & GROUPS Embeds <PermissionsDialogBody/> — grant explicit
 *                  read / write / admin to a user UUID OR a group UUID.
 *   ORGANIZATION   Shows the active org context. Sharing with the org
 *                  happens via the People & Groups section using the
 *                  org's group UUID (until an explicit org-group
 *                  mapping ships in the backend).
 *
 * Virtual files (Notes, Code Snippets, Applets, …) don't go through
 * the cld_files share/permission tables — they have their own per-source
 * sharing surfaces. We surface a friendly hint in that case.
 */

"use client";

import { useCallback, useState } from "react";
import {
  Building2,
  Check,
  Link2,
  Loader2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveShareLinksForResource,
  selectFileById,
} from "@/features/files/redux/selectors";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { ShareLinkDialogBody } from "@/features/files/components/core/ShareLinkDialog/ShareLinkDialog";
import { PermissionsDialogBody } from "@/features/files/components/core/PermissionsDialog/PermissionsDialog";
import { useSharing } from "@/utils/permissions/hooks";
import { RowControls } from "@/features/sharing/components/RowControls";

export interface FileShareTabProps {
  fileId: string;
  className?: string;
}

export function FileShareTab({ fileId, className }: FileShareTabProps) {
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const currentUserId = useAppSelector(selectUserId);
  // The FILE's own organization (the record's, never the active one).
  const { organizations: memberOrgs } = useUserOrganizations("all");
  const organizationName = file?.organizationId
    ? (memberOrgs.find((o) => o.id === file.organizationId)?.name ?? null)
    : null;
  const activeShareLinks = useAppSelector((s) =>
    selectActiveShareLinksForResource(s, fileId),
  );
  const actions = useFileActions(fileId);
  const sharing = useSharing(
    "file",
    fileId,
    Boolean(file) && file?.source.kind !== "virtual",
  );

  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (copying) return;
    setCopying(true);
    try {
      const url = await actions.copyShareUrl();
      if (url) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }
    } finally {
      setCopying(false);
    }
  }, [actions, copying]);

  if (!file) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center text-sm text-muted-foreground",
          className,
        )}
      >
        File not loaded.
      </div>
    );
  }

  // Virtual sources own their own share story — Notes share via the
  // Notes feature, Code Snippets via the code feature, etc. Surface a
  // clear hint instead of half-wiring the cld_files share dialogs.
  if (file.source.kind === "virtual") {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-3 bg-muted/10 p-6 text-center",
          className,
        )}
      >
        <Users className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Sharing handled by source</h3>
        <p className="max-w-sm text-xs text-muted-foreground">
          This file is provided by a virtual source. Open it in its native
          surface to manage sharing and permissions.
        </p>
      </div>
    );
  }

  const isOwner = !!currentUserId && currentUserId === file.ownerId;
  const activeLinkCount = activeShareLinks.length;

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-auto bg-card px-4 py-3",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-2xl space-y-5 pb-6">
        {/* ─── Status ──────────────────────────────────────────────── */}
        <Section title="Status">
          <Row
            label="Owner"
            value={
              <span className="inline-flex items-center gap-1.5">
                <span className="font-mono text-[11px] text-foreground/80">
                  {file.ownerId
                    ? `${file.ownerId.slice(0, 8)}…${file.ownerId.slice(-4)}`
                    : "—"}
                </span>
                {isOwner ? <OwnerBadge /> : null}
              </span>
            }
          />
          <Row
            label="Active links"
            value={
              activeLinkCount === 0
                ? "None"
                : `${activeLinkCount} active link${activeLinkCount > 1 ? "s" : ""}`
            }
          />
        </Section>

        {/* ─── Shown to / Published to the web (the access ladder's row controls) ── */}
        <RowControls
          resourceType="file"
          resourceId={fileId}
          canChange={isOwner}
          shownTo={sharing.shownTo}
          isPublic={sharing.isPublic}
          childRecord={sharing.childRecord}
          onSetShownTo={sharing.setShownTo}
          onPublish={() => sharing.makePublic()}
          onStopPublishing={() => sharing.revokeAccess({ isPublic: true })}
        />

        {/* ─── Quick share ─────────────────────────────────────────── */}
        <Section
          title="Quick share"
          description="Reuses an existing read-only share link if one exists, otherwise mints a new one. The URL points directly at the file bytes — works as <img src>, hot link, or raw download."
        >
          <div className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">
                Anyone link to the file
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                One click — copied to clipboard.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCopy()}
              disabled={copying}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {copying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : copying ? "Copying…" : "Copy link"}
            </button>
          </div>
        </Section>

        {/* ─── Share links (full manager) ──────────────────────────── */}
        <Section
          title="Share links"
          description="Create tokenized URLs with optional expiry, max-uses, and permission level. Revoke any link to invalidate it instantly."
        >
          <div className="px-3 pb-3 pt-1">
            <ShareLinkDialogBody resourceId={fileId} resourceType="file" />
          </div>
        </Section>

        {/* ─── People & groups ─────────────────────────────────────── */}
        <Section
          title="People & groups"
          description="Grant a specific user or group explicit read / write / admin access. Optional expiry per grant."
        >
          <div className="px-3 pb-3 pt-1">
            <PermissionsDialogBody resourceId={fileId} resourceType="file" />
          </div>
        </Section>

        {/* ─── Organization ────────────────────────────────────────── */}
        <Section title="Organization">
          <Row
            label="Lives in"
            value={
              organizationName ? (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  {organizationName}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {/* read-gate-exempt: label from the file record already in the store */}
                  {file?.organizationId ? "An organization you are not a member of" : "No organization"}
                </span>
              )
            }
          />
          <div className="px-3 py-2 text-[11px] text-muted-foreground">
            To share with your organization, grant access to the org's group
            UUID in the section above. A first-class "Share with org" picker is
            on the roadmap once the org → group mapping is wired backend-side.
          </div>
        </Section>
      </div>
    </div>
  );
}

export default FileShareTab;

// ---------------------------------------------------------------------------
// Building blocks — kept local so we don't accidentally export styles that
// haven't been promoted to a shared kit yet.
// ---------------------------------------------------------------------------

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex flex-col gap-0.5">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h4>
        {description ? (
          <p className="text-[11px] leading-snug text-muted-foreground/80">
            {description}
          </p>
        ) : null}
      </div>
      <div className="rounded-md border border-border bg-card">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-3 px-3 py-2 border-b border-border last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs text-foreground break-words min-w-0">
        {value}
      </span>
    </div>
  );
}

function OwnerBadge() {
  return (
    <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-ink">
      You
    </span>
  );
}
