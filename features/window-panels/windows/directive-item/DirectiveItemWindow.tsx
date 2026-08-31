"use client";

/**
 * DirectiveItemWindow — read ONE item of a pending directive properly, beside
 * the conversation, before you approve the write.
 *
 * WHY IT EXISTS (Arman, 2026-08-26): a side-effect directive in content rendered
 * as a name and an Apply button. That asks a person to authorize a potentially
 * destructive write with no clue what the thing is. The compact card now says
 * what it is; this window is where you actually READ it.
 *
 * 🚨 IT WRAPS THE CANONICAL RENDERERS, IT IS NOT ONE
 * (`features/window-panels/FEATURE.md` § A PANEL WRAPS THE CANONICAL COMPONENT).
 * There are exactly two bodies here and this file authors neither:
 *
 *   Pretty — `DbKindComponent`, the kind pipeline's own renderer, reached
 *     because the item IS a kind instance (THE DIRECTIVE⇄KIND SEAM;
 *     `features/content-ir/directives/itemKind.ts`). An `agent_definition` item
 *     therefore renders through the very same component that draws an agent
 *     everywhere else — and it does so with ZERO code here, which is the whole
 *     point of the seam. `DbKindComponent` brings its own graceful ladder
 *     (component row → generic structured viewer), so this file needs no
 *     fallback branch of its own.
 *   Pretty, when the shape has NO item kind — `StructuredValueView`, THE FLOOR
 *     of the platform's structured rendering. Honest: the item genuinely has no
 *     registered kind, so it gets the generic document view rather than an
 *     invented one.
 *   Raw — the item as JSON, for the reader who wants the literal payload.
 *
 * The item does NOT exist in the database yet, which is exactly why this cannot
 * be `ItemDetailWindow` (that fetches a row by id). The value in front of you is
 * the proposal. Once applied, the receipt carries real ids and the card links to
 * the created entity through the ordinary item-presentation opener.
 */

import { useState } from "react";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";
import DbKindComponent from "@/features/content-ir/react/db-component/DbKindComponent";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { useEnsureKindRenderable } from "@/features/content-ir/react/ensure-kind-renderable";
import { cn } from "@/lib/utils";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

export interface DirectiveItemWindowProps {
  windowInstanceId: string;
  onClose: () => void;
  /** The item, `__kind`-stamped when the shape has one. Serializable (Redux). */
  item: Record<string, unknown>;
  /** The content-IR kind of the item, or null when the shape has none. */
  itemKind: string | null;
  /** What this item is called — the card's own title, so the two agree. */
  title: string;
  /** "Create Agent Definition · item 1 of 1" — where this came from. */
  subtitle?: string | null;
}

type Tab = "pretty" | "raw";

export default function DirectiveItemWindow({
  windowInstanceId,
  onClose,
  item,
  itemKind,
  title,
  subtitle,
}: DirectiveItemWindowProps) {
  const [tab, setTab] = useState<Tab>("pretty");
  // THE CONVERGENCE SEAM: rendering IS the demand signal. Without this the
  // kind's schema/component are never fetched on a path the live stream did
  // not warm, and a perfectly registered kind sits on the generic viewer.
  useEnsureKindRenderable(itemKind);

  return (
    <WindowPanel
      id={`directive-item-window-${windowInstanceId}`}
      overlayId="directiveItemWindow"
      title={title || "Item"}
      onClose={onClose}
      width={720}
      height={620}
      minWidth={360}
      minHeight={260}
    >
      {/* context-menu-exempt: entity — the item does NOT exist in the database
          yet (it's the proposal, not yet applied); once applied the receipt
          carries a real id and the ordinary item-presentation opener takes
          over. */}
      <NonEditableContextMenu
        sourceFeature="system"
        contentSource={{ type: "raw" }}
        contextData={{ content: JSON.stringify(item, null, 2) }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
            {(["pretty", "raw"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={cn(
                  "rounded px-2 py-0.5 text-xs capitalize transition-colors",
                  tab === value
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value}
              </button>
            ))}
            {subtitle ? (
              <span className="truncate text-[11px] text-muted-foreground">
                {subtitle}
              </span>
            ) : null}
            <div className="ml-auto">
              <CopyButtons
                label={title || "Item"}
                human={() => JSON.stringify(item, null, 2)}
                agent={{
                  kind: itemKind ?? "directive-item",
                  location: "AI Matrx — proposed directive item",
                  description: `One item of a pending directive${
                    itemKind ? ` (kind: ${itemKind})` : ""
                  }. Not yet applied.`,
                  data: item,
                  ...(subtitle ? { context: { source: subtitle } } : {}),
                }}
                json={item}
                size="icon"
                appearance="bare"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {tab === "raw" ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
                {JSON.stringify(item, null, 2)}
              </pre>
            ) : itemKind ? (
              // The kind's OWN component — the seam paying off. No branch here for
              // a missing component row: DbKindComponent degrades internally.
              <DbKindComponent content={JSON.stringify(item)} />
            ) : (
              // No registered kind. The floor, honestly reached.
              <StructuredValueView value={item} density="full" footer={false} />
            )}
          </div>
        </div>
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
