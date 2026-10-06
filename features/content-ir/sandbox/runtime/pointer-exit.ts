/**
 * pointer-exit — tell the frame's document that the pointer has LEFT it.
 *
 * THE BUG (2026-10-06, "tooltips show up in random parts of the page"). An
 * overlay that stays open while the pointer travels from its trigger toward
 * it does not close on the trigger's `pointerleave`; it closes on the NEXT
 * `pointermove` the document sees outside its "grace area". Radix Tooltip
 * works this way (every `@/components/ui/tooltip` in a Shape), and so do
 * Radix menu submenus and Floating UI's `safePolygon` (on `mousemove`).
 *
 * In the page that next move always comes: the pointer is still over the same
 * document. In the sandbox frame it does not. When the pointer leaves the
 * frame in one motion — a flick off a chip near the frame's edge, which is any
 * chip a fast hand crosses — the frame gets the leave event and then NOTHING,
 * because every later move lands on the host document. The tooltip stays open
 * for as long as the reader is anywhere else on the page, and a chat with
 * several framed Shapes collects a stale tooltip in each. Measured in headless
 * Chromium: the same flick closes the tooltip in-page and leaves it open
 * framed, indefinitely.
 *
 * THE FIX. When the pointer leaves this document, dispatch the move the
 * document would have seen if it could: one `pointermove` and one `mousemove`
 * at a point no element of this document can contain. Every document-level
 * pointer tracker reads it as "the pointer is somewhere else now" and closes,
 * exactly as it does in the page. No library is patched and no overlay is
 * named — a new one inherits the fix.
 *
 * Frame-only: installed from `startInstance` once a real host has handed this
 * document its port, never by the bare harness or a gate-OFF mount, which run
 * the same bundle inside an ordinary page.
 */

/** Far outside any rect this document can lay out, in either direction. */
export const POINTER_EXIT_COORDINATE = -1_000_000;

/** When the exit move is sent after the pointer leaves (see `onLeave`). */
const EXIT_DISPATCH_DELAYS_MS = [16, 150] as const;

const INSTALLED = Symbol.for("@matrx/kind-sandbox/pointer-exit");

type DocumentWithFlag = Document & { [INSTALLED]?: () => void };

export function installPointerExit(doc: Document = document): () => void {
    const flagged = doc as DocumentWithFlag;
    const existing = flagged[INSTALLED];
    if (existing) return existing;

    const root = doc.documentElement;
    const win = doc.defaultView;

    let timers: Array<ReturnType<typeof setTimeout>> = [];
    const cancel = () => {
        for (const t of timers) clearTimeout(t);
        timers = [];
    };

    const dispatchExit = (event: PointerEvent) => {
        if (!win) return;
        const init = {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: POINTER_EXIT_COORDINATE,
            clientY: POINTER_EXIT_COORDINATE,
            screenX: POINTER_EXIT_COORDINATE,
            screenY: POINTER_EXIT_COORDINATE,
        };
        root.dispatchEvent(
            new win.PointerEvent("pointermove", {
                ...init,
                pointerId: event.pointerId,
                pointerType: event.pointerType,
                isPrimary: event.isPrimary,
            }),
        );
        root.dispatchEvent(new win.MouseEvent("mousemove", init));
    };

    const onLeave = (event: PointerEvent) => {
        // `pointerleave` does not bubble, so on the root it fires exactly
        // once: when the pointer leaves the whole document.
        if (event.target !== root) return;
        cancel();
        // NOT synchronously. The trigger's own leave handler is what ARMS the
        // tracker (Radix sets its grace area in state and attaches the
        // document `pointermove` listener in an effect), and that commit has
        // not happened while this leave event is still being dispatched — a
        // move sent now reaches no listener (measured). One move after the
        // next task, and one after any slower commit, so the exit is seen.
        for (const delay of EXIT_DISPATCH_DELAYS_MS) {
            timers.push(setTimeout(() => dispatchExit(event), delay));
        }
    };
    // Back before the moves were sent: the pointer is here again, and the
    // real moves it makes now are the truth.
    const onEnter = (event: PointerEvent) => {
        if (event.target === root) cancel();
    };

    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("pointerenter", onEnter);
    const uninstall = () => {
        cancel();
        root.removeEventListener("pointerleave", onLeave);
        root.removeEventListener("pointerenter", onEnter);
        delete flagged[INSTALLED];
    };
    flagged[INSTALLED] = uninstall;
    return uninstall;
}
