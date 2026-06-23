"use client";

import React, { useState } from "react";
import { Activity, Loader2, CheckCircle, AlertCircle, Server, Database, Zap, Link, Clock, Hash, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiTestConfigPanel } from "@/components/api-test-config/ApiTestConfigPanel";
import { useApiTestConfig } from "@/components/api-test-config/useApiTestConfig";
import { TEST_ADMIN_TOKEN } from "../sample-prompt";

interface HealthResponse {
    status?: string;
    message?: string;
    timestamp?: string;
    [key: string]: unknown;
}

interface DetailedHealthResponse extends HealthResponse {
    database?: {
        status: string;
        latency_ms?: number;
    };
    cache?: {
        status: string;
    };
    services?: {
        [key: string]: {
            status: string;
            [key: string]: unknown;
        };
    };
}

interface RequestMeta {
    url: string;
    method: string;
    statusCode: number;
    statusText: string;
    responseTimeMs: number;
    requestedAt: string;
    hasAuth: boolean;
    serverType: string;
}

function HealthCard({ title, data, icon: Icon }: { title: string; data: Record<string, unknown>; icon: React.ComponentType<{ className?: string }> }) {
    const isHealthy = data?.status === 'healthy' || data?.status === 'ok';
    
    return (
        <div className="p-4 bg-muted rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">{title}</span>
            </div>
            <p className={`text-sm font-medium ${
                isHealthy ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'
            }`}>
                {String(data?.status ?? 'unknown')}
            </p>
            {typeof data?.latency_ms === 'number' && (
                <p className="text-xs text-muted-foreground mt-1">
                    {data.latency_ms}ms latency
                </p>
            )}
        </div>
    );
}

function RequestMetaPanel({ meta }: { meta: RequestMeta }) {
    const isSuccess = meta.statusCode >= 200 && meta.statusCode < 300;

    return (
        <div className="bg-muted/50 border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-border flex items-center gap-2 bg-muted">
                <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Request Details</span>
            </div>
            <div className="divide-y divide-border">
                <MetaRow icon={Link} label="URL" value={meta.url} mono />
                <MetaRow icon={Activity} label="Method" value={meta.method} />
                <MetaRow
                    icon={CheckCircle}
                    label="Status"
                    value={`${meta.statusCode} ${meta.statusText}`}
                    valueClass={isSuccess ? 'text-green-600 dark:text-green-400' : 'text-destructive'}
                />
                <MetaRow icon={Clock} label="Response Time" value={`${meta.responseTimeMs}ms`} />
                <MetaRow icon={Server} label="Server" value={meta.serverType === 'local' ? 'Local (localhost)' : 'Production'} />
                <MetaRow icon={Shield} label="Auth Token" value={meta.hasAuth ? 'Provided' : 'None'} valueClass={meta.hasAuth ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'} />
                <MetaRow icon={Clock} label="Requested At" value={new Date(meta.requestedAt).toLocaleString()} />
            </div>
        </div>
    );
}

function MetaRow({
    icon: Icon,
    label,
    value,
    mono = false,
    valueClass,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    mono?: boolean;
    valueClass?: string;
}) {
    return (
        <div className="flex items-start gap-3 px-4 py-2.5">
            <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <span className="text-xs text-muted-foreground w-28 flex-shrink-0">{label}</span>
            <span className={`text-xs break-all ${mono ? 'font-mono' : ''} ${valueClass ?? 'text-foreground'}`}>
                {value}
            </span>
        </div>
    );
}

export default function HealthTestClient() {
    const apiConfig = useApiTestConfig({
        defaultServerType: 'local',
        defaultAuthToken: TEST_ADMIN_TOKEN,
    });
    
    const [basicHealth, setBasicHealth] = useState<HealthResponse | null>(null);
    const [basicMeta, setBasicMeta] = useState<RequestMeta | null>(null);
    const [detailedHealth, setDetailedHealth] = useState<DetailedHealthResponse | null>(null);
    const [detailedMeta, setDetailedMeta] = useState<RequestMeta | null>(null);
    const [isLoadingBasic, setIsLoadingBasic] = useState(false);
    const [isLoadingDetailed, setIsLoadingDetailed] = useState(false);
    const [basicError, setBasicError] = useState<string | null>(null);
    const [detailedError, setDetailedError] = useState<string | null>(null);

    const checkBasicHealth = async () => {
        setIsLoadingBasic(true);
        setBasicError(null);
        setBasicHealth(null);
        setBasicMeta(null);

        const url = `${apiConfig.baseUrl}/health`;
        const requestedAt = new Date().toISOString();
        const start = performance.now();

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiConfig.authToken}`,
                },
            });
            const responseTimeMs = Math.round(performance.now() - start);

            setBasicMeta({
                url,
                method: 'GET',
                statusCode: response.status,
                statusText: response.statusText,
                responseTimeMs,
                requestedAt,
                hasAuth: !!apiConfig.authToken,
                serverType: apiConfig.serverType,
            });

            if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
            const data = await response.json();
            setBasicHealth(data);
        } catch (err) {
            setBasicError(err instanceof Error ? err.message : 'Health check failed');
        } finally {
            setIsLoadingBasic(false);
        }
    };

    const checkDetailedHealth = async () => {
        setIsLoadingDetailed(true);
        setDetailedError(null);
        setDetailedHealth(null);
        setDetailedMeta(null);

        const url = `${apiConfig.baseUrl}/health/detailed`;
        const requestedAt = new Date().toISOString();
        const start = performance.now();

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiConfig.authToken}`,
                },
            });
            const responseTimeMs = Math.round(performance.now() - start);

            setDetailedMeta({
                url,
                method: 'GET',
                statusCode: response.status,
                statusText: response.statusText,
                responseTimeMs,
                requestedAt,
                hasAuth: !!apiConfig.authToken,
                serverType: apiConfig.serverType,
            });

            if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
            const data = await response.json();
            setDetailedHealth(data);
        } catch (err) {
            setDetailedError(err instanceof Error ? err.message : 'Detailed health check failed');
        } finally {
            setIsLoadingDetailed(false);
        }
    };

    const isOverallHealthy = (data: HealthResponse) =>
        data.status === 'healthy' || data.status === 'ok';

    return (
        <div className="h-full flex flex-col overflow-hidden bg-background">
            {/* Fixed header section */}
            <div className="flex-shrink-0 p-3 space-y-2">
                <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" />
                    <h1 className="text-lg font-bold">Health Check</h1>
                </div>

                {/* API Configuration */}
                <ApiTestConfigPanel config={apiConfig} />
            </div>

            {/* Scrollable content area */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
                <div className="max-w-4xl space-y-4">
                    {/* Actions */}
                    <div className="bg-card border border-border rounded-lg p-4">
                        <div className="flex gap-4">
                            <Button 
                                onClick={checkBasicHealth} 
                                disabled={isLoadingBasic}
                                variant="outline"
                                className="flex-1"
                            >
                                {isLoadingBasic ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Checking...
                                    </>
                                ) : (
                                    <>
                                        <Activity className="w-4 h-4 mr-2" />
                                        Basic Health
                                    </>
                                )}
                            </Button>
                            <Button 
                                onClick={checkDetailedHealth} 
                                disabled={isLoadingDetailed}
                                className="flex-1"
                            >
                                {isLoadingDetailed ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Checking...
                                    </>
                                ) : (
                                    <>
                                        <Zap className="w-4 h-4 mr-2" />
                                        Detailed Health
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* Basic Health */}
                    {(basicMeta || basicError) && (
                        <div className="bg-card border border-border rounded-lg overflow-hidden">
                            <div className="border-b border-border px-6 py-3 flex items-center gap-2">
                                <Activity className="w-4 h-4 text-muted-foreground" />
                                <h3 className="font-semibold">Basic Health</h3>
                            </div>
                            <div className="p-4 space-y-4">
                                {basicMeta && <RequestMetaPanel meta={basicMeta} />}

                                {basicError ? (
                                    <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
                                        <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="font-semibold text-destructive mb-1">Health Check Failed</h4>
                                            <p className="text-sm text-destructive/80">{basicError}</p>
                                        </div>
                                    </div>
                                ) : basicHealth && (
                                    <div className="text-center py-4">
                                        <div className="inline-flex items-center justify-center p-3 rounded-full mb-3 bg-green-100 dark:bg-green-900/30">
                                            <CheckCircle className={`w-8 h-8 ${isOverallHealthy(basicHealth) ? 'text-green-600 dark:text-green-400' : 'text-amber-500'}`} />
                                        </div>
                                        <h2 className={`text-xl font-bold mb-1 ${isOverallHealthy(basicHealth) ? 'text-green-600 dark:text-green-400' : 'text-amber-500'}`}>
                                            {String(basicHealth.status ?? 'Healthy')}
                                        </h2>
                                        {basicHealth.message && (
                                            <p className="text-sm text-muted-foreground">{String(basicHealth.message)}</p>
                                        )}
                                        {basicHealth.timestamp && (
                                            <p className="text-xs text-muted-foreground mt-2">
                                                Server time: {new Date(String(basicHealth.timestamp)).toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Detailed Health */}
                    {(detailedMeta || detailedError) && (
                        <div className="bg-card border border-border rounded-lg overflow-hidden">
                            <div className="border-b border-border px-6 py-3 flex items-center gap-2">
                                <Zap className="w-4 h-4 text-muted-foreground" />
                                <h3 className="font-semibold">Detailed Health</h3>
                            </div>
                            <div className="p-4 space-y-4">
                                {detailedMeta && <RequestMetaPanel meta={detailedMeta} />}

                                {detailedError ? (
                                    <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
                                        <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="font-semibold text-destructive mb-1">Detailed Health Check Failed</h4>
                                            <p className="text-sm text-destructive/80">{detailedError}</p>
                                        </div>
                                    </div>
                                ) : detailedHealth && (
                                    <div className="space-y-4">
                                        <div className="text-center py-2">
                                            <div className="inline-flex items-center justify-center p-3 rounded-full mb-3 bg-green-100 dark:bg-green-900/30">
                                                <CheckCircle className={`w-8 h-8 ${isOverallHealthy(detailedHealth) ? 'text-green-600 dark:text-green-400' : 'text-amber-500'}`} />
                                            </div>
                                            <h2 className={`text-xl font-bold ${isOverallHealthy(detailedHealth) ? 'text-green-600 dark:text-green-400' : 'text-amber-500'}`}>
                                                {String(detailedHealth.status ?? 'Healthy')}
                                            </h2>
                                            {detailedHealth.timestamp && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Server time: {new Date(String(detailedHealth.timestamp)).toLocaleString()}
                                                </p>
                                            )}
                                        </div>

                                        {(detailedHealth.database || detailedHealth.cache || detailedHealth.services) && (
                                            <div className="grid grid-cols-2 gap-3">
                                                {detailedHealth.database && (
                                                    <HealthCard title="Database" data={detailedHealth.database as Record<string, unknown>} icon={Database} />
                                                )}
                                                {detailedHealth.cache && (
                                                    <HealthCard title="Cache" data={detailedHealth.cache as Record<string, unknown>} icon={Zap} />
                                                )}
                                                {detailedHealth.services && Object.entries(detailedHealth.services).map(([name, data]) => (
                                                    <HealthCard key={name} title={name} data={data as Record<string, unknown>} icon={Server} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
