"use client";

/**
 * ProjectManage — single-page, sectioned project settings at
 * /projects/[projectId]/settings. Models the polished OrgManage aesthetic: an
 * identity header, then the editable General form (no section chrome — fields
 * autosave in place), a Details card (ids / slug / created), Scopes, Members,
 * Invitations, and Danger — each gated by role. Resolves the project by slug or
 * UUID.
 */

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Users,
  Mail,
  AlertTriangle,
  Tag,
  Info,
  Database,
  FolderKanban,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/utils/supabase/client";
import { getProject } from "@/features/projects/service";
import { useProjectUserRole } from "@/features/projects/hooks";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
import { ProjectContextSection } from "./ProjectContextSection";
import type { Project } from "@/features/projects/types";
import { GeneralSettings } from "./GeneralSettings";
import { ProjectDetails } from "./ProjectDetails";
import { ProjectReferencesPanel } from "./ProjectReferencesPanel";
import { MemberManagement } from "./MemberManagement";
import { InvitationManager } from "./InvitationManager";
import { DangerZone } from "./DangerZone";
import { ProjectCopyForAiButton } from "./ProjectCopyForAiButton";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const { role, isOwner, canManageMembers, canManageSettings, canDelete } =
    useProjectUserRole(project?.id);

  const applyPatch = (patch: Partial<Project>) =>
    setProject((prev) => (prev ? { ...prev, ...patch } : prev));

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/projects")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> All projects
          </Button>
        </Card>
      </Center>
    );
  }

  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-x-hidden overflow-y-auto bg-textured">
      <div className="mx-auto min-w-0 max-w-5xl space-y-5 p-4 pr-14 md:p-6 md:pr-6">
        {/* Top actions */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="text-muted-foreground -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <ProjectCopyForAiButton
              projectId={project.id}
              projectName={project.name}
              location="Projects — project settings"
            />
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/projects/${project.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Open workspace
              </Link>
            </Button>
          </div>
        </div>

        {/* Identity header */}
        <Card className="p-5 relative overflow-hidden">
          <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-sky-500 to-emerald-500" />
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 text-white">
              <FolderKanban className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-foreground truncate">
                Manage project
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground truncate">
                {project.name}
              </p>
            </div>
          </div>
        </Card>

        {!canManageSettings && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              View-only access. Contact a project admin to make changes.
            </p>
          </div>
        )}

        {/* General — editable form, no section header chrome */}
        <Card className="min-w-0 overflow-hidden p-5">
          <GeneralSettings
            project={project}
            canEdit={canManageSettings}
            userRole={role}
            onPatch={applyPatch}
          />
        </Card>

        {/* Details — ids, slug, created (copyable) */}
        <ManageSection
          icon={<Info className="h-4 w-4" />}
          title="Details"
          subtitle="Identifiers and timestamps for this project."
        >
          <ProjectDetails project={project} />
        </ManageSection>

        {/* Scopes */}
        <ManageSection
          icon={<Tag className="h-4 w-4" />}
          title="Scopes"
          subtitle="Tag this project with the org's scopes."
        >
          <ProjectContextSection
            project={project}
            onPatch={applyPatch}
            sectionHeight={280}
            className="border-0 shadow-none"
          />
        </ManageSection>

        {/* Members */}
        {canManageMembers && (
          <ManageSection
            icon={<Users className="h-4 w-4" />}
            title="Members"
            subtitle="Who's on the project and what they can do."
          >
            <MemberManagement
              projectId={project.id}
              userRole={role}
              isOwner={isOwner}
            />
          </ManageSection>
        )}

        {/* Invitations */}
        {canManageSettings && (
          <ManageSection
            icon={<Mail className="h-4 w-4" />}
            title="Invitations"
            subtitle="Invite people by email and manage pending invites."
          >
            <InvitationManager
              projectId={project.id}
              projectName={project.name}
              userRole={role}
            />
          </ManageSection>
        )}

        {/* References — honest audit of every table that references this project */}
        <ManageSection
          icon={<Database className="h-4 w-4" />}
          title="References"
          subtitle="Every table in the database that references this project."
        >
          <ProjectReferencesPanel projectId={project.id} embedded />
        </ManageSection>

        {/* Danger zone */}
        {canDelete && (
          <ManageSection
            icon={
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            }
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
    <Card
      className={`p-5 ${danger ? "border-red-200 dark:border-red-900/50" : ""}`}
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            danger
              ? "bg-red-500/10 text-red-600 dark:text-red-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {icon}
        </span>
        <div>
          <h2
            className={`text-base font-semibold leading-tight ${
              danger ? "text-red-700 dark:text-red-400" : ""
            }`}
          >
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
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
