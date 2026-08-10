"use client";

/**
 * OrgWorkspace — the organization home.
 *
 * Presents the org the way the knowledge system actually models it:
 *   - Context & Scopes — the org's user-defined dimensions (the heart of context)
 *   - Knowledge graph — the org-filtered entity/relationship view
 *   - Resources grouped by CONTENT ROLE (Utilities / Sources / Outputs / Workspaces)
 *   - Contribute — members share their own items with the team
 *   - Member contributions — admins review / reject what's been shared
 *
 * Counts and the resource grid are driven by the org resource catalogue, not a
 * hardcoded list, so adding a scopeable entity surfaces here automatically.
 *
 * Rendered by both `/organizations/[orgId]` (primary) and the legacy
 * `/organizations/[orgId]/org-2` alias. Resolves the org from the route param.
 */

import React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  ExternalLink,
  Users,
  Calendar,
  FolderTree,
  Plus,
  LayoutTemplate,
  ListChecks,
  Share2,
  Layers3,
  Boxes,
  ChevronRight,
  Info,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getOrganizationBySlugOrId,
  getUserRole,
  getOrganizationMembers,
} from "@/features/organizations/service";
import type { Organization, OrganizationMemberWithUser } from "@/features/organizations/types";
import { KgGraphCard } from "@/features/kg-graph/components/KgGraphCard";
import { format } from "date-fns";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { UserAvatarDisplay } from "@/components/user/UserIdentity";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopeTypes,
  selectScopeTypesByOrg,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  fetchScopes,
  selectScopesByOrg,
} from "@/features/agent-context/redux/scope/scopesSlice";
import { OrgHomeScopeSection } from "@/features/scope-system/components/OrgHomeScopeSection";
import { ScopeOnboarding } from "@/features/scope-system/components/ScopeOnboarding";
import { AddScopeModal } from "@/features/scope-system/components/AddScopeModal";
import { TemplateGalleryDrawer } from "@/features/scope-system/components/TemplateGalleryDrawer";
import {
  CONTENT_ROLES,
  entriesByRole,
  type OrgResourceEntry,
} from "@/features/organizations/resource-catalogue";
import { useOrgResourceInventory } from "@/features/organizations/hooks/useOrgResourceInventory";
import { OrgResourceRoleSection } from "@/features/organizations/components/OrgResourceRoleSection";
import { ContributeResourceSheet } from "@/features/organizations/components/ContributeResourceSheet";
import { OrgShareReviewCard } from "@/features/organizations/components/OrgShareReviewCard";
import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";
import { useScopeSuggestions } from "@/features/kg-suggestions/hooks/useScopeSuggestions";
import { KgSuggestionHint } from "@/features/kg-suggestions/components/KgSuggestionHint";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ORGANIZATIONS_SURFACE_NAME,
  createOrganizationsScope,
} from "@/features/surfaces/manifests/organizations.manifest";
import { OrgWorkspaceWriteTargets } from "@/features/organizations/components/OrgWorkspaceWriteTargets";

export function OrgWorkspace() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const orgId = params.orgId as string;

  const [organization, setOrganization] = React.useState<Organization | null>(null);
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const [members, setMembers] = React.useState<OrganizationMemberWithUser[]>(
    [],
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [addScopeOpen, setAddScopeOpen] = React.useState(false);
  const [galleryOpen, setGalleryOpen] = React.useState(false);
  const [contributeOpen, setContributeOpen] = React.useState(false);
  const [contributeKey, setContributeKey] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const org = await getOrganizationBySlugOrId(orgId);
        if (!org) {
          if (!cancelled) setError("Organization not found");
          return;
        }
        if (cancelled) return;
        setOrganization(org);
        const [role, orgMembers] = await Promise.all([
          getUserRole(org.id),
          getOrganizationMembers(org.id),
        ]);
        if (cancelled) return;
        setUserRole(role);
        setMembers(orgMembers);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to load organization";
        console.error("Error loading organization:", err);
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const scopeTypes = useAppSelector((s) =>
    selectScopeTypesByOrg(s, organization?.id ?? ""),
  );
  const orgScopes = useAppSelector((s) =>
    selectScopesByOrg(s, organization?.id ?? ""),
  );

  React.useEffect(() => {
    if (!organization?.id) return;
    dispatch(fetchScopeTypes(organization.id));
    dispatch(fetchScopes({ org_id: organization.id }));
  }, [dispatch, organization?.id]);

  // Canonical resource count = how many entities are attached to this org via
  // platform.associations (the org's incoming edges). Shares the SAME cached
  // fetch as every AssociationCard in the grid below.
  const orgLinks = useContainerLinks({
    containerType: "organization",
    containerId: organization?.id ?? null,
    orgId: organization?.id ?? null,
  });
  const totalResources = orgLinks.totalCount;
  const countsLoading =
    orgLinks.status === "loading" || orgLinks.status === "idle";

  // Legacy iam.permissions sharing inventory — feeds the "Resources by content
  // role" grid (OrgResourceRoleSection) + the contribute flow. Kept ALONGSIDE
  // the canonical association cards until the sharing surface is reconciled.
  const { counts: inventoryCounts, loading: inventoryLoading } =
    useOrgResourceInventory(organization?.id ?? null);

  const suggestions = useScopeSuggestions();
  const orgSuggestions = orgScopes.flatMap((sc) => suggestions.forScope(sc.id));

  const isAdmin = userRole === "owner" || userRole === "admin";

  function openContribute(entry?: OrgResourceEntry) {
    setContributeKey(entry?.key ?? null);
    setContributeOpen(true);
  }

  function handleOpenEntry(entry: OrgResourceEntry) {
    // Projects + Tasks are first-class containers with their own canonical
    // top-level homes; the org is a filtered view (?org=slug), not a parent.
    if (entry.key === "project") {
      router.push(`/projects?org=${slug}`);
      return;
    }
    if (entry.key === "task") {
      router.push(`/tasks?org=${slug}`);
      return;
    }
    // Every other kind has a consistent, catalogue-driven org page (team view +
    // share-your-own). The dedicated legacy route, when present, is linked from
    // there as "Full view".
    router.push(`/organizations/${slug}/resources/${entry.key}`);
  }

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-textured">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading workspace…</p>
        </div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="h-dvh flex items-center justify-center bg-textured p-4">
        <Card className="max-w-lg w-full p-8 text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Organization not found</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {error || "This organization doesn't exist or has been removed."}
          </p>
          <Button
            onClick={() => router.push("/organizations")}
            variant="outline"
            size="sm"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to organizations
          </Button>
        </Card>
      </div>
    );
  }

  const slug = organization.slug;
  const totalScopes = orgScopes.length;

  // ── Surface runtime (matrx-user/organizations, workspace mode) ─────────
  // Built at trigger time (the provider calls this only when the user runs an
  // agent), so it always reads the latest loaded workspace state. Plain
  // function, not a hook — it sits after the loading/error early returns.
  const getSurfaceScope = () =>
    createOrganizationsScope({
      current_view: "workspace",
      org_id: organization.id,
      org_slug: organization.slug,
      org_name: organization.name,
      org_abbreviation: organization.abbreviation,
      org_description: organization.description ?? undefined,
      org_website: organization.website ?? undefined,
      org_is_personal: organization.isPersonal,
      org_created_at: organization.createdAt,
      org_summary: {
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
        abbreviation: organization.abbreviation,
        description: organization.description ?? null,
        website: organization.website ?? null,
        is_personal: organization.isPersonal,
        created_at: organization.createdAt,
      },
      viewer_role: userRole ?? undefined,
      can_manage: userRole ? isAdmin : undefined,
      member_count: members.length,
      members_summary: members.map((m) => ({
        user_id: m.userId,
        email: m.user?.email ?? null,
        display_name: m.user?.displayName ?? null,
        role: m.role,
        joined_at: m.joinedAt,
      })),
      resource_total_count: countsLoading ? undefined : totalResources,
      resource_counts: inventoryLoading ? undefined : inventoryCounts,
      scope_type_count: scopeTypes.length,
      scope_count: orgScopes.length,
      scope_types_summary: scopeTypes.map((t) => ({
        id: t.id,
        label_singular: t.label_singular,
        label_plural: t.label_plural,
        description: t.description,
        scope_count: orgScopes.filter((s) => s.scope_type_id === t.id).length,
      })),
      selection: window.getSelection()?.toString() || undefined,
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName={ORGANIZATIONS_SURFACE_NAME}
      getScope={getSurfaceScope}
      isEditable={false}
    >
    {/* Write half of the surface — renders nothing, services the manifest's
        org-profile targets through the canonical updateOrganization service. */}
    <OrgWorkspaceWriteTargets
      organization={organization}
      canManage={isAdmin}
      onOrganizationUpdated={setOrganization}
    />
    <div className="h-dvh overflow-y-auto bg-textured">
      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-[var(--shell-header-h)] pb-12 space-y-5">
        {/* ─── Hero ─────────────────────────────────────────────────── */}
        <Card className="p-5 md:p-6 relative overflow-hidden">
          <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-sky-500 to-emerald-500" />
          <div className="flex flex-col md:flex-row md:items-start gap-5">
            {organization.logoUrl ? (
              <div className="flex-shrink-0 w-16 h-16 md:w-20 md:h-20">
                <InlineMediaRef
                  ref={organization.logoUrl}
                  size="fill"
                  fit="cover"
                  rounded="lg"
                  fallback={null}
                  className="border border-border shadow-sm"
                  alt={organization.name}
                />
              </div>
            ) : (
              <div className="flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 flex items-center justify-center text-white text-2xl font-bold">
                {organization.name?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                    {organization.name}
                  </h1>
                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    {organization.isPersonal && (
                      <Badge variant="secondary">Personal</Badge>
                    )}
                    {userRole && (
                      <Badge variant="outline" className="text-xs capitalize">
                        You: {userRole}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => openContribute()}>
                    <Share2 className="h-4 w-4 mr-1.5" />
                    Contribute
                  </Button>
                </div>
              </div>

              {organization.description && (
                <p className="text-sm text-muted-foreground leading-relaxed mt-3">
                  {organization.description}
                </p>
              )}

              {/* Stats + meta */}
              <div className="flex items-center gap-5 flex-wrap mt-4">
                {/* Each destination is one this page already navigates to
                    elsewhere — the counts just reach them directly now.
                    MEMBERS IS ADMIN-ONLY: `OrgManage` renders the `#members`
                    section behind `canManageMembers` (owner/admin), so for an
                    ordinary member the anchor would land on a settings page
                    with no member list — a door that does not reach. For them
                    the avatar row below IS the member list, so no door. */}
                <Stat
                  icon={<Users className="h-4 w-4" />}
                  value={members.length}
                  label={members.length === 1 ? "member" : "members"}
                  href={
                    isAdmin
                      ? `/organizations/${slug}/settings#members`
                      : undefined
                  }
                />
                <Stat
                  icon={<Layers3 className="h-4 w-4" />}
                  value={totalScopes}
                  label="scopes"
                  href={`/organizations/${slug}/scopes`}
                />
                {/* No href: `/organizations/[orgId]/resources` has only a
                    `[kind]` segment and NO index page, so a link here would
                    404. The per-kind cards below are the real doors. */}
                <Stat
                  icon={<Boxes className="h-4 w-4" />}
                  value={countsLoading ? "…" : totalResources}
                  label="resources"
                />
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {organization.createdAt
                    ? format(new Date(organization.createdAt), "PP")
                    : "Unknown"}
                </div>
                {organization.website && (
                  <a
                    href={organization.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Website
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Member avatars */}
          {members.length > 0 && (
            <div className="flex items-center gap-3 mt-5 pt-4 border-t border-border">
              <div className="flex -space-x-2">
                {members.slice(0, 8).map((member) => (
                  <MemberAvatar key={member.id} member={member} />
                ))}
              </div>
              {/* "+N more" reaches the full member list — but only for a
                  viewer who can actually see it (see the Stat note above). */}
              {members.length > 8 &&
                (isAdmin ? (
                  <Link
                    href={`/organizations/${slug}/settings#members`}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    +{members.length - 8} more
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    +{members.length - 8} more
                  </span>
                ))}
              {/* Was `?tab=members`, which the destination never reads — that
                  page is anchored SECTIONS (`#members`), not tabs, so the old
                  link silently landed at the top of settings. An anchor rather
                  than router.push so cmd/middle-click open a new tab. Rendered
                  only for a viewer the `#members` section actually exists for. */}
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-muted-foreground h-7"
                  asChild
                >
                  <Link href={`/organizations/${slug}/settings#members`}>
                    Members
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Link>
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* ─── Knowledge-graph suggestions ──────────────────────────── */}
        {orgSuggestions.length > 0 && (
          <KgSuggestionHint
            variant="banner"
            rows={orgSuggestions}
            accept={suggestions.accept}
            reject={suggestions.reject}
            defer={suggestions.defer}
            label={organization.name}
            align="start"
          />
        )}

        {/* ─── Knowledge graph (live preview card → full org-filtered graph) ── */}
        <KgGraphCard
          variant="org"
          id={organization.id}
          orgSlugOrId={slug}
          title={`${organization.name} · knowledge graph`}
        />

        {/* ─── Context & Scopes ─────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FolderTree className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              <h2 className="text-lg font-semibold">Context &amp; Scopes</h2>
            </div>
            {scopeTypes.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap justify-end">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                >
                  <Link href={`/organizations/${slug}/scopes`}>
                    <FolderTree className="h-4 w-4 mr-1.5" />
                    Scope Type Hub
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                >
                  <Link href={`/organizations/${slug}/context-items`}>
                    <ListChecks className="h-4 w-4 mr-1.5" />
                    Context items
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAddScopeOpen(true)}
                  className="text-muted-foreground"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Scope Type
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setGalleryOpen(true)}
                  className="text-muted-foreground"
                >
                  <LayoutTemplate className="h-4 w-4 mr-1.5" />
                  Templates
                </Button>
              </div>
            )}
          </div>

          {scopeTypes.length === 0 ? (
            <Card className="p-6 md:p-8">
              <ScopeOnboarding
                orgId={organization.id}
                isPersonal={organization.isPersonal ?? undefined}
                onChanged={() => {
                  dispatch(fetchScopeTypes(organization.id));
                  dispatch(fetchScopes({ org_id: organization.id }));
                }}
              />
            </Card>
          ) : (
            <div className="space-y-4">
              {scopeTypes.map((scopeType) => (
                <OrgHomeScopeSection
                  key={scopeType.id}
                  scopeType={scopeType}
                  orgId={organization.id}
                  orgSlugOrId={slug}
                />
              ))}
            </div>
          )}
        </div>

        {/* ─── Resources by content role (legacy iam.permissions sharing) ──
            The original role-bucketed grid (Utilities / Sources / Outputs /
            Workspaces) with the share-your-own contribute flow. KEPT alongside
            the canonical association grid below until the sharing surface is
            reconciled — do not remove without confirming. */}
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Resources</h2>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Grouped by what they do</span>
            </div>
          </div>

          {CONTENT_ROLES.map((role) => (
            <OrgResourceRoleSection
              key={role.id}
              role={role.id}
              entries={entriesByRole(role.id)}
              counts={inventoryCounts}
              loading={inventoryLoading}
              onOpen={handleOpenEntry}
              onContribute={openContribute}
            />
          ))}
        </div>

        {/* NOTE: the canonical association grid (AssociationCardGrid) lives on
            the scope-type and scope pages, where attaching things to a
            container is the actual job. The org overview shows the Resources
            grid above instead — one resource surface per page, not two. */}

        {/* ─── Member contributions (moderation) ────────────────────── */}
        <OrgShareReviewCard
          orgId={organization.id}
          isAdmin={isAdmin}
          members={members}
          refreshKey={refreshKey}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      </div>

      {/* Modals / sheets */}
      {organization?.id && (
        <>
          <ContributeResourceSheet
            open={contributeOpen}
            onOpenChange={setContributeOpen}
            orgId={organization.id}
            orgName={organization.name}
            initialEntryKey={contributeKey}
            onContributed={() => setRefreshKey((k) => k + 1)}
          />
          <AddScopeModal
            open={addScopeOpen}
            onOpenChange={setAddScopeOpen}
            orgId={organization.id}
          />
          <TemplateGalleryDrawer
            open={galleryOpen}
            onOpenChange={setGalleryOpen}
            orgId={organization.id}
            personalOnly={organization.isPersonal ? true : undefined}
          />
        </>
      )}
    </div>
    </SurfaceRuntimeProvider>
  );
}

/**
 * A COUNT IS A DOOR. Each of these squares counts real rows — members, scopes,
 * resources — and this page already knows where each set lives. Pass `href` and
 * the number becomes the way in; omit it only when no destination exists.
 */
function Stat({
  icon,
  value,
  label,
  href,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm font-semibold text-foreground tabular-nums">
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </>
  );
  if (!href) {
    return <div className="flex items-center gap-1.5">{body}</div>;
  }
  return (
    <Link
      href={href}
      title={`View ${label}`}
      className="flex items-center gap-1.5 rounded-md px-1 -mx-1 hover:bg-muted/60 hover:underline"
    >
      {body}
    </Link>
  );
}

function MemberAvatar({ member }: { member: OrganizationMemberWithUser }) {
  return (
    <UserAvatarDisplay
      user={member.user}
      size="sm"
      className="border-2 border-card"
    />
  );
}
