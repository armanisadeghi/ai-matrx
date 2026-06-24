"use client";

// FavoritesManagerPanel — the "check what to include" UI behind the Manage
// Favorites window. Reads/writes through usePinned() (preferences-backed), so
// every toggle is instantly reflected on the dashboard Pinned grid and the
// sidebar Favorites menu, and synced across devices.
//
// Two groups:
//   1. App areas — the full nav-destination catalog; checkbox = pinned.
//   2. Other pins — favorites that aren't nav areas (e.g. a specific agent
//      pinned from a card); uncheck to remove. Always shown so nothing the user
//      pinned is unreachable here.

import { useState } from "react";
import { Check, Search, Star } from "lucide-react";
import ShellIcon from "@/features/shell/components/ShellIcon";
import {
  flattenNavDestinations,
  iconColorMap,
} from "@/features/shell/constants/nav-data";
import { FAVORITES_MAX } from "@/lib/redux/preferences/userPreferencesSlice";
import { cn } from "@/lib/utils";
import { usePinned } from "./usePinned";

interface FavoritesManagerPanelProps {
  onClose?: () => void;
}

const CATALOG = flattenNavDestinations();

export function FavoritesManagerPanel({ onClose }: FavoritesManagerPanelProps) {
  const { favorites, count, isPinned, toggle, unpin } = usePinned();
  const [query, setQuery] = useState("");

  const atCap = count >= FAVORITES_MAX;
  const q = query.trim().toLowerCase();

  const catalog = q
    ? CATALOG.filter(
        (d) =>
          d.label.toLowerCase().includes(q) ||
          (d.description ?? "").toLowerCase().includes(q),
      )
    : CATALOG;

  // Favorites that aren't in the nav catalog (custom pins, e.g. a record).
  const catalogHrefs = new Set(CATALOG.map((d) => d.href));
  const otherPins = favorites.filter((f) => !catalogHrefs.has(f.id));

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Pin the parts of AI Matrx you use most — they show on your dashboard
          and in the sidebar Favorites menu.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search areas…"
              className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-1 text-xs font-medium",
              atCap
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            {count} / {FAVORITES_MAX}
          </span>
        </div>
      </div>

      {/* Scrollable list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {otherPins.length > 0 && (
          <div className="mb-2">
            <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Your other pins
            </div>
            {otherPins.map((f) => (
              <Row
                key={f.id}
                checked
                label={f.label}
                description={f.href}
                iconName={f.iconName ?? "Star"}
                color={f.color ?? "slate"}
                onToggle={() => unpin(f.id)}
              />
            ))}
          </div>
        )}

        <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          App areas
        </div>
        {catalog.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No areas match “{query}”.
          </div>
        ) : (
          catalog.map((d) => {
            const checked = isPinned(d.href);
            return (
              <Row
                key={d.href}
                checked={checked}
                disabled={!checked && atCap}
                label={d.label}
                description={d.description}
                iconName={d.iconName}
                color={d.color ?? "slate"}
                onToggle={() =>
                  toggle({
                    id: d.href,
                    kind: "nav",
                    label: d.label,
                    href: d.href,
                    iconName: d.iconName,
                    color: d.color,
                  })
                }
              />
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2.5">
        <span className="text-xs text-muted-foreground">
          {atCap ? "Favorite limit reached — unpin one to add another." : ""}
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}

function Row({
  checked,
  disabled,
  label,
  description,
  iconName,
  color,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  description?: string;
  iconName: string;
  color: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={checked}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
        disabled
          ? "cursor-not-allowed opacity-40"
          : "hover:bg-accent/50",
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          checked
            ? "border-amber-500 bg-amber-500 text-white"
            : "border-border bg-background text-transparent",
        )}
      >
        <Check size={13} strokeWidth={3} />
      </span>
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          iconColorMap[color] ?? iconColorMap.slate,
        )}
      >
        <ShellIcon name={iconName} size={15} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {label}
          {checked ? (
            <Star size={11} className="fill-amber-500 text-amber-500" />
          ) : null}
        </span>
        {description ? (
          <span className="block truncate text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export default FavoritesManagerPanel;
