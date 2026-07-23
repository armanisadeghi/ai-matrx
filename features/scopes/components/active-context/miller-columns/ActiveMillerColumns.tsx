"use client";

import { useActiveContextSelectionEngine } from "../quick-pick/useActiveContextSelectionEngine";
import { MillerColumnsCore, type MillerColumnsVariant } from "./MillerColumns";

export interface ActiveMillerColumnsProps {
  variant?: MillerColumnsVariant;
  className?: string;
}

/** Surface-A adapter: the reusable Miller core backed by appContextSlice. */
export function ActiveMillerColumns({
  variant = "full",
  className,
}: ActiveMillerColumnsProps) {
  const { universe, engine } = useActiveContextSelectionEngine();

  return (
    <MillerColumnsCore
      universe={universe}
      engine={engine}
      mode="active"
      variant={variant}
      className={className}
    />
  );
}
