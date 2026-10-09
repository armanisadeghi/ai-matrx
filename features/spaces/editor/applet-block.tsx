"use client";

// features/spaces/editor/applet-block.tsx — a live Applet inside a Space page (Embeds › Applet; the "one roof"
// first piece, Arman 2026-10-09). Stored as `applet {appletId, height?}` (lib/spaces-blocks). "/applet" opens the
// picker first (applet-picker.tsx) and the block lands only once an Applet is chosen, so no half-made block is
// ever saved.
//
// EDITOR-LIVE, PUBLIC-STATIC (attack U1/C3): in the app the block mounts the Applet through the ONE host
// (`AppletInPageLazy`, `embedded`) in a reserved-height frame, once the block scrolls into view. On a published
// Site (`publicSite`) it draws the static `AppletCardLazy` instead — the page reads as its publisher while a live
// Applet would read as the visitor, and guest data (G1) is not shipped. FOLLOW-UP "live Applets on Sites, gated on
// G1 guest data": swap the card for `AppletInPageLazy` at the marked switch below once G1 lands.
//
// Hover bar (editable): Open Applet (new tab, the full www link) · Change with AI (the Applet's builder) · Remove.
// The bottom edge drags the reserved height.

import { ArrowUpRight, MessageSquare, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { appletBuilderHref, appletWebUrl, AppletCardLazy, AppletInPageLazy, readAppletCards, type AppletCardInfo } from "@/features/applets/embed/appletsPort";
import { APPLET_BLOCK_MIN_HEIGHT } from "@/lib/spaces-blocks/types";

import { readPublishState } from "../publish/publish-doors";
import { useSpaces } from "../state/SpacesProvider";
import { AppletFrame, appletBlockHeight } from "./applet-frame";
import { storedSpec } from "./stored-blocks";

type Ctx = { blockId: string; editor: never; update: (next: Record<string, unknown>) => void };

/** True once the element has come within a screen of the viewport (the Applet loads no earlier). */
function useNearView(): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "100% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return [ref, near];
}

/** Whether the open page is published to the web (the editor's Publish notice); false until known. */
function usePagePublished(spaceId: string | undefined, ask: boolean): boolean {
  const [published, setPublished] = useState(false);
  useEffect(() => {
    if (!spaceId || !ask) return;
    let live = true;
    readPublishState(spaceId).then(
      (s) => live && setPublished(s.published),
      () => live && setPublished(false),
    );
    return () => {
      live = false;
    };
  }, [spaceId, ask]);
  return published;
}

function AppletBlockView({ p, ctx }: { p: Record<string, unknown>; ctx: Ctx }) {
  const editor = ctx.editor as unknown as { isEditable: boolean; removeBlocks: (ids: string[]) => void };
  const editable = editor.isEditable;
  const appletId = typeof p.appletId === "string" ? p.appletId : "";
  const stored = appletBlockHeight(p);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const height = dragHeight ?? stored;
  const { publicSite } = useSpaces();
  const params = useParams<{ spaceId?: string }>();
  const [ref, near] = useNearView();
  const pagePublished = usePagePublished(params?.spaceId, editable && near && !publicSite);
  const [info, setInfo] = useState<AppletCardInfo | null>(null);
  const drag = useRef<{ y: number; h: number } | null>(null);
  // "Open Applet" needs only the Applet's slug: read it at once (one small row), never after the live Applet's chunk
  // loads and the block scrolls near (live 2026-10-09: the link sat disabled ~10 s after load).
  useEffect(() => {
    if (!editable || publicSite || !appletId) return;
    let live = true;
    readAppletCards([appletId]).then(
      (cards) => {
        const hit = cards.get(appletId);
        if (live && hit) setInfo(hit);
      },
      (err: unknown) => console.error("[applet-block] the Applet could not be read", appletId, err),
    );
    return () => {
      live = false;
    };
  }, [editable, publicSite, appletId]);

  // SWITCH POINT (public-static): a published Site shows the card, never the live Applet, until G1 guest data ships.
  if (publicSite)
    return (
      <div className="spaces-applet" contentEditable={false} data-applet-block={appletId} data-mode="card">
        <AppletCardLazy appId={appletId} />
      </div>
    );

  return (
    <div ref={ref} className="spaces-applet" contentEditable={false} data-applet-block={appletId} data-mode="live">
      {near ? <AppletInPageLazy appId={appletId} height={height} pagePublished={pagePublished} onInfo={setInfo} /> : <AppletFrame height={height} />}
      {editable ? (
        <>
          <div className="spaces-applet-tools" onMouseDown={(e) => e.stopPropagation()}>
            <a href={info ? appletWebUrl(info.slug) : undefined} target="_blank" rel="noreferrer" aria-disabled={!info || undefined} aria-busy={!info || undefined} title={info ? undefined : "Finding the Applet…"} data-testid="applet-open">
              <ArrowUpRight size={13} /> Open Applet
            </a>
            <a href={appletBuilderHref(appletId)} target="_blank" rel="noreferrer" data-testid="applet-change">
              <MessageSquare size={13} /> Change with AI
            </a>
            <button type="button" onClick={() => editor.removeBlocks([ctx.blockId])} data-testid="applet-remove">
              <Trash2 size={13} /> Remove
            </button>
          </div>
          <span
            className="spaces-applet-handle"
            aria-hidden
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { y: e.clientY, h: height };
            }}
            onPointerMove={(e) => {
              if (drag.current) setDragHeight(Math.max(APPLET_BLOCK_MIN_HEIGHT, Math.round(drag.current.h + e.clientY - drag.current.y)));
            }}
            onPointerUp={() => {
              if (!drag.current) return;
              drag.current = null;
              if (dragHeight !== null && dragHeight !== stored) ctx.update({ ...p, height: dragHeight });
              setDragHeight(null);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

export const AppletBlock = storedSpec("applet", (p, ctx) => <AppletBlockView p={p} ctx={ctx} />);
