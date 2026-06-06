"use client";

/**
 * OrgResourceDetail — the per-resource org page.
 *
 * One catalogue-driven page for every scopeable kind, reached from the org
 * workspace tiles (`/organizations/[orgId]/resources/[kind]`). Two halves:
 *   - "Shared with {org}" — the team view (org-owned + member-contributed)
 *   - "Yours to share"     — your own items, each one click from sharing
 *
 * No per-type code: everything reads from the org resource catalogue.
 */

import React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Search,
  Plus,
  Check,
  ExternalLink,
  Share2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
import { getEntry, getContentRole } from "../resource-catalogue";
import { useOrgContributableItems } from "../hooks/useOrgContributableItems";
import { useOrgSharedItems } from "../hooks/useOrgSharedItems";

export function OrgResourceDetail() {
  const params = useParams();
  const router = useRouter();
  const orgParam = params.orgId as string;
  const kind = params.kind as string;

  const entry = getEntry(kind) ?? null;
  const [org, setOrg] = React.useState<{ id: string; name: string; slug: string } | null>(null);
  const [resolving, setResolving] = React.useState(true);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setResolving(true);
      const resolved = await getOrganizationBySlugOrId(orgParam);
      if (!cancelled) {
        setOrg(resolved ? { id: resolved.id, name: resolved.name, slug: resolved.slug } : null);
        setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgParam]);

  const shared = useOrgSharedItems(org?.id ?? null, entry);
  const mine = useOrgContributableItems(org?.id ?? null, org?.name ?? "", entry, () => {
    shared.reload();
  });

  if (resolving) {
    return (
      <CenterState>
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </CenterState>
    );
  }

  if (!entry || !org) {
    return (
      <CenterState>
        <Card className="max-w-md w-full p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">
            {!entry ? "Unknown resource" : "Organization not found"}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {!entry
              ? "This resource kind doesn't exist."
              : "This organization doesn't exist or has been removed."}
          </p>
          <Button variant="outline" size="sm" onClick={() => router.push("/organizations")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Organizations
          </Button>
        </Card>
      </CenterState>
    );
  }

  const role = getContentRole(entry.role);
  const Icon = entry.icon;
  const filteredMine = mine.items.filter((it) =>
    it.title.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5 pr-14 md:pr-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/organizations/${org.slug}`)}
          className="text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {org.name}
        </Button>

        {/* Header */}
        <Card className="p-5 md:p-6 relative overflow-hidden">
          <span className={`absolute inset-x-0 top-0 h-1 ${role.accentBar}`} />
          <div className="flex items-start gap-4">
            <span className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${role.accentBg} ${role.accentText}`}>
              <Icon className="h-6 w-6" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground">{entry.labelPlural}</h1>
                <Badge variant="outline" className={`text-[10px] ${role.accentText}`}>
                  {role.title}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{entry.description}</p>
            </div>
            {entry.orgRoute && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/organizations/${org.slug}/${entry.orgRoute}`)}
                className="shrink-0"
              >
                Full view
                <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* Shared with org (team view) */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">Shared with {org.name}</h2>
              {!shared.loading && (
                <Badge variant="secondary" className="text-xs">{shared.items.length}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              {entry.labelPlural} the org owns or that members have shared with the team.
            </p>

            {shared.loading ? (
              <Loading />
            ) : shared.items.length === 0 ? (
              <Empty icon={<Icon className="h-7 w-7 text-muted-foreground" />}>
                Nothing here yet. Share one of yours from the right.
              </Empty>
            ) : (
              <ul className="space-y-1.5">
                {shared.items.map((item) => (
                  <li
                    key={`${item.source}-${item.id}`}
                    className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 min-w-0 text-sm truncate" title={item.title}>
                      {item.title}
                    </span>
                    <Badge
                      variant={item.source === "owned" ? "secondary" : "outline"}
                      className="text-[10px] shrink-0"
                    >
                      {item.source === "owned" ? "Org" : "Shared"}
                    </Badge>
                    {item.href && (
                      <button
                        onClick={() => router.push(item.href!)}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        title="Open"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Yours to share */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <Share2 className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold">Yours to share</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Your own {entry.labelPlural.toLowerCase()}. One click adds them to the team.
            </p>

            {!mine.contributable ? (
              <Empty icon={<Icon className="h-7 w-7 text-muted-foreground" />}>
                This kind can&apos;t be shared with an org yet.
              </Empty>
            ) : (
              <>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Search your ${entry.labelPlural.toLowerCase()}…`}
                    className="pl-9"
                  />
                </div>
                {mine.loading ? (
                  <Loading />
                ) : filteredMine.length === 0 ? (
                  <Empty icon={<Icon className="h-7 w-7 text-muted-foreground" />}>
                    {mine.items.length === 0
                      ? `You don't own any ${entry.labelPlural.toLowerCase()} yet.`
                      : "No matches."}
                  </Empty>
                ) : (
                  <ul className="space-y-1.5">
                    {filteredMine.map((item) => {
                      const isShared =
                        mine.alreadyShared.has(item.id) || mine.justShared.has(item.id);
                      return (
                        <li
                          key={item.id}
                          className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1 min-w-0 text-sm truncate" title={item.title}>
                            {item.title}
                          </span>
                          {isShared ? (
                            <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                              <Check className="h-3 w-3" />
                              Shared
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 shrink-0"
                              disabled={mine.sharingId === item.id}
                              onClick={() => mine.share(item)}
                            >
                              {mine.sharingId === item.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <>
                                  <Plus className="h-3.5 w-3.5 mr-1" />
                                  Share
                                </>
                              )}
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function CenterState({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex items-center justify-center bg-textured p-4">
      {children}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function Empty({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="text-center py-10 border-2 border-dashed border-border rounded-lg">
      <div className="flex justify-center mb-3">{icon}</div>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto">{children}</p>
    </div>
  );
}
