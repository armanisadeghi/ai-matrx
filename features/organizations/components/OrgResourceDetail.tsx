"use client";

/**
 * OrgResourceDetail — the per-resource org page.
 *
 * One catalogue-driven page for every scopeable kind, reached from the org
 * workspace tiles (`/organizations/[orgId]/resources/[kind]`). Two halves:
 *   - "Shared with {org}" — the team view (org-owned + member-contributed,
 *     showing who shared each item)
 *   - "Yours to share"     — your own items, each one click from sharing
 *
 * Every row names its record through `EntityRef`, which carries the Open /
 * new-tab / Peek doors (registry-driven). The right-click menu is what EntityRef
 * does NOT cover: sharing the item with the team, or taking it back.
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
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@ai-matrx/design-system/controls";
import { CrumbTrailHeader } from "@/features/shell/components/header/templates/CrumbTrailHeader";
import { ItemContextMenu } from "@ai-matrx/design-system/item";
import type { ItemMenuConfig } from "@ai-matrx/chat/ui/item-types";
import {
  UserAvatarDisplay,
  type UserLike,
} from "@/components/user/UserIdentity";
import {
  getOrganizationBySlugOrId,
  getOrganizationMembers,
} from "@/features/organizations/service";
import { revokeOrgShare } from "@/utils/permissions/orgModeration";
import { getResourceSharePath } from "@/utils/permissions/registry";
import {
  listableTokens,
  resolveEntityToken,
  tryGetEntityInfo,
} from "@/features/scopes/registry/entityRegistry";
import { useKindItems } from "@/features/scopes/hooks/useKindItems";
import { useKindCounts } from "@/features/scopes/hooks/useKindCounts";
import { isEntityTypeToken } from "@ai-matrx/associations";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { OrganizationAccessGate } from "./OrganizationAccessGate";
import {
  getEntry,
  getContentRole,
  type OrgResourceEntry,
} from "../resource-catalogue";
import {
  useOrgContributableItems,
  type MyItem,
} from "../hooks/useOrgContributableItems";
import { ReadFailure } from "@ai-matrx/design-system";
import {
  useOrgSharedItems,
  type OrgSharedItem,
} from "../hooks/useOrgSharedItems";

export function OrgResourceDetail() {
  const params = useParams();
  const router = useRouter();
  const orgParam = params.orgId as string;
  const kind = params.kind as string;

  const entry = getEntry(kind) ?? null;
  const [org, setOrg] = React.useState<{
    id: string;
    name: string;
    slug: string;
  } | null>(null);
  const [resolving, setResolving] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [sharedQuery, setSharedQuery] = React.useState("");
  const [userMap, setUserMap] = React.useState<Map<string, UserLike>>(
    new Map(),
  );

  // A failed organization read is its own state (RC-B12 r13): it used to
  // answer null and show the access gate ("not found / no access").
  const [orgReadError, setOrgReadError] = React.useState<unknown>(null);
  const [orgReadAttempt, setOrgReadAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setResolving(true);
      setOrgReadError(null);
      let resolved: Awaited<ReturnType<typeof getOrganizationBySlugOrId>>;
      try {
        resolved = await getOrganizationBySlugOrId(orgParam);
      } catch (err) {
        if (cancelled) return;
        setOrgReadError(err ?? new Error("The organization read failed"));
        setResolving(false);
        return;
      }
      if (cancelled) return;
      if (!resolved) {
        setOrg(null);
        setResolving(false);
        return;
      }
      setOrg({ id: resolved.id, name: resolved.name, slug: resolved.slug });
      setResolving(false);
      // Members → user map for "who shared" attribution. Enrichment only: a
      // failed roster read leaves the rows' own attribution ("A teammate").
      let members: Awaited<ReturnType<typeof getOrganizationMembers>>;
      try {
        members = await getOrganizationMembers(resolved.id);
      } catch (err) {
        console.error("[OrgResourceDetail] member names unavailable:", err);
        return;
      }
      if (cancelled) return;
      const map = new Map<string, UserLike>();
      for (const m of members) {
        if (m.userId) {
          map.set(m.userId, {
            id: m.user?.id ?? m.userId,
            email: m.user?.email,
            displayName: m.user?.displayName,
            avatarUrl: m.user?.avatarUrl,
          });
        }
      }
      setUserMap(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgParam, orgReadAttempt]);

  // THE WHOLE SET, NOT THE FIRST 500 (A5-P, 2026-09-29). For every kind the inventory can list,
  // the organization's own rows come from `useKindItems` — paged, searched on the server, and read
  // through the same database filter as the tile count, so the badge, the tile and the list agree
  // and machine files (thumbnails, provider payloads, session artifacts) are hidden on all three.
  // `useOrgSharedItems` then adds only the member-contributed grants.
  const listToken = entry?.token ?? null;
  const listable = listToken !== null && listableTokens().includes(listToken);
  const orgScope = listable && org ? ({ kind: "organization", organizationId: org.id } as const) : null;
  const shared = useOrgSharedItems(org?.id ?? null, entry, { includeOwned: !listable });
  const owned = useKindItems(listable ? listToken : null, orgScope, sharedQuery);
  const ownedCount = useKindCounts(orgScope, { tokens: listToken ? [listToken] : [] });
  const mine = useOrgContributableItems(
    org?.id ?? null,
    org?.name ?? "",
    entry,
    () => {
      shared.reload();
      owned.reload();
      ownedCount.retry();
    },
    query,
  );

  async function unshare(item: { id: string }) {
    if (!entry?.shareKey || !org) return;
    const result = await revokeOrgShare(entry.shareKey, item.id, org.id);
    if (result.success) {
      toast.success("Removed from the team.");
      shared.reload();
      owned.reload();
      ownedCount.retry();
      mine.reload();
    } else {
      toast.error(result.error ?? "Couldn't unshare. Only the owner can.");
    }
  }

  if (resolving) {
    return (
      <CenterState>
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </CenterState>
    );
  }

  if (!entry) {
    return (
      <CenterState>
        <Card className="max-w-md w-full p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Unknown resource</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {
              // access-errors: ok — `getEntry` is a static catalogue lookup; the kind in the URL genuinely is not in the catalogue
              "This resource kind doesn't exist."
            }
          </p>
          <Button
            icon={<ArrowLeft />}
            variant="outline"
            onClick={() => router.push("/organizations")}
          >
            Organizations
          </Button>
        </Card>
      </CenterState>
    );
  }

  if (orgReadError != null) {
    return (
      <CenterState>
        <ReadFailure
          error={orgReadError}
          what="this organization"
          onRetry={() => setOrgReadAttempt((n) => n + 1)}
          size="default"
        />
      </CenterState>
    );
  }

  if (!org) {
    return <OrganizationAccessGate orgSlugOrId={orgParam} />;
  }

  const role = getContentRole(entry.role);
  const Icon = entry.icon;
  /**
   * Resolved by TOKEN, never by `entry.key`: six catalogue keys differ from
   * their canonical token, and keying off the key silently loses both the
   * route and the peek.
   */
  const token = entry.token ?? entry.key;
  /**
   * ONE route authority: the entity registry. `EntityRef` already resolves the
   * token's route, so the only thing left for this surface is the case where the
   * registry has no route for the token but the catalogue's `shareKey` names a
   * different registered resource. That resolution goes through
   * `getResourceSharePath`, which is itself registry-first and returns null
   * rather than guessing.
   *
   * It must NOT substitute `urlPathTemplate` by hand: that was a second route
   * authority, and 24 of its 73 rows pointed at routes that do not exist
   * (FOUND_DEFECTS D138 — corrected 2026-08-14). A null here means the record
   * genuinely has no destination, and EntityRef renders the name without an
   * Open door instead of linking to a 404. `canvas_item` is exactly that case
   * and stays that way until the canonical canvas route is decided (D137).
   */
  const registryHasRoute = Boolean(tryGetEntityInfo(token)?.hrefFor);
  const fallbackHref = (id: string): string | undefined =>
    registryHasRoute || !entry.shareKey
      ? undefined
      : (getResourceSharePath(entry.shareKey, id) ?? undefined);
  // Team view = the organization's own rows (paged, server-searched) + member-contributed grants.
  // Grants are few; they are matched by name here and never listed twice.
  const sharedNeedle = sharedQuery.trim().toLowerCase();
  const ownedIds = new Set(owned.items.map((it) => it.id));
  const grantItems = shared.items.filter(
    (it) =>
      !ownedIds.has(it.id) &&
      (!listable || !sharedNeedle || it.title.toLowerCase().includes(sharedNeedle)),
  );
  const teamItems: OrgSharedItem[] = listable
    ? [
        ...owned.items.map((it) => ({ id: it.id, title: it.title, source: "owned" as const })),
        ...grantItems,
      ]
    : shared.items;
  const teamLoading = shared.loading || (listable && owned.loading);
  const teamError = shared.error ?? (listable ? owned.error : null);
  const ownedTotal = listToken ? ownedCount.counts.get(listToken) : undefined;
  // The whole team set: every org-owned row (counted by the same filter the list pages through)
  // plus the grants. While the count is unknown the badge is absent, never a page length.
  const teamTotal = !listable
    ? shared.items.length
    : typeof ownedTotal === "number" && !shared.loading
      ? ownedTotal + shared.items.filter((it) => it.source === "shared").length
      : null;

  return (
    <>
      <CrumbTrailHeader
        backHref={`/organizations/${org.slug}`}
        trail={[
          { label: org.name, href: `/organizations/${org.slug}` },
          { label: entry.labelPlural },
        ]}
        right={
          entry.orgRoute ? (
            <Button
              iconEnd={<ExternalLink />}
              variant="outline"
              onClick={() =>
                window.open(
                  `/organizations/${org.slug}/${entry.orgRoute}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              Full view
            </Button>
          ) : undefined
        }
      />
      <div className="h-full overflow-y-auto bg-textured">
        <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
          {/* Header */}
          <Card className="p-5 md:p-6 relative overflow-hidden">
            <span
              className={`absolute inset-x-0 top-0 h-1 ${role.accentBar}`}
            />
            <div className="flex items-start gap-4">
              <span
                className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${role.accentBg} ${role.accentText}`}
              >
                <Icon className="h-6 w-6" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-foreground">
                    {entry.labelPlural}
                  </h1>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${role.accentText}`}
                  >
                    {role.title}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {entry.description}
                </p>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {/* Shared with org (team view) */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-base font-semibold">
                  Shared with {org.name}
                </h2>
                {!teamLoading && teamTotal !== null && (
                  <Badge variant="secondary" className="text-xs">
                    {teamTotal.toLocaleString()}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                {entry.labelPlural} the org owns or that members have shared
                with the team.
              </p>

              {listable && (
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input adornment="start"
                    aria-label={`Search ${entry.labelPlural.toLowerCase()} shared with ${org.name}`}
                    value={sharedQuery}
                    onChange={(e) => setSharedQuery(e.target.value)}
                    placeholder={`Search ${entry.labelPlural.toLowerCase()}…`}
                  />
                </div>
              )}
              {teamLoading ? (
                <Loading />
              ) : teamError ? (
                <ReadFailure
                  error={teamError}
                  what={`the ${entry.labelPlural.toLowerCase()} shared with ${org.name}`}
                  onRetry={() => {
                    shared.reload();
                    owned.reload();
                  }}
                />
              ) : teamItems.length === 0 ? (
                <Empty
                  icon={<Icon className="h-7 w-7 text-muted-foreground" />}
                >
                  {sharedNeedle
                    ? "No matches."
                    : "Nothing here yet. Share one of yours from the right."}
                </Empty>
              ) : (
                <>
                <ul className="space-y-1.5">
                  {teamItems.map((item) => (
                    <SharedRow
                      key={`${item.source}-${item.id}`}
                      item={item}
                      entry={entry}
                      token={token}
                      href={fallbackHref(item.id)}
                      sharer={
                        item.sharedBy ? userMap.get(item.sharedBy) : undefined
                      }
                      onUnshare={() => unshare(item)}
                    />
                  ))}
                </ul>
                {listable && owned.hasMore && (
                  <ShowMore loading={owned.loadingMore} onClick={owned.loadMore} />
                )}
                </>
              )}
            </Card>

            {/* Yours to share */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <Share2 className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold">Yours to share</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Your own {entry.labelPlural.toLowerCase()}. One click adds them
                to the team.
              </p>

              {!mine.contributable ? (
                // read-gate-exempt: whether this resource kind can be shared at all — a static property of the registry entry, not a read's answer
                <Empty
                  icon={<Icon className="h-7 w-7 text-muted-foreground" />}
                >
                  This kind can&apos;t be shared with an org yet.
                </Empty>
              ) : (
                <>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input adornment="start"
                      aria-label={`Search your ${entry.labelPlural.toLowerCase()}`}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={`Search your ${entry.labelPlural.toLowerCase()}…`}
                    />
                  </div>
                  {mine.loading ? (
                    <Loading />
                  ) : mine.error ? (
                    <ReadFailure
                      error={mine.error}
                      what={`your ${entry.labelPlural.toLowerCase()}`}
                      onRetry={mine.reload}
                    />
                  ) : mine.items.length === 0 ? (
                    <Empty
                      icon={<Icon className="h-7 w-7 text-muted-foreground" />}
                    >
                      {query.trim()
                        ? "No matches."
                        : `You don't own any ${entry.labelPlural.toLowerCase()} yet.`}
                    </Empty>
                  ) : (
                    <>
                    <ul className="space-y-1.5">
                      {mine.items.map((item) => {
                        const isShared =
                          mine.alreadyShared.has(item.id) ||
                          mine.justShared.has(item.id);
                        return (
                          <MineRow
                            key={item.id}
                            item={item}
                            entry={entry}
                            token={token}
                            href={fallbackHref(item.id)}
                            isShared={isShared}
                            sharing={mine.sharingId === item.id}
                            onShare={() => mine.share(item)}
                            onUnshare={() => unshare(item)}
                          />
                        );
                      })}
                    </ul>
                    {mine.hasMore && (
                      <ShowMore loading={mine.loadingMore} onClick={mine.loadMore} />
                    )}
                    </>
                  )}
                </>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Rows ───────────────────────────────────────────────────────────────────

/**
 * The row's right-click menu, on the ONE canonical menu (v3) via
 * `ItemContextMenu` — this was the last ad-hoc `@/components/ui/context-menu`
 * consumer in the repo, and being ad-hoc cost it every v3 capability: Copy,
 * Copy-as, Export, Convert, AI actions, bound agents, Attach To.
 *
 * Open / Open-in-new-tab / Peek are still NOT here: `EntityRef` renders all
 * three inline on the row's name, from the same registries. Adding them back
 * would be a second, drifting copy of doors we already own.
 *
 * NO `resourceType` on the entity, deliberately. It would light up v3's
 * generic Share (the permission ShareModal) beside this row's own "Share with
 * team" (the org association) — two share buttons, different meanings, on one
 * row. That is the two-authorities defect this sweep exists to kill, so org
 * sharing stays the single sharing path here and `entity` contributes Attach
 * To only.
 */
function RowContextMenu({
  token,
  id,
  title,
  isShared,
  onShare,
  onUnshare,
  children,
}: {
  token: string;
  id: string;
  title: string;
  isShared: boolean;
  onShare?: () => void;
  onUnshare?: () => void;
  children: React.ReactNode;
}) {
  const config = (): ItemMenuConfig => ({
    sections: [
      {
        id: "org-sharing",
        items: isShared
          ? [
              {
                id: "unshare",
                label: "Unshare",
                icon: X,
                tone: "destructive",
                onSelect: () => onUnshare?.(),
              },
            ]
          : [
              {
                id: "share",
                label: "Share with team",
                icon: Plus,
                disabled: !onShare,
                onSelect: () => onShare?.(),
              },
            ],
      },
    ],
  });

  // Canonicalise once (checklist 3): the catalogue's token is meant to be
  // canonical, but resolving here means an alias can never silently cost this
  // row its Attach To while the name beside it opens fine.
  const canonicalToken = resolveEntityToken(token);

  return (
    <ItemContextMenu
      config={config}
      sourceFeature="system"
      entity={
        isEntityTypeToken(canonicalToken)
          ? { type: canonicalToken, id, title }
          : undefined
      }
    >
      {children}
    </ItemContextMenu>
  );
}

function SharedRow({
  item,
  entry,
  token,
  href,
  sharer,
  onUnshare,
}: {
  item: OrgSharedItem;
  entry: OrgResourceEntry;
  token: string;
  href: string | undefined;
  sharer: UserLike | undefined;
  onUnshare: () => void;
}) {
  return (
    <li>
      <RowContextMenu
        token={token}
        id={item.id}
        title={item.title}
        isShared
        onUnshare={onUnshare}
      >
        <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors">
          <EntityRef
            token={token}
            id={item.id}
            name={item.title}
            href={href}
            showIcon={!entry.hideRowIcon}
            fill
            className="flex-1 min-w-0 text-sm"
          />
          {item.source === "shared" && sharer && (
            <span
              className="flex items-center gap-1.5 shrink-0"
              title={`Shared by ${sharer.displayName ?? sharer.email ?? "a member"}`}
            >
              <UserAvatarDisplay
                user={sharer}
                size="xs"
                className="ring-2 ring-card"
              />
            </span>
          )}
          <Badge
            variant={item.source === "owned" ? "secondary" : "outline"}
            className="text-[10px] shrink-0"
          >
            {item.source === "owned" ? "Org" : "Shared"}
          </Badge>
        </div>
      </RowContextMenu>
    </li>
  );
}

function MineRow({
  item,
  entry,
  token,
  href,
  isShared,
  sharing,
  onShare,
  onUnshare,
}: {
  item: MyItem;
  entry: OrgResourceEntry;
  token: string;
  href: string | undefined;
  isShared: boolean;
  sharing: boolean;
  onShare: () => void;
  onUnshare: () => void;
}) {
  return (
    <li>
      <RowContextMenu
        token={token}
        id={item.id}
        title={item.title}
        isShared={isShared}
        onShare={onShare}
        onUnshare={onUnshare}
      >
        <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors">
          <EntityRef
            token={token}
            id={item.id}
            name={item.title}
            href={href}
            showIcon={!entry.hideRowIcon}
            fill
            className="flex-1 min-w-0 text-sm"
          />
          {isShared ? (
            <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
              <Check className="h-3 w-3" />
              Shared
            </Badge>
          ) : (
            <Button
              variant="outline"
              className="shrink-0"
              disabled={sharing}
              onClick={onShare}
            >
              {sharing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Share
                </>
              )}
            </Button>
          )}
        </div>
      </RowContextMenu>
    </li>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function CenterState({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center bg-textured p-4">
      {children}
    </div>
  );
}

function ShowMore({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex justify-center pt-3">
      <Button variant="quiet" disabled={loading} onClick={onClick}>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Show more"}
      </Button>
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

function Empty({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="text-center py-10 border-2 border-dashed border-border rounded-lg">
      <div className="flex justify-center mb-3">{icon}</div>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
        {children}
      </p>
    </div>
  );
}
