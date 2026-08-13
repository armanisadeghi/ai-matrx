"use client";

/**
 * Node detail panel — every editable plan.node field. `route` / `depth` /
 * `pillar_label` / `cluster_label` render READ-ONLY (trigger-owned derived
 * cache); after save the tree refetches so cascade recomputes show up.
 * Save errors are the DB contract (slug shape, duplicate route, brandless
 * site…) — shown verbatim inside a friendly toast, never masked.
 */
import { useMemo, useState } from "react";
import { BookOpenCheck, Loader2, PenLine, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PartyRow } from "@/features/crm/types";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { createContentPlanNodeScope } from "@/features/surfaces/manifests/content-plan-node.manifest";
import {
  SurfaceRuntimeProvider,
  type SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import { NODE_TYPE_LABELS } from "../constants";
import {
  useDeletePlanNode,
  useKeywordLabels,
  usePlanNodeEdgeMutation,
  usePlanNodeEdges,
  usePlanNodes,
  useReparentPlanNode,
  useUpdatePlanNode,
} from "../data/hooks";
import type { PlanDeepenController } from "../hooks/useContentPlanAi";
import { usePlanWorkspaceParams } from "../hooks/usePlanWorkspaceParams";
import {
  PLAN_NODE_TYPES,
  PLAN_NODE_SECONDARY_KEYWORD_ROLE,
  SEO_KEYWORD_TOKEN,
  TECHNICAL_DEPTHS,
  type PlanEntityRow,
  type PlanNodeRow,
  type PlanNodeType,
  type PlanNodeUpdate,
  type PlanProfileRow,
  type TechnicalDepth,
} from "../types";
import { CategorySelect } from "@/features/scopes/components/CategorySelect";
import {
  isDraftPending,
  readBriefDraft,
  useBriefWriter,
} from "../hooks/useBriefWriter";
import { LiveRunWindowController } from "@/features/overlays/openers/liveRunWindow";
import type { CmsPageMapEntry } from "../setup/bridge";
import { useNodeReality } from "../hooks/useNodeReality";
import { NodeRealityCard } from "./NodeRealityCard";
import { NodeStepRail } from "./NodeStepRail";
import { NodeSeoIntentEditor } from "./NodeSeoIntentEditor";
import { ensureKeywordId } from "@/features/marketing/seo/keyword/data";
import { useResolvedKeyword } from "@/features/marketing/seo/keyword/hooks";
import { buildKeywordBrief } from "@/features/marketing/seo/keyword/keyword-brief";

/** Stable empty map — a fresh `new Map()` per render would churn the card. */
const EMPTY_CMS_PAGES: ReadonlyMap<string, CmsPageMapEntry> = new Map();
import { NodeAssociations } from "./NodeAssociations";
import { AttributesEditor } from "./AttributesEditor";
import { BriefEditor } from "./BriefEditor";
import { hasKeywordAssignment } from "../plan-assists-producer";

export function NodePanel({
  node,
  siteId,
  entities,
  parties,
  profiles,
  onDeleted,
  deepen,
  cmsPage,
  cmsSiteId,
  cmsPagesByNodeId,
  hosted = false,
}: {
  node: PlanNodeRow;
  siteId: string;
  entities: PlanEntityRow[];
  /** The site's linked crm.party roster (people/companies). */
  parties: PartyRow[];
  profiles: PlanProfileRow[];
  onDeleted: () => void;
  /** Workbench-owned so an in-flight run survives node switches (the panel
   * remounts per node via key={node.id}). */
  deepen: PlanDeepenController;
  /** WF-11: the CMS page realizing this node (null = none / unpaired). */
  cmsPage?: CmsPageMapEntry | null;
  /** The paired CMS site id — the "Edit in CMS" link target. */
  cmsSiteId?: string | null;
  /** Every node's CMS page — the reality card needs it to build ancestors. */
  cmsPagesByNodeId?: ReadonlyMap<string, CmsPageMapEntry>;
  /**
   * The canonical side panel / WindowPanel already owns title and close chrome.
   * Keep only this editor's action toolbar when hosted so controls never stack
   * under the host close button.
   */
  hosted?: boolean;
}) {
  const update = useUpdatePlanNode(siteId);
  const remove = useDeletePlanNode(siteId);
  const deepening = deepen.run.status === "running";
  const deepeningThisNode = deepening && deepen.nodeId === node.id;

  const [draft, setDraft] = useState<PlanNodeUpdate>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset the draft only when a DIFFERENT node is shown (the panel is also
  // keyed by node.id at its call sites). Background refetches of the same
  // node must NOT clear in-progress edits — the draft is a per-field patch
  // overlaying the fresh row, so untouched fields always show live values.
  const [prevNodeId, setPrevNodeId] = useState(node.id);
  if (prevNodeId !== node.id) {
    setPrevNodeId(node.id);
    setDraft({});
  }

  const current = useMemo(
    () => ({
      label: draft.label ?? node.label,
      slug: draft.slug !== undefined ? draft.slug : node.slug,
      node_type: (draft.node_type ?? node.node_type) as PlanNodeType,
      page_type_id:
        draft.page_type_id !== undefined
          ? draft.page_type_id
          : node.page_type_id,
      status_id:
        draft.status_id !== undefined ? draft.status_id : node.status_id,
      priority: draft.priority !== undefined ? draft.priority : node.priority,
      technical_depth: (draft.technical_depth !== undefined
        ? draft.technical_depth
        : node.technical_depth) as TechnicalDepth | null,
      needs_reviewer: draft.needs_reviewer ?? node.needs_reviewer,
      primary_keyword_id:
        draft.primary_keyword_id !== undefined
          ? draft.primary_keyword_id
          : node.primary_keyword_id,
      meta_title:
        draft.meta_title !== undefined ? draft.meta_title : node.meta_title,
      meta_description:
        draft.meta_description !== undefined
          ? draft.meta_description
          : node.meta_description,
      brief: draft.brief ?? node.brief,
      attributes: draft.attributes ?? node.attributes,
    }),
    [draft, node],
  );

  const dirty = Object.keys(draft).length > 0;

  const nodeEdges = usePlanNodeEdges(node.id);
  const edgeMutation = usePlanNodeEdgeMutation(node.id);
  const supportingEdges = (nodeEdges.data ?? []).filter(
    (edge) =>
      edge.direction === "outgoing" &&
      edge.otherType === SEO_KEYWORD_TOKEN &&
      edge.role === PLAN_NODE_SECONDARY_KEYWORD_ROLE,
  );
  const keywordIds = [
    ...(current.primary_keyword_id ? [current.primary_keyword_id] : []),
    ...supportingEdges.map((edge) => edge.otherId),
  ];
  const keywordLabels = useKeywordLabels(keywordIds);
  const phraseById = new Map(
    (keywordLabels.data ?? []).map((row) => [row.id, row.phrase]),
  );
  const primaryKeyword = current.primary_keyword_id
    ? (phraseById.get(current.primary_keyword_id) ?? null)
    : null;
  const resolvedPrimary = useResolvedKeyword(primaryKeyword);
  const primaryKeywordBrief = primaryKeyword
    ? buildKeywordBrief({
        phrase: primaryKeyword,
        keyword: resolvedPrimary.data?.keyword ?? null,
        market: resolvedPrimary.data?.market ?? null,
      })
    : null;
  const supportingKeywords = supportingEdges.map((edge) => ({
    id: edge.otherId,
    phrase: phraseById.get(edge.otherId) ?? null,
  }));

  /**
   * Does this page still lack a target keyword?
   *
   * Read off the SAVED row, not the staged draft — that is exactly what the
   * server's `assert_brief_preconditions` reads, so the button's state and the
   * server's answer can never disagree. Enabling Draft brief on an unsaved pick
   * would send the user into a guaranteed 409.
   *
   * `keywordStaged` is the in-between: they've chosen one and haven't saved. The
   * fix then isn't "pick a keyword", it's "press Save" — so say that instead.
   */
  const keywordGap = !hasKeywordAssignment(node);
  const keywordStaged =
    keywordGap &&
    Boolean(draft.primary_keyword_id) &&
    draft.primary_keyword_id !== node.primary_keyword_id;

  const save = () => {
    update.mutate(
      { id: node.id, patch: draft },
      {
        onSuccess: () => {
          setDraft({});
          toast.success("Node saved.");
        },
        onError: (error) =>
          toast.error(
            `Could not save this node: ${extractErrorMessage(error)}`,
          ),
      },
    );
  };

  // ── Surface: matrx-user/content-plan-node ──────────────────────────────
  // While the panel is open this nested provider is the DEEPEST runtime, so
  // agents launched here see the node's PARTS (draft-overlaid), and the
  // surface's declared writeTargets resolve to the handlers below. Field
  // writes STAGE into the draft — the user reviews and saves; save_node is
  // the one entity-mode target (the same canonical write path as Save).
  const { view } = usePlanWorkspaceParams();
  // Owned HERE, not in the card, so the same three actions back both the
  // buttons a human presses and the write targets an agent applies.
  const reality = useNodeReality({
    siteId,
    nodeId: node.id,
    nodeUpdatedAt: node.updated_at,
    cmsSiteId: cmsSiteId ?? null,
    cmsPage: cmsPage ?? null,
    cmsPagesByNodeId: cmsPagesByNodeId ?? EMPTY_CMS_PAGES,
  });
  const getScope = () =>
    createContentPlanNodeScope({
      view,
      node_id: node.id,
      node_label: current.label,
      node_type: current.node_type,
      node_needs_reviewer: current.needs_reviewer,
      has_unsaved_edits: dirty,
      node_slug: current.slug ?? undefined,
      node_route: node.route ?? undefined,
      node_parent_id: node.parent_id ?? undefined,
      node_depth: node.depth ?? undefined,
      node_pillar_label: node.pillar_label ?? undefined,
      node_cluster_label: node.cluster_label ?? undefined,
      node_page_type_id: current.page_type_id ?? undefined,
      node_status_id: current.status_id ?? undefined,
      node_priority: current.priority ?? undefined,
      node_technical_depth: current.technical_depth ?? undefined,
      node_primary_keyword_id: current.primary_keyword_id ?? undefined,
      node_primary_keyword: primaryKeyword ?? undefined,
      node_primary_keyword_data: primaryKeywordBrief?.data,
      node_supporting_keywords: supportingKeywords,
      node_meta_title: current.meta_title ?? undefined,
      node_meta_description: current.meta_description ?? undefined,
      node_meta_tags: {
        meta_title: current.meta_title ?? null,
        meta_description: current.meta_description ?? null,
      },
      node_keyword_plan: {
        primary_keyword: primaryKeyword,
        primary_keyword_data: primaryKeywordBrief?.data ?? null,
        supporting_keywords: supportingKeywords,
      },
      node_brief: current.brief ?? undefined,
      node_attributes:
        current.attributes &&
        typeof current.attributes === "object" &&
        !Array.isArray(current.attributes)
          ? (current.attributes as Record<string, unknown>)
          : undefined,
      node_updated_at: node.updated_at ?? undefined,
      // The evidence loop: an agent reads what became of this page before it
      // decides whether to build, write or publish it.
      node_page_state: reality.verdict.state,
      node_page_next_step: reality.verdict.action ?? "none",
      node_page_id: cmsPage?.pageId ?? undefined,
      node_page_live_url: cmsPage?.liveUrl ?? undefined,
    });

  const stage = (patch: PlanNodeUpdate) =>
    setDraft((d) => ({ ...d, ...patch }));

  // Neighbour-aware brief draft. The run is SERVER-side and the result is
  // persisted onto the node before it ever reaches this component — the panel
  // reads `node.metadata.ai_brief_draft`, it never holds the only copy.
  const briefWriter = useBriefWriter({ node, siteId });
  const briefDraft = readBriefDraft(node);
  const draftPending = isDraftPending(node, briefDraft);
  const getWriteHandlers = (): SurfaceWriteHandlers => ({
    // The build actions. `entity` mode — these do real work on the real
    // website, so they are offered (`ask`) and never applied unattended.
    build_page: async () => {
      if (reality.verdict.state !== "not-built") {
        throw new Error(
          `This page is already built (${reality.verdict.state}). Nothing to create.`,
        );
      }
      const failure = await reality.create();
      if (failure) throw new Error(failure);
    },
    write_page_content: async () => {
      if (!cmsPage) {
        throw new Error(
          // access-errors: ok — guards an AGENT action against a plan node whose page is unbuilt; the same verdict the human card shows.
          "This page does not exist on the website yet — apply build_page first.",
        );
      }
      const failure = await reality.write();
      if (failure) throw new Error(failure);
    },
    publish_page: async () => {
      if (!cmsPage) {
        throw new Error(
          // access-errors: ok — guards an AGENT action against a plan node whose page is unbuilt; the same verdict the human card shows.
          "This page does not exist on the website yet — apply build_page first.",
        );
      }
      // Guarded like the others: without this an agent could chain
      // build_page -> publish_page and put an EMPTY page on the public web.
      // The human card never offers publish in those states either.
      if (
        reality.verdict.state === "empty" ||
        reality.verdict.state === "retired"
      ) {
        throw new Error(
          `This page is ${reality.verdict.state} — publishing it would put an unfinished page on the public web. Apply write_page_content first.`,
        );
      }
      const failure = await reality.publish();
      if (failure) throw new Error(failure);
    },
    node_label: (value) => stage({ label: expectString(value, "node_label") }),
    node_slug: (value) =>
      stage({ slug: expectStringOrNull(value, "node_slug") }),
    node_type: (value) => {
      const next = expectString(value, "node_type");
      if (!PLAN_NODE_TYPES.includes(next as PlanNodeType)) {
        throw new Error(
          `node_type must be one of: ${PLAN_NODE_TYPES.join(", ")}`,
        );
      }
      stage({ node_type: next as PlanNodeType });
    },
    node_status_id: (value) =>
      stage({ status_id: expectStringOrNull(value, "node_status_id") }),
    node_priority: (value) => {
      if (value !== null && typeof value !== "number") {
        throw new Error("node_priority must be a number or null");
      }
      stage({ priority: value });
    },
    node_technical_depth: (value) => {
      const next = expectStringOrNull(value, "node_technical_depth");
      if (next !== null && !TECHNICAL_DEPTHS.includes(next as TechnicalDepth)) {
        throw new Error(
          `node_technical_depth must be one of: ${TECHNICAL_DEPTHS.join(", ")} (or null)`,
        );
      }
      stage({ technical_depth: next as TechnicalDepth | null });
    },
    node_needs_reviewer: (value) => {
      if (typeof value !== "boolean") {
        throw new Error("node_needs_reviewer must be a boolean");
      }
      stage({ needs_reviewer: value });
    },
    node_primary_keyword: async (value) => {
      const obj = expectObject(value, "node_primary_keyword");
      const phrase = expectString(obj.keyword, "node_primary_keyword.keyword");
      stage({ primary_keyword_id: await ensureKeywordId(phrase) });
    },
    node_supporting_keywords: async (value) => {
      const phrases = expectStringArrayProperty(
        value,
        "keywords",
        "node_supporting_keywords",
      );
      const ids = await Promise.all(
        phrases.map((phrase) => ensureKeywordId(phrase)),
      );
      await Promise.all(
        ids.map((keywordId) =>
          edgeMutation.mutateAsync({
            kind: "add-secondary-keyword",
            keywordId,
          }),
        ),
      );
    },
    node_remove_supporting_keywords: async (value) => {
      const phrases = expectStringArrayProperty(
        value,
        "keywords",
        "node_remove_supporting_keywords",
      );
      const normalized = new Set(
        phrases.map((phrase) => phrase.trim().toLocaleLowerCase()),
      );
      const matches = supportingKeywords.filter(
        (entry) =>
          entry.phrase &&
          normalized.has(entry.phrase.trim().toLocaleLowerCase()),
      );
      if (matches.length !== normalized.size) {
        throw new Error(
          "node_remove_supporting_keywords includes a phrase that is not attached to this page.",
        );
      }
      await Promise.all(
        matches.map((entry) =>
          edgeMutation.mutateAsync({
            kind: "remove-secondary-keyword",
            keywordId: entry.id,
          }),
        ),
      );
    },
    node_meta_tags: (value) => {
      const obj = expectObject(value, "node_meta_tags");
      const patch: PlanNodeUpdate = {};
      if (Object.hasOwn(obj, "meta_title")) {
        patch.meta_title = expectNullableString(
          obj.meta_title,
          "node_meta_tags.meta_title",
        );
      }
      if (Object.hasOwn(obj, "meta_description")) {
        patch.meta_description = expectNullableString(
          obj.meta_description,
          "node_meta_tags.meta_description",
        );
      }
      if (!("meta_title" in patch) && !("meta_description" in patch)) {
        throw new Error(
          "node_meta_tags requires meta_title and/or meta_description.",
        );
      }
      stage(patch);
    },
    // The SAME operation the "Use this brief" button on the rendered brief
    // runs — one path, whether a human clicks it or an agent applies it.
    accept_brief_draft: async () => {
      if (!draftPending) {
        throw new Error(
          "There is no pending brief proposal on this page to accept.",
        );
      }
      await briefWriter.accept();
    },
    node_brief: (value) => {
      if (
        !Array.isArray(value) ||
        value.some((line) => typeof line !== "string")
      ) {
        throw new Error("node_brief must be an array of strings");
      }
      stage({ brief: value });
    },
    node_attributes: (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("node_attributes must be an object");
      }
      stage({ attributes: value as PlanNodeUpdate["attributes"] });
    },
    save_node: async () => {
      if (!dirty) throw new Error("Nothing to save — the draft is empty.");
      await update.mutateAsync({ id: node.id, patch: draft });
      setDraft({});
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/content-plan-node"
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
    >
      <div
        data-surface-value="selected_node"
        className="flex h-full flex-col bg-background"
      >
        <div className="flex flex-wrap items-start justify-end gap-2 border-b border-border px-4 py-2.5">
          {!hosted ? (
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold leading-snug text-foreground">
                {node.label}
              </p>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {node.route ?? "(no route yet)"}
              </p>
              {node.pillar_label || node.cluster_label ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[
                    node.pillar_label ? `Pillar: ${node.pillar_label}` : null,
                    node.cluster_label
                      ? `Cluster: ${node.cluster_label}`
                      : null,
                    `Depth ${node.depth}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={briefWriter.busy || deepening || keywordGap}
            title={
              keywordGap
                ? "This page needs a target search term first — pick one under Targeting, or use Deepen to research the page and choose its term together"
                : briefWriter.busy
                  ? "Drafting…"
                  : "AI: draft this page's brief against its SIBLINGS — saved to this page for you to review, then applied when you accept it"
            }
            onClick={() => void briefWriter.start()}
          >
            {briefWriter.busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PenLine className="h-3.5 w-3.5" />
            )}
            Draft brief
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={deepening}
            title={
              deepeningThisNode
                ? (deepen.run.stage ?? "Deepening…")
                : deepening
                  ? "Another node is being deepened — one run at a time"
                  : "AI: research this page and write its brief + sources (saves immediately)"
            }
            onClick={() => void deepen.start(node.id)}
          >
            {deepeningThisNode ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <BookOpenCheck className="h-3.5 w-3.5" />
            )}
            {deepeningThisNode ? "Deepening…" : "Deepen"}
          </Button>
          <Button
            size="sm"
            className="h-7"
            disabled={!dirty || update.isPending}
            onClick={save}
          >
            {update.isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            aria-label="Delete node"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Live AI output renders in a FLOATING window, never as a block bolted
          onto the top of this panel. A block there shifts every field below it
          the instant a run starts and puts the model's output above the thing
          the user is editing. The window floats, so the panel never moves and
          the user can keep editing while they watch — and because the window's
          body is the canonical pipeline, a run whose output is a registered
          content-IR kind renders as that kind's COMPONENT, token by token,
          instead of a wall of raw JSON. */}
        {briefWriter.run.status === "running" || briefWriter.run.requestId ? (
          <LiveRunWindowController
            instanceId={`brief:${node.id}`}
            requestId={briefWriter.run.requestId ?? null}
            label="Drafting brief"
            pending={briefWriter.busy && !briefWriter.run.requestId}
            // Measured, not guessed: a finished `page_brief` (angle + ~9 points
            // + must-not-cover + concerns) fills ~90% of the viewport. At the
            // 80vh default it scrolls for no reason; taller than this and the
            // window stops being a floating panel over the page.
            height="90vh"
          />
        ) : null}
        {deepen.nodeId === node.id &&
        (deepeningThisNode || deepen.run.requestId) ? (
          <LiveRunWindowController
            instanceId={`deepen:${node.id}`}
            requestId={deepen.run.requestId ?? null}
            label={
              deepen.run.stage
                ? `Deepening — ${deepen.run.stage}`
                : "Deepening — brief + sources"
            }
            pending={deepeningThisNode && !deepen.run.requestId}
          />
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-4">
            <PanelSection title="Page">
              <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                <div className="col-span-2">
                  <Label className="mb-1 block text-xs font-medium">
                    Label
                  </Label>
                  <Input
                    value={current.label}
                    onChange={(event) =>
                      setDraft((d) => ({ ...d, label: event.target.value }))
                    }
                    className="h-8"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs font-medium">
                    Slug (kebab-case)
                  </Label>
                  <Input
                    value={current.slug ?? ""}
                    placeholder={
                      current.node_type === "home"
                        ? "(home — none)"
                        : "my-page-slug"
                    }
                    onChange={(event) =>
                      setDraft((d) => ({
                        ...d,
                        slug:
                          event.target.value.trim() === ""
                            ? null
                            : event.target.value.trim(),
                      }))
                    }
                    className="h-8 font-mono"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs font-medium">
                    Node type
                  </Label>
                  <Select
                    value={current.node_type}
                    onValueChange={(next) =>
                      setDraft((d) => ({
                        ...d,
                        node_type: next as PlanNodeType,
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAN_NODE_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {NODE_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs font-medium">
                    Page type
                  </Label>
                  <CategorySelect
                    dimension={CATEGORY_DIMENSIONS.planPageType}
                    value={current.page_type_id}
                    onChange={(id) =>
                      setDraft((d) => ({ ...d, page_type_id: id }))
                    }
                    placeholder="Page type"
                  />
                </div>
                <div data-surface-value="status_options">
                  <Label className="mb-1 block text-xs font-medium">
                    Status
                  </Label>
                  <CategorySelect
                    dimension={CATEGORY_DIMENSIONS.planStatus}
                    value={current.status_id}
                    onChange={(id) =>
                      setDraft((d) => ({ ...d, status_id: id }))
                    }
                    placeholder="Status"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs font-medium">
                    Priority (1 = highest)
                  </Label>
                  <Select
                    value={
                      current.priority == null
                        ? "none"
                        : String(current.priority)
                    }
                    onValueChange={(next) =>
                      setDraft((d) => ({
                        ...d,
                        priority: next === "none" ? null : Number(next),
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <span className="text-muted-foreground">None</span>
                      </SelectItem>
                      <SelectItem value="1">1 — must have</SelectItem>
                      <SelectItem value="2">2 — should have</SelectItem>
                      <SelectItem value="3">3 — nice to have</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs font-medium">
                    Technical depth
                  </Label>
                  <Select
                    value={current.technical_depth ?? "none"}
                    onValueChange={(next) =>
                      setDraft((d) => ({
                        ...d,
                        technical_depth:
                          next === "none" ? null : (next as TechnicalDepth),
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <span className="text-muted-foreground">None</span>
                      </SelectItem>
                      {TECHNICAL_DEPTHS.map((depth) => (
                        <SelectItem key={depth} value={depth}>
                          {depth}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2 pb-1">
                  <Checkbox
                    id={`needs-reviewer-${node.id}`}
                    checked={current.needs_reviewer}
                    onCheckedChange={(checked) =>
                      setDraft((d) => ({
                        ...d,
                        needs_reviewer: checked === true,
                      }))
                    }
                  />
                  <Label
                    htmlFor={`needs-reviewer-${node.id}`}
                    className="text-xs font-medium"
                  >
                    Needs reviewer (E-E-A-T)
                  </Label>
                </div>
              </div>
            </PanelSection>

            <PanelSection title="Placement">
              <MoveNodeControl node={node} siteId={siteId} />
            </PanelSection>

            {/* ALWAYS rendered — "this page does not exist yet" is the state that
          most needs an answer, and the old conditional card showed nothing at
          all for it. See NodeRealityCard. */}
            <PanelSection title="The real page">
              <NodeRealityCard
                node={node}
                cmsPage={cmsPage ?? null}
                cmsSiteId={cmsSiteId ?? null}
                reality={reality}
              />
            </PanelSection>

            {/* The Website Factory production axis (plan.node_step /
          node_artifact) — distinct from the editorial plan_status. Pending
          steps are deliberately visible: the pipeline exists in data even
          where today's fill still skips it. */}
            <PanelSection title="Pipeline">
              <NodeStepRail nodeId={node.id} siteId={siteId} />
            </PanelSection>

            <PanelSection title="Targeting">
              <div>
                <NodeSeoIntentEditor
                  nodeId={node.id}
                  siteId={siteId}
                  organizationId={node.organization_id}
                  primaryKeywordId={current.primary_keyword_id}
                  metaTitle={current.meta_title ?? ""}
                  metaDescription={current.meta_description ?? ""}
                  onPrimaryKeywordChange={(primary_keyword_id) =>
                    stage({ primary_keyword_id })
                  }
                  onMetaTitleChange={(meta_title) =>
                    stage({ meta_title: meta_title.trim() ? meta_title : null })
                  }
                  onMetaDescriptionChange={(meta_description) =>
                    stage({
                      meta_description: meta_description.trim()
                        ? meta_description
                        : null,
                    })
                  }
                />
                {/* THE GAP, WHERE THE FIX IS. A page with no target term cannot be
                briefed or written, and every downstream agent used to discover
                that only after a paid run. The picker above is the fix, so the
                notice sits on it — never in a summary count somewhere else. */}
                {keywordGap ? (
                  <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-500">
                    {keywordStaged ? (
                      <>
                        Press <span className="font-medium">Save</span> to apply
                        this keyword — then this page can be briefed and
                        written.
                      </>
                    ) : (
                      <>
                        This page has no target search term yet, so nothing
                        tells it apart from its sibling pages — and briefs and
                        drafts can&apos;t be written without one. Pick one
                        above, or use{" "}
                        <span className="font-medium">Deepen</span> to research
                        this page and choose its term together.
                      </>
                    )}
                  </p>
                ) : null}
              </div>
            </PanelSection>

            <PanelSection title="Brief">
              <BriefEditor
                lines={current.brief ?? []}
                onChange={(next) => stage({ brief: next })}
                draft={briefDraft}
                draftPending={draftPending}
                onAccept={() => void briefWriter.accept()}
                accepting={briefWriter.accepting}
                runs={briefWriter.runs}
                runsLoading={briefWriter.runsLoading}
                runsError={briefWriter.runsError}
                onRestore={(runId) => void briefWriter.restore(runId)}
                restoringRunId={briefWriter.restoringRunId}
              />
            </PanelSection>

            <AttributesEditor
              value={current.attributes}
              profiles={profiles}
              onChange={(attributes) => setDraft((d) => ({ ...d, attributes }))}
            />

            <NodeAssociations
              nodeId={node.id}
              entities={entities}
              parties={parties}
            />
          </div>
        </div>

        <ConfirmDialogSection
          node={node}
          confirmDelete={confirmDelete}
          setConfirmDelete={setConfirmDelete}
          remove={remove}
          onDeleted={onDeleted}
        />
      </div>
    </SurfaceRuntimeProvider>
  );
}

/** Write-handler input guards — a bad value throws; the writeback seam turns it into a safe error envelope. */
function expectString(value: unknown, what: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${what} must be a non-empty string`);
  }
  return value;
}

function expectStringOrNull(value: unknown, what: string): string | null {
  if (value === null) return null;
  return expectString(value, `${what} (when not null)`);
}

function expectObject(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

function expectNullableString(value: unknown, what: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${what} must be a string or null`);
  }
  return value.trim() || null;
}

function expectStringArrayProperty(
  value: unknown,
  property: string,
  what: string,
): string[] {
  const obj = expectObject(value, what);
  const raw = obj[property];
  if (
    !Array.isArray(raw) ||
    raw.length === 0 ||
    raw.some((entry) => typeof entry !== "string" || !entry.trim())
  ) {
    throw new Error(`${what}.${property} must be a non-empty string array`);
  }
  return [...new Set(raw.map((entry) => entry.trim()))];
}

/**
 * One visual grammar for every panel section: a readable (foreground, not
 * gray) uppercase header + consistent inner rhythm. AttributesEditor and
 * NodeAssociations mirror the same header classes for their own sections.
 */
function PanelSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

/**
 * Explicit, drag-free reparent — the same ONE `parent_id` write the tree's
 * drag performs (keyboard/mobile accessible). Own-descendants are excluded
 * client-side for a clean list; the DB cycle guard remains the authority.
 */
function MoveNodeControl({
  node,
  siteId,
}: {
  node: PlanNodeRow;
  siteId: string;
}) {
  const nodes = usePlanNodes(siteId);
  const reparent = useReparentPlanNode(siteId);

  const options = useMemo(() => {
    const rows = nodes.data ?? [];
    const childrenOf = new Map<string | null, PlanNodeRow[]>();
    for (const row of rows) {
      const list = childrenOf.get(row.parent_id) ?? [];
      list.push(row);
      childrenOf.set(row.parent_id, list);
    }
    const blocked = new Set<string>([node.id]);
    const walk = (id: string) => {
      for (const child of childrenOf.get(id) ?? []) {
        blocked.add(child.id);
        walk(child.id);
      }
    };
    walk(node.id);
    return rows
      .filter((row) => !blocked.has(row.id))
      .sort((a, b) => (a.route ?? "").localeCompare(b.route ?? ""));
  }, [nodes.data, node.id]);

  return (
    <div>
      <Label className="mb-1 block text-xs font-medium">
        Parent — moving recomputes routes in the database
      </Label>
      <Select
        value={node.parent_id ?? "__root__"}
        onValueChange={(next) => {
          const parentId = next === "__root__" ? null : next;
          if (parentId === node.parent_id) return;
          reparent.mutate(
            { id: node.id, parentId },
            {
              onSuccess: () => toast.success("Node moved."),
              onError: (error) =>
                toast.error(`Move rejected: ${extractErrorMessage(error)}`),
            },
          );
        }}
        disabled={reparent.isPending}
      >
        <SelectTrigger className="h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__root__">
            <span className="text-muted-foreground">Site root (top level)</span>
          </SelectItem>
          {options.map((row) => (
            <SelectItem key={row.id} value={row.id}>
              {row.route ?? row.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ConfirmDialogSection({
  node,
  confirmDelete,
  setConfirmDelete,
  remove,
  onDeleted,
}: {
  node: PlanNodeRow;
  confirmDelete: boolean;
  setConfirmDelete: (open: boolean) => void;
  remove: ReturnType<typeof useDeletePlanNode>;
  onDeleted: () => void;
}) {
  return (
    <>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this plan node?"
        description={`"${node.label}" will be soft-deleted. Nodes with live children are refused — move them first.`}
        confirmLabel="Delete"
        variant="destructive"
        busy={remove.isPending}
        onConfirm={() =>
          remove.mutate(node.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              toast.success("Node deleted.");
              onDeleted();
            },
            onError: (error) => {
              setConfirmDelete(false);
              toast.error(extractErrorMessage(error));
            },
          })
        }
      />
    </>
  );
}
