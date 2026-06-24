"use client";

import Link from "next/link";
import { Star, X } from "lucide-react";
import ShellIcon from "@/features/shell/components/ShellIcon";
import { iconColorMap } from "@/features/shell/constants/nav-data";
import { cn } from "@/lib/utils";
import { usePinned } from "@/components/favorites/usePinned";

export function PinnedSection() {
  const { favorites, unpin } = usePinned();

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Star size={14} className="text-amber-500" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Pinned
        </h2>
        {favorites.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {favorites.length}
          </span>
        )}
      </div>

      {favorites.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-4 text-sm text-muted-foreground">
          <Star size={18} className="shrink-0 text-muted-foreground/70" />
          <span>
            Click the{" "}
            <Star size={12} className="inline -mt-0.5 fill-amber-500 text-amber-500" />{" "}
            on any card below to pin it here — and to your sidebar Favorites.
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {favorites.map((f) => {
            const inner = (
              <>
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl",
                    iconColorMap[f.color ?? "slate"] ?? iconColorMap.slate,
                  )}
                >
                  {f.iconName ? (
                    <ShellIcon name={f.iconName} size={18} strokeWidth={2} />
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
                className="group relative flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:border-foreground/20 hover:bg-accent/40"
              >
                {f.href.startsWith("http") ? (
                  <a
                    href={f.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    {inner}
                  </a>
                ) : (
                  <Link href={f.href} className="flex min-w-0 flex-1 items-center gap-3">
                    {inner}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => unpin(f.id)}
                  aria-label={`Unpin ${f.label}`}
                  title="Unpin"
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
