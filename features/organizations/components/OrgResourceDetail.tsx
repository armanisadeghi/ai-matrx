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
import { idMatchesQuery } from "@/utils/search-scoring";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CrumbTrailHeader } from "@/features/shell/components/header/templates/CrumbTrailHeader";
import { ItemContextMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import {
  UserAvatarDisplay,
  type UserLike,
} from "@/components/user/UserIdentity";
import {
  getOrganizationBySlugOrId,
  getOrganizationMembers,
} from "@/features/organizations/service";
import { revokeOrgShare } from "@/utils/permissions/orgModeration";
import { getShareableResource } from "@/utils/permissions/registry";
import {
  resolveEntityToken,
  tryGetEntityInfo,
} from "@/features/scopes/registry/entityRegistry";
import { isEntityTypeToken } from "@/types/generated/entity-types.generated";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  getEntry,
  getContentRole,
  type OrgResourceEntry,
} from "../resource-catalogue";
import {
  useOrgContributableItems,
  type MyItem,
} from "../hooks/useOrgContributableItems";
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
  const [userMap, setUserMap] = React.useState<Map<string, UserLike>>(
    new Map(),
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setResolving(true);
      const resolved = await getOrganizationBySlugOrId(orgParam);
      if (cancelled) return;
      if (!resolved) {
        setOrg(null);
        setResolving(false);
        return;
      }
      setOrg({ id: resolved.id, name: resolved.name, slug: resolved.slug });
      setResolving(false);
      // Members → user map for "who shared" attribution.
      const members = await getOrganizationMembers(resolved.id);
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
  }, [orgParam]);

  const shared = useOrgSharedItems(org?.id ?? null, entry);
  const mine = useOrgContributableItems(
    org?.id ?? null,
    org?.name ?? "",
    entry,
    () => {
      shared.reload();
    },
  );

  async function unshare(item: { id: string }) {
    if (!entry?.shareKey || !org) return;
    const result = await revokeOrgShare(entry.shareKey, item.id, org.id);
    if (result.success) {
      toast.success("Removed from the team.");
      shared.reload();
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/organizations")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Organizations
          </Button>
        </Card>
      </CenterState>
    );
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
   * The entity registry is the canonical route source; the sharing registry's
   * `urlPathTemplate` is a SECOND, DB-backed one that disagrees with it in
   * places (FOUND_DEFECTS D137/D138). Prefer the registry, and fall back to the
   * share template only where the registry has no route yet, so this surface's
   * set of working doors is a strict superset of what it had.
   */
  const registryHasRoute = Boolean(tryGetEntityInfo(token)?.hrefFor);
  const shareable = entry.shareKey
    ? getShareableResource(entry.shareKey)
    : undefined;
  const fallbackHref = (id: string): string | undefined =>
    registryHasRoute || !shareable
      ? undefined
      : shareable.urlPathTemplate.replace("{id}", id);
  const filteredMine = mine.items.filter(
    (it) =>
      it.title.toLowerCase().includes(query.toLowerCase()) ||
      idMatchesQuery(it, query),
  );

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
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(
                  `/organizations/${org.slug}/${entry.orgRoute}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              Full view
              <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
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
                {!shared.loading && (
                  <Badge variant="secondary" className="text-xs">
                    {shared.items.length}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                {entry.labelPlural} the org owns or that members have shared
                with the team.
              </p>

              {shared.loading ? (
                <Loading />
              ) : shared.items.length === 0 ? (
                <Empty
                  icon={<Icon className="h-7 w-7 text-muted-foreground" />}
                >
                  Nothing here yet. Share one of yours from the right.
                </Empty>
              ) : (
                <ul className="space-y-1.5">
                  {shared.items.map((item) => (
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
                <Empty
                  icon={<Icon className="h-7 w-7 text-muted-foreground" />}
                >
                  This kind can&apos;t be shared with an org yet.
                </Empty>
              ) : (
                <>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      aria-label={`Search your ${entry.labelPlural.toLowerCase()}`}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={`Search your ${entry.labelPlural.toLowerCase()}…`}
                      className="pl-9"
                    />
                  </div>
                  {mine.loading ? (
                    <Loading />
                  ) : filteredMine.length === 0 ? (
                    <Empty
                      icon={<Icon className="h-7 w-7 text-muted-foreground" />}
                    >
                      {mine.items.length === 0
                        ? `You don't own any ${entry.labelPlural.toLowerCase()} yet.`
                        : "No matches."}
                    </Empty>
                  ) : (
                    <ul className="space-y-1.5">
                      {filteredMine.map((item) => {
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
              size="sm"
              variant="outline"
              className="h-7 shrink-0"
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
