"use client";

/**
 * The brand-level competitor list — works with or without a website.
 *
 * One row per competitor. A competitor that is both a domain and a set of handles is one row
 * (the association `social_tracked_account → seo_competitor` ties them). Per platform it shows
 * followers (a link to the account detail route), posts tracked, and the best outlier of the
 * last 30 days. "Add competitor" takes a name plus an optional domain and handles;
 * "Find their socials" reads the competitor's site for its social links.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search, Swords } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import {
  LoadingSurface,
  QueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { useBrandSites } from "@/features/marketing/data/hooks";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { humanLines, webLocation } from "@/features/marketing/lib/copy-payloads";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

import {
  ensureWebsiteCompetitor,
  findSocialsOnWebsite,
  linkAccountToWebsiteCompetitor,
  listBrandCompetitors,
  normalizeDomain,
  trackSocialAccount,
  type BrandCompetitor,
  type CompetitorAccount,
  type TrackSocialResult,
} from "./brand-competitors";
import { COMPETITOR_SOCIAL_PLATFORMS } from "./social-links";

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  x: "X",
  threads: "Threads",
  pinterest: "Pinterest",
  reddit: "Reddit",
  snapchat: "Snapchat",
};
const CORE_PLATFORMS = ["instagram", "tiktok", "youtube"];

function compact(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function accountsOn(row: BrandCompetitor, platform: string): CompetitorAccount[] {
  return row.accounts.filter((a) => a.platform === platform);
}
function totalFollowers(row: BrandCompetitor): number {
  return row.accounts.reduce((sum, a) => sum + (a.followers ?? 0), 0);
}
function postsTracked(row: BrandCompetitor): number {
  return row.accounts.reduce((sum, a) => sum + a.postsTracked, 0);
}
function bestOutlier(row: BrandCompetitor) {
  let best: { account: CompetitorAccount; score: number } | null = null;
  for (const a of row.accounts) {
    if (a.topOutlier && (!best || a.topOutlier.score > best.score)) {
      best = { account: a, score: a.topOutlier.score };
    }
  }
  return best;
}

export function BrandCompetitorDirectory() {
  const brand = useMarketingBrand();
  const sites = useBrandSites(brand.id);
  const siteIds = useMemo(() => (sites.data ?? []).map((s) => s.id), [sites.data]);
  const [addOpen, setAddOpen] = useState(false);

  const list = useQuery({
    queryKey: ["marketing", "brand", brand.id, "competitor-directory", siteIds],
    queryFn: ({ signal }) => listBrandCompetitors(brand.id, siteIds, signal),
    enabled: !sites.isPending && !sites.isError,
  });

  const rows = list.data ?? [];
  const platforms = useMemo(() => {
    const present = new Set(rows.flatMap((r) => r.accounts.map((a) => a.platform)));
    const ordered = [...CORE_PLATFORMS, ...[...present].filter((p) => !CORE_PLATFORMS.includes(p)).sort()];
    return ordered;
  }, [rows]);

  const columns = useMemo<MatrxColumnDef<BrandCompetitor>[]>(() => {
    const cols: MatrxColumnDef<BrandCompetitor>[] = [
      {
        id: "name",
        header: "Competitor",
        accessorFn: (row) => row.name,
        cell: (row) => <span className="truncate font-medium">{row.name}</span>,
        width: 200,
      },
      {
        id: "domain",
        header: "Website",
        accessorFn: (row) => row.domain ?? "",
        cell: (row) => row.domain ?? <span className="text-muted-foreground">—</span>,
        width: 170,
      },
    ];
    for (const platform of platforms) {
      cols.push({
        id: `followers_${platform}`,
        header: PLATFORM_LABEL[platform] ?? platform,
        accessorFn: (row) => accountsOn(row, platform).reduce((s, a) => s + (a.followers ?? 0), 0),
        cell: (row) => {
          const accounts = accountsOn(row, platform);
          if (accounts.length === 0) return <span className="text-muted-foreground">—</span>;
          return (
            <span className="flex flex-col">
              {accounts.map((a) => (
                <Link
                  key={a.trackedAccountId}
                  href={`/marketing/${brand.seg}/socials/${a.platform}/${a.trackedAccountId}`}
                  className="whitespace-nowrap hover:underline"
                  title={`@${a.handle}`}
                >
                  {compact(a.followers)}
                  <span className="ml-1 text-[11px] text-muted-foreground">@{a.handle}</span>
                </Link>
              ))}
            </span>
          );
        },
        width: 150,
      });
    }
    cols.push(
      {
        id: "followers_total",
        header: "Followers",
        accessorFn: (row) => totalFollowers(row),
        cell: (row) => (row.accounts.length ? compact(totalFollowers(row)) : "—"),
        width: 100,
      },
      {
        id: "posts",
        header: "Posts tracked",
        accessorFn: (row) => postsTracked(row),
        cell: (row) => (row.accounts.length ? postsTracked(row).toLocaleString() : "—"),
        width: 110,
      },
      {
        id: "outlier",
        header: "Top outlier 30d",
        accessorFn: (row) => bestOutlier(row)?.score ?? 0,
        cell: (row) => {
          const best = bestOutlier(row);
          if (!best) return <span className="text-muted-foreground">—</span>;
          return (
            <Link
              href={`/marketing/${brand.seg}/socials/${best.account.platform}/${best.account.trackedAccountId}`}
              className="whitespace-nowrap hover:underline"
            >
              {best.score.toFixed(1)}×
              <span className="ml-1 text-[11px] text-muted-foreground">
                {PLATFORM_LABEL[best.account.platform] ?? best.account.platform}
              </span>
            </Link>
          );
        },
        width: 140,
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (row) => row.websiteTracking ?? (row.accounts.length ? "social only" : ""),
        cell: (row) => (
          <span className="text-muted-foreground">
            {row.websiteTracking ?? "Social only"}
          </span>
        ),
        width: 120,
      },
    );
    return cols;
  }, [platforms, brand.seg]);

  if (sites.isPending) return <LoadingSurface label="Loading competitors…" />;
  if (sites.isError) return <QueryError error={sites.error} />;

  return (
    <div className="space-y-3 p-3">
      <SectionCard
        title="Competitors"
        headerExtra={
          <Button size="sm" variant="primary" icon={<Plus />} onClick={() => setAddOpen(true)}>
            Add competitor
          </Button>
        }
      >
        {list.isError ? (
          <QueryError error={list.error} onRetry={() => void list.refetch()} />
        ) : list.isPending ? (
          <LoadingSurface label="Loading competitors…" />
        ) : (
          <MatrxDataTable
            data={rows}
            columns={columns}
            getRowId={(row) => row.key}
            isFetching={list.isFetching}
            pageSize={25}
            toolbar={{ searchPlaceholder: "Search competitors, sites, handles…" }}
            copy={{
              label: "Competitor",
              listLabel: "Brand competitors",
              location: webLocation(`${brand.name} — Competitors`),
              rowKind: "brand-competitor",
              listKind: "brand-competitors",
              humanRow: (row) =>
                humanLines([
                  ["Competitor", row.name],
                  ["Website", row.domain],
                  ...row.accounts.map(
                    (a): [string, string] => [
                      PLATFORM_LABEL[a.platform] ?? a.platform,
                      `@${a.handle} · ${compact(a.followers)} followers`,
                    ],
                  ),
                ]),
            }}
            emptyState={{
              icon: <Swords className="h-8 w-8 text-muted-foreground" />,
              title: "No competitors yet",
              description: `Add the rivals ${brand.name} competes with, by website, social handle, or both.`,
              action: (
                <Button variant="primary" icon={<Plus />} onClick={() => setAddOpen(true)}>
                  Add competitor
                </Button>
              ),
            }}
          />
        )}
      </SectionCard>
      {addOpen ? (
        <AddCompetitorDialog
          open
          onOpenChange={setAddOpen}
          brandId={brand.id}
          organizationId={brand.organizationId}
          firstSiteId={siteIds[0] ?? null}
          onAdded={() => void list.refetch()}
        />
      ) : null}
    </div>
  );
}

function AddCompetitorDialog({
  open,
  onOpenChange,
  brandId,
  organizationId,
  firstSiteId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  organizationId: string;
  firstSiteId: string | null;
  onAdded: () => void;
}) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [handles, setHandles] = useState<Record<string, string>>({});
  const [finding, setFinding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [findNote, setFindNote] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<TrackSocialResult[]>([]);

  const cleanDomain = normalizeDomain(domain);
  const entered = Object.entries(handles).filter(([, v]) => v.trim());

  async function findSocials() {
    if (!cleanDomain) return;
    setFinding(true);
    setFindNote(null);
    try {
      const found = await findSocialsOnWebsite(cleanDomain, dispatch);
      if (found.length === 0) {
        setFindNote("No social links found on that website.");
      } else {
        setHandles((prev) => {
          const next = { ...prev };
          for (const link of found) if (!next[link.platform]?.trim()) next[link.platform] = link.url;
          return next;
        });
        setFindNote(`Found ${found.length}: ${found.map((l) => PLATFORM_LABEL[l.platform]).join(", ")}. Check them, then add.`);
      }
    } catch (e) {
      setFindNote(e instanceof Error ? e.message : "The website could not be read.");
    } finally {
      setFinding(false);
    }
  }

  async function save() {
    const label = name.trim();
    if (!label) return;
    setSaving(true);
    setOutcomes([]);
    try {
      let seoId: string | null = null;
      if (cleanDomain && firstSiteId) {
        seoId = await ensureWebsiteCompetitor({
          siteId: firstSiteId,
          organizationId,
          domain: cleanDomain,
          name: label,
        });
      }
      const results: TrackSocialResult[] = [];
      for (const [platform, value] of entered) {
        const result = await trackSocialAccount(
          { platform, handle_or_url: value.trim(), role: "competitor", brand_id: brandId, label },
          dispatch,
        );
        if (result.ok && seoId && result.trackedAccountId) {
          try {
            await linkAccountToWebsiteCompetitor(result.trackedAccountId, seoId, organizationId);
          } catch (e) {
            result.message = `Tracked, but not linked to the website: ${e instanceof Error ? e.message : "link failed"}`;
          }
        }
        results.push(result);
      }
      setOutcomes(results);
      await queryClient.invalidateQueries({ queryKey: ["marketing", "brand", brandId, "competitor-directory"] });
      onAdded();
      if (results.every((r) => r.ok)) {
        toast.success(`${label} added`);
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the competitor.");
    } finally {
      setSaving(false);
    }
  }

  const anyUnavailable = outcomes.some((o) => o.unavailable);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add competitor</DialogTitle>
          <DialogDescription>Name, plus a website and social handles if you have them.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="comp-name">Name</Label>
            <Input id="comp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="comp-domain">Website</Label>
            <div className="flex gap-2">
              <Input id="comp-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" />
              <Button
                variant="outline"
                icon={finding ? <Loader2 className="animate-spin" /> : <Search />}
                disabled={!cleanDomain || finding}
                onClick={() => void findSocials()}
              >
                Find their socials
              </Button>
            </div>
            {!firstSiteId && cleanDomain ? (
              <p className="text-[11px] text-muted-foreground">
                This brand has no website, so the domain is not tracked as a website competitor. Socials still are.
              </p>
            ) : null}
            {findNote ? <p className="text-[11px] text-muted-foreground">{findNote}</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {COMPETITOR_SOCIAL_PLATFORMS.map((p) => (
              <div key={p.id} className="space-y-1">
                <Label htmlFor={`comp-${p.id}`}>{p.label}</Label>
                <Input
                  id={`comp-${p.id}`}
                  value={handles[p.id] ?? ""}
                  onChange={(e) => setHandles((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder="@handle or link"
                />
              </div>
            ))}
          </div>
          {outcomes.length > 0 ? (
            <ul className="space-y-1 rounded-md border border-border p-2 text-xs">
              {outcomes.map((o) => (
                <li key={o.platform} className={o.ok ? "" : "text-destructive"}>
                  {PLATFORM_LABEL[o.platform] ?? o.platform}: {o.ok ? "tracking" : o.unavailable ? "not saved — intake service unavailable" : `not saved — ${o.message ?? "rejected"}`}
                </li>
              ))}
              {anyUnavailable ? (
                <li className="text-muted-foreground">
                  The social intake service is not reachable yet, so no handle was tracked. The website
                  competitor, if any, was saved.
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="primary" disabled={!name.trim() || saving || (!cleanDomain && entered.length === 0)} onClick={() => void save()}>
            {saving ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
