"use client";

import { useEffect, useRef } from "react";

/**
 * Pings the sandbox orchestrator's heartbeat endpoint at a fixed interval
 * while the hook is mounted with a non-empty `sandboxRowId`.
 *
 * Use case: the editor mounts this once per active session so the orchestrator's
 * idle-shutdown sweep doesn't reap a sandbox the user is actively working in.
 * The heartbeat is *not* a TTL extension — see `useSandboxExtend` (or the
 * direct `POST /api/sandbox/[id]/extend` route) when you need to push the
 * expiry forward.
 *
 * Cheap: a single 200-byte POST per minute. Aborted on unmount.
 */
export function useSandboxHeartbeat(
    sandboxRowId: string | null | undefined,
    options?: { intervalMs?: number; enabled?: boolean }
) {
    const intervalMs = options?.intervalMs ?? 60_000;
    const enabled = options?.enabled ?? true;
    const lastErrorRef = useRef<string | null>(null);

    useEffect(() => {
        if (!enabled || !sandboxRowId) return undefined;

        const controller = new AbortController();
        let timer: ReturnType<typeof setInterval> | null = null;

        const beat = async () => {
            try {
                const resp = await fetch(`/api/sandbox/${sandboxRowId}/heartbeat`, {
                    method: "POST",
                    signal: controller.signal,
                });
                if (!resp.ok) {
                    const text = await resp.text().catch(() => resp.statusText);
                    lastErrorRef.current = text;
                    if (process.env.NODE_ENV === "development") {
                        console.warn(`[sandbox heartbeat] ${resp.status}: ${text}`);
                    }
                } else {
                    lastErrorRef.current = null;
                }
            } catch (err) {
                if ((err as Error)?.name === "AbortError") return;
                lastErrorRef.current = (err as Error)?.message ?? "unknown error";
                if (process.env.NODE_ENV === "development") {
                    console.warn(`[sandbox heartbeat] ${lastErrorRef.current}`);
                }
            }
        };

        // Fire one immediately, then on the cadence.
        void beat();
        timer = setInterval(beat, intervalMs);

        return () => {
            controller.abort();
            if (timer) clearInterval(timer);
        };
    }, [sandboxRowId, intervalMs, enabled]);

    return { lastError: lastErrorRef.current };
}
