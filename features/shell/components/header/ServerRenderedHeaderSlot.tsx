"use client";

// ServerRenderedHeaderSlot — puts route content into a shell header slot
// (center: `#shell-header-center`; right: `#shell-header-right`) so that it is
// in the FIRST server HTML. Used by PageHeaderPortal and PageHeaderRightPortal;
// never by pages directly.
//
// 🚨 WHY (2026-09-27): a portal cannot be server-rendered, so every page's
// title, back button and header actions used to arrive ~1s late — the header
// painted empty, then popped in once scripts ran: a flash and a layout shift
// on every (core) page. Two ways in now:
//
//   SERVER + HYDRATION ("inline"): the content renders IN PLACE inside a
//   hidden anchor (`data-page-header-ssr`), followed by a tiny inline script.
//   While the HTML is still parsing, the script clones the content into a
//   body-level ghost (`<matrx-header-ghost>`) laid exactly over the slot, so it
//   paints with the first HTML. A right-slot ghost also RESERVES its width in
//   the header row (a <style> in <head>), so the center slot has its final
//   width before the center ghost is laid out. After hydration a layout effect
//   MOVES the real, hydrated node into the slot and drops the ghost and the
//   reservation in the same frame: same markup, same box, nothing shifts, and
//   nothing remounts (switching to createPortal would remount every control).
//   On unmount the node goes back into its anchor so React removes it where it
//   rendered it.
//
//   CLIENT NAVIGATION ("portal"): nothing to hydrate — the target is found in
//   a layout effect (after commit, so a departing page's workspace slot is
//   never picked) and the content portals in before the first paint.
//
// The ghost lives in <body>, outside every page stacking context, so the
// header's opaque scrim never covers it; React skips unknown <body>/<head>
// children when it hydrates.
//
// Guard: `__tests__/page-header-ssr.test.tsx`.

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type HeaderSlotName = "center" | "right";

/** Where each slot's content goes. Inside a ChatCanvasWorkspace the shell
 *  header is hidden (canvas chrome) and the workspace header carries it. */
export const HEADER_SLOT_TARGETS: Record<HeaderSlotName, readonly string[]> = {
  center: ['[data-page-header-target="workspace"]', "#shell-header-center"],
  right: ['[data-page-header-right-target="workspace"]', "#shell-header-right"],
};

export function findHeaderSlot(slot: HeaderSlotName): HTMLElement | null {
  for (const selector of HEADER_SLOT_TARGETS[slot]) {
    const found = document.querySelector<HTMLElement>(selector);
    if (found) return found;
  }
  return null;
}

/**
 * Runs while the HTML is parsing, before any bundle. Defined once on window,
 * called by every anchor's script. ES5, dependency-free.
 *   - lays the hidden anchor over the slot (hydrated controls measure real widths)
 *   - clones the content into the slot's body-level ghost layer
 *   - right slot: reserves the ghost's width in the header row, skipped on a
 *     phone (the controls go to the shell's ⋮ sheet there) unless in a workspace
 *   - re-lays every ghost layer, so a center ghost laid out before a right
 *     reservation still lands on the slot's final box
 */
export const HEADER_GHOST_SCRIPT = `(window.__matrxHeaderGhost||(window.__matrxHeaderGhost=function(s){try{var a=s&&s.previousElementSibling;if(!a||!a.hasAttribute("data-page-header-ssr"))return;var slot=a.getAttribute("data-header-slot"),sel=a.getAttribute("data-header-slot-targets").split("|"),t=null,i;for(i=0;i<sel.length&&!t;i++)t=document.querySelector(sel[i]);if(!t)return;var ws=t.hasAttribute("data-page-header-target")||t.hasAttribute("data-page-header-right-target");if(slot==="right"&&!ws&&window.matchMedia("(max-width: 767px)").matches)return;var c=a.firstElementChild&&a.firstElementChild.cloneNode(true);if(!c)return;var g=t.__matrxGhost;if(!g||!g.isConnected){g=document.createElement("matrx-header-ghost");g.className="page-header-ghost "+(slot==="right"?"page-header-ghost-right":"shell-header-center");g.setAttribute("aria-hidden","true");g.setAttribute("inert","");g.__matrxTarget=t;document.body.appendChild(g);t.__matrxGhost=g}c.setAttribute("data-page-header-ghost",a.getAttribute("data-page-header-ssr"));g.appendChild(c);if(slot==="right"){var id=t.id||"workspace-right",st=document.head.querySelector('style[data-page-header-reserve="'+id+'"]');if(!st){st=document.createElement("style");st.setAttribute("data-page-header-reserve",id);document.head.appendChild(st)}g.style.width="auto";st.textContent=(t.id?"#"+t.id:'[data-page-header-right-target="workspace"]')+"{min-width:"+Math.ceil(g.scrollWidth)+"px}"}var L=document.querySelectorAll("matrx-header-ghost");for(i=0;i<L.length;i++){var x=L[i],tt=x.__matrxTarget;if(!tt)continue;var r=tt.getBoundingClientRect();x.style.display=r.width?"":"none";x.style.left=r.left+"px";x.style.top=r.top+(x.className.indexOf("right")>-1?r.height/2:0)+"px";x.style.width=r.width+"px"}var R=t.getBoundingClientRect();a.style.left=R.left+"px";a.style.top=R.top+"px";a.style.width=R.width+"px"}catch(e){}}))(document.currentScript);`;

/** Drop one header's ghost, its layer once empty, and a right slot's reservation. */
function removeGhost(id: string, slot: HeaderSlotName, target: HTMLElement | null) {
  document
    .querySelectorAll<HTMLElement>(`[data-page-header-ghost="${CSS.escape(id)}"]`)
    .forEach((node) => {
      const layer = node.parentElement;
      node.remove();
      if (layer?.tagName === "MATRX-HEADER-GHOST" && layer.childElementCount === 0) {
        layer.remove();
      }
    });
  if (slot === "right") {
    // The real node now holds the width the reservation stood in for.
    const key = target?.id || "workspace-right";
    document.head
      .querySelector(`style[data-page-header-reserve="${CSS.escape(key)}"]`)
      ?.remove();
  }
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

interface ServerRenderedHeaderSlotProps {
  slot: HeaderSlotName;
  /** Props of the node that lands in the slot (the node the portal used to render). */
  nodeProps: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | undefined>;
  children: ReactNode;
}

export function ServerRenderedHeaderSlot({
  slot,
  nodeProps,
  children,
}: ServerRenderedHeaderSlotProps) {
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
  const nodeRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const node = nodeRef.current;
    const anchor = anchorRef.current;
    let observer: MutationObserver | null = null;
    let placedIn: HTMLElement | null = null;

    const place = (found: HTMLElement) => {
      if (mode === "portal") {
        setTarget(found);
        return;
      }
      if (!node) return;
      // Until the client's own snapshots land (phone breakpoint, the phone ⋮
      // host), keep the ghost's phone look — see `.page-header-ghost` CSS.
      node.setAttribute("data-page-header-settling", "");
      found.appendChild(node);
      placedIn = found;
      removeGhost(ssrId, slot, found);
    };

    // The slot is server-rendered by the shell <Header>, so it is normally
    // there already. Never wait a requestAnimationFrame for it: a frame never
    // comes while the tab is hidden (a background tab, an agent's browser).
    // If the slot mounts later, watch for it.
    const now = findHeaderSlot(slot);
    if (now) {
      place(now);
    } else {
      observer = new MutationObserver(() => {
        const found = findHeaderSlot(slot);
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
      if (node && anchor && node.parentNode !== anchor) anchor.appendChild(node);
      removeGhost(ssrId, slot, placedIn);
    };
  }, [mode, slot, ssrId]);

  // Hydration's server-snapshot values (useIsMobile → false) are replaced in
  // the passive-effect flush; this runs in that same flush, so no frame shows
  // the desktop row on a phone.
  useEffect(() => {
    nodeRef.current?.removeAttribute("data-page-header-settling");
  }, []);

  const node = (
    <div ref={nodeRef} {...nodeProps}>
      {children}
    </div>
  );

  if (mode === "portal") {
    return target ? createPortal(node, target) : null;
  }

  return (
    <>
      <div
        ref={anchorRef}
        data-page-header-ssr={ssrId}
        data-header-slot={slot}
        data-header-slot-targets={HEADER_SLOT_TARGETS[slot].join("|")}
        className="page-header-ssr"
        // The pre-hydration script sets left/top/width on it; keep them.
        suppressHydrationWarning
      >
        {node}
      </div>
      <script dangerouslySetInnerHTML={{ __html: HEADER_GHOST_SCRIPT }} />
    </>
  );
}
