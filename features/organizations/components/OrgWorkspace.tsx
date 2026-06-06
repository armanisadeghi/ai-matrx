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
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  ExternalLink,
  Users,
  Calendar,
  Settings,
  FolderTree,
  Plus,
  LayoutTemplate,
  Network,
  Share2,
  Layers3,
  Boxes,
  ChevronRight,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getOrganizationBySlugOrId,
  getUserRole,
  getOrganizationMembers,
} from "@/features/organizations/service";
import type { OrganizationMemberWithUser } from "@/features/organizations/types";
import { format } from "date-fns";
import { InlineMediaRef } from "@/features/files";
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

export function OrgWorkspace() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const orgId = params.orgId as string;

  const [organization, setOrganization] = React.useState<any>(null);
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const [members, setMembers] = React.useState<OrganizationMemberWithUser[]>([]);
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
        const msg = err instanceof Error ? err.message : "Failed to load organization";
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

  const { counts, loading: countsLoading } = useOrgResourceInventory(
    organization?.id ?? null,
  );

  const isAdmin = userRole === "owner" || userRole === "admin";

  const totalResources = React.useMemo(
    () =>
      Object.values(counts).reduce<number>(
        (sum, c) => sum + (typeof c === "number" ? c : 0),
        0,
      ),
    [counts],
  );

  function openContribute(entry?: OrgResourceEntry) {
    setContributeKey(entry?.key ?? null);
    setContributeOpen(true);
  }

  function handleOpenEntry(entry: OrgResourceEntry) {
    // Every kind has a consistent, catalogue-driven org page (team view +
    // share-your-own). The dedicated legacy route, when present, is linked from
    // there as "Full view".
    router.push(`/organizations/${slug}/resources/${entry.key}`);
  }

  if (loading) {
    return (
      <div className="h-[calc(100dvh-var(--header-height))] flex items-center justify-center bg-textured">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading workspace…</p>
        </div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="h-[calc(100dvh-var(--header-height))] flex items-center justify-center bg-textured p-4">
        <Card className="max-w-lg w-full p-8 text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Organization not found</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {error || "This organization doesn't exist or has been removed."}
          </p>
          <Button onClick={() => router.push("/organizations")} variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to organizations
          </Button>
        </Card>
      </div>
    );
  }

  const slug = organization.slug as string;
  const totalScopes = orgScopes.length;

  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5 pr-14 md:pr-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

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
                    {organization.isPersonal && <Badge variant="secondary">Personal</Badge>}
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
                  {userRole && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/organizations/${slug}/settings`)}
                    >
                      <Settings className="h-4 w-4 mr-1.5" />
                      Manage
                    </Button>
                  )}
                </div>
              </div>

              {organization.description && (
                <p className="text-sm text-muted-foreground leading-relaxed mt-3">
                  {organization.description}
                </p>
              )}

              {/* Stats + meta */}
              <div className="flex items-center gap-5 flex-wrap mt-4">
                <Stat icon={<Users className="h-4 w-4" />} value={members.length} label={members.length === 1 ? "member" : "members"} />
                <Stat icon={<Layers3 className="h-4 w-4" />} value={totalScopes} label="scopes" />
                <Stat icon={<Boxes className="h-4 w-4" />} value={countsLoading ? "…" : totalResources} label="resources" />
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
              {members.length > 8 && (
                <span className="text-xs text-muted-foreground">
                  +{members.length - 8} more
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-muted-foreground h-7"
                onClick={() => router.push(`/organizations/${slug}/settings?tab=members`)}
              >
                Members
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}
        </Card>

        {/* ─── Knowledge graph CTA ──────────────────────────────────── */}
        <button
          onClick={() => router.push(`/knowledge-graph?org=${encodeURIComponent(slug)}`)}
          className="w-full text-left rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-accent/40 transition-all p-5 flex items-center gap-4 group"
        >
          <span className="h-12 w-12 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Network className="h-6 w-6" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground">Knowledge graph</h2>
            <p className="text-sm text-muted-foreground">
              Explore the entities and relationships extracted across {organization.name}&apos;s content.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
        </button>

        {/* ─── Context & Scopes ─────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FolderTree className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              <h2 className="text-lg font-semibold">Context &amp; Scopes</h2>
            </div>
            {scopeTypes.length > 0 && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setAddScopeOpen(true)} className="text-muted-foreground">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add scope
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setGalleryOpen(true)} className="text-muted-foreground">
                  <LayoutTemplate className="h-4 w-4 mr-1.5" />
                  Templates
                </Button>
              </div>
            )}
          </div>

          {scopeTypes.length === 0 ? (
            <Card className="p-6 space-y-4">
              <div className="flex items-start gap-4">
                <div className="text-sky-600 dark:text-sky-400 shrink-0">
                  <FolderTree className="h-7 w-7" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold mb-1">Set up your scopes</h3>
                  <p className="text-sm text-muted-foreground">
                    Scopes are the dimensions your team works across — clients, departments,
                    cases, products, anything. They are the most important part of the context
                    your agents receive. Define a few and they show up here with all their details.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Button size="sm" onClick={() => setAddScopeOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add a scope
                </Button>
                <Button size="sm" variant="outline" onClick={() => setGalleryOpen(true)}>
                  <LayoutTemplate className="h-4 w-4 mr-1.5" />
                  Browse templates
                </Button>
              </div>
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

        {/* ─── Resources by content role ────────────────────────────── */}
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
              counts={counts}
              loading={countsLoading}
              onOpen={handleOpenEntry}
              onContribute={openContribute}
            />
          ))}
        </div>

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
          <AddScopeModal open={addScopeOpen} onOpenChange={setAddScopeOpen} orgId={organization.id} />
          <TemplateGalleryDrawer
            open={galleryOpen}
            onOpenChange={setGalleryOpen}
            orgId={organization.id}
            personalOnly={organization.isPersonal ? true : undefined}
          />
        </>
      )}
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm font-semibold text-foreground tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function MemberAvatar({ member }: { member: OrganizationMemberWithUser }) {
  if (member.user?.avatarUrl) {
    return (
      <span className="relative block h-8 w-8 rounded-full border-2 border-card overflow-hidden">
        <Image
          src={member.user.avatarUrl}
          alt={member.user.displayName || member.user.email || "Member"}
          fill
          className="object-cover"
          sizes="32px"
        />
      </span>
    );
  }
  return (
    <span
      className="h-8 w-8 rounded-full border-2 border-card bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center text-white text-xs font-semibold"
      title={member.user?.displayName || member.user?.email || "Member"}
    >
      {member.user?.displayName?.[0]?.toUpperCase() ||
        member.user?.email?.[0]?.toUpperCase() ||
        "?"}
    </span>
  );
}
