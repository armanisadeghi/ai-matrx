"use client";

/**
 * Sandbox Infrastructure admin panel.
 *
 * Single pane of glass for the EC2 + hosted orchestrators that back the
 * /code editor's sandbox feature. Surfaces the silent-failure modes that
 * bit us on 2026-04-26 (disk-full → deploy fails → orchestrator stays on
 * stale code for 73 days):
 *
 *   - Per-tier health + version + route count (catches stale deploys).
 *   - Disk pressure with red threshold at 80% (catches disk-full early).
 *   - Latest GHA deploy runs (catches silently-failing deploys).
 *   - One-click "trigger deploy" (recover without leaving the browser).
 *
 * Backed by:
 *   - GET  /api/sandbox/system           → both tiers' /system payloads
 *   - GET  /api/sandbox/deploy           → recent matrx-sandbox GHA runs
 *   - POST /api/sandbox/deploy           → workflow_dispatch the deploy
 */

import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "@/utils/errors";
import {
    Activity,
    AlertCircle,
    Box,
    CheckCircle2,
    CircleAlert,
    Clock,
    Cpu,
    ExternalLink,
    HardDrive,
    History,
    Loader2,
    MemoryStick,
    PlayCircle,
    RefreshCw,
    Server,
    XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

interface OrchestratorSystem {
    tier: "ec2" | "hosted" | null;
    uptime_seconds: number;
    disk_total_bytes: number;
    disk_used_bytes: number;
    disk_free_bytes: number;
    disk_used_pct: number;
    memory_total_kb: number;
    memory_used_kb: number;
    memory_available_kb: number;
    memory_used_pct: number;
    cpu_count: number;
    load_1m: number | null;
    load_5m: number | null;
    load_15m: number | null;
    sandboxes_in_db: number;
    sandboxes_active: number;
    sandbox_containers_total: number;
    sandbox_containers_running: number;
}

interface TierStatus {
    tier: "ec2" | "hosted";
    url: string;
    ok: boolean;
    status: "healthy" | "unreachable" | "error";
    error?: string;
    system?: OrchestratorSystem;
    info?: { version?: string; tier?: string };
    routeCount?: number;
    fetchedAt: string;
}

interface DeployRun {
    id: number;
    run_number: number;
    status: string; // "queued" | "in_progress" | "completed"
    conclusion: string | null; // "success" | "failure" | "cancelled" | null while running
    head_branch: string;
    head_sha: string;
    event: string;
    display_title: string;
    actor: string | null;
    created_at: string;
    updated_at: string;
    run_started_at: string;
    html_url: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function bytesHuman(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }
    return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

function uptimeHuman(seconds: number): string {
    if (seconds < 60) return `${seconds.toFixed(0)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(0)}m`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
    return `${(seconds / 86400).toFixed(1)}d`;
}

function relativeTime(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
    return `${Math.round(ms / 86_400_000)}d ago`;
}

function pctClass(pct: number): string {
    if (pct >= 90) return "text-destructive";
    if (pct >= 80) return "text-orange-500 dark:text-orange-400";
    if (pct >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-emerald-600 dark:text-emerald-400";
}

function pctBarBg(pct: number): string {
    if (pct >= 90) return "bg-destructive";
    if (pct >= 80) return "bg-orange-500";
    if (pct >= 60) return "bg-yellow-500";
    return "bg-emerald-500";
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function PressureBar({ label, pct, hint }: { label: string; pct: number; hint?: string }) {
    return (
        <div>
            <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className={`font-mono ${pctClass(pct)}`}>{pct.toFixed(1)}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full bg-muted rounded overflow-hidden">
                <div
                    className={`h-full transition-all ${pctBarBg(pct)}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                />
            </div>
            {hint && <div className="mt-1 text-xs text-muted-foreground font-mono">{hint}</div>}
        </div>
    );
}

function StatRow({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
    return (
        <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-mono text-foreground text-right">
                {value}
                {hint && <span className="text-muted-foreground ml-1.5">{hint}</span>}
            </span>
        </div>
    );
}

function TierCard({ tier }: { tier: TierStatus }) {
    const sys = tier.system;
    const tierLabel = tier.tier === "ec2" ? "EC2" : "Hosted";

    return (
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <div className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-muted-foreground" />
                        <h3 className="text-base font-semibold">{tierLabel} tier</h3>
                        {tier.ok ? (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-600/40 dark:text-emerald-400 dark:border-emerald-400/40">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> healthy
                            </Badge>
                        ) : (
                            <Badge variant="destructive">
                                <XCircle className="w-3 h-3 mr-1" /> {tier.status}
                            </Badge>
                        )}
                    </div>
                    <a
                        href={tier.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 mt-1"
                    >
                        {tier.url} <ExternalLink className="w-3 h-3" />
                    </a>
                </div>
                <div className="text-right">
                    <div className="text-xs text-muted-foreground">version</div>
                    <div className="text-sm font-mono">
                        {tier.info?.version ?? <span className="text-muted-foreground">—</span>}
                    </div>
                </div>
            </div>

            {!tier.ok && tier.error && (
                <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                    <AlertCircle className="w-3 h-3 inline mr-1" />
                    {tier.error}
                </div>
            )}

            {sys && (
                <>
                    <div className="grid gap-2.5">
                        <PressureBar
                            label="Disk"
                            pct={sys.disk_used_pct}
                            hint={`${bytesHuman(sys.disk_used_bytes)} / ${bytesHuman(sys.disk_total_bytes)}  ·  ${bytesHuman(sys.disk_free_bytes)} free`}
                        />
                        <PressureBar
                            label="Memory"
                            pct={sys.memory_used_pct}
                            hint={`${bytesHuman(sys.memory_used_kb * 1024)} / ${bytesHuman(sys.memory_total_kb * 1024)}`}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2 border-t border-border">
                        <StatRow label="CPU" value={`${sys.cpu_count}`} hint="cores" />
                        <StatRow
                            label="Load"
                            value={
                                sys.load_1m !== null
                                    ? `${sys.load_1m.toFixed(2)} ${sys.load_5m?.toFixed(2) ?? "—"} ${sys.load_15m?.toFixed(2) ?? "—"}`
                                    : "—"
                            }
                        />
                        <StatRow label="Uptime" value={uptimeHuman(sys.uptime_seconds)} />
                        <StatRow label="Routes" value={tier.routeCount ?? "—"} />
                        <StatRow label="Sandboxes (DB)" value={`${sys.sandboxes_active} / ${sys.sandboxes_in_db}`} hint="active / total" />
                        <StatRow
                            label="Containers"
                            value={`${sys.sandbox_containers_running} / ${sys.sandbox_containers_total}`}
                            hint="running / total"
                        />
                    </div>

                    {sys.sandboxes_active !== sys.sandbox_containers_running && (
                        <div className="rounded border border-yellow-500/30 bg-yellow-500/5 p-2 text-xs text-yellow-700 dark:text-yellow-400">
                            <CircleAlert className="w-3 h-3 inline mr-1" />
                            DB shows {sys.sandboxes_active} active sandboxes but Docker has {sys.sandbox_containers_running} running. State drift — investigate.
                        </div>
                    )}
                </>
            )}

            <div className="text-xs text-muted-foreground pt-1">
                Fetched {relativeTime(tier.fetchedAt)}
            </div>
        </div>
    );
}

function DeployRunRow({ run }: { run: DeployRun }) {
    const isRunning = run.status !== "completed";
    const success = run.conclusion === "success";
    const failure = run.conclusion === "failure" || run.conclusion === "cancelled";

    return (
        <a
            href={run.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/50 rounded text-sm border-b border-border last:border-b-0"
        >
            <div className="flex items-center gap-3 min-w-0">
                {isRunning ? (
                    <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                ) : success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : failure ? (
                    <XCircle className="w-4 h-4 text-destructive shrink-0" />
                ) : (
                    <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0">
                    <div className="truncate text-foreground">{run.display_title}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                        #{run.run_number} · {run.event} · {run.head_branch}@{run.head_sha.slice(0, 7)}
                        {run.actor && ` · ${run.actor}`}
                    </div>
                </div>
            </div>
            <div className="text-xs text-muted-foreground shrink-0 text-right">
                <div>{relativeTime(run.run_started_at || run.created_at)}</div>
                <div className="font-mono">{run.conclusion ?? run.status}</div>
            </div>
        </a>
    );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SandboxInfraPage() {
    const [tiers, setTiers] = useState<TierStatus[]>([]);
    const [tiersLoading, setTiersLoading] = useState(true);
    const [tiersError, setTiersError] = useState<string | null>(null);
    const [runs, setRuns] = useState<DeployRun[]>([]);
    const [runsLoading, setRunsLoading] = useState(true);
    const [runsError, setRunsError] = useState<string | null>(null);
    const [deployTokenAttached, setDeployTokenAttached] = useState(false);
    const [dispatching, setDispatching] = useState(false);

    const refreshTiers = useCallback(async () => {
        setTiersLoading(true);
        setTiersError(null);
        try {
            const resp = await fetch("/api/sandbox/system");
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            setTiers(data.tiers ?? []);
        } catch (err) {
            setTiersError(err instanceof Error ? err.message : "unknown error");
        } finally {
            setTiersLoading(false);
        }
    }, []);

    const refreshRuns = useCallback(async () => {
        setRunsLoading(true);
        setRunsError(null);
        try {
            const resp = await fetch("/api/sandbox/deploy");
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            setRuns(data.runs ?? []);
            setDeployTokenAttached(!!data.tokenAttached);
        } catch (err) {
            setRunsError(err instanceof Error ? err.message : "unknown error");
        } finally {
            setRunsLoading(false);
        }
    }, []);

    useEffect(() => {
        void refreshTiers();
        void refreshRuns();
        // Poll every 30s — orchestrator state changes slowly, no need to hammer.
        const interval = setInterval(() => {
            void refreshTiers();
            void refreshRuns();
        }, 30_000);
        return () => clearInterval(interval);
    }, [refreshTiers, refreshRuns]);

    const triggerDeploy = useCallback(async () => {
        if (!confirm("Trigger a fresh matrx-sandbox deploy via GitHub Actions?")) return;
        setDispatching(true);
        try {
            const resp = await fetch("/api/sandbox/deploy", { method: "POST" });
            const data = await resp.json();
            if (!resp.ok) {
                toast.error(data.error || "Failed to trigger deploy", {
                    description: data.details,
                });
            } else {
                toast.success("Deploy queued", {
                    description: data.note ?? "Refreshing in 5s",
                });
                setTimeout(() => void refreshRuns(), 5000);
            }
        } catch (err) {
            toast.error("Network error", {
                description: extractErrorMessage(err),
            });
        } finally {
            setDispatching(false);
        }
    }, [refreshRuns]);

    return (
        <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden bg-textured">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold">Sandbox Infrastructure</h1>
                    <p className="text-sm text-muted-foreground">
                        Live health for the EC2 and self-hosted sandbox orchestrators. Auto-refreshes every 30s.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        void refreshTiers();
                        void refreshRuns();
                    }}
                    disabled={tiersLoading || runsLoading}
                >
                    <RefreshCw className={`w-4 h-4 mr-2 ${tiersLoading || runsLoading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-6">
                {/* Tier health cards */}
                <section>
                    <h2 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Activity className="w-4 h-4" />
                        Orchestrator health
                    </h2>
                    {tiersError && (
                        <div className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                            <AlertCircle className="w-4 h-4 inline mr-1" />
                            Couldn&apos;t load tier status: {tiersError}
                        </div>
                    )}
                    {tiersLoading && tiers.length === 0 && (
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                        </div>
                    )}
                    <div className="grid gap-3 md:grid-cols-2">
                        {tiers.map((t) => (
                            <TierCard key={t.tier} tier={t} />
                        ))}
                    </div>
                </section>

                {/* Recent GHA deploys */}
                <section>
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                            <History className="w-4 h-4" />
                            Recent matrx-sandbox deploys
                        </h2>
                        <Button
                            variant="default"
                            size="sm"
                            onClick={triggerDeploy}
                            disabled={dispatching || !deployTokenAttached}
                            title={!deployTokenAttached ? "Set MATRX_SANDBOX_GH_TOKEN env var to enable" : ""}
                        >
                            {dispatching ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <PlayCircle className="w-4 h-4 mr-2" />
                            )}
                            Trigger deploy
                        </Button>
                    </div>
                    {!deployTokenAttached && (
                        <div className="rounded border border-yellow-500/30 bg-yellow-500/5 p-2 text-xs text-yellow-700 dark:text-yellow-400 mb-2">
                            <CircleAlert className="w-3 h-3 inline mr-1" />
                            <code className="font-mono">MATRX_SANDBOX_GH_TOKEN</code> not set on the Vercel server. Read works (rate-limited);
                            triggering deploys is disabled.
                        </div>
                    )}
                    {runsError && (
                        <div className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                            <AlertCircle className="w-4 h-4 inline mr-1" />
                            Couldn&apos;t load deploy runs: {runsError}
                        </div>
                    )}
                    <div className="rounded-lg border border-border bg-card overflow-hidden">
                        {runsLoading && runs.length === 0 && (
                            <div className="px-3 py-4 text-sm text-muted-foreground flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                            </div>
                        )}
                        {!runsLoading && runs.length === 0 && !runsError && (
                            <div className="px-3 py-4 text-sm text-muted-foreground">No recent runs.</div>
                        )}
                        {runs.map((run) => (
                            <DeployRunRow key={run.id} run={run} />
                        ))}
                    </div>
                </section>

                {/* Glossary so non-experts can read the panel */}
                <section className="text-xs text-muted-foreground border-t border-border pt-3">
                    <div className="grid gap-1.5 md:grid-cols-2">
                        <p>
                            <span className="font-medium text-foreground inline-flex items-center gap-1">
                                <HardDrive className="w-3 h-3" /> Disk pressure
                            </span>
                            : red &gt;90% means deploys are about to fail. Run <code className="font-mono">docker system prune -af</code> on the host (the
                            new deploy pipeline does this automatically every push).
                        </p>
                        <p>
                            <span className="font-medium text-foreground inline-flex items-center gap-1">
                                <MemoryStick className="w-3 h-3" /> Memory pressure
                            </span>
                            : 80%+ on a tier means it&apos;s near capacity for new sandboxes. Each sandbox uses ~4 GB by default.
                        </p>
                        <p>
                            <span className="font-medium text-foreground inline-flex items-center gap-1">
                                <Cpu className="w-3 h-3" /> Load
                            </span>
                            : 1m / 5m / 15m averages from <code className="font-mono">/proc/loadavg</code>. Sustained &gt;CPU-count = overloaded.
                        </p>
                        <p>
                            <span className="font-medium text-foreground inline-flex items-center gap-1">
                                <Box className="w-3 h-3" /> DB vs Containers drift
                            </span>
                            : when DB shows more active sandboxes than Docker has running, an orchestrator restart lost track. Reconcile via the orchestrator
                            store&apos;s <code className="font-mono">reconcile()</code>.
                        </p>
                        <p>
                            <span className="font-medium text-foreground inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Stale deploy
                            </span>
                            : if the orchestrator&apos;s version differs from the latest <code className="font-mono">main</code> tag in matrx-sandbox, the
                            deploy didn&apos;t take effect. Check the latest GHA run for the failure.
                        </p>
                    </div>
                </section>
            </div>
        </div>
    );
}
