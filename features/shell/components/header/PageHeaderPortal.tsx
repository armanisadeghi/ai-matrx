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
  fallback?: boolean;
}

export default function PageHeaderPortal({
  desktop,
  mobile,
  children,
  fallback = false,
}: PageHeaderPortalProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  // The slot is server-rendered by the shell <Header>, so it exists when this
  // effect runs — take it at once. It used to wait one requestAnimationFrame,
  // and a frame never comes while the tab is hidden (a link opened in a
  // background tab, a phone switched to another app, an agent's background
  // browser): the route's header controls — Markdown Studio's mode switch —
  // stayed missing until the tab was shown. If the slot is not there yet
  // (a shell that mounts later), watch for it instead of guessing a delay.
  useEffect(() => {
    const find = () => document.getElementById("shell-header-center");
    const now = find();
    if (now) {
      setTarget(now);
      return;
    }
    const observer = new MutationObserver(() => {
      const found = find();
      if (found) {
        observer.disconnect();
        setTarget(found);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!target) return null;

  return createPortal(
    <div
      className="contents"
      data-page-header-portal={fallback ? "fallback" : "page"}
    >
      {children && (
        <div className="shell-header-inject flex">{children}</div>
      )}
      {desktop && (
        <div className="shell-header-inject hidden lg:flex">{desktop}</div>
      )}
      {mobile && (
        <div className="shell-header-inject flex lg:hidden">{mobile}</div>
      )}
    </div>,
    target,
  );
}
