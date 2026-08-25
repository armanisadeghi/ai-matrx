"use client";

// features/admin/shared-knowledge/components/AccessExplorerTab.tsx
//
// The "why" tool: pick an organization or user and see exactly which Library
// resources they can read AND through which grant (global / their org / an
// industry their org is assigned to); or pick a resource and see the audiences
// it is issued to, expanded to concrete organizations. Resources are every
// Library entity type — library data stores AND SEO starter packs — because
// the spine is one table (platform.entity_grants). Grant rows come from
// `public.library_list_grants` per resource (the admin gate makes the full list
// visible here); caller-scoped provenance for tenant surfaces uses P3's
// `library_grant_provenance` family instead — never duplicated here.
//
// THE DOOR LAW (common-docs/policies/no-dead-ends.md): every organization and
// every resource named here is a real record, so every one of them opens. A
// `<SelectItem>` cannot be an anchor, so the CHOSEN record gets the doors as a
// sibling of the picker (`EntityRef`), and every organization/store named in a
// result row is an `EntityRef` in place. Doors come from the registries —
// `organization` → /organizations/[orgId], `data_store` →
// /knowledge/data-stores?store_id= — and a pack opens in this console's own
// Starter packs tab (`?tab=packs&pack=<id>`).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2,
  Globe,
  Layers,
  Library,
  Loader2,
  Package,
  Search,
  UserRound,
} from "lucide-react";
import {
  fetchLibraryGrants,
  type LibraryEntityType,
  type LibraryGrant,
} from "@/features/rag/hooks/useLibraryGrants";
import { useAllOrgIndustries } from "@/features/industries/hooks";
import { searchUserByEmail } from "@/features/organizations/userSearch";
import type { StarterPackSummary } from "@/features/marketing/seo/value-system/types";
import { fetchAdminPackCatalog } from "../packs/data";
import type { SharedKnowledgeDirectory } from "../types";
import { UserSearchField } from "@/features/user-search/UserSearchField";

type ExplorerMode = "organization" | "user" | "resource";

interface Resource {
  type: LibraryEntityType;
  id: string;
  name: string;
  /** Packs: status matters — a non-ratified pack reaches an industry only through a pilot. */
  status?: string;
}

interface EntitlementRow {
  resource: Resource;
  grant: LibraryGrant;
  reason: string;
}

const resourceKey = (r: Resource) => `${r.type}:${r.id}`;

export function packHref(packId: string) {
  return `/administration/shared-knowledge?tab=packs&pack=${encodeURIComponent(packId)}`;
}

function ResourceName({ r, className }: { r: Resource; className?: string }) {
  if (r.type === "data_store") {
    return (
      <EntityRef
        token="data_store"
        id={r.id}
        name={r.name}
        className={className}
        alwaysShowActions
      />
    );
  }
  return (
    <Link
      href={packHref(r.id)}
      className={`inline-flex items-center gap-1 underline-offset-2 hover:underline ${className ?? ""}`}
    >
      <Package className="size-3.5 text-muted-foreground" aria-hidden />
      {r.name}
      <span className="text-[10px] text-muted-foreground">
        starter pack{r.status ? ` · ${r.status}` : ""}
      </span>
    </Link>
  );
}

export function AccessExplorerTab({
  directory,
}: {
  directory: SharedKnowledgeDirectory;
}) {
  const [mode, setMode] = useState<ExplorerMode>("organization");
  const [orgId, setOrgId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [email, setEmail] = useState("");
  const [lookedUpUser, setLookedUpUser] = useState<{
    id: string;
    email: string;
  } | null>(null);
  const [lookupState, setLookupState] = useState<
    "idle" | "loading" | "not_found"
  >("idle");

  const { assignments } = useAllOrgIndustries();

  const [packs, setPacks] = useState<StarterPackSummary[]>([]);
  const [grantsByResource, setGrantsByResource] = useState<
    Map<string, LibraryGrant[]>
  >(new Map());
  const [grantsLoading, setGrantsLoading] = useState(true);
  const [grantsError, setGrantsError] = useState<string | null>(null);

  const resources: Resource[] = useMemo(
    () => [
      ...directory.stores.map((s) => ({
        type: "data_store" as const,
        id: s.id,
        name: s.name,
      })),
      ...packs.map((p) => ({
        type: "seo_starter_pack" as const,
        id: p.id,
        name: p.name,
        status: p.status,
      })),
    ],
    [directory.stores, packs],
  );

  // All grants across every Library resource — one fetch per resource via the
  // canonical admin-gated RPC.
  useEffect(() => {
    let cancelled = false;
    setGrantsLoading(true);
    setGrantsError(null);
    (async () => {
      try {
        const packRows = await fetchAdminPackCatalog();
        if (cancelled) return;
        setPacks(packRows);
        const all: Resource[] = [
          ...directory.stores.map((s) => ({
            type: "data_store" as const,
            id: s.id,
            name: s.name,
          })),
          ...packRows.map((p) => ({
            type: "seo_starter_pack" as const,
            id: p.id,
            name: p.name,
            status: p.status,
          })),
        ];
        const entries = await Promise.all(
          all.map(
            async (r) =>
              [resourceKey(r), await fetchLibraryGrants(r.type, r.id)] as const,
          ),
        );
        if (!cancelled) setGrantsByResource(new Map(entries));
      } catch (e) {
        if (!cancelled)
          setGrantsError(
            e instanceof Error ? e.message : "Could not load grants",
          );
      } finally {
        if (!cancelled) setGrantsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [directory.stores]);

  const orgNameById = useMemo(
    () => new Map(directory.organizations.map((o) => [o.id, o.name])),
    [directory.organizations],
  );

  const industriesByOrg = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of assignments) {
      const list = map.get(a.organizationId) ?? [];
      list.push(a.industryId);
      map.set(a.organizationId, list);
    }
    return map;
  }, [assignments]);

  const orgsByIndustry = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of assignments) {
      const list = map.get(a.industryId) ?? [];
      list.push(a.organizationId);
      map.set(a.industryId, list);
    }
    return map;
  }, [assignments]);

  /** Which resources can org X read, and why. */
  const entitlementsForOrg = (targetOrgId: string): EntitlementRow[] => {
    const orgIndustries = new Set(industriesByOrg.get(targetOrgId) ?? []);
    const orgName = orgNameById.get(targetOrgId) ?? targetOrgId;
    const rows: EntitlementRow[] = [];
    for (const resource of resources) {
      for (const g of grantsByResource.get(resourceKey(resource)) ?? []) {
        if (g.audience === "global") {
          rows.push({
            resource,
            grant: g,
            reason: "Published to everyone (global grant)",
          });
        } else if (
          g.audience === "organization" &&
          g.organizationId === targetOrgId
        ) {
          rows.push({
            resource,
            grant: g,
            reason:
              resource.type === "seo_starter_pack"
                ? `${orgName} subscribed to it (or was granted a pilot) directly`
                : `Published directly to ${orgName}`,
          });
        } else if (
          g.audience === "industry" &&
          g.industryId &&
          orgIndustries.has(g.industryId)
        ) {
          rows.push({
            resource,
            grant: g,
            reason: `Published to industry “${g.industryName ?? g.industrySlug ?? g.industryId}” — ${orgName} is assigned to it`,
          });
        }
      }
    }
    return rows;
  };

  const onLookupUser = async () => {
    if (!email.trim()) return;
    setLookupState("loading");
    setLookedUpUser(null);
    const result = await searchUserByEmail(email);
    if (result.exists) {
      setLookedUpUser({ id: result.id, email: result.email });
      setLookupState("idle");
    } else {
      setLookupState("not_found");
    }
  };

  const userOrgIds = useMemo(() => {
    if (!lookedUpUser) return [];
    return directory.memberships
      .filter((m) => m.user_id === lookedUpUser.id)
      .map((m) => m.organization_id);
  }, [directory.memberships, lookedUpUser]);

  const renderEntitlements = (rows: EntitlementRow[], emptyText: string) => {
    if (grantsLoading) {
      return (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading grants…
        </div>
      );
    }
    if (grantsError) {
      return (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {grantsError}
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      );
    }
    return (
      <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
        {rows.map((r, idx) => (
          <li
            key={`${resourceKey(r.resource)}-${r.grant.id}-${idx}`}
            className="group/entity-ref px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
              <ResourceName r={r.resource} className="min-w-0 font-medium" />
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {r.resource.type === "seo_starter_pack" ? "adopt" : "read"}
              </Badge>
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {r.grant.audience}
              </Badge>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {r.reason}
            </div>
          </li>
        ))}
      </ul>
    );
  };

  const selectedResource =
    resources.find((r) => resourceKey(r) === resourceId) ?? null;

  return (
    <div className="max-w-3xl space-y-4">
      <Tabs value={mode} onValueChange={(v) => setMode(v as ExplorerMode)}>
        <TabsList className="w-fit">
          <TabsTrigger value="organization">
            <Building2 className="mr-1.5 h-3.5 w-3.5" /> By organization
          </TabsTrigger>
          <TabsTrigger value="user">
            <UserRound className="mr-1.5 h-3.5 w-3.5" /> By user
          </TabsTrigger>
          <TabsTrigger value="resource">
            <Library className="mr-1.5 h-3.5 w-3.5" /> By resource
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "organization" ? (
        <div className="space-y-3">
          <Select value={orgId} onValueChange={setOrgId}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Choose an organization…" />
            </SelectTrigger>
            <SelectContent>
              {directory.organizations
                .filter((o) => !o.is_personal)
                .map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {orgId ? (
            <>
              <div className="group/entity-ref flex items-center gap-2 text-sm text-foreground">
                <EntityRef
                  token="organization"
                  id={orgId}
                  name={orgNameById.get(orgId) ?? orgId}
                  className="min-w-0 font-medium"
                  alwaysShowActions
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Industries:{" "}
                {(industriesByOrg.get(orgId) ?? []).length === 0
                  ? "none assigned"
                  : (industriesByOrg.get(orgId) ?? []).length}
                {" · "}
                <Link
                  href={`/administration/users/organizations?org=${encodeURIComponent(orgId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-2 hover:text-foreground "
                  title="Open this organization's members"
                >
                  Members:{" "}
                  {
                    directory.memberships.filter(
                      (m) => m.organization_id === orgId,
                    ).length
                  }
                </Link>
              </div>
              {renderEntitlements(
                entitlementsForOrg(orgId),
                "This organization reaches no shared resources — no global grant, no direct org grant or subscription, and none of its industries are published to.",
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {mode === "user" ? (
        <div className="space-y-3">
          <div className="flex max-w-xl gap-2">
            <UserSearchField
              value={email}
              onValueChange={(value) => {
                setEmail(value);
                setLookedUpUser(null);
                setLookupState("idle");
              }}
              onEnter={() => void onLookupUser()}
              onUserSelect={(user) => {
                const label = user.email ?? user.displayName ?? user.id;
                setEmail(label);
                setLookedUpUser({ id: user.id, email: label });
                setLookupState("idle");
              }}
              directory="admin"
              title="Choose a user to inspect"
              placeholder="Search by name, email, organization, or ID…"
              className="min-w-0 flex-1"
            />
            <Button
              onClick={onLookupUser}
              disabled={!email.trim() || lookupState === "loading"}
              size="sm"
              className="shrink-0"
            >
              {lookupState === "loading" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="mr-1.5 h-3.5 w-3.5" />
              )}
              Look up
            </Button>
          </div>
          {lookupState === "not_found" ? (
            <div className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              No user with that email.
            </div>
          ) : null}
          {lookedUpUser ? (
            <div className="space-y-3">
              <div className="group/entity-ref flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>{lookedUpUser.email} · member of</span>
                {userOrgIds.length === 0 ? (
                  <span>no organizations</span>
                ) : (
                  userOrgIds.map((id) => (
                    <EntityRef
                      key={id}
                      token="organization"
                      id={id}
                      name={orgNameById.get(id) ?? id}
                      className="text-foreground"
                      alwaysShowActions
                    />
                  ))
                )}
              </div>
              {userOrgIds.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                  Not a member of any organization — Library grants reach users
                  only through org membership, so this user reaches nothing.
                </div>
              ) : (
                userOrgIds.map((oid) => (
                  <div key={oid} className="space-y-1.5">
                    <div className="group/entity-ref flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <span>Via membership in</span>
                      <EntityRef
                        token="organization"
                        id={oid}
                        name={orgNameById.get(oid) ?? oid}
                        alwaysShowActions
                      />
                    </div>
                    {renderEntitlements(
                      entitlementsForOrg(oid),
                      "This organization reaches no shared resources.",
                    )}
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "resource" ? (
        <div className="space-y-3">
          <Select value={resourceId} onValueChange={setResourceId}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Choose a library store or starter pack…" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Library stores</SelectLabel>
                {directory.stores.map((s) => (
                  <SelectItem key={s.id} value={`data_store:${s.id}`}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Starter packs</SelectLabel>
                {packs.map((p) => (
                  <SelectItem key={p.id} value={`seo_starter_pack:${p.id}`}>
                    {p.name}{" "}
                    <span className="text-muted-foreground">· {p.status}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {selectedResource ? (
            <div className="group/entity-ref flex items-center gap-2 text-sm text-foreground">
              <ResourceName
                r={selectedResource}
                className="min-w-0 font-medium"
              />
            </div>
          ) : null}
          {selectedResource ? (
            grantsLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading grants…
              </div>
            ) : (
              <div className="space-y-2">
                {(grantsByResource.get(resourceId) ?? []).length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                    Not published to any audience — only admins
                    {selectedResource.type === "seo_starter_pack"
                      ? " and the industry's curators"
                      : " and curators"}{" "}
                    can read it.
                  </div>
                ) : (
                  (grantsByResource.get(resourceId) ?? []).map((g) => {
                    const reachedOrgIds =
                      g.audience === "global"
                        ? directory.organizations
                            .filter((o) => !o.is_personal)
                            .map((o) => o.id)
                        : g.audience === "organization" && g.organizationId
                          ? [g.organizationId]
                          : g.audience === "industry" && g.industryId
                            ? (orgsByIndustry.get(g.industryId) ?? [])
                            : [];
                    return (
                      <div
                        key={g.id}
                        className="rounded-md border border-border px-3 py-2"
                      >
                        <div className="group/entity-ref flex items-center gap-2 text-sm font-medium text-foreground">
                          {g.audience === "global" ? (
                            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : g.audience === "industry" ? (
                            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : null}
                          {g.audience === "global" ? (
                            "Everyone (global grant)"
                          ) : g.audience === "industry" ? (
                            <span>
                              Industry —{" "}
                              {g.industryName ?? g.industrySlug ?? "unknown"}
                            </span>
                          ) : g.organizationId ? (
                            <>
                              <span>
                                {selectedResource.type === "seo_starter_pack"
                                  ? "Subscribed / pilot —"
                                  : "Organization —"}
                              </span>
                              <EntityRef
                                token="organization"
                                id={g.organizationId}
                                name={g.organizationName ?? g.organizationId}
                              />
                            </>
                          ) : (
                            <span>Organization — unknown</span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {g.audience === "global" ? (
                            "Every organization on the platform reaches this resource."
                          ) : reachedOrgIds.length === 0 ? (
                            "Reaches no organizations today (the industry has no assigned orgs)."
                          ) : (
                            <span className="group/entity-ref flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span>Reaches:</span>
                              {reachedOrgIds.map((id) => (
                                <EntityRef
                                  key={id}
                                  token="organization"
                                  id={id}
                                  name={orgNameById.get(id) ?? id}
                                  showIcon={false}
                                />
                              ))}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
