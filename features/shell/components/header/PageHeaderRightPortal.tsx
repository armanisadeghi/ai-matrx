"use client";

// PageHeaderRightPortal — Client-only portal for the header right slot
// (#shell-header-right), immediately left of the user avatar. Inside a
// ChatCanvasWorkspace (canvas chrome hides the shell header) it portals into
// the workspace header's right slot instead.

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { setPhonePageActionCount, usePhonePageActions } from "./phone-page-actions";

interface PageHeaderRightPortalProps {
  children: React.ReactNode;
}

export default function PageHeaderRightPortal({
  children,
}: PageHeaderRightPortalProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(
      document.querySelector<HTMLElement>('[data-page-header-right-target="workspace"]') ??
        document.getElementById("shell-header-right"),
    );
  }, []);

  // ONE OVERFLOW PER PHONE HEADER (page-pass shared defects, 2026-09-27):
  // below 768px the page's right-slot controls go into the shell's ⋮ sheet
  // ("This page"), exactly as RouteHeader's actions do — never beside it.
  const isPhone = useIsMobile();
  const { host } = usePhonePageActions();
  const inWorkspace = target?.dataset.pageHeaderRightTarget === "workspace";
  const toSheet = isPhone && !inWorkspace && host != null;
  const owner = useId();
  useEffect(() => {
    setPhonePageActionCount(owner, toSheet ? 1 : 0);
    return () => setPhonePageActionCount(owner, 0);
  }, [owner, toSheet]);

  if (toSheet && host) {
    return createPortal(
      <div data-page-header-right-phone className="flex flex-wrap items-center px-1">
        {children}
      </div>,
      host,
    );
  }

  if (!target) return null;

  return createPortal(
    <div className="shell-header-inject flex">{children}</div>,
    target,
  );
}
