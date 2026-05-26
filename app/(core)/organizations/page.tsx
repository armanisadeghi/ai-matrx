"use client";

import React, { useTransition, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Crown,
  Shield,
  User as UserIcon,
  Loader2,
  Plus,
  Users,
  Settings,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { CreateOrgModal } from "@/features/organizations/components/CreateOrgModal";
import type { OrganizationWithRole } from "@/features/organizations/types";
import { InlineMediaRef } from "@/features/files";

function getRoleIcon(role: string, isPersonal: boolean) {
  if (isPersonal) return UserIcon;
  switch (role) {
    case "owner":
      return Crown;
    case "admin":
      return Shield;
    default:
      return UserIcon;
  }
}

function OrgCard({ org }: { org: OrganizationWithRole }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const RoleIcon = getRoleIcon(org.role, org.isPersonal);

  const href = `/organizations/${org.slug}`;

  const handleClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    startTransition(() => router.push(href));
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      className="block group focus:outline-none"
    >
      <Card className="relative h-full hover:border-primary/50 transition-colors overflow-hidden">
        {isPending && (
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm z-10 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-muted flex items-center justify-center border border-border">
                <InlineMediaRef
                  ref={org.logoUrl ?? null}
                  size="fill"
                  fit="cover"
                  rounded="none"
                  fallbackIcon={
                    <Building2
                      className={
                        org.isPersonal
                          ? "h-5 w-5 text-purple-600 dark:text-purple-400"
                          : "h-5 w-5 text-blue-600 dark:text-blue-400"
                      }
                    />
                  }
                  alt={org.name}
                />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                  {org.name}
                </p>
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {org.slug}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {org.isPersonal && (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0.5"
                >
                  Personal
                </Badge>
              )}
              <RoleIcon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>

          {org.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {org.description}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>
                {org.memberCount} {org.memberCount === 1 ? "member" : "members"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/organizations/${org.slug}/settings`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Settings"
              >
                <Settings className="h-3.5 w-3.5" />
              </Link>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function OrganizationsPage() {
  const { organizations, loading, refresh } = useUserOrganizations();
  const [createOpen, setCreateOpen] = useState(false);

  const personal = organizations.filter((o) => o.isPersonal);
  const teams = organizations.filter((o) => !o.isPersonal);

  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Organizations
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your teams and shared workspaces
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Organization
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Loading organizations…
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Personal org */}
            {personal.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Personal
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {personal.map((org) => (
                    <OrgCard key={org.id} org={org} />
                  ))}
                </div>
              </section>
            )}

            {/* Team orgs */}
            {teams.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Teams
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {teams.map((org) => (
                    <OrgCard key={org.id} org={org} />
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {organizations.length === 0 && (
              <Card className="p-12 text-center">
                <div className="max-w-xs mx-auto">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <Building2 className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold mb-1">No organizations yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create a team to collaborate with others.
                  </p>
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Create Organization
                  </Button>
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      <CreateOrgModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => refresh()}
      />
    </div>
  );
}
