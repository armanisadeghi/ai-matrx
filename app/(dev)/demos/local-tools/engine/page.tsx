'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, RefreshCw, Save, Settings2 } from 'lucide-react';
import { ConnectionBar } from '../_lib/ConnectionBar';
import { useMatrxLocalContext } from '../_lib/MatrxLocalContext';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EnginePage() {
    const local = useMatrxLocalContext();
    const { healthInfo, versionInfo, portInfo, restGet, restPut, status } = local;

    const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
    const [settingsJson, setSettingsJson] = useState('');
    const [loadingSettings, setLoadingSettings] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const fetchSettings = async () => {
        setLoadingSettings(true);
        setMessage(null);
        try {
            const data = (await restGet('/settings')) as Record<string, unknown>;
            setSettings(data);
            setSettingsJson(JSON.stringify(data, null, 2));
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load settings' });
        } finally {
            setLoadingSettings(false);
        }
    };

    const saveSettings = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const parsed = JSON.parse(settingsJson);
            await restPut('/settings', parsed);
            setSettings(parsed);
            setMessage({ type: 'success', text: 'Settings saved successfully' });
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save settings' });
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        if (status === 'connected') fetchSettings();
        // fetchSettings is stable — intentionally omitted from deps
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

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
                                <Settings2 className="w-5 h-5" /> Engine Settings
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                View and configure Matrx Local engine settings, ports, and health
                            </p>
                        </div>
                    </div>

                    <ConnectionBar hook={local} />

                    {/* Health & Version Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="border rounded-lg p-3 bg-card">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                Health
                            </h3>
                            {healthInfo ? (
                                <div className="space-y-1 text-xs">
                                    {Object.entries(healthInfo).map(([k, v]) => (
                                        <div key={k} className="flex justify-between">
                                            <span className="text-muted-foreground">{k}</span>
                                            <span className="font-mono">{String(v)}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground italic">Unavailable</p>
                            )}
                        </div>

                        <div className="border rounded-lg p-3 bg-card">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                Version
                            </h3>
                            {versionInfo ? (
                                <div className="space-y-1 text-xs">
                                    {Object.entries(versionInfo).map(([k, v]) => (
                                        <div key={k} className="flex justify-between">
                                            <span className="text-muted-foreground">{k}</span>
                                            <span className="font-mono">{String(v)}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground italic">Unavailable</p>
                            )}
                        </div>

                        <div className="border rounded-lg p-3 bg-card">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                Port Allocations
                            </h3>
                            {portInfo ? (
                                <div className="space-y-1 text-xs">
                                    {Object.entries(portInfo).map(([k, v]) => (
                                        <div key={k} className="flex justify-between">
                                            <span className="text-muted-foreground">{k}</span>
                                            <span className="font-mono">{String(v)}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground italic">Unavailable</p>
                            )}
                        </div>
                    </div>

                    {/* Settings Editor */}
                    <div className="border rounded-lg p-4 bg-card space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold flex items-center gap-2">
                                <Settings2 className="w-4 h-4" /> Engine Configuration
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
                                    disabled={saving || !settingsJson}
                                >
                                    {saving ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                        <Save className="w-3 h-3" />
                                    )}
                                    Save
                                </Button>
                            </div>
                        </div>

                        {message && (
                            <div
                                className={`text-xs px-3 py-2 rounded ${
                                    message.type === 'success'
                                        ? 'bg-green-500/10 text-green-700 border border-green-500/30'
                                        : 'bg-red-500/10 text-red-700 border border-red-500/30'
                                }`}
                            >
                                {message.text}
                            </div>
                        )}

                        <textarea
                            value={settingsJson}
                            onChange={(e) => setSettingsJson(e.target.value)}
                            className="w-full h-80 font-mono text-xs rounded border p-3 bg-background resize-y"
                            placeholder="Loading settings..."
                            spellCheck={false}
                        />

                        {settings && (
                            <p className="text-[10px] text-muted-foreground">
                                {Object.keys(settings).length} top-level keys •{' '}
                                <Badge variant="secondary" className="text-[10px] h-4">
                                    GET/PUT /settings
                                </Badge>
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
