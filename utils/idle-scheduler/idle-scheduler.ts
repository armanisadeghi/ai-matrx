/**
 * IdleScheduler — A priority-aware deferred execution system for Next.js App Router.
 *
 * Architecture:
 * - Module-level singleton (NOT React context) — registrations cause zero re-renders
 * - Components register lightweight callbacks with priority 1-5
 * - The scheduler waits for the browser to be truly idle after full page render
 * - Then flushes all registered callbacks in priority order
 *
 * Priority levels:
 *   1 = Highest (first of the "last things") — e.g., analytics init, critical measurements
 *   2 = High — e.g., prefetching next-page data, service worker registration
 *   3 = Normal — e.g., lazy-loading non-critical UI, initializing 3rd party widgets
 *   4 = Low — e.g., telemetry, background sync setup
 *   5 = Lowest (absolute last) — e.g., prewarming caches, speculative prefetch
 *
 * Cross-browser idle detection chain:
 *   document.readyState === 'complete'
 *     → requestAnimationFrame (past next paint)
 *       → scheduler.postTask({ priority: 'background' })  [Chrome/Edge/Firefox 142+]
 *       → requestIdleCallback                              [Chrome/Firefox, NOT Safari]
 *       → MessageChannel postMessage                       [Universal — React's own trick]
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IdlePriority = 1 | 2 | 3 | 4 | 5;

export interface IdleRegistration {
    /** Unique key for deduplication and cancellation */
    key: string;
    /** 1 = highest (first to run), 5 = lowest (last to run) */
    priority: IdlePriority;
    /** The deferred work */
    callback: () => void | Promise<void>;
}

export type UnregisterFn = () => void;

type FlushState = 'idle' | 'waiting' | 'flushing' | 'done';

/** Experimental Scheduler API (Chrome/Edge/Firefox 142+) — not yet in standard lib types. */
interface GlobalThisWithScheduler {
    scheduler?: {
        postTask: (callback: () => void, options?: { priority: string }) => Promise<void>;
    };
}

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

const queue: Map<string, IdleRegistration> = new Map();
let flushState: FlushState = 'idle';
let cleanupFns: Array<() => void> = [];

/** Listeners that want to know when flush completes (for useIdleNotify) */
const flushListeners: Set<() => void> = new Set();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a callback to run after the page is fully idle.
 *
 * - If the scheduler hasn't flushed yet: queues the callback.
 * - If the scheduler already flushed: runs the callback immediately
 *   (through the same idle detection chain, so it still won't block).
 *
 * Returns an unregister function for cleanup.
 */
export function registerIdleTask(
    key: string,
    priority: IdlePriority,
    callback: () => void | Promise<void>
): UnregisterFn {
    // If we already flushed, schedule this one immediately (still deferred)
    if (flushState === 'done') {
        scheduleImmediate(callback);
        return () => {};
    }

    queue.set(key, { key, priority, callback });

    // Ensure the flush pipeline is started
    if (flushState === 'idle') {
        startFlushPipeline();
    }

    return () => {
        queue.delete(key);
    };
}

/**
 * Subscribe to the flush-complete event.
 * Useful for components that just need a "ready" signal without registering work.
 */
export function onFlushComplete(listener: () => void): UnregisterFn {
    if (flushState === 'done') {
        // Already flushed — notify immediately (but async to avoid sync side effects)
        queueMicrotask(listener);
        return () => {};
    }

    flushListeners.add(listener);
    return () => {
        flushListeners.delete(listener);
    };
}

/**
 * Get current state — useful for debugging or conditional logic.
 */
export function getSchedulerState(): {
    flushState: FlushState;
    pendingCount: number;
    pendingKeys: string[];
} {
    return {
        flushState,
        pendingCount: queue.size,
        pendingKeys: Array.from(queue.keys()),
    };
}

/**
 * Reset the scheduler — primarily for testing or hot-reload scenarios.
 */
export function resetScheduler(): void {
    cleanupFns.forEach((fn) => fn());
    cleanupFns = [];
    queue.clear();
    flushListeners.clear();
    flushState = 'idle';
}

// ---------------------------------------------------------------------------
// Flush pipeline
// ---------------------------------------------------------------------------

function startFlushPipeline(): void {
    if (typeof window === 'undefined') return; // SSR guard

    flushState = 'waiting';

    const waitForLoad = () => {
        if (document.readyState === 'complete') {
            waitForPaint();
        } else {
            const onLoad = () => waitForPaint();
            window.addEventListener('load', onLoad, { once: true });
            cleanupFns.push(() => window.removeEventListener('load', onLoad));
        }
    };

    const waitForPaint = () => {
        const rafId = requestAnimationFrame(() => {
            waitForIdle();
        });
        cleanupFns.push(() => cancelAnimationFrame(rafId));
    };

    const waitForIdle = () => {
        // Tier 1: scheduler.postTask with background priority (Chrome/Edge/Firefox 142+)
        const schedulerGlobal = (globalThis as GlobalThisWithScheduler).scheduler;
        if (schedulerGlobal && 'postTask' in schedulerGlobal) {
            schedulerGlobal
                .postTask(() => flush(), { priority: 'background' })
                .catch(() => {});
            return;
        }

        // Tier 2: requestIdleCallback (Chrome, Firefox — NOT Safari stable)
        if ('requestIdleCallback' in window) {
            const idleId = requestIdleCallback(() => flush());
            cleanupFns.push(() => cancelIdleCallback(idleId));
            return;
        }

        // Tier 3: MessageChannel — universal, including Safari + iOS Safari
        // This is what React's scheduler uses internally.
        const channel = new MessageChannel();
        channel.port1.onmessage = () => flush();
        channel.port2.postMessage(undefined);
    };

    waitForLoad();
}

async function flush(): Promise<void> {
    if (flushState === 'done' || flushState === 'flushing') return;
    flushState = 'flushing';

    // Sort by priority (1 first, 5 last), stable sort preserving insertion order within priority
    const sorted = Array.from(queue.values()).sort((a, b) => a.priority - b.priority);

    // Clear the queue before executing (so late registrations during flush
    // are treated as "post-flush" and get scheduled immediately)
    queue.clear();

    for (const task of sorted) {
        try {
            await task.callback();
        } catch (err) {
            console.error(`[IdleScheduler] Task "${task.key}" failed:`, err);
        }
    }

    flushState = 'done';

    // Notify all listeners
    flushListeners.forEach((listener) => {
        try {
            listener();
        } catch (err) {
            console.error('[IdleScheduler] Flush listener failed:', err);
        }
    });
    flushListeners.clear();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Schedule a single callback through the idle chain (for post-flush registrations) */
function scheduleImmediate(callback: () => void | Promise<void>): void {
    requestAnimationFrame(() => {
        const schedulerGlobal = (globalThis as GlobalThisWithScheduler).scheduler;
        if (schedulerGlobal && 'postTask' in schedulerGlobal) {
            schedulerGlobal
                .postTask(() => callback(), { priority: 'background' })
                .catch(() => {});
            return;
        }
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => callback());
            return;
        }
        const channel = new MessageChannel();
        channel.port1.onmessage = () => callback();
        channel.port2.postMessage(undefined);
    });
}
