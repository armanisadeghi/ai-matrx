/**
 * frame-storage — what `localStorage` and `sessionStorage` MEAN inside the
 * sandbox frame.
 *
 * TWO REASONS THIS EXISTS, and neither is cosmetic:
 *
 *  1. **It would throw.** The frame is `sandbox="allow-scripts"` with no
 *     `allow-same-origin`, so its origin is opaque and every browser refuses
 *     `localStorage` on an opaque origin with a `SecurityError`. A library
 *     that merely READS a default — `react-resizable-panels` defaults its
 *     `storage` option to `localStorage` — would take the component down with
 *     it.
 *  2. **Durable state has no business here** (V-27 finding D, 2026-09-12). The
 *     frame's entire state is the props its host sends. A component that
 *     remembered something across renders would be remembering it in a place
 *     nobody can see, audit, or clear.
 *
 * So the build REPLACES both globals with this object (esbuild `define` +
 * `inject`), and the artifact audit then refuses the real names in the served
 * bytes. Reads answer empty; a write announces itself once with the reason
 * (Law 4 — never a silent no-op).
 */

let announced = false;

function announce(op: string, key: string): void {
    if (announced) return;
    announced = true;
    // eslint-disable-next-line no-console
    console.warn(
        `[kind-sandbox] This component tried to ${op} "${key}" in browser storage. ` +
            "Components rendered inside the Shape sandbox have no storage of their own — " +
            "their whole state is the data the page sends them. Nothing was saved, and " +
            "nothing else is affected.",
    );
}

export const __matrxFrameStorage: Storage = {
    get length(): number {
        return 0;
    },
    clear(): void {
        announce("clear", "(all keys)");
    },
    getItem(): string | null {
        return null;
    },
    key(): string | null {
        return null;
    },
    removeItem(key: string): void {
        announce("remove", key);
    },
    setItem(key: string): void {
        announce("save", key);
    },
};
