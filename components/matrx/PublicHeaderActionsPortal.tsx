"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface PublicHeaderActionsPortalProps {
  children: ReactNode;
}

/**
 * Places route-specific public-page actions in the one canonical public header.
 * Public surfaces use this instead of rendering a second branded toolbar.
 */
export function PublicHeaderActionsPortal({
  children,
}: PublicHeaderActionsPortalProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setTarget(document.getElementById("public-header-actions"));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!target) return null;

  return createPortal(
    <div className="flex items-center gap-1">{children}</div>,
    target,
  );
}
