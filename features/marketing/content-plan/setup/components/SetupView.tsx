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
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { marketingKeys } from "@/features/marketing/data/hooks";
import type { MarketingSite } from "@/features/marketing/types";
import { useCompanyQuickResearch } from "@/features/research/hooks/useCompanyQuickResearch";
import { useLatestSuccessfulResearchDocument } from "@/features/research/hooks/useResearchState";
import { getLatestSuccessfulDocument } from "@/features/research/service";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { createContentPlanSetupScope } from "@/features/surfaces/manifests/content-plan-setup.manifest";
import {
  SurfaceRuntimeProvider,
  type SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import { planKeys, usePlanEntities, usePlanNodes } from "../../data/hooks";
import {
  createPlanNode,
  listKeywordLabels,
  listPlanEntities,
  listSiteKeywordValues,
} from "../../data/service";
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
import {
  buildArchetypeOptionsJson,
  buildAvailableKeywordLines,
  buildCurrentPlanLines,
  buildCurrentPlanSummary,
  buildGuidanceInputs,
  buildKeywordPlanLines,
  buildSiteContext,
  REVIEWER_OUTPUT_CONTRACT,
  useSetupAgents,
  type EntityAttachPlan,
  type KeywordStrategyResult,
  type PlanReviewFinding,
  type PlanReviewResult,
  type SetupGuidance,
  type ShapePlanResult,
} from "../ai";
import { applyEntityAttachments } from "../entity-attach";
import { applyKeywordStrategy, readNodeKeywordStrategy } from "../keyword-strategy";
import {
  clearSetupDraft,
  fetchFreshSite,
  readSetupDraft,
  readSiteResearchTopicId,
  recordSiteResearchTopic,
  saveSetupDraft,
  type SetupDraft,
} from "../draft";
import { useArchetypeLibrary, useCmsFacts } from "../hooks";
import { buildPreview } from "../preview";
import { buildReadiness } from "../readiness";
import {
  applyFamilyTopics,
  commitArchetype,
  promoteTopicsToPages,
  missingPageTypes,
  readCommittedArchetype,
  recordSiteArchetype,
  type CommitResult,
} from "../service";
import { EntityAttachSection } from "./EntityAttachSection";
import { KeywordStrategySection } from "./KeywordStrategySection";
import { PlanLintSection } from "./PlanLintSection";
import {
  PlanReviewSection,
  normalizeRoute,
  parentRouteOf,
  slugOf,
} from "./PlanReviewSection";
import { BuildWithAiDialog } from "./BuildWithAiDialog";
import { SetupAiBar, type SetupAiRunSummary } from "./SetupAiBar";
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
  conceptNames: Record<string, string> = {},
): Expansion {
  if (!archetype) return { expanded: null, error: null };
  try {
    return {
      expanded: expandArchetype(archetype, { counts, names, catalog, conceptNames }),
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
  const [conceptNamesByArchetype, setConceptNamesByArchetype] = useState<
    Record<string, Record<string, string>>
  >({});
  // Researched titles for COUNT-ONLY families — the hub's work order.
  const [topicsByArchetype, setTopicsByArchetype] = useState<
    Record<string, Record<string, string[]>>
  >({});
  const [committing, setCommitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [result, setResult] = useState<CommitResult | null>(null);

  // ── AI grounding + step agents ──────────────────────────────────────────
  const [researchTopicId, setResearchTopicId] = useState<string | null>(null);
  const [draftingWorkOrder, setDraftingWorkOrder] = useState(false);
  const [buildDialogOpen, setBuildDialogOpen] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [lastAiRun, setLastAiRun] = useState<SetupAiRunSummary | null>(null);
  const [review, setReview] = useState<PlanReviewResult | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [addingRoute, setAddingRoute] = useState<string | null>(null);
  const [addedRoutes, setAddedRoutes] = useState<Set<string>>(new Set());
  const [applyingTopicsKey, setApplyingTopicsKey] = useState<string | null>(null);
  const [keywordStrategy, setKeywordStrategy] =
    useState<KeywordStrategyResult | null>(null);
  const [keywordError, setKeywordError] = useState<string | null>(null);
  const [applyingKeywords, setApplyingKeywords] = useState(false);
  const [keywordsAppliedAt, setKeywordsAppliedAt] = useState<string | null>(null);
  const [entityPlan, setEntityPlan] = useState<EntityAttachPlan | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [applyingEntities, setApplyingEntities] = useState(false);
  const [entitiesAppliedAt, setEntitiesAppliedAt] = useState<string | null>(null);
  const planEntities = usePlanEntities(siteId);
  // Newest SUCCESSFUL report — matches aidream's `_load_research_report`, so
  // a failed re-assembly never hides a perfectly good older report.
  const researchDoc = useLatestSuccessfulResearchDocument(researchTopicId ?? "");
  const quickResearch = useCompanyQuickResearch();
  const agents = useSetupAgents(siteId);
  const researchReport =
    researchDoc.data?.status === "success" && researchDoc.data.content?.trim()
      ? researchDoc.data.content
      : null;
  // The runner permits ONE run at a time — every AI control reads this.
  const anyAgentBusy =
    draftingWorkOrder ||
    agents.shapeBusy ||
    agents.namingFamilyKey !== null ||
    agents.entitiesBusy ||
    agents.reviewBusy ||
    agents.keywordsBusy ||
    agents.attachBusy ||
    agents.briefBusy;

  // ── draft persistence — every step saves, nothing is lost on navigation ─
  // Seed ONCE per site from the FRESH row (never the siteOptions query cache
  // — it can be minutes stale while autosaves advance the server draft), then
  // autosave (debounced) whenever any choice changes. `lastSavedRef` carries
  // the last serialization known to be on the server; `pendingRef` carries an
  // armed-but-unwritten change so unmount and commit FLUSH it instead of
  // dropping it — a cancelled debounce is exactly the lost-typing bug this
  // module exists to kill.
  const [seed, setSeed] = useState<{
    siteId: string;
    /** Serialization of the stored draft, null when none existed. */
    serialized: string | null;
  } | null>(null);
  const lastSavedRef = useRef<{ siteId: string; serialized: string } | null>(null);
  const pendingRef = useRef<{
    siteId: string;
    draft: SetupDraft;
    serialized: string;
  } | null>(null);
  const committingRef = useRef(false);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    void fetchFreshSite(siteId)
      .then((fresh) => {
        if (cancelled) return;
        const draft = readSetupDraft(fresh.settings);
        if (draft) {
          if (draft.archetypeKey) setPickedKey(draft.archetypeKey);
          if (Object.keys(draft.countsByArchetype).length > 0) {
            setCountsByArchetype(draft.countsByArchetype);
          }
          if (Object.keys(draft.namesByArchetype).length > 0) {
            setNamesByArchetype(draft.namesByArchetype);
          }
          if (Object.keys(draft.conceptNamesByArchetype).length > 0) {
            setConceptNamesByArchetype(draft.conceptNamesByArchetype);
          }
          if (Object.keys(draft.topicsByArchetype).length > 0) {
            setTopicsByArchetype(draft.topicsByArchetype);
          }
          if (draft.researchTopicId) setResearchTopicId(draft.researchTopicId);
        }
        // No in-progress draft topic → the site's recorded research link
        // (the same one aidream's generator/deepen read) is the default.
        if (!draft?.researchTopicId) {
          const linked = readSiteResearchTopicId(fresh.settings);
          if (linked) setResearchTopicId(linked);
        }
        setSeed({
          siteId,
          serialized: draft
            ? JSON.stringify({ ...draft, updatedAt: null })
            : null,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        // Loud, and STILL enable autosave (baseline = current defaults) —
        // a failed seed read must not silently disable persistence.
        toast.error(
          `Could not load the saved setup draft: ${extractErrorMessage(error)}`,
        );
        setSeed({ siteId, serialized: null });
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const invalidateSiteOptions = () =>
    void queryClient.invalidateQueries({ queryKey: marketingKeys.siteOptions() });

  useEffect(() => {
    if (!siteId || seed?.siteId !== siteId) return;
    const draft: SetupDraft = {
      archetypeKey: pickedKey,
      countsByArchetype,
      namesByArchetype,
      conceptNamesByArchetype,
      topicsByArchetype,
      researchTopicId,
      updatedAt: null,
    };
    const serialized = JSON.stringify(draft);
    if (lastSavedRef.current?.siteId !== siteId) {
      // First pass after mount — the baseline is the stored draft when one
      // seeded, else the current (default) state. Only a CHANGE writes.
      lastSavedRef.current = { siteId, serialized: seed.serialized ?? serialized };
    }
    if (lastSavedRef.current.serialized === serialized) {
      pendingRef.current = null;
      return;
    }
    const pending = { siteId, draft, serialized };
    pendingRef.current = pending;
    const timer = setTimeout(() => {
      // A commit in flight owns the guarded writes — leave the pending change
      // for the commit's own flush (or the unmount flush) instead of racing
      // its version-guarded record/clear.
      if (committingRef.current) return;
      if (pendingRef.current !== pending) return;
      pendingRef.current = null;
      saveSetupDraft(siteId, draft)
        .then(() => {
          // Marked saved only AFTER the write lands — a failed save keeps the
          // old baseline so the same state is retried (next edit, unmount
          // flush, or commit flush), never silently abandoned.
          lastSavedRef.current = { siteId, serialized };
          invalidateSiteOptions();
        })
        .catch((error) => {
          if (!pendingRef.current) pendingRef.current = pending;
          // LOUD: an autosave that silently stops saving is the original bug.
          toast.error(`Setup draft not saved: ${extractErrorMessage(error)}`);
        });
    }, 800);
    return () => clearTimeout(timer);
  }, [
    siteId,
    seed,
    pickedKey,
    countsByArchetype,
    namesByArchetype,
    conceptNamesByArchetype,
    topicsByArchetype,
    researchTopicId,
  ]);

  // Unmount FLUSH — the last ≤800ms of edits must survive a view toggle or
  // navigation. Reads refs only, so the first-render closure is safe.
  useEffect(() => {
    return () => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      lastSavedRef.current = {
        siteId: pending.siteId,
        serialized: pending.serialized,
      };
      void saveSetupDraft(pending.siteId, pending.draft)
        .then(() => invalidateSiteOptions())
        .catch((error) => {
          toast.error(`Setup draft not saved: ${extractErrorMessage(error)}`);
        });
    };
  }, []);

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
  // Committed name picks seed the picker; the user's local picks override.
  const userConceptNames: Record<string, string> =
    (selected ? conceptNamesByArchetype[selected.key] : undefined) ?? {};
  const committedConceptNames: Record<string, string> =
    selected && committed && committed.key === selected.key
      ? committed.conceptNames
      : {};
  const conceptNames: Record<string, string> = {};
  for (const [key, value] of Object.entries({
    ...committedConceptNames,
    ...userConceptNames,
  })) {
    // An empty local pick means "back to the variant's own naming" — it must
    // also cancel a committed name, so it is filtered here, never passed down.
    if (value.trim()) conceptNames[key] = value;
  }

  const expansion = expandSafely(selected, counts, names, catalog, conceptNames);
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
  // Real per-node status for the reviewer's `current_plan` — a page that is
  // already published must not be audited as still-to-build.
  const statusSlugById = new Map<string, string>();
  for (const category of statuses.categories) {
    if (category.slug) statusSlugById.set(category.id, category.slug);
  }

  const dirtyKeys = new Set<string>();
  if (selected && expanded) {
    for (const family of selected.families) {
      const override = counts[family.key];
      if (typeof override === "number" && override !== family.count) {
        dirtyKeys.add(family.key);
      }
      if (userNames[family.key]) dirtyKeys.add(family.key);
    }
    for (const key of Object.keys(userConceptNames)) dirtyKeys.add(key);
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

  const setConceptName = (conceptKey: string, next: string | null) => {
    if (!selected) return;
    setConceptNamesByArchetype((current) => {
      const forArchetype = { ...(current[selected.key] ?? {}) };
      if (next === null) {
        // A committed name can only be cancelled by an explicit empty pick —
        // deleting the key would fall back to the committed value.
        if (committedConceptNames[conceptKey]) forArchetype[conceptKey] = "";
        else delete forArchetype[conceptKey];
      } else {
        forArchetype[conceptKey] = next;
      }
      return { ...current, [selected.key]: forArchetype };
    });
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
    setConceptNamesByArchetype((current) => {
      const next = { ...current };
      delete next[selected.key];
      return next;
    });
    setTopicsByArchetype((current) => {
      const next = { ...current };
      delete next[selected.key];
      return next;
    });
  };

  // ── the AI steps — read the research report, stage into THIS state ──────

  /**
   * Select a research topic AND record the site↔research link — aidream's
   * generator and deepen read the same key, so one pick grounds every later
   * AI step. Shared by the picker and the quick-create flow below.
   */
  const selectTopic = (topicId: string | null) => {
    setResearchTopicId(topicId);
    setAiError(null);
    if (siteId) {
      void recordSiteResearchTopic(siteId, topicId)
        .then(() => invalidateSiteOptions())
        .catch((error) => {
          toast.error(
            `Research link not recorded on the site: ${extractErrorMessage(error)}`,
          );
        });
    }
  };

  /**
   * No research yet? Create it FROM HERE: one confirmed click runs the whole
   * company-research pipeline (topic from the "Company Research" template →
   * search → scrape → analyze → synthesize → final Document) and lands the
   * report back in this bar. The topic is selected + linked the moment it
   * exists, so even an interrupted run leaves the site pointing at it.
   */
  const handleCreateResearch = async () => {
    if (!site) return;
    const ok = await confirm({
      title: `Research ${site.name}?`,
      description:
        "Runs the full company research pipeline (search → scrape → analyze → synthesize → report) " +
        "for this site's company. It takes several minutes and spends real AI credits. Keep this tab " +
        "open — the finished report lands here and grounds every AI step automatically.",
      confirmLabel: "Start research",
    });
    if (!ok) return;
    setAiError(null);
    try {
      await quickResearch.run({
        organizationId: site.organization_id,
        companyName: site.name,
        websiteUrl: site.root_url || site.domain,
        onTopicCreated: (topic) => selectTopic(topic.id),
      });
      researchDoc.refresh();
      toast.success(
        "Research report ready — the AI steps are now grounded in it.",
      );
    } catch (error) {
      toast.error(`Company research failed: ${extractErrorMessage(error)}`);
    }
  };

  /** The Shape Planner's variables — one builder so every caller agrees. */
  const shapePlannerVariables = (
    report: string,
    guidance = "",
    targetPageCount = "",
  ) => ({
    research_report: report,
    site_domain: site?.domain ?? site?.name ?? "",
    site_context: site ? buildSiteContext(site) : "",
    archetype_options: buildArchetypeOptionsJson(archetypes, baseline),
    current_plan_summary: buildCurrentPlanSummary(committed, nodeRows),
    target_page_count: targetPageCount,
    guidance,
  });

  /**
   * Validate + stage a Shape Planner result into this view's state. Shared by
   * the single-step "Recommend shape" button and the whole-work-order draft —
   * one staging path so the two can never disagree on what "applied" means.
   */
  const stageShapePlan = (plan: ShapePlanResult) => {
    if (!archetypes.some((item) => item.key === plan.archetypeKey)) {
      throw new Error(
        `The planner picked "${plan.archetypeKey}", which is not in the shape library — nothing was applied.`,
      );
    }
    const validFamilies = new Set(
      (baseline.get(plan.archetypeKey)?.families ?? []).map((item) => item.key),
    );
    const recommendedCounts: Record<string, number> = {};
    for (const item of plan.familyCounts) {
      if (validFamilies.has(item.familyKey)) {
        recommendedCounts[item.familyKey] = item.count;
      }
    }
    setPickedKey(plan.archetypeKey);
    setResult(null);
    setCountsByArchetype((current) => ({
      ...current,
      [plan.archetypeKey]: recommendedCounts,
    }));
    const conceptNameMap = Object.fromEntries(
      plan.conceptNames.map((item) => [item.conceptKey, item.name]),
    );
    if (plan.conceptNames.length > 0) {
      setConceptNamesByArchetype((current) => ({
        ...current,
        [plan.archetypeKey]: {
          ...(current[plan.archetypeKey] ?? {}),
          ...conceptNameMap,
        },
      }));
    }
    return { recommendedCounts, conceptNameMap };
  };

  const handleRecommendShape = async () => {
    if (!researchReport || !site) return;
    setAiError(null);
    try {
      const plan = await agents.recommendShape(
        shapePlannerVariables(researchReport),
      );
      const { recommendedCounts } = stageShapePlan(plan);
      const countSummary = Object.entries(recommendedCounts)
        .map(([key, value]) => `${key} × ${value}`)
        .join(", ");
      setLastAiRun({
        kind: "shape",
        headline: `Recommended "${plan.archetypeKey}"${countSummary ? ` (${countSummary})` : ""} — staged, you commit.`,
        detail: plan.rationale,
      });
    } catch (error) {
      setAiError(extractErrorMessage(error));
    }
  };

  /**
   * The whole work order in one pass: shape + counts + every family's real
   * names + count-only topics, all staged from the research report, steered
   * (never bound) by the user's Build-with-AI hints. The user reviews the
   * exact routes and hits "Create N pages" — the agent never writes a page.
   *
   * Sequential on purpose: the runner allows one agent run at a time, and each
   * step's live status lands in the AI bar so the wait is never silent.
   */
  const runDraftWorkOrder = async (report: string, hints: SetupGuidance) => {
    if (!site) return;
    const { guidance, targetPageCount } = buildGuidanceInputs(hints);
    {
      setLastAiRun({
        kind: "shape",
        headline: "Drafting the work order — reading the report, picking the shape…",
      });
      const plan = await agents.recommendShape(
        shapePlannerVariables(report, guidance, targetPageCount),
      );
      const { recommendedCounts, conceptNameMap } = stageShapePlan(plan);
      const archetype =
        archetypes.find((item) => item.key === plan.archetypeKey) ?? null;
      const draftExpansion = expandSafely(
        archetype,
        recommendedCounts,
        {},
        catalog,
        conceptNameMap,
      );
      if (!draftExpansion.expanded) {
        throw new Error(
          draftExpansion.error ??
            "The recommended shape could not be expanded — shape and counts were staged, names were not.",
        );
      }
      // Names the LIVE plan already carries — a family that is fully named by
      // real pages is skipped, exactly like the manual flow adopts them.
      const planDerivedNames = namesFromPlan(
        draftExpansion.expanded.families,
        nodeRows,
      );
      // The draft NEVER overwrites staged user work: a family the user already
      // named/pasted (or a prior run named), and count-only topics already
      // staged, are left alone — the per-family buttons re-run explicitly.
      const stagedNames = namesByArchetype[plan.archetypeKey] ?? {};
      const stagedTopics = topicsByArchetype[plan.archetypeKey] ?? {};
      let namedFamilies = 0;
      for (const family of draftExpansion.expanded.families) {
        const target = recommendedCounts[family.key] ?? family.count;
        if (target <= 0) continue;
        const commonVariables = {
          research_report: report,
          site_domain: site.domain ?? site.name ?? "",
          family_key: family.key,
          family_label: family.label,
          family_route: family.route,
          target_count: String(target),
        };
        if (family.materialize === "pages") {
          if ((stagedNames[family.key]?.length ?? 0) > 0) continue;
          if ((planDerivedNames[family.key]?.length ?? 0) >= target) continue;
          setLastAiRun({
            kind: "names",
            headline: `Drafting — naming the ${family.label.toLowerCase()} pages…`,
          });
          const outcome = await agents.nameFamily(family.key, {
            ...commonVariables,
            existing_names: (planDerivedNames[family.key] ?? []).join("\n"),
            guidance,
          });
          const labels = outcome.names.map((item) => item.label);
          setNamesByArchetype((current) => ({
            ...current,
            [plan.archetypeKey]: {
              ...(current[plan.archetypeKey] ?? {}),
              [family.key]: labels,
            },
          }));
          // A name list SETS the count — same rule as the manual paste box.
          setCountsByArchetype((current) => {
            const forArchetype = { ...(current[plan.archetypeKey] ?? {}) };
            delete forArchetype[family.key];
            return { ...current, [plan.archetypeKey]: forArchetype };
          });
          namedFamilies += 1;
        } else {
          if ((stagedTopics[family.key]?.length ?? 0) > 0) continue;
          setLastAiRun({
            kind: "names",
            headline: `Drafting — planning the ${family.label.toLowerCase()} topics…`,
          });
          const outcome = await agents.nameFamily(family.key, {
            ...commonVariables,
            existing_names: "",
            guidance:
              `These are ARTICLE TITLES for the ${family.label} section at ${family.route} — ` +
              "each one is a publishable piece, not a navigation page. Titles should reflect " +
              "real search demand and the audiences the report identifies." +
              (guidance ? `\n${guidance}` : ""),
          });
          setTopicsByArchetype((current) => ({
            ...current,
            [plan.archetypeKey]: {
              ...(current[plan.archetypeKey] ?? {}),
              [family.key]: outcome.names.map((item) => item.label),
            },
          }));
          namedFamilies += 1;
        }
      }
      setLastAiRun({
        kind: "shape",
        headline:
          `Work order drafted: "${plan.archetypeKey}" with ${namedFamilies} ` +
          `named famil${namedFamilies === 1 ? "y" : "ies"} — review the routes on the right, hit "Create pages", ` +
          "then run Plan keywords / Assign entities / Plan review below.",
        detail: plan.rationale,
      });
    }
  };

  /**
   * "Build with AI" — the guided flow. The dialog's answers arrive as HINTS;
   * when no report exists this FIRST runs the whole research pipeline (the
   * dialog said so, with the cost), then drafts the work order from the fresh
   * report. Bounded by design: everything stages; the live plan is untouched
   * until the user approves the routes.
   */
  const handleBuildWithAi = async (hints: SetupGuidance) => {
    if (!site) return;
    setBuildDialogOpen(false);
    setAiError(null);
    setDraftingWorkOrder(true);
    try {
      let report = researchReport;
      // A topic can be SELECTED while its document query is still loading (or
      // this hook's copy is stale) — check the DB directly before ever paying
      // for a new pipeline. New research runs ONLY when the selected topic
      // truly has no successful report, or no topic is selected at all.
      if (!report && researchTopicId) {
        const existing = await getLatestSuccessfulDocument(researchTopicId);
        report = existing?.content?.trim() || null;
      }
      if (!report) {
        const topic = await quickResearch.run({
          organizationId: site.organization_id,
          companyName: site.name,
          websiteUrl: site.root_url || site.domain,
          onTopicCreated: (created) => selectTopic(created.id),
        });
        researchDoc.refresh();
        // The hook state is async — read the fresh report DIRECTLY so the
        // draft grounds on it this pass, not on a stale closure.
        const doc = await getLatestSuccessfulDocument(topic.id);
        report = doc?.content?.trim() || null;
        if (!report) {
          throw new Error(
            "Research finished but no report content was found — open the topic in Research and re-run Document assembly.",
          );
        }
      }
      await runDraftWorkOrder(report, hints);
    } catch (error) {
      setAiError(extractErrorMessage(error));
    } finally {
      setDraftingWorkOrder(false);
    }
  };

  const handleNameFamily = async (familyKey: string) => {
    if (!researchReport || !site || !expanded) return;
    const family = expanded.families.find((item) => item.key === familyKey);
    if (!family) return;
    setAiError(null);
    try {
      const outcome = await agents.nameFamily(familyKey, {
        research_report: researchReport,
        site_domain: site.domain ?? site.name ?? "",
        family_key: family.key,
        family_label: family.label,
        family_route: family.route,
        target_count: String(counts[family.key] ?? family.count),
        existing_names: (names[family.key] ?? []).join("\n"),
        guidance: "",
      });
      setNames(
        familyKey,
        outcome.names.map((item) => item.label),
      );
      setLastAiRun({
        kind: "names",
        headline: `Named ${outcome.names.length} ${family.label.toLowerCase()} page(s) from the report — staged, you commit.`,
        detail:
          outcome.notes ||
          outcome.names.map((item) => item.label).join(", "),
      });
    } catch (error) {
      setAiError(extractErrorMessage(error));
    }
  };

  /** Routes already in the plan — "does this family's hub exist yet?" */
  const plannedRoutes = new Set(
    nodeRows
      .map((node) => node.route)
      .filter((route): route is string => Boolean(route)),
  );

  // Count-only families (blog / guides): the researched TITLES. Same agent as
  // the page namer — a count-only family gets a work order, not pages.
  const topics: Record<string, string[]> =
    (selected ? topicsByArchetype[selected.key] : undefined) ?? {};

  const setTopics = (familyKey: string, next: string[] | null) => {
    if (!selected) return;
    setTopicsByArchetype((current) => {
      const forArchetype = { ...(current[selected.key] ?? {}) };
      if (next === null) delete forArchetype[familyKey];
      else forArchetype[familyKey] = next;
      return { ...current, [selected.key]: forArchetype };
    });
  };

  /**
   * Record ONE family's staged topics on its live hub, independent of the
   * commit. Two reasons this exists: a commit whose topic write failed cannot
   * be retried through the commit button (it disables once every page exists),
   * and adding topics to an already-built site should not require pretending
   * to re-scaffold it.
   */
  const handleApplyTopics = async (familyKey: string) => {
    if (!siteId || !expanded) return;
    const family = expanded.families.find((item) => item.key === familyKey);
    const staged = topics[familyKey] ?? [];
    if (!family || staged.length === 0) return;
    setApplyingTopicsKey(familyKey);
    try {
      const result = await applyFamilyTopics({
        siteId,
        orders: [
          {
            familyKey,
            hubRoute: family.route,
            label: family.label,
            topics: staged,
          },
        ],
      });
      if (result.missing.length > 0) {
        toast.error(
          `${family.label}: the hub page ${family.route} is not in the plan yet — create the pages first.`,
        );
      } else if (result.failures.length > 0) {
        toast.error(`${family.label}: ${result.failures[0]}`);
      } else {
        toast.success(`Recorded ${staged.length} topic(s) on ${family.route}.`);
        await queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });
      }
    } catch (error) {
      toast.error(
        `Could not record the ${family.label} topics: ${extractErrorMessage(error)}`,
      );
    } finally {
      setApplyingTopicsKey(null);
    }
  };

  const handlePromoteTopics = async (familyKey: string) => {
    if (!siteId || !site || !expanded) return;
    const family = expanded.families.find((item) => item.key === familyKey);
    const staged = topics[familyKey] ?? [];
    if (!family || staged.length === 0) return;
    if (!statusId) {
      toast.error(
        `No "${DEFAULT_STATUS_SLUG}" plan status exists in the category registry yet — the pages would have no status.`,
      );
      return;
    }
    const ok = await confirm({
      title: `Create ${staged.length} ${family.label.toLowerCase()} page${staged.length === 1 ? "" : "s"}?`,
      description:
        `They become real planned pages under ${family.route}, so they appear in the tree, the table, and the CMS pipeline. ` +
        "This shape normally plans only the section hub — pages that already exist are left untouched.",
      confirmLabel: "Create pages",
    });
    if (!ok) return;
    setApplyingTopicsKey(familyKey);
    try {
      const result = await promoteTopicsToPages({
        siteId,
        organizationId: site.organization_id,
        hubRoute: family.route,
        topics: staged,
        childNodeType: "article",
        childPageTypeId: family.childPageType
          ? (pageTypeIdBySlug.get(family.childPageType) ?? null)
          : null,
        statusId,
      });
      await queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });
      if (result.failed > 0) {
        toast.error(
          `Created ${result.created}; ${result.failed} failed — ${result.failures[0]}`,
        );
      } else {
        toast.success(
          `Created ${result.created} page(s). ${result.existing} already existed.`,
        );
      }
    } catch (error) {
      toast.error(`Could not create the pages: ${extractErrorMessage(error)}`);
    } finally {
      setApplyingTopicsKey(null);
    }
  };

  const handleTopicsForFamily = async (familyKey: string) => {
    if (!researchReport || !site || !expanded) return;
    const family = expanded.families.find((item) => item.key === familyKey);
    if (!family) return;
    setAiError(null);
    try {
      const outcome = await agents.nameFamily(familyKey, {
        research_report: researchReport,
        site_domain: site.domain ?? site.name ?? "",
        family_key: family.key,
        family_label: family.label,
        family_route: family.route,
        target_count: String(counts[family.key] ?? family.count),
        existing_names: (topics[family.key] ?? []).join("\n"),
        guidance:
          `These are ARTICLE TITLES for the ${family.label} section at ${family.route} — ` +
          "each one is a publishable piece, not a navigation page. Titles should reflect " +
          "real search demand and the audiences the report identifies.",
      });
      setTopics(
        familyKey,
        outcome.names.map((item) => item.label),
      );
      setLastAiRun({
        kind: "names",
        headline: `Planned ${outcome.names.length} ${family.label.toLowerCase()} topic(s) — recorded on the hub when you commit.`,
        detail:
          outcome.notes || outcome.names.map((item) => item.label).join(", "),
      });
    } catch (error) {
      setAiError(extractErrorMessage(error));
    }
  };

  // ── E-E-A-T attachments (whole-plan, roster-constrained) ────────────────
  const handleAttachEntities = async () => {
    if (!researchReport || !siteId || nodeRows.length === 0) return;
    setAttachError(null);
    try {
      const roster = await listPlanEntities(siteId);
      if (roster.length === 0) {
        setAttachError(
          "This site has no entities yet — add them in the Entities view first.",
        );
        return;
      }
      const roleByRoute = new Map<string, string>();
      for (const node of nodeRows) {
        const strategy = readNodeKeywordStrategy(node);
        if (node.route && strategy) roleByRoute.set(node.route, strategy.page_role);
      }
      const outcome = await agents.attachEntities({
        current_plan: nodeRows
          .slice()
          .sort((a, b) => (a.route ?? "").localeCompare(b.route ?? ""))
          .map((node) =>
            [
              node.route ?? "(no route)",
              node.label,
              node.node_type,
              roleByRoute.get(node.route ?? "") ?? "unassigned",
            ].join(" | "),
          )
          .join("\n"),
        entity_roster: roster
          .map((entity) => `${entity.label} | ${entity.entity_type} | `)
          .join("\n"),
        research_report: researchReport,
        guidance: "",
      });
      setEntityPlan(outcome);
      setEntitiesAppliedAt(null);
      setLastAiRun({
        kind: "entities",
        headline: `Proposed ${outcome.attachments.length} entity attachment(s).`,
        detail: outcome.notes,
      });
    } catch (error) {
      setAttachError(extractErrorMessage(error));
    }
  };

  const handleApplyEntityAttachments = async () => {
    if (!siteId || !entityPlan) return;
    setAttachError(null);
    setApplyingEntities(true);
    try {
      const result = await applyEntityAttachments({
        siteId,
        attachments: entityPlan.attachments,
      });
      await queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });
      const problems = [
        ...result.failures,
        ...(result.unknownEntities.length > 0
          ? [`not in the roster: ${result.unknownEntities.join(", ")}`]
          : []),
        ...(result.unknownRoutes.length > 0
          ? [`not in the plan: ${result.unknownRoutes.join(", ")}`]
          : []),
      ];
      if (problems.length > 0) {
        setAttachError(`Attached ${result.attached}. Skipped — ${problems[0]}`);
      }
      if (result.attached > 0) {
        setEntitiesAppliedAt(new Date().toISOString());
        toast.success(`Attached ${result.attached} entity edge(s).`);
      }
    } catch (error) {
      setAttachError(extractErrorMessage(error));
    } finally {
      setApplyingEntities(false);
    }
  };

  // ── keyword strategy (WHOLE-PLAN, top-down) ─────────────────────────────
  const handlePlanKeywords = async () => {
    if (!researchReport || !site || nodeRows.length === 0) return;
    setKeywordError(null);
    try {
      // The library the strategist should prefer (real data behind it) plus
      // the phrases already bound, so it can see what it is changing.
      const boundIds = nodeRows
        .map((node) => node.primary_keyword_id)
        .filter((id): id is string => Boolean(id));
      const [siteValues, boundLabels] = await Promise.all([
        listSiteKeywordValues(siteId as string),
        listKeywordLabels(Array.from(new Set(boundIds))),
      ]);
      const valueByKeywordId = new Map(
        siteValues.map((row) => [row.keyword_id, row]),
      );
      const libraryLabels = await listKeywordLabels(
        Array.from(valueByKeywordId.keys()),
      );
      const phraseById = new Map<string, string>();
      for (const row of [...libraryLabels, ...boundLabels]) {
        phraseById.set(row.id, row.phrase);
      }
      const available = libraryLabels.map((row) => {
        const value = valueByKeywordId.get(row.id);
        return {
          phrase: row.phrase,
          intent: null,
          contentRole: value?.content_role ?? null,
          priority: value?.priority_score ?? null,
        };
      });

      const outcome = await agents.planKeywords({
        research_report: researchReport,
        site_domain: site.domain ?? site.name ?? "",
        current_plan: buildKeywordPlanLines(nodeRows, statusSlugById, phraseById),
        available_keywords: buildAvailableKeywordLines(available),
        guidance: "",
      });
      setKeywordStrategy(outcome);
      setKeywordsAppliedAt(null);
      setLastAiRun({
        kind: "keywords",
        headline: `Planned keywords for ${outcome.assignments.length} page(s) — review, then apply.`,
        detail: outcome.strategySummary,
      });
    } catch (error) {
      setKeywordError(extractErrorMessage(error));
    }
  };

  const handleApplyKeywords = async () => {
    if (!siteId || !keywordStrategy) return;
    setKeywordError(null);
    setApplyingKeywords(true);
    try {
      const result = await applyKeywordStrategy({
        siteId,
        assignments: keywordStrategy.assignments,
      });
      await queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });
      if (result.failures.length > 0) {
        setKeywordError(
          `Bound ${result.bound} page(s); ${result.failures.length} problem(s) — ${result.failures[0]}`,
        );
      } else if (result.unknownRoutes.length > 0) {
        setKeywordError(
          `Bound ${result.bound} page(s). These routes are not in the plan and were skipped: ${result.unknownRoutes.join(", ")}`,
        );
      }
      if (result.bound > 0 || result.secondaryEdges > 0) {
        setKeywordsAppliedAt(new Date().toISOString());
        toast.success(
          `Keywords applied: ${result.bound} primary, ${result.secondaryEdges} secondary` +
            (result.createdKeywords > 0
              ? `, ${result.createdKeywords} new phrase(s) added to the library.`
              : "."),
        );
      }
    } catch (error) {
      setKeywordError(extractErrorMessage(error));
    } finally {
      setApplyingKeywords(false);
    }
  };

  // ── plan review (semantic audit against the research report) ────────────
  const handleReviewPlan = async () => {
    if (!researchReport || !site) return;
    setAiError(null);
    setReviewError(null);
    try {
      const outcome = await agents.reviewPlan({
        research_report: researchReport,
        site_domain: site.domain ?? site.name ?? "",
        current_plan: buildCurrentPlanLines(nodeRows, statusSlugById),
        // The contract is BINDING and always sent — without it the agent
        // writes a summary naming six missing pages and returns one finding.
        guidance: REVIEWER_OUTPUT_CONTRACT,
      });
      setReview(outcome);
      setAddedRoutes(new Set());
      setLastAiRun({
        kind: "review",
        headline: `Reviewed ${nodeRows.length} planned page(s) — ${outcome.findings.length} finding(s).`,
        detail: outcome.summary,
      });
    } catch (error) {
      setReviewError(extractErrorMessage(error));
    }
  };

  /**
   * Turn ONE `gap` finding into a real planned page through the canonical
   * write path. The parent is resolved by ROUTE (trigger-owned, unique per
   * site) and must already exist — the UI never offers Add otherwise, so this
   * can never graft an orphan.
   */
  const handleAddSuggestedPage = async (finding: PlanReviewFinding) => {
    const label = finding.suggestedLabel;
    if (!finding.suggestedRoute || !label || !site || !siteId) return;
    // Normalized to the shape the DB stores — an agent may suggest
    // `/services/Hard_Drive_Shredding`, which the slug CHECK rejects verbatim.
    const route = normalizeRoute(finding.suggestedRoute);
    if (!statusId) {
      // Loud, never a silent no-op: this is exactly the condition the commit
      // path refuses on, and the button cannot know about the registry.
      setReviewError(
        `Cannot add ${route}: no "${DEFAULT_STATUS_SLUG}" plan status exists in the category registry yet (still loading, or not seeded).`,
      );
      return;
    }
    const parentRoute = parentRouteOf(route);
    // A top-level page needs no section: `plan.node` allows parent_id NULL,
    // and a plan WITH a home node parents top-level pages under it. Both
    // shapes are live, so resolve to the home node when there is one.
    const parent = nodeRows.find((node) => node.route === parentRoute) ?? null;
    if (!parent && parentRoute !== "/") {
      setReviewError(
        `Cannot add ${route}: its section ${parentRoute} is not planned yet.`,
      );
      return;
    }
    setReviewError(null);
    setAddingRoute(route);
    try {
      await createPlanNode({
        site_id: siteId,
        organization_id: site.organization_id,
        parent_id: parent?.id ?? null,
        node_type: "article",
        slug: slugOf(route),
        label,
        brief: [finding.detail],
        status_id: statusId,
        attributes: {
          plan_review: { severity: finding.severity, title: finding.title },
        },
      });
      setAddedRoutes((current) => new Set(current).add(route));
      await queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });
      toast.success(`Added ${route}.`);
    } catch (error) {
      // The DB's own message IS the contract (slug shape, duplicate route…).
      setReviewError(`Could not add ${route}: ${extractErrorMessage(error)}`);
    } finally {
      setAddingRoute(null);
    }
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
    committingRef.current = true;
    setResult(null);
    setProgress({ done: 0, total: 0 });
    try {
      // FLUSH any pending debounced edit FIRST — an autosave landing between
      // fetchFreshSite and the version-guarded record write below would fail
      // the record over a self-inflicted race; from here `committingRef`
      // keeps the timer from firing until the commit is done.
      const pendingAtCommit = pendingRef.current;
      if (pendingAtCommit) {
        pendingRef.current = null;
        try {
          await saveSetupDraft(pendingAtCommit.siteId, pendingAtCommit.draft);
          lastSavedRef.current = {
            siteId: pendingAtCommit.siteId,
            serialized: pendingAtCommit.serialized,
          };
        } catch (error) {
          toast.error(`Setup draft not saved: ${extractErrorMessage(error)}`);
        }
      }
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
          // Draft autosaves bump the site row's version — the guarded record
          // write must run against the FRESH row, not the query cache's copy.
          const fresh = await fetchFreshSite(siteId);
          await recordSiteArchetype({
            siteId,
            expectedVersion: fresh.version,
            currentSettings: fresh.settings,
            archetypeKey: expanded.archetype,
            counts: expanded.counts,
            // Derived from the resolved report, exactly as aidream records it.
            conceptNames: Object.fromEntries(
              expanded.concepts
                .filter((item) => item.name)
                .map((item) => [item.concept, item.name as string]),
            ),
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

      // Count-only families: record the researched titles on each hub's brief
      // — the work order the generator and the writers read downstream.
      // Idempotent (a marker block), so re-committing never duplicates lines.
      const topicOrders = expanded.families
        .filter(
          (family) =>
            family.materialize === "count_only" &&
            (topics[family.key]?.length ?? 0) > 0,
        )
        .map((family) => ({
          familyKey: family.key,
          hubRoute: family.route,
          label: family.label,
          topics: topics[family.key],
        }));
      // Did EVERY staged topic order land? The draft is the only other copy —
      // topics cannot be re-derived from the plan the way family names can
      // (`namesFromPlan` covers `materialize: "pages"` only), so clearing the
      // draft while a hub write failed would destroy them permanently.
      let topicsFullyApplied = true;
      if (topicOrders.length > 0) {
        try {
          const topicResult = await applyFamilyTopics({ siteId, orders: topicOrders });
          topicsFullyApplied =
            topicResult.failures.length === 0 &&
            topicResult.missing.length === 0 &&
            topicResult.applied === topicOrders.length;
          if (topicResult.failures.length > 0) {
            toast.error(
              `Topics recorded on ${topicResult.applied} hub(s); ${topicResult.failures.length} failed — ${topicResult.failures[0]}. Your topics are still saved; commit again to retry.`,
            );
          } else if (topicResult.missing.length > 0) {
            toast.error(
              `Topics could not be recorded for ${topicResult.missing.join(", ")} — the hub page is not in the plan yet. Your topics are still saved.`,
            );
          } else if (topicResult.applied > 0) {
            toast.success(
              `Recorded planned topics on ${topicResult.applied} hub page(s).`,
            );
          }
        } catch (error) {
          topicsFullyApplied = false;
          toast.error(
            `Pages created, but the planned topics were not recorded: ${extractErrorMessage(error)}. Your topics are still saved.`,
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
        // Fully committed — the plan itself is the truth now (Setup re-derives
        // names from live nodes), so the in-progress draft is done. UNLESS a
        // topic order did not land: the draft is then the only surviving copy
        // of those researched titles, so it stays for the retry.
        if (topicsFullyApplied) {
          try {
            await clearSetupDraft(siteId);
            invalidateSiteOptions();
          } catch (error) {
            toast.error(
              `Pages created, but the setup draft was not cleared: ${extractErrorMessage(error)}`,
            );
          }
        }
      }
    } catch (error) {
      toast.error(`Scaffolding failed: ${extractErrorMessage(error)}`);
    } finally {
      setCommitting(false);
      committingRef.current = false;
      setProgress(null);
    }
  };

  // ── Surface: matrx-user/content-plan-setup ─────────────────────────────
  // Nested provider (deepest wins while this view renders): agents here see
  // the shape/work-order/readiness picture, and the declared writeTargets
  // stage into this component's own state — the preview updates, the USER
  // commits. Registered only on the data-bearing render below (the
  // error/empty early returns have nothing to declare).
  const getSetupScope = () =>
    createContentPlanSetupScope({
      view: "setup",
      archetype_options:
        archetypes.length > 0
          ? archetypes.map((item) => {
              const exp = baseline.get(item.key);
              return {
                key: item.key,
                label: exp?.label ?? item.key,
                families: exp?.families.map((family) => ({
                  key: family.key,
                  label: family.label,
                  route: family.route,
                  default_count: family.count,
                  materialize: family.materialize,
                })),
                omits: exp?.omits,
              };
            })
          : undefined,
      selected_archetype_key: selectedKey ?? undefined,
      committed_archetype: committed
        ? { key: committed.key, counts: committed.counts }
        : undefined,
      expansion_error: expansion.error ?? undefined,
      family_counts: expanded ? counts : undefined,
      family_names: Object.keys(names).length > 0 ? names : undefined,
      route_preview_summary: preview
        ? {
            create: preview.counts.new,
            exists: preview.counts.exists,
            conflict: preview.counts.conflict,
          }
        : undefined,
      route_preview_conflicts: preview
        ? preview.rows
            .filter((row) => row.state === "conflict")
            .map((row) => ({
              route: row.spec.route,
              label: row.spec.label,
              error: row.error,
            }))
        : undefined,
      readiness_checklist: readiness
        ? readiness.items.map((item) => ({
            key: item.key,
            group: item.group,
            label: item.label,
            state: item.state,
            required: item.required,
            actual: item.actual,
            detail: item.detail,
          }))
        : undefined,
      site_id: siteId ?? undefined,
      site_domain: site ? (site.domain ?? site.name ?? undefined) : undefined,
    });

  const getSetupWriteHandlers = (): SurfaceWriteHandlers => ({
    select_archetype: (value) => {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error("select_archetype expects an archetype key string");
      }
      if (!archetypes.some((item) => item.key === value)) {
        throw new Error(
          `Unknown archetype "${value}" — pick a key from archetype_options`,
        );
      }
      setPickedKey(value);
      setResult(null);
    },
    set_family_counts: (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(
          "set_family_counts expects an object mapping family keys to numbers",
        );
      }
      for (const [familyKey, count] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (typeof count !== "number" || count < 0 || !Number.isFinite(count)) {
          throw new Error(
            `set_family_counts: "${familyKey}" must map to a non-negative number`,
          );
        }
        setCount(familyKey, Math.floor(count));
      }
    },
    set_family_names: (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(
          "set_family_names expects an object mapping family keys to string arrays",
        );
      }
      for (const [familyKey, list] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (
          !Array.isArray(list) ||
          list.some((name) => typeof name !== "string" || !name.trim())
        ) {
          throw new Error(
            `set_family_names: "${familyKey}" must map to an array of non-empty strings`,
          );
        }
        setNames(familyKey, list as string[]);
      }
    },
  });

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
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/content-plan-setup"
      getScope={getSetupScope}
      getWriteHandlers={getSetupWriteHandlers}
    >
    <div className="flex h-full flex-col">
      {library.data && library.data.problems.length > 0 ? (
        <div className="border-b border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-foreground">
          {library.data.problems.length} site shape definition(s) had a problem:{" "}
          {library.data.problems[0]}
        </div>
      ) : null}

      <SetupAiBar
        selectedTopicId={researchTopicId}
        onSelectTopic={selectTopic}
        onCreateResearch={() => void handleCreateResearch()}
        researchStage={quickResearch.stage}
        document={researchDoc.data ?? null}
        documentLoading={Boolean(researchTopicId) && researchDoc.isLoading}
        onRecommendShape={() => void handleRecommendShape()}
        shapeBusy={agents.shapeBusy}
        onBuildWithAi={() => setBuildDialogOpen(true)}
        draftBusy={draftingWorkOrder}
        anyAgentBusy={anyAgentBusy}
        lastRun={lastAiRun}
        error={aiError}
        onDismissError={() => setAiError(null)}
      />

      {site ? (
        <BuildWithAiDialog
          open={buildDialogOpen}
          onOpenChange={setBuildDialogOpen}
          siteName={site.name}
          reportReady={Boolean(researchReport)}
          reportPending={Boolean(researchTopicId) && !researchReport}
          busy={draftingWorkOrder}
          onSubmit={(hints) => void handleBuildWithAi(hints)}
        />
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
              catalog={catalog}
              conceptNames={conceptNames}
              onCountChange={setCount}
              onNamesChange={setNames}
              onConceptNameChange={setConceptName}
              onReset={resetOverrides}
              aiReady={Boolean(researchReport)}
              aiNamingKey={agents.namingFamilyKey}
              aiBusy={anyAgentBusy}
              onAiNames={(familyKey) => void handleNameFamily(familyKey)}
              topics={topics}
              onAiTopics={(familyKey) => void handleTopicsForFamily(familyKey)}
              onClearTopics={(familyKey) => setTopics(familyKey, null)}
              onApplyTopics={(familyKey) => void handleApplyTopics(familyKey)}
              onPromoteTopics={(familyKey) => void handlePromoteTopics(familyKey)}
              applyingTopicsKey={applyingTopicsKey}
              plannedRoutes={plannedRoutes}
              newCount={preview.counts.new}
              pageTypeName={(slug) =>
                slug ? (pageTypeNameBySlug.get(slug) ?? slug) : "No page type"
              }
              lintSlot={
                <>
                  <PlanLintSection nodes={nodes.data ?? []} />
                  <KeywordStrategySection
                    strategy={keywordStrategy}
                    busy={agents.keywordsBusy}
                    anyBusy={anyAgentBusy}
                    aiReady={Boolean(researchReport)}
                    planEmpty={nodeRows.length === 0}
                    error={keywordError}
                    onDismissError={() => setKeywordError(null)}
                    onRun={() => void handlePlanKeywords()}
                    onApply={() => void handleApplyKeywords()}
                    applying={applyingKeywords}
                    appliedAt={keywordsAppliedAt}
                  />
                  <EntityAttachSection
                    plan={entityPlan}
                    busy={agents.attachBusy}
                    anyBusy={anyAgentBusy}
                    aiReady={Boolean(researchReport)}
                    rosterEmpty={(planEntities.data ?? []).length === 0}
                    planEmpty={nodeRows.length === 0}
                    error={attachError}
                    onDismissError={() => setAttachError(null)}
                    onRun={() => void handleAttachEntities()}
                    onApply={() => void handleApplyEntityAttachments()}
                    applying={applyingEntities}
                    appliedAt={entitiesAppliedAt}
                  />
                  <PlanReviewSection
                    nodes={nodeRows}
                    review={review}
                    busy={agents.reviewBusy}
                    anyBusy={anyAgentBusy}
                    aiReady={Boolean(researchReport)}
                    error={reviewError}
                    onDismissError={() => setReviewError(null)}
                    onRun={() => void handleReviewPlan()}
                    onAddPage={(finding) => void handleAddSuggestedPage(finding)}
                    addingRoute={addingRoute}
                    addedRoutes={addedRoutes}
                  />
                </>
              }
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
    </SurfaceRuntimeProvider>
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
