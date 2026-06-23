'use client';

import { Activity, HeartPulse, Loader2, RefreshCw, Server, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InstanceSelectorModal } from './InstanceSelectorModal';
import type { UseMatrxLocalReturn } from './useMatrxLocal';

interface ConnectionBarProps {
    hook: UseMatrxLocalReturn;
    showTransportToggle?: boolean;
}

export function ConnectionBar({ hook, showTransportToggle = true }: ConnectionBarProps) {
    const {
        baseUrl,
        setBaseUrl,
        status,
        wsConnected,
        loading,
        discover,
        cancelAll,
        cancelRequest,
        useWebSocket,
        setUseWebSocket,
        healthInfo,
        versionInfo,
        activeRequests,
        availableTools,
        healthCheckedAt,
        refreshHealth,
        connectWs,
        disconnectWs,
    } = hook;

    const [showRequests, setShowRequests] = useState(false);
    const [refreshingHealth, setRefreshingHealth] = useState(false);
    const [showInstanceModal, setShowInstanceModal] = useState(false);

    const isDiscovering = status === 'discovering';
    const isConnecting = status === 'connecting';
    const restOnline = status === 'connected' || wsConnected;

    const engineHealthy = healthInfo && (healthInfo.status === 'ok' || healthInfo.status === 'healthy');
    const version = versionInfo?.version || healthInfo?.version;

    const handleRefreshHealth = async () => {
        setRefreshingHealth(true);
        try {
            await refreshHealth();
        } finally {
            setRefreshingHealth(false);
        }
    };

    const checkedAgo = healthCheckedAt
        ? (() => {
              const secs = Math.round((Date.now() - healthCheckedAt.getTime()) / 1000);
              if (secs < 60) return `${secs}s ago`;
              return `${Math.round(secs / 60)}m ago`;
          })()
        : null;

    // When an instance is selected from the modal, apply the URLs and reconnect WS
    const handleInstanceSelect = (restUrl: string, wsUrl: string | null) => {
        setBaseUrl(restUrl);
        disconnectWs();
        setTimeout(() => connectWs(), 100);
    };

    return (
        <>
            <div className="border rounded-lg bg-card">
                <div className="flex items-center gap-3 p-3 flex-wrap">

                    {/* URL input — value is fully controlled, never reset by scan */}
                    <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                        <span className="text-xs text-muted-foreground font-medium shrink-0">Engine URL</span>
                        <input
                            type="text"
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                            className="h-8 text-xs font-mono flex-1 min-w-0 rounded border px-2.5 bg-background"
                            spellCheck={false}
                            autoComplete="off"
                        />
                    </div>

                    {/* Instance picker — opens modal with all registered instances */}
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowInstanceModal(true)}
                        className="h-8 px-3 gap-1.5 shrink-0"
                        title="Browse your registered instances"
                    >
                        <Server className="w-3.5 h-3.5" />
                        <span className="text-xs">Instances</span>
                    </Button>

                    {/* Scan / discover local port */}
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={discover}
                        disabled={isDiscovering}
                        className="h-8 px-3 gap-1.5 shrink-0"
                        title="Scan ports 22140–22159 for a local engine"
                    >
                        {isDiscovering
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <RefreshCw className="w-3.5 h-3.5" />
                        }
                        <span className="text-xs">{isDiscovering ? 'Scanning…' : 'Scan'}</span>
                    </Button>

                    {/* Manual health refresh */}
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleRefreshHealth}
                        disabled={refreshingHealth}
                        className="h-8 px-2.5 gap-1.5 shrink-0 text-muted-foreground"
                        title={checkedAgo ? `Health last checked ${checkedAgo}` : 'Check engine health'}
                    >
                        {refreshingHealth
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <HeartPulse className="w-3.5 h-3.5" />
                        }
                        <span className="text-xs hidden sm:inline">
                            {refreshingHealth ? 'Checking…' : checkedAgo ? `Health · ${checkedAgo}` : 'Health'}
                        </span>
                    </Button>

                    <div className="w-px h-6 bg-border shrink-0" />

                    {/* REST pill */}
                    <StatusPill label="REST" online={restOnline} checking={isDiscovering} />

                    {/* WS pill */}
                    <StatusPill label="WS" online={wsConnected} checking={isConnecting} />

                    {/* Engine health dot */}
                    {healthInfo && (
                        <span
                            className={`w-2 h-2 rounded-full shrink-0 ${engineHealthy ? 'bg-green-500' : 'bg-yellow-500'}`}
                            title={engineHealthy ? 'Engine healthy' : `Engine: ${healthInfo.status}`}
                        />
                    )}

                    {/* Version + tool count */}
                    {(version || availableTools.length > 0) && (
                        <span className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
                            {version && (
                                <span className="flex items-center gap-1">
                                    <Activity className="w-3 h-3" />
                                    v{version}
                                </span>
                            )}
                            {availableTools.length > 0 && (
                                <span>{availableTools.length} tools</span>
                            )}
                        </span>
                    )}

                    {/* Transport toggle */}
                    {showTransportToggle && (
                        <>
                            <div className="w-px h-6 bg-border shrink-0" />
                            <div className="flex items-center gap-0.5 shrink-0 bg-muted rounded-md p-0.5">
                                <ToggleBtn active={useWebSocket} onClick={() => setUseWebSocket(true)}>WS</ToggleBtn>
                                <ToggleBtn active={!useWebSocket} onClick={() => setUseWebSocket(false)}>REST</ToggleBtn>
                            </div>
                        </>
                    )}

                    {/* Active requests */}
                    {activeRequests.length > 0 && (
                        <div className="relative shrink-0">
                            <button
                                onClick={() => setShowRequests(v => !v)}
                                className="flex items-center gap-1.5 h-7 px-2.5 text-xs rounded-md bg-orange-50 dark:bg-orange-950/30 text-orange-600 border border-orange-300 dark:border-orange-700 hover:bg-orange-100 dark:hover:bg-orange-950/50 transition-colors"
                            >
                                <Loader2 className="w-3 h-3 animate-spin" />
                                {activeRequests.length} running
                            </button>
                            {showRequests && (
                                <div className="absolute top-full mt-1.5 right-0 z-50 bg-popover border rounded-lg shadow-lg py-1 min-w-[220px]">
                                    {activeRequests.map((req) => (
                                        <div key={req.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs hover:bg-accent">
                                            <span className="font-mono font-medium truncate flex-1">{req.tool}</span>
                                            <span className="text-muted-foreground shrink-0">
                                                {Math.round((Date.now() - req.startedAt.getTime()) / 1000)}s
                                            </span>
                                            <button onClick={() => cancelRequest(req.id)} className="text-destructive hover:text-destructive/80 shrink-0">
                                                <XCircle className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                    <div className="border-t mt-1 pt-1 px-3 pb-1">
                                        <button
                                            onClick={() => { cancelAll(); setShowRequests(false); }}
                                            className="text-xs text-destructive hover:text-destructive/80"
                                        >
                                            Cancel all
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Cancel when loading */}
                    {loading && (
                        <Button size="sm" variant="destructive" onClick={cancelAll} className="h-7 px-2.5 gap-1 text-xs shrink-0">
                            <XCircle className="w-3 h-3" /> Cancel
                        </Button>
                    )}

                    {/* Mobile-only second line: version + tool count */}
                    {(version || availableTools.length > 0) && (
                        <div className="flex sm:hidden w-full items-center gap-3 pt-1 text-[11px] text-muted-foreground border-t">
                            {version && (
                                <span className="flex items-center gap-1">
                                    <Activity className="w-3 h-3" />
                                    v{version}
                                </span>
                            )}
                            {availableTools.length > 0 && (
                                <span>{availableTools.length} tools</span>
                            )}
                            {healthInfo && !engineHealthy && (
                                <span className="text-yellow-600">Engine: {healthInfo.status}</span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <InstanceSelectorModal
                open={showInstanceModal}
                onClose={() => setShowInstanceModal(false)}
                currentUrl={baseUrl}
                onSelectUrl={handleInstanceSelect}
            />
        </>
    );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusPill({ label, online, checking }: { label: string; online: boolean; checking: boolean }) {
    return (
        <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-muted-foreground font-medium">{label}</span>
            {checking ? (
                <span className="flex items-center gap-1 text-xs text-yellow-500">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    checking
                </span>
            ) : online ? (
                <span className="flex items-center gap-1 text-xs font-medium text-green-500">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    online
                </span>
            ) : (
                <span className="flex items-center gap-1 text-xs text-red-500">
                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                    offline
                </span>
            )}
        </div>
    );
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`h-6 px-2.5 text-xs rounded transition-colors ${
                active
                    ? 'bg-background text-foreground shadow-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground'
            }`}
        >
            {children}
        </button>
    );
}
