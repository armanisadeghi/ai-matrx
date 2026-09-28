"use client";

// PageHeaderRightPortal — puts route controls into the header right slot
// (#shell-header-right), immediately left of the shell's own right set. Inside
// a ChatCanvasWorkspace (canvas chrome hides the shell header) it goes into the
// workspace header's right slot instead.
//
// The controls are in the FIRST server HTML, and their width is reserved in the
// header row before the center is laid out, so nothing in the header shifts
// when the client takes over — see ServerRenderedHeaderSlot.tsx.

import { useEffect, useId, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { setPhonePageActionCount, usePhonePageActions } from "./phone-page-actions";
import { PhoneSheetAction } from "./RouteHeader";
import { flattenActions } from "./route-header-layout";
import { findHeaderSlot, ServerRenderedHeaderSlot } from "./ServerRenderedHeaderSlot";

interface PageHeaderRightPortalProps {
  children: React.ReactNode;
}

export default function PageHeaderRightPortal({
  children,
}: PageHeaderRightPortalProps) {
  const [inWorkspace, setInWorkspace] = useState(false);
  useLayoutEffect(() => {
    setInWorkspace(findHeaderSlot("right")?.dataset.pageHeaderRightTarget === "workspace");
  }, []);

  // ONE OVERFLOW PER PHONE HEADER (page-pass shared defects, 2026-09-27):
  // below 768px the page's right-slot controls go into the shell's ⋮ sheet
  // ("This page"), exactly as RouteHeader's actions do — never beside it.
  const isPhone = useIsMobile();
  const { host } = usePhonePageActions();
  const toSheet = isPhone && !inWorkspace && host != null;
  const owner = useId();
  useEffect(() => {
    setPhonePageActionCount(owner, toSheet ? 1 : 0);
    return () => setPhonePageActionCount(owner, 0);
  }, [owner, toSheet]);

  if (toSheet && host) {
    return createPortal(
      // One named row per control, as RouteHeader's actions are.
      <div data-page-header-right-phone className="flex flex-col gap-0.5">
        {flattenActions(children).map((a) => (
          <PhoneSheetAction key={a.key} action={a} />
        ))}
      </div>,
      host,
    );
  }

  return (
    <ServerRenderedHeaderSlot
      slot="right"
      nodeProps={{ className: "shell-header-inject flex" }}
    >
      {children}
    </ServerRenderedHeaderSlot>
  );
}
