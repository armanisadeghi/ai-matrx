"use client";

/**
 * TOPIC TREE BUILDER — Arman's original ask, finally buildable by a human.
 *
 * The resolver has always walked a keyword's primary topic upward, taken the
 * nearest ancestor's worth, and reported the topmost ancestor's type as the
 * keyword's root. What never existed was a way to BUILD that tree: to pin a
 * parent, to say what a node is worth here, or to place a keyword on it. Every
 * value workbench variant renders topic worth read-only. This screen is the
 * missing half.
 *
 * It is arranged as the argument it has to make:
 *   1. the headline — how much of this site's traffic can ever become money;
 *   2. the tree — where that verdict comes from, and where you change it;
 *   3. the unplaced queue — the honest reason the headline is not the whole
 *      picture yet.
 *
 * Data: ./data.ts only. SoR:
 * common-docs/systems/marketing/seo/seo-keywords/value-system.md
 */

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleDollarSign,
  GitBranchPlus,
  ListTree,
  PanelTop,
  Pencil,
  Pin,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import type { CellEditsMap } from "@/components/official/matrx-data-table/types";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import { useOpenGscDrilldownWindow } from "@/features/overlays/openers/gscDrilldownWindow";
import { formatCount } from "@/features/marketing/search-console/types";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { TableLoadingComponent } from "@/components/matrx/LoadingComponents";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { getValueVocabulary } from "../data";
import { buildBandMeta, reviewWindow } from "../lib";
import {
  getOfferingSplit,
  getTopicDeleteImpact,
  getTopicStats,
  deleteTopic,
  listAllTopics,
  listTopicWorth,
  saveTopic,
  setTopicParent,
  setTopicWorth,
} from "./data";
import {
  buildTopicTree,
  forbiddenParents,
  lineageOf,
  tallyByTopic,
  type TopicTreeNode,
} from "./lib";
import { OfferingSplitHeadline } from "./OfferingSplitHeadline";
import { ProposedQueue } from "./ProposedQueue";
import { TopicPlacementStrip } from "./TopicPlacementStrip";
import {
  OfferingTreeTable,
  type OfferingRowActions,
  type OfferingTableRow,
} from "./OfferingTreeTable";
import { TopicEditDialog, type TopicEditDraft } from "./TopicEditDialog";
import { TopicWorthDialog } from "./TopicWorthDialog";
import {
  TopicPickerDialog,
  type TopicPickerRequest,
} from "./TopicPickerDialog";
import { TopicDeleteDialog, type TopicDeleteMode } from "./TopicDeleteDialog";
import {
  LEAD_QUALITY_OPTIONS,
  OFFERING_MATCH_OPTIONS,
  ROOT_TYPE_META,
} from "./types";
// THE ONE placement write for the whole product. The topic tree used to have
// its own wrapper over the same RPC that silently dropped the reason (P24).
import { setKeywordService } from "@/features/marketing/seo/keyword-workbench/data";
import { UnplacedQueue } from "./UnplacedQueue";

export function TopicTreeWorkbench() {
  const { site, brandId } = useMarketingSite();
  const searchParams = useSearchParams();
  const siteId = site.id;
  /**
   * `?topic=<id>[&worth=1]` — the door every value receipt points at when the
   * reader asks where a topic's worth comes from. The link lands ON the node:
   * ancestors expand, the row scrolls into view and is selected, and `worth=1`
   * opens its worth editor straight away. Landing on a tree with the node
   * buried three collapsed levels down would be a dead end wearing a link.
   */
  const focusTopicId = searchParams.get("topic");
  const focusWorth = searchParams.get("worth") === "1";
  const queryClient = useQueryClient();
  const openDrilldown = useOpenGscDrilldownWindow();
  const window28 = reviewWindow();
  const windowLabel = `${window28.start} → ${window28.end}`;

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TopicEditDraft | null>(null);
  const [worthNode, setWorthNode] = useState<TopicTreeNode | null>(null);
  const [picker, setPicker] = useState<TopicPickerRequest | null>(null);
  const [deleteNode, setDeleteNode] = useState<TopicTreeNode | null>(null);
  const [deleteMode, setDeleteMode] = useState<TopicDeleteMode>("unassign");
  const [replacementNode, setReplacementNode] = useState<TopicTreeNode | null>(
    null,
  );
  const contextNodeRef = useRef<TopicTreeNode | null>(null);

  // ── Reads ─────────────────────────────────────────────────────────────────
  const topics = useQuery({
    queryKey: ["seo", "topics", "catalog"],
    queryFn: () => listAllTopics(),
  });
  const worth = useQuery({
    queryKey: ["seo", "topics", "worth", siteId],
    queryFn: () => listTopicWorth(siteId),
  });
  const stats = useQuery({
    queryKey: ["seo", "topics", "stats", siteId, window28.start, window28.end],
    queryFn: ({ signal }) =>
      getTopicStats(siteId, window28.start, window28.end, signal),
  });
  const split = useQuery({
    queryKey: ["seo", "topics", "split", siteId, window28.start, window28.end],
    queryFn: ({ signal }) =>
      getOfferingSplit(siteId, window28.start, window28.end, signal),
  });
  const vocab = useQuery({
    queryKey: ["seo", "value", "vocab", siteId, "value_band"],
    queryFn: ({ signal }) => getValueVocabulary(siteId, "value_band", signal),
  });
  const deleteImpact = useQuery({
    queryKey: ["seo", "topics", "delete-impact", siteId, deleteNode?.topic.id],
    queryFn: () => {
      const topicId = deleteNode?.topic.id;
      if (!topicId) throw new Error("Choose an offering to delete.");
      return getTopicDeleteImpact(siteId, topicId);
    },
    enabled: Boolean(deleteNode),
  });
  const refreshTree = () =>
    queryClient.invalidateQueries({ queryKey: ["seo", "topics"] });

  // ── Writes ────────────────────────────────────────────────────────────────
  const failed = (action: string) => (error: unknown) =>
    toast.error(`Could not ${action}`, {
      description: extractErrorMessage(error),
    });

  const pinParent = useMutation({
    mutationFn: (input: { topicId: string; parentId: string | null }) =>
      setTopicParent(siteId, input.topicId, input.parentId),
    onSuccess: () => {
      setPicker(null);
      void refreshTree();
      toast.success("Parent pinned", {
        description:
          "Every keyword below it re-resolves against the new branch.",
      });
    },
    onError: failed("pin that parent"),
  });

  const upsertTopic = useMutation({
    mutationFn: (input: {
      topicId: string | null;
      name: string;
      nodeType: string;
      description: string;
      parentId: string | null;
    }) =>
      saveTopic(siteId, {
        topicId: input.topicId,
        name: input.name,
        nodeType: input.nodeType,
        description: input.description,
        parentId: input.parentId,
      }),
    onSuccess: (topicId) => {
      setEditDraft(null);
      setSelectedId(topicId);
      void refreshTree();
      toast.success("Offering saved");
    },
    onError: failed("save that offering"),
  });

  const saveWorth = useMutation({
    mutationFn: (input: {
      topicId: string;
      weight: number | null;
      leadQuality: string | null;
      offeringMatch: string | null;
      notes: string;
      clear?: boolean;
    }) =>
      setTopicWorth(siteId, input.topicId, {
        weight: input.weight,
        leadQuality: input.leadQuality,
        offeringMatch: input.offeringMatch,
        notes: input.notes,
        clear: input.clear,
      }),
    onSuccess: (_data, variables) => {
      setWorthNode(null);
      void refreshTree();
      toast.success(variables.clear ? "Ruling removed" : "Worth saved", {
        description: variables.clear
          ? "This offering falls back to its nearest ruled ancestor."
          : "It flows down to every offering beneath it.",
      });
    },
    onError: failed("save that offering's worth"),
  });

  const placeKeywords = useMutation({
    mutationFn: (input: {
      keywordIds: string[];
      topicId: string | null;
      notes: string | null;
    }) =>
      setKeywordService({
        siteId,
        keywordIds: input.keywordIds,
        topicId: input.topicId,
        notes: input.notes,
      }),
    onSuccess: (results) => {
      setPicker(null);
      void refreshTree();
      const bands = new Map<string, number>();
      for (const row of results)
        bands.set(row.valueBand, (bands.get(row.valueBand) ?? 0) + 1);
      toast.success(
        `${results.length} keyword${results.length === 1 ? "" : "s"} placed`,
        {
          description: [...bands.entries()]
            .map(([band, count]) => `${count} now ${band}`)
            .join(" · "),
        },
      );
    },
    onError: failed("place those keywords"),
  });

  const removeTopic = useMutation({
    mutationFn: (input: {
      topicId: string;
      replacementTopicId: string | null;
    }) => deleteTopic(siteId, input.topicId, input.replacementTopicId),
    onSuccess: (result) => {
      setDeleteNode(null);
      setReplacementNode(null);
      setSelectedId(null);
      void refreshTree();
      void queryClient.invalidateQueries({ queryKey: ["marketing", "gsc"] });
      toast.success(`“${result.topic_name}” deleted`, {
        description:
          result.keyword_links_reassigned > 0
            ? `${formatCount(result.keyword_links_reassigned)} keyword associations were reassigned.`
            : `${formatCount(result.keyword_links_removed)} keyword associations were removed.`,
      });
    },
    onError: failed("delete that offering"),
  });

  const busy =
    pinParent.isPending ||
    upsertTopic.isPending ||
    saveWorth.isPending ||
    placeKeywords.isPending ||
    removeTopic.isPending;

  // ── Derived ───────────────────────────────────────────────────────────────
  const loadingTree = topics.isPending || worth.isPending || stats.isPending;
  const treeError = topics.error ?? worth.error ?? stats.error;
  const tree = buildTopicTree(
    topics.data ?? [],
    worth.data ?? [],
    tallyByTopic(stats.data ?? []),
  );
  const metas = buildBandMeta(vocab.data ?? []);

  // Runs once per focused topic, after the tree has actually loaded.
  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusTopicId || loadingTree) return;
    if (focusedRef.current === focusTopicId) return;
    const node = tree.byId.get(focusTopicId);
    if (!node) return;
    focusedRef.current = focusTopicId;
    const ancestors = lineageOf(tree, focusTopicId).map((topic) => topic.id);
    let scrollFrame = 0;
    const frame = requestAnimationFrame(() => {
      setCollapsed((current) => {
        const next = new Set(current);
        for (const id of ancestors) next.delete(id);
        return next;
      });
      setSelectedId(focusTopicId);
      if (focusWorth) setWorthNode(node);
      // Let the expansion paint before scrolling to the row.
      scrollFrame = requestAnimationFrame(() => {
        document
          .querySelector(`[data-row-id="${focusTopicId}"]`)
          ?.scrollIntoView({ block: "center" });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(scrollFrame);
    };
  }, [focusTopicId, focusWorth, loadingTree, tree]);

  const toggleNode = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  };

  const openParentPicker = (node: TopicTreeNode) =>
    setPicker({
      mode: "parent",
      title: `Choose a parent for “${node.topic.name}”`,
      description:
        "Its parent's parent, all the way up, is what decides whether traffic here can ever become money.",
      subject: node.topic.name,
      currentTopicId: node.topic.parent_id,
      forbidden: forbiddenParents(tree, node.topic.id),
      clearLabel: "No parent — make this the top of its own branch",
      reasonPrompt: null,
      onChoose: (parentId) =>
        pinParent.mutate({ topicId: node.topic.id, parentId }),
    });

  const openKeywordPicker = (keywordIds: string[], label: string) =>
    setPicker({
      mode: "keyword",
      title: `Place ${label} on the tree`,
      description:
        "The keyword takes its worth from this offering, or from the nearest parent above it that has one.",
      subject: label,
      currentTopicId: null,
      forbidden: new Set<string>(),
      clearLabel: null,
      reasonPrompt: "Why does this belong here?",
      onChoose: (topicId, notes) =>
        placeKeywords.mutate({ keywordIds, topicId, notes }),
    });

  const openTopicKeywords = (node: TopicTreeNode) =>
    openDrilldown({
      siteId,
      siteName: site.domain,
      dimension: "query",
      filters: { topic: node.topic.id },
      title: `Keywords in ${node.topic.name}`,
    });

  const openDelete = (node: TopicTreeNode) => {
    setDeleteNode(node);
    setDeleteMode("unassign");
    setReplacementNode(null);
  };

  const openReplacementPicker = () => {
    if (!deleteNode) return;
    setPicker({
      mode: "parent",
      title: `Reassign “${deleteNode.topic.name}” associations`,
      description:
        "Every keyword association will move to the offering you choose. Site-specific worth and starter-pack judgments will still be removed.",
      subject: deleteNode.topic.name,
      currentTopicId: replacementNode?.topic.id ?? null,
      forbidden: new Set([deleteNode.topic.id]),
      clearLabel: null,
      reasonPrompt: null,
      onChoose: (topicId) => {
        const replacement = topicId ? (tree.byId.get(topicId) ?? null) : null;
        setReplacementNode(replacement);
        setDeleteMode("reassign");
        setPicker(null);
      },
    });
  };

  const openEdit = (target: TopicTreeNode) =>
    setEditDraft({
      topicId: target.topic.id,
      name: target.topic.name,
      nodeType: target.topic.node_type,
      description: target.topic.description ?? "",
      parentId: null,
      parentName: null,
    });

  const openAddChild = (target: TopicTreeNode) =>
    setEditDraft({
      topicId: null,
      name: "",
      nodeType: target.topic.node_type,
      description: "",
      parentId: target.topic.id,
      parentName: target.topic.name,
    });

  const topicActions: OfferingRowActions = {
    onPinParent: openParentPicker,
    onMakeRoot: (target) =>
      pinParent.mutate({ topicId: target.topic.id, parentId: null }),
    onSetWorth: (target) => setWorthNode(target),
    onEdit: openEdit,
    onAddChild: openAddChild,
    onViewKeywords: openTopicKeywords,
    onDelete: openDelete,
  };

  const runContextAction = (action: keyof OfferingRowActions) => {
    const node = contextNodeRef.current;
    if (node) topicActions[action](node);
  };

  const createOffering = () =>
    setEditDraft({
      topicId: null,
      name: "",
      nodeType: "service",
      description: "",
      parentId: null,
      parentName: null,
    });

  const saveTableEdits = async (
    edits: CellEditsMap,
    tableRows: OfferingTableRow[],
  ) => {
    const rowsById = new Map(tableRows.map((row) => [row.id, row]));
    const allowedTypes = new Set<string>(
      ROOT_TYPE_META.map((option) => option.value),
    );
    const allowedMatches = new Set<string>(
      OFFERING_MATCH_OPTIONS.map((option) => option.value),
    );
    const allowedLeadQualities = new Set<string>(
      LEAD_QUALITY_OPTIONS.map((option) => option.value),
    );

    for (const [rowId, fields] of Object.entries(edits)) {
      const row = rowsById.get(rowId);
      const node = tree.byId.get(rowId);
      if (!row || !node)
        throw new Error("That offering is no longer in this tree.");

      const changesName = Object.hasOwn(fields, "name");
      const changesType = Object.hasOwn(fields, "type");
      if (changesName || changesType) {
        const name = changesName ? fields.name : row.name;
        const nodeType = changesType ? fields.type : row.type;
        if (typeof name !== "string" || !name.trim()) {
          throw new Error("Every offering needs a name.");
        }
        if (typeof nodeType !== "string" || !allowedTypes.has(nodeType)) {
          throw new Error("Choose a supported offering type.");
        }
        await saveTopic(siteId, {
          topicId: rowId,
          name: name.trim(),
          nodeType,
          description: row.description,
        });
      }

      const changesWorth = Object.hasOwn(fields, "worth");
      const changesMatch = Object.hasOwn(fields, "offeringMatch");
      const changesLeadQuality = Object.hasOwn(fields, "leadQuality");
      if (changesWorth || changesMatch || changesLeadQuality) {
        const baseRuling = node.ownWorth ?? node.inheritedWorth;
        const weight = changesWorth ? fields.worth : row.worth;
        const offeringMatch = changesMatch
          ? fields.offeringMatch
          : (baseRuling?.offering_match ?? null);
        const leadQuality = changesLeadQuality
          ? fields.leadQuality
          : (baseRuling?.lead_quality ?? null);
        if (
          typeof weight !== "number" ||
          !Number.isFinite(weight) ||
          weight < 0 ||
          weight > 100
        ) {
          throw new Error("Worth must be a number from 0 to 100.");
        }
        if (
          offeringMatch !== null &&
          (typeof offeringMatch !== "string" ||
            !allowedMatches.has(offeringMatch))
        ) {
          throw new Error("Choose a supported offering match.");
        }
        if (
          leadQuality !== null &&
          (typeof leadQuality !== "string" ||
            !allowedLeadQualities.has(leadQuality))
        ) {
          throw new Error("Choose a supported lead quality.");
        }
        await setTopicWorth(siteId, rowId, {
          weight,
          offeringMatch,
          leadQuality,
          notes: node.ownWorth?.notes ?? baseRuling?.notes ?? "",
        });
      }
    }
    await refreshTree();
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain bg-textured p-3">
      {split.isPending ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Measuring where this site&apos;s traffic leads…
        </div>
      ) : split.error ? (
        <InlineQueryError
          what="where this site's traffic leads"
          error={split.error}
          onRetry={() => void split.refetch()}
        />
      ) : (
        <OfferingSplitHeadline
          rows={split.data ?? []}
          windowLabel={windowLabel}
        />
      )}

      {loadingTree ? (
        <TableLoadingComponent />
      ) : treeError ? (
        <InlineQueryError
          what="the offering tree"
          error={treeError}
          onRetry={() => {
            void topics.refetch();
            void worth.refetch();
            void stats.refetch();
          }}
        />
      ) : (
        <OfferingTreeTable
          nodes={[...tree.byId.values()]}
          byId={tree.byId}
          metas={metas}
          collapsed={collapsed}
          selectedId={selectedId}
          busy={busy}
          actions={topicActions}
          onToggle={toggleNode}
          onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
          onCreate={createOffering}
          onSaveEdits={saveTableEdits}
          wrapTable={(table) => (
            <NonEditableContextMenu
              sourceFeature="marketing"
              menuVersion={1}
              contextData={{ content: "" }}
              resolveContextOnOpen={(target) => {
                const topicId = target
                  ?.closest("[data-row-id]")
                  ?.getAttribute("data-row-id");
                const node = topicId ? (tree.byId.get(topicId) ?? null) : null;
                contextNodeRef.current = node;
                if (!node) return null;
                setSelectedId(node.topic.id);
                return {
                  [CONTEXT_MENU_ENTITY_KEY]: {
                    type: "seo_topic",
                    id: node.topic.id,
                    title: node.topic.name,
                  },
                  content: [
                    node.topic.name,
                    `${node.subtree.keywords.toLocaleString()} keywords`,
                    `${node.subtree.clicks.toLocaleString()} clicks`,
                    `${node.subtree.impressions.toLocaleString()} impressions`,
                    `effective worth ${node.effectiveWeight}`,
                  ].join(" · "),
                  topic_id: node.topic.id,
                  topic_name: node.topic.name,
                  keyword_count: node.subtree.keywords,
                  clicks: node.subtree.clicks,
                  impressions: node.subtree.impressions,
                };
              }}
              extraSections={[
                {
                  id: "topic-actions",
                  label: "Offering",
                  items: [
                    {
                      kind: "item",
                      id: "topic-view-keywords",
                      label: "See keywords in this branch",
                      icon: PanelTop,
                      description:
                        "Open the filtered keyword report in a floating panel",
                      onSelect: () => runContextAction("onViewKeywords"),
                    },
                    {
                      kind: "item",
                      id: "topic-pin-parent",
                      label: "Choose parent offering…",
                      icon: Pin,
                      onSelect: () => runContextAction("onPinParent"),
                    },
                    {
                      kind: "item",
                      id: "topic-make-root",
                      label: "Make this the top of its own branch",
                      icon: ListTree,
                      onSelect: () => runContextAction("onMakeRoot"),
                    },
                    {
                      kind: "item",
                      id: "topic-add-child",
                      label: "Add an offering beneath this…",
                      icon: GitBranchPlus,
                      onSelect: () => runContextAction("onAddChild"),
                    },
                    { kind: "separator", id: "topic-actions-separator-1" },
                    {
                      kind: "item",
                      id: "topic-set-worth",
                      label: "Set what it’s worth here…",
                      icon: CircleDollarSign,
                      onSelect: () => runContextAction("onSetWorth"),
                    },
                    {
                      kind: "item",
                      id: "topic-edit",
                      label: "Edit description…",
                      icon: Pencil,
                      onSelect: () => runContextAction("onEdit"),
                    },
                    { kind: "separator", id: "topic-actions-separator-2" },
                    {
                      kind: "item",
                      id: "topic-delete",
                      label: "Delete offering…",
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => runContextAction("onDelete"),
                    },
                  ],
                },
              ]}
            >
              {table}
            </NonEditableContextMenu>
          )}
        />
      )}

      {tree.orphanedParents.length > 0 ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning">
          {tree.orphanedParents.length} offering
          {tree.orphanedParents.length === 1 ? "" : "s"} point at a parent this
          account cannot see; they are drawn as roots so nothing is hidden.
        </p>
      ) : null}

      <TopicPlacementStrip
        siteId={siteId}
        siteName={siteId}
        onPassFinished={refreshTree}
      />

      {/* P26 — ONE TABLE. The tree above is legitimately a TREE; these two
          keyword lists are TABLES, and they are the canonical one. */}
      <ProposedQueue
        siteId={siteId}
        siteDomain={site.domain}
        brandId={brandId}
        onChanged={refreshTree}
      />

      <UnplacedQueue
        siteId={siteId}
        siteDomain={site.domain}
        brandId={brandId}
        onChanged={refreshTree}
      />

      {editDraft ? (
        <TopicEditDialog
          draft={editDraft}
          busy={upsertTopic.isPending}
          onCancel={() => setEditDraft(null)}
          onSave={(values) =>
            upsertTopic.mutate({
              topicId: editDraft.topicId,
              name: values.name,
              nodeType: values.nodeType,
              description: values.description,
              parentId: editDraft.parentId,
            })
          }
        />
      ) : null}

      {worthNode ? (
        <TopicWorthDialog
          node={worthNode}
          busy={saveWorth.isPending}
          onCancel={() => setWorthNode(null)}
          onSave={(values) =>
            saveWorth.mutate({ topicId: worthNode.topic.id, ...values })
          }
          onClear={() =>
            saveWorth.mutate({
              topicId: worthNode.topic.id,
              weight: null,
              leadQuality: null,
              offeringMatch: null,
              notes: "",
              clear: true,
            })
          }
        />
      ) : null}

      {deleteNode && !picker ? (
        <TopicDeleteDialog
          topicName={deleteNode.topic.name}
          impact={deleteImpact.data ?? null}
          loading={deleteImpact.isPending}
          error={
            deleteImpact.error ? extractErrorMessage(deleteImpact.error) : null
          }
          mode={deleteMode}
          replacementName={replacementNode?.topic.name ?? null}
          busy={removeTopic.isPending}
          onModeChange={setDeleteMode}
          onChooseReplacement={openReplacementPicker}
          onRetry={() => void deleteImpact.refetch()}
          onCancel={() => {
            setDeleteNode(null);
            setReplacementNode(null);
          }}
          onDelete={() =>
            removeTopic.mutate({
              topicId: deleteNode.topic.id,
              replacementTopicId:
                deleteMode === "reassign"
                  ? (replacementNode?.topic.id ?? null)
                  : null,
            })
          }
        />
      ) : null}

      {picker ? (
        <TopicPickerDialog
          request={picker}
          tree={tree}
          busy={pinParent.isPending || placeKeywords.isPending}
          onCancel={() => setPicker(null)}
        />
      ) : null}
    </div>
  );
}
