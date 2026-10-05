"use client";

/**
 * ContextItemViewer — the ONE interactive detail view for every attached
 * context item, the body of a chip host's `context-items` canvas tab
 * (`./contextItemsTab.ts`). The pane header is the chrome: it carries the
 * item's title and the close, so this view never draws a second title bar.
 *
 *   ┌─ toolbar (only when there is something) ─ title pill · actions · ‹ 2/3 › ┐
 *   │  BODY — fills 100% of the remaining height                                │
 *   ├─ footer (only if there's something to show) ─ inline meta + icon buttons ┤
 *   └──────────────────────────────────────────────────────────────────────────┘
 *
 * No description line, no in-body headers, no large buttons — every action is
 * an icon with a tooltip. Bodies report the resolved record's title via
 * `setTitle`, which becomes the tab's title. Never branch on type here: the
 * registry resolves Body / Footer / Title / TitleActions.
 */

import { createElement, useState } from "react";
import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import { useAppDispatch } from "../../../store/hooks";
import { addResource } from "../../redux/execution-system/instance-resources/instance-resources.slice";
import { toast } from "../../../host/notify";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ai-matrx/design-system";
import {
  resolveContextItemBody,
  resolveContextItemFooter,
  resolveContextItemTitle,
  resolveContextItemTitleActions,
} from "./registry";
import { buildReattachSpec, canReattach } from "./recontext";
import type { ContextDrawerItem } from "./types";
import { Button } from "@ai-matrx/design-system/controls";

interface ContextItemViewerProps {
  items: readonly ContextDrawerItem[];
  index: number;
  /** Show another item of the list (prev / next / a sibling switcher). */
  onIndexChange: (index: number) => void;
  /** The shown record's resolved title (a body reports it once it loads). */
  onTitleChange?: (title: string) => void;
}

const navButton =
  "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground";

export function ContextItemViewer({ items, index, onIndexChange, onTitleChange }: ContextItemViewerProps) {
  const dispatch = useAppDispatch();
  const [searchSubmissionState, setSearchSubmissionState] = useState<{
    itemId: string;
    query: string;
    nonce: number;
  } | null>(null);
  const [bodyTitleState, setBodyTitleState] = useState<{ itemId: string; title: string } | null>(null);

  const activeItem = items[index] ?? null;
  if (!activeItem) return null;

  const count = items.length;
  const multi = count > 1;
  const Body = resolveContextItemBody(activeItem.blockType);
  const Footer = resolveContextItemFooter(activeItem.blockType);
  const Title = resolveContextItemTitle(activeItem.blockType);
  const TitleActions = resolveContextItemTitleActions(activeItem.blockType);
  const showReattach = canReattach(activeItem);
  const title = bodyTitleState?.itemId === activeItem.id ? bodyTitleState.title : activeItem.title;
  const searchSubmission =
    searchSubmissionState?.itemId === activeItem.id
      ? { query: searchSubmissionState.query, nonce: searchSubmissionState.nonce }
      : null;

  const goTo = (next: number) => onIndexChange(((next % count) + count) % count);
  const handleSelectItem = (id: string) => {
    const i = items.findIndex((it) => it.id === id);
    if (i >= 0) onIndexChange(i);
  };
  const handleSearchSubmit = (query: string) => {
    setSearchSubmissionState((current) => ({
      itemId: activeItem.id,
      query,
      nonce: current?.itemId === activeItem.id ? current.nonce + 1 : 1,
    }));
  };
  const handleBodyTitle = (nextTitle: string) => {
    setBodyTitleState({ itemId: activeItem.id, title: nextTitle });
    onTitleChange?.(nextTitle);
  };
  const handleReattach = () => {
    const spec = buildReattachSpec(activeItem);
    if (!spec) return;
    dispatch(
      addResource({
        conversationId: activeItem.conversationId,
        blockType: spec.blockType,
        source: spec.source,
        options: { editable: true },
      }),
    );
    toast.success("Updated version attached — sent on your next turn.");
  };

  const hasToolbar = multi || Boolean(Title) || Boolean(TitleActions);
  const hasFooter = Boolean(Footer) || showReattach;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background" data-context-item-viewer="">
      {hasToolbar && (
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {Title &&
              createElement(Title, {
                item: activeItem,
                title,
                items: [...items],
                onSelectItem: handleSelectItem,
                onSearchSubmit: handleSearchSubmit,
              })}
            {TitleActions && createElement(TitleActions, { item: activeItem })}
          </div>
          {multi && (
            <div className="flex shrink-0 items-center gap-0.5">
              <span className="mr-1 tabular-nums text-[11px] text-muted-foreground">
                {index + 1}/{count}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={() => goTo(index - 1)} aria-label="Previous" className={navButton}>
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Previous</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={() => goTo(index + 1)} aria-label="Next" className={navButton}>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Next</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {createElement(Body, {
          key: activeItem.id,
          item: activeItem,
          setTitle: handleBodyTitle,
          searchSubmission,
        })}
      </div>

      {hasFooter && (
        <div className="flex h-9 shrink-0 items-center gap-2 border-t border-border bg-card px-3">
          {Footer && createElement(Footer, { item: activeItem })}
          {showReattach && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="quiet" tone="primary" icon={<Send />} onClick={handleReattach} aria-label="Send updated version" className="ml-auto" />
              </TooltipTrigger>
              <TooltipContent>Send updated version to the agent</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}
