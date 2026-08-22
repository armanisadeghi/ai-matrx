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

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListTree, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/styles/themes/utils";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { TableLoadingComponent } from "@/components/matrx/LoadingComponents";
import { getValueVocabulary } from "../data";
import { buildBandMeta, reviewWindow } from "../variants/c/lib";
import {
  getOfferingSplit,
  getTopicStats,
  getUnassignedKeywords,
  listAllTopics,
  listTopicWorth,
  saveTopic,
  setKeywordPrimaryTopic,
  setTopicParent,
  setTopicWorth,
} from "./data";
import {
  buildTopicTree,
  flattenTree,
  forbiddenParents,
  lineageOf,
  scopeToSite,
  tallyByTopic,
  type TopicTreeNode,
} from "./lib";
import { OfferingSplitHeadline } from "./OfferingSplitHeadline";
import { TopicTreeRow } from "./TopicTreeRow";
import { TopicEditDialog, type TopicEditDraft } from "./TopicEditDialog";
import { TopicWorthDialog } from "./TopicWorthDialog";
import { TopicPickerDialog, type TopicPickerRequest } from "./TopicPickerDialog";
import { UnplacedQueue } from "./UnplacedQueue";

const PAGE_SIZE = 50;

export function TopicTreeWorkbench() {
  const params = useParams<{ brandId: string; siteId: string }>();
  const siteId = params.siteId;
  const brandId = params.brandId;
  const queryClient = useQueryClient();
  const window28 = reviewWindow();
  const windowLabel = `${window28.start} → ${window28.end}`;

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showWholeCatalog, setShowWholeCatalog] = useState(false);
  const [editDraft, setEditDraft] = useState<TopicEditDraft | null>(null);
  const [worthNode, setWorthNode] = useState<TopicTreeNode | null>(null);
  const [picker, setPicker] = useState<TopicPickerRequest | null>(null);
  const [queueSearch, setQueueSearch] = useState("");
  const [queuePage, setQueuePage] = useState(0);

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
  const queue = useQuery({
    queryKey: [
      "seo",
      "topics",
      "unplaced",
      siteId,
      window28.start,
      window28.end,
      queueSearch,
      queuePage,
    ],
    queryFn: ({ signal }) =>
      getUnassignedKeywords(
        siteId,
        window28.start,
        window28.end,
        { search: queueSearch || null, limit: PAGE_SIZE, offset: queuePage * PAGE_SIZE },
        signal,
      ),
    placeholderData: keepPreviousData,
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
        description: "Every keyword below it re-resolves against the new branch.",
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
      serviceMatch: string | null;
      notes: string;
      clear?: boolean;
    }) =>
      setTopicWorth(siteId, input.topicId, {
        weight: input.weight,
        leadQuality: input.leadQuality,
        serviceMatch: input.serviceMatch,
        notes: input.notes,
        clear: input.clear,
      }),
    onSuccess: (_data, variables) => {
      setWorthNode(null);
      refreshTree();
      toast.success(
        variables.clear ? "Ruling removed" : "Worth saved",
        {
          description: variables.clear
            ? "This topic falls back to its nearest ruled ancestor."
            : "It flows down to every topic beneath it.",
        },
      );
    },
    onError: failed("save that worth"),
  });

  const placeKeywords = useMutation({
    mutationFn: (input: { keywordIds: string[]; topicId: string | null }) =>
      setKeywordPrimaryTopic(siteId, input.keywordIds, input.topicId),
    onSuccess: (results) => {
      setPicker(null);
      refreshTree();
      const bands = new Map<string, number>();
      for (const row of results)
        bands.set(row.value_band, (bands.get(row.value_band) ?? 0) + 1);
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

  const busy =
    pinParent.isPending ||
    upsertTopic.isPending ||
    saveWorth.isPending ||
    placeKeywords.isPending;

  // ── Derived ───────────────────────────────────────────────────────────────
  const loadingTree = topics.isPending || worth.isPending || stats.isPending;
  const treeError = topics.error ?? worth.error ?? stats.error;
  const tree = buildTopicTree(
    topics.data ?? [],
    worth.data ?? [],
    tallyByTopic(stats.data ?? []),
  );
  const scope = showWholeCatalog ? null : scopeToSite(tree);
  const rows = flattenTree(tree.roots, { collapsed, scope });
  const metas = buildBandMeta(vocab.data ?? []);
  const selected = selectedId ? (tree.byId.get(selectedId) ?? null) : null;

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
      onChoose: (topicId) => placeKeywords.mutate({ keywordIds, topicId }),
    });

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
        <OfferingSplitHeadline rows={split.data ?? []} windowLabel={windowLabel} />
      )}

      <section className="flex shrink-0 flex-col rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <ListTree className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Topic tree</h2>
          <Link
            href={`/marketing/brands/${brandId}/sites/${siteId}/value/c`}
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
            No topic touches this site yet. Create one, then place keywords under
            it from the queue below.
          </div>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto">
            {rows.map((node) => (
              <TopicTreeRow
                key={node.topic.id}
                node={node}
                metas={metas}
                selected={node.topic.id === selectedId}
                collapsed={collapsed.has(node.topic.id)}
                onToggle={() => toggleNode(node.topic.id)}
                onSelect={() =>
                  setSelectedId(node.topic.id === selectedId ? null : node.topic.id)
                }
                busy={busy}
                actions={{
                  onPinParent: openParentPicker,
                  onMakeRoot: (target) =>
                    pinParent.mutate({ topicId: target.topic.id, parentId: null }),
                  onSetWorth: (target) => setWorthNode(target),
                  onEdit: (target) =>
                    setEditDraft({
                      topicId: target.topic.id,
                      name: target.topic.name,
                      nodeType: target.topic.node_type,
                      description: target.topic.description ?? "",
                      parentId: null,
                      parentName: null,
                    }),
                  onAddChild: (target) =>
                    setEditDraft({
                      topicId: null,
                      name: "",
                      nodeType: target.topic.node_type,
                      description: "",
                      parentId: target.topic.id,
                      parentName: target.topic.name,
                    }),
                }}
              />
            ))}
          </div>
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
            {tree.orphanedParents.length === 1 ? "" : "s"} point at a parent this
            account cannot see; they are drawn as roots so nothing is hidden.
          </p>
        ) : null}
      </section>

      <UnplacedQueue
        rows={queue.data?.rows ?? []}
        total={queue.data?.total ?? 0}
        metas={metas}
        loading={queue.isPending}
        page={queuePage}
        pageSize={PAGE_SIZE}
        search={queueSearch}
        onSearch={(next) => {
          setQueueSearch(next);
          setQueuePage(0);
        }}
        onPage={setQueuePage}
        onPlace={openKeywordPicker}
        onAgentFinished={refreshTree}
        busy={busy}
        siteName={siteId}
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
              serviceMatch: null,
              notes: "",
              clear: true,
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
        {node.negativeGuard
          ? " Keywords under this never count as wins."
          : ""}
      </p>
      {node.ownWorth?.notes ? (
        <p className={cn("mt-0.5 italic text-foreground")}>
          “{node.ownWorth.notes}”
        </p>
      ) : null}
    </div>
  );
}
