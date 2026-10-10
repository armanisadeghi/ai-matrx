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
import { ExternalLink, Loader2, Plus, Search, Swords, UserPlus } from "lucide-react";

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
} from "@/features/marketing/components/shared/MarketingUi";
import { useBrandSites } from "@/features/marketing/data/hooks";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { brandKindCopy } from "@/features/marketing/lib/brand-kind";
import { humanLines, webLocation } from "@/features/marketing/lib/copy-payloads";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useSurfaceRuntimeRegistration, useSurfaceWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { collectionWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import { useSocialSpend } from "@/features/marketing/social/cost";
import { countOf, withCostOn } from "@/features/marketing/social/social-actions";
import { parseCreateCompetitors, parseUpdateCompetitors } from "./competitor-agent-writes";
import { xmlElement, xmlList } from "@ai-matrx/chat/surfaces/runtime/context-bundle";
import {
  COMPETITOR_DIRECTORY_SURFACE_NAME,
  createCompetitorDirectoryScope,
} from "@/features/surfaces/manifests/marketing-competitor-directory.manifest";
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
import { SocialAccountField } from "@/features/marketing/social/components/SocialAccountInput";
import { parseSocialAccount } from "@/features/marketing/social/link";
import type { SocialPlatform } from "@/features/marketing/social/types";
import { PlatformMark } from "@/features/marketing/social/components/PlatformMark";
import { useCanEditSocial } from "@/features/marketing/social/useCanEditSocial";
import { CompetitorDetail } from "./CompetitorDetail";
import { compactCount as compact, PLATFORM_LABEL, rowsToSearch } from "./competitor-detail";
import { foundKey, useCompetitorSocialActions, useFoundSocials, type FoundSocials } from "./useCompetitorSocials";
import { formatSocialHandle } from "@/features/marketing/lib/social-handle";

/** A name that is just the website (www/scheme/case aside) is shown once. */
function sameAsName(name: string, domain: string | null | undefined): boolean {
  const clean = (v: string) => v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  return !domain || clean(name) === clean(domain);
}

const CORE_PLATFORMS = ["instagram", "tiktok", "youtube"];

function accountsOn(row: BrandCompetitor, platform: string): CompetitorAccount[] {
  return row.accounts.filter((a) => a.platform === platform);
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
  const { pointsText } = useSocialSpend(brand.organizationId);
  const canEdit = useCanEditSocial(undefined, brand.id);
  if (row.progress || !canEdit) return null;
  const busy = found?.status === "finding" || found?.status === "tracking";
  return (
    <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {row.domain ? (
        <Button
          variant="outline"
          disabled={busy}
          title="Free: reads their website"
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
          {found?.status === "finding" ? "Reading…" : "Find socials · Free"}
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
          {found.status === "tracking"
            ? "Tracking…"
            : `Track ${found.links.length}${pointsText("track", found.links.length) ? ` · ${pointsText("track", found.links.length)}` : ""}`}
        </Button>
      ) : null}
    </span>
  );
}

export function BrandCompetitorDirectory() {
  const brand = useMarketingBrand();
  const rivals = brandKindCopy(brand).rivals;
  const canEdit = useCanEditSocial(undefined, brand.id);
  const sites = useBrandSites(brand.id);
  const siteIds = useMemo(() => (sites.data ?? []).map((s) => s.id), [sites.data]);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<BrandCompetitor | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [searched, setSearched] = useState<ReadonlySet<string>>(new Set());
  const queryClient = useQueryClient();
  const brandRef = useMemo(() => ({ id: brand.id, organizationId: brand.organizationId }), [brand.id, brand.organizationId]);
  const socialActions = useCompetitorSocialActions(brandRef);
  const { agentCostText, pointsText } = useSocialSpend(brand.organizationId);
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
    // Only platforms somebody is tracked on: a column of dashes says nothing (the row's Find socials covers the rest).
    const ordered = [...CORE_PLATFORMS.filter((p) => present.has(p)), ...[...present].filter((p) => !CORE_PLATFORMS.includes(p)).sort()];
    return ordered;
  }, [realRows]);

  const columns = useMemo<MatrxColumnDef<BrandCompetitor>[]>(() => {
    const cols: MatrxColumnDef<BrandCompetitor>[] = [
      {
        // Name, website and any in-flight status share one cell: three columns of short text cost more width than they say.
        id: "name",
        header: rivals.one,
        accessorFn: (row) => `${row.name} ${row.domain ?? ""}`.trim(),
        cell: (row) => (
          <span className="flex min-w-0 flex-col">
            <span className="block max-w-full truncate font-medium" title={row.name}>
              {row.name}
            </span>
            {row.progress ? (
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
            ) : row.domain && !sameAsName(row.name, row.domain) ? (
              <a
                href={`https://${row.domain}`}
                target="_blank"
                rel="noreferrer noopener"
                className="matrx-tap-area inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:underline"
                data-clickable=""
                onClick={(e) => e.stopPropagation()}
              >
                <span className="truncate">{row.domain}</span>
                <ExternalLink className="h-3 w-3 shrink-0" aria-label="Opens in a new tab" />
              </a>
            ) : null}
          </span>
        ),
        width: 200,
      },
    ];
    // One column for every platform: a column per platform pushed Posts and Top outlier behind a sideways scroll.
    // Each account is its own link (platform mark + followers); the column sorts by total followers.
    if (platforms.length > 0) {
      cols.push({
        id: "followers",
        header: "Followers",
        accessorFn: (row) => row.accounts.reduce((sum, a) => sum + (a.followers ?? 0), 0),
        cell: (row) =>
          row.accounts.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {[...row.accounts]
                .sort((x, y) => platforms.indexOf(x.platform) - platforms.indexOf(y.platform))
                .map((a) => {
                  const handle = formatSocialHandle({ platform: a.platform, handle: a.handle, url: a.profileUrl });
                  return (
                    <Link
                      key={a.trackedAccountId}
                      href={`/marketing/${brand.seg}/socials/${a.platform}/${a.profileId}`}
                      className="matrx-tap-area inline-flex items-center gap-1 whitespace-nowrap hover:underline"
                      title={`${PLATFORM_LABEL[a.platform] ?? a.platform} ${handle}`}
                      aria-label={`${PLATFORM_LABEL[a.platform] ?? a.platform} ${handle}, ${compact(a.followers)} followers`}
                    >
                      <PlatformMark platform={a.platform} size={14} />
                      {compact(a.followers)}
                    </Link>
                  );
                })}
            </span>
          ),
        width: 240,
      });
    }
    cols.push(
      {
        id: "posts",
        header: "Posts",
        accessorFn: (row) => postsTracked(row),
        cell: (row) => (row.accounts.length ? postsTracked(row).toLocaleString() : "—"),
        width: 80,
      },
      {
        id: "outlier",
        header: "Top 30d",
        accessorFn: (row) => bestOutlier(row)?.score ?? 0,
        cell: (row) => {
          const best = bestOutlier(row);
          if (!best) return <span className="text-muted-foreground">—</span>;
          return (
            <Link
              href={`/marketing/${brand.seg}/socials/${best.account.platform}/${best.account.profileId}`}
              className="whitespace-nowrap hover:underline"
            >
              {best.score.toFixed(1)}×
              <span className="ml-1 text-[11px] text-muted-foreground">
                {PLATFORM_LABEL[best.account.platform] ?? best.account.platform}
              </span>
            </Link>
          );
        },
        width: 100,
      },
      {
        id: "socials-actions",
        header: "Actions",
        sortable: false,
        filter: false,
        customActions: (row) => <RowSocialActions row={row} brand={{ id: brand.id, organizationId: brand.organizationId }} />,
        width: 180,
      },
    );
    return cols;
  }, [platforms, brand.seg, brand.id, brand.organizationId, rivals.one]);

  // The agent surface: built from the rows already on screen (never a fetch).
  const surfaceScope = () => {
    const base = { brand_id: brand.id, brand_name: brand.name, brand_kind: brand.kind };
    if (list.isError) {
      return createCompetitorDirectoryScope({ ...base, competitors_loaded: false, load_error: list.error instanceof Error ? list.error.message : "Could not read the competitors." });
    }
    if (list.isPending || sites.isPending) return createCompetitorDirectoryScope({ ...base, competitors_loaded: false });
    const withAccounts = realRows.filter((r) => r.accounts.length > 0).length;
    return createCompetitorDirectoryScope({
      ...base,
      competitors_loaded: true,
      competitor_count: realRows.length,
      with_accounts_count: withAccounts,
      without_accounts_count: realRows.length - withAccounts,
      competitor_list: xmlList(
        "competitors",
        realRows,
        (r) =>
          xmlElement("competitor", {
            name: r.name,
            website: r.domain,
            accounts: r.accounts
              .map((a) => `${PLATFORM_LABEL[a.platform] ?? a.platform} ${formatSocialHandle({ platform: a.platform, handle: a.handle, url: a.profileUrl })} ${a.followers ?? "unmeasured"}`)
              .join("; "),
            posts: postsTracked(r),
            best_multiple: bestOutlier(r)?.score ?? null,
            can_find_socials: Boolean(r.domain),
          }),
        { maxRows: 40, attrs: { brand: brand.name, total: realRows.length } },
      ),
      competitors: realRows.map((r) => ({
        key: r.key,
        name: r.name,
        website: r.domain,
        tracking: r.websiteTracking,
        accounts: r.accounts.map((a) => ({
          platform: a.platform,
          handle: a.handle,
          followers: a.followers,
          posts_tracked: a.postsTracked,
          best_multiple: a.topOutlier?.score ?? null,
        })),
      })),
    });
  };
  useSurfaceRuntimeRegistration({ surfaceName: COMPETITOR_DIRECTORY_SURFACE_NAME, getScope: surfaceScope, isEditable: true });

  // Agent writes: Add competitor (the dialog's save, `startAdd`), Find socials and Track found
  // accounts (`useCompetitorSocialActions`) — the same paths as the buttons, each approved on a card;
  // tracking accounts names its points first when the cost is worth a warning.
  const competitorWrites = collectionWriteHandlers(
      {
        plural: "competitors",
        singular: "competitor",
        create: {
          parse: (value) => parseCreateCompetitors(value),
          run: async (plan) => {
            startAdd(plan);
            return { id: plan.domain ?? plan.name, name: `${plan.name} (adding; each account reports on its row)` };
          },
          nameOf: (plan) => plan.name,
          refusalFor: (err, savedSoFar) =>
            err instanceof Error && err.message.startsWith("The person declined") && savedSoFar === 0 ? err.message : undefined,
        },
        update: {
          parse: (value) => parseUpdateCompetitors(value, realRows),
          run: async (plan) => {
            let links = queryClient.getQueryData<FoundSocials | null>(foundKey(brand.id, plan.row.key))?.links ?? [];
            let note = "";
            if (plan.findSocials) {
              const out = await socialActions.find(plan.row);
              if (out.status === "error") throw new Error(out.message ?? `${plan.row.name}'s website could not be read.`);
              links = out.links;
              note = `found ${links.length} account${links.length === 1 ? "" : "s"}${links.length ? `: ${links.map((l) => `${l.platform} ${l.url}`).join(", ")}` : ""}`;
            }
            if (plan.trackFound) {
              if (links.length === 0) throw new Error(`No found accounts to track for ${plan.row.name}; send find_socials true first.`);
              const out = await socialActions.track(plan.row, links);
              note = [note, `tracked ${out.tracked}`].filter(Boolean).join("; ");
            }
            return { id: plan.row.key, name: `${plan.row.name}${note ? ` (${note})` : ""}` };
          },
          nameOf: (plan) => plan.row.name,
          changedOf: (plan) => [...(plan.findSocials ? ["find socials"] : []), ...(plan.trackFound ? ["track found"] : [])],
          refusalFor: (err, savedSoFar) =>
            err instanceof Error && err.message.startsWith("The person declined") && savedSoFar === 0 ? err.message : undefined,
        },
      },
      refuseSurfaceWrite,
    );
  // The approval card names the points, however small: one track per handle / per account found.
  const competitorCost = withCostOn(() => competitorWrites);
  useSurfaceWriteHandlers(COMPETITOR_DIRECTORY_SURFACE_NAME, {
    ...competitorWrites,
    ...competitorCost("create_competitors", (value) => {
      const handles = Array.isArray(value)
        ? value.reduce((n: number, c) => n + Object.keys((c as { handles?: object } | null)?.handles ?? {}).length, 0)
        : 0;
      return handles > 0 ? agentCostText("track", handles) : null;
    }),
    ...competitorCost("update_competitors", (value) =>
      countOf(value, (item) => (item as { track_found?: unknown } | null)?.track_found === true) > 0
        ? `${agentCostText("track", 1)} per account tracked`
        : null,
    ),
  });

  if (sites.isPending) return <LoadingSurface label={`Loading ${rivals.manyLower}…`} />;
  if (sites.isError) return <QueryError error={sites.error} />;

  return (
    <div className="space-y-3 p-3 pt-[calc(var(--shell-header-h)+0.75rem)]">
      <section className="min-w-0 rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1.5">
          <h2 className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">{rivals.title}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (toSearch.length > 0 || bulk) ? (
              <Button
                variant="outline"
                disabled={Boolean(bulk)}
                icon={bulk ? <Loader2 className="animate-spin" /> : <Search />}
                onClick={() => setBulkOpen(true)}
              >
                {bulk ? `Reading websites ${bulk.done} of ${bulk.total}` : `Find socials for all (${toSearch.length})`}
              </Button>
            ) : null}
            {canEdit ? (
              <Button variant="primary" icon={<Plus />} onClick={() => setAddOpen(true)}>
                {rivals.add}
              </Button>
            ) : null}
          </div>
        </div>
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
            mobileCardsBreakpoint="sm"
            mobileCards={(row, _i, controls) => (
              <div className="flex flex-col gap-2 p-3" data-clickable="" onClick={() => setDetailRow(row)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    {row.domain ? (
                      <a
                        href={`https://${row.domain}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="matrx-tap-area inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="truncate">{row.domain}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" aria-label="Opens in a new tab" />
                      </a>
                    ) : null}
                  </div>
                  <span onClick={(e) => e.stopPropagation()}>{controls.actions}</span>
                </div>
                {row.accounts.length ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" onClick={(e) => e.stopPropagation()}>
                    {row.accounts.map((a) => (
                      <Link key={a.trackedAccountId} href={`/marketing/${brand.seg}/socials/${a.platform}/${a.profileId}`} className="matrx-tap-area hover:underline">
                        {PLATFORM_LABEL[a.platform] ?? a.platform}{" "}
                        <span className="text-muted-foreground">{formatSocialHandle({ platform: a.platform, handle: a.handle, url: a.profileUrl })}</span>{" "}
                        {compact(a.followers)}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <span onClick={(e) => e.stopPropagation()}>
                    <RowSocialActions row={row} brand={{ id: brand.id, organizationId: brand.organizationId }} />
                  </span>
                )}
              </div>
            )}
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
            }}
          />
        )}
      </section>
      <Dialog open={detailRow !== null} onOpenChange={(o) => !o && setDetailRow(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailRow?.name}</DialogTitle>
          </DialogHeader>
          {detailRow ? <CompetitorDetail row={detailRow} brand={brandRef} brandSeg={brand.seg} siteIds={siteIds} /> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Find socials for {toSearch.length} {toSearch.length === 1 ? rivals.oneLower : rivals.manyLower}?</DialogTitle>
            <DialogDescription>
              We read each website for its profile links. Nothing is tracked until you press Track{pointsText("track") ? `; each account tracked uses ${pointsText("track")}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-48 space-y-0.5 overflow-auto rounded-md border border-border p-2 text-xs">
            {toSearch.map((r) => (
              <li key={r.key} className="flex justify-between gap-3">
                <span className="truncate font-medium">{r.name}</span>
                {sameAsName(r.name, r.domain) ? null : <span className="truncate text-muted-foreground">{r.domain}</span>}
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
  const marketingBrand = useMarketingBrand();
  const rivals = brandKindCopy(marketingBrand).rivals;
  const organizationId = marketingBrand.organizationId;
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [handles, setHandles] = useState<Record<string, string>>({});
  const [finding, setFinding] = useState(false);
  const [findNote, setFindNote] = useState<string | null>(null);

  const cleanDomain = normalizeDomain(domain);
  const entered = Object.entries(handles).filter(([, v]) => v.trim());
  const { pointsText: dialogPointsText } = useSocialSpend(organizationId);
  const addPoints = entered.length > 0 ? dialogPointsText("track", entered.length) : null;
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
    onSubmit({
      name: label,
      domain: cleanDomain,
      handles: entered.map(([p, v]) => {
        const parsed = parseSocialAccount(v, p as SocialPlatform);
        return [p, parsed.status === "ok" ? parsed.url : v.trim()];
      }),
    });
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
                Find their socials · Free
              </Button>
            </div>
            {!firstSiteId && cleanDomain ? (
              <p className="text-[11px] text-muted-foreground">
                This brand has no website, so the domain is not tracked as a website {rivals.oneLower}. Socials still are.
              </p>
            ) : null}
            {findNote ? <p className="text-[11px] text-muted-foreground">{findNote}</p> : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {COMPETITOR_SOCIAL_PLATFORMS.map((p) => (
              <div key={p.id} className="min-w-0 space-y-1">
                <Label htmlFor={`comp-${p.id}`}>{p.label}</Label>
                <SocialAccountField
                  label={`${p.label} handle or link`}
                  id={`comp-${p.id}`}
                  value={handles[p.id] ?? ""}
                  onChange={(text) => setHandles((prev) => ({ ...prev, [p.id]: text }))}
                  contextPlatform={p.id}
                  organizationId={organizationId}
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
            {addPoints ? `Add · ${addPoints}` : "Add · Free"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
