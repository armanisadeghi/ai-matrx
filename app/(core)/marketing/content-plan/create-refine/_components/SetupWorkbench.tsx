"use client";

/**
 * Site Setup — the fourth view of the content-plan workspace.
 *
 * ONE job: go from nothing (or half a plan) to a structured site plan in a
 * couple of minutes, and never write a page the user has not seen first.
 * Shape → Counts → the exact routes → commit, left to right, all on one screen.
 *
 * It is a PERSISTENT readiness surface, not a day-zero wizard: it reads the
 * site's live plan every time, diffs the work order against it, and is safe to
 * re-run — existing pages are adopted, never duplicated or overwritten.
 *
 * Data: plan nodes and the archetype library come DIRECT from Supabase under
 * RLS; writes go through the feature's one plan write path. Nothing routes
 * through the Python server.
 */
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useContentPlanSites } from "@/features/marketing/content-plan/components/ContentPlanHeader";
import { planKeys, usePlanNodes } from "@/features/marketing/content-plan/data/hooks";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import {
  ArchetypeError,
  expandArchetype,
  type Archetype,
  type ExpandedArchetype,
} from "../_lib/archetypes";
import {
  commitArchetype,
  missingPageTypes,
  type CommitResult,
} from "../_lib/commit";
import { readCommittedArchetype, recordSiteArchetype } from "../_lib/data";
import { useArchetypeLibrary } from "../_lib/hooks";
import { buildReadiness, buildRoutePreview } from "../_lib/readiness";
import { PreviewColumn } from "./PreviewColumn";
import { ShapeColumn } from "./ShapeColumn";
import { WorkOrderColumn } from "./WorkOrderColumn";

/** The status every generated node starts in (same default aidream uses). */
const DEFAULT_STATUS_SLUG = "planned";

export function SetupWorkbench() {
  const searchParams = useSearchParams();
  const siteId = searchParams.get("site");
  const queryClient = useQueryClient();

  const { sites, orgSites } = useContentPlanSites();
  const site =
    (sites.data ?? []).find((row) => row.id === siteId) ??
    orgSites.find((row) => row.id === siteId) ??
    null;

  const library = useArchetypeLibrary(site?.organization_id ?? null);
  const nodes = usePlanNodes(siteId);
  const pageTypes = useCategories({ dimension: CATEGORY_DIMENSIONS.planPageType });
  const statuses = useCategories({ dimension: CATEGORY_DIMENSIONS.planStatus });

  const committed = useMemo(
    () => readCommittedArchetype(site?.settings),
    [site?.settings],
  );

  // Selection + count overrides. Overrides are keyed by archetype so switching
  // shapes and switching back does not silently carry numbers across.
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [countsByArchetype, setCountsByArchetype] = useState<
    Record<string, Record<string, number>>
  >({});
  const [committing, setCommitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [result, setResult] = useState<CommitResult | null>(null);

  const archetypes = library.data?.archetypes ?? [];
  const selectedKey =
    pickedKey ??
    (committed && archetypes.some((item) => item.key === committed.key)
      ? committed.key
      : (archetypes[0]?.key ?? null));
  const selected: Archetype | null =
    archetypes.find((item) => item.key === selectedKey) ?? null;

  // Committed counts are the starting point for the shape the site is already
  // on — re-opening Setup shows the work order that was actually promised.
  const overrides = useMemo(() => {
    if (!selected) return {};
    const local = countsByArchetype[selected.key];
    if (local) return local;
    if (committed && committed.key === selected.key) {
      const filtered: Record<string, number> = {};
      for (const family of selected.families) {
        const value = committed.counts[family.key];
        if (typeof value === "number") filtered[family.key] = value;
      }
      return filtered;
    }
    return {};
  }, [committed, countsByArchetype, selected]);

  const expansion = useMemo((): {
    expanded: ExpandedArchetype | null;
    error: string | null;
  } => {
    if (!selected) return { expanded: null, error: null };
    try {
      return {
        expanded: expandArchetype(selected, { counts: overrides }),
        error: null,
      };
    } catch (error) {
      return {
        expanded: null,
        error:
          error instanceof ArchetypeError
            ? error.message
            : extractErrorMessage(error),
      };
    }
  }, [overrides, selected]);

  const nodeRows = useMemo(() => nodes.data ?? [], [nodes.data]);
  const expanded = expansion.expanded;
  const readiness = useMemo(
    () => (expanded ? buildReadiness(expanded, nodeRows) : null),
    [expanded, nodeRows],
  );
  const preview = useMemo(
    () => (expanded ? buildRoutePreview(expanded, nodeRows) : []),
    [expanded, nodeRows],
  );

  const pageTypeIdBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of pageTypes.categories) {
      if (category.slug) map.set(category.slug, category.id);
    }
    return map;
  }, [pageTypes.categories]);

  const pageTypeNameBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of pageTypes.categories) {
      if (category.slug) map.set(category.slug, category.name);
    }
    return map;
  }, [pageTypes.categories]);

  const statusId = useMemo(
    () =>
      statuses.categories.find(
        (category) => category.slug === DEFAULT_STATUS_SLUG,
      )?.id ?? null,
    [statuses.categories],
  );

  const dirtyKeys = useMemo(() => {
    if (!selected) return new Set<string>();
    const keys = new Set<string>();
    for (const family of selected.families) {
      const override = overrides[family.key];
      if (typeof override === "number" && override !== family.count) {
        keys.add(family.key);
      }
    }
    return keys;
  }, [overrides, selected]);

  const setCount = useCallback(
    (familyKey: string, next: number) => {
      if (!selected) return;
      setCountsByArchetype((current) => ({
        ...current,
        [selected.key]: { ...(current[selected.key] ?? overrides), [familyKey]: next },
      }));
    },
    [overrides, selected],
  );

  const resetCounts = useCallback(() => {
    if (!selected) return;
    setCountsByArchetype((current) => {
      const next = { ...current };
      delete next[selected.key];
      return next;
    });
  }, [selected]);

  // ── commit ──────────────────────────────────────────────────────────────
  const missingTypes = useMemo(
    () => (expanded ? missingPageTypes(expanded.roots, pageTypeIdBySlug) : []),
    [expanded, pageTypeIdBySlug],
  );

  const disabledReason = useMemo(() => {
    if (!site) return "Pick a site first.";
    if (!site.brand_id) {
      return "This site has no brand — the database rejects plan rows for it. Assign a brand in Marketing → Sites first.";
    }
    if (pageTypes.status === "loading" || statuses.status === "loading") {
      return "Loading page types…";
    }
    if (!statusId) {
      return `No "${DEFAULT_STATUS_SLUG}" plan status exists in the category registry — new pages would have no status.`;
    }
    if (missingTypes.length > 0) {
      return `These page types are not in the category registry: ${missingTypes.join(", ")}. Seed them before scaffolding.`;
    }
    return null;
  }, [missingTypes, pageTypes.status, site, statusId, statuses.status]);

  const handleCommit = useCallback(async () => {
    if (!expanded || !site || !siteId || !statusId) return;
    const newCount = preview.filter((item) => !item.exists).length;
    const ok = await confirm({
      title: `Create ${newCount} page${newCount === 1 ? "" : "s"}?`,
      description: `${expanded.label} on ${site.domain ?? site.name}. Pages that already exist are left untouched.`,
      confirmLabel: "Create pages",
    });
    if (!ok) return;

    setCommitting(true);
    setResult(null);
    setProgress({ done: 0, total: 0 });
    try {
      const existingIdByRoute = new Map<string, string>();
      for (const node of nodeRows) {
        if (node.route) existingIdByRoute.set(node.route, node.id);
      }
      const outcome = await commitArchetype({
        roots: expanded.roots,
        siteId,
        organizationId: site.organization_id,
        existingIdByRoute,
        pageTypeIdBySlug,
        statusId,
        onProgress: (next) =>
          setProgress({ done: next.done, total: next.total }),
      });
      setResult(outcome);

      if (outcome.created.length > 0) {
        try {
          await recordSiteArchetype({
            siteId,
            archetypeKey: expanded.archetype,
            counts: expanded.counts,
          });
          await queryClient.invalidateQueries({
            queryKey: marketingKeys.siteOptions(),
          });
        } catch (error) {
          // Loud: the pages landed, the promise did not get recorded.
          toast.error(
            `Pages created, but the site shape was not recorded: ${extractErrorMessage(error)}`,
          );
        }
      }

      await queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });

      if (outcome.failed.length > 0) {
        toast.error(
          `Created ${outcome.created.length} page(s); ${outcome.failed.length} failed. See the report below the list.`,
        );
      } else {
        toast.success(
          `Created ${outcome.created.length} page(s). ${outcome.existing.length} already existed.`,
        );
      }
    } catch (error) {
      toast.error(`Scaffolding failed: ${extractErrorMessage(error)}`);
    } finally {
      setCommitting(false);
      setProgress(null);
    }
  }, [
    expanded,
    nodeRows,
    pageTypeIdBySlug,
    preview,
    queryClient,
    site,
    siteId,
    statusId,
  ]);

  // ── states ──────────────────────────────────────────────────────────────
  if (sites.isError) {
    return (
      <ErrorState
        title="Could not load sites"
        message={extractErrorMessage(sites.error)}
        onRetry={() => void sites.refetch()}
      />
    );
  }
  if (!siteId) {
    return (
      <EmptyState
        title="Pick a site to set up"
        body="Use the site picker in the header. Setup reads that site's live plan and shows what is still missing."
      />
    );
  }
  if (nodes.isError) {
    return (
      <ErrorState
        title="Could not load this site's plan"
        message={extractErrorMessage(nodes.error)}
        onRetry={() => void nodes.refetch()}
      />
    );
  }
  if (library.isError) {
    return (
      <ErrorState
        title="Could not load the site shapes"
        message={extractErrorMessage(library.error)}
        onRetry={() => void library.refetch()}
      />
    );
  }

  const loading = library.isLoading || nodes.isLoading;

  return (
    <div className="flex h-full flex-col pt-[var(--shell-header-h)]">
      {site && !site.brand_id ? (
        <div className="border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          This site has no brand — the database rejects plan rows for it
          (loudly, by design). Assign a brand in Marketing → Sites, then set up.
        </div>
      ) : null}
      {library.data && library.data.problems.length > 0 ? (
        <div className="border-b border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-foreground">
          {library.data.problems.length} site shape definition(s) could not be
          read: {library.data.problems[0]}
        </div>
      ) : null}

      {/* Mobile: ONE page scroll, panels stacked at natural height. md+: a
        fixed grid where each column owns its own scroll. */}
      <div
        className={
          "flex min-h-0 flex-1 flex-col gap-px overflow-y-auto bg-border " +
          "md:grid md:grid-cols-[16rem_minmax(0,1fr)] md:grid-rows-[minmax(0,auto)_minmax(0,1fr)] md:overflow-hidden " +
          "xl:grid-cols-[17rem_minmax(0,1fr)_25rem] xl:grid-rows-1"
        }
      >
        <div className="bg-card md:row-span-2 md:min-h-0 xl:row-span-1">
          {loading ? (
            <ColumnSkeleton rows={4} />
          ) : (
            <ShapeColumn
              archetypes={archetypes}
              loading={false}
              selectedKey={selectedKey}
              committedKey={committed?.key ?? null}
              onSelect={(key) => {
                setPickedKey(key);
                setResult(null);
              }}
            />
          )}
        </div>

        <div className="bg-card md:min-h-0">
          {loading ? (
            <ColumnSkeleton rows={6} />
          ) : expansion.error ? (
            <div className="p-4 text-sm text-destructive">
              This site shape is malformed and cannot be expanded:{" "}
              {expansion.error}
            </div>
          ) : expanded && readiness ? (
            <WorkOrderColumn
              expanded={expanded}
              readiness={readiness}
              dirtyKeys={dirtyKeys}
              onCountChange={setCount}
              onResetCounts={resetCounts}
              pageTypeName={(slug) =>
                slug ? (pageTypeNameBySlug.get(slug) ?? slug) : "No page type"
              }
            />
          ) : (
            <EmptyState
              title="No shape selected"
              body="Pick a site shape on the left to see its work order."
            />
          )}
        </div>

        <div className="bg-card md:col-start-2 md:min-h-0 xl:col-start-3 xl:row-start-1">
          {loading ? (
            <ColumnSkeleton rows={8} />
          ) : expanded ? (
            <PreviewColumn
              expanded={expanded}
              items={preview}
              disabledReason={disabledReason}
              committing={committing}
              progress={progress}
              result={result}
              onCommit={() => void handleCommit()}
            />
          ) : (
            <EmptyState
              title="Nothing to preview"
              body="The routes this shape creates appear here before anything is written."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ColumnSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-4 w-32" />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="space-y-1.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>
    </div>
  );
}

function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6 pt-[var(--shell-header-h)]">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-destructive">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}
