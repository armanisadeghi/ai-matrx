"use client";

/**
 * Site shape — the two-minute path from nothing (or half a site) to a
 * structured plan.
 *
 * Modelled on Linear's "new project from template" (a narrow rail of choices
 * beside a wide pane of consequence) crossed with a deployment summary (you
 * read the exact diff before you press the button). Left = cause, right =
 * effect, one primary action.
 *
 * Everything is live: archetypes come from `plan.profile.template_map`, the
 * "already planned" marks come from this site's real `plan.node` rows, the
 * foundation column comes from the linked CMS site, and Create writes real
 * nodes through the canonical plan service.
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ListTree,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePlanNodes } from "@/features/marketing/content-plan/data/hooks";
import { useContentPlanSites } from "@/features/marketing/content-plan/components/ContentPlanHeader";
import { usePlanWorkspaceParams } from "@/features/marketing/content-plan/hooks/usePlanWorkspaceParams";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import { ArchetypeError, expandArchetype } from "../_lib/archetypes";
import { useArchetypeLibrary, useCmsFoundation } from "../_lib/data";
import {
  buildPreview,
  buildReadiness,
  indexByRoute,
  readCommittedShape,
} from "../_lib/model";
import { useCommitShape } from "../_lib/useCommit";
import { CommitBar } from "./CommitBar";
import { ReadinessPanel } from "./ReadinessPanel";
import { RoutePreview } from "./RoutePreview";
import { ShapeRail } from "./ShapeRail";

type Tab = "shape" | "routes" | "readiness";

function Notice({
  tone,
  title,
  children,
}: {
  tone: "warning" | "destructive";
  title: string;
  children?: React.ReactNode;
}) {
  const accent =
    tone === "destructive"
      ? "border-destructive/40 bg-destructive/10"
      : "border-warning/40 bg-warning/10";
  const icon = tone === "destructive" ? "text-destructive" : "text-warning";
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${accent}`}>
      <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${icon}`} />
      <div className="min-w-0 text-sm">
        <p className="font-medium text-foreground">{title}</p>
        {children ? (
          <div className="mt-0.5 text-xs text-muted-foreground">{children}</div>
        ) : null}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-md space-y-3 text-center">{children}</div>
    </div>
  );
}

export function ShapeWorkbench() {
  const { siteId } = usePlanWorkspaceParams();
  const { sites, orgSites } = useContentPlanSites();
  const isMobile = useIsMobile();
  const site =
    (sites.data ?? []).find((row) => row.id === siteId) ??
    orgSites.find((row) => row.id === siteId) ??
    null;

  const nodes = usePlanNodes(siteId);
  const library = useArchetypeLibrary();
  const cms = useCmsFoundation(site?.domain ?? null);

  const pageTypes = useCategories({
    dimension: CATEGORY_DIMENSIONS.planPageType,
  });
  const statuses = useCategories({ dimension: CATEGORY_DIMENSIONS.planStatus });

  const [tab, setTab] = useState<Tab>("routes");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [countOverrides, setCountOverrides] = useState<Record<string, number>>(
    {},
  );

  // Reset the dials when the site changes — a shape chosen for one site is
  // meaningless on the next. Adjust-state-during-render (react.dev), no effect.
  const [prevSiteId, setPrevSiteId] = useState(siteId);
  if (prevSiteId !== siteId) {
    setPrevSiteId(siteId);
    setSelectedKey(null);
    setCountOverrides({});
  }

  const nodeRows = useMemo(() => nodes.data ?? [], [nodes.data]);
  const committed = useMemo(() => readCommittedShape(nodeRows), [nodeRows]);
  const archetypes = library.data?.archetypes ?? [];

  const effectiveKey =
    selectedKey ??
    (committed && archetypes.some((a) => a.key === committed.archetypeKey)
      ? committed.archetypeKey
      : (archetypes[0]?.key ?? null));
  const archetype = archetypes.find((item) => item.key === effectiveKey) ?? null;

  // Defaults = the archetype's own counts, overlaid by what this plan already
  // committed to (so an existing site opens on ITS numbers, not the template's).
  const defaultCounts = useMemo(() => {
    if (!archetype) return {};
    const base: Record<string, number> = {};
    for (const family of archetype.families) base[family.key] = family.count;
    if (committed && committed.archetypeKey === archetype.key) {
      for (const [key, value] of Object.entries(committed.counts)) {
        if (key in base) base[key] = value;
      }
    }
    return base;
  }, [archetype, committed]);

  const counts = useMemo(
    () => ({ ...defaultCounts, ...countOverrides }),
    [defaultCounts, countOverrides],
  );

  const expansion = useMemo(() => {
    if (!archetype) return { expanded: null, error: null as string | null };
    try {
      return { expanded: expandArchetype(archetype, counts), error: null };
    } catch (error) {
      return {
        expanded: null,
        error:
          error instanceof ArchetypeError
            ? error.message
            : extractErrorMessage(error),
      };
    }
  }, [archetype, counts]);

  const expanded = expansion.expanded;
  const preview = useMemo(
    () => (expanded ? buildPreview(expanded, nodeRows) : null),
    [expanded, nodeRows],
  );
  const readiness = useMemo(
    () => (expanded ? buildReadiness(expanded, nodeRows, cms.data ?? null) : null),
    [expanded, nodeRows, cms.data],
  );

  const nodesByRoute = useMemo(() => indexByRoute(nodeRows), [nodeRows]);
  const pageTypeIdBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of pageTypes.categories) {
      if (category.slug) map.set(category.slug, category.id);
    }
    return map;
  }, [pageTypes.categories]);
  const plannedStatusId =
    statuses.categories.find((category) => category.slug === "planned")?.id ??
    null;

  const { commit, progress, reset } = useCommitShape({
    siteId,
    organizationId: site?.organization_id ?? null,
    pageTypeIdBySlug,
    plannedStatusId,
    nodesByRoute,
  });

  // ── states before the workbench can render ────────────────────────────

  if (!siteId) {
    return (
      <Centered>
        <ListTree className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="text-base font-semibold text-foreground">
          Pick a site to shape
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose a site in the header. You will get four site shapes, the exact
          routes each one creates, and a checklist of what is already built.
        </p>
      </Centered>
    );
  }

  // A `?site=` the caller cannot actually reach (RLS, a stale shared link, a
  // deleted site) must SAY so. Rendering the shapes against a site we can't
  // resolve would let the user turn every dial and then fail at Create — the
  // exact silent dead-end this surface exists to remove.
  if (!site && !sites.isPending) {
    return (
      <Centered>
        <Notice tone="warning" title="That site is not reachable from here">
          <code className="font-mono">{siteId}</code> is not in the list of
          sites you can administer — it may belong to another organization, or
          the link may be stale. Pick a different site in the header.
        </Notice>
      </Centered>
    );
  }

  if (library.isPending || nodes.isPending || sites.isPending) {
    return (
      <div className="grid h-full grid-cols-1 lg:grid-cols-[minmax(280px,320px)_1fr]">
        <div className="space-y-2 border-r border-border p-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-[74px] w-full" />
          <Skeleton className="h-[74px] w-full" />
          <Skeleton className="h-[74px] w-full" />
          <Skeleton className="h-[74px] w-full" />
        </div>
        <div className="space-y-2 p-3">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-10/12" />
          <Skeleton className="h-5 w-9/12" />
        </div>
      </div>
    );
  }

  if (library.isError) {
    return (
      <Centered>
        <Notice tone="destructive" title="Could not load the site shapes">
          {extractErrorMessage(library.error)}
        </Notice>
        <Button size="sm" onClick={() => void library.refetch()}>
          Try again
        </Button>
      </Centered>
    );
  }

  if (nodes.isError) {
    return (
      <Centered>
        <Notice tone="destructive" title="Could not load this site’s plan">
          {extractErrorMessage(nodes.error)}
        </Notice>
        <Button size="sm" onClick={() => void nodes.refetch()}>
          Try again
        </Button>
      </Centered>
    );
  }

  if (archetypes.length === 0) {
    return (
      <Centered>
        <Notice tone="warning" title="No site shapes are available to you">
          The builtin library lives on the platform profile
          <code className="mx-1 font-mono">plan.profile</code>
          (vertical <code className="font-mono">platform-archetypes</code>). If
          you should be able to see it, that is an access defect worth
          reporting — not something to work around here.
        </Notice>
      </Centered>
    );
  }

  const cmsLabel = cms.isError
    ? `CMS check failed: ${extractErrorMessage(cms.error)}`
    : cms.data?.linked
      ? `linked to ${cms.data.cmsSiteName}`
      : (cms.data?.reason ?? "not linked");

  const brandless = site ? !site.brand_id : false;

  // ONE definition, rendered in two places: inside the right pane on desktop
  // (where the rail is always visible) and above the grid on mobile (where the
  // rail is a third tab). Never two divergent copies of the same control.
  const tabButton = (
    value: Tab,
    label: string,
    icon: React.ReactNode,
    suffix?: React.ReactNode,
  ) => (
    <Button
      key={value}
      variant={tab === value ? "secondary" : "ghost"}
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs"
      onClick={() => setTab(value)}
    >
      {icon}
      {label}
      {suffix}
    </Button>
  );
  const readinessSuffix = readiness ? (
    <span className="font-mono text-[11px] text-muted-foreground">
      {readiness.foundationMet}/{readiness.foundationTotal}
    </span>
  ) : null;
  const tabStrip = (
    <>
      {tabButton("routes", "Routes", <ListTree className="h-3.5 w-3.5" />)}
      {tabButton(
        "readiness",
        "Readiness",
        <ShieldCheck className="h-3.5 w-3.5" />,
        readinessSuffix,
      )}
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {brandless ? (
        <div className="shrink-0 p-2 pb-0">
          <Notice tone="warning" title="This site has no brand yet">
            <code className="font-mono">plan.node</code> writes are refused for
            a brandless site by the DB guard. Assign a brand on the site, then
            create the shape — pressing Create now will show you that exact
            error.
          </Notice>
        </div>
      ) : null}

      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5 lg:hidden">
        {tabButton("shape", "Shape", <SlidersHorizontal className="h-3.5 w-3.5" />)}
        {tabStrip}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(280px,320px)_1fr]">
        {/* Mobile keeps ONE scroll area: the rail becomes a tab peer rather
            than eating half the viewport and hiding the count dials. */}
        <div
          className={`min-h-0 lg:block lg:border-b-0 lg:border-r lg:border-border ${
            isMobile && tab !== "shape" ? "hidden" : ""
          }`}
        >
          <ShapeRail
            archetypes={archetypes}
            selectedKey={effectiveKey ?? ""}
            onSelect={(key) => {
              setSelectedKey(key);
              setCountOverrides({});
              reset();
            }}
            counts={counts}
            defaultCounts={defaultCounts}
            onCountChange={(familyKey, value) => {
              setCountOverrides((prev) => ({ ...prev, [familyKey]: value }));
              // The last run's report described a DIFFERENT shape — clear it
              // rather than leave a stale "Created 7 pages" over a new plan.
              reset();
            }}
            onResetCounts={() => {
              setCountOverrides({});
              reset();
            }}
            committedKey={committed?.archetypeKey ?? null}
            overriddenKeys={library.data?.overriddenKeys ?? []}
          />
        </div>

        <div
          className={`flex min-h-0 flex-col ${
            isMobile && tab === "shape" ? "hidden" : ""
          }`}
        >
          <div className="hidden shrink-0 items-center gap-1 border-b border-border px-2 py-1.5 lg:flex">
            {tabStrip}
            <span className="ml-auto min-w-0 truncate pl-2 pr-1 text-xs text-muted-foreground">
              {archetype?.label}
            </span>
          </div>

          <div className="min-h-0 flex-1">
            {expansion.error ? (
              <Centered>
                <Notice tone="destructive" title="This shape is misconfigured">
                  {expansion.error}
                </Notice>
              </Centered>
            ) : tab === "readiness" ? (
              readiness ? (
                <ReadinessPanel
                  readiness={readiness}
                  cmsLabel={cmsLabel}
                  cmsLoading={cms.isPending && Boolean(site?.domain)}
                />
              ) : null
            ) : preview ? (
              <RoutePreview preview={preview} />
            ) : null}
          </div>
        </div>
      </div>

      {/* The primary action belongs to the SURFACE, not to one pane — it stays
          pinned on mobile no matter which tab is open. */}
      {preview && expanded ? (
        <div className="shrink-0 pb-safe">
          <CommitBar
            newCount={preview.newCount}
            existingCount={preview.existingCount}
            totalPages={preview.total}
            progress={progress}
            siteId={siteId}
            onDismissResult={reset}
            disabledReason={
              pageTypes.status === "loading" || statuses.status === "loading"
                ? "loading page types…"
                : null
            }
            onCommit={() => {
              const rows = preview.groups.flatMap((group) => group.rows);
              void commit(rows, expanded.archetype)
                .then((result) => {
                  if (result.failures.length === 0) {
                    toast.success(
                      `Created ${result.created} page${result.created === 1 ? "" : "s"}.`,
                    );
                  } else {
                    toast.error(
                      `${result.failures.length} page${result.failures.length === 1 ? "" : "s"} could not be created — see the list below the button.`,
                    );
                  }
                })
                .catch((error: unknown) =>
                  toast.error(
                    `Could not create the shape: ${extractErrorMessage(error)}`,
                  ),
                );
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
