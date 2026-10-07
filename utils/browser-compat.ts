/**
 * browser-compat.ts
 *
 * Safe wrappers for browser APIs that are not universally supported.
 *
 * WHY THIS EXISTS:
 * Chrome supports many experimental/newer APIs that Safari does not, causing
 * runtime ReferenceErrors in Safari (not caught by TypeScript because the type
 * definitions still exist). Always use these wrappers instead of calling the
 * raw globals directly.
 *
 * Current known gaps (as of 2026):
 *  - requestIdleCallback / cancelIdleCallback: Missing in Safari < 16.4
 *  - navigator.clipboard.read(): reach it through @ai-matrx/kit/clipboard (`readImage` / `readText`), never directly
 *  - showOpenFilePicker / showSaveFilePicker: Chrome-only, not in Safari
 */

// ─── requestIdleCallback ────────────────────────────────────────────────────
// Safari added this in 16.4 (Sep 2022) but many users still run older versions.
// Fallback: setTimeout with a short delay gives similar "low-priority" behavior.

type IdleCallbackHandle = number;

export function safeRequestIdleCallback(
    callback: IdleRequestCallback,
    options?: IdleRequestOptions
): IdleCallbackHandle {
    if (typeof requestIdleCallback === 'function') {
        return requestIdleCallback(callback, options);
    }
    // Polyfill: run after current call stack clears, mimic the deadline object
    const timeout = options?.timeout ?? 50;
    return window.setTimeout(() => {
        const start = Date.now();
        callback({
            didTimeout: false,
            timeRemaining: () => Math.max(0, timeout - (Date.now() - start)),
        });
    }, 1) as unknown as IdleCallbackHandle;
}

export function safeCancelIdleCallback(handle: IdleCallbackHandle): void {
    if (typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(handle);
    } else {
        clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
    }
}

// ─── showOpenFilePicker ─────────────────────────────────────────────────────
// Chrome-only. Not available in Safari or Firefox (as of 2026).
// Check before use — callers should fall back to <input type="file">.

/** Chrome-only File System Access API — not in the standard `Window` lib types. */
interface WindowWithFileSystemAccess extends Window {
    showOpenFilePicker?: (...args: unknown[]) => Promise<unknown>;
}

export function supportsFileSystemAccess(): boolean {
    return typeof (window as WindowWithFileSystemAccess).showOpenFilePicker === 'function';
}
