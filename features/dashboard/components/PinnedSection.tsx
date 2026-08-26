"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { XTapButton } from "@/components/icons/tap-buttons";
import ShellIcon from "@/features/shell/components/ShellIcon";
import { resolveShellIconName } from "@/features/shell/shellIconMap";
import { iconColorMap } from "@/features/shell/constants/nav-data";
import { cn } from "@/lib/utils";
import { usePinned } from "@/components/favorites/usePinned";
import { useIsMounted } from "@/hooks/use-is-mounted";

export function PinnedSection({
  openInNewTab = false,
}: {
  openInNewTab?: boolean;
}) {
  const { favorites: pinnedFavorites, unpin } = usePinned();
  // Favorites live in the client Redux store (synced/persisted after boot), so
  // the server always renders the empty state. Render empty until mounted so
  // the client's first render matches SSR — otherwise React reports a
  // hydration mismatch on the count badge and grid.
  const isMounted = useIsMounted();
  const favorites = isMounted ? pinnedFavorites : [];

  return (
    <section data-surface-value="pinned_items" className="space-y-2">
      <div className="flex items-center gap-2">
        <Star size={14} className="text-amber-500" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Pinned
        </h2>
        {favorites.length > 0 && (
          <span
            data-surface-value="pinned_count"
            className="text-xs text-muted-foreground"
          >
            {favorites.length}
          </span>
        )}
      </div>

      {favorites.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-4 text-sm text-muted-foreground">
          <Star size={18} className="shrink-0 text-muted-foreground/70" />
          <span>
            Use the star button on any card below to add it here and to your
            sidebar Favorites.
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {favorites.map((f) => {
            const iconName = f.iconName
              ? resolveShellIconName(f.iconName)
              : null;
            const inner = (
              <>
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl",
                    iconColorMap[f.color ?? "slate"] ?? iconColorMap.slate,
                  )}
                >
                  {iconName ? (
                    <ShellIcon name={iconName} size={18} strokeWidth={2} />
                  ) : (
                    <Star size={18} />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {f.label}
                </span>
              </>
            );
            return (
              <div
                key={f.id}
                className="group relative flex min-h-11 items-center gap-3 rounded-2xl border border-border bg-card p-3 pr-11 transition-colors hover:border-foreground/20 hover:bg-accent/40"
              >
                {f.href.startsWith("http") ? (
                  <a
                    href={f.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3"
                  >
                    {inner}
                  </a>
                ) : (
                  <Link
                    href={f.href}
                    target={openInNewTab ? "_blank" : undefined}
                    rel={openInNewTab ? "noopener noreferrer" : undefined}
                    prefetch={openInNewTab ? false : undefined}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3"
                  >
                    {inner}
                  </Link>
                )}
                <span className="absolute right-1 top-1/2 -translate-y-1/2 opacity-100 transition-opacity duration-150 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100">
                  <XTapButton
                    onClick={() => unpin(f.id)}
                    ariaLabel={`Unpin ${f.label}`}
                    tooltip={`Unpin ${f.label}`}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
