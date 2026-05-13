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
import type { OrganizationMemberWithUser } from "@/features/organizations/types";
import { format } from "date-fns";
import { InlineMediaRef } from "@/features/files";

export default function OrganizationOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;

  const [organization, setOrganization] = React.useState<any>(null);
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const [members, setMembers] = React.useState<OrganizationMemberWithUser[]>(
    [],
  );
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

  const sharedResources = [
    {
      name: "Prompts",
      icon: <FaIndent className="h-5 w-5" />,
      href: `/organizations/${slug}/prompts`,
      color: "text-teal-600 dark:text-teal-400",
    },
    {
      name: "Files",
      icon: <FolderOpen className="h-5 w-5" />,
      href: `/organizations/${slug}/files`,
      color: "text-blue-600 dark:text-blue-400",
    },
    {
      name: "Content Templates",
      icon: <ClipboardType className="h-5 w-5" />,
      href: `/organizations/${slug}/templates`,
      color: "text-purple-600 dark:text-purple-400",
    },
    {
      name: "Workflows",
      icon: <Workflow className="h-5 w-5" />,
      href: `/organizations/${slug}/workflows`,
      color: "text-violet-600 dark:text-violet-400",
    },
    {
      name: "Notes",
      icon: <LuNotepadText className="h-5 w-5" />,
      href: `/organizations/${slug}/notes`,
      color: "text-amber-600 dark:text-amber-400",
    },
    {
      name: "Tasks",
      icon: <ListTodo className="h-5 w-5" />,
      href: `/organizations/${slug}/tasks`,
      color: "text-green-600 dark:text-green-400",
    },
    {
      name: "Projects",
      icon: <Puzzle className="h-5 w-5" />,
      href: `/organizations/${slug}/projects`,
      color: "text-indigo-600 dark:text-indigo-400",
    },
    {
      name: "Tables",
      icon: <Table className="h-5 w-5" />,
      href: `/organizations/${slug}/tables`,
      color: "text-cyan-600 dark:text-cyan-400",
    },
    {
      name: "Prompt Apps",
      icon: <SquareFunction className="h-5 w-5" />,
      href: `/organizations/${slug}/prompt-apps`,
      color: "text-rose-600 dark:text-rose-400",
    },
    {
      name: "Agent Shortcuts",
      icon: <Zap className="h-5 w-5" />,
      href: `/organizations/${slug}/shortcuts`,
      color: "text-amber-600 dark:text-amber-400",
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
                  Coming Soon
                </Badge>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
