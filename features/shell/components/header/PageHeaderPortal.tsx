"use client";

// PageHeaderPortal — puts a route's header content into the header center slot.
//
// Never instantiate this directly. Use <PageHeader> (or RouteHeader / a
// template), which wraps this.
//
// 🚨 THE HEADER IS IN THE FIRST SERVER HTML (2026-09-27). A portal cannot be
// server-rendered, so every page's title used to arrive ~1s late: the header
// painted empty, then the title and back button popped in once scripts ran —
// a flash and a layout shift on every (core) page. Two ways in now:
//
//   SERVER + HYDRATION ("inline"): the content renders IN PLACE, inside a
//   hidden anchor (`data-page-header-ssr`), followed by a tiny inline script.
//   While the HTML is still parsing, that script clones the content into a
//   body-level ghost (`<matrx-header-ghost>`) laid exactly over the header
//   slot, so the title paints with the first HTML. After hydration a layout
//   effect MOVES the real, hydrated node into the slot and drops the ghost in
//   the same frame — same markup, same box, nothing shifts, and nothing
//   remounts (a switch to createPortal would remount every header control).
//   On unmount the node goes back into its anchor so React removes it where
//   it left it.
//
//   CLIENT NAVIGATION ("portal"): nothing to hydrate — the target is found in
//   a layout effect (after commit, so a departing page's workspace slot is
//   never picked) and the content portals in before the first paint.
//
// Guard: `features/shell/components/header/__tests__/page-header-ssr.test.tsx`
// fails if a header's title is not in the server HTML.

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

interface PageHeaderPortalProps {
  desktop?: React.ReactNode;
  mobile?: React.ReactNode;
  children?: React.ReactNode;
  fallback?: boolean;
}

/** Inside a ChatCanvasWorkspace the shell header is hidden (canvas chrome);
 *  the workspace's own header carries the page's header content instead. */
function findTarget(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('[data-page-header-target="workspace"]') ??
    document.getElementById("shell-header-center")
  );
}

/**
 * Runs while the HTML is parsing (before any bundle): lays the hidden anchor
 * over the header slot (so hydrated controls measure real widths) and clones
 * its content into one body-level ghost per slot. The ghost lives in <body>,
 * outside every page stacking context, so the header's opaque scrim can never
 * cover it; React skips unknown body children when it hydrates.
 * Keep it dependency-free and ES5 — it runs before anything else exists.
 */
export const PAGE_HEADER_GHOST_SCRIPT = `(function(){try{var s=document.currentScript,a=s&&s.previousElementSibling;if(!a||!a.hasAttribute("data-page-header-ssr"))return;var t=document.querySelector('[data-page-header-target="workspace"]')||document.getElementById("shell-header-center");if(!t)return;var r=t.getBoundingClientRect();if(!r.width)return;a.style.left=r.left+"px";a.style.top=r.top+"px";a.style.width=r.width+"px";var g=t.__pageHeaderGhost;if(!g||!g.isConnected){g=document.createElement("matrx-header-ghost");g.className="shell-header-center page-header-ghost";g.setAttribute("aria-hidden","true");g.setAttribute("inert","");document.body.appendChild(g);t.__pageHeaderGhost=g}g.style.left=r.left+"px";g.style.top=r.top+"px";g.style.width=r.width+"px";var c=a.firstElementChild&&a.firstElementChild.cloneNode(true);if(!c)return;c.setAttribute("data-page-header-ghost",a.getAttribute("data-page-header-ssr"));g.appendChild(c)}catch(e){}})();`;

/** Drop this header's pre-hydration ghost (and the ghost layer once empty). */
function removeGhost(id: string) {
  document
    .querySelectorAll<HTMLElement>(`[data-page-header-ghost="${CSS.escape(id)}"]`)
    .forEach((node) => {
      const layer = node.parentElement;
      node.remove();
      if (layer?.tagName === "MATRX-HEADER-GHOST" && layer.childElementCount === 0) {
        layer.remove();
      }
    });
}

const noopSubscribe = () => () => {};
/** true on the server and during hydration; false for a client-only mount. */
function useServerOrHydrating(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => false,
    () => true,
  );
}

export default function PageHeaderPortal({
  desktop,
  mobile,
  children,
  fallback = false,
}: PageHeaderPortalProps) {
  const ssrId = useId();
  const serverOrHydrating = useServerOrHydrating();
  // Fixed for the component's life: hydration re-renders once with the
  // client snapshot, and switching then would remount every header control.
  const modeRef = useRef<"inline" | "portal" | null>(null);
  if (modeRef.current === null) {
    modeRef.current = serverOrHydrating ? "inline" : "portal";
  }
  const mode = modeRef.current;

  const anchorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const content = contentRef.current;
    const anchor = anchorRef.current;
    let observer: MutationObserver | null = null;

    const place = (slot: HTMLElement) => {
      if (mode === "portal") {
        setTarget(slot);
        return;
      }
      if (!content) return;
      // Until the client's own snapshots land (phone breakpoint, phone ⋮
      // host), keep the ghost's phone look — see `.page-header-ghost` CSS.
      content.setAttribute("data-page-header-settling", "");
      slot.appendChild(content);
      removeGhost(ssrId);
    };

    // The slot is server-rendered by the shell <Header>, so it is normally
    // there already. Never wait a requestAnimationFrame for it: a frame never
    // comes while the tab is hidden (a background tab, an agent's browser).
    // If the slot mounts later, watch for it.
    const now = findTarget();
    if (now) {
      place(now);
    } else {
      observer = new MutationObserver(() => {
        const found = findTarget();
        if (found) {
          observer?.disconnect();
          place(found);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      observer?.disconnect();
      if (mode !== "inline") return;
      // Hand the node back so React removes (or re-shows) it where it rendered it.
      if (content && anchor && content.parentNode !== anchor) {
        anchor.appendChild(content);
      }
      removeGhost(ssrId);
    };
  }, [mode, ssrId]);

  // Hydration's server-snapshot values (useIsMobile → false) are replaced in
  // the passive-effect flush; this runs in that same flush, so no frame shows
  // the desktop row on a phone.
  useEffect(() => {
    contentRef.current?.removeAttribute("data-page-header-settling");
  }, []);

  const content = (
    <div
      ref={contentRef}
      className="contents"
      data-page-header-portal={fallback ? "fallback" : "page"}
    >
      {children && <div className="shell-header-inject flex">{children}</div>}
      {desktop && (
        <div className="shell-header-inject hidden lg:flex">{desktop}</div>
      )}
      {mobile && (
        <div className="shell-header-inject flex lg:hidden">{mobile}</div>
      )}
    </div>
  );

  if (mode === "portal") {
    return target ? createPortal(content, target) : null;
  }

  return (
    <>
      <div
        ref={anchorRef}
        data-page-header-ssr={ssrId}
        className="page-header-ssr"
        // The pre-hydration script sets left/top/width on it; keep them.
        suppressHydrationWarning
      >
        {content}
      </div>
      <script dangerouslySetInnerHTML={{ __html: PAGE_HEADER_GHOST_SCRIPT }} />
    </>
  );
}
