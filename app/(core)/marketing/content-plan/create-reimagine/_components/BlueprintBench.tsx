"use client";

/**
 * The Blueprint Bench — one live surface, no wizard.
 *
 * Three panes that are all views of the SAME computation: the shape you are
 * dialling in (left), the exact routes it would create diffed against the live
 * plan (centre), and what the shape promised versus what exists (right). A
 * count change rewrites the routes in the same frame, so "services × 8" is
 * never an abstract number — you see /services/service-8 before you commit.
 *
 * Nothing here writes until the commit bar is pressed, and the write is
 * idempotent by route, so a partial run is resumable rather than a mess.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Layers, ListTree, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { CardLoading } from "@/components/matrx/LoadingComponents";
import { useMediaQuery } from "@/hooks/use-media-query";
import { planKeys, usePlanNodes } from "@/features/marketing/content-plan/data/hooks";
import { usePlanWorkspaceParams } from "@/features/marketing/content-plan/hooks/usePlanWorkspaceParams";
import { useContentPlanSites } from "@/features/marketing/content-plan/components/ContentPlanHeader";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useAppSelector } from "@/lib/redux/hooks";
import { extractErrorMessage } from "@/utils/errors";

import { ArchetypeError, expandArchetype } from "../_lib/archetypes";
import type { Archetype, ExpandedArchetype } from "../_lib/archetypes";
import {
  commitArchetype,
  diffAgainstPlan,
  readWorkOrder,
  saveWorkOrder,
  type CommitProgress,
  type CommitResult,
  type PlanDiff,
} from "../_lib/data";
import { useArchetypeLibrary, useCmsReadiness, benchKeys } from "../_lib/hooks";
import { computeReadiness, type SiteState } from "../_lib/readiness";
import { CommitBar } from "./CommitBar";
import { ReadinessLedger } from "./ReadinessLedger";
import { RouteManifest } from "./RouteManifest";
import { ShapeRail } from "./ShapeRail";

type Pane = "shape" | "routes" | "readiness";

interface Expansion {
  expanded: ExpandedArchetype | null;
  expandError: string | null;
}

/** Pure, module-level: a misconfigured archetype becomes a message, not a crash. */
function expandSafely(
  archetype: Archetype | null,
  counts: Record<string, number>,
  names: Record<string, string[]>,
): Expansion {
  if (!archetype) return { expanded: null, expandError: null };
  try {
    return { expanded: expandArchetype(archetype, { counts, names }), expandError: null };
  } catch (error) {
    return {
      expanded: null,
      expandError:
        error instanceof ArchetypeError || error instanceof Error
          ? error.message
          : extractErrorMessage(error),
    };
  }
}

export function BlueprintBench() {
  const { siteId } = usePlanWorkspaceParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  // Three live panes need real width. Below that the SAME panes become tabs —
  // one scroll area, nothing hidden, nothing squeezed into an unreadable strip.
  const wide = useMediaQuery("(min-width: 1280px)");
  const orgId = useAppSelector(selectEffectiveOrganizationId);

  const { sites } = useContentPlanSites();
  const site = (sites.data ?? []).find((row) => row.id === siteId) ?? null;
  // A `?site=` the caller cannot see is NOT the same as "no site picked" —
  // saying "pick a site" for a site that is right there in the URL is a lie.
  const siteState: SiteState = site
    ? "ready"
    : !siteId
      ? "none"
      : sites.isLoading
        ? "loading"
        : "missing";

  const library = useArchetypeLibrary(orgId);
  const nodes = usePlanNodes(siteId);
  const cms = useCmsReadiness(site);
  const pageTypes = useCategories({ dimension: CATEGORY_DIMENSIONS.planPageType });

  const shapeParam = searchParams.get("shape");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [names, setNames] = useState<Record<string, string[]>>({});
  const [namingOpen, setNamingOpen] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>("routes");

  const [progress, setProgress] = useState<CommitProgress | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);

  const setShape = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("shape", key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Seed from the work order recorded on the site — this is what makes the
  // ledger PERSISTENT rather than a day-zero wizard: reopening the bench
  // restores the archetype and counts that were actually committed.
  const seededFor = useRef<string | null>(null);
  const workOrder = readWorkOrder(site);
  useEffect(() => {
    if (!site) return;
    if (seededFor.current === site.id) return;
    seededFor.current = site.id;
    const order = readWorkOrder(site);
    setCounts(order.counts);
    setNames(order.names);
    setCommitError(null);
    setCommitResult(null);
    if (order.archetype && !shapeParam) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("shape", order.archetype);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [site, shapeParam, searchParams, pathname, router]);

  const archetypes = library.data?.archetypes ?? [];
  const selected = archetypes.find((a) => a.key === shapeParam) ?? null;

  // Derived as ONE const from a module-level pure helper. A `let` reassigned
  // inside a try/catch is exactly the shape the React Compiler cannot track —
  // it left `runCommit` holding a stale expansion while the manifest showed the
  // fresh one, i.e. the screen promised routes the write did not create.
  const { expanded, expandError } = expandSafely(selected, counts, names);

  const nodeRows = nodes.data ?? [];
  const diff: PlanDiff | null = expanded
    ? diffAgainstPlan(expanded, nodeRows)
    : null;

  const readiness = computeReadiness({
    site,
    siteState,
    expanded,
    nodes: nodeRows,
    cms: cms.data ?? null,
  });

  const pageTypeIds = new Map<string, string>();
  for (const category of pageTypes.categories) {
    if (category.slug) pageTypeIds.set(category.slug, category.id);
  }
  const unmappedPageTypes = expanded
    ? [
        ...new Set(
          expanded.flat
            .map((node) => node.pageType)
            .filter((slug): slug is string => Boolean(slug))
            .filter((slug) => pageTypes.status === "ready" && !pageTypeIds.has(slug)),
        ),
      ].sort()
    : [];

  const dirty =
    Object.keys(counts).length > 0 || Object.keys(names).length > 0;

  const hardBlocker = readiness.blockers.find((blocker) => blocker.hard);
  const blockedReason = hardBlocker
    ? hardBlocker.title
    : expandError
      ? "This archetype is misconfigured"
      : pageTypes.status === "loading"
        ? "Loading page types…"
        : null;

  const planHref = `/marketing/content-plan${siteId ? `?site=${siteId}` : ""}`;

  // A second click while the confirm dialog is open used to queue a SECOND run;
  // the two races produced a duplicate-route rejection mid-write. One run at a
  // time, guarded from the click — not from the progress state, which only
  // exists after the user has already confirmed.
  const commitInFlight = useRef(false);

  const runCommit = async () => {
    if (!site || !expanded || !diff) return;
    if (commitInFlight.current) return;
    commitInFlight.current = true;
    try {
      await runCommitGuarded();
    } finally {
      commitInFlight.current = false;
    }
  };

  const runCommitGuarded = async () => {
    if (!site || !expanded || !diff) return;
    const ok = await confirm({
      title: `Create ${diff.newCount} page${diff.newCount === 1 ? "" : "s"} on ${site.domain ?? site.name}?`,
      description: (
        <span>
          {diff.existsCount > 0 ? (
            <>
              {diff.existsCount} route{diff.existsCount === 1 ? "" : "s"} already
              exist and will be left exactly as they are.{" "}
            </>
          ) : null}
          Nothing existing is renamed, moved or deleted. The plan will hold{" "}
          {diff.totalAfter} pages afterwards.
        </span>
      ),
      confirmLabel: "Create the pages",
    });
    if (!ok) return;

    setCommitError(null);
    setCommitResult(null);
    setProgress({ created: 0, skipped: 0, total: expanded.flat.length, currentRoute: null });
    try {
      const result = await commitArchetype({
        site,
        expanded,
        existingByRoute: diff.byRoute,
        pageTypeIds,
        onProgress: setProgress,
      });
      setCommitResult(result);
      if (result.unmappedPageTypes.length > 0) {
        // Loud recovery: pages landed without a page type. That is a config
        // gap, not something to swallow.
        toast.warning(
          `No plan_page_type category for: ${result.unmappedPageTypes.join(", ")}`,
        );
      }
      try {
        await saveWorkOrder({
          site,
          archetypeKey: expanded.archetype,
          counts: expanded.counts,
          names,
        });
      } catch (error) {
        toast.error(extractErrorMessage(error));
      }
      toast.success(
        `${result.created} page${result.created === 1 ? "" : "s"} added to the plan.`,
      );
    } catch (error) {
      // The DB's own rejection text IS the report (brandless site, duplicate
      // route, slug shape). Never flatten a PostgrestError to "[object Object]".
      setCommitError(extractErrorMessage(error));
    } finally {
      setProgress(null);
      void queryClient.invalidateQueries({ queryKey: planKeys.nodes(site.id) });
      void queryClient.invalidateQueries({ queryKey: benchKeys.cms(site.id) });
      void sites.refetch();
    }
  };

  if (library.isLoading) {
    return (
      <div className="h-full bg-textured p-4 pt-[calc(var(--shell-header-h)+1rem)]">
        <CardLoading />
      </div>
    );
  }

  if (library.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-textured p-8 text-center">
        <p className="text-sm font-medium text-foreground">
          The archetype library could not be read.
        </p>
        <p className="max-w-md break-words text-xs text-muted-foreground">
          {extractErrorMessage(library.error)}
        </p>
        <Button size="sm" variant="secondary" onClick={() => void library.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (archetypes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-textured p-8 text-center">
        <Layers className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          No site archetypes are visible to you.
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          The builtin library lives on the platform profile
          (<code>plan.profile.vertical = &apos;platform-archetypes&apos;</code>). If
          this is unexpected, it is a data problem, not an empty state.
        </p>
        {(library.data?.problems ?? []).map((problem) => (
          <p key={problem} className="max-w-md text-xs text-destructive">
            {problem}
          </p>
        ))}
      </div>
    );
  }

  const shapeRail = (
    <ShapeRail
      archetypes={archetypes}
      selectedKey={shapeParam}
      onSelect={setShape}
      expanded={expanded}
      counts={counts}
      names={names}
      namingOpen={namingOpen}
      onToggleNaming={setNamingOpen}
      onCount={(key, value) => setCounts((prev) => ({ ...prev, [key]: value }))}
      onNames={(key, value) =>
        setNames((prev) => {
          const next = { ...prev };
          if (value === null) delete next[key];
          else next[key] = value;
          return next;
        })
      }
      onReset={() => {
        setCounts({});
        setNames({});
      }}
      dirty={dirty}
    />
  );

  const manifest = (
    <RouteManifest
      expanded={expanded}
      diff={diff}
      nodesLoading={nodes.isLoading}
      nodesError={nodes.error ? extractErrorMessage(nodes.error) : null}
      onRetryNodes={() => void nodes.refetch()}
      archetypes={archetypes}
      onSelect={setShape}
      unmappedPageTypes={unmappedPageTypes}
      siteState={siteState}
    />
  );

  const ledger = (
    <ReadinessLedger
      readiness={readiness}
      cms={cms.data ?? null}
      cmsLoading={cms.isLoading}
      cmsError={cms.error ? extractErrorMessage(cms.error) : null}
      onRetryCms={() => void cms.refetch()}
      committedArchetype={workOrder.archetype}
      committedAt={workOrder.committedAt}
      selectedKey={shapeParam}
    />
  );

  return (
    // `.shell-main` already fills the viewport and the glass header floats over
    // it. Every pane here has static top chrome, so the bench clears the header
    // once at the top rather than letting three sticky bars slide under it.
    <div className="flex h-full min-h-0 flex-col bg-textured pt-[var(--shell-header-h)]">
      {(library.data?.problems ?? []).length > 0 ? (
        <div className="shrink-0 border-b border-warning/30 bg-warning/10 px-3 py-1.5 text-[11px] text-warning">
          {(library.data?.problems ?? []).join(" · ")}
        </div>
      ) : null}
      {expandError ? (
        <div className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
          {expandError}
        </div>
      ) : null}

      {!wide ? (
        <>
          <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
            {(
              [
                { id: "shape", label: "Shape", icon: <Layers className="h-3.5 w-3.5" /> },
                { id: "routes", label: "Routes", icon: <ListTree className="h-3.5 w-3.5" /> },
                {
                  id: "readiness",
                  label: "Readiness",
                  icon: <ShieldCheck className="h-3.5 w-3.5" />,
                },
              ] as const
            ).map((tab) => (
              <Button
                key={tab.id}
                variant={pane === tab.id ? "secondary" : "ghost"}
                size="sm"
                className="h-8 flex-1 gap-1.5 text-xs"
                onClick={() => setPane(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </Button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {pane === "shape" ? shapeRail : null}
            {pane === "routes" ? manifest : null}
            {pane === "readiness" ? ledger : null}
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="w-[19rem] shrink-0 border-r border-border bg-card/40">
            {shapeRail}
          </div>
          <div className="min-w-0 flex-1">{manifest}</div>
          <div className="w-[21rem] shrink-0 border-l border-border bg-card/40">
            {ledger}
          </div>
        </div>
      )}

      <CommitBar
        newCount={site ? (diff?.newCount ?? 0) : 0}
        existsCount={site ? (diff?.existsCount ?? 0) : 0}
        totalAfter={site ? (diff?.totalAfter ?? nodeRows.length) : 0}
        pageEstimate={expanded?.pageEstimate ?? null}
        blockedReason={blockedReason}
        progress={progress}
        error={commitError}
        result={commitResult}
        onCommit={() => void runCommit()}
        onDismiss={() => {
          setCommitError(null);
          setCommitResult(null);
        }}
        planHref={planHref}
      />
    </div>
  );
}
