import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MarketingPageShellProps {
  children: ReactNode;
  className?: string;
}

/**
 * Marketing pages inside `(core)` `shell-main`. No top offset — content
 * rides up under the transparent glass header, centered by its own `mx-auto`
 * sections. Nothing here reaches the header chrome: the returning-user
 * `AuthedWorkspaceCTA` injects into the shell header's right slot
 * (`#shell-header-right`) via `PageHeaderRightPortal`, so it sits in the
 * header alongside the avatar rather than as a page-level banner.
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
