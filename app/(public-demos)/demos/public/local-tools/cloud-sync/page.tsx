'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    ArrowLeft,
    ArrowDownToLine,
    ArrowUpFromLine,
    Cloud,
    Loader2,
    Monitor,
    RefreshCw,
    Save,
    Settings2,
    Shield,
} from 'lucide-react';
import { ConnectionBar } from '../_lib/ConnectionBar';
import { useMatrxLocalContext } from '../_lib/MatrxLocalContext';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CloudSyncPage() {
    const local = useMatrxLocalContext();
    const { restGet, restPost, restPut, status } = local;

    // Configure form
    const [jwt, setJwt] = useState('');
    const [userId, setUserId] = useState('');
    const [configuring, setConfiguring] = useState(false);
    const [configResult, setConfigResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Settings
    const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
    const [settingsJson, setSettingsJson] = useState('');
    const [loadingSettings, setLoadingSettings] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [settingsMsg, setSettingsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Sync
    const [syncing, setSyncing] = useState<'push' | 'pull' | null>(null);
    const [syncResult, setSyncResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Instances
    const [instances, setInstances] = useState<unknown[] | null>(null);
    const [currentInstance, setCurrentInstance] = useState<unknown | null>(null);
    const [loadingInstances, setLoadingInstances] = useState(false);

    const configure = async () => {
        setConfiguring(true);
        setConfigResult(null);
        try {
            const res = (await restPost('/cloud/configure', { jwt, user_id: userId })) as Record<string, unknown>;
            setConfigResult({
                type: 'success',
                text: `Configured! ${JSON.stringify(res)}`,
            });
        } catch (err) {
            setConfigResult({
                type: 'error',
                text: err instanceof Error ? err.message : 'Configuration failed',
            });
        } finally {
            setConfiguring(false);
        }
    };

    const fetchSettings = async () => {
        setLoadingSettings(true);
        setSettingsMsg(null);
        try {
            const data = (await restGet('/cloud/settings')) as Record<string, unknown>;
            setSettings(data);
            setSettingsJson(JSON.stringify(data, null, 2));
        } catch (err) {
            setSettingsMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load' });
        } finally {
            setLoadingSettings(false);
        }
    };

    const saveSettings = async () => {
        setSavingSettings(true);
        setSettingsMsg(null);
        try {
            const parsed = JSON.parse(settingsJson);
            await restPut('/cloud/settings', parsed);
            setSettings(parsed);
            setSettingsMsg({ type: 'success', text: 'Settings updated' });
        } catch (err) {
            setSettingsMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' });
        } finally {
            setSavingSettings(false);
        }
    };

    const syncAction = async (action: 'push' | 'pull') => {
        setSyncing(action);
        setSyncResult(null);
        try {
            const res = (await restPost(`/cloud/sync/${action}`)) as Record<string, unknown>;
            setSyncResult({ type: 'success', text: `${action} complete: ${JSON.stringify(res)}` });
        } catch (err) {
            setSyncResult({ type: 'error', text: err instanceof Error ? err.message : `${action} failed` });
        } finally {
            setSyncing(null);
        }
    };

    const fetchInstances = async () => {
        setLoadingInstances(true);
        try {
            const [current, all] = await Promise.all([
                restGet('/cloud/instance') as Promise<unknown>,
                restGet('/cloud/instances') as Promise<unknown[]>,
            ]);
            setCurrentInstance(current);
            setInstances(Array.isArray(all) ? all : []);
        } catch {
            // Silently ignore
        } finally {
            setLoadingInstances(false);
        }
    };

    useEffect(() => {
        if (status === 'connected') {
            fetchSettings();
            fetchInstances();
        }
        // fetchSettings/fetchInstances are stable — intentionally omitted from deps
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

    const MsgBanner = ({ msg }: { msg: { type: 'success' | 'error'; text: string } | null }) =>
        msg ? (
            <div
                className={`text-xs px-3 py-2 rounded ${
                    msg.type === 'success'
                        ? 'bg-green-500/10 text-green-700 border border-green-500/30'
                        : 'bg-red-500/10 text-red-700 border border-red-500/30'
                }`}
            >
                {msg.text}
            </div>
        ) : null;

    return (
        <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-screen-2xl mx-auto space-y-4">
                    {/* Header */}
                    <div className="flex items-center gap-3">
                        <Link href="/demos/local-tools">
                            <Button variant="ghost" size="sm" className="h-7 px-2">
                                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold flex items-center gap-2">
                                <Cloud className="w-5 h-5" /> Cloud Sync
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Configure cloud sync, manage settings, and sync across devices
                            </p>
                        </div>
                    </div>

                    <ConnectionBar hook={local} />

                    {/* Configure Section */}
                    <div className="border rounded-lg p-4 bg-card space-y-3">
                        <h2 className="text-sm font-semibold flex items-center gap-2">
                            <Shield className="w-4 h-4" /> Configure Cloud Sync
                            <Badge variant="outline" className="text-[10px]">
                                POST /cloud/configure
                            </Badge>
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            Send Supabase JWT and User ID to enable cloud sync. Without this, all sync operations
                            return <code className="font-mono">not_configured</code>.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-muted-foreground block mb-1">Supabase JWT</label>
                                <input
                                    type="text"
                                    value={jwt}
                                    onChange={(e) => setJwt(e.target.value)}
                                    className="h-8 w-full text-xs font-mono rounded border px-2 bg-background"
                                    placeholder="eyJhbGciOi..."
                                />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground block mb-1">User ID</label>
                                <input
                                    type="text"
                                    value={userId}
                                    onChange={(e) => setUserId(e.target.value)}
                                    className="h-8 w-full text-xs font-mono rounded border px-2 bg-background"
                                    placeholder="uuid-here"
                                />
                            </div>
                        </div>
                        <Button
                            size="sm"
                            className="h-7 text-xs px-3 gap-1"
                            onClick={configure}
                            disabled={configuring || !jwt || !userId}
                        >
                            {configuring && <Loader2 className="w-3 h-3 animate-spin" />}
                            Configure
                        </Button>
                        <MsgBanner msg={configResult} />
                    </div>

                    {/* Settings Section */}
                    <div className="border rounded-lg p-4 bg-card space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold flex items-center gap-2">
                                <Settings2 className="w-4 h-4" /> Cloud Settings
                                <Badge variant="outline" className="text-[10px]">
                                    GET/PUT /cloud/settings
                                </Badge>
                            </h2>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs px-2 gap-1"
                                    onClick={fetchSettings}
                                    disabled={loadingSettings}
                                >
                                    {loadingSettings ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                        <RefreshCw className="w-3 h-3" />
                                    )}
                                    Reload
                                </Button>
                                <Button
                                    size="sm"
                                    className="h-7 text-xs px-2 gap-1"
                                    onClick={saveSettings}
                                    disabled={savingSettings || !settingsJson}
                                >
                                    {savingSettings ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                        <Save className="w-3 h-3" />
                                    )}
                                    Save
                                </Button>
                            </div>
                        </div>
                        <textarea
                            value={settingsJson}
                            onChange={(e) => setSettingsJson(e.target.value)}
                            className="w-full h-48 font-mono text-xs rounded border p-3 bg-background resize-y"
                            placeholder="Loading settings..."
                            spellCheck={false}
                        />
                        <MsgBanner msg={settingsMsg} />
                    </div>

                    {/* Sync Actions */}
                    <div className="border rounded-lg p-4 bg-card space-y-3">
                        <h2 className="text-sm font-semibold flex items-center gap-2">
                            <RefreshCw className="w-4 h-4" /> Sync Controls
                        </h2>
                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs px-3 gap-1.5"
                                onClick={() => syncAction('push')}
                                disabled={!!syncing}
                            >
                                {syncing === 'push' ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <ArrowUpFromLine className="w-3.5 h-3.5" />
                                )}
                                Push Settings
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs px-3 gap-1.5"
                                onClick={() => syncAction('pull')}
                                disabled={!!syncing}
                            >
                                {syncing === 'pull' ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <ArrowDownToLine className="w-3.5 h-3.5" />
                                )}
                                Pull Settings
                            </Button>
                        </div>
                        <MsgBanner msg={syncResult} />
                    </div>

                    {/* Instance Info */}
                    <div className="border rounded-lg p-4 bg-card space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold flex items-center gap-2">
                                <Monitor className="w-4 h-4" /> Instance Management
                                <Badge variant="outline" className="text-[10px]">
                                    GET /cloud/instance(s)
                                </Badge>
                            </h2>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2 gap-1"
                                onClick={fetchInstances}
                                disabled={loadingInstances}
                            >
                                {loadingInstances ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                    <RefreshCw className="w-3 h-3" />
                                )}
                                Refresh
                            </Button>
                        </div>

                        {currentInstance && (
                            <div className="space-y-1">
                                <h3 className="text-xs font-semibold text-muted-foreground">Current Instance</h3>
                                <pre className="text-xs font-mono bg-background border rounded p-2 overflow-x-auto">
                                    {JSON.stringify(currentInstance, null, 2)}
                                </pre>
                            </div>
                        )}

                        {instances && instances.length > 0 && (
                            <div className="space-y-1">
                                <h3 className="text-xs font-semibold text-muted-foreground">
                                    All Instances ({instances.length})
                                </h3>
                                <pre className="text-xs font-mono bg-background border rounded p-2 overflow-x-auto max-h-48">
                                    {JSON.stringify(instances, null, 2)}
                                </pre>
                            </div>
                        )}

                        {!currentInstance && !instances && !loadingInstances && (
                            <p className="text-xs text-muted-foreground italic">
                                No instance data — configure cloud sync first
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
