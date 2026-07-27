/**
 * features/files/components/surfaces/dropbox/AccessBadge.tsx
 *
 * The Access label in the file table and the main content header.
 *
 * IT MUST NOT OVERSTATE PRIVACY. `visibility` is only one of the ways
 * `iam.has_access_for_base` grants access — a `personal` file attached to an
 * org-internal scope is readable by that entire org through
 * `platform.reachability`. This badge used to say "Only you" for exactly that
 * case, which was a lie the user could act on.
 *
 * A list cannot afford the real computation (that is
 * `public.entity_access_summary`, one entity at a time, rendered by
 * `<AccessSummaryPanel>` in the info panel). So this badge does two things:
 *   1. Uses the container signal the list ALREADY fetched in bulk for the
 *      Context column — zero extra queries — to say "Via N scopes".
 *   2. When it does not know, says "Personal", a statement about the file's
 *      setting, instead of "Only you", a claim about who can see it.
 */

"use client";

import { Globe, Lock, Boxes, Building2, Link2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Visibility } from "@/features/files/types";

export interface AccessBadgeProps {
  visibility: Visibility;
  /** Distinct direct grantees, independent of the visibility level. */
  memberCount?: number;
  /**
   * Scopes this resource is attached to, from the bulk row-scope store that
   * already backs the Context column. `undefined` means "not looked up" —
   * which is NOT the same as zero, and must never be rendered as certainty.
   */
  scopeCount?: number;
  className?: string;
}

export function AccessBadge({
  visibility,
  memberCount,
  scopeCount,
  className,
}: AccessBadgeProps) {
  const { Icon, label, title } = describe(visibility, memberCount, scopeCount);
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

function describe(
  visibility: Visibility,
  memberCount?: number,
  scopeCount?: number,
) {
  if (visibility === "public") {
    return {
      Icon: Globe,
      label: "Public",
      title: "Anyone with the link can view this.",
    };
  }
  if (visibility === "internal") {
    return {
      Icon: Building2,
      label: "Organization",
      title:
        "Readable by everyone in the owning organization. Open File info for the full picture.",
    };
  }
  if (visibility === "link") {
    return {
      Icon: Link2,
      label: "Link",
      title: "Anyone holding a share link can view this.",
    };
  }
  // Direct grants are a separate axis from visibility: a `personal` file can
  // still be granted to specific people. Report them when we know of any.
  if ((memberCount ?? 0) > 0) {
    const count = memberCount ?? 0;
    return {
      Icon: Users,
      label: count === 1 ? "1 member" : `${count} members`,
      title: "Shared directly with specific people or organizations.",
    };
  }
  if ((scopeCount ?? 0) > 0) {
    const count = scopeCount ?? 0;
    return {
      Icon: Boxes,
      label: count === 1 ? "Via 1 scope" : `Via ${count} scopes`,
      title:
        "Not shared directly, but reachable through the scopes it is attached to — anyone who can open those scopes can view it. Open File info for the full picture.",
    };
  }
  return {
    Icon: Lock,
    label: "Personal",
    title:
      "Not published and not directly shared. Open File info for the full picture, including access inherited from containers.",
  };
}
