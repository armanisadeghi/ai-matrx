"use client";

/**
 * Organizations launcher — the parent to the org workspace.
 *
 * A polished home that lists the user's personal workspace and team orgs as
 * rich cards (logo, role, members, created), with search and a create action.
 * Matches the OrgWorkspace aesthetic (gradient accents, single scroll, semantic
 * surfaces). Client component — same interactive-dashboard pattern as the rest
 * of the org surfaces.
 */

import React from "react";
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
  Search,
  Calendar,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { CreateOrgModal } from "@/features/organizations/components/CreateOrgModal";
import type { OrganizationWithRole, OrgRole } from "@/features/organizations/types";
import { InlineMediaRef } from "@/features/files";
import { filterAndSortBySearch } from "@/utils/search-scoring";

interface RoleMeta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  bar: string;
  text: string;
  bg: string;
}

const ROLE_META: Record<OrgRole, RoleMeta> = {
  owner: {
    label: "Owner",
    icon: Crown,
    bar: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
  },
  admin: {
    label: "Admin",
    icon: Shield,
    bar: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
  },
  member: {
    label: "Member",
    icon: UserIcon,
    bar: "bg-slate-400",
    text: "text-muted-foreground",
    bg: "bg-muted",
  },
};

const PERSONAL_META: RoleMeta = {
  label: "Personal",
  icon: Sparkles,
  bar: "bg-gradient-to-r from-violet-500 to-sky-500",
  text: "text-violet-600 dark:text-violet-400",
  bg: "bg-violet-500/10",
};

function OrgCard({ org }: { org: OrganizationWithRole }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const meta = org.isPersonal ? PERSONAL_META : ROLE_META[org.role];
  const RoleIcon = meta.icon;
  const href = `/organizations/${org.slug}`;

  function handleClick(e: React.MouseEvent) {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    startTransition(() => router.push(href));
  }

  return (
    <Link href={href} onClick={handleClick} className="block group focus:outline-none">
      <Card className="relative h-full overflow-hidden hover:border-primary/40 hover:shadow-sm transition-all">
        <span className={`absolute inset-x-0 top-0 h-1 ${meta.bar} opacity-70`} />
        {isPending && (
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm z-10 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        <div className="p-4 flex flex-col gap-3 h-full">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-11 h-11 rounded-lg overflow-hidden bg-muted flex items-center justify-center border border-border">
              <InlineMediaRef
                ref={org.logoUrl ?? null}
                size="fill"
                fit="cover"
                rounded="none"
                fallbackIcon={
                  <span className={`w-full h-full flex items-center justify-center ${meta.bg}`}>
                    <Building2 className={`h-5 w-5 ${meta.text}`} />
                  </span>
                }
                alt={org.name}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                {org.name}
              </p>
              <p className="text-xs text-muted-foreground truncate">/{org.slug}</p>
            </div>
            <Badge variant="outline" className={`text-[10px] gap-1 shrink-0 ${meta.text}`}>
              <RoleIcon className="h-3 w-3" />
              {meta.label}
            </Badge>
          </div>

          {org.description ? (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {org.description}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/60 italic">No description</p>
          )}

          <div className="flex items-center justify-between gap-2 pt-2 mt-auto border-t border-border/60">
            <div className="flex items-center gap-3 text-xs text-muted-foreground min-w-0">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {org.memberCount ?? 1}
              </span>
              {org.createdAt && (
                <span className="flex items-center gap-1 truncate">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(org.createdAt), "MMM yyyy")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Link
                href={`/organizations/${org.slug}/settings`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Manage"
              >
                <Settings className="h-3.5 w-3.5" />
              </Link>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default function OrganizationsPage() {
  const { organizations, loading, refresh } = useUserOrganizations();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const filtered = query
    ? filterAndSortBySearch(organizations, query, [
        { get: (o) => o.name, weight: "title" },
        { get: (o) => o.slug, weight: "subtitle" },
        { get: (o) => o.description ?? "", weight: "body" },
      ])
    : organizations;

  const personal = filtered.filter((o) => o.isPersonal);
  const teams = filtered.filter((o) => !o.isPersonal);
  const teamCount = organizations.filter((o) => !o.isPersonal).length;

  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6 pr-14 md:pr-6">
        {/* Hero */}
        <Card className="p-5 md:p-6 relative overflow-hidden">
          <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-sky-500 to-emerald-500" />
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="h-12 w-12 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                <Building2 className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">Organizations</h1>
                <p className="text-sm text-muted-foreground">
                  Your teams and shared workspaces — agents, scopes, knowledge, all in one place.
                </p>
              </div>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              New organization
            </Button>
          </div>

          <div className="flex items-center gap-5 flex-wrap mt-4">
            <Stat value={organizations.length} label={organizations.length === 1 ? "workspace" : "workspaces"} />
            <Stat value={teamCount} label={teamCount === 1 ? "team" : "teams"} />
          </div>

          {organizations.length > 4 && (
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search organizations…"
                className="pl-9 max-w-sm"
              />
            </div>
          )}
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Loading organizations…</p>
            </div>
          </div>
        ) : organizations.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="max-w-xs mx-auto">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Building2 className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-1">No organizations yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create a team to collaborate, share agents, and build shared knowledge.
              </p>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Create organization
              </Button>
            </div>
          </Card>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            No organizations match “{query}”.
          </p>
        ) : (
          <>
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

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-lg font-bold text-foreground tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
