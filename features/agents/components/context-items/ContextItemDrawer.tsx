"use client";

/**
 * ContextItemDrawer — the ONE shared, interactive detail panel for every
 * attached context item (notes, tasks, media, webpages, data refs, the working
 * document, and every not-yet-custom type). Resolves the body via the registry,
 * supports prev/next + a bottom thumbnail rail to page through every item on a
 * message, and offers re-attaching an edited record to the next turn.
 *
 * Built on `MatrxDynamicPanelHost` (right-positioned, resizable) — the same
 * primitive as `ContextSlotDetailSheet`.
 */

import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { useAppDispatch } from "@/lib/redux/hooks";
import { addResource } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import { toast } from "@/lib/toast-service";
import { cn } from "@/lib/utils";
import { resolveContextItemBody } from "./registry";
import { buildReattachSpec, canReattach } from "./recontext";
import type { ContextItemDrawerController } from "./useContextItemDrawer";

interface ContextItemDrawerProps {
  controller: ContextItemDrawerController;
}

export function ContextItemDrawer({ controller }: ContextItemDrawerProps) {
  const { open, items, index, activeItem, setOpen, goTo, next, prev } =
    controller;
  const dispatch = useAppDispatch();

  if (!activeItem) {
    // Nothing to show — keep the host unmounted so it doesn't trap focus.
    return null;
  }

  const Body = resolveContextItemBody(activeItem.blockType);
  const Icon = activeItem.icon;
  const multi = items.length > 1;
  const showReattach = canReattach(activeItem);

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
    toast.success(
      "Updated version attached — it'll be sent on your next turn.",
    );
  };

  return (
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={setOpen}
      position="right"
      defaultSize={38}
      expandButtonLabel={activeItem.typeLabel}
      title={
        <span className="inline-flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{activeItem.title}</span>
        </span>
      }
      description={
        <span className="text-[11px] text-muted-foreground">
          {activeItem.typeLabel}
          {multi ? ` · ${index + 1} of ${items.length}` : ""}
        </span>
      }
      headerActions={
        multi ? (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={prev}
              aria-label="Previous item"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next item"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : undefined
      }
      contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <Body key={activeItem.id} item={activeItem} />
      </div>

      {showReattach && (
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-muted/40 px-3 py-2">
          <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
            Edits stay local — the agent saw this when it was first attached.
          </p>
          <button
            type="button"
            onClick={handleReattach}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            <Send className="h-3.5 w-3.5" />
            Send updated version
          </button>
        </div>
      )}

      {multi && (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-border px-3 py-2">
          {items.map((it, i) => {
            const ItemIcon = it.icon;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => goTo(i)}
                title={it.title}
                className={cn(
                  "inline-flex max-w-[10rem] shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors",
                  i === index
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <ItemIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{it.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </MatrxDynamicPanelHost>
  );
}
