"use client";

/**
 * UserIdentity — the canonical way to display *another* user anywhere in the app.
 *
 * Why this exists: every surface that showed a user (org members, invitations,
 * comments, shares, message lists, etc.) used to hand-roll its own avatar markup.
 * Many of them silently dropped the avatar image and fell back to a colored
 * initial forever — even when the user had a real profile photo. This primitive
 * makes that class of bug structurally impossible: pass it a user-shaped object
 * and it ALWAYS renders the avatar image when one exists, with a deterministic
 * colored-initials fallback otherwise.
 *
 * For the *current signed-in* user, prefer `components/layout/UserAvatar` which
 * reads Redux. This component is for rendering arbitrary/other users you already
 * have data for.
 *
 * Two exports:
 *  - <UserAvatarDisplay /> — just the avatar circle.
 *  - <UserIdentity />       — avatar + name (+ optional email/subtitle), the
 *                             standard "row" representation of a person.
 */

import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/styles/themes/utils";

/**
 * A deliberately permissive shape so this works with Redux users, Supabase rows
 * (snake_case), auth metadata, and feature-local user objects without adapters.
 */
export interface UserLike {
  id?: string | null;
  email?: string | null;
  displayName?: string | null;
  display_name?: string | null;
  name?: string | null;
  fullName?: string | null;
  full_name?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
  picture?: string | null;
  image?: string | null;
  imageUrl?: string | null;
}

export type UserAvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

const sizeClasses: Record<UserAvatarSize, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
  xxl: "h-24 w-24 text-2xl",
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

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++)
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return fallbackPalette[Math.abs(hash) % fallbackPalette.length];
}

/** Best available human name for a user, falling back to the email local-part. */
export function resolveUserName(user: UserLike | null | undefined): string {
  if (!user) return "Unknown user";
  return (
    user.displayName ||
    user.display_name ||
    user.name ||
    user.fullName ||
    user.full_name ||
    user.email?.split("@")[0] ||
    "Unknown user"
  );
}

/** Best available avatar URL across the common field spellings. */
export function resolveUserAvatarUrl(
  user: UserLike | null | undefined,
): string | null {
  if (!user) return null;
  return (
    user.avatarUrl ||
    user.avatar_url ||
    user.picture ||
    user.image ||
    user.imageUrl ||
    null
  );
}

export function resolveUserInitials(user: UserLike | null | undefined): string {
  const name = resolveUserName(user);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return letters || name[0]?.toUpperCase() || "?";
}

export interface UserAvatarDisplayProps {
  user: UserLike | null | undefined;
  size?: UserAvatarSize;
  /** Ring/border that matches the surface the avatar sits on (e.g. "ring-2 ring-card"). */
  className?: string;
  /** Override the title attribute; defaults to the resolved name. */
  title?: string;
}

/**
 * The avatar circle for any user. Always prefers the real photo; falls back to
 * deterministic colored initials. Never shows a blank/anonymous circle.
 */
export function UserAvatarDisplay({
  user,
  size = "md",
  className,
  title,
}: UserAvatarDisplayProps) {
  const name = resolveUserName(user);
  const avatarUrl = resolveUserAvatarUrl(user);
  const seed = user?.id || user?.email || name;

  return (
    <Avatar className={cn(sizeClasses[size], className)} title={title ?? name}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
      <AvatarFallback className={cn("font-semibold", colorFor(seed))}>
        {resolveUserInitials(user)}
      </AvatarFallback>
    </Avatar>
  );
}

export interface UserIdentityProps {
  user: UserLike | null | undefined;
  size?: UserAvatarSize;
  /**
   * Secondary line under the name. Defaults to the email when it differs from
   * the displayed name. Pass `false` to hide it, or a node to override.
   */
  subtitle?: React.ReactNode | false;
  /** Appended after the name (e.g. a "(You)" tag or a role badge). */
  nameSuffix?: React.ReactNode;
  className?: string;
  avatarClassName?: string;
  /** Hide the text and render only the avatar. */
  avatarOnly?: boolean;
}

/**
 * Standard person row: avatar + name + (subtitle). Use this anywhere you list or
 * reference a user. Guarantees the avatar is never dropped.
 */
export function UserIdentity({
  user,
  size = "md",
  subtitle,
  nameSuffix,
  className,
  avatarClassName,
  avatarOnly = false,
}: UserIdentityProps) {
  const name = resolveUserName(user);
  const email = user?.email ?? null;
  const resolvedSubtitle =
    subtitle === false
      ? null
      : subtitle !== undefined
        ? subtitle
        : email && email !== name
          ? email
          : null;

  if (avatarOnly) {
    return (
      <UserAvatarDisplay user={user} size={size} className={avatarClassName} />
    );
  }

  return (
    <div className={cn("flex items-center gap-3 min-w-0", className)}>
      <UserAvatarDisplay
        user={user}
        size={size}
        className={cn("flex-shrink-0", avatarClassName)}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="font-medium truncate">{name}</p>
          {nameSuffix}
        </div>
        {resolvedSubtitle ? (
          <p className="text-sm text-muted-foreground truncate">
            {resolvedSubtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
