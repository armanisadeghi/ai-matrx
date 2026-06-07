"use client";

/**
 * ProjectManage — single-page, sectioned project settings at
 * /projects/[projectId]/settings. Mirrors OrgManage (no tabs): General, Scopes,
 * Members, Invitations, Danger — each a Card, gated by role. Reuses the existing
 * GeneralSettings / MemberManagement / InvitationManager / DangerZone +
 * EntityScopeTagger (scope association). Resolves the project by slug or UUID.
 */

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Settings,
  Users,
  Mail,
  AlertTriangle,
  Tag,
  FolderKanban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/utils/supabase/client";
import { getProject } from "@/features/projects/service";
import { useProjectUserRole } from "@/features/projects/hooks";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
import { EntityScopeTagger } from "@/features/scopes/components/entity-context/EntityScopeTagger";
import type { Project } from "@/features/projects/types";
import { GeneralSettings } from "./GeneralSettings";
import { MemberManagement } from "./MemberManagement";
import { InvitationManager } from "./InvitationManager";
import { DangerZone } from "./DangerZone";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ProjectManage() {
  const params = useParams();
  const router = useRouter();
  const projectParam = params.projectId as string;

  const [project, setProject] = React.useState<Project | null>(null);
  const [resolving, setResolving] = React.useState(true);
  const [orgSlug, setOrgSlug] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setResolving(true);
      let resolved: Project | null = null;
      if (UUID_RE.test(projectParam)) {
        resolved = await getProject(projectParam);
      } else {
        const { data } = await supabase
          .from("ctx_projects")
          .select("id")
          .eq("slug", projectParam)
          .limit(1)
          .maybeSingle();
        const id = (data as { id?: string } | null)?.id;
        if (id) resolved = await getProject(id);
      }
      if (cancelled) return;
      setProject(resolved);
      setResolving(false);
      if (resolved?.organizationId) {
        const o = await getOrganizationBySlugOrId(resolved.organizationId);
        if (!cancelled && o) setOrgSlug(o.slug);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectParam]);

  const { role, isOwner, isAdmin, canManageMembers, canManageSettings, canDelete } =
    useProjectUserRole(project?.id);

  if (resolving) {
    return (
      <Center>
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </Center>
    );
  }

  if (!project || !role) {
    return (
      <Center>
        <Card className="max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <FolderKanban className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Project not found</h2>
          <p className="text-sm text-muted-foreground mb-6">
            This project doesn&apos;t exist or you don&apos;t have access.
          </p>
          <Button variant="outline" size="sm" onClick={() => router.push("/projects")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> All projects
          </Button>
        </Card>
      </Center>
    );
  }

  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-5 pr-14 md:pr-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/projects/${project.id}`)}
            className="text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to project
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${project.id}`}>Open workspace</Link>
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-foreground">Manage project</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{project.name}</p>
        </div>

        <ManageSection icon={<Settings className="h-4 w-4" />} title="General">
          <GeneralSettings project={project} canEdit={canManageSettings} userRole={role} />
        </ManageSection>

        <ManageSection icon={<Tag className="h-4 w-4" />} title="Scopes" subtitle="Tag this project with the org's scopes">
          <EntityScopeTagger
            entityType="project"
            entityId={project.id}
            organizationId={project.organizationId}
          />
        </ManageSection>

        {canManageMembers && (
          <ManageSection icon={<Users className="h-4 w-4" />} title="Members">
            <MemberManagement projectId={project.id} userRole={role} isOwner={isOwner} />
          </ManageSection>
        )}

        {canManageSettings && (
          <ManageSection icon={<Mail className="h-4 w-4" />} title="Invitations">
            <InvitationManager
              projectId={project.id}
              projectName={project.name}
              userRole={role}
            />
          </ManageSection>
        )}

        {canDelete && (
          <ManageSection
            icon={<AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />}
            title="Danger zone"
            danger
          >
            <DangerZone project={project} orgSlug={orgSlug} />
          </ManageSection>
        )}
      </div>
    </div>
  );
}

function ManageSection({
  icon,
  title,
  subtitle,
  danger,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={`p-5 ${danger ? "border-red-200 dark:border-red-900/50" : ""}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className={danger ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>
          {icon}
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </Card>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex items-center justify-center bg-textured p-4">
      {children}
    </div>
  );
}
