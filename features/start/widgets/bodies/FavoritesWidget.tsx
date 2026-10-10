"use client";

// features/start/widgets/bodies/FavoritesWidget.tsx — the app pages the person pinned (the favorites
// primitive `usePinned`, `nav` kind); each row opens its real route. Below the pins, the app's own main
// pages the person has not pinned yet (the dashboard count destinations) with a Pin star — the same
// PinButton every page carries — so pinning starts right here.
import { Star } from "lucide-react";
import { usePinned } from "@/components/favorites/usePinned";
import { PinButton } from "@/components/favorites/PinButton";
import { METRIC_CARDS } from "@/features/dashboard/constants/metricCards";
import { isShellIconName, shellIconComponents } from "@/features/shell/shellIconMap";
import type { StartWidgetBodyProps } from "../types";
import { WidgetList, type WidgetRow } from "../frame";

const iconOf = (name: string | undefined) => (name && isShellIconName(name) ? shellIconComponents[name] : Star);

/** Pinned pages first, then the app's main pages not pinned yet (deduped by href). */
export function favoriteRows<F extends { id: string; kind: string; label: string; href: string; iconName?: string }>(
  favorites: readonly F[],
): { pinned: F[]; suggestions: { href: string; label: string; iconName: string; color: string }[] } {
  const pinned = favorites.filter((f) => f.kind === "nav");
  const taken = new Set(pinned.map((f) => f.href));
  const suggestions = METRIC_CARDS.filter((c) => !taken.has(c.href))
    .filter((c, i, all) => all.findIndex((x) => x.href === c.href) === i)
    .map((c) => ({ href: c.href, label: c.label, iconName: c.iconName, color: c.color }));
  return { pinned, suggestions };
}

export function FavoritesWidget({ size }: StartWidgetBodyProps) {
  const { favorites } = usePinned();
  const { pinned, suggestions } = favoriteRows(favorites);
  const rows: WidgetRow[] = [
    ...pinned.map((f) => ({ key: f.id, title: f.label, href: f.href, icon: iconOf(f.iconName) })),
    ...suggestions.map((s) => ({
      key: `suggest:${s.href}`,
      title: s.label,
      href: s.href,
      icon: iconOf(s.iconName),
      tone: "muted" as const,
      action: <PinButton size="sm" item={{ id: s.href, kind: "nav", label: s.label, href: s.href, iconName: s.iconName, color: s.color }} />,
    })),
  ];
  return <WidgetList type="favorites" size={size} loading={false} empty="Star any page to pin it here" rows={rows} />;
}
