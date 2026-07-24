"use client";

// features/admin/shared-knowledge/components/AccessExplorerTab.tsx
//
// The "why" tool: pick an organization or user and see exactly which library
// stores they can read AND through which grant (global / their org / an
// industry their org is assigned to); or pick a store and see the audiences
// it is issued to, expanded to concrete organizations. Grant rows come from
// `rag.fn_list_data_store_grants` per store (the super-admin gate makes the
// full list visible here); caller-scoped provenance for tenant surfaces uses
// P3's `library_grant_provenance` family instead — never duplicated here.

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
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
  Search,
  UserRound,
} from "lucide-react";
import {
  fetchDataStoreGrants,
  type DataStoreGrant,
} from "@/features/rag/hooks/useDataStoreGrants";
import { useAllOrgIndustries } from "@/features/industries/hooks";
import { searchUserByEmail } from "@/features/organizations/userSearch";
import type { SharedKnowledgeDirectory } from "../types";

type ExplorerMode = "organization" | "user" | "store";

interface EntitlementRow {
  storeId: string;
  storeName: string;
  grant: DataStoreGrant;
  reason: string;
}

export function AccessExplorerTab({
  directory,
}: {
  directory: SharedKnowledgeDirectory;
}) {
  const [mode, setMode] = useState<ExplorerMode>("organization");
  const [orgId, setOrgId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [email, setEmail] = useState("");
  const [lookedUpUser, setLookedUpUser] = useState<{
    id: string;
    email: string;
  } | null>(null);
  const [lookupState, setLookupState] = useState<
    "idle" | "loading" | "not_found"
  >("idle");

  const { assignments } = useAllOrgIndustries();

  // All grants across every library store — one fetch per store via the
  // canonical super-admin-gated RPC.
  const [grantsByStore, setGrantsByStore] = useState<
    Map<string, DataStoreGrant[]>
  >(new Map());
  const [grantsLoading, setGrantsLoading] = useState(true);
  const [grantsError, setGrantsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setGrantsLoading(true);
    setGrantsError(null);
    Promise.all(
      directory.stores.map(
        async (s) => [s.id, await fetchDataStoreGrants(s.id)] as const,
      ),
    )
      .then((entries) => {
        if (!cancelled) setGrantsByStore(new Map(entries));
      })
      .catch((e) => {
        if (!cancelled)
          setGrantsError(
            e instanceof Error ? e.message : "Could not load grants",
          );
      })
      .finally(() => {
        if (!cancelled) setGrantsLoading(false);
      });
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

  /** Which stores can org X read, and why. */
  const entitlementsForOrg = (targetOrgId: string): EntitlementRow[] => {
    const orgIndustries = new Set(industriesByOrg.get(targetOrgId) ?? []);
    const orgName = orgNameById.get(targetOrgId) ?? targetOrgId;
    const rows: EntitlementRow[] = [];
    for (const store of directory.stores) {
      for (const g of grantsByStore.get(store.id) ?? []) {
        if (g.audience === "global") {
          rows.push({
            storeId: store.id,
            storeName: store.name,
            grant: g,
            reason: "Published to everyone (global grant)",
          });
        } else if (
          g.audience === "organization" &&
          g.organizationId === targetOrgId
        ) {
          rows.push({
            storeId: store.id,
            storeName: store.name,
            grant: g,
            reason: `Published directly to ${orgName}`,
          });
        } else if (
          g.audience === "industry" &&
          g.industryId &&
          orgIndustries.has(g.industryId)
        ) {
          rows.push({
            storeId: store.id,
            storeName: store.name,
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
          <li key={`${r.storeId}-${r.grant.id}-${idx}`} className="px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Library className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{r.storeName}</span>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                read
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
          <TabsTrigger value="store">
            <Library className="mr-1.5 h-3.5 w-3.5" /> By store
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
              <div className="text-xs text-muted-foreground">
                Industries:{" "}
                {(industriesByOrg.get(orgId) ?? []).length === 0
                  ? "none assigned"
                  : (industriesByOrg.get(orgId) ?? []).length}
                {" · "}Members:{" "}
                {
                  directory.memberships.filter(
                    (m) => m.organization_id === orgId,
                  ).length
                }
              </div>
              {renderEntitlements(
                entitlementsForOrg(orgId),
                "This organization reaches no shared libraries — no global grant, no direct org grant, and none of its industries are published to.",
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {mode === "user" ? (
        <div className="space-y-3">
          <div className="flex max-w-md gap-2">
            <Input
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setLookupState("idle");
              }}
              placeholder="user@example.com"
              onKeyDown={(e) => {
                if (e.key === "Enter") void onLookupUser();
              }}
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
              <div className="text-xs text-muted-foreground">
                {lookedUpUser.email} · member of{" "}
                {userOrgIds.length === 0
                  ? "no organizations"
                  : userOrgIds
                      .map((id) => orgNameById.get(id) ?? id)
                      .join(", ")}
              </div>
              {userOrgIds.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                  Not a member of any organization — library grants reach
                  users only through org membership, so this user reaches
                  nothing.
                </div>
              ) : (
                userOrgIds.map((oid) => (
                  <div key={oid} className="space-y-1.5">
                    <div className="text-sm font-medium text-foreground">
                      Via membership in {orgNameById.get(oid) ?? oid}
                    </div>
                    {renderEntitlements(
                      entitlementsForOrg(oid),
                      "This organization reaches no shared libraries.",
                    )}
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "store" ? (
        <div className="space-y-3">
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Choose a library store…" />
            </SelectTrigger>
            <SelectContent>
              {directory.stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {storeId ? (
            grantsLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading grants…
              </div>
            ) : (
              <div className="space-y-2">
                {(grantsByStore.get(storeId) ?? []).length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                    Not published to any audience — only the owner and
                    curators can read it.
                  </div>
                ) : (
                  (grantsByStore.get(storeId) ?? []).map((g) => {
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
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          {g.audience === "global" ? (
                            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : g.audience === "industry" ? (
                            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          {g.audience === "global"
                            ? "Everyone (global grant)"
                            : g.audience === "industry"
                              ? `Industry — ${g.industryName ?? g.industrySlug ?? "unknown"}`
                              : `Organization — ${g.organizationName ?? g.organizationId}`}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {g.audience === "global"
                            ? "Every organization on the platform can read this store."
                            : reachedOrgIds.length === 0
                              ? "Reaches no organizations today (the industry has no assigned orgs)."
                              : `Reaches: ${reachedOrgIds
                                  .map((id) => orgNameById.get(id) ?? id)
                                  .join(", ")}`}
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
