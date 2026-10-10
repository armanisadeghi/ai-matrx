"use client";

// features/start/widgets/bodies/FavoritesWidget.tsx — the app pages the person pinned (the favorites
// primitive `usePinned`, `nav` kind). The pin itself is the star on any page (PinButton).
import { Star } from "lucide-react";
import { usePinned } from "@/components/favorites/usePinned";
import { isShellIconName, shellIconComponents } from "@/features/shell/shellIconMap";
import type { StartWidgetBodyProps } from "../types";
import { WidgetList } from "../frame";

export function FavoritesWidget({ size }: StartWidgetBodyProps) {
  const { favorites } = usePinned();
  const nav = favorites.filter((f) => f.kind === "nav");
  return (
    <WidgetList
      type="favorites"
      size={size}
      loading={false}
      empty="Star any page to pin it here"
      rows={nav.map((f) => ({
        key: f.id,
        title: f.label,
        href: f.href,
        icon: f.iconName && isShellIconName(f.iconName) ? shellIconComponents[f.iconName] : Star,
      }))}
    />
  );
}
