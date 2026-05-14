"use client";

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
  FolderOpen,
  ListTodo,
  Table,
  Workflow,
  ClipboardType,
  Puzzle,
  SquareFunction,
  Zap,
  FolderTree,
  Plus,
  LayoutTemplate,
} from "lucide-react";
import { FaIndent } from "react-icons/fa6";
import { LuNotepadText } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getOrganizationBySlugOrId,
  getUserRole,
  getOrganizationMembers,
} from "@/features/organizations/service";
import { getOrgProjects } from "@/features/projects/service";
import type { OrganizationMemberWithUser } from "@/features/organizations/types";
import { format } from "date-fns";
import { InlineMediaRef } from "@/features/files";
import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";
import { countOrgSharedResources } from "@/utils/permissions/orgResources";
import { supabase } from "@/utils/supabase/client";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopeTypes,
  selectScopeTypesByOrg,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import { fetchScopes } from "@/features/agent-context/redux/scope/scopesSlice";
import { OrgHomeScopeSection } from "@/features/scope-system/components/OrgHomeScopeSection";
import { AddScopeModal } from "@/features/scope-system/components/AddScopeModal";
import { TemplateGalleryDrawer } from "@/features/scope-system/components/TemplateGalleryDrawer";

export default function OrganizationOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;

  const [organization, setOrganization] = React.useState<any>(null);
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const [members, setMembers] = React.useState<OrganizationMemberWithUser[]>(
    [],
  );
  const [projectCount, setProjectCount] = React.useState<number | null>(null);
  const [notesCount, setNotesCount] = React.useState<number | null>(null);
  const [agentsCount, setAgentsCount] = React.useState<number | null>(null);
  const [tasksCount, setTasksCount] = React.useState<number | null>(null);
  const [tablesCount, setTablesCount] = React.useState<number | null>(null);
  const [filesCount, setFilesCount] = React.useState<number | null>(null);
  const [agentAppsCount, setAgentAppsCount] = React.useState<number | null>(null);
  const [templatesCount, setTemplatesCount] = React.useState<number | null>(null);
  const [workflowsCount, setWorkflowsCount] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function loadOrganization() {
      try {
        setLoading(true);
        setError(null);

        const org = await getOrganizationBySlugOrId(orgId);
        if (!org) {
          setError("Organization not found");
          return;
        }
        setOrganization(org);

        const role = await getUserRole(org.id);
        setUserRole(role);

        const orgMembers = await getOrganizationMembers(org.id);
        setMembers(orgMembers);

        const orgProjects = await getOrgProjects(org.id);
        setProjectCount(orgProjects.length);

        const [
          notesOwned,
          notesShared,
          agentsOwned,
          agentsShared,
          tasksOwned,
          tasksShared,
          datasetsOwned,
          datasetsShared,
          filesOwned,
          filesShared,
          agentAppsOwned,
          agentAppsShared,
          templatesOwned,
          templatesShared,
          workflowsOwned,
          workflowsShared,
        ] = await Promise.all([
          supabase
            .from("notes")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", org.id),
          countOrgSharedResources(org.id, "note"),
          supabase
            .from("agx_agent")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", org.id)
            .eq("is_archived", false),
          countOrgSharedResources(org.id, "agent"),
          supabase
            .from("ctx_tasks")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", org.id),
          countOrgSharedResources(org.id, "task"),
          supabase
            .from("udt_datasets")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", org.id),
          countOrgSharedResources(org.id, "udt_datasets"),
          supabase
            .from("user_files")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", org.id),
          countOrgSharedResources(org.id, "user_files"),
          supabase
            .from("aga_apps")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", org.id),
          countOrgSharedResources(org.id, "agent_app"),
          supabase
            .from("content_template")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", org.id),
          countOrgSharedResources(org.id, "content_template"),
          supabase
            .from("workflow")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", org.id),
          countOrgSharedResources(org.id, "workflow"),
        ]);

        setNotesCount((notesOwned.count ?? 0) + notesShared);
        setAgentsCount((agentsOwned.count ?? 0) + agentsShared);
        setTasksCount((tasksOwned.count ?? 0) + tasksShared);
        setTablesCount((datasetsOwned.count ?? 0) + datasetsShared);
        setFilesCount((filesOwned.count ?? 0) + filesShared);
        setAgentAppsCount((agentAppsOwned.count ?? 0) + agentAppsShared);
        setTemplatesCount((templatesOwned.count ?? 0) + templatesShared);
        setWorkflowsCount((workflowsOwned.count ?? 0) + workflowsShared);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to load organization";
        console.error("Error loading organization:", err);
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    loadOrganization();
  }, [orgId]);

  const { shortcuts: orgShortcuts } = useAgentShortcuts({
    scope: "organization",
    scopeId: organization?.id,
    autoFetch: Boolean(organization?.id),
  });

  const dispatch = useAppDispatch();
  const scopeTypes = useAppSelector((s) =>
    selectScopeTypesByOrg(s, organization?.id ?? ""),
  );
  const [addScopeOpen, setAddScopeOpen] = React.useState(false);
  const [galleryOpen, setGalleryOpen] = React.useState(false);

  React.useEffect(() => {
    if (!organization?.id) return;
    dispatch(fetchScopeTypes(organization.id));
    dispatch(fetchScopes({ org_id: organization.id }));
  }, [dispatch, organization?.id]);

  function openAddScope() {
    setAddScopeOpen(true);
  }
  function openTemplateGallery() {
    setGalleryOpen(true);
  }

  if (loading) {
    return (
      <div className="h-[calc(100dvh-var(--header-height))] flex items-center justify-center bg-textured">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading organization…</p>
        </div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="h-[calc(100dvh-var(--header-height))] flex items-center justify-center bg-textured p-4">
        <Card className="max-w-lg w-full p-8 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-xl font-semibold text-red-900 dark:text-red-100 mb-2">
              Organization Not Found
            </h2>
            <p className="text-sm text-red-700 dark:text-red-300 mb-6">
              {error || "This organization doesn't exist or has been removed."}
            </p>
            <Button
              onClick={() => router.push("/organizations")}
              variant="outline"
              size="sm"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Organizations
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const slug = organization.slug as string;

  const sharedResources: Array<{
    name: string;
    icon: React.ReactNode;
    href: string;
    color: string;
    count: number | null;
  }> = [
    {
      name: "Agents",
      icon: <FaIndent className="h-5 w-5" />,
      href: `/organizations/${slug}/prompts`,
      color: "text-teal-600 dark:text-teal-400",
      count: agentsCount,
    },
    {
      name: "Agent Apps",
      icon: <SquareFunction className="h-5 w-5" />,
      href: `/organizations/${slug}/agent-apps`,
      color: "text-rose-600 dark:text-rose-400",
      count: agentAppsCount,
    },
    {
      name: "Agent Shortcuts",
      icon: <Zap className="h-5 w-5" />,
      href: `/organizations/${slug}/shortcuts`,
      color: "text-amber-600 dark:text-amber-400",
      count: orgShortcuts.length,
    },
    {
      name: "Content Templates",
      icon: <ClipboardType className="h-5 w-5" />,
      href: `/organizations/${slug}/templates`,
      color: "text-purple-600 dark:text-purple-400",
      count: templatesCount,
    },
    {
      name: "Notes",
      icon: <LuNotepadText className="h-5 w-5" />,
      href: `/organizations/${slug}/notes`,
      color: "text-amber-600 dark:text-amber-400",
      count: notesCount,
    },
    {
      name: "Files",
      icon: <FolderOpen className="h-5 w-5" />,
      href: `/organizations/${slug}/files`,
      color: "text-blue-600 dark:text-blue-400",
      count: filesCount,
    },
    {
      name: "Projects",
      icon: <Puzzle className="h-5 w-5" />,
      href: `/organizations/${slug}/projects`,
      color: "text-indigo-600 dark:text-indigo-400",
      count: projectCount,
    },
    {
      name: "Tasks",
      icon: <ListTodo className="h-5 w-5" />,
      href: `/organizations/${slug}/tasks`,
      color: "text-green-600 dark:text-green-400",
      count: tasksCount,
    },
    {
      name: "Tables",
      icon: <Table className="h-5 w-5" />,
      href: `/organizations/${slug}/tables`,
      color: "text-cyan-600 dark:text-cyan-400",
      count: tablesCount,
    },
    {
      name: "Workflows",
      icon: <Workflow className="h-5 w-5" />,
      href: `/organizations/${slug}/workflows`,
      color: "text-violet-600 dark:text-violet-400",
      count: workflowsCount,
    },
  ];

  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/organizations")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          All Organizations
        </Button>

        {/* Organization Header Card */}
        <Card className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start gap-6">
            {organization.logoUrl && (
              <div className="flex-shrink-0 w-20 h-20 md:w-24 md:h-24">
                <InlineMediaRef
                  ref={organization.logoUrl}
                  size="fill"
                  fit="cover"
                  rounded="lg"
                  fallback={null}
                  className="border-2 border-border shadow-sm"
                  alt={organization.name}
                />
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                    {organization.name}
                  </h1>
                  <div className="flex items-center gap-2 flex-wrap">
                    {organization.isPersonal && (
                      <Badge variant="secondary">Personal</Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      <Users className="h-3 w-3 mr-1" />
                      {members.length}{" "}
                      {members.length === 1 ? "member" : "members"}
                    </Badge>
                  </div>
                </div>
                {userRole && (
                  <Button
                    onClick={() =>
                      router.push(`/organizations/${slug}/settings`)
                    }
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Manage
                  </Button>
                )}
              </div>

              {organization.description && (
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                  {organization.description}
                </p>
              )}

              <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Created{" "}
                  {organization.createdAt
                    ? format(new Date(organization.createdAt), "PP")
                    : "Unknown"}
                </div>
                {organization.website && (
                  <a
                    href={organization.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Website
                  </a>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Members Section */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Members</h2>
              <Badge variant="secondary" className="text-xs">
                {members.length}
              </Badge>
            </div>
            {userRole && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  router.push(`/organizations/${slug}/settings?tab=members`)
                }
              >
                View All
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {members.slice(0, 6).map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                {member.user?.avatarUrl ? (
                  <span className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-border">
                    <Image
                      src={member.user.avatarUrl}
                      alt={
                        member.user.displayName || member.user.email || "Member"
                      }
                      fill
                      className="object-cover"
                      sizes="40px"
                      loading="eager"
                      priority
                    />
                  </span>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                    {member.user?.displayName?.[0]?.toUpperCase() ||
                      member.user?.email?.[0]?.toUpperCase() ||
                      "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {member.user?.displayName || member.user?.email}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {member.role}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {members.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No members found
            </p>
          )}
        </Card>

        {/* Shared Resources Section */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Shared Resources</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {sharedResources.map((resource) => (
              <button
                key={resource.name}
                onClick={() => router.push(resource.href)}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all group cursor-pointer"
              >
                <div
                  className={`${resource.color} transition-transform group-hover:scale-110`}
                >
                  {resource.icon}
                </div>
                <span className="text-sm font-medium text-center">
                  {resource.name}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {resource.count !== null
                    ? `${resource.count} ${resource.count === 1 ? "item" : "items"}`
                    : "Coming Soon"}
                </Badge>
              </button>
            ))}
          </div>
        </Card>

        {/* Scopes */}
        {scopeTypes.length === 0 ? (
          <Card className="p-6 md:p-8 space-y-4">
            <div className="flex items-start gap-4">
              <div className="text-sky-600 dark:text-sky-400 shrink-0">
                <FolderTree className="h-7 w-7" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold mb-1">
                  Set up your scopes
                </h2>
                <p className="text-sm text-muted-foreground">
                  Scopes group what your team works on — clients, products,
                  teams, anything. Define a few and they’ll show up here with
                  all their details.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <Button size="sm" onClick={openAddScope}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add a scope
              </Button>
              <Button size="sm" variant="outline" onClick={openTemplateGallery}>
                <LayoutTemplate className="h-4 w-4 mr-1.5" />
                Browse templates
              </Button>
            </div>
          </Card>
        ) : (
          <>
            {scopeTypes.map((scopeType) => (
              <OrgHomeScopeSection
                key={scopeType.id}
                scopeType={scopeType}
                orgId={organization.id}
                orgSlugOrId={slug}
              />
            ))}

            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={openAddScope}
                className="text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add scope
              </Button>
              <span className="text-muted-foreground/50">·</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={openTemplateGallery}
                className="text-muted-foreground hover:text-foreground"
              >
                <LayoutTemplate className="h-4 w-4 mr-1.5" />
                Add from template
              </Button>
            </div>
          </>
        )}

        {organization?.id && (
          <>
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
    </div>
  );
}
