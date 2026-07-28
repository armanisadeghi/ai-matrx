"use client";

/**
 * app/(core)/marketing/content-plan/create-dense/_components/ArchetypeConsole.tsx
 *
 * "Nothing (or half a site) → a structured plan, in a couple of minutes."
 *
 * One screen, three levels, no page scroll: pick a shape (left), set the
 * counts and read the persistent readiness checklist (middle), and see the
 * EXACT routes that will be created before committing (right, the primary
 * focus rectangle). The status bar and the commit bar bracket it.
 *
 * Everything is live: archetypes come from `plan.profile.template_map`, the
 * diff comes from the same `usePlanNodes` cache the tree and pillar map read
 * (so a commit lands in every view at once), and the foundation half of the
 * checklist is measured against the real CMS site when one is linked.
 *
 * It never touches the tree editor or the pillar map — it writes plan.node
 * rows through the canonical service and lets those views render them.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ExternalLink,
  ListTree,
  Loader2,
  Map as MapIcon,
  RefreshCw,
} from "lucide-react";

import { Panel } from "react-resizable-panels";

import { ClientGroup } from "@/app/(dev)/demos/resizables/_lib/ClientGroup";
import { Handle } from "@/app/(dev)/demos/resizables/_lib/Handle";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useContentPlanSites } from "@/features/marketing/content-plan/components/ContentPlanHeader";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { planKeys, usePlanNodes } from "@/features/marketing/content-plan/data/hooks";
import { usePlanWorkspaceParams } from "@/features/marketing/content-plan/hooks/usePlanWorkspaceParams";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import {
  DEFAULT_NODE_STATUS,
  expandArchetype,
  flattenSpecs,
  type ExpandedArchetype,
  type PlanTreeNodeSpec,
} from "../_lib/archetypes";
import { useArchetypeLibrary, useCmsFacts } from "../_lib/hooks";
import { buildReadiness } from "../_lib/readiness";
import {
  instantiateArchetype,
  readCommittedArchetype,
  recordSiteArchetype,
  type InstantiationRow,
} from "../_lib/service";
import { ArchetypeList } from "./ArchetypeList";
import { CountsPanel } from "./CountsPanel";
import { RoutePreview, buildPreviewRows } from "./RoutePreview";

const LAYOUT_COOKIE = "panels:content-plan-create-dense";

type MobilePane = "shape" | "counts" | "routes";
const MOBILE_PANES: { key: MobilePane; label: string }[] = [
  { key: "shape", label: "Shape" },
  { key: "counts", label: "Counts" },
  { key: "routes", label: "Routes" },
];

function Stat({
  label,
  value,
  tone = "default",
  title,
  className,
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn" | "bad";
  title?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline gap-1.5", className)} title={title}>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-sm font-medium tabular-nums",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "bad" && "text-destructive",
          tone === "default" && "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function ArchetypeConsole() {
  const { siteId, setSiteId } = usePlanWorkspaceParams();
  const { sites, orgSites, scopedSites } = useContentPlanSites();
  const queryClient = useQueryClient();

  // Same auto-select behaviour as the plan workspace header — land on a site
  // of the active org rather than an empty screen.
  useEffect(() => {
    if (!siteId && scopedSites.length > 0) setSiteId(scopedSites[0].id);
  }, [siteId, scopedSites, setSiteId]);

  const site =
    (sites.data ?? []).find((row) => row.id === siteId) ??
    orgSites.find((row) => row.id === siteId) ??
    null;

  const nodes = usePlanNodes(siteId);
  const library = useArchetypeLibrary(site?.organization_id ?? null);
  const cms = useCmsFacts(
    site ? { id: site.id, domain: site.domain, settings: site.settings } : null,
  );
  const pageTypes = useCategories({ dimension: CATEGORY_DIMENSIONS.planPageType });
  const statuses = useCategories({ dimension: CATEGORY_DIMENSIONS.planStatus });

  const committed = useMemo(
    () => (site ? readCommittedArchetype(site.settings) : null),
    [site],
  );

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [countOverrides, setCountOverrides] = useState<Record<string, number>>({});
  const [lastRun, setLastRun] = useState<InstantiationRow[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [mobilePane, setMobilePane] = useState<MobilePane>("shape");
  const isMobile = useIsMobile();

  const archetypes = library.data?.archetypes ?? [];

  // Selecting a site adopts whatever that site already committed to — this
  // console is a place you come BACK to. Keyed on the site ID ALONE: a commit
  // rewrites `settings.content_plan`, and re-running this on that change would
  // wipe the run report (including the failure rows) the moment it arrived.
  // Waits for the site ROW (not just the id) so a site that already committed
  // an archetype is adopted rather than reset to the first one in the list.
  const adoptedSiteId = useRef<string | null>(null);
  useEffect(() => {
    if (!site || adoptedSiteId.current === site.id) return;
    adoptedSiteId.current = site.id;
    setLastRun(null);
    setCountOverrides(committed?.counts ?? {});
    setSelectedKey(null);
  }, [site, committed]);

  // Derived, not an effect: with nothing picked yet, fall back to what the
  // site already committed, then to the first archetype. (Setting that in an
  // effect would be a cascading render — react-hooks/set-state-in-effect.)
  const effectiveKey = selectedKey ?? committed?.key ?? archetypes[0]?.key ?? null;
  const archetype = archetypes.find((entry) => entry.key === effectiveKey) ?? null;

  const defaultCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const family of archetype?.families ?? []) out[family.key] = family.count;
    return out;
  }, [archetype]);

  const effectiveCounts = useMemo(() => {
    const out: Record<string, number> = { ...defaultCounts };
    for (const [key, value] of Object.entries(countOverrides)) {
      if (key in out) out[key] = value;
    }
    return out;
  }, [defaultCounts, countOverrides]);

  const expansion = useMemo((): {
    expanded: ExpandedArchetype | null;
    error: string | null;
  } => {
    if (!archetype) return { expanded: null, error: null };
    try {
      return { expanded: expandArchetype(archetype, { counts: effectiveCounts }), error: null };
    } catch (error) {
      return { expanded: null, error: extractErrorMessage(error) };
    }
  }, [archetype, effectiveCounts]);

  const expanded = expansion.expanded;

  const flatWithDepth = useMemo(() => {
    if (!expanded) return [] as { spec: PlanTreeNodeSpec; depth: number }[];
    const out: { spec: PlanTreeNodeSpec; depth: number }[] = [];
    const walk = (specs: PlanTreeNodeSpec[], depth: number) => {
      for (const spec of specs) {
        out.push({ spec, depth });
        walk(spec.children, depth + 1);
      }
    };
    walk(expanded.roots, 0);
    return out;
  }, [expanded]);

  const liveNodes = useMemo(() => nodes.data ?? [], [nodes.data]);

  const previewRows = useMemo(
    () =>
      expanded
        ? buildPreviewRows({ roots: expanded.roots, liveNodes, lastRun })
        : [],
    [expanded, liveNodes, lastRun],
  );

  const readiness = useMemo(() => {
    if (!expanded) return null;
    return buildReadiness({
      expanded,
      liveNodes,
      hasBrand: Boolean(site?.brand_id),
      cms: cms.data ?? null,
      cmsError: cms.isError ? extractErrorMessage(cms.error) : null,
    });
  }, [expanded, liveNodes, site?.brand_id, cms.data, cms.isError, cms.error]);

  // With no site there is nothing to diff against — showing "90 new" then
  // would be a number about no site at all.
  const newCount = siteId
    ? previewRows.filter((row) => row.state === "new").length
    : 0;
  const existsCount = siteId
    ? previewRows.filter((row) => row.state === "exists").length
    : 0;
  const conflictCount = siteId
    ? previewRows.filter((row) => row.state === "conflict").length
    : 0;
  const isBusy = progress !== null;

  const pageTypeIdBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of pageTypes.categories) {
      if (category.slug) map.set(category.slug, category.id);
    }
    return map;
  }, [pageTypes.categories]);

  const statusId = useMemo(
    () =>
      statuses.categories.find((category) => category.slug === DEFAULT_NODE_STATUS)?.id ??
      null,
    [statuses.categories],
  );

  const missingPageTypes = useMemo(() => {
    if (!expanded || pageTypes.categories.length === 0) return [];
    const wanted = new Set(
      flattenSpecs(expanded.roots)
        .map((spec) => spec.pageType)
        .filter((slug): slug is string => Boolean(slug)),
    );
    return [...wanted].filter((slug) => !pageTypeIdBySlug.has(slug));
  }, [expanded, pageTypes.categories.length, pageTypeIdBySlug]);

  const handleCommit = async () => {
    if (!site || !siteId || !expanded) return;
    const ok = await confirm({
      title: `Create ${newCount} page${newCount === 1 ? "" : "s"} on ${site.domain ?? site.name}?`,
      description:
        `${existsCount} route${existsCount === 1 ? "" : "s"} already exist and will be left exactly as they are. ` +
        `Nothing is overwritten — this only adds the missing rows and records the counts on the site.` +
        (conflictCount > 0
          ? ` ${conflictCount} route${conflictCount === 1 ? " is" : "s are"} occupied by a different page and will be rejected by the database (reported as failed).`
          : ""),
      confirmLabel: "Create pages",
    });
    if (!ok) return;

    setProgress({ done: 0, total: flatWithDepth.length });
    try {
      const result = await instantiateArchetype({
        siteId,
        organizationId: site.organization_id,
        roots: expanded.roots,
        liveNodes,
        pageTypeIdBySlug,
        statusId,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setLastRun(result.rows);
      await queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });

      if (result.failed > 0) {
        toast.error(
          `${result.created} created, ${result.existing} already present, ${result.failed} failed — see the routes marked "failed".`,
        );
      } else {
        toast.success(
          `${result.created} page${result.created === 1 ? "" : "s"} created${
            result.existing > 0 ? `, ${result.existing} already present` : ""
          }.`,
        );
      }

      // Record the promised work order LAST — the pages are the artifact; a
      // settings clash must never look like the plan failed.
      try {
        await recordSiteArchetype({
          siteId,
          expectedVersion: site.version,
          currentSettings: site.settings,
          archetypeKey: expanded.archetype,
          counts: expanded.counts,
        });
        await queryClient.invalidateQueries({ queryKey: marketingKeys.siteOptions() });
      } catch (error) {
        toast.error(`Counts not recorded on the site: ${extractErrorMessage(error)}`);
      }
    } catch (error) {
      toast.error(`Commit failed: ${extractErrorMessage(error)}`);
    } finally {
      setProgress(null);
    }
  };

  // Built once, rendered by whichever layout is active (desktop panels or the
  // mobile pane switch) — never a second copy of the same panel.
  const archetypeListNode = (
    <>
      <div className="sticky top-0 z-10 border-b border-border bg-background px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Site shape
      </div>
      <ArchetypeList
        archetypes={archetypes}
        selectedKey={effectiveKey}
        committedKey={committed?.key ?? null}
        onSelect={(key) => {
          setSelectedKey(key);
          setCountOverrides(committed?.key === key ? (committed.counts ?? {}) : {});
          setLastRun(null);
        }}
      />
    </>
  );

  const countsPanelNode = expanded ? (
    <CountsPanel
      expanded={expanded}
      counts={effectiveCounts}
      defaultCounts={defaultCounts}
      onCountChange={(key, next) =>
        setCountOverrides((current) => ({ ...current, [key]: next }))
      }
      onResetCounts={() => setCountOverrides({})}
      checklist={readiness?.items ?? []}
      checklistLoading={nodes.isLoading || cms.isLoading}
    />
  ) : (
    <ConsoleMessage>Select an archetype.</ConsoleMessage>
  );

  // ── error / empty gates ─────────────────────────────────────────────────

  if (sites.isError) {
    return (
      <ConsoleMessage tone="error">
        Could not load sites: {extractErrorMessage(sites.error)}
      </ConsoleMessage>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden pt-[var(--shell-header-h)]">
      {/* ── status bar ─────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-muted/30 px-2.5 py-1.5">
        <Select value={siteId ?? ""} onValueChange={setSiteId}>
          <SelectTrigger className="h-6 w-56 border-border bg-background text-xs shadow-none">
            <SelectValue placeholder={sites.isLoading ? "Loading sites…" : "Pick a site"} />
          </SelectTrigger>
          <SelectContent>
            {orgSites.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.domain ?? option.name}
                {!option.brand_id ? " — no brand" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Stat
          label="live"
          value={nodes.isLoading ? "…" : `${liveNodes.length} nodes`}
          tone={liveNodes.length === 0 ? "warn" : "default"}
          title="Plan nodes already on this site"
        />
        <Stat
          className="hidden sm:flex"
          label="brand"
          value={site ? (site.brand_id ? "set" : "missing") : "—"}
          tone={site ? (site.brand_id ? "good" : "bad") : "default"}
        />
        <Stat
          className="hidden md:flex"
          label="committed"
          value={committed ? committed.key : "none"}
          tone={committed ? "good" : "default"}
          title={
            committed?.instantiatedAt
              ? `Last instantiated ${new Date(committed.instantiatedAt).toLocaleString()}`
              : "No archetype has been committed on this site yet"
          }
        />
        <Stat
          label="new"
          value={siteId ? String(newCount) : "—"}
          tone={newCount > 0 ? "warn" : "good"}
        />
        <Stat label="exists" value={siteId ? String(existsCount) : "—"} />
        <Stat
          label="ready"
          value={siteId && readiness ? `${readiness.met}/${readiness.total}` : "—"}
          tone={
            readiness && readiness.total > 0 && readiness.met === readiness.total
              ? "good"
              : "warn"
          }
        />

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs"
            disabled={isBusy}
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: planKeys.all });
              void cms.refetch();
              void library.refetch();
            }}
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-xs">
            <Link href={siteId ? `/marketing/content-plan?site=${siteId}` : "/marketing/content-plan"}>
              <ListTree className="h-3 w-3" />
              Tree
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-xs">
            <Link
              href={
                siteId
                  ? `/marketing/content-plan?site=${siteId}&view=map`
                  : "/marketing/content-plan?view=map"
              }
            >
              <MapIcon className="h-3 w-3" />
              Map
            </Link>
          </Button>
        </div>
      </div>

      {/* ── loud, non-blocking alarms ───────────────────────────────────── */}
      {site && !site.brand_id ? (
        <Banner tone="error">
          This site has no brand — the database rejects every plan row for it, by design. Assign a
          brand in Marketing → Sites, then come back.
        </Banner>
      ) : null}
      {library.data?.problems.length ? (
        <Banner tone="error">
          Archetype config problem — {library.data.problems.join(" · ")}
        </Banner>
      ) : null}
      {expansion.error ? (
        <Banner tone="error">Cannot expand this archetype — {expansion.error}</Banner>
      ) : null}
      {missingPageTypes.length > 0 ? (
        <Banner tone="warn">
          {missingPageTypes.length} page type{missingPageTypes.length === 1 ? "" : "s"} in this
          archetype are not in the plan_page_type vocabulary ({missingPageTypes.join(", ")}) — those
          pages will be created without a page type.
        </Banner>
      ) : null}
      {nodes.isError ? (
        <Banner tone="error">
          Could not load the existing plan: {extractErrorMessage(nodes.error)} — the new/exists diff
          below is not trustworthy until this loads.
        </Banner>
      ) : null}

      {/* ── body ────────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1">
        {!siteId ? (
          <ConsoleMessage>
            Pick a site above — the archetypes, the route preview, and the readiness checklist all
            follow it.
          </ConsoleMessage>
        ) : library.isLoading ? (
          <ConsoleSkeleton />
        ) : library.isError ? (
          <ConsoleMessage tone="error">
            Could not load the archetype library: {extractErrorMessage(library.error)}
          </ConsoleMessage>
        ) : archetypes.length === 0 ? (
          <ConsoleMessage tone="error">
            No archetypes are visible to you. The builtin library lives on the system organization's
            plan profile (vertical &ldquo;platform-archetypes&rdquo;) — if this is empty, that row is
            missing or not readable.
          </ConsoleMessage>
        ) : isMobile ? (
          // Three side-by-side panels at 375px is nine screens of slivers.
          // Same three levels, one at a time, each with the full width.
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 border-b border-border">
              {MOBILE_PANES.map((pane) => (
                <button
                  key={pane.key}
                  type="button"
                  onClick={() => setMobilePane(pane.key)}
                  className={cn(
                    "flex-1 border-b-2 px-3 py-2 text-sm transition-colors",
                    mobilePane === pane.key
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground",
                  )}
                >
                  {pane.label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              {mobilePane === "shape" ? (
                <div className="h-full overflow-y-auto scrollbar-thin">
                  {archetypeListNode}
                </div>
              ) : mobilePane === "counts" ? (
                countsPanelNode
              ) : (
                <RoutePreview rows={previewRows} />
              )}
            </div>
          </div>
        ) : (
          <ClientGroup
            id="content-plan-create-dense"
            cookieName={LAYOUT_COOKIE}
            orientation="horizontal"
            className="h-full w-full"
          >
            <Panel id="archetypes" defaultSize="20%" minSize="12%">
              <div className="h-full overflow-y-auto scrollbar-thin">
                {archetypeListNode}
              </div>
            </Panel>
            <Handle />
            <Panel id="counts" defaultSize="30%" minSize="18%">
              <div className="h-full overflow-hidden border-l border-border">
                {countsPanelNode}
              </div>
            </Panel>
            <Handle />
            <Panel id="routes" minSize="28%">
              <div className="h-full overflow-hidden border-l border-border">
                <RoutePreview rows={previewRows} />
              </div>
            </Panel>
          </ClientGroup>
        )}
      </div>

      {/* ── commit bar ──────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-t border-border bg-background px-2.5 py-1.5 pb-safe">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {expanded ? (
            <>
              <span className="font-medium text-foreground">{expanded.label}</span> ·{" "}
              <span className="tabular-nums">{expanded.pageCount}</span> routes ·{" "}
              <span className="tabular-nums text-blue-600 dark:text-blue-400">{newCount} new</span> ·{" "}
              <span className="tabular-nums">{existsCount} already there</span>
              {conflictCount > 0 ? (
                <>
                  {" · "}
                  <span className="tabular-nums text-amber-600 dark:text-amber-400">
                    {conflictCount} conflicting
                  </span>
                </>
              ) : null}
            </>
          ) : (
            "No archetype selected."
          )}
        </span>

        {cms.data && !cms.data.link.linked ? (
          <span className="hidden items-center gap-1 text-xs text-muted-foreground lg:flex">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            Foundation not checked — {cms.data.link.reason}
          </span>
        ) : null}
        {cms.data?.link.linked ? (
          <span className="hidden items-center gap-1 text-xs text-muted-foreground lg:flex">
            <ExternalLink className="h-3 w-3" />
            CMS: {cms.data.link.cmsSlug} (by {cms.data.link.matchedBy})
          </span>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {progress ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {progress.done}/{progress.total}
            </span>
          ) : null}
          <Button
            size="sm"
            className="h-7 gap-1.5 px-3 text-xs"
            disabled={
              isBusy ||
              !expanded ||
              !site ||
              !site.brand_id ||
              newCount === 0 ||
              nodes.isLoading ||
              nodes.isError ||
              statuses.categories.length === 0
            }
            onClick={() => void handleCommit()}
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {newCount === 0 && expanded
              ? "Nothing to create"
              : isMobile
                ? `Create ${newCount}`
                : `Create ${newCount} page${newCount === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "error" | "warn";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "shrink-0 border-b px-2.5 py-1 text-xs",
        tone === "error"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      )}
    >
      {children}
    </div>
  );
}

function ConsoleMessage({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "error";
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <p
        className={cn(
          "max-w-md text-center text-sm",
          tone === "error" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {children}
      </p>
    </div>
  );
}

function ConsoleSkeleton() {
  return (
    <div className="flex h-full">
      <div className="w-1/5 space-y-2 border-r border-border p-2.5">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-14 animate-pulse rounded bg-muted" />
        ))}
      </div>
      <div className="w-1/3 space-y-1.5 border-r border-border p-2.5">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="h-6 animate-pulse rounded bg-muted" />
        ))}
      </div>
      <div className="flex-1 space-y-1 p-2.5">
        {Array.from({ length: 16 }, (_, index) => (
          <div key={index} className="h-5 animate-pulse rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}
