"use client";

/**
 * Site Setup — the fifth view of the content-plan workspace (`?view=setup`).
 *
 * ONE job: go from nothing (or half a plan) to a structured site plan in a
 * couple of minutes, and never write a page the user has not seen first.
 * Shape → Counts → the exact routes → commit, left to right, all on one screen.
 *
 * It is a PERSISTENT readiness surface, not a day-zero wizard: it reads the
 * site's live plan every time, diffs the work order against it, and is safe to
 * re-run — existing pages are adopted, never duplicated or overwritten. The
 * same screen answers "what is missing?" on an empty site, a half-built one,
 * and a finished one.
 *
 * Data: plan nodes and the archetype library come DIRECT from Supabase under
 * RLS; writes go through the feature's ONE plan write path. The CMS foundation
 * half comes from the existing `/api/cms/*` seam. The ONLY Python calls are
 * the "Make it real" rungs (SetupBridgeSection → setup/bridge.ts): guarded CMS
 * writes (starter kit, plan↔CMS reconcile/realize) that genuinely need the
 * server's write policy + activity-log seams — never plain DB reads.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { marketingKeys } from "@/features/marketing/data/hooks";
import type { MarketingSite } from "@/features/marketing/types";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import { planKeys, usePlanNodes } from "../../data/hooks";
import { usePlanWorkspaceParams } from "../../hooks/usePlanWorkspaceParams";
import { useContentPlanSites } from "../../components/ContentPlanHeader";
import type { PlanNodeRow } from "../../types";
import {
  expandArchetype,
  slugify,
  ArchetypeError,
  type Archetype,
  type ExpandedArchetype,
  type FamilyPlan,
} from "../archetypes";
import type { Concept } from "../concepts";
import { useArchetypeLibrary, useCmsFacts } from "../hooks";
import { buildPreview } from "../preview";
import { buildReadiness } from "../readiness";
import {
  commitArchetype,
  missingPageTypes,
  readCommittedArchetype,
  recordSiteArchetype,
  type CommitResult,
} from "../service";
import { PlanLintSection } from "./PlanLintSection";
import { SetupBridgeSection } from "./SetupBridgeSection";
import { SetupPreviewColumn } from "./SetupPreviewColumn";
import { SetupShapeColumn } from "./SetupShapeColumn";
import { SetupWorkOrderColumn } from "./SetupWorkOrderColumn";

/** The status every generated node starts in (same default aidream uses). */
const DEFAULT_STATUS_SLUG = "planned";

interface Expansion {
  expanded: ExpandedArchetype | null;
  error: string | null;
}

/**
 * PURE and MODULE-LEVEL on purpose. Computing this inside the component body
 * with a `let` in a try/catch is untracked by the React Compiler: the commit
 * then wrote the PRE-rename routes while the screen showed the new ones. A
 * pure function of its inputs cannot go stale.
 */
function expandSafely(
  archetype: Archetype | null,
  counts: Record<string, number>,
  names: Record<string, string[]>,
  catalog: Record<string, Concept>,
): Expansion {
  if (!archetype) return { expanded: null, error: null };
  try {
    return {
      expanded: expandArchetype(archetype, { counts, names, catalog }),
      error: null,
    };
  } catch (error) {
    return {
      expanded: null,
      error:
        error instanceof ArchetypeError || error instanceof Error
          ? error.message
          : extractErrorMessage(error),
    };
  }
}

/**
 * The names a family's LIVE children already carry — the plan itself, read as
 * the default for the paste box.
 *
 * This is what makes re-opening Setup idempotent WITHOUT storing names in a
 * second place. The committed work order on the site records only
 * `{key, counts, instantiated_at}` (byte-identical to what aidream writes), so
 * "Services × 3" restores but "which three" does not. Regenerating placeholder
 * names from the template would then offer to create `/services/service-1`
 * beside the real `/services/hard-drive-shredding` that is already there.
 *
 * A child is only adopted when its label round-trips to its slug: identity is
 * (parent, slug), and a name whose slug differs would not match the live row.
 *
 * Reads the families off the EXPANSION, not the archetype: a selection-form
 * archetype has no `families` until its concepts are resolved against the
 * catalog, so reading the config directly would silently adopt nothing.
 */
function namesFromPlan(
  families: FamilyPlan[],
  liveNodes: PlanNodeRow[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const family of families) {
    if (family.materialize !== "pages") continue;
    const hub = family.route;
    const labels = liveNodes
      .filter(
        (node) =>
          node.slug !== null &&
          node.route === `${hub}/${node.slug}` &&
          slugify(node.label) === node.slug,
      )
      .sort((a, b) => (a.route ?? "").localeCompare(b.route ?? ""))
      .map((node) => node.label);
    if (labels.length > 0) out[family.key] = labels;
  }
  return out;
}

export function SetupView() {
  const { siteId } = usePlanWorkspaceParams();
  const queryClient = useQueryClient();

  const { sites, orgSites } = useContentPlanSites();
  // Resolve against EVERYTHING visible, not just the org-scoped picker list — a
  // shared ?site= link (or an org switch with a stale param) must still work.
  const site: MarketingSite | null =
    (sites.data ?? []).find((row) => row.id === siteId) ??
    orgSites.find((row) => row.id === siteId) ??
    null;

  const library = useArchetypeLibrary(site?.organization_id ?? null);
  const nodes = usePlanNodes(siteId);
  const cms = useCmsFacts(site);
  const pageTypes = useCategories({ dimension: CATEGORY_DIMENSIONS.planPageType });
  const statuses = useCategories({ dimension: CATEGORY_DIMENSIONS.planStatus });

  const committed = readCommittedArchetype(site?.settings);

  // Overrides are keyed by archetype so switching shapes and back never
  // silently carries numbers across.
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [countsByArchetype, setCountsByArchetype] = useState<
    Record<string, Record<string, number>>
  >({});
  const [namesByArchetype, setNamesByArchetype] = useState<
    Record<string, Record<string, string[]>>
  >({});
  const [committing, setCommitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [result, setResult] = useState<CommitResult | null>(null);

  const archetypes = library.data?.archetypes ?? [];
  const catalog = library.data?.catalog ?? {};
  // Every shape expanded at its OWN defaults — one pure call per archetype, the
  // same function the commit uses. It gives the shape list its family/omits
  // summary AND gives the selected shape its family SET, which a selection-form
  // archetype only has after its concepts resolve against the catalog.
  const baseline = new Map<string, ExpandedArchetype | null>(
    archetypes.map((item) => [item.key, expandSafely(item, {}, {}, catalog).expanded]),
  );
  const selectedKey =
    pickedKey ??
    (committed && archetypes.some((item) => item.key === committed.key)
      ? committed.key
      : (archetypes[0]?.key ?? null));
  const selected: Archetype | null =
    archetypes.find((item) => item.key === selectedKey) ?? null;

  // Committed counts seed the shape the site is already on — reopening Setup
  // shows the work order that was actually promised (by this view OR the chat
  // tool: both write the same `web.site.settings.content_plan.archetype`).
  const localCounts = selected ? countsByArchetype[selected.key] : undefined;
  const baseFamilies = (selectedKey ? baseline.get(selectedKey) : null)?.families ?? [];
  const counts: Record<string, number> =
    localCounts ??
    (selected && committed && committed.key === selected.key
      ? Object.fromEntries(
          baseFamilies
            .filter((family) => typeof committed.counts[family.key] === "number")
            .map((family) => [family.key, committed.counts[family.key]]),
        )
      : {});
  const nodeRows = nodes.data ?? [];
  // Plan-derived names are the DEFAULT; anything the user pasted overrides
  // them. Clearing a paste falls back to the plan, never to placeholders.
  const userNames: Record<string, string[]> =
    (selected ? namesByArchetype[selected.key] : undefined) ?? {};
  const planNames = namesFromPlan(baseFamilies, nodeRows);
  const names: Record<string, string[]> = { ...planNames, ...userNames };

  const expansion = expandSafely(selected, counts, names, catalog);
  const expanded = expansion.expanded;

  const readiness = expanded
    ? buildReadiness({
        expanded,
        liveNodes: nodeRows,
        hasBrand: Boolean(site?.brand_id),
        cms: cms.data ?? null,
        cmsError: cms.isError ? extractErrorMessage(cms.error) : null,
      })
    : null;
  const preview = expanded
    ? buildPreview({ roots: expanded.roots, liveNodes: nodeRows, lastRun: result?.rows ?? null })
    : null;

  const pageTypeIdBySlug = new Map<string, string>();
  const pageTypeNameBySlug = new Map<string, string>();
  for (const category of pageTypes.categories) {
    if (!category.slug) continue;
    pageTypeIdBySlug.set(category.slug, category.id);
    pageTypeNameBySlug.set(category.slug, category.name);
  }
  const statusId =
    statuses.categories.find((category) => category.slug === DEFAULT_STATUS_SLUG)
      ?.id ?? null;

  const dirtyKeys = new Set<string>();
  if (selected && expanded) {
    for (const family of selected.families) {
      const override = counts[family.key];
      if (typeof override === "number" && override !== family.count) {
        dirtyKeys.add(family.key);
      }
      if (userNames[family.key]) dirtyKeys.add(family.key);
    }
  }

  const setCount = (familyKey: string, next: number) => {
    if (!selected) return;
    setCountsByArchetype((current) => ({
      ...current,
      [selected.key]: { ...(current[selected.key] ?? counts), [familyKey]: next },
    }));
  };

  const setNames = (familyKey: string, next: string[] | null) => {
    if (!selected) return;
    setNamesByArchetype((current) => {
      const forArchetype = { ...(current[selected.key] ?? {}) };
      if (next === null) delete forArchetype[familyKey];
      else forArchetype[familyKey] = next;
      return { ...current, [selected.key]: forArchetype };
    });
    // A name list SETS the count, so any manual count override for this family
    // must go with it — leaving both would silently truncate the pasted list.
    if (next !== null) {
      setCountsByArchetype((current) => {
        const forArchetype = { ...(current[selected.key] ?? counts) };
        delete forArchetype[familyKey];
        return { ...current, [selected.key]: forArchetype };
      });
    }
  };

  const resetOverrides = () => {
    if (!selected) return;
    setCountsByArchetype((current) => {
      const next = { ...current };
      delete next[selected.key];
      return next;
    });
    setNamesByArchetype((current) => {
      const next = { ...current };
      delete next[selected.key];
      return next;
    });
  };

  const missingTypes = expanded
    ? missingPageTypes(expanded.roots, pageTypeIdBySlug)
    : [];

  const disabledReason = (() => {
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
  })();

  const handleCommit = async () => {
    if (!expanded || !site || !siteId || !statusId || !preview) return;
    const newCount = preview.counts.new;
    const conflicts = preview.counts.conflict;
    const ok = await confirm({
      title: `Create ${newCount} page${newCount === 1 ? "" : "s"}?`,
      description:
        `${expanded.label} on ${site.domain ?? site.name}. Pages that already exist are left untouched.` +
        (conflicts > 0
          ? ` ${conflicts} route${conflicts === 1 ? " is" : "s are"} occupied by a different page and will be rejected by the database (reported as failed).`
          : ""),
      confirmLabel: "Create pages",
    });
    if (!ok) return;

    setCommitting(true);
    setResult(null);
    setProgress({ done: 0, total: 0 });
    try {
      const outcome = await commitArchetype({
        siteId,
        organizationId: site.organization_id,
        roots: expanded.roots,
        liveNodes: nodeRows,
        pageTypeIdBySlug,
        statusId,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResult(outcome);

      if (outcome.created > 0) {
        try {
          await recordSiteArchetype({
            siteId,
            expectedVersion: site.version,
            currentSettings: site.settings,
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

      if (outcome.routeMismatches.length > 0) {
        toast.error(
          `${outcome.routeMismatches.length} page(s) landed on a different route than previewed — the preview and the database disagree. Report this.`,
        );
      }
      if (outcome.failed > 0) {
        toast.error(
          `Created ${outcome.created} page(s); ${outcome.failed} failed. See the report above the button.`,
        );
      } else {
        toast.success(
          `Created ${outcome.created} page(s). ${outcome.existing} already existed.`,
        );
      }
    } catch (error) {
      toast.error(`Scaffolding failed: ${extractErrorMessage(error)}`);
    } finally {
      setCommitting(false);
      setProgress(null);
    }
  };

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
  if (siteId && !site && !sites.isLoading) {
    return (
      <EmptyState
        title="That site is not visible to you"
        body="This link points at a site you cannot see (or that was deleted). Pick another from the header, or go back to the plans list."
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
    <div className="flex h-full flex-col">
      {library.data && library.data.problems.length > 0 ? (
        <div className="border-b border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-foreground">
          {library.data.problems.length} site shape definition(s) had a problem:{" "}
          {library.data.problems[0]}
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
            <SetupShapeColumn
              archetypes={archetypes}
              baseline={baseline}
              loading={false}
              selectedKey={selectedKey}
              committedKey={committed?.key ?? null}
              shadowed={library.data?.shadowed ?? []}
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
          ) : expanded && readiness && preview ? (
            <SetupWorkOrderColumn
              expanded={expanded}
              readiness={readiness}
              counts={counts}
              names={names}
              userNamedKeys={new Set(Object.keys(userNames))}
              dirtyKeys={dirtyKeys}
              onCountChange={setCount}
              onNamesChange={setNames}
              onReset={resetOverrides}
              newCount={preview.counts.new}
              pageTypeName={(slug) =>
                slug ? (pageTypeNameBySlug.get(slug) ?? slug) : "No page type"
              }
              lintSlot={<PlanLintSection nodes={nodes.data ?? []} />}
              bridgeSlot={
                site ? (
                  <SetupBridgeSection site={site} cms={cms.data ?? null} />
                ) : null
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
          ) : expanded && preview ? (
            <SetupPreviewColumn
              expanded={expanded}
              preview={preview}
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
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
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
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-destructive">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{message}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}
