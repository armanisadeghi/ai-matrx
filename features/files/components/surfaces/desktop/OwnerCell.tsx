/**
 * features/files/components/surfaces/desktop/OwnerCell.tsx
 *
 * Compact "Owner" cell — small color-coded initials avatar + label.
 * The current user is rendered as "You" so users can scan their own
 * files in shared folders at a glance (matches Box / Drive behavior).
 *
 * Until the backend exposes display names + avatar URLs for grantees,
 * we keep the deterministic-color initials approach used elsewhere in
 * the file UI (`SharedAvatarStack`).
 */

"use client";

import { cn } from "@/lib/utils";
// THE package avatar-color hash (`@ai-matrx/kit/format`, census H1
// 2026-09-07) — `avatarPaletteIndex` reproduces this file's own
// hash*31+charCode/abs%buckets exactly, so the 8-color PALETTE below still
// assigns identical colors to identical ids. `initialsFor` here is NOT
// swapped: it derives initials from an opaque owner id, not a person's
// name, which `getInitials` isn't built for.
import { avatarPaletteIndex } from "@ai-matrx/kit/format";

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

/** Truncate a long ownerId to the first 6 chars for the secondary label. */
function shortIdFor(id: string): string {
  const clean = id.replace(/-/g, "");
  return clean.slice(0, 6);
}

export interface OwnerCellProps {
  ownerId: string;
  /** When this matches `ownerId`, the cell renders "You" instead. */
  currentUserId?: string | null;
  className?: string;
}

export function OwnerCell({
  ownerId,
  currentUserId,
  className,
}: OwnerCellProps) {
  if (!ownerId) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>—</span>
    );
  }
  const isMe = !!currentUserId && ownerId === currentUserId;
  const label = isMe ? "You" : shortIdFor(ownerId);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground min-w-0",
        className,
      )}
      title={ownerId}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white",
          colorFor(ownerId),
        )}
      >
        {initialsFor(ownerId)}
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}
