"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Mail, Building2, Globe, Loader2, Lock } from "lucide-react";
import { PermissionBadge, PublicBadge } from "./PermissionBadge";
import { UserAvatarDisplay } from "@/components/user/UserIdentity";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";
import {
  accessKpis,
  granteeKind,
  granteeLabel,
  granteeSecondaryLabel,
  grantCsvRows,
  grantLevelLabel,
  humanGrantList,
  humanGrantRow,
  sharingLocation,
  GRANT_LIST_SCOPE_NOTE,
  NO_GRANTS_DETAIL,
  NO_GRANTS_HEADLINE,
  NO_GRANTS_YET_HEADLINE,
  type SharingCopyContext,
} from "@/features/sharing/format";
import type {
  PermissionWithDetails,
  PermissionLevel,
  ShareActionResult,
} from "@/utils/permissions/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PermissionsListProps {
  permissions: PermissionWithDetails[];
  isOwner: boolean;
  onUpdateLevel: (
    options: { userId?: string; organizationId?: string; isPublic?: boolean },
    newLevel: PermissionLevel,
  ) => Promise<ShareActionResult>;
  onRevoke: (options: {
    userId?: string;
    organizationId?: string;
    isPublic?: boolean;
  }) => Promise<ShareActionResult>;
  loading?: boolean;
  /**
   * Identity + the page's leading KPIs, so every copied grant states what it
   * belongs to. Optional: without it the list still copies, falling back to the
   * identity carried on the permission rows themselves — but a page that shows
   * KPIs above this list should pass them so the payloads mirror the screen.
   */
  copy?: SharingCopyContext;
  /** Which slice this list renders, e.g. "Users" / "Organizations". */
  listLabel?: string;
  /**
   * 🚨 WHAT ELSE IS ON THIS SCREEN THAT IS NOT A GRANT (FIX-10C, VERIFIER-10
   * F13, 2026-09-22).
   *
   * This list only ever knew about DIRECT grants, and said so honestly in its
   * scope note. But after an outside invitation lands, the dialog read
   * "Current Access — Not shared with anyone — No one has been granted access
   * here" with the invited person's row drawn directly underneath it. Both
   * halves were true and the screen contradicted itself, which is the one thing
   * a screen may not do.
   *
   * An invitation is not a grant — it confers nothing until it is accepted, and
   * making this list count it would be the same lie pointing the other way. So
   * the empty state stays an empty state and simply stops pretending it is the
   * whole screen: the caller that also draws the pending rows says how many
   * there are, and the sentence names them.
   */
  alsoPending?: { count: number; one: string; many: string } | undefined;
}

/**
 * Render-only preview size. The list itself is complete — truncating HERE
 * (never in the data) is what keeps show-all, copy, and export honest: every
 * payload and every export covers ALL grants, not the visible slice.
 */
const GRANT_PREVIEW = 12;

/**
 * What is on the screen besides the grants, in a sentence a person reads.
 *
 * The caller hands BOTH words. A plural is a word the thing already knows,
 * never an "s" glued onto a noun phrase — that rule cost this platform "22 new
 * Invoicess" once already, and "3 person outside this organizations" here.
 */
function pendingSentence({
  count,
  one,
  many,
}: {
  count: number;
  one: string;
  many: string;
}): string {
  return count === 1
    ? `One ${one} is invited below and has not joined yet — they get access the moment they follow their link.`
    : `${count} ${many} are invited below and have not joined yet — each gets access the moment they follow their link.`;
}

/** Header toggle between the preview and the full grant list. */
function ShowAllToggle({
  total,
  preview,
  showingAll,
  onToggle,
}: {
  total: number;
  preview: number;
  showingAll: boolean;
  onToggle: () => void;
}) {
  if (total <= preview) return null;
  return (
    <button
      type="button"
      className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground "
      onClick={onToggle}
    >
      {showingAll ? `top ${preview}` : `all ${total.toLocaleString()}`}
    </button>
  );
}

/**
 * PermissionsList - Display and manage current permissions
 *
 * Shows all users, organizations, and public access for a resource.
 * Allows owners to update permission levels or revoke access.
 *
 * @example
 * <PermissionsList
 *   permissions={permissions}
 *   isOwner={isOwner}
 *   onUpdateLevel={updateLevel}
 *   onRevoke={revokeAccess}
 * />
 */
export function PermissionsList({
  permissions,
  isOwner,
  onUpdateLevel,
  onRevoke,
  loading = false,
  copy,
  listLabel = "Current access",
  alsoPending,
}: PermissionsListProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<{
    open: boolean;
    permission: PermissionWithDetails | null;
  }>({ open: false, permission: null });

  /**
   * The payload context. A caller that renders KPIs above this list passes
   * them; otherwise we fall back to the identity the rows themselves carry, so
   * a bare `<PermissionsList>` still copies something an agent can act on.
   */
  const context: SharingCopyContext = copy ?? {
    resourceType: permissions[0]?.resourceType ?? "unknown",
    resourceId: permissions[0]?.resourceId ?? "unknown",
    surface: listLabel,
    kpis: accessKpis({
      permissions,
      isPublic: permissions.some((p) => p.isPublic),
      // What the list actually renders — owner controls are on screen or not.
      viewerIsOwner: isOwner,
    }),
  };
  const location = sharingLocation(context.surface);
  const resourceAttributes = {
    resource_type: context.resourceType,
    resource_id: context.resourceId,
    resource_name: context.resourceName ?? null,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (permissions.length === 0) {
    return (
      <div className="group text-center py-6 text-muted-foreground">
        <Lock className="w-10 h-10 mx-auto mb-1.5 opacity-20" />
        <p className="text-sm">
          {alsoPending && alsoPending.count > 0 ? NO_GRANTS_YET_HEADLINE : NO_GRANTS_HEADLINE}
        </p>
        {/*
         * This list only knows about DIRECT grants. It cannot see visibility,
         * org membership, or access conveyed through a container — so "only you
         * can access this" would be a claim it has no basis for. State what is
         * actually known: no one has been granted access here.
         */}
        <p className="text-xs mt-0.5">{NO_GRANTS_DETAIL}</p>
        {/* And what IS on the screen, so the headline above can never stand
            over a row that contradicts it. */}
        {alsoPending && alsoPending.count > 0 ? (
          <p className="text-xs mt-0.5" data-testid="grants-also-pending">
            {pendingSentence(alsoPending)}
          </p>
        ) : null}
        {/*
         * "Nobody has been granted access" is an ANSWER, not an absence — it is
         * usually the whole reason the user is here asking why someone can't
         * see this. It has to be copyable, and it has to carry the scope note
         * so an agent never reads it as "nothing grants access".
         */}
        <div className="mt-1.5 flex justify-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <CopyButtons
            size="xs"
            label={`${listLabel} (no grants)`}
            human={() => humanGrantList([], { surface: context.surface })}
            agent={() => ({
              kind: "access-grants",
              location,
              description: `The "${listLabel}" grant list, which is empty: ${NO_GRANTS_HEADLINE} — ${NO_GRANTS_DETAIL}.`,
              data: {
                list: listLabel,
                rendered_empty_state: {
                  headline: NO_GRANTS_HEADLINE,
                  detail: NO_GRANTS_DETAIL,
                },
                grants: [],
                scope_note: GRANT_LIST_SCOPE_NOTE,
                kpis: context.kpis,
              },
              summary: humanGrantList([], { surface: context.surface }),
              attributes: {
                ...context.kpis,
                ...resourceAttributes,
                list: listLabel,
                count: 0,
              },
            })}
          />
        </div>
      </div>
    );
  }

  const handleUpdateLevel = async (
    permission: PermissionWithDetails,
    newLevel: PermissionLevel,
  ) => {
    if (newLevel === permission.permissionLevel) return;

    setUpdatingId(permission.id);
    try {
      await onUpdateLevel(
        {
          userId: permission.grantedToUserId || undefined,
          organizationId: permission.grantedToOrganizationId || undefined,
          isPublic: permission.isPublic || undefined,
        },
        newLevel,
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRevoke = async (permission: PermissionWithDetails) => {
    setRevokingId(permission.id);
    try {
      await onRevoke({
        userId: permission.grantedToUserId || undefined,
        organizationId: permission.grantedToOrganizationId || undefined,
        isPublic: permission.isPublic || undefined,
      });
    } finally {
      setRevokingId(null);
      setConfirmRevoke({ open: false, permission: null });
    }
  };

  // The row labels come from the shared extractor, so a copied grant reads
  // exactly like the row the user is looking at.
  const getPermissionLabel = granteeLabel;
  const getPermissionSecondaryLabel = granteeSecondaryLabel;

  const getPermissionIcon = (permission: PermissionWithDetails) => {
    if (permission.isPublic) return Globe;
    if (permission.grantedToOrganization) return Building2;
    return Mail;
  };

  const visiblePermissions = showAll
    ? permissions
    : permissions.slice(0, GRANT_PREVIEW);

  const listHuman = () =>
    humanGrantList(permissions, {
      surface: context.surface,
      shown: visiblePermissions.length,
    });

  return (
    <div className="space-y-1">
      {/*
       * List-level copy + export. Both always cover ALL grants, never the
       * visible slice — the preview above is a rendering choice, and an export
       * that silently inherited it would be a lie about coverage.
       */}
      <div className="flex items-center justify-end gap-1">
        <ShowAllToggle
          total={permissions.length}
          preview={GRANT_PREVIEW}
          showingAll={showAll}
          onToggle={() => setShowAll((current) => !current)}
        />
        <CopyButtons
          size="xs"
          label={`${listLabel} (${permissions.length} grant${permissions.length === 1 ? "" : "s"})`}
          human={listHuman}
          json={() => permissions}
          agent={() => ({
            kind: "access-grants",
            location,
            description: `All ${permissions.length} direct grant(s) in the "${listLabel}" list. ${GRANT_LIST_SCOPE_NOTE}`,
            data: {
              list: listLabel,
              grants: permissions.map((permission) => ({
                grantee: granteeLabel(permission),
                grantee_email: granteeSecondaryLabel(permission),
                grantee_type: granteeKind(permission),
                level_shown: grantLevelLabel(permission),
                can_manage_here: isOwner,
                raw: permission,
              })),
              scope_note: GRANT_LIST_SCOPE_NOTE,
              kpis: context.kpis,
              rows_on_screen: visiblePermissions.length,
              rows_total: permissions.length,
            },
            summary: listHuman(),
            attributes: {
              ...context.kpis,
              ...resourceAttributes,
              list: listLabel,
              count: permissions.length,
              shown: visiblePermissions.length,
            },
          })}
          export={{
            items: [
              jsonExportItem(() => permissions, "JSON (all grants)"),
              csvExportItem(
                () => grantCsvRows(permissions),
                "CSV (all grants)",
              ),
            ],
          }}
        />
      </div>
      {visiblePermissions.map((permission) => {
        const Icon = getPermissionIcon(permission);
        const isUpdating = updatingId === permission.id;
        const isRevoking = revokingId === permission.id;

        const secondaryLabel = getPermissionSecondaryLabel(permission);

        return (
          // `group` is what reveals the door controls below on hover — without
          // it EntityDoorControls renders at opacity-0 and the door is
          // invisible, which is the failure this campaign has hit four times.
          <Card key={permission.id} className="group px-2 py-2">
            <div className="flex items-center gap-2">
              {/* Left: avatar for user grants, icon otherwise */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {permission.grantedToUser && !permission.isPublic ? (
                  <UserAvatarDisplay
                    user={permission.grantedToUser}
                    size="xs"
                    className="flex-shrink-0"
                  />
                ) : (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 flex-shrink-0">
                    <Icon className="w-3 h-3 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                  <p className="text-sm font-semibold truncate leading-none">
                    {getPermissionLabel(permission)}
                  </p>
                  {/* THE DOOR LAW, applied to the ONE grantee kind that has a
                      reachable route today. An org grant names a real record
                      with its id right here, so it opens.

                      The USER branch deliberately gets no door: `user` has no
                      registry token, and `AdminUserRef` is the WRONG door here —
                      this is a `(core)` sharing surface reached by ordinary org
                      members, for whom `/administration/users` is a 403. A door
                      the viewer cannot open is worse than none, because it looks
                      like it worked. Tracked as the `user` registry gap in
                      docs/handoffs/no-dead-ends-sweep.md. */}
                  {permission.grantedToOrganization && (
                    <EntityDoorControls
                      token="organization"
                      id={permission.grantedToOrganization.id}
                      name={permission.grantedToOrganization.name}
                      className="shrink-0"
                    />
                  )}
                  {secondaryLabel && (
                    <p className="text-[11px] text-muted-foreground truncate leading-none">
                      {secondaryLabel}
                    </p>
                  )}
                </div>
              </div>

              {/* Right: Permission level selector and remove button */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Hover-reveal so ubiquity doesn't become clutter — the same
                    `group` the door controls above ride on. */}
                <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <CopyButtons
                    size="xs"
                    label={`Grant — ${granteeLabel(permission)}`}
                    human={() => humanGrantRow(permission)}
                    json={() => permission}
                    agent={() => ({
                      kind: "access-grant",
                      location,
                      description: `One direct access grant on this resource: ${granteeLabel(
                        permission,
                      )} · ${grantLevelLabel(permission)}.`,
                      data: {
                        grantee: granteeLabel(permission),
                        grantee_email: granteeSecondaryLabel(permission),
                        grantee_type: granteeKind(permission),
                        level_shown: grantLevelLabel(permission),
                        can_manage_here: isOwner,
                        raw: permission,
                        scope_note: GRANT_LIST_SCOPE_NOTE,
                        kpis: context.kpis,
                      },
                      summary: humanGrantRow(permission),
                      attributes: {
                        ...context.kpis,
                        ...resourceAttributes,
                        list: listLabel,
                        grant_id: permission.id,
                        grantee_type: granteeKind(permission),
                        level: permission.permissionLevel,
                      },
                    })}
                  />
                </span>
                {isOwner ? (
                  <>
                    <Select
                      value={permission.permissionLevel}
                      onValueChange={(value) =>
                        handleUpdateLevel(permission, value as PermissionLevel)
                      }
                      disabled={isUpdating || isRevoking}
                    >
                      {/* Widened from 90px: THE SCOPE-QUALIFIED ADMIN RULE makes the longest
                          option "Admin (this item)", which truncates at 90px. */}
                      <SelectTrigger className="w-[140px] h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer</SelectItem>
                        {/* VIS-17b: `commenter` is the FOURTH rung of the one ladder — it has been in
                            `public.permission_level` since G0 and every policy and RPC accepts it, and
                            this picker was the one place a person could not choose it (lane SHARE,
                            2026-09-19). A ladder with a rung nobody can reach is not one ladder. */}
                        <SelectItem value="commenter">Commenter</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        {/* THE SCOPE-QUALIFIED ADMIN RULE (access/DECISIONS.md 2026-09-10):
                            this control's own heading is the grant-list label, which does not
                            name the item, so the bare "Admin" is qualified here. */}
                        <SelectItem value="admin">Admin (this item)</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`Revoke access for ${getPermissionLabel(permission)}`}
                      title={`Revoke access for ${getPermissionLabel(permission)}`}
                      onClick={() =>
                        setConfirmRevoke({ open: true, permission })
                      }
                      disabled={isUpdating || isRevoking}
                    >
                      {isRevoking ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    {permission.isPublic ? (
                      <PublicBadge variant="compact" />
                    ) : (
                      <PermissionBadge
                        level={permission.permissionLevel}
                        variant="compact"
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </Card>
        );
      })}

      {/* Confirmation dialog */}
      <AlertDialog
        open={confirmRevoke.open}
        onOpenChange={(open) =>
          setConfirmRevoke({ open, permission: confirmRevoke.permission })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Access?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke access for{" "}
              <strong>
                {confirmRevoke.permission
                  ? getPermissionLabel(confirmRevoke.permission)
                  : ""}
              </strong>
              ? They will no longer be able to access this resource.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmRevoke.permission) {
                  handleRevoke(confirmRevoke.permission);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
