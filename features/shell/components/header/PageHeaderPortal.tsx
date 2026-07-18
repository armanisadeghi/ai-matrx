"use client";

// PageHeaderPortal — Client-only portal mechanism for the header center slot.
// This is the ONLY client boundary needed. All content passed as children
// can be server-rendered nodes — React streams them through the portal.
//
// Never instantiate this directly. Use <PageHeader> which wraps this.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface PageHeaderPortalProps {
  desktop?: React.ReactNode;
  mobile?: React.ReactNode;
  children?: React.ReactNode;
}

export default function PageHeaderPortal({ desktop, mobile, children }: PageHeaderPortalProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById("shell-header-center"));
  }, []);

  if (!target) return null;

  return createPortal(
    <>
      {children && (
        <div className="shell-header-inject flex">{children}</div>
      )}
      {desktop && (
        <div className="shell-header-inject hidden lg:flex">{desktop}</div>
      )}
      {mobile && (
        <div className="shell-header-inject flex lg:hidden">{mobile}</div>
      )}
    </>,
    target,
  );
}
