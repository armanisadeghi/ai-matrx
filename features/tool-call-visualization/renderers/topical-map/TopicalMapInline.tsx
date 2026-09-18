"use client";

/**
 * TopicalMapInline — THE ONE in-code renderer for the `topical_map` agent tool
 * (R12: the result must reuse the compiled `TopicTree`, which a runtime
 * `tool_ui` row cannot import; `topical_map_result` stays inactive).
 *
 * Step 0 (create-tool-renderer): the data is KNOWN + PRETTY — every action's
 * result is the seo RPC's own typed JSON — so this is a `ToolResultCard`
 * registered with `chrome: "card"`.
 *
 *   outline        → the text an agent reads, verbatim, in a scrolling sheet
 *   tree / get     → `TopicTree` over the flattened `map_tree` nodes (counts
 *                    only when the read included them — absent is not zero)
 *   everything else→ the payload through `ResultValue` (HIDE NOTHING)
 *
 * Every action with a map behind it gets the two doors in the Open menu —
 * "Open map in canvas" and "Open map as window" — and a `note` from the
 * change-mode gate ("this write was rehearsed, not applied") is printed at the
 * top of the body because a screen that swallowed it would be lying about
 * what happened to the map.
 */

import { useState } from "react";
import { ExternalLink, ListTree, PanelRightOpen } from "lucide-react";
import { formatCount } from "@ai-matrx/kit/format";

import { TopicTree } from "@/components/official/topic-tree/TopicTree";
import { useOpenTopicalMapCanvas } from "@/features/marketing/seo/topical-map/canvas/useOpenTopicalMapCanvas";
import {
  expandableSlugs,
  flattenTreeNodes,
  topicTreeRows,
  type FlatTopic,
} from "@/features/marketing/seo/topical-map/proposals/topicRows";
import { TopicStatusMark } from "@/features/marketing/seo/topical-map/ui/TopicStatusMark";
import { useOpenTopicalMapWindow } from "@/features/overlays/openers/topicalMapWindow";

import type { ToolRendererProps } from "../../types";
import { ResultValue } from "../../result-fields/ResultValue";
import { ToolErrorCard } from "../../result-fields/ToolErrorCard";
import { isTerminal } from "../_shared";
import { ToolResultCard } from "../_shared-entity/ToolResultCard";
import {
  TOPICAL_MAP_ACTION_LABELS,
  humanizeAction,
  readTopicalMapResult,
  type TopicalMapToolResult,
} from "./topicalMapResult";

const ICON_TINT = "text-emerald-600 dark:text-emerald-400";

export const TopicalMapInline: React.FC<ToolRendererProps> = (props) => {
  const { entry, onOpenOverlay, onOpenWindowPanel, toolGroupId, expanded, onToggleExpanded } =
    props;
  const openCanvas = useOpenTopicalMapCanvas();
  const openWindow = useOpenTopicalMapWindow();

  if (entry.status === "error") {
    return <ToolErrorCard entry={entry} onOpenOverlay={onOpenOverlay} toolGroupId={toolGroupId} />;
  }
  if (!isTerminal(entry)) return null;

  const read = readTopicalMapResult(entry);
  const action = read?.action ?? null;
  const labels = action ? TOPICAL_MAP_ACTION_LABELS[action] : undefined;
  const title = labels?.complete ?? humanizeAction(action);

  const menuItems = read?.mapId
    ? [
        {
          label: "Open map in canvas",
          icon: PanelRightOpen,
          onClick: () => openCanvas({ mapId: read.mapId as string, screen: "outline" }),
        },
        {
          label: "Open map as window",
          icon: ExternalLink,
          onClick: () => openWindow({ mapId: read.mapId as string, screen: "outline" }),
        },
      ]
    : undefined;

  return (
    <ToolResultCard
      icon={ListTree}
      iconClassName={ICON_TINT}
      title={title}
      sub={subtitleFor(read)}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      menuItems={menuItems}
      onOpenWindowPanel={onOpenWindowPanel ? () => onOpenWindowPanel() : undefined}
      onOpenOverlay={onOpenOverlay ? () => onOpenOverlay() : undefined}
    >
      {read ? <TopicalMapResultBody read={read} /> : null}
    </ToolResultCard>
  );
};

function subtitleFor(read: TopicalMapToolResult | null): string | null {
  if (!read) return null;
  if (read.tree) {
    const count = flattenTreeNodes(read.tree).length;
    return `${count} topic${count === 1 ? "" : "s"}${read.capped ? " · cut to fit the output budget" : ""}`;
  }
  if (read.outline) return `${formatCount(read.outline.length)} characters`;
  return null;
}

function TopicalMapResultBody({ read }: { read: TopicalMapToolResult }) {
  return (
    <div className="flex flex-col gap-2 border border-t-0 border-border/50 bg-card px-3 py-2.5 rounded-b-xl">
      {read.note ? (
        <p
          role="status"
          className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-foreground"
        >
          {read.note}
        </p>
      ) : null}
      {read.tree ? (
        <TreeBody topics={flattenTreeNodes(read.tree)} />
      ) : read.outline !== null ? (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2.5 font-mono text-xs text-foreground">
          {read.outline}
        </pre>
      ) : null}
      {Object.keys(read.rest).length > 0 ? (
        <ResultValue value={read.rest} density="inline" />
      ) : null}
    </div>
  );
}

/** A store-free tree: expansion and selection live here (a chat message is not a workspace). */
function TreeBody({ topics }: { topics: FlatTopic[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => expandableSlugs(topics));
  const [selected, setSelected] = useState<string | null>(null);
  const rows = topicTreeRows(topics, { expanded, selected }, (topic) => ({
    trailing: topic.status ? <TopicStatusMark status={topic.status} compact /> : undefined,
  }));
  if (topics.length === 0) {
    return <p className="text-xs text-muted-foreground">This map has no topics yet.</p>;
  }
  return (
    <TopicTree
      rows={rows}
      ariaLabel="Map topics"
      density="compact"
      className="max-h-96 rounded-md border border-border"
      onToggleExpand={(id) =>
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })
      }
      onSelect={(id) => setSelected(id)}
    />
  );
}

export default TopicalMapInline;
