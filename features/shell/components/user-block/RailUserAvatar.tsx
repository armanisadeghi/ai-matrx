"use client";

import { User } from "lucide-react";
import { organizationColor } from "@ai-matrx/design-system";
import { ShellUserAvatarImage } from "../header/header-right-menu/ShellUserAvatarImage";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserAvatarUrl } from "@/lib/redux/selectors/userSelectors";

/**
 * The person's 24px mark in the account rail: their photo, else their initial
 * on a colour tile seeded by their id (the same palette the organization marks
 * use), else the person glyph. Client-side because the colour helper lives in
 * the client-only design-system bundle.
 */
export function RailUserAvatar({
  id,
  name,
  avatarUrl,
  displayName,
}: {
  id: string | null;
  name: string | null | undefined;
  avatarUrl: string | null | undefined;
  displayName: string;
}) {
  // The server-rendered prop is the first paint; the live Redux avatar wins
  // once a save dispatches `setUserMetadata`, so a new photo shows at once.
  const liveAvatarUrl = useAppSelector(selectUserAvatarUrl);
  avatarUrl = liveAvatarUrl || avatarUrl;
  return (
    <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
      {avatarUrl ? (
        <ShellUserAvatarImage src={avatarUrl} alt={displayName} sizes="24px" />
      ) : name ? (
        <span
          className="flex h-full w-full items-center justify-center type-meta font-semibold leading-none"
          style={organizationColor(id ?? displayName)}
        >
          {name.charAt(0).toUpperCase()}
        </span>
      ) : (
        <User className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      )}
    </span>
  );
}
