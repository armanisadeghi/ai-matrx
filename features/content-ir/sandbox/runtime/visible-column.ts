/**
 * visible-column — overlays inside the frame stay inside the part of the frame
 * the reader can SEE.
 *
 * THE GEOMETRY (S5b, `protocol.ts` § THE READER'S VIEWPORT). The iframe element
 * is as wide as the reader's window, so media queries and `100vw` answer the
 * same question they answer in the page; the host clips it to the component's
 * own column, and `#root` is laid out at that column's width. So everything
 * right of `contentWidth` exists in this document and is never shown.
 *
 * THE BUG (2026-10-06, "tooltips render in random parts of the page").
 * Everything that places an overlay asked the WINDOW how much room there is,
 * and the window is wider than what is visible:
 *   - Floating UI (every Radix tooltip, popover, dropdown, select, hover card)
 *     flips and shifts against `visualViewport.width` — so a tooltip on a
 *     button at the column's right edge happily overhangs into the clipped
 *     region and is cut in half;
 *   - a centred overlay (`fixed left-1/2`, a dialog) centres on the window,
 *     i.e. half of it lands past the column;
 *   - a script-placed overlay (the design-system title takeover clamps to
 *     `innerWidth`) overhangs exactly like the first.
 *
 * THE FIX, one layer for all three:
 *   1. `visualViewport.width` answers the column — it is, literally, the
 *      visible part of this document's layout viewport. `innerWidth`,
 *      `matchMedia` and `100vw` are untouched, so S5b's breakpoints hold.
 *   2. `<body>` is the column-wide containing block for fixed descendants
 *      (`contain: layout`), so a portalled overlay's `inset-0`, `left-1/2` and
 *      `w-full` resolve against the column. The frame never scrolls and body
 *      sits at the viewport origin, so no coordinate moves.
 *   3. A last-resort clamp: any overlay portalled to `<body>` that still
 *      overhangs the column (a script-placed one that measured the window) is
 *      nudged back with the CSS `translate` property, which composes with —
 *      and is never overwritten by — the library's own `transform`.
 *
 * Frame-only: installed from `startInstance` after a real host init.
 */

/** Clearance kept between an overlay and the column's edge (Floating UI's own default padding is 0–8). */
export const COLUMN_EDGE_PX = 8;

export interface VisibleColumn {
    /** The width the host allotted this component (S5b `contentWidth`). */
    setWidth(width: number): void;
    uninstall(): void;
}

const INSTALLED = Symbol.for("@matrx/kind-sandbox/visible-column");
type DocumentWithFlag = Document & { [INSTALLED]?: VisibleColumn };

export function installVisibleColumn(doc: Document = document): VisibleColumn {
    const flagged = doc as DocumentWithFlag;
    const existing = flagged[INSTALLED];
    if (existing) return existing;

    const win = doc.defaultView;
    const body = doc.body;
    let columnWidth = 0;

    // ── 1. visualViewport.width is the column ───────────────────────────
    const viewport = win?.visualViewport ?? null;
    const VisualViewportCtor = (win as (Window & { VisualViewport?: { prototype: object } }) | null)
        ?.VisualViewport;
    const nativeWidth = VisualViewportCtor
        ? Object.getOwnPropertyDescriptor(VisualViewportCtor.prototype, "width")?.get
        : undefined;
    if (viewport && nativeWidth) {
        Object.defineProperty(viewport, "width", {
            configurable: true,
            get(): number {
                const native = nativeWidth.call(viewport) as number;
                return columnWidth > 0 ? Math.min(native, columnWidth) : native;
            },
        });
    }

    // ── 3. the clamp ─────────────────────────────────────────────────────
    const shiftOf = (el: HTMLElement): number => {
        const parsed = parseFloat(el.style.translate || "0");
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const clamp = (el: HTMLElement) => {
        if (columnWidth <= 0 || el.id === "root") return;
        const position = win?.getComputedStyle(el).position;
        if (position !== "fixed" && position !== "absolute") return;
        const current = shiftOf(el);
        const rect = el.getBoundingClientRect();
        const left = rect.left - current;
        const right = rect.right - current;
        let shift = 0;
        // Only an overlay that FITS is moved; one wider than the column (a
        // full-width sheet) is the author's layout, not an overhang.
        if (rect.width > 0 && rect.width <= columnWidth - 2 * COLUMN_EDGE_PX) {
            if (right > columnWidth - COLUMN_EDGE_PX) shift = columnWidth - COLUMN_EDGE_PX - right;
            else if (left < 0) shift = COLUMN_EDGE_PX - left;
        }
        const next = shift === 0 ? "" : `${Math.round(shift)}px 0px`;
        if (el.style.translate !== next) el.style.translate = next;
    };

    const clampAll = () => {
        for (const child of Array.from(body.children)) {
            if (child instanceof (win?.HTMLElement ?? HTMLElement)) clamp(child);
        }
    };

    const watched = new WeakSet<Element>();
    const childObserver =
        typeof MutationObserver === "undefined"
            ? null
            : new MutationObserver((records) => {
                  for (const record of records) {
                      const target = record.target;
                      if (target instanceof HTMLElement && target.parentElement === body) {
                          clamp(target);
                      }
                  }
              });
    const watch = (el: Element) => {
        if (!childObserver || watched.has(el) || el.id === "root") return;
        watched.add(el);
        childObserver.observe(el, {
            attributes: true,
            attributeFilter: ["style", "data-state", "data-side", "class"],
        });
    };
    const bodyObserver =
        typeof MutationObserver === "undefined"
            ? null
            : new MutationObserver(() => {
                  for (const child of Array.from(body.children)) watch(child);
                  clampAll();
              });
    bodyObserver?.observe(body, { childList: true });
    // An entrance animation owns `transform` while it runs (the package's
    // popper motion animates scale + travel), so the box measured at open is
    // not the box the reader ends up seeing. Measure again once it settles.
    const onSettled = (event: Event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.parentElement === body) clamp(target);
    };
    body.addEventListener("animationend", onSettled, true);
    body.addEventListener("transitionend", onSettled, true);
    for (const child of Array.from(body.children)) watch(child);

    const api: VisibleColumn = {
        setWidth(width: number) {
            if (!Number.isFinite(width) || width <= 0) return;
            columnWidth = width;
            // ── 2. the column is the containing block for fixed overlays ──
            body.style.width = `${width}px`;
            body.style.contain = "layout";
            clampAll();
        },
        uninstall() {
            childObserver?.disconnect();
            bodyObserver?.disconnect();
            body.removeEventListener("animationend", onSettled, true);
            body.removeEventListener("transitionend", onSettled, true);
            if (viewport) delete (viewport as unknown as Record<string, unknown>).width;
            body.style.width = "";
            body.style.contain = "";
            delete flagged[INSTALLED];
        },
    };
    flagged[INSTALLED] = api;
    return api;
}
