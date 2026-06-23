'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/utils/supabase/client';
import {
    DEFAULT_LOCAL_URL,
    DISCOVERY_TIMEOUT,
    MATRX_LOCAL_PORT_RANGE,
    MATRX_LOCAL_PORT_START,
    WS_TIMEOUT_DEFAULT,
    WS_TIMEOUT_RESEARCH,
} from './constants';
import type {
    ActiveRequest,
    ConnectionInfo,
    ConnectionStatus,
    EngineSettings,
    HealthInfo,
    LogEntry,
    PortInfo,
    ToolResult,
    VersionInfo,
} from './types';

// ---------------------------------------------------------------------------
// Module-level token cache
// ---------------------------------------------------------------------------
// One shared promise across all calls so concurrent requests don't each call
// getSession(). The token is cached until it expires, then lazily re-fetched.

let _cachedToken: string | null = null;
let _tokenExpiresAt: number = 0;          // unix ms
let _inflightTokenFetch: Promise<string | null> | null = null;

async function getToken(): Promise<string | null> {
    const now = Date.now();

    // Return cached token if still valid (30-second safety buffer)
    if (_cachedToken && now < _tokenExpiresAt - 30_000) {
        return _cachedToken;
    }

    // Deduplicate concurrent calls: only one getSession() in-flight at a time
    if (_inflightTokenFetch) return _inflightTokenFetch;

    _inflightTokenFetch = (async () => {
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        _cachedToken = session?.access_token ?? null;
        // exp is seconds since epoch
        _tokenExpiresAt = session?.expires_at ? session.expires_at * 1000 : 0;
        return _cachedToken;
    })();

    try {
        return await _inflightTokenFetch;
    } finally {
        _inflightTokenFetch = null;
    }
}

/** Force-refresh the token (used after a 401 response). */
async function refreshToken(): Promise<string | null> {
    _cachedToken = null;
    _tokenExpiresAt = 0;
    const { data } = await supabase.auth.refreshSession();
    const session = data.session;
    _cachedToken = session?.access_token ?? null;
    _tokenExpiresAt = session?.expires_at ? session.expires_at * 1000 : 0;
    return _cachedToken;
}

async function buildAuthHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
    const token = await getToken();
    const headers: Record<string, string> = { ...extra };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

// Browser WebSocket API does not support custom headers.
// Pass the token as a query param — the engine accepts both.
async function buildWsUrl(httpUrl: string): Promise<string> {
    const token = await getToken();
    const wsBase = httpUrl.replace(/^http/, 'ws') + '/ws';
    if (!token) {
        console.warn('[MatrxLocal] WS: no auth token — connection will be rejected');
        return wsBase;
    }
    return `${wsBase}?token=${encodeURIComponent(token)}`;
}

// ---------------------------------------------------------------------------
// Authenticated fetch: 401 → force-refresh token → retry once
// ---------------------------------------------------------------------------

async function engineFetch(url: string, opts: RequestInit): Promise<Response> {
    const res = await fetch(url, opts);
    if (res.status !== 401) return res;

    // Token may be stale — force a refresh and retry exactly once
    const newToken = await refreshToken();
    if (!newToken) return res;

    return fetch(url, {
        ...opts,
        headers: {
            ...(opts.headers as Record<string, string>),
            Authorization: `Bearer ${newToken}`,
        },
    });
}

// ---------------------------------------------------------------------------
// Port discovery
// ---------------------------------------------------------------------------

export interface DiscoveryResult extends ConnectionInfo {
    availableTools: string[];
    version: string | null;
}

export async function discoverMatrxLocal(): Promise<DiscoveryResult | null> {
    for (let offset = 0; offset < MATRX_LOCAL_PORT_RANGE; offset++) {
        const port = MATRX_LOCAL_PORT_START + offset;
        const url = `http://127.0.0.1:${port}`;
        try {
            const healthRes = await fetch(`${url}/health`, {
                signal: AbortSignal.timeout(DISCOVERY_TIMEOUT),
            });
            if (!healthRes.ok) continue;

            const healthData = await healthRes.json().catch(() => ({})) as HealthInfo;

            // /tools/list requires auth — use token cache
            const authHeaders = await buildAuthHeaders();
            const toolsRes = await engineFetch(`${url}/tools/list`, {
                headers: authHeaders,
                signal: AbortSignal.timeout(2000),
            });
            const availableTools: string[] = toolsRes.ok
                ? ((await toolsRes.json().catch(() => ({}))) as { tools?: string[] }).tools ?? []
                : [];

            return {
                url,
                ws: `ws://127.0.0.1:${port}/ws`,
                port,
                availableTools,
                version: healthData.version ?? null,
            };
        } catch {
            // Port not responding — try next
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Hook interface
// ---------------------------------------------------------------------------

export interface UseMatrxLocalReturn {
    baseUrl: string;
    setBaseUrl: (url: string) => void;
    status: ConnectionStatus;
    wsConnected: boolean;
    loading: string | null;
    logs: LogEntry[];
    discover: () => Promise<void>;
    connectWs: () => Promise<void>;
    disconnectWs: () => void;
    cancelAll: () => void;
    cancelRequest: (id: string) => void;
    invokeTool: (tool: string, input: Record<string, unknown>, timeoutMs?: number) => Promise<ToolResult>;
    invokeViaRest: (tool: string, input: Record<string, unknown>, timeoutMs?: number) => Promise<ToolResult>;
    clearLogs: () => void;
    useWebSocket: boolean;
    setUseWebSocket: (v: boolean) => void;

    // Health / Version / Engine
    healthInfo: HealthInfo | null;
    versionInfo: VersionInfo | null;
    portInfo: PortInfo | null;
    healthCheckedAt: Date | null;
    refreshHealth: () => Promise<void>;

    // Live tool list from server
    availableTools: string[];

    // Active request tracking
    activeRequests: ActiveRequest[];

    // REST helpers for non-tool endpoints
    restGet: (path: string, headers?: Record<string, string>) => Promise<unknown>;
    restPost: (path: string, body?: unknown, headers?: Record<string, string>) => Promise<unknown>;
    restPut: (path: string, body?: unknown, headers?: Record<string, string>) => Promise<unknown>;
    restDelete: (path: string, headers?: Record<string, string>) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMatrxLocal(): UseMatrxLocalReturn {
    const [baseUrl, setBaseUrl] = useState(DEFAULT_LOCAL_URL);
    const [status, setStatus] = useState<ConnectionStatus>('disconnected');
    const [wsConnected, setWsConnected] = useState(false);
    const [loading, setLoading] = useState<string | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [useWebSocket, setUseWebSocket] = useState(true);

    // Health / Version / Ports
    const [healthInfo, setHealthInfo] = useState<HealthInfo | null>(null);
    const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
    const [portInfo, setPortInfo] = useState<PortInfo | null>(null);
    const [healthCheckedAt, setHealthCheckedAt] = useState<Date | null>(null);

    // Server-reported available tools
    const [availableTools, setAvailableTools] = useState<string[]>([]);

    // Active requests
    const [activeRequests, setActiveRequests] = useState<ActiveRequest[]>([]);

    const wsRef = useRef<WebSocket | null>(null);
    const pendingCallbacks = useRef<Map<string, (result: ToolResult) => void>>(new Map());

    // Refs for values needed inside stable callbacks (no re-creation on state change)
    const baseUrlRef = useRef(baseUrl);
    const wsConnectedRef = useRef(wsConnected);
    const useWebSocketRef = useRef(useWebSocket);

    // WS auto-reconnect state
    const wsRetryCountRef = useRef(0);
    const wsRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wsAutoReconnect = useRef(true);
    // Guards: ensure one-shot effects don't fire more than once
    const healthFetchedRef = useRef(false);
    const initialStatusCheckedRef = useRef(false);

    // Keep refs in sync with state
    useEffect(() => { baseUrlRef.current = baseUrl; }, [baseUrl]);
    useEffect(() => { wsConnectedRef.current = wsConnected; }, [wsConnected]);
    useEffect(() => { useWebSocketRef.current = useWebSocket; }, [useWebSocket]);

    // ── Logging ─────────────────────────────────────────────────────────────

    const addLog = useCallback((direction: 'sent' | 'received', data: unknown, tool?: string) => {
        setLogs(prev => [
            ...prev,
            {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                timestamp: new Date(),
                direction,
                tool,
                data,
            },
        ]);
    }, []);

    const clearLogs = useCallback(() => setLogs([]), []);

    // ── Port discovery ───────────────────────────────────────────────────────

    const discover = useCallback(async () => {
        setStatus('discovering');
        const result = await discoverMatrxLocal();
        if (result) {
            // Only overwrite the URL if the user hasn't set a remote/tunnel address.
            // A remote URL starts with https:// or has a non-localhost hostname.
            const currentUrl = baseUrlRef.current;
            const isLocalUrl = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(currentUrl);
            if (isLocalUrl) {
                setBaseUrl(result.url);
                baseUrlRef.current = result.url;
            }
            setStatus('disconnected');
            if (result.availableTools.length > 0) setAvailableTools(result.availableTools);
            if (result.version) setVersionInfo({ version: result.version });
            addLog('received', { event: 'discovered', ...result });
        } else {
            setStatus('disconnected');
            addLog('received', { event: 'discovery_failed', message: 'Matrx Local not found on ports 22140–22159' });
        }
    }, [addLog]);

    // ── One-shot REST status check ───────────────────────────────────────────
    // Only runs once per mount (guarded). WS onopen/onclose drives status after that.

    const checkRestStatus = useCallback(async () => {
        try {
            const res = await fetch(`${baseUrlRef.current}/health`, {
                signal: AbortSignal.timeout(2000),
            });
            if (res.ok && wsRef.current?.readyState !== WebSocket.OPEN) {
                setStatus('connected');
            }
        } catch {
            if (wsRef.current?.readyState !== WebSocket.OPEN) {
                setStatus('disconnected');
            }
        }
    }, []);

    useEffect(() => {
        if (initialStatusCheckedRef.current) return;
        initialStatusCheckedRef.current = true;
        checkRestStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-check when user manually edits the URL (not on every state change)
    const handleSetBaseUrl = useCallback((url: string) => {
        setBaseUrl(url);
        baseUrlRef.current = url;
        initialStatusCheckedRef.current = false; // allow re-check on new URL
        checkRestStatus();
    }, [checkRestStatus]);

    // ── Health / Ports — one-shot on mount, manual refresh exposed ───────────

    const refreshHealth = useCallback(async () => {
        try {
            const [healthRes, portsRes] = await Promise.allSettled([
                fetch(`${baseUrlRef.current}/health`, { signal: AbortSignal.timeout(3000) }),
                fetch(`${baseUrlRef.current}/ports`, { signal: AbortSignal.timeout(3000) }),
            ]);
            if (healthRes.status === 'fulfilled' && healthRes.value.ok) {
                setHealthInfo(await healthRes.value.json());
            } else {
                setHealthInfo(null);
            }
            if (portsRes.status === 'fulfilled' && portsRes.value.ok) {
                setPortInfo(await portsRes.value.json());
            }
            setHealthCheckedAt(new Date());
        } catch {
            // Health is optional display info — silently ignore
        }
    }, []);

    useEffect(() => {
        if (healthFetchedRef.current) return;
        healthFetchedRef.current = true;
        refreshHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── WebSocket connection ─────────────────────────────────────────────────
    // connectWs is stable (empty deps) — it reads state via refs.

    const connectWs = useCallback(async () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;
        setStatus('connecting');

        // Wait for token before attempting WS — prevents the 403 "missing token" errors
        const token = await getToken();
        if (!token) {
            addLog('received', { event: 'ws_skipped', reason: 'no_auth_token' });
            setStatus('disconnected');
            return;
        }

        const wsBase = baseUrlRef.current.replace(/^http/, 'ws') + '/ws';
        const wsUrl = `${wsBase}?token=${encodeURIComponent(token)}`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            setWsConnected(true);
            wsConnectedRef.current = true;
            setStatus('connected');
            wsRetryCountRef.current = 0;
            addLog('received', { event: 'connected', url: wsUrl });
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data) as ToolResult & { id?: string };
                addLog('received', data, data.id ?? undefined);
                if (data.id && pendingCallbacks.current.has(data.id)) {
                    pendingCallbacks.current.get(data.id)!(data);
                    pendingCallbacks.current.delete(data.id);
                    setActiveRequests(prev => prev.filter(r => r.id !== data.id));
                }
            } catch {
                addLog('received', event.data);
            }
        };

        ws.onclose = () => {
            setWsConnected(false);
            wsConnectedRef.current = false;
            setStatus('disconnected');
            addLog('received', { event: 'disconnected' });
            pendingCallbacks.current.clear();
            setActiveRequests([]);

            if (wsAutoReconnect.current) {
                // Exponential backoff: 2s, 4s, 8s … max 30s
                const delay = Math.min(2000 * Math.pow(2, wsRetryCountRef.current), 30_000);
                wsRetryCountRef.current += 1;
                addLog('received', { event: 'reconnect_scheduled', delay_ms: delay });
                wsRetryTimerRef.current = setTimeout(() => connectWs(), delay);
            }
        };

        ws.onerror = () => {
            setWsConnected(false);
            wsConnectedRef.current = false;
            setStatus('disconnected');
            addLog('received', { event: 'error' });
            pendingCallbacks.current.clear();
            setActiveRequests([]);
        };

        wsRef.current = ws;
    // addLog is stable (useCallback [])
    }, [addLog]);

    const disconnectWs = useCallback(() => {
        wsAutoReconnect.current = false;
        if (wsRetryTimerRef.current) {
            clearTimeout(wsRetryTimerRef.current);
            wsRetryTimerRef.current = null;
        }
        wsRef.current?.close();
        wsRef.current = null;
    }, []);

    const connectWsWithReconnect = useCallback(async () => {
        wsAutoReconnect.current = true;
        wsRetryCountRef.current = 0;
        await connectWs();
    }, [connectWs]);

    // Cleanup on unmount
    useEffect(() => () => {
        wsAutoReconnect.current = false;
        if (wsRetryTimerRef.current) clearTimeout(wsRetryTimerRef.current);
        disconnectWs();
    }, [disconnectWs]);

    // Auto-connect WS on mount — single attempt, small delay to allow token to load
    useEffect(() => {
        const t = setTimeout(() => connectWsWithReconnect(), 200);
        return () => clearTimeout(t);
    // connectWsWithReconnect is stable — intentionally run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Cancel ───────────────────────────────────────────────────────────────

    const cancelAll = useCallback(() => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'cancel_all' }));
        }
        pendingCallbacks.current.clear();
        setActiveRequests([]);
        setLoading(null);
        addLog('sent', { action: 'cancel_all' });
    }, [addLog]);

    const cancelRequest = useCallback((id: string) => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ id, action: 'cancel' }));
        }
        pendingCallbacks.current.delete(id);
        setActiveRequests(prev => prev.filter(r => r.id !== id));
        addLog('sent', { id, action: 'cancel' });
    }, [addLog]);

    // ── Tool execution ───────────────────────────────────────────────────────

    const invokeViaWs = useCallback(
        (tool: string, input: Record<string, unknown>, timeoutMs = WS_TIMEOUT_DEFAULT): Promise<ToolResult> => {
            return new Promise((resolve, reject) => {
                if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                    reject(new Error('WebSocket not connected'));
                    return;
                }
                const reqId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                const msg = { id: reqId, tool, input };
                addLog('sent', msg, tool);
                setActiveRequests(prev => [...prev, { id: reqId, tool, startedAt: new Date() }]);

                const timer = setTimeout(() => {
                    if (pendingCallbacks.current.has(reqId)) {
                        pendingCallbacks.current.delete(reqId);
                        setActiveRequests(prev => prev.filter(r => r.id !== reqId));
                        reject(new Error(`Timeout (${timeoutMs / 1000}s)`));
                    }
                }, timeoutMs);

                pendingCallbacks.current.set(reqId, (result) => {
                    clearTimeout(timer);
                    resolve(result);
                });

                wsRef.current.send(JSON.stringify(msg));
            });
        },
        [addLog],
    );

    const invokeViaRest = useCallback(
        async (tool: string, input: Record<string, unknown>, timeoutMs = WS_TIMEOUT_DEFAULT): Promise<ToolResult> => {
            const url = `${baseUrlRef.current}/tools/invoke`;
            const body = { tool, input };
            addLog('sent', body, tool);

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const headers = await buildAuthHeaders({ 'Content-Type': 'application/json' });
                const res = await engineFetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });

                if (!res.ok) {
                    const errText = await res.text().catch(() => '');
                    const result: ToolResult = { type: 'error', output: `HTTP ${res.status}: ${errText || res.statusText}` };
                    addLog('received', result, tool);
                    return result;
                }

                const data = (await res.json()) as ToolResult;
                addLog('received', data, tool);
                return data;
            } finally {
                clearTimeout(timer);
            }
        },
        [addLog],
    );

    const invokeTool = useCallback(
        async (tool: string, input: Record<string, unknown>, timeoutMs?: number): Promise<ToolResult> => {
            const effectiveTimeout = timeoutMs ?? (tool === 'Research' ? WS_TIMEOUT_RESEARCH : WS_TIMEOUT_DEFAULT);
            const key = `${tool}-${Date.now()}`;
            setLoading(key);

            try {
                const result = useWebSocketRef.current && wsConnectedRef.current
                    ? await invokeViaWs(tool, input, effectiveTimeout)
                    : await invokeViaRest(tool, input, effectiveTimeout);
                return result;
            } catch (err) {
                return { type: 'error', output: err instanceof Error ? err.message : 'Unknown error' };
            } finally {
                setLoading(null);
            }
        },
        [invokeViaWs, invokeViaRest],
    );

    // ── REST helpers (all authenticated, all stable) ─────────────────────────
    // Use baseUrlRef so identity never changes across state updates.
    // Token is fetched via the module-level cache — one getSession() shared by all.

    const restGet = useCallback(
        async (path: string, extraHeaders?: Record<string, string>): Promise<unknown> => {
            const headers = await buildAuthHeaders(extraHeaders);
            const res = await engineFetch(`${baseUrlRef.current}${path}`, {
                headers,
                signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                throw new Error(`GET ${path} → ${res.status}: ${body || res.statusText}`);
            }
            return res.json();
        },
        [],
    );

    const restPost = useCallback(
        async (path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<unknown> => {
            const headers = await buildAuthHeaders({ 'Content-Type': 'application/json', ...extraHeaders });
            const res = await engineFetch(`${baseUrlRef.current}${path}`, {
                method: 'POST',
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(30_000),
            });
            if (!res.ok) {
                const errBody = await res.text().catch(() => '');
                throw new Error(`POST ${path} → ${res.status}: ${errBody || res.statusText}`);
            }
            return res.json();
        },
        [],
    );

    const restPut = useCallback(
        async (path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<unknown> => {
            const headers = await buildAuthHeaders({ 'Content-Type': 'application/json', ...extraHeaders });
            const res = await engineFetch(`${baseUrlRef.current}${path}`, {
                method: 'PUT',
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) {
                const errBody = await res.text().catch(() => '');
                throw new Error(`PUT ${path} → ${res.status}: ${errBody || res.statusText}`);
            }
            return res.json();
        },
        [],
    );

    const restDelete = useCallback(
        async (path: string, extraHeaders?: Record<string, string>): Promise<unknown> => {
            const headers = await buildAuthHeaders(extraHeaders);
            const res = await engineFetch(`${baseUrlRef.current}${path}`, {
                method: 'DELETE',
                headers,
                signal: AbortSignal.timeout(10_000),
            });
            if (res.status === 204) return { ok: true };
            if (!res.ok) {
                const errBody = await res.text().catch(() => '');
                throw new Error(`DELETE ${path} → ${res.status}: ${errBody || res.statusText}`);
            }
            return res.json();
        },
        [],
    );

    return {
        baseUrl,
        setBaseUrl: handleSetBaseUrl,
        status,
        wsConnected,
        loading,
        logs,
        discover,
        connectWs: connectWsWithReconnect,
        disconnectWs,
        cancelAll,
        cancelRequest,
        invokeTool,
        invokeViaRest,
        clearLogs,
        useWebSocket,
        setUseWebSocket,
        healthInfo,
        versionInfo,
        portInfo,
        healthCheckedAt,
        refreshHealth,
        availableTools,
        activeRequests,
        restGet,
        restPost,
        restPut,
        restDelete,
    };
}
