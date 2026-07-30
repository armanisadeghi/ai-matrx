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
import {
  useAllTopics,
  useResearchDocument,
} from "@/features/research/hooks/useResearchState";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { createContentPlanSetupScope } from "@/features/surfaces/manifests/content-plan-setup.manifest";
import {
  SurfaceRuntimeProvider,
  type SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
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
import {
  buildArchetypeOptionsJson,
  buildCurrentPlanSummary,
  useSetupAgents,
} from "../ai";
import {
  clearSetupDraft,
  fetchFreshSite,
  readSetupDraft,
  saveSetupDraft,
  type SetupDraft,
} from "../draft";
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
  const [committing, setCommitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [result, setResult] = useState<CommitResult | null>(null);

  // ── AI grounding + step agents ──────────────────────────────────────────
  const [researchTopicId, setResearchTopicId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [lastAiRun, setLastAiRun] = useState<SetupAiRunSummary | null>(null);
  const allTopics = useAllTopics();
  const researchDoc = useResearchDocument(researchTopicId ?? "");
  const agents = useSetupAgents(siteId);
  const researchReport =
    researchDoc.data?.status === "success" && researchDoc.data.content?.trim()
      ? researchDoc.data.content
      : null;

  // ── draft persistence — every step saves, nothing is lost on navigation ─
  // Seed ONCE per site from settings.content_plan.setup_draft (the sanctioned
  // adjust-state-during-render pattern — an effect would cascade renders),
  // then autosave (debounced) whenever any choice changes. `lastSavedRef`
  // carries the last serialization known to be on the server, so identical
  // states never write.
  const [seed, setSeed] = useState<{
    siteId: string;
    /** Serialization of the stored draft, null when none existed. */
    serialized: string | null;
  } | null>(null);
  const lastSavedRef = useRef<{ siteId: string; serialized: string } | null>(null);

  if (site && siteId && seed?.siteId !== siteId) {
    const draft = readSetupDraft(site.settings);
    setSeed({
      siteId,
      serialized: draft ? JSON.stringify({ ...draft, updatedAt: null }) : null,
    });
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
      if (draft.researchTopicId) setResearchTopicId(draft.researchTopicId);
    }
  }

  useEffect(() => {
    if (!siteId || seed?.siteId !== siteId) return;
    const draft: SetupDraft = {
      archetypeKey: pickedKey,
      countsByArchetype,
      namesByArchetype,
      conceptNamesByArchetype,
      researchTopicId,
      updatedAt: null,
    };
    const serialized = JSON.stringify(draft);
    if (lastSavedRef.current?.siteId !== siteId) {
      // First pass after mount — the baseline is the stored draft when one
      // seeded, else the current (default) state. Only a CHANGE writes.
      lastSavedRef.current = { siteId, serialized: seed.serialized ?? serialized };
    }
    if (lastSavedRef.current.serialized === serialized) return;
    const timer = setTimeout(() => {
      lastSavedRef.current = { siteId, serialized };
      saveSetupDraft(siteId, draft).catch((error) => {
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
    researchTopicId,
  ]);

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
  };

  // ── the AI steps — read the research report, stage into THIS state ──────
  const handleRecommendShape = async () => {
    if (!researchReport || !site) return;
    setAiError(null);
    try {
      const plan = await agents.recommendShape({
        research_report: researchReport,
        site_domain: site.domain ?? site.name ?? "",
        site_context: "",
        archetype_options: buildArchetypeOptionsJson(archetypes, baseline),
        current_plan_summary: buildCurrentPlanSummary(committed, nodeRows),
        target_page_count: "",
        guidance: "",
      });
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
      if (plan.conceptNames.length > 0) {
        setConceptNamesByArchetype((current) => ({
          ...current,
          [plan.archetypeKey]: {
            ...(current[plan.archetypeKey] ?? {}),
            ...Object.fromEntries(
              plan.conceptNames.map((item) => [item.conceptKey, item.name]),
            ),
          },
        }));
      }
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
        // names from live nodes), so the in-progress draft is done.
        try {
          await clearSetupDraft(siteId);
        } catch (error) {
          toast.error(
            `Pages created, but the setup draft was not cleared: ${extractErrorMessage(error)}`,
          );
        }
      }
    } catch (error) {
      toast.error(`Scaffolding failed: ${extractErrorMessage(error)}`);
    } finally {
      setCommitting(false);
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
        topics={allTopics.data ?? []}
        topicsLoading={allTopics.isLoading}
        selectedTopicId={researchTopicId}
        onSelectTopic={(topicId) => {
          setResearchTopicId(topicId);
          setAiError(null);
        }}
        document={researchDoc.data ?? null}
        documentLoading={Boolean(researchTopicId) && researchDoc.isLoading}
        onRecommendShape={() => void handleRecommendShape()}
        shapeBusy={agents.shapeBusy}
        anyAgentBusy={agents.shapeBusy || agents.namingFamilyKey !== null}
        lastRun={lastAiRun}
        error={aiError}
        onDismissError={() => setAiError(null)}
      />

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
              onAiNames={(familyKey) => void handleNameFamily(familyKey)}
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
