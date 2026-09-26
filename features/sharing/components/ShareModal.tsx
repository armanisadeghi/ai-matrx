"use client";

import { usePageCapture } from "@/components/agent-copy/page-capture/usePageCapture";
import { dialogCapture } from "@/components/agent-copy/page-capture/pageCapture";
import { PageCaptureButton } from "@/components/agent-copy/page-capture/PageCaptureButton";
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Users,
  Globe,
  Mail,
  Loader2,
  CheckCircle,
  KeyRound,
} from "lucide-react";
import { useSharing, useIsOwner } from "@/utils/permissions/hooks";
import {
  getShareableResource,
  getResourceTypeLabel,
  getResourceSharePath,
} from "@/utils/permissions/registry";
import type { ResourceType } from "@/utils/permissions/types";
import { Skeleton } from "@ai-matrx/design-system";
import { AlertTriangle, Lock } from "lucide-react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { PermissionsList } from "./PermissionsList";
import { AccessSummaryPanel } from "./AccessSummaryPanel";
import { ShareWithUserTab } from "./tabs/ShareWithUserTab";
import { OutsideSharePanel } from "@/features/sharing/outside/OutsideSharePanel";
import { shareWithOutsidePerson } from "@/features/sharing/outside/outsideShareService";
import { OrgAvailabilityNote } from "./OrgAvailabilityNote";
import { WhoCanSeeThis } from "./WhoCanSeeThis";
import { PublicAccessTab } from "./tabs/PublicAccessTab";
import { useToast } from "@/components/ui/use-toast";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  /**
   * The organization this resource belongs to. Pass it whenever the caller knows: it scopes
   * the contact picker to that organization's members (FIX-7B), and the share's in-app
   * notification is filed there (ACCESS-FIX-18) — without it, a share from a page with no
   * organization picked raised "Which workspace is this for?". It is NOT used for the grant —
   * the store still resolves a record's organization off the row itself.
   */
  organizationId?: string;
  /**
   * What to CALL this thing on screen, when the caller knows better than the
   * registry does. In the unified store a Table IS a `custom.record` row, so
   * `resourceType="record"` is correct and the registry's label — "Record" —
   * is the wrong noun for a table: the seventh-pass verdict read "Share
   * Record" above a table's own name. Omit it and the registry's label stands.
   */
  resourceNoun?: string;
  /**
   * OPTIONAL override. Leave it out — the modal resolves ownership itself.
   *
   * Only pass this when the caller already holds an authoritative, resolved
   * answer (e.g. it just created the row). Passing a stale or defaulted
   * `false` is what renders this dialog as a dead, empty shell for a user who
   * owns the record.
   */
  isOwner?: boolean;
  /**
   * SHARING WITH SOMEBODY OUTSIDE THE ORGANIZATION (lane SHARE-OUT, 21 September).
   *
   * Pass this when the subject is a TABLE in the unified record store and the
   * caller knows which organization it belongs to. The Users tab then carries
   * the outside lane: invite by email, "invited, not yet joined", resend and
   * revoke. Leave it out and the dialog is exactly what it was — this is not a
   * capability every resource type has, and a panel that could not work is a
   * panel that must not be drawn.
   *
   * It is NOT a second share surface: the grant it produces is an ordinary
   * `iam.permissions` row read by the same ladder, and the pending state is an
   * `iam.invitations` row, the platform's one invitation primitive.
   */
  outsideShare?: { organizationId: string; tableId: string };
  /**
   * The thing lives in its owner's PERSONAL workspace. "Everyone in <workspace>" then means
   * nobody useful (a personal workspace has no team), so the lane control does not offer it —
   * sharing goes to named people (or everyone in a real organization, from the People tab) or
   * Public. A thing already in that lane still shows it, so the current state never lies.
   */
  personalHome?: boolean;
}

/**
 * ShareModal - Main sharing interface
 *
 * Generic modal that works with ANY resource type.
 * Provides tabs for sharing with people or making public. A share names a PERSON, never an
 * organization (SHARE-PEOPLE-ONLY, 2026-09-25): the old Organizations tab is gone, and "Add
 * everyone in <organization>" inside the People tab names each current member instead.
 *
 * This is the ONE sharing dialog in the app. Do not build a feature-specific
 * variant — extend this one. It self-resolves ownership, so every call site is
 * a three-prop drop-in.
 *
 * @example
 * <ShareModal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   resourceType="workflow"
 *   resourceId={workflowId}
 *   resourceName="My Workflow"
 * />
 */
export function ShareModal({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
  organizationId,
  resourceNoun,
  isOwner: isOwnerOverride,
  outsideShare,
  personalHome = false,
}: ShareModalProps) {
  const [activeTab, setActiveTab] = useState<
    "users" | "public" | "access"
  >("users");
  // How many people outside this organization are invited and have not joined.
  // Reported UP by the panel that draws them, so the grant list's empty state
  // cannot say "Not shared with anyone" over one of their rows (FIX-10C F13).
  const [outsidePending, setOutsidePending] = useState(0);
  const [emailingLink, setEmailingLink] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

  const getShareUrl = (): string | null => {
    const path = getResourceSharePath(resourceType, resourceId);
    if (!path) return null;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    return `${baseUrl}${path}`;
  };

  // Email link to self
  const handleEmailLink = async () => {
    const shareUrl = getShareUrl();
    if (!shareUrl) {
      // Never email a link we can't build — a broken URL in someone's inbox is
      // the worst dead end we can ship.
      toast({
        title: "No shareable link for this item yet",
        description: `"${getResourceTypeLabel(resourceType)}" has no page to open. Sharing access still works; only the emailed link is unavailable.`,
        variant: "destructive",
      });
      return;
    }
    setEmailingLink(true);
    try {
      const response = await fetch("/api/sharing/email-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceType: getResourceTypeLabel(resourceType),
          resourceName,
          shareUrl,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setEmailSent(true);
        toast({
          title: "Email sent",
          description: "Link has been emailed to you",
        });
        setTimeout(() => setEmailSent(false), 3000);
      } else {
        toast({
          title: "Failed to send email",
          description: data.msg || "Please try again",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send email",
        variant: "destructive",
      });
    } finally {
      setEmailingLink(false);
    }
  };

  // Ownership is resolved HERE, not trusted from a prop. Callers that pass a
  // defaulted/stale `false` used to silently produce a dialog with no controls.
  const {
    isOwner: resolvedIsOwner,
    loading: ownerLoading,
    error: ownerError,
  } = useIsOwner(resourceType, resourceId);

  const hasOverride = typeof isOwnerOverride === "boolean";
  const isOwner = hasOverride ? isOwnerOverride : resolvedIsOwner;
  const resolvingOwner = !hasOverride && ownerLoading;

  // The alchemy capture (lane ALCHEMY-BUTTON): while open, the dialog IS what the person sees.
  usePageCapture(
    () =>
      dialogCapture({
        title: `Share ${resourceName ?? resourceType}`,
        route: typeof window !== "undefined" ? window.location.pathname : "",
        dialog: "Share",
        subject: { id: resourceId, name: resourceName ?? null },
        selection: {
          "Resource type": resourceType,
          Organization: { id: organizationId ?? null, name: null },
          Tab: activeTab,
          "Outside sharing offered": outsideShare ? "yes" : "no",
        },
        errors: [ownerError ? `Ownership could not be read: ${String(ownerError)}` : null],
        sections: [
          {
            id: "share-state",
            title: "Share dialog state",
            role: "data",
            value: {
              is_owner: isOwner,
              resolving_owner: resolvingOwner,
              outside_pending_invitations: outsidePending,
              share_link: getResourceSharePath(resourceType, resourceId),
              outside_share: outsideShare ?? null,
            },
          },
        ],
      }),
    { enabled: isOpen },
  );
  const ownerUnknown = !hasOverride && !ownerLoading && ownerError !== null;

  // A resource type missing from the registry can never share — say so loudly
  // rather than rendering a dialog whose every control silently no-ops.
  const registryEntry = resourceType
    ? getShareableResource(resourceType)
    : undefined;
  const configError = !resourceId
    ? "No resource id was supplied to the share dialog."
    : !registryEntry
      ? `"${resourceType}" is not a registered shareable resource. Add it to shareable_resource_registry.`
      : null;

  const {
    permissions,
    isPublic: resourceIsPublic,
    visibility: resourceVisibility,
    organizationDefault,
    whoCanSee,
    personalHome: resolvedPersonalHome,
    setWhoCanSee,
    setVisibility,
    loading,
    error,
    shareWithUser,
    makePublic,
    revokeAccess,
    updateLevel,
    refresh,
  } = useSharing(
    resourceType,
    resourceId,
    isOpen && !configError,
    resourceName,
    // The object's organization, as the page that opened this resolved it — the share's
    // notification is filed there and never asks which workspace this is for.
    organizationId ?? null,
  );

  // PERSONAL HOME, FOR EVERY KIND (2026-09-26): `useSharing` reads the thing's own organization
  // with its visibility and compares it with the viewer's personal workspace, so a host no
  // longer has to remember to say it. A host that knows better may still pass `personalHome`.
  const isPersonalHome = personalHome || resolvedPersonalHome === true;

  // Filter permissions by type for each tab
  const userPermissions = permissions.filter((p) => p.grantedToUserId);
  const publicPermission = permissions.find((p) => p.isPublic);

  const resourceLabel = resourceNoun ?? getResourceTypeLabel(resourceType);

  /**
   * Shown instead of the grant forms when the caller cannot manage sharing.
   * An empty area with no explanation reads as a broken dialog — say WHY.
   */
  const manageBlockedNotice = ownerUnknown ? (
    <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-destructive">
          Couldn&apos;t confirm whether you may change sharing on this{" "}
          {resourceLabel.toLowerCase()}
        </p>
        <p className="text-xs text-destructive/80 mt-0.5">{ownerError} <ErrorAlchemyMenu error={ownerError} /></p>
      </div>
    </div>
  ) : (
    <div className="p-3 rounded-lg border bg-muted/30 flex items-start gap-2">
      <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium">
          You need Admin on this {resourceLabel.toLowerCase()} to change who can see it
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Deciding who else may is what the Admin level means (viewer &lt; commenter &lt;
          editor &lt; admin). Ask whoever holds it, or an owner of the organization. The Access
          tab still shows you everyone who can reach this and why.
        </p>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90dvh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-start justify-between gap-2 pr-10">
            <div className="flex-1 min-w-0">
              <DialogTitle className="flex items-center gap-1.5">
                Share {resourceLabel}
                <PageCaptureButton size="xs" />
              </DialogTitle>
              {/* THE DOOR LAW: the most-reused share surface in the app named
                  the record and gave no way to reach it — while already
                  computing its canonical path for the share URL. `ResourceType`
                  IS the entity-token vocabulary (getResourceSharePath resolves
                  through resolveEntityDoors), so EntityRef also gets the peek
                  and the new tab. A null path falls through to `undefined`,
                  which defers to the registry and correctly ends in no door for
                  a type that genuinely has no route. */}
              <DialogDescription asChild>
                <div className="text-sm text-muted-foreground">
                  <EntityRef
                    token={resourceType}
                    id={resourceId}
                    name={resourceName}
                    href={
                      getResourceSharePath(resourceType, resourceId) ??
                      undefined
                    }
                    showIcon={false}
                  />
                </div>
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEmailLink}
              disabled={emailingLink}
              className="flex-shrink-0"
            >
              {emailingLink ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : emailSent ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              <span className="ml-1.5 hidden sm:inline">
                {emailSent ? "Sent!" : "Email link"}
              </span>
            </Button>
          </div>
        </DialogHeader>

        {/* Misconfigured call site — never render dead controls. */}
        {configError && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 py-10 px-6 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">Sharing is unavailable</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              {configError}
              <ErrorAlchemyMenu error={configError} />
            </p>
          </div>
        )}

        {/* Resolving ownership — show a skeleton, never the non-owner view. */}
        {!configError && resolvingOwner && (
          <div className="flex-1 space-y-3 py-4" aria-busy="true">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {!configError && !resolvingOwner && (
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as typeof activeTab)}
            className="flex-1 flex flex-col min-h-0"
          >
            {/* phone-ok: labels are hidden below sm, icon-only tabs on phone */}
            <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
              <TabsTrigger value="users" className="gap-2">
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Users</span>
                {userPermissions.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/10 rounded-full">
                    {userPermissions.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="public" className="gap-2">
                <Globe className="w-4 h-4" />
                <span className="hidden sm:inline">Public</span>
                {publicPermission && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-green-500/10 rounded-full">
                    •
                  </span>
                )}
              </TabsTrigger>
              {/* WHO CAN SEE THIS, AND WHY. The three tabs above list the GRANTS
                  this dialog writes; they are only one of the six ways access is
                  actually conferred. `AccessSummaryPanel` is the canonical
                  answer — owner, grant, organization default, and the container
                  that carries it — and it belongs beside the controls that
                  change them rather than on some other screen. */}
              <TabsTrigger value="access" className="gap-2">
                <KeyRound className="w-4 h-4" />
                <span className="hidden sm:inline">Access</span>
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 mt-3 min-h-0 overflow-y-auto">
              <TabsContent value="users" className="mt-0 space-y-3">
                {/* WHO CAN SEE THIS (SHARE-LANE-CONTROL): the lane, above the people it limits. */}
                <WhoCanSeeThis
                  whoCanSee={whoCanSee}
                  canChange={isOwner}
                  onChoose={setWhoCanSee}
                  offerOrganization={!isPersonalHome}
                />
                {/* Current user permissions */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Current Access</h3>
                  <PermissionsList
                    permissions={userPermissions}
                    isOwner={isOwner}
                    onUpdateLevel={updateLevel}
                    onRevoke={revokeAccess}
                    loading={loading}
                    // The outside panel at the bottom of this same tab draws
                    // invited-but-not-joined rows; without this the empty state
                    // above them read "Not shared with anyone" (FIX-10C F13).
                    alsoPending={{
                      count: outsidePending,
                      one: "person outside this organization",
                      many: "people outside this organization",
                    }}
                  />
                  <OrgAvailabilityNote
                    permissions={permissions.filter(
                      (p) => p.grantedToOrganizationId,
                    )}
                    organizationDefault={organizationDefault}
                  />
                </div>

                {/* Add user form */}
                {isOwner ? (
                  <ShareWithUserTab
                    onShare={shareWithUser}
                    onSuccess={refresh}
                    resourceType={resourceType}
                    resourceId={resourceId}
                    {...(organizationId ? { organizationId } : {})}
                    alreadySharedUserIds={userPermissions
                      .map((p) => p.grantedToUserId)
                      .filter((id): id is string => !!id)}
                    // A record-store TABLE: a listed member may sit outside the table's own
                    // organization, so each one goes through the outside door, which grants an
                    // existing account outright whether inside or out.
                    {...(outsideShare
                      ? {
                          grantEveryonePerson: async (person, level) => {
                            try {
                              const answer = await shareWithOutsidePerson(
                                outsideShare.organizationId,
                                outsideShare.tableId,
                                person.email,
                                level,
                              );
                              return answer.granted
                                ? { success: true, message: answer.say }
                                : {
                                    success: false,
                                    error:
                                      answer.say ||
                                      "Invited, not yet given access",
                                  };
                            } catch (err: unknown) {
                              return {
                                success: false,
                                error:
                                  err instanceof Error
                                    ? err.message
                                    : "Not shared",
                              };
                            }
                          },
                        }
                      : {})}
                  />
                ) : (
                  manageBlockedNotice
                )}

                {/* THE ROUTE FROM THE REFUSAL TO THE REMEDY (lane SHARE-OUT).
                    The people picker above offers this organization's members
                    and nobody else, and the store refuses an outsider by name.
                    This is where that refusal now leads: one section, drawn only
                    for a table in the record store, showing exactly the controls
                    the store says this person may use. It is shown to non-owners
                    too — the panel itself says who can invite, which is more use
                    than hiding the fact that the capability exists. */}
                {outsideShare ? (
                  <OutsideSharePanel
                    organizationId={outsideShare.organizationId}
                    tableId={outsideShare.tableId}
                    tableName={resourceName}
                    onPendingChange={setOutsidePending}
                    onGranted={refresh}
                  />
                ) : null}
              </TabsContent>

              <TabsContent value="access" className="mt-0">
                <AccessSummaryPanel
                  entityType={resourceType as Parameters<typeof AccessSummaryPanel>[0]["entityType"]}
                  entityId={resourceId}
                  enabled={activeTab === "access"}
                  refreshToken={permissions
                    .map((p) => `${p.id}:${p.permissionLevel}`)
                    .join("|")}
                />
              </TabsContent>

              <TabsContent value="public" className="mt-0">
                <PublicAccessTab
                  isPublic={resourceIsPublic}
                  visibility={resourceVisibility}
                  onSetVisibility={setVisibility}
                  publicPermission={publicPermission}
                  isOwner={isOwner}
                  onMakePublic={makePublic}
                  onRevokePublic={() => revokeAccess({ isPublic: true })}
                  resourceType={resourceType}
                  resourceId={resourceId}
                  resourceName={resourceName}
                  offerOrganization={!isPersonalHome}
                />
              </TabsContent>
            </div>
          </Tabs>
        )}

        {error && (
          <div className="mt-3 p-2.5 bg-destructive/10 border border-destructive/20 rounded-md flex-shrink-0">
            <p className="text-sm text-destructive">{error}</p>
            <ErrorAlchemyMenu error={error} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
