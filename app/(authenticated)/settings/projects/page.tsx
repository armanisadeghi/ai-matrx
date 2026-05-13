"use client";

import React, { useState, useMemo } from "react";
import {
  Puzzle,
  Search,
  Loader2,
  Crown,
  Shield,
  User as UserIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { useUserProjects } from "@/features/projects/hooks";
import type { ProjectWithRole } from "@/features/projects/types";
import { cn } from "@/lib/utils";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import { filterAndSortBySearch } from "@/utils/search-scoring";

/**
 * User Projects Settings Page
 * Route: /settings/projects
 *
 * Lists all projects the user is a member of, across all organizations.
 */
export default function SettingsProjectsPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const { projects, loading, error, refresh } = useUserProjects();
  // Pull org slugs from the nav tree — same source as `projects` — to avoid a
  // race where a parallel `useUserOrganizations()` query is still loading and
  // org projects get misrouted to the personal `/projects/[id]` route.
  const { orgs } = useNavTree();

  const orgSlugById = useMemo(
    () => new Map(orgs.map((o) => [o.id, o.slug])),
    [orgs],
  );

  const filteredProjects = searchTerm
    ? filterAndSortBySearch(projects, searchTerm, [
        { get: (p) => p.name, weight: "title" },
        { get: (p) => p.slug, weight: "subtitle" },
        { get: (p) => p.description, weight: "body" },
      ])
    : projects;

  const getRoleBadge = (role: ProjectWithRole["role"]) => {
    switch (role) {
      case "owner":
        return (
          <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 flex items-center gap-1 text-xs">
            <Crown className="h-3 w-3" />
            Owner
          </Badge>
        );
      case "admin":
        return (
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-1 text-xs">
            <Shield className="h-3 w-3" />
            Admin
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 flex items-center gap-1 text-xs">
            <UserIcon className="h-3 w-3" />
            Member
          </Badge>
        );
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Projects</h1>
        <p className="text-muted-foreground mt-1">
          All projects you're a member of across your organizations
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      )}

      {!loading && error && (
        <Card className="p-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </Card>
      )}

      {!loading && !error && (
        <>
          {projects.length > 0 && (
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          )}

          {projects.length === 0 && (
            <Card className="p-8 text-center bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-indigo-200 dark:border-indigo-800">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-800 mb-4">
                <Puzzle className="h-7 w-7 text-indigo-600 dark:text-indigo-300" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Projects Yet</h3>
              <p className="text-muted-foreground text-sm">
                You don't belong to any projects. Ask an organization admin to
                create one and invite you.
              </p>
            </Card>
          )}

          {filteredProjects.length > 0 && (
            <div className="space-y-3">
              {filteredProjects.map((project) => (
                <Card
                  key={project.id}
                  className={cn(
                    "p-4 cursor-pointer transition-all duration-200 hover:shadow-md",
                  )}
                  onClick={() => {
                    // Personal projects always use UUID — `slug` is only
                    // unique inside an org. Org projects prefer slug, fall
                    // back to UUID. If we somehow can't resolve an org slug,
                    // fall back to the universal personal route by UUID
                    // rather than producing a broken URL.
                    if (project.isPersonal || !project.organizationId) {
                      router.push(`/projects/${project.id}/settings`);
                      return;
                    }
                    const orgSlug = orgSlugById.get(project.organizationId);
                    const segment = project.slug ?? project.id;
                    if (orgSlug) {
                      router.push(`/org/${orgSlug}/projects/${segment}`);
                    } else {
                      router.push(`/projects/${project.id}`);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center flex-shrink-0">
                        <Puzzle className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium">{project.name}</span>
                          {getRoleBadge(project.role)}
                        </div>
                        {project.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {project.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {project.memberCount ?? 0} member
                          {project.memberCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {filteredProjects.length === 0 && searchTerm && (
            <Card className="p-8 text-center">
              <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold mb-1">No projects found</h3>
              <p className="text-sm text-muted-foreground">
                Try adjusting your search
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
