"use client";

// features/vision-interview/components/RoleAvatar.tsx
//
// The ONE avatar disc for everyone in the room — the seven roles (chart-token
// accents from ROLES[key].accent) and the human (primary). Consumed by the
// presence strip, the transcript turns, and the live in-flight cards so the
// speaker identity reads identically everywhere (chat's avatar/chip language).

import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLES, type RoleKey } from "../types";

interface RoleAvatarProps {
  /** A role key, or null for the human. */
  role: RoleKey | null;
  /** Disc diameter. Default "md" (28px) — the transcript size. */
  size?: "sm" | "md" | "lg";
  /** Active-speaker halo: accent ring + a slow CSS pulse. */
  speaking?: boolean;
  /** Dim treatment for roles not active in the current stage. */
  dimmed?: boolean;
  className?: string;
}

const SIZE: Record<NonNullable<RoleAvatarProps["size"]>, string> = {
  sm: "h-6 w-6",
  md: "h-7 w-7",
  lg: "h-9 w-9",
};

const ICON_SIZE: Record<NonNullable<RoleAvatarProps["size"]>, string> = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
  lg: "h-4.5 w-4.5",
};

export function RoleAvatar({
  role,
  size = "md",
  speaking = false,
  dimmed = false,
  className,
}: RoleAvatarProps) {
  const meta = role ? ROLES[role] : null;
  const Icon = meta?.icon ?? User;
  const avatarAccent = meta?.accent.avatar ?? "bg-primary/15 text-primary";
  const ringAccent = meta?.accent.ring ?? "ring-primary/60";

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full transition-opacity",
        SIZE[size],
        avatarAccent,
        speaking && cn("ring-2 ring-offset-1 ring-offset-background", ringAccent),
        dimmed && "opacity-35",
        className,
      )}
      aria-hidden
    >
      {speaking && (
        <span
          className={cn(
            "absolute inset-0 animate-ping rounded-full opacity-30",
            avatarAccent,
          )}
        />
      )}
      <Icon className={cn("relative", ICON_SIZE[size])} />
    </span>
  );
}
