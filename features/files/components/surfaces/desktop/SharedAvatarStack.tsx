/**
 * features/files/components/surfaces/dropbox/SharedAvatarStack.tsx
 *
 * Overlapping avatar stack shown in folder headers and rows to suggest
 * membership. Until the backend exposes avatar URLs for grantees, this shows
 * deterministic colored initials based on user IDs.
 */

"use client";

import { cn } from "@/lib/utils";
// THE package avatar-color hash (`@ai-matrx/kit/format`, census H1
// 2026-09-07) — `avatarPaletteIndex` reproduces this file's own
// hash*31+charCode/abs%buckets exactly, so the 8-color PALETTE below still
// assigns identical colors to identical ids. `initialsFor` here is NOT
// swapped: it derives initials from an opaque grantee id, not a person's
// name, which `getInitials` isn't built for.
import { avatarPaletteIndex } from "@ai-matrx/kit/format";

export interface SharedAvatarStackProps {
  granteeIds: string[];
  max?: number;
  size?: "sm" | "md";
  className?: string;
}

const PALETTE = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-pink-500",
];

export function SharedAvatarStack({
  granteeIds,
  max = 3,
  size = "md",
  className,
}: SharedAvatarStackProps) {
  if (granteeIds.length === 0) return null;
  const shown = granteeIds.slice(0, max);
  const extra = granteeIds.length - shown.length;

  const dims =
    size === "sm" ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-[11px]";

  return (
    <div className={cn("flex -space-x-1.5", className)}>
      {shown.map((id) => (
        <span
          key={id}
          aria-hidden="true"
          className={cn(
            "inline-flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-background",
            dims,
            colorFor(id),
          )}
        >
          {initialsFor(id)}
        </span>
      ))}
      {extra > 0 ? (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-background",
            dims,
          )}
        >
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

function colorFor(id: string): string {
  return PALETTE[avatarPaletteIndex(id, PALETTE.length)];
}

function initialsFor(id: string): string {
  const clean = id.replace(/[^a-zA-Z0-9]/g, "");
  if (clean.length === 0) return "?";
  const first = clean[0]?.toUpperCase() ?? "?";
  const mid =
    clean.length > 1
      ? (clean[Math.floor(clean.length / 2)] ?? "").toUpperCase()
      : "";
  return first + mid;
}
