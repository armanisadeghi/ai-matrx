'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/utils/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppInstance {
    id: string;
    instance_id: string;
    instance_name: string;
    platform: string | null;
    os_version: string | null;
    hostname: string | null;
    username: string | null;
    cpu_model: string | null;
    cpu_cores: number | null;
    ram_total_gb: number | null;
    is_active: boolean;
    last_seen: string;
    created_at: string;
    updated_at: string;
    tunnel_url: string | null;
    tunnel_active: boolean;
    tunnel_updated_at: string | null;
    tunnel_ws_url: string | null;
}

export type ConnectionTestStatus = 'idle' | 'testing' | 'ok' | 'error';

export interface InstanceWithStatus extends AppInstance {
    restStatus: ConnectionTestStatus;
    wsStatus: ConnectionTestStatus;
    restLatencyMs: number | null;
    wsLatencyMs: number | null;
    restError: string | null;
    wsError: string | null;
    localStatus: ConnectionTestStatus;
    localLatencyMs: number | null;
    localError: string | null;
}

// ---------------------------------------------------------------------------
// Shared fetch + freshness helpers (also consumed by useMatrxLocal for the
// remote-fallback path — keep the query in ONE place)
// ---------------------------------------------------------------------------

/** Same freshness window as /api/compute-targets — a tunnel whose engine
 *  hasn't heartbeated in 10 minutes is treated as offline. */
export const INSTANCE_ONLINE_WINDOW_MS = 10 * 60 * 1000;

/** True when this registered instance is reachable from anywhere via its tunnel. */
export function isInstanceRemoteOnline(
    inst: Pick<AppInstance, 'tunnel_active' | 'tunnel_url' | 'last_seen'>,
): boolean {
    if (!inst.tunnel_active || !inst.tunnel_url) return false;
    const t = inst.last_seen ? Date.parse(inst.last_seen) : 0;
    return t > 0 && Date.now() - t <= INSTANCE_ONLINE_WINDOW_MS;
}

/** Engine WS endpoints require the Supabase JWT as a query param (browsers
 *  can't set WS headers). Without it the engine rejects the handshake — an
 *  unauthenticated probe reads as "offline" even when the tunnel is fine. */
async function withWsAuthToken(wsUrl: string): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return wsUrl;
    return `${wsUrl}${wsUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

/** RLS-scoped direct read of the user's registered Matrx Local instances. */
export async function fetchAppInstances(): Promise<AppInstance[]> {
    const { data, error } = await supabase
        .from('app_instances')
        .select('id,instance_id,instance_name,platform,os_version,hostname,username,cpu_model,cpu_cores,ram_total_gb,is_active,last_seen,created_at,updated_at,tunnel_url,tunnel_active,tunnel_updated_at,tunnel_ws_url')
        .is('deleted_at', null)
        .order('last_seen', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAppInstances() {
    const [instances, setInstances] = useState<InstanceWithStatus[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetch_ = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchAppInstances();

            setInstances(
                data.map(row => ({
                    ...row,
                    restStatus: 'idle',
                    wsStatus: 'idle',
                    restLatencyMs: null,
                    wsLatencyMs: null,
                    restError: null,
                    wsError: null,
                    localStatus: 'idle',
                    localLatencyMs: null,
                    localError: null,
                }))
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load instances');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetch_();
    }, [fetch_]);

    // Test REST connectivity for a single instance (by row id)
    const testRest = useCallback(async (instanceId: string, url: string) => {
        setInstances(prev =>
            prev.map(inst =>
                inst.id === instanceId
                    ? { ...inst, restStatus: 'testing', restLatencyMs: null, restError: null }
                    : inst
            )
        );

        const start = Date.now();
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 5000);
            const res = await fetch(`${url}/health`, { signal: ctrl.signal });
            clearTimeout(timer);
            const latency = Date.now() - start;
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setInstances(prev =>
                prev.map(inst =>
                    inst.id === instanceId
                        ? { ...inst, restStatus: 'ok', restLatencyMs: latency, restError: null }
                        : inst
                )
            );
        } catch (e) {
            setInstances(prev =>
                prev.map(inst =>
                    inst.id === instanceId
                        ? { ...inst, restStatus: 'error', restLatencyMs: null, restError: e instanceof Error ? e.message : 'Failed' }
                        : inst
                )
            );
        }
    }, []);

    // Test WS connectivity for a single instance
    const testWs = useCallback(async (instanceId: string, wsUrl: string) => {
        setInstances(prev =>
            prev.map(inst =>
                inst.id === instanceId
                    ? { ...inst, wsStatus: 'testing', wsLatencyMs: null, wsError: null }
                    : inst
            )
        );

        const authedWsUrl = await withWsAuthToken(wsUrl);
        const start = Date.now();
        await new Promise<void>(resolve => {
            try {
                const ws = new WebSocket(authedWsUrl);
                const timer = setTimeout(() => {
                    ws.close();
                    setInstances(prev =>
                        prev.map(inst =>
                            inst.id === instanceId
                                ? { ...inst, wsStatus: 'error', wsLatencyMs: null, wsError: 'Timeout (5s)' }
                                : inst
                        )
                    );
                    resolve();
                }, 5000);

                ws.onopen = () => {
                    clearTimeout(timer);
                    const latency = Date.now() - start;
                    ws.close();
                    setInstances(prev =>
                        prev.map(inst =>
                            inst.id === instanceId
                                ? { ...inst, wsStatus: 'ok', wsLatencyMs: latency, wsError: null }
                                : inst
                        )
                    );
                    resolve();
                };

                ws.onerror = () => {
                    clearTimeout(timer);
                    setInstances(prev =>
                        prev.map(inst =>
                            inst.id === instanceId
                                ? { ...inst, wsStatus: 'error', wsLatencyMs: null, wsError: 'Connection refused' }
                                : inst
                        )
                    );
                    resolve();
                };
            } catch (e) {
                setInstances(prev =>
                    prev.map(inst =>
                        inst.id === instanceId
                            ? { ...inst, wsStatus: 'error', wsLatencyMs: null, wsError: e instanceof Error ? e.message : 'Failed' }
                            : inst
                    )
                );
                resolve();
            }
        });
    }, []);

    // Test both REST and WS for an instance
    const testInstance = useCallback(async (inst: InstanceWithStatus) => {
        const restUrl = inst.tunnel_active && inst.tunnel_url ? inst.tunnel_url : null;
        const wsUrl = inst.tunnel_active && inst.tunnel_ws_url ? inst.tunnel_ws_url : null;

        if (restUrl) {
            await testRest(inst.id, restUrl);
        }
        if (wsUrl) {
            await testWs(inst.id, wsUrl);
        }
    }, [testRest, testWs]);

    // Test a custom URL directly (not tied to an instance record)
    const testCustomUrl = useCallback(async (url: string): Promise<{ restOk: boolean; wsOk: boolean; restLatency: number | null; wsLatency: number | null; restError: string | null; wsError: string | null }> => {
        let restOk = false;
        let wsOk = false;
        let restLatency: number | null = null;
        let wsLatency: number | null = null;
        let restError: string | null = null;
        let wsError: string | null = null;

        // REST test
        const restStart = Date.now();
        try {
            const ctrl = new AbortController();
            setTimeout(() => ctrl.abort(), 5000);
            const res = await fetch(`${url}/health`, { signal: ctrl.signal });
            if (res.ok) {
                restOk = true;
                restLatency = Date.now() - restStart;
            } else {
                restError = `HTTP ${res.status}`;
            }
        } catch (e) {
            restError = e instanceof Error ? e.message : 'Failed';
        }

        // WS test
        const wsUrl = await withWsAuthToken(
            url.replace(/^https?/, (m) => m === 'https' ? 'wss' : 'ws') + '/ws',
        );
        const wsStart = Date.now();
        await new Promise<void>(resolve => {
            try {
                const ws = new WebSocket(wsUrl);
                const timer = setTimeout(() => {
                    ws.close();
                    wsError = 'Timeout (5s)';
                    resolve();
                }, 5000);
                ws.onopen = () => {
                    clearTimeout(timer);
                    wsOk = true;
                    wsLatency = Date.now() - wsStart;
                    ws.close();
                    resolve();
                };
                ws.onerror = () => {
                    clearTimeout(timer);
                    wsError = 'Connection refused';
                    resolve();
                };
            } catch (e) {
                wsError = e instanceof Error ? e.message : 'Failed';
                resolve();
            }
        });

        return { restOk, wsOk, restLatency, wsLatency, restError, wsError };
    }, []);

    // Update tunnel fields in Supabase
    const saveTunnelUrl = useCallback(async (instanceId: string, tunnelUrl: string, tunnelWsUrl: string) => {
        const { error: err } = await supabase
            .from('app_instances')
            .update({
                tunnel_url: tunnelUrl || null,
                tunnel_ws_url: tunnelWsUrl || null,
                tunnel_active: !!tunnelUrl,
                tunnel_updated_at: new Date().toISOString(),
            })
            .eq('id', instanceId);

        if (err) throw new Error(err.message);
        await fetch_();
    }, [fetch_]);

    return {
        instances,
        loading,
        error,
        refresh: fetch_,
        testInstance,
        testRest,
        testWs,
        testCustomUrl,
        saveTunnelUrl,
    };
}
