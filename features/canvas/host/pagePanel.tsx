"use client";

/**
 * A page's own live panel, shown as a canvas tab (`page-panel`).
 *
 * Most canvas kinds rebuild their body from the tab's JSON data (a record id,
 * a note id), so they come back after a reload. Some panels cannot: a data
 * table's row inspector renders whatever the table's `detail.render` returns,
 * with the table's own callbacks; an admin page's "New rule" form edits the
 * page's own draft state. Their content IS the page's React tree.
 *
 * `<CanvasPagePanel>` keeps that tree where it is and draws it in a canvas tab:
 * the page renders the panel, the tab's body is an empty slot, and the panel's
 * children are portaled into it (a portal keeps the page's context, so every
 * callback works exactly as if it were rendered in place). Header actions go
 * into the pane header through the same seam (`KindHeaderSlot`), so the pane
 * header is the only chrome — no second title bar.
 *
 * Lifecycle, owned here once:
 *  - mount opens (or focuses) the tab, and so does every later `openRequest`
 *    (a repeat open of the same thing); a canvas that is not on screen is
 *    announced through `openCanvasItem` and the page is told it closed;
 *  - the person closing the tab calls the page's `onClose`;
 *  - the page unmounting (navigating away) closes the tab — its content is
 *    gone, so the tab never outlives it and never comes back after a reload.
 */

import { PanelRight } from "lucide-react";
import {
  isValidElement,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { canvasItemId, type CanvasJson } from "@ai-matrx/canvas";
import {
  defineCanvasKind,
  useOptionalCanvas,
  type AnyCanvasKind,
  type CanvasKindProps,
} from "@ai-matrx/canvas/react";
import { KindHeaderPortal, KindHeaderSlot } from "./kindHeaderSlot";
import { openCanvasItem } from "./openCanvasItem";

export const PAGE_PANEL_KIND = "page-panel";

// ── body slots: one DOM node per open tab, filled by the page's portal ──────

const STORE = Symbol.for("ai-matrx.host.canvas.page-panel-slots");

interface SlotStore {
  slots: Map<string, HTMLElement>;
  listeners: Set<() => void>;
}

function store(): SlotStore {
  const g = globalThis as unknown as { [STORE]?: SlotStore };
  g[STORE] ??= { slots: new Map(), listeners: new Set() };
  return g[STORE];
}

function setSlot(itemId: string, element: HTMLElement | null) {
  const slots = store().slots;
  if (element) {
    if (slots.get(itemId) === element) return;
    slots.set(itemId, element);
  } else if (!slots.delete(itemId)) {
    return;
  }
  for (const listener of [...store().listeners]) listener();
}

function subscribe(listener: () => void) {
  store().listeners.add(listener);
  return () => store().listeners.delete(listener);
}

function useBodySlot(itemId: string): HTMLElement | null {
  return useSyncExternalStore(
    subscribe,
    () => store().slots.get(itemId) ?? null,
    () => null,
  );
}

function PagePanelBody({ item }: CanvasKindProps) {
  const itemId = item.id;
  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-card"
      data-page-panel-slot={itemId}
      ref={(element) => {
        setSlot(itemId, element);
        return () => setSlot(itemId, null);
      }}
    />
  );
}

export const PAGE_PANEL_CANVAS_KIND: AnyCanvasKind = defineCanvasKind({
  id: PAGE_PANEL_KIND,
  surface: "dom",
  label: "Panel",
  icon: PanelRight,
  component: PagePanelBody,
  // The content is the page's live tree: it cannot come back after a reload.
  restore: false,
  HeaderAction: KindHeaderSlot,
});

// ── the page side ───────────────────────────────────────────────────────────

export interface CanvasPagePanelProps {
  /**
   * Names the thing the tab shows (`link-policy:<table>`). Opening the same
   * key again focuses its tab. Absent: one tab per mounted panel.
   */
  panelKey?: string;
  /** The tab's title, and its accessible name. */
  title: string;
  /** A rich title (an `EntityRef` door), shown at the top of the body. */
  titleNode?: ReactNode;
  description?: ReactNode;
  headerActions?: ReactNode;
  onClose: () => void;
  /**
   * Moves on every open request from the page, including a repeat open of the
   * thing already shown (a data table re-clicking the same row). A change
   * brings this tab forward, even when the title did not move.
   */
  openRequest?: number;
  children: ReactNode;
}

/** The canvas item id a `<CanvasPagePanel panelKey>` opens. */
export function pagePanelItemId(panelKey: string) {
  return canvasItemId(PAGE_PANEL_KIND, panelKey);
}

export function CanvasPagePanel({
  panelKey,
  title,
  titleNode,
  description,
  headerActions,
  onClose,
  openRequest,
  children,
}: CanvasPagePanelProps) {
  const canvas = useOptionalCanvas();
  // useId's punctuation is not a safe key character; the letters are unique.
  const instanceKey = `panel-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const key = panelKey ?? instanceKey;
  const itemId = pagePanelItemId(key);

  const latest = useRef({ title, onClose });
  useEffect(() => {
    latest.current = { title, onClose };
  });

  useEffect(() => {
    const opened = openCanvasItem(canvas, {
      kind: PAGE_PANEL_KIND,
      key,
      title: latest.current.title,
      data: null satisfies CanvasJson,
    });
    if (!canvas || !opened) {
      // Announced by openCanvasItem; the page must not keep a panel "open" nobody sees.
      latest.current.onClose();
      return;
    }
    let open = true;
    const stop = canvas.store.subscribe(() => {
      if (open && !canvas.getState().items[opened]) {
        open = false;
        latest.current.onClose();
      }
    });
    return () => {
      stop();
      if (open) {
        open = false;
        canvas.close(opened);
      }
    };
  }, [canvas, key]);

  // A new title means the page now shows another thing (another row): bring
  // the tab forward with its new name.
  useEffect(() => {
    if (!canvas || !canvas.getState().items[itemId]) return;
    if (canvas.getState().items[itemId]?.title === title) return;
    canvas.open({ kind: PAGE_PANEL_KIND, key, title });
  }, [canvas, itemId, key, title]);

  // The page asked to open again (the same row clicked while its tab sat in
  // the background): the title did not move, so the effect above stays quiet.
  // The mount already opened the tab, so only a later change counts.
  const seenRequest = useRef(openRequest);
  useEffect(() => {
    if (openRequest === seenRequest.current) return;
    seenRequest.current = openRequest;
    if (!canvas || !canvas.getState().items[itemId]) return;
    canvas.open({ kind: PAGE_PANEL_KIND, key, title: latest.current.title });
  }, [canvas, itemId, key, openRequest]);

  const slot = useBodySlot(itemId);
  const richTitle = isValidElement(titleNode) ? titleNode : null;

  return (
    <>
      {headerActions ? <KindHeaderPortal itemId={itemId}>{headerActions}</KindHeaderPortal> : null}
      {slot
        ? createPortal(
            <>
              {richTitle || description ? (
                <div className="flex min-w-0 shrink-0 flex-col gap-0.5 border-b border-border px-3 py-2">
                  {richTitle ? <div className="min-w-0 truncate text-sm font-medium">{richTitle}</div> : null}
                  {description ? (
                    <div className="min-w-0 truncate text-xs text-muted-foreground">{description}</div>
                  ) : null}
                </div>
              ) : null}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
            </>,
            slot,
          )
        : null}
    </>
  );
}
