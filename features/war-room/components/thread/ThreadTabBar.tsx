"use client";

// features/war-room/components/thread/ThreadTabBar.tsx
//
// The tile view switcher: a compact segmented control (one connected pill) with
// a single "lit" segment, kind-colored to match the tile accent rail. Icon-only
// by default — it lives inline in the tile header (no separate row, no labels),
// so the icons are self-explanatory and reclaim vertical space. The Stage tile
// opts into labels via `withLabels` + `size="md"`.
//
// The tab set is DERIVED per thread (useThreadTabs): the core tabs plus one
// `entity:` segment for every attached entity type the core tabs don't cover.

import { cn } from "@/lib/utils";
import type { ThreadAnchorType, ThreadTab } from "@/features/war-room/types";
import { useThreadTabs } from "@/features/war-room/hooks/useThreadTabs";
import { dynamicTabKind } from "@/features/war-room/components/room/threadKind";

export function ThreadTabBar({
  threadId,
  active,
  onChange,
  anchorType = "canvas",
  withLabels = false,
  size = "sm",
}: {
  threadId: string;
  active: ThreadTab;
  onChange: (tab: ThreadTab) => void;
  anchorType?: ThreadAnchorType;
  withLabels?: boolean;
  size?: "sm" | "md";
}) {
  const tabs = useThreadTabs(threadId);
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5 shrink-0">
      {tabs.map((id) => {
        const k = dynamicTabKind(id, anchorType);
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={isActive}
            title={k.label}
            onClick={(e) => {
              e.stopPropagation();
              onChange(id);
            }}
            className={cn(
              "inline-flex items-center justify-center gap-1 rounded-md font-medium transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              size === "md" ? "h-7 px-2" : "h-6 px-1.5",
              isActive
                ? cn("bg-card shadow-[var(--elevation-1)]", k.text)
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <k.Icon className={size === "md" ? "size-4" : "size-3.5"} />
            {withLabels ? (
              <span className="text-[11px] @max-[26rem]:hidden">{k.label}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
