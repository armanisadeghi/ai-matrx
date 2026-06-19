"use client";

/**
 * ContextItemDrawer — the ONE shared, interactive detail panel for every
 * attached context item. Layout contract (deliberately strict so the panel
 * stays hyper-focused, ~all usable space):
 *
 *   ┌─ title bar (MatrxDynamicPanelHost) ─ icon + title + prev/next + close ─┐
 *   │  BODY — fills 100% of the remaining height                            │
 *   ├─ footer (only if there's something to show) ─ inline meta + icon btns ┤
 *   └───────────────────────────────────────────────────────────────────────┘
 *
 * No description line, no in-body headers, no large buttons — every action is
 * an icon with a tooltip. The title reflects the resolved record (bodies report
 * it via `setTitle`). Bodies own the body; their links/lists/meta live in the
 * registry `Footer`.
 */

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { useAppDispatch } from "@/lib/redux/hooks";
import { addResource } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import { toast } from "@/lib/toast-service";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { resolveContextItemBody, resolveContextItemFooter } from "./registry";
import { buildReattachSpec, canReattach } from "./recontext";
import type { ContextItemDrawerController } from "./useContextItemDrawer";

interface ContextItemDrawerProps {
  controller: ContextItemDrawerController;
}

export function ContextItemDrawer({ controller }: ContextItemDrawerProps) {
  const { open, items, index, activeItem, setOpen, next, prev } = controller;
  const dispatch = useAppDispatch();

  // Body-reported title override, reset whenever the active item changes.
  const [bodyTitle, setBodyTitle] = useState<string | null>(null);
  useEffect(() => {
    setBodyTitle(null);
  }, [activeItem?.id]);

  if (!activeItem) return null;

  const Body = resolveContextItemBody(activeItem.blockType);
  const Footer = resolveContextItemFooter(activeItem.blockType);
  const Icon = activeItem.icon;
  const multi = items.length > 1;
  const showReattach = canReattach(activeItem);
  const title = bodyTitle ?? activeItem.title;

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

  const hasFooter = Boolean(Footer) || showReattach;

  return (
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={setOpen}
      position="right"
      defaultSize={40}
      expandButtonLabel={activeItem.typeLabel}
      title={
        <span className="inline-flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{title}</span>
        </span>
      }
      headerActions={
        multi ? (
          <div className="flex items-center gap-0.5">
            <span className="mr-1 tabular-nums text-[11px] text-muted-foreground">
              {index + 1}/{items.length}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={prev}
                  aria-label="Previous"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Previous</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={next}
                  aria-label="Next"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Next</TooltipContent>
            </Tooltip>
          </div>
        ) : undefined
      }
      contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <Body key={activeItem.id} item={activeItem} setTitle={setBodyTitle} />
      </div>

      {hasFooter && (
        <div className="flex h-9 shrink-0 items-center gap-2 border-t border-border bg-card px-3">
          {Footer && <Footer item={activeItem} />}
          {showReattach && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleReattach}
                  className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-primary hover:bg-accent"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Send updated version to the agent</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </MatrxDynamicPanelHost>
  );
}
