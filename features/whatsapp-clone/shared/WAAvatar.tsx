"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/styles/themes/utils";
// THE package initials + avatar-color formatters (`@ai-matrx/kit/format`,
// census H1 2026-09-07). Recorded display decision: a multi-part name takes
// FIRST + LAST, so "Ana Maria Rivera" is AR — this surface previously took
// first + second and printed "AM". `avatarPaletteIndex` reproduces this
// file's own hash exactly, so the 8-color palette assigns identical colors.
import { avatarPaletteIndex, getInitials } from "@ai-matrx/kit/format";

interface WAAvatarProps {
  name: string;
  src?: string | null;
  online?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "xxl";
  showPresenceDot?: boolean;
  className?: string;
}

const sizeClasses: Record<NonNullable<WAAvatarProps["size"]>, string> = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-9 w-9 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
  xxl: "h-24 w-24 text-2xl",
};

const dotSizeClasses: Record<NonNullable<WAAvatarProps["size"]>, string> = {
  xs: "h-1.5 w-1.5 ring-1",
  sm: "h-2 w-2 ring-2",
  md: "h-2.5 w-2.5 ring-2",
  lg: "h-3 w-3 ring-2",
  xl: "h-3.5 w-3.5 ring-2",
  xxl: "h-4 w-4 ring-[3px]",
};

const fallbackPalette = [
  "bg-emerald-600 text-white",
  "bg-sky-600 text-white",
  "bg-violet-600 text-white",
  "bg-amber-600 text-white",
  "bg-rose-600 text-white",
  "bg-teal-600 text-white",
  "bg-indigo-600 text-white",
  "bg-fuchsia-600 text-white",
];

function colorFor(name: string): string {
  return fallbackPalette[avatarPaletteIndex(name, fallbackPalette.length)];
}

export function WAAvatar({
  name,
  src,
  online,
  size = "md",
  showPresenceDot = false,
  className,
}: WAAvatarProps) {
  return (
    <div className={cn("relative inline-block", className)}>
      <Avatar className={cn(sizeClasses[size])}>
        {src ? <AvatarImage src={src} alt={name} /> : null}
        <AvatarFallback className={cn("font-medium", colorFor(name))}>
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      {showPresenceDot && online ? (
        <span
          className={cn(
            "absolute bottom-0 right-0 block rounded-full bg-emerald-500 ring-card",
            dotSizeClasses[size],
          )}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
