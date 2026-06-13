import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MarketingPageShellProps {
  children: ReactNode;
  className?: string;
}

/**
 * Marketing pages inside `(core)` `shell-main`. No top offset — content
 * rides up under the transparent glass header. Content is centered by its
 * own `mx-auto` sections; the only element that sits up near the top-right
 * header avatar is the sticky `AuthedWorkspaceCTA` banner, which owns its
 * own avatar clearance (`--shell-marketing-pr`) — so the shell adds none
 * here (a page-wide right inset would offset every centered section left).
 */
export function MarketingPageShell({
  children,
  className,
}: MarketingPageShellProps) {
  return (
    <div className={cn("min-h-full w-full bg-textured", className)}>
      {children}
    </div>
  );
}
