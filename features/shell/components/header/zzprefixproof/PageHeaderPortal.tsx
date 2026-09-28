"use client";

// PageHeaderPortal — puts a route's header content into the header center slot
// (`#shell-header-center`, or a ChatCanvasWorkspace's own header).
//
// Never instantiate this directly. Use <PageHeader> (or RouteHeader / a
// template), which wraps this.
//
// The content is in the FIRST server HTML and moves into the slot at
// hydration with no shift and no remount — see ServerRenderedHeaderSlot.tsx.
// Guard: `__tests__/page-header-ssr.test.tsx`.

import { ServerRenderedHeaderSlot } from "./ServerRenderedHeaderSlot";

interface PageHeaderPortalProps {
  desktop?: React.ReactNode;
  mobile?: React.ReactNode;
  children?: React.ReactNode;
  fallback?: boolean;
}

export default function PageHeaderPortal({
  desktop,
  mobile,
  children,
  fallback = false,
}: PageHeaderPortalProps) {
  return (
    <ServerRenderedHeaderSlot
      slot="center"
      nodeProps={{
        className: "contents",
        "data-page-header-portal": fallback ? "fallback" : "page",
      }}
    >
      {children && <div className="shell-header-inject flex">{children}</div>}
      {desktop && (
        <div className="shell-header-inject hidden lg:flex">{desktop}</div>
      )}
      {mobile && (
        <div className="shell-header-inject flex lg:hidden">{mobile}</div>
      )}
    </ServerRenderedHeaderSlot>
  );
}
