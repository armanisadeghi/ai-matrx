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
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  CircleDollarSign,
  GitBranchPlus,
  ListTree,
  PanelTop,
  Pencil,
  Pin,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchInput } from "@/components/official/SearchInput";
import { cn } from "@/styles/themes/utils";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
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
  filterTopicTreeScope,
  flattenTree,
  forbiddenParents,
  lineageOf,
  scopeToSite,
  tallyByTopic,
  type TopicTreeNode,
  type TopicTreeSort,
  type TopicTreeSortKey,
} from "./lib";
import { OfferingSplitHeadline } from "./OfferingSplitHeadline";
import { ProposedQueue } from "./ProposedQueue";
import { TopicPlacementStrip } from "./TopicPlacementStrip";
import { TopicTreeRow, type TopicRowActions } from "./TopicTreeRow";
import { TopicEditDialog, type TopicEditDraft } from "./TopicEditDialog";
import { TopicWorthDialog } from "./TopicWorthDialog";
import {
  TopicPickerDialog,
  type TopicPickerRequest,
} from "./TopicPickerDialog";
import { TopicDeleteDialog, type TopicDeleteMode } from "./TopicDeleteDialog";
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
  const [showWholeCatalog, setShowWholeCatalog] = useState(false);
  const [editDraft, setEditDraft] = useState<TopicEditDraft | null>(null);
  const [worthNode, setWorthNode] = useState<TopicTreeNode | null>(null);
  const [picker, setPicker] = useState<TopicPickerRequest | null>(null);
  const [search, setSearch] = useState("");
  const [keywordFilter, setKeywordFilter] = useState<
    "all" | "with-keywords" | "without-keywords"
  >("all");
  const [sort, setSort] = useState<TopicTreeSort>({
    key: "keywords",
    direction: "desc",
  });
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
      if (!topicId) throw new Error("Choose a topic to delete.");
      return getTopicDeleteImpact(siteId, topicId);
    },
    enabled: Boolean(deleteNode),
  });
  const refreshTree = () => {
    void queryClient.invalidateQueries({ queryKey: ["seo", "topics"] });
  };

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
      refreshTree();
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
      refreshTree();
      toast.success("Topic saved");
    },
    onError: failed("save that topic"),
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
      refreshTree();
      toast.success(variables.clear ? "Ruling removed" : "Worth saved", {
        description: variables.clear
          ? "This topic falls back to its nearest ruled ancestor."
          : "It flows down to every topic beneath it.",
      });
    },
    onError: failed("save that worth"),
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
      refreshTree();
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
      refreshTree();
      void queryClient.invalidateQueries({ queryKey: ["marketing", "gsc"] });
      toast.success(`“${result.topic_name}” deleted`, {
        description:
          result.keyword_links_reassigned > 0
            ? `${formatCount(result.keyword_links_reassigned)} keyword associations were reassigned.`
            : `${formatCount(result.keyword_links_removed)} keyword associations were removed.`,
      });
    },
    onError: failed("delete that topic"),
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
  const baseScope = showWholeCatalog ? null : scopeToSite(tree);
  const scope = filterTopicTreeScope(tree, baseScope, search, keywordFilter);
  const rows = flattenTree(tree.roots, { collapsed, scope, sort });
  const metas = buildBandMeta(vocab.data ?? []);
  const selected = selectedId ? (tree.byId.get(selectedId) ?? null) : null;

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
      // A node outside the site's own slice is invisible until the whole
      // catalog is shown — a link that resolves to nothing is the dead end.
      if (!scopeToSite(tree)?.has(focusTopicId)) setShowWholeCatalog(true);
      setSelectedId(focusTopicId);
      if (focusWorth) setWorthNode(node);
      // Let the expansion paint before scrolling to the row.
      scrollFrame = requestAnimationFrame(() => {
        document
          .getElementById(`topic-node-${focusTopicId}`)
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
      title: `Pin a parent for “${node.topic.name}”`,
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
        "The keyword takes its worth from this topic, or from the nearest parent above it that has one.",
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
        "Every keyword association will move to the topic you choose. Site-specific worth and starter-pack judgments will still be removed.",
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

  const topicActions: TopicRowActions = {
    onPinParent: openParentPicker,
    onMakeRoot: (target) =>
      pinParent.mutate({ topicId: target.topic.id, parentId: null }),
    onSetWorth: (target) => setWorthNode(target),
    onEdit: openEdit,
    onAddChild: openAddChild,
    onViewKeywords: openTopicKeywords,
    onDelete: openDelete,
  };

  const runContextAction = (action: keyof TopicRowActions) => {
    const node = contextNodeRef.current;
    if (node) topicActions[action](node);
  };

  const changeSort = (key: TopicTreeSortKey) =>
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-textured p-3">
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

      <section className="flex shrink-0 flex-col rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <ListTree className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Topic tree</h2>
          <Link
            href={`/marketing/brands/${brandId}/sites/${siteId}/value`}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Value workbench
          </Link>
          <Link
            href={`/marketing/brands/${brandId}/sites/${siteId}/value/rules`}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Rules &amp; places
          </Link>
          <p className="hidden text-[11px] text-muted-foreground sm:block">
            Topics are shared across every site. What each one is worth is yours
            alone.
          </p>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setShowWholeCatalog((value) => !value)}
            >
              {showWholeCatalog
                ? "Only this site's branches"
                : `All ${topics.data?.length ?? 0} topics`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() =>
                setEditDraft({
                  topicId: null,
                  name: "",
                  nodeType: "service",
                  description: "",
                  parentId: null,
                  parentName: null,
                })
              }
            >
              <Plus className="mr-1 h-3 w-3" />
              New topic
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-b border-border px-3 py-2 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Filter topics…"
            aria-label="Filter the topic tree"
            className="w-full sm:max-w-sm"
            inputClassName="text-base sm:text-sm"
          />
          <Select
            value={keywordFilter}
            onValueChange={(value) =>
              setKeywordFilter(
                value === "with-keywords" || value === "without-keywords"
                  ? value
                  : "all",
              )
            }
          >
            <SelectTrigger className="w-full text-base sm:w-44 sm:text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All topics</SelectItem>
              <SelectItem value="with-keywords">Has keywords</SelectItem>
              <SelectItem value="without-keywords">No keywords</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground sm:ml-auto">
            Column sorting preserves the tree and reorders siblings only.
          </p>
        </div>

        {loadingTree ? (
          <TableLoadingComponent />
        ) : treeError ? (
          <InlineQueryError
            what="the topic tree"
            error={treeError}
            onRetry={() => {
              void topics.refetch();
              void worth.refetch();
              void stats.refetch();
            }}
          />
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {search || keywordFilter !== "all"
              ? "No topic matches these filters."
              : "No topic touches this site yet. Create one, then place keywords under it from the queue below."}
          </div>
        ) : (
          <NonEditableContextMenu
            sourceFeature="marketing"
            menuVersion={1}
            contextData={{ content: "" }}
            resolveContextOnOpen={(target) => {
              const topicId = target
                ?.closest("[data-topic-id]")
                ?.getAttribute("data-topic-id");
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
                label: "Topic",
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
                    label: "Pin a parent…",
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
                    label: "Add a topic under this…",
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
                    label: "Rename or change its type…",
                    icon: Pencil,
                    onSelect: () => runContextAction("onEdit"),
                  },
                  { kind: "separator", id: "topic-actions-separator-2" },
                  {
                    kind: "item",
                    id: "topic-delete",
                    label: "Delete topic…",
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => runContextAction("onDelete"),
                  },
                ],
              },
            ]}
          >
            <div className="max-h-[55vh] overflow-auto">
              <div className="sticky top-0 z-10 grid min-w-[900px] grid-cols-[minmax(24rem,1fr)_minmax(14rem,18rem)_7rem_7rem_8rem_2.75rem] items-center border-b border-border bg-muted/90 px-2 py-1.5 text-[11px] font-medium text-muted-foreground backdrop-blur">
                <SortHeader
                  label="Topic"
                  sortKey="name"
                  sort={sort}
                  onSort={changeSort}
                />
                <SortHeader
                  label="Worth"
                  sortKey="worth"
                  sort={sort}
                  onSort={changeSort}
                />
                <SortHeader
                  label="Keywords"
                  sortKey="keywords"
                  sort={sort}
                  onSort={changeSort}
                  align="right"
                />
                <SortHeader
                  label="Clicks"
                  sortKey="clicks"
                  sort={sort}
                  onSort={changeSort}
                  align="right"
                />
                <SortHeader
                  label="Impressions"
                  sortKey="impressions"
                  sort={sort}
                  onSort={changeSort}
                  align="right"
                />
                <span className="sr-only">Actions</span>
              </div>
              {rows.map((node) => (
                <div key={node.topic.id} id={`topic-node-${node.topic.id}`}>
                  <TopicTreeRow
                    node={node}
                    metas={metas}
                    selected={node.topic.id === selectedId}
                    collapsed={collapsed.has(node.topic.id)}
                    onToggle={() => toggleNode(node.topic.id)}
                    onSelect={() =>
                      setSelectedId(
                        node.topic.id === selectedId ? null : node.topic.id,
                      )
                    }
                    busy={busy}
                    actions={topicActions}
                  />
                </div>
              ))}
            </div>
          </NonEditableContextMenu>
        )}

        {selected ? (
          <SelectedTopicFooter
            node={selected}
            lineage={lineageOf(tree, selected.topic.id)
              .map((entry) => entry.name)
              .join(" › ")}
          />
        ) : null}

        {tree.orphanedParents.length > 0 ? (
          <p className="border-t border-border px-3 py-1.5 text-[11px] text-warning">
            {tree.orphanedParents.length} topic
            {tree.orphanedParents.length === 1 ? "" : "s"} point at a parent
            this account cannot see; they are drawn as roots so nothing is
            hidden.
          </p>
        ) : null}
      </section>

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

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: TopicTreeSortKey;
  sort: TopicTreeSort;
  onSort: (key: TopicTreeSortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex items-center gap-1 rounded px-1 py-1 hover:bg-muted hover:text-foreground",
        align === "right" && "justify-self-end",
        active && "text-foreground",
      )}
      aria-label={`Sort by ${label}`}
    >
      {label}
      {active ? (
        sort.direction === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : null}
    </button>
  );
}

/** The selected node's lineage and payoff, stated once in full sentences. */
function SelectedTopicFooter({
  node,
  lineage,
}: {
  node: TopicTreeNode;
  lineage: string;
}) {
  const bands = Object.entries(node.subtree.bands).sort((a, b) => b[1] - a[1]);
  return (
    <div className="border-t border-border bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
      <p className="truncate text-foreground">{lineage}</p>
      <p>
        {node.subtree.keywords > 0 ? (
          <>
            {node.subtree.keywords} of this site&apos;s keywords resolve through
            this branch
            {bands.length > 0
              ? ` — ${bands.map(([band, count]) => `${count} ${band}`).join(", ")}`
              : ""}
            .
          </>
        ) : (
          <>No keyword resolves through this branch yet.</>
        )}{" "}
        {node.ownWorth
          ? `Its worth here is your own ruling: ${node.effectiveWeight}.`
          : node.inheritedFrom
            ? `It has no ruling of its own, so it inherits ${node.effectiveWeight} from “${node.inheritedFrom.name}”.`
            : "Nothing above it carries a ruling, so the resolver uses its neutral default."}
        {node.negativeGuard ? " Keywords under this never count as wins." : ""}
      </p>
      {node.ownWorth?.notes ? (
        <p className={cn("mt-0.5 italic text-foreground")}>
          “{node.ownWorth.notes}”
        </p>
      ) : null}
    </div>
  );
}
