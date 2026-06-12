"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectIsAuthenticated,
  selectDisplayName,
} from "@/lib/redux/selectors/userSelectors";
import { cn } from "@/lib/utils";

interface AuthedWorkspaceCTAProps {
  workspaceHref: string;
  /** "Chat", "Workspace", "Agents", etc. — feeds the banner copy. */
  workspaceLabel: string;
}

/**
 * Sticky banner shown at the top of a marketing landing page when an
 * authenticated visitor happens to land here (typed URL, external link,
 * social share). Internal sidebar nav goes directly to the workspace, so
 * authed users rarely see this — but when they do, they get a one-tap
 * route back to their work instead of being pitched a product they
 * already have.
 *
 * Renders `null` for guests. Hydration-safe via `selectIsAuthenticated`
 * being seeded from the `(core)/layout.tsx` preloaded Redux state, which
 * matches the SSR render so there is no flicker.
 */
export function AuthedWorkspaceCTA({
  workspaceHref,
  workspaceLabel,
}: AuthedWorkspaceCTAProps) {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const displayName = useAppSelector(selectDisplayName);

  if (!isAuthenticated) return null;

  const firstName = displayName.split(" ")[0] || displayName;

  return (
    <div
      className={cn(
        "sticky top-0 z-30 w-full",
        "bg-gradient-to-r from-primary/10 via-primary/5 to-transparent",
        "backdrop-blur",
      )}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
        <p className="text-sm text-foreground truncate">
          <span className="font-medium">Welcome back, {firstName}.</span>{" "}
          <span className="text-muted-foreground hidden sm:inline">
            Your workspace is one click away.
          </span>
        </p>
        <Link
          href={workspaceHref}
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-semibold",
            "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
          )}
        >
          Open {workspaceLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
