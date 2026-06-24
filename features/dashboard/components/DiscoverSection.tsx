"use client";

import Link from "next/link";
import { Compass, RefreshCw } from "lucide-react";
import ShellIcon from "@/features/shell/components/ShellIcon";
import { iconColorMap } from "@/features/shell/constants/nav-data";
import { cn } from "@/lib/utils";
import { PinButton } from "@/components/favorites/PinButton";
import { DISCOVER_POOL, type DiscoverItem } from "../constants/discover";
import { useDiscoverRotation } from "../hooks/useDiscoverRotation";

const WINDOW_SIZE = 6;

function DiscoverCard({ item }: { item: DiscoverItem }) {
  const chip = iconColorMap[item.color] ?? iconColorMap.slate;
  const body = (
    <>
      <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", chip)}>
        <ShellIcon name={item.iconName} size={18} strokeWidth={2} />
      </span>
      <div className="mt-3 min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">
          {item.label}
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {item.description}
        </p>
      </div>
    </>
  );

  return (
    <div className="group relative flex flex-col rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-accent/40">
      {/* Pin sits above the link layer; it has its own stopPropagation. */}
      <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <PinButton
          item={{
            id: item.href,
            kind: "nav",
            label: item.label,
            href: item.href,
            iconName: item.iconName,
            color: item.color,
          }}
          size="sm"
        />
      </div>
      {item.external ? (
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col"
        >
          {body}
        </a>
      ) : (
        <Link href={item.href} className="flex flex-col">
          {body}
        </Link>
      )}
    </div>
  );
}

export function DiscoverSection() {
  const { items, showMore } = useDiscoverRotation(DISCOVER_POOL, WINDOW_SIZE);

  if (items.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass size={14} className="text-muted-foreground" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Discover
          </h2>
        </div>
        <button
          type="button"
          onClick={showMore}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <RefreshCw size={12} />
          Show more
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <DiscoverCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
