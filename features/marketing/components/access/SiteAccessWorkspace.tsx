"use client";

import { useState } from "react";
import { Building2, Circle, Globe, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsOwner, useSharing } from "@/utils/permissions/hooks";
import { PermissionsList } from "@/features/sharing/components/PermissionsList";
import { ShareWithUserTab } from "@/features/sharing/components/tabs/ShareWithUserTab";
import { ShareWithOrgTab } from "@/features/sharing/components/tabs/ShareWithOrgTab";
import { PublicAccessTab } from "@/features/sharing/components/tabs/PublicAccessTab";
import {
  AccessSummaryPanel,
  type AccessSummaryState,
} from "@/features/sharing/components/AccessSummaryPanel";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";
import {
  accessKpis,
  accessSummaryView,
  grantCsvRows,
  humanAccessPanel,
  humanNotices,
  sharingLocation,
  ACCESS_SUMMARY_ERROR_HEADLINE,
  GRANT_LIST_SCOPE_NOTE,
  type AccessNotice,
  type AccessPanelView,
  type SharingCopyContext,
} from "@/features/sharing/format";

type ShareSubTab = "users" | "organizations" | "public";

const SUB_TAB_LABEL: Record<ShareSubTab, string> = {
  users: "Users",
  organizations: "Organizations",
  public: "Public",
};

/** The notice this page renders when ownership resolves to "not you". */
const NOT_OWNER_NOTICE = "Only the site owner can change sharing.";

/**
 * Site-root sharing on the canonical permissions system — the same
 * ShareModal machinery every other entity uses, composed as a full-page
 * panel (precedent: AgentSharePanel). One grant on `web_site` conveys the
 * whole subtree (pages, crawls, snapshots, findings) via reachability.
 */
export function SiteAccessWorkspace() {
  const { site } = useMarketingSite();
  const [activeSubTab, setActiveSubTab] = useState<ShareSubTab>("users");

  const ownership = useIsOwner("web_site", site.id);
  const {
    permissions,
    isPublic: resourceIsPublic,
    loading,
    error,
    shareWithUser,
    shareWithOrg,
    makePublic,
    revokeAccess,
    updateLevel,
    refresh,
  } = useSharing("web_site", site.id, true);

  // Ownership has three states; only a resolved, error-free answer may
  // unlock (or hide) the grant controls.
  const isOwner = !ownership.loading && !ownership.error && ownership.isOwner;

  const userPermissions = permissions.filter((p) => p.grantedToUserId);
  const orgPermissions = permissions.filter((p) => p.grantedToOrganizationId);
  const publicPermission = permissions.find((p) => p.isPublic);

  // Every grant mutation refreshes `permissions`; this signature makes the
  // summary refetch in lockstep so the two can never contradict each other.
  const grantSignature = permissions
    .map((p) => `${p.id}:${p.permissionLevel}`)
    .concat(resourceIsPublic ? "public" : "not-public")
    .join("|");

  /*
   * The reachability answer the panel below is rendering, mirrored up here so
   * every payload from this page carries the same numbers the user is reading
   * — without paying for a second `entity_access_summary` round trip.
   */
  const [accessState, setAccessState] = useState<AccessSummaryState>({
    summary: null,
    error: null,
    loading: false,
  });

  /*
   * THE WHAT-I-SEE LAW. These are the numbers this page LEADS with: the tab
   * counts, the public dot, whether the viewer owns the site, and the
   * reachability answer. Every payload from this page — page, panel, list, and
   * row alike — carries them verbatim, in the body AND the envelope
   * attributes, because nothing here is interpretable without them.
   *
   * `viewer_is_owner` stays null while ownership is loading or errored:
   * "we don't know who owns this" is a different answer from "not you", and
   * collapsing them is the failure this page's own error notice exists to
   * prevent.
   */
  const kpis = accessKpis({
    permissions,
    isPublic: resourceIsPublic,
    viewerIsOwner:
      ownership.loading || ownership.error ? null : ownership.isOwner,
    summary: accessState.summary,
    entityType: "web_site",
  });

  const copyContext: SharingCopyContext = {
    resourceType: "web_site",
    resourceId: site.id,
    resourceName: site.name,
    surface: `Site access — ${site.domain}`,
    kpis,
  };
  const location = sharingLocation(copyContext.surface);

  /**
   * Every error / blocker / notice this page is rendering RIGHT NOW, captured
   * verbatim. Errors and denials are the highest-value content on an access
   * page: a user copying this is asking an agent "why can't this person see
   * this, and what do I change?" — a payload that dropped the red text while
   * dumping the grant rows would be answering a question nobody asked.
   */
  const renderedNotices = (): AccessNotice[] => {
    const notices: AccessNotice[] = [];
    if (ownership.error) {
      notices.push({
        tone: "error",
        where: "Ownership check",
        text: `Could not determine whether you own this site: ${ownership.error}`,
      });
    }
    if (!ownership.loading && !ownership.error && !isOwner) {
      notices.push({
        tone: "info",
        where: "Ownership notice",
        text: NOT_OWNER_NOTICE,
      });
    }
    if (accessState.error) {
      notices.push({
        tone: "error",
        where: "Access summary",
        text: `${ACCESS_SUMMARY_ERROR_HEADLINE}: ${accessState.error}`,
      });
    }
    if (error) {
      notices.push({ tone: "error", where: "Sharing", text: error });
    }
    return notices;
  };

  const panelView = (): AccessPanelView => ({
    resource: { type: "web_site", id: site.id, name: site.name },
    kpis,
    active_tab: SUB_TAB_LABEL[activeSubTab],
    notices: renderedNotices(),
    access_summary: accessState.summary
      ? accessSummaryView(accessState.summary, "web_site")
      : null,
    access_summary_error: accessState.error,
    user_grants: userPermissions,
    org_grants: orgPermissions,
    public_grant: publicPermission ?? null,
    is_public: resourceIsPublic,
    scope_note: GRANT_LIST_SCOPE_NOTE,
  });

  const pageHuman = () =>
    [
      `Site access — ${site.name} (${site.domain})`,
      `One grant shares this site and every page, crawl, snapshot, finding, and artifact beneath it.`,
      "",
      humanAccessPanel(panelView()),
    ].join("\n");

  /**
   * The focused variant: only what is blocking or explaining. This is the
   * half of the page a user shares when the question is "why is access wrong?"
   * — still carrying the page KPIs, because a shortened variant is lossy in
   * DATA, never in ambient context.
   */
  const blockersVariant = () => {
    const notices = renderedNotices();
    const view = panelView();
    return {
      kind: "site-access-blockers",
      location,
      description:
        "Only the errors, denials, and access-blocking notices rendered on the site access tab, plus the reachability answer needed to interpret them.",
      data: {
        resource: view.resource,
        kpis,
        notices,
        access_summary: view.access_summary,
        access_summary_error: view.access_summary_error,
        viewer_can_manage: isOwner,
        scope_note: GRANT_LIST_SCOPE_NOTE,
      },
      summary: [
        `Site access — ${site.name} (${site.domain})`,
        humanNotices(notices),
      ].join("\n"),
      attributes: {
        ...kpis,
        site_id: site.id,
        domain: site.domain,
        blockers: notices.filter((n) => n.tone === "error").length,
      },
    };
  };

  /** All grants across every tab — copy and export never see a partial set. */
  const allGrants = () => permissions;

  const subTabs: {
    id: ShareSubTab;
    label: string;
    icon: React.ElementType;
    count?: number;
  }[] = [
    {
      id: "users",
      label: "Users",
      icon: Users,
      count: userPermissions.length || undefined,
    },
    {
      id: "organizations",
      label: "Organizations",
      icon: Building2,
      count: orgPermissions.length || undefined,
    },
    { id: "public", label: "Public", icon: Globe },
  ];

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-textured">
      <div className="mx-auto flex h-full w-full max-w-3xl min-h-0 flex-col p-3 sm:p-4">
        <div className="mb-3 flex items-start gap-2 shrink-0">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold">Site access</h1>
            <p className="text-xs text-muted-foreground">
              One grant shares {site.name} and every page, crawl, snapshot,
              finding, and artifact beneath it.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <CopyButtons
              size="icon"
              label={`Site access (${site.domain})`}
              human={pageHuman}
              json={panelView}
              agent={() => ({
                kind: "site-access-page",
                location,
                description: `The site access tab for ${site.domain} exactly as rendered: who can reach this site and why, every direct grant, the public state, the tab on screen, and every error or blocking notice currently displayed.`,
                data: panelView(),
                summary: pageHuman(),
                attributes: {
                  ...kpis,
                  site_id: site.id,
                  domain: site.domain,
                  active_tab: SUB_TAB_LABEL[activeSubTab],
                },
              })}
              agentVariant={{
                id: "what-i-see",
                label: "This page (what I see)",
                hint: "Everything rendered: reachability, grants, public state, errors",
                position: "first",
              }}
              aiVariants={[
                {
                  id: "blockers",
                  label: "Errors & access blockers",
                  hint: "Only the red text and the reachability answer",
                  build: blockersVariant,
                },
              ]}
            />
            <ExportMenu
              label={`site-access-${site.domain}`}
              items={[
                jsonExportItem(panelView, "Page data (.json)"),
                csvExportItem(
                  () => grantCsvRows(allGrants()),
                  "CSV (all grants)",
                ),
              ]}
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card">
          <div className="flex items-end border-b border-border bg-muted/10 shrink-0">
            {subTabs.map((tab) => {
              const Icon = tab.icon as React.FC<React.SVGProps<SVGSVGElement>>;
              const isActive = tab.id === activeSubTab;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-all duration-150 shrink-0",
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/40",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {tab.count != null && tab.count > 0 && (
                    <span className="px-1 py-0.5 text-[10px] bg-primary/10 rounded-full leading-none">
                      {tab.count}
                    </span>
                  )}
                  {tab.id === "public" && publicPermission && (
                    <Circle className="h-1.5 w-1.5 fill-emerald-500 text-emerald-500" />
                  )}
                </button>
              );
            })}
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {/*
               * The truthful summary — direct grants below are only ONE of
               * the ways this site is reachable; this lists all of them.
               */}
              <AccessSummaryPanel
                entityType="web_site"
                entityId={site.id}
                refreshToken={grantSignature}
                className="px-0 pt-0 border-b border-border/40 pb-3"
                copy={copyContext}
                onSummaryChange={setAccessState}
              />

              {ownership.error && (
                <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded-md">
                  <p className="text-xs text-destructive">
                    Could not determine whether you own this site:{" "}
                    {ownership.error}
                  </p>
                </div>
              )}
              {!ownership.loading && !ownership.error && !isOwner && (
                <p className="text-xs text-muted-foreground">
                  {NOT_OWNER_NOTICE}
                </p>
              )}

              {activeSubTab === "users" && (
                <>
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Current Access
                    </h3>
                    <PermissionsList
                      permissions={userPermissions}
                      isOwner={isOwner}
                      onUpdateLevel={updateLevel}
                      onRevoke={revokeAccess}
                      loading={loading}
                      copy={copyContext}
                      listLabel="Users"
                    />
                  </div>
                  {isOwner && (
                    <ShareWithUserTab
                      onShare={shareWithUser}
                      onSuccess={refresh}
                      resourceType="web_site"
                      resourceId={site.id}
                      copy={copyContext}
                    />
                  )}
                </>
              )}

              {activeSubTab === "organizations" && (
                <>
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Current Access
                    </h3>
                    <PermissionsList
                      permissions={orgPermissions}
                      isOwner={isOwner}
                      onUpdateLevel={updateLevel}
                      onRevoke={revokeAccess}
                      loading={loading}
                      copy={copyContext}
                      listLabel="Organizations"
                    />
                  </div>
                  {isOwner && (
                    <ShareWithOrgTab
                      onShare={shareWithOrg}
                      onSuccess={refresh}
                      resourceType="web_site"
                      sharedOrgIds={orgPermissions
                        .map((p) => p.grantedToOrganizationId)
                        .filter((id): id is string => !!id)}
                      copy={copyContext}
                    />
                  )}
                </>
              )}

              {activeSubTab === "public" && (
                <PublicAccessTab
                  isPublic={resourceIsPublic}
                  publicPermission={publicPermission}
                  isOwner={isOwner}
                  onMakePublic={makePublic}
                  onRevokePublic={() => revokeAccess({ isPublic: true })}
                  resourceType="web_site"
                  resourceId={site.id}
                  resourceName={site.name}
                  copy={copyContext}
                />
              )}

              {error && (
                <div className="group p-2.5 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-2">
                  <p className="flex-1 text-xs text-destructive">{error}</p>
                  {/* The page's own sharing error — copied verbatim, with the
                      full access picture around it so an agent can say what to
                      change, not just what broke. */}
                  <span className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <CopyButtons
                      size="xs"
                      label="Site access error"
                      human={() =>
                        [
                          `Site access error on ${site.name} (${site.domain}):`,
                          error,
                          "",
                          humanAccessPanel(panelView()),
                        ].join("\n")
                      }
                      json={() => ({ error, ...panelView() })}
                      agent={blockersVariant}
                    />
                  </span>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </main>
  );
}
