"use client";

/**
 * features/marketing/seo/topical-map/ui/topicMenuSection.tsx — THE right-click
 * section for a map topic (CONTRACTS §4.3; `features/context-menu-v3/SECTIONS.md`
 * listed "SEO topic" as a registered-but-inline candidate — this is its
 * extraction).
 *
 * `build*`, not `use*`, by the naming law: it calls no hook, so it may be
 * invoked anywhere, including inside a row's render or a memoised column.
 *
 * NOTHING IS DISPATCHED HERE. Every verb arrives as a callback from the host
 * that owns the write, so the same section drives the outline, the table, the
 * graph and the topic panel without any of them growing a private copy.
 *
 * THE CONSISTENCY STEP. An action the host cannot perform stays VISIBLE and
 * disabled with the reason, never absent — the menu has the same shape on
 * every surface and only availability changes. That is why an omitted callback
 * produces a disabled row rather than a missing one.
 */

import {
  BrainCircuit,
  Copy,
  CornerUpRight,
  ExternalLink,
  PanelRight,
  Pencil,
  CircleSlash,
} from "lucide-react";

import type {
  ContextMenuExtraSection,
  ContextMenuExtraItem,
} from "@/features/context-menu-v3/types";
import { needs, withAvailability } from "@/features/context-menu-v3/utils/availability";

/**
 * The subset of `MapLinks` (CONTRACTS §2) this section needs.
 *
 * Structural on purpose: `links.tsx` is coordinator-owned and lands in its own
 * change, and a `MapLinks` value satisfies this by shape. Declaring the shape
 * here rather than importing it keeps this file from depending on a module
 * that does not exist yet, and costs nothing once it does.
 */
export interface TopicMenuLinks {
  /** The brand route for a topic, `?topic=<slug>`. */
  topic: (mapId: string, slug: string) => string;
}

/** Every verb the section offers. An omitted one renders disabled, with a reason. */
export interface TopicMenuActions {
  /** Open the topic panel in place (never a link to a mandate/topic route). */
  onOpenPanel?: () => void;
  /** Open the topic in its own window panel. */
  onOpenWindow?: () => void;
  onCopySlug?: () => void;
  onRename?: () => void;
  /** Start the move/reparent flow. */
  onMove?: () => void;
  onRetire?: () => void;
  onReject?: () => void;
  /** Hand the topic to the topic agent (mandate opens in place). */
  onAskAgent?: () => void;
}

export interface BuildTopicMenuSectionArgs {
  mapId: string;
  slug: string;
  links: TopicMenuLinks;
  actions: TopicMenuActions;
  /** The topic's name, for the section heading. Falls back to the slug. */
  label?: string;
}

const NOOP = () => undefined;

export function buildTopicMenuSection({
  mapId,
  slug,
  links,
  actions,
  label,
}: BuildTopicMenuSectionArgs): ContextMenuExtraSection {
  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "topic-open-panel",
      label: "Open topic panel",
      icon: PanelRight,
      onSelect: actions.onOpenPanel ?? NOOP,
    },
    {
      kind: "item",
      id: "topic-open-window",
      label: "Open in a window",
      icon: ExternalLink,
      onSelect: actions.onOpenWindow ?? NOOP,
    },
    {
      // A real anchor, so middle-click and cmd-click open a tab the way every
      // other link in the app does.
      kind: "link",
      id: "topic-open-tab",
      label: "Open in a new tab",
      icon: ExternalLink,
      href: links.topic(mapId, slug),
      target: "_blank",
    },
    { kind: "separator", id: "topic-sep-1" },
    {
      kind: "item",
      id: "topic-copy-slug",
      label: "Copy slug",
      icon: Copy,
      hint: slug,
      onSelect: actions.onCopySlug ?? NOOP,
    },
    {
      kind: "item",
      id: "topic-rename",
      label: "Rename",
      icon: Pencil,
      onSelect: actions.onRename ?? NOOP,
    },
    {
      kind: "item",
      id: "topic-move",
      label: "Move to another parent",
      icon: CornerUpRight,
      onSelect: actions.onMove ?? NOOP,
    },
    { kind: "separator", id: "topic-sep-2" },
    {
      kind: "item",
      id: "topic-retire",
      label: "Retire topic",
      icon: CircleSlash,
      destructive: true,
      onSelect: actions.onRetire ?? NOOP,
    },
    {
      kind: "item",
      id: "topic-reject",
      label: "Reject topic",
      icon: CircleSlash,
      destructive: true,
      onSelect: actions.onReject ?? NOOP,
    },
    { kind: "separator", id: "topic-sep-3" },
    {
      kind: "item",
      id: "topic-ask-agent",
      label: "Ask the topic agent",
      icon: BrainCircuit,
      onSelect: actions.onAskAgent ?? NOOP,
    },
  ];

  return withAvailability(
    {
      id: "seo-map-topic",
      label: label ?? slug,
      // The thing the user right-clicked, so every layout renders it first and
      // inline rather than folding it into a submenu.
      primary: true,
      items,
    },
    {
      "topic-open-panel": !actions.onOpenPanel && needs("a surface that hosts the topic panel"),
      "topic-open-window": !actions.onOpenWindow && needs("a surface that can open windows"),
      "topic-copy-slug": !actions.onCopySlug && needs("a clipboard door"),
      "topic-rename": !actions.onRename && needs("edit access to this map"),
      "topic-move": !actions.onMove && needs("edit access to this map"),
      "topic-retire": !actions.onRetire && needs("edit access to this map"),
      "topic-reject": !actions.onReject && needs("edit access to this map"),
      "topic-ask-agent": !actions.onAskAgent && needs("a surface that can run the topic agent"),
    },
  );
}
