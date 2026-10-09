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

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search, Swords, UserPlus } from "lucide-react";

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
import { ErrorNotice } from "@ai-matrx/design-system";
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
import { brandKindCopy } from "@/features/marketing/lib/brand-kind";
import { humanLines, webLocation } from "@/features/marketing/lib/copy-payloads";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

import {
  ensureWebsiteCompetitor,
  findSocialsOnWebsite,
  WebsiteUnreadableError,
  linkAccountToWebsiteCompetitor,
  listBrandCompetitors,
  normalizeDomain,
  trackSocialAccount,
  type BrandCompetitor,
  type CompetitorAccount,
} from "./brand-competitors";
import { COMPETITOR_SOCIAL_PLATFORMS } from "./social-links";
import { CompetitorDetail } from "./CompetitorDetail";
import { compactCount as compact, PLATFORM_LABEL, rowsToSearch } from "./competitor-detail";
import { useCompetitorSocialActions, useFoundSocials } from "./useCompetitorSocials";
import { formatSocialHandle } from "@/features/marketing/lib/social-handle";

const CORE_PLATFORMS = ["instagram", "tiktok", "youtube"];

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

function RowSocialActions({ row, brand }: { row: BrandCompetitor; brand: { id: string; organizationId: string } }) {
  const found = useFoundSocials(brand.id, row.key);
  const { find, track } = useCompetitorSocialActions(brand);
  if (row.progress) return null;
  const busy = found?.status === "finding" || found?.status === "tracking";
  return (
    <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {row.domain ? (
        <Button
          variant="outline"
          disabled={busy}
          icon={found?.status === "finding" ? <Loader2 className="animate-spin" /> : <Search />}
          onClick={async () => {
            // A failure is told in a toast and in the competitor's detail panel, never inside this cell (it would push the row).
            const out = await find(row);
            if (out.status === "found" && out.links.length === 0 && out.message) toast.info(out.message);
            if (out.status === "error" && out.message) {
              toast.error(out.unreadable ? `${out.message}. Open ${row.name} to add their accounts.` : out.message);
            }
          }}
        >
          {found?.status === "finding" ? "Reading…" : "Find socials"}
        </Button>
      ) : null}
      {found?.links.length ? (
        <Button
          variant="primary"
          disabled={busy}
          icon={<UserPlus />}
          onClick={async () => {
            const out = await track(row, found.links);
            if (out.tracked) toast.success(`Tracking ${out.tracked} ${out.tracked === 1 ? "account" : "accounts"}`);
          }}
        >
          {found.status === "tracking" ? "Tracking…" : `Track ${found.links.length}`}
        </Button>
      ) : null}
    </span>
  );
}

export function BrandCompetitorDirectory() {
  const brand = useMarketingBrand();
  const rivals = brandKindCopy(brand).rivals;
  const sites = useBrandSites(brand.id);
  const siteIds = useMemo(() => (sites.data ?? []).map((s) => s.id), [sites.data]);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [searched, setSearched] = useState<ReadonlySet<string>>(new Set());
  const queryClient = useQueryClient();
  const brandRef = useMemo(() => ({ id: brand.id, organizationId: brand.organizationId }), [brand.id, brand.organizationId]);
  const socialActions = useCompetitorSocialActions(brandRef);
  const [jobs, setJobs] = useState<BrandCompetitor[]>([]);
  const patchJob = useCallback((key: string, fn: (job: BrandCompetitor) => BrandCompetitor) => {
    setJobs((current) => current.map((job) => (job.key === key ? fn(job) : job)));
  }, []);

  const list = useQuery({
    queryKey: ["marketing", "brand", brand.id, "competitor-directory", siteIds],
    queryFn: ({ signal }) => listBrandCompetitors(brand.id, siteIds, signal),
    enabled: !sites.isPending && !sites.isError,
  });

  /**
   * "Add competitor" returns at once: the row appears in the list now and each handle reports its
   * own progress (tracking → ok / failed with the reason). Handles are tracked in parallel and a
   * failure on one never blocks the others.
   */
  const startAdd = useCallback(
    (input: { name: string; domain: string | null; handles: [string, string][] }) => {
      const key = `pending:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      setJobs((current) => [
        {
          key,
          name: input.name,
          domain: input.domain,
          seoCompetitorId: null,
          siteId: null,
          websiteTracking: "Adding…",
          accounts: [],
          progress: input.handles.map(([platform]) => ({ platform, state: "tracking", message: null })),
        },
        ...current,
      ]);
      void (async () => {
        let seoId: string | null = null;
        try {
          if (input.domain && siteIds[0]) {
            seoId = await ensureWebsiteCompetitor({
              siteId: siteIds[0],
              organizationId: brand.organizationId,
              domain: input.domain,
              name: input.name,
            });
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "The website competitor could not be saved.");
        }
        await queryClient.invalidateQueries({ queryKey: ["marketing", "brand", brand.id, "competitor-directory"] });
        await Promise.all(
          input.handles.map(async ([platform, value]) => {
            const result = await trackSocialAccount(
              { platform, handle_or_url: value.trim(), role: "competitor", brand_id: brand.id, label: input.name },
              brand.organizationId,
            );
            let message: string | null = result.ok
              ? null
              : result.unavailable
                ? "the social intake service is not reachable"
                : (result.message ?? "rejected");
            if (result.ok && seoId && result.trackedAccountId) {
              try {
                await linkAccountToWebsiteCompetitor(result.trackedAccountId, seoId, brand.organizationId);
              } catch (e) {
                message = `tracked, but not linked to the website: ${e instanceof Error ? e.message : "link failed"}`;
              }
            }
            patchJob(key, (job) => ({
              ...job,
              progress: job.progress?.map((p) =>
                p.platform === platform ? { ...p, state: result.ok ? "ok" : "failed", message } : p,
              ),
            }));
            await queryClient.invalidateQueries({ queryKey: ["marketing", "brand", brand.id, "competitor-directory"] });
          }),
        );
        // Done: a fully successful job hands over to the real row; a partly failed one stays
        // visible so its reasons are not lost.
        let allOk = false;
        setJobs((current) => {
          const job = current.find((j) => j.key === key);
          allOk = !!job?.progress?.every((p) => p.state === "ok" && !p.message);
          return allOk
            ? current.filter((j) => j.key !== key)
            : current.map((j) => (j.key === key ? { ...j, websiteTracking: "Needs attention" } : j));
        });
      })();
    },
    [brand.id, brand.organizationId, siteIds, queryClient, patchJob],
  );

  /** Read each website in turn (three at a time); results land in the same per-row state. */
  async function findAll() {
    const targets = toSearch;
    setBulkOpen(false);
    setBulk({ done: 0, total: targets.length });
    setSearched((prev) => new Set([...prev, ...targets.map((t) => t.key)]));
    let found = 0;
    let next = 0;
    let done = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, targets.length) }, async () => {
        while (next < targets.length) {
          const row = targets[next++];
          const result = await socialActions.find(row);
          if (result.links.length) found += 1;
          done += 1;
          setBulk({ done, total: targets.length });
        }
      }),
    );
    setBulk(null);
    toast.success(
      found
        ? `Found socials for ${found} of ${targets.length}. Use Track on each row to keep them.`
        : `No social links found on ${targets.length === 1 ? "that website" : "those websites"}.`,
    );
  }

  const dismissJob = (key: string) => setJobs((current) => current.filter((j) => j.key !== key));
  const realRows = list.data ?? [];
  const rows = useMemo(() => {
    const pendingNames = new Set(jobs.map((j) => j.name.trim().toLowerCase()));
    return [...jobs, ...realRows.filter((r) => !pendingNames.has(r.name.trim().toLowerCase()))];
  }, [jobs, realRows]);
  // After `rows`: a const read before its declaration throws on the first render.
  const toSearch = useMemo(() => rowsToSearch(rows, searched), [rows, searched]);
  const platforms = useMemo(() => {
    const present = new Set(realRows.flatMap((r) => r.accounts.map((a) => a.platform)));
    const ordered = [...CORE_PLATFORMS, ...[...present].filter((p) => !CORE_PLATFORMS.includes(p)).sort()];
    return ordered;
  }, [realRows]);

  const columns = useMemo<MatrxColumnDef<BrandCompetitor>[]>(() => {
    const cols: MatrxColumnDef<BrandCompetitor>[] = [
      {
        id: "name",
        header: rivals.one,
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
                  title={formatSocialHandle({ platform: a.platform, handle: a.handle, url: a.profileUrl })}
                >
                  {compact(a.followers)}
                  <span className="ml-1 text-[11px] text-muted-foreground">{formatSocialHandle({ platform: a.platform, handle: a.handle, url: a.profileUrl })}</span>
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
        cell: (row) =>
          row.progress ? (
            <span className="flex flex-col text-xs">
              <span className="text-muted-foreground">{row.websiteTracking}</span>
              {row.progress.map((p) =>
                p.state === "failed" || p.message ? (
                  <ErrorNotice
                    key={p.platform}
                    error={`${PLATFORM_LABEL[p.platform] ?? p.platform} was not saved — ${p.message ?? "rejected"}`}
                    operation={`Track ${PLATFORM_LABEL[p.platform] ?? p.platform}`}
                  />
                ) : (
                  <span key={p.platform} className="text-muted-foreground">
                    {PLATFORM_LABEL[p.platform] ?? p.platform}: {p.state === "tracking" ? "tracking…" : "tracking"}
                  </span>
                ),
              )}
              {row.websiteTracking === "Needs attention" ? (
                <Button variant="quiet" onClick={() => dismissJob(row.key)}>
                  Dismiss
                </Button>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">{row.websiteTracking ?? "Social only"}</span>
          ),
        width: 220,
      },
      {
        id: "socials-actions",
        header: "Actions",
        sortable: false,
        filter: false,
        customActions: (row) => <RowSocialActions row={row} brand={{ id: brand.id, organizationId: brand.organizationId }} />,
        width: 240,
      },
    );
    return cols;
  }, [platforms, brand.seg, brand.id, brand.organizationId, rivals.one]);

  if (sites.isPending) return <LoadingSurface label={`Loading ${rivals.manyLower}…`} />;
  if (sites.isError) return <QueryError error={sites.error} />;

  return (
    <div className="space-y-3 p-3">
      <SectionCard
        title={rivals.title}
        headerExtra={
          <div className="flex items-center gap-2">
            {toSearch.length > 0 || bulk ? (
              <Button
                variant="outline"
                disabled={Boolean(bulk)}
                icon={bulk ? <Loader2 className="animate-spin" /> : <Search />}
                onClick={() => setBulkOpen(true)}
              >
                {bulk ? `Reading websites ${bulk.done} of ${bulk.total}` : `Find socials for all (${toSearch.length})`}
              </Button>
            ) : null}
            <Button variant="primary" icon={<Plus />} onClick={() => setAddOpen(true)}>
              {rivals.add}
            </Button>
          </div>
        }
      >
        {list.isError && jobs.length === 0 ? (
          <QueryError error={list.error} onRetry={() => void list.refetch()} />
        ) : list.isPending && jobs.length === 0 ? (
          <LoadingSurface label={`Loading ${rivals.manyLower}…`} />
        ) : (
          <MatrxDataTable
            data={rows}
            columns={columns}
            getRowId={(row) => row.key}
            isFetching={list.isFetching}
            pageSize={25}
            detail={{ enabled: false }}
            window={{
              title: (row) => row.name,
              renderView: (row) => <CompetitorDetail row={row} brand={brandRef} brandSeg={brand.seg} siteIds={siteIds} />,
              enabled: true,
              openOnRowClick: true,
              onOpen: () => {},
            }}
            toolbar={{ searchPlaceholder: `Search ${rivals.manyLower}, sites, handles…` }}
            copy={{
              label: rivals.one,
              listLabel: `Brand ${rivals.manyLower}`,
              location: webLocation(`${brand.name} — ${rivals.title}`),
              rowKind: "brand-competitor",
              listKind: "brand-competitors",
              humanRow: (row) =>
                humanLines([
                  [rivals.one, row.name],
                  ["Website", row.domain],
                  ...row.accounts.map(
                    (a): [string, string] => [
                      PLATFORM_LABEL[a.platform] ?? a.platform,
                      `${formatSocialHandle({ platform: a.platform, handle: a.handle, url: a.profileUrl })} · ${compact(a.followers)} followers`,
                    ],
                  ),
                ]),
            }}
            emptyState={{
              icon: <Swords className="h-8 w-8 text-muted-foreground" />,
              title: rivals.emptyTitle,
              description: rivals.emptyLine(brand.name),
              action: (
                <Button variant="primary" icon={<Plus />} onClick={() => setAddOpen(true)}>
                  {rivals.add}
                </Button>
              ),
            }}
          />
        )}
      </SectionCard>
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Find socials for {toSearch.length} {toSearch.length === 1 ? rivals.oneLower : rivals.manyLower}?</DialogTitle>
            <DialogDescription>
              We read each website for its Instagram, TikTok, YouTube and other profile links. Nothing is saved or tracked until you press Track.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-48 space-y-0.5 overflow-auto rounded-md border border-border p-2 text-xs">
            {toSearch.map((r) => (
              <li key={r.key} className="flex justify-between gap-3">
                <span className="truncate font-medium">{r.name}</span>
                <span className="truncate text-muted-foreground">{r.domain}</span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Search />} onClick={() => void findAll()}>
              Find socials
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {addOpen ? (
        <AddCompetitorDialog
          open
          onOpenChange={setAddOpen}
          hasSite={siteIds.length > 0}
          onSubmit={startAdd}
        />
      ) : null}
    </div>
  );
}

function AddCompetitorDialog({
  open,
  onOpenChange,
  hasSite,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasSite: boolean;
  onSubmit: (input: { name: string; domain: string | null; handles: [string, string][] }) => void;
}) {
  const dispatch = useAppDispatch();
  const rivals = brandKindCopy(useMarketingBrand()).rivals;
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [handles, setHandles] = useState<Record<string, string>>({});
  const [finding, setFinding] = useState(false);
  const [findNote, setFindNote] = useState<string | null>(null);

  const cleanDomain = normalizeDomain(domain);
  const entered = Object.entries(handles).filter(([, v]) => v.trim());
  const firstSiteId = hasSite ? "yes" : null;

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
      setFindNote(e instanceof WebsiteUnreadableError ? `${e.message}. Enter their handles below.` : e instanceof Error ? e.message : "Couldn't read that website");
    } finally {
      setFinding(false);
    }
  }

  function save() {
    const label = name.trim();
    if (!label) return;
    onSubmit({ name: label, domain: cleanDomain, handles: entered.map(([p, v]) => [p, v.trim()]) });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{rivals.add}</DialogTitle>
          <DialogDescription>Name, plus a website and social handles if you have them.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="comp-name">Name</Label>
            <Input id="comp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={rivals.namePlaceholder} />
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
                This brand has no website, so the domain is not tracked as a website {rivals.oneLower}. Socials still are.
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="primary" disabled={!name.trim() || (!cleanDomain && entered.length === 0)} onClick={save}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
