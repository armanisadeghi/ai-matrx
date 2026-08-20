/**
 * @module idle-scheduler
 *
 * Priority-aware deferred execution system for Next.js App Router.
 *
 * Usage:
 *
 * ```tsx
 * // Fire-and-forget (zero re-renders)
 * import { useIdleTask } from '@/lib/idle-scheduler';
 * useIdleTask('analytics', 3, () => initAnalytics());
 *
 * // Wait for idle signal (one re-render: false → true)
 * import { useIdleReady } from '@/lib/idle-scheduler';
 * const ready = useIdleReady();
 *
 * // Register work + get notified when done
 * import { useIdleGate } from '@/lib/idle-scheduler';
 * const { ready } = useIdleGate('prefetch', 2, async () => { ... });
 *
 * // Imperative registration (for dynamic/conditional work)
 * import { useIdleRegister } from '@/lib/idle-scheduler';
 * const schedule = useIdleRegister();
 * schedule('task-key', 4, () => { ... });
 *
 * // Direct API (non-React, e.g., from a vanilla script or module init)
 * import { registerIdleTask, onFlushComplete } from '@/lib/idle-scheduler';
 * ```
 */

// React hooks
export {
    useIdleTask,
    useIdleReady,
} from './hooks';

export { whenPageIdle } from './idle-scheduler';
