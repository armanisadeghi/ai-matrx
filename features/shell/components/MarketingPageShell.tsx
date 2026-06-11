import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MarketingPageShellProps {
  children: ReactNode;
  className?: string;
}

/**
 * Marketing pages inside `(core)` `shell-main`. No top offset — content
 * rides up under the transparent glass header. Right inset only, so
 * scrolled content clears the header user avatar.
 */
export function MarketingPageShell({
  children,
  className,
}: MarketingPageShellProps) {
  return (
    <div
      className={cn(
        "min-h-full w-full bg-textured pr-[var(--shell-marketing-pr)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
