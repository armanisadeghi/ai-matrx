"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectIsAuthenticated,
  selectDisplayName,
} from "@/lib/redux/selectors/userSelectors";
import PageHeaderRightPortal from "@/features/shell/components/header/PageHeaderRightPortal";

interface AuthedWorkspaceCTAProps {
  workspaceHref: string;
  /** "Chat", "Workspace", "Agents", etc. — feeds the button label. */
  workspaceLabel: string;
}

/**
 * Offers an authenticated visitor a one-tap route back to their workspace when
 * they land on a marketing page.
 *
 * Renders INTO the shell header's right slot (`#shell-header-right`, just left
 * of the user avatar) via `PageHeaderRightPortal` — NOT as a separate sticky
 * bar. This is the load-bearing fix: a self-rendered bar rode under the
 * transparent glass header and collided with the left hamburger + right avatar,
 * and was far too tall for the 2.5rem header. In the header slot the shell's
 * flexbox vertically centers the control to match the 32px visible avatar, the
 * left hamburger can never reach it (opposite side), and there is no extra
 * height. The pill carries its own `matrx-glass-thin-border` (the inject
 * wrapper is transparent by contract).
 *
 * Renders `null` for guests. Hydration-safe: `selectIsAuthenticated` is seeded
 * from the `(core)/layout.tsx` preloaded Redux state, and the portal mounts
 * client-side after the header exists.
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
    <PageHeaderRightPortal>
      <div className="flex items-center gap-2.5 pr-1.5">
        <span className="hidden md:inline text-sm text-muted-foreground whitespace-nowrap">
          Welcome back,{" "}
          <span className="font-medium text-foreground">{firstName}</span>
        </span>
        <Link
          href={workspaceHref}
          className="matrx-glass-thin-border inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-foreground hover:text-primary transition-colors whitespace-nowrap"
        >
          Open {workspaceLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </PageHeaderRightPortal>
  );
}
