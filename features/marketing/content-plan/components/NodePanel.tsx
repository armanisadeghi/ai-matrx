"use client";

/**
 * Node detail panel — every editable plan.node field. `route` / `depth` /
 * `pillar_label` / `cluster_label` render READ-ONLY (trigger-owned derived
 * cache); after save the tree refetches so cascade recomputes show up.
 * Save errors are the DB contract (slug shape, duplicate route, brandless
 * site…) — shown verbatim inside a friendly toast, never masked.
 */
import { useMemo, useState } from "react";
import { ExternalLink, Loader2, PenLine, Sparkles, Trash2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
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
  usePlanNodes,
  useReparentPlanNode,
  useUpdatePlanNode,
} from "../data/hooks";
import type { PlanDeepenController } from "../hooks/useContentPlanAi";
import { usePlanWorkspaceParams } from "../hooks/usePlanWorkspaceParams";
import {
  PLAN_NODE_TYPES,
  TECHNICAL_DEPTHS,
  type PlanEntityRow,
  type PlanNodeRow,
  type PlanNodeType,
  type PlanNodeUpdate,
  type PlanProfileRow,
  type TechnicalDepth,
} from "../types";
import { CategorySelect } from "@/features/scopes/components/CategorySelect";
import { useBriefWriter } from "../hooks/useBriefWriter";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import type { CmsPageMapEntry } from "../setup/bridge";
import { KeywordPicker } from "./KeywordPicker";
import { NodeAssociations } from "./NodeAssociations";
import { AttributesEditor } from "./AttributesEditor";

export function NodePanel({
  node,
  siteId,
  entities,
  profiles,
  onDeleted,
  deepen,
  allNodes,
  cmsPage,
  cmsSiteId,
}: {
  node: PlanNodeRow;
  siteId: string;
  /** The whole plan — the brief writer reads this node's neighbours from it. */
  allNodes: PlanNodeRow[];
  entities: PlanEntityRow[];
  profiles: PlanProfileRow[];
  onDeleted: () => void;
  /** Workbench-owned so an in-flight run survives node switches (the panel
   * remounts per node via key={node.id}). */
  deepen: PlanDeepenController;
  /** WF-11: the CMS page realizing this node (null = none / unpaired). */
  cmsPage?: CmsPageMapEntry | null;
  /** The paired CMS site id — the "Edit in CMS" link target. */
  cmsSiteId?: string | null;
}) {
  const update = useUpdatePlanNode(siteId);
  const remove = useDeletePlanNode(siteId);
  const deepening = deepen.run.status === "running";
  const deepeningThisNode = deepening && deepen.nodeId === node.id;

  const [draft, setDraft] = useState<PlanNodeUpdate>({});
  // Raw textarea text for brief — split into the string[] draft only on
  // change, but the DISPLAYED value is the raw text so typing spaces and
  // blank lines works (transforming the controlled value ate them).
  const [briefText, setBriefText] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset the draft only when a DIFFERENT node is shown (the panel is also
  // keyed by node.id at its call sites). Background refetches of the same
  // node must NOT clear in-progress edits — the draft is a per-field patch
  // overlaying the fresh row, so untouched fields always show live values.
  const [prevNodeId, setPrevNodeId] = useState(node.id);
  if (prevNodeId !== node.id) {
    setPrevNodeId(node.id);
    setDraft({});
    setBriefText(null);
  }

  const current = useMemo(
    () => ({
      label: draft.label ?? node.label,
      slug: draft.slug !== undefined ? draft.slug : node.slug,
      node_type: (draft.node_type ?? node.node_type) as PlanNodeType,
      page_type_id:
        draft.page_type_id !== undefined ? draft.page_type_id : node.page_type_id,
      status_id: draft.status_id !== undefined ? draft.status_id : node.status_id,
      priority: draft.priority !== undefined ? draft.priority : node.priority,
      technical_depth: (draft.technical_depth !== undefined
        ? draft.technical_depth
        : node.technical_depth) as TechnicalDepth | null,
      needs_reviewer: draft.needs_reviewer ?? node.needs_reviewer,
      primary_keyword_id:
        draft.primary_keyword_id !== undefined
          ? draft.primary_keyword_id
          : node.primary_keyword_id,
      brief: draft.brief ?? node.brief,
      attributes: draft.attributes ?? node.attributes,
    }),
    [draft, node],
  );

  const dirty = Object.keys(draft).length > 0;

  const save = () => {
    update.mutate(
      { id: node.id, patch: draft },
      {
        onSuccess: () => {
          setDraft({});
          setBriefText(null);
          toast.success("Node saved.");
        },
        onError: (error) =>
          toast.error(`Could not save this node: ${extractErrorMessage(error)}`),
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
      node_brief: current.brief ?? undefined,
      node_attributes:
        current.attributes &&
        typeof current.attributes === "object" &&
        !Array.isArray(current.attributes)
          ? (current.attributes as Record<string, unknown>)
          : undefined,
      node_updated_at: node.updated_at ?? undefined,
    });

  const stage = (patch: PlanNodeUpdate) =>
    setDraft((d) => ({ ...d, ...patch }));

  // Neighbour-aware brief draft — stages into the SAME draft the user saves.
  const briefWriter = useBriefWriter({
    node,
    siteId,
    allNodes,
    onStaged: (brief) => {
      stage({ brief });
      setBriefText(brief.join("\n"));
    },
  });
  const getWriteHandlers = (): SurfaceWriteHandlers => ({
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
    node_primary_keyword_id: (value) =>
      stage({
        primary_keyword_id: expectStringOrNull(
          value,
          "node_primary_keyword_id",
        ),
      }),
    node_brief: (value) => {
      if (
        !Array.isArray(value) ||
        value.some((line) => typeof line !== "string")
      ) {
        throw new Error("node_brief must be an array of strings");
      }
      stage({ brief: value });
      setBriefText(value.join("\n"));
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
      setBriefText(null);
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
      <div className="flex items-start gap-2 border-b border-border px-4 py-2.5">
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
                node.cluster_label ? `Cluster: ${node.cluster_label}` : null,
                `Depth ${node.depth}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={briefWriter.busy || deepening}
          title={
            briefWriter.disabledReason ??
            "AI: draft this page's brief against its SIBLINGS — staged for you to review, not saved"
          }
          onClick={() => void briefWriter.run()}
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
            <Sparkles className="h-3.5 w-3.5" />
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

      {/* Live AI output — the model's stream renders here while it works
          (never a bare spinner). Draft brief is a client slot run; Deepen is
          the server pipeline's adopted stream. */}
      {briefWriter.live.hasLiveRun ? (
        <div className="border-b border-border px-4 py-2">
          <LiveRunDisplay
            conversationId={briefWriter.live.conversationId}
            label={briefWriter.live.label ?? "Drafting brief"}
            pending={briefWriter.live.isRunning}
            onDismiss={briefWriter.live.dismiss}
          />
        </div>
      ) : null}
      {deepen.nodeId === node.id &&
      (deepeningThisNode || deepen.run.requestId) ? (
        <div className="border-b border-border px-4 py-2">
          <LiveRunDisplay
            requestId={deepen.run.requestId ?? null}
            label={
              deepen.run.stage
                ? `Deepening — ${deepen.run.stage}`
                : "Deepening — brief + sources"
            }
            pending={deepeningThisNode && !deepen.run.requestId}
            onDismiss={deepen.reset}
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-4">
        <PanelSection title="Page">
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          <div className="col-span-2">
            <Label className="mb-1 block text-xs font-medium">Label</Label>
            <Input
              value={current.label}
              onChange={(event) =>
                setDraft((d) => ({ ...d, label: event.target.value }))
              }
              className="h-8"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs font-medium">Slug (kebab-case)</Label>
            <Input
              value={current.slug ?? ""}
              placeholder={current.node_type === "home" ? "(home — none)" : "my-page-slug"}
              onChange={(event) =>
                setDraft((d) => ({
                  ...d,
                  slug: event.target.value.trim() === "" ? null : event.target.value.trim(),
                }))
              }
              className="h-8 font-mono"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs font-medium">Node type</Label>
            <Select
              value={current.node_type}
              onValueChange={(next) =>
                setDraft((d) => ({ ...d, node_type: next as PlanNodeType }))
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
            <Label className="mb-1 block text-xs font-medium">Page type</Label>
            <CategorySelect
              dimension={CATEGORY_DIMENSIONS.planPageType}
              value={current.page_type_id}
              onChange={(id) => setDraft((d) => ({ ...d, page_type_id: id }))}
              placeholder="Page type"
            />
          </div>
          <div data-surface-value="status_options">
            <Label className="mb-1 block text-xs font-medium">Status</Label>
            <CategorySelect
              dimension={CATEGORY_DIMENSIONS.planStatus}
              value={current.status_id}
              onChange={(id) => setDraft((d) => ({ ...d, status_id: id }))}
              placeholder="Status"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs font-medium">Priority (1 = highest)</Label>
            <Select
              value={current.priority == null ? "none" : String(current.priority)}
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
            <Label className="mb-1 block text-xs font-medium">Technical depth</Label>
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
                setDraft((d) => ({ ...d, needs_reviewer: checked === true }))
              }
            />
            <Label htmlFor={`needs-reviewer-${node.id}`} className="text-xs font-medium">
              Needs reviewer (E-E-A-T)
            </Label>
          </div>
        </div>
        </PanelSection>

        <PanelSection title="Placement">
          <MoveNodeControl node={node} siteId={siteId} />
        </PanelSection>

        {cmsPage ? (
          <PanelSection title="CMS Page">
            <div className="rounded-md border border-border bg-muted/20 p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 break-all font-mono text-xs text-foreground">
                  {cmsPage.route ?? cmsPage.title}
                </span>
                <span
                  className={
                    cmsPage.isPublished
                      ? "shrink-0 rounded bg-emerald-500/15 px-1.5 py-px text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
                      : "shrink-0 rounded bg-sky-500/15 px-1.5 py-px text-[10px] font-medium text-sky-600 dark:text-sky-400"
                  }
                >
                  {cmsPage.isPublished
                    ? cmsPage.hasDraft
                      ? "published + draft"
                      : "published"
                    : "draft"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {cmsSiteId ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() =>
                      window.open(
                        `/cms/${cmsSiteId}/pages/${cmsPage.pageId}`,
                        "_blank",
                      )
                    }
                  >
                    <PenLine className="h-3 w-3" />
                    Edit in CMS
                  </Button>
                ) : null}
                {(cmsPage.isPublished ? cmsPage.liveUrl : cmsPage.previewUrl) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() =>
                      window.open(
                        (cmsPage.isPublished
                          ? cmsPage.liveUrl
                          : cmsPage.previewUrl) as string,
                        "_blank",
                      )
                    }
                  >
                    <ExternalLink className="h-3 w-3" />
                    {cmsPage.isPublished ? "Open live" : "Preview"}
                  </Button>
                ) : null}
              </div>
            </div>
          </PanelSection>
        ) : null}

        <PanelSection title="Targeting">
          <div>
            <Label className="mb-1 block text-xs font-medium">
              Primary keyword
            </Label>
            <KeywordPicker
              siteId={siteId}
              organizationId={node.organization_id}
              value={current.primary_keyword_id}
              onChange={(keywordId) =>
                setDraft((d) => ({ ...d, primary_keyword_id: keywordId }))
              }
            />
          </div>
        </PanelSection>

        <PanelSection title="Brief">
          <div>
            <Label className="mb-1 block text-xs font-medium">
              One point per line
            </Label>
            <Textarea
              value={briefText ?? (node.brief ?? []).join("\n")}
              onChange={(event) => {
                const text = event.target.value;
                setBriefText(text);
                setDraft((d) => ({
                  ...d,
                  brief: text
                    .split("\n")
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0),
                }));
              }}
              placeholder={"What this page must cover…\nOne bullet per line"}
              className="min-h-28 text-sm"
            />
          </div>
        </PanelSection>

        <AttributesEditor
          value={current.attributes}
          profiles={profiles}
          onChange={(attributes) => setDraft((d) => ({ ...d, attributes }))}
        />

        <NodeAssociations
          nodeId={node.id}
          siteId={siteId}
          organizationId={node.organization_id}
          entities={entities}
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
