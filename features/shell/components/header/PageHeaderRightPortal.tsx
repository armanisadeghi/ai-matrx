"use client";

// PageHeaderRightPortal — Client-only portal for the header right slot
// (#shell-header-right), immediately left of the user avatar.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface PageHeaderRightPortalProps {
  children: React.ReactNode;
}

export default function PageHeaderRightPortal({
  children,
}: PageHeaderRightPortalProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById("shell-header-right"));
  }, []);

  if (!target) return null;

  return createPortal(
    <div className="shell-header-inject">{children}</div>,
    target,
  );
}
