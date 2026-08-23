'use client';

/**
 * The podcast RACE comparison surface — the poster-child judging page.
 *
 * One race = the same episode request produced three ways at once:
 * the frozen production pipeline (control), the composed workflow graph
 * (challenger), and a bare frontier model (floor). This page is where the
 * human listens side by side, sees the verified per-arm cost, and hands
 * down the verdict — which is written straight onto the race row.
 *
 * Reads/writes `podcast.pc_race` directly (client → Supabase, per the
 * architecture: no server hop for data).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { RaceLauncher } from '@/features/podcasts/race/RaceLauncher';
import { costPerMinute, estimatedMinutes } from '@/features/podcasts/race/types';

type ArmKey = 'twin' | 'challenger' | 'frontier';

interface ArmData {
    status?: string;
    cost_usd?: number | null;
    title?: string;
    description?: string;
    script?: string;
    audio_url?: string;
    image_urls?: string[];
    video_urls?: string[];
    official_video_url?: string;
    error?: string;
    started_at?: string;
    finished_at?: string;
    /** Stamped every 60s by the live arm; the lease the reaper reads. */
    heartbeat_at?: string;
    reaped_at?: string;
}

/**
 * The arm's lease, in seconds — must match ARM_LEASE_SECONDS in
 * aidream/services/podcast_race/reaper.py. Past this much silence the arm's
 * runner is gone and the server-side reaper will mark it failed.
 */
const ARM_LEASE_SECONDS = 10 * 60;

/**
 * The grace an arm with NO heartbeat gets (a row written before the lease
 * existed): its own 30-minute ceiling plus a lease. Mirrors
 * NO_HEARTBEAT_GRACE_SECONDS in the same reaper module — a start time is not a
 * liveness signal, and the twin arm legitimately works that long in silence.
 */
const NO_HEARTBEAT_GRACE_SECONDS = 30 * 60 + ARM_LEASE_SECONDS;

/**
 * A `running` arm whose heartbeat has lapsed is NOT running — its process died
 * and nobody is left to write a terminal status. Say so, instead of spinning a
 * spinner forever (race 58177feb's frontier arm sat "running" for 38 hours).
 * Same two clocks the server reaper uses, so the page never claims an arm is
 * lost that the sweep would leave alone.
 */
function isArmLost(data: ArmData): boolean {
    if (data.status !== 'running') return false;
    const stamp = data.heartbeat_at ?? data.started_at;
    // Running with no clock at all: the runner stamps a heartbeat in the same
    // write that claims `running`, so this can only be a writer that is gone.
    if (!stamp) return true;
    const ms = new Date(stamp).getTime();
    if (!Number.isFinite(ms)) return true;
    const graceSeconds = data.heartbeat_at ? ARM_LEASE_SECONDS : NO_HEARTBEAT_GRACE_SECONDS;
    return Date.now() - ms > graceSeconds * 1000;
}

function sinceLabel(iso?: string): string {
    if (!iso) return 'never';
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return 'unknown';
    const mins = Math.floor(ms / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

interface RaceRow {
    id: string;
    topic: string;
    status: string;
    arms: Partial<Record<ArmKey, ArmData>>;
    verdict_winner: string | null;
    verdict_notes: string | null;
    verdict_at: string | null;
    created_at: string;
    completed_at: string | null;
}

const ARM_META: Record<ArmKey, { label: string; blurb: string }> = {
    twin: {
        label: 'Frozen Pipeline',
        blurb: 'The hard-coded production system, unchanged — the control.',
    },
    challenger: {
        label: 'Challenger Graph',
        blurb: 'The composed workflow graph — nine reusable workflows.',
    },
    frontier: {
        label: 'Frontier Floor',
        blurb: 'One strong model, bare prompt, one shot — the floor.',
    },
};

const ARM_ORDER: ArmKey[] = ['twin', 'challenger', 'frontier'];

function money(v: number | null | undefined): string {
    if (v === null || v === undefined) return '—';
    return `$${v.toFixed(4)}`;
}

function duration(a?: string, b?: string): string {
    if (!a || !b) return '—';
    const ms = new Date(b).getTime() - new Date(a).getTime();
    if (!Number.isFinite(ms) || ms <= 0) return '—';
    const s = Math.round(ms / 1000);
    return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function StatusBadge({ status, lost = false }: { status?: string; lost?: boolean }) {
    if (lost) {
        return (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                runner lost
            </span>
        );
    }
    const tone =
        status === 'completed'
            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            : status === 'failed'
              ? 'bg-red-500/15 text-red-600 dark:text-red-400'
              : status === 'running'
                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                : 'bg-muted text-muted-foreground';
    return (
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${tone}`}>
            {status ?? 'pending'}
        </span>
    );
}

function ArmCard({
    arm,
    data,
    isWinner,
    onPick,
    canJudge,
}: {
    arm: ArmKey;
    data: ArmData;
    isWinner: boolean;
    onPick: () => void;
    canJudge: boolean;
}) {
    const meta = ARM_META[arm];
    const lost = isArmLost(data);
    return (
        <div
            className={`flex min-w-0 flex-1 flex-col gap-2 rounded-lg border p-3 ${
                isWinner ? 'border-emerald-500 ring-1 ring-emerald-500/40' : 'border-border'
            }`}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{meta.label}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{meta.blurb}</div>
                </div>
                <StatusBadge status={data.status} lost={lost} />
            </div>

            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                {/* 🚨 Cost per delivered minute leads, raw cost follows. A
                    system that simply made LESS episode is not cheaper — it
                    is smaller. The per-minute number is the only one that
                    survives a length difference, so it is the one the eye
                    lands on first. */}
                <span>
                    Cost/min{' '}
                    <span className="font-mono text-foreground">
                        {(() => {
                            const perMin = costPerMinute(data);
                            return perMin === null ? '—' : money(perMin);
                        })()}
                    </span>
                </span>
                <span className="opacity-70">
                    total <span className="font-mono text-foreground">{money(data.cost_usd)}</span>
                </span>
                <span className="opacity-70">
                    ~
                    <span className="font-mono text-foreground">
                        {(() => {
                            const m = estimatedMinutes(data.script);
                            return m === null ? '—' : `${m.toFixed(1)} min`;
                        })()}
                    </span>
                </span>
                <span>
                    Time <span className="font-mono text-foreground">{duration(data.started_at, data.finished_at)}</span>
                </span>
                <span>
                    Script <span className="font-mono text-foreground">{(data.script?.length ?? 0).toLocaleString()} ch</span>
                </span>
            </div>

            {lost ? (
                <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-700 dark:text-amber-400">
                    <span className="font-medium">Runner lost — will be reaped.</span> This arm still says
                    &ldquo;running&rdquo;, but the process driving it stopped reporting{' '}
                    {sinceLabel(data.heartbeat_at ?? data.started_at)}. Nothing is working on it; the server sweep will
                    mark it failed shortly.
                </div>
            ) : null}

            {data.error ? (
                <div className="rounded border border-red-500/40 bg-red-500/5 p-2 text-[11px] text-red-600 dark:text-red-400">
                    {data.error}
                </div>
            ) : null}

            {data.title ? <div className="text-sm font-medium text-foreground">{data.title}</div> : null}

            {data.audio_url ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption -- generated audio, transcript shown below
                <audio controls preload="none" src={data.audio_url} className="w-full" />
            ) : (
                <div className="rounded border border-dashed border-border p-2 text-center text-[11px] text-muted-foreground">
                    {lost ? 'no audio — this arm never finished' : 'no audio'}
                </div>
            )}

            {data.image_urls?.length ? (
                <div className="flex gap-1 overflow-x-auto">
                    {data.image_urls.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer" className="shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element -- external CDN thumbnails */}
                            <img src={url} alt="episode art" className="h-16 w-16 rounded object-cover" />
                        </a>
                    ))}
                </div>
            ) : null}

            {data.description ? (
                <div className="text-[12px] leading-snug text-muted-foreground">{data.description}</div>
            ) : null}

            <details className="min-w-0">
                <summary className="cursor-pointer text-[12px] font-medium text-foreground">Script</summary>
                <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[11px] leading-snug text-foreground">
                    {data.script || '(empty)'}
                </pre>
            </details>

            {canJudge ? (
                <button
                    type="button"
                    onClick={onPick}
                    className={`mt-auto rounded border px-2 py-1.5 text-sm font-medium transition-colors ${
                        isWinner
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'border-border text-foreground hover:bg-muted'
                    }`}
                >
                    {isWinner ? 'Your pick' : 'This one wins'}
                </button>
            ) : null}
        </div>
    );
}

export default function PodcastRacePage() {
    const supabase = useMemo(() => createClient(), []);
    const [races, setRaces] = useState<RaceRow[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const { data, error } = await supabase
            .schema('podcast')
            .from('pc_race')
            .select('id, topic, status, arms, verdict_winner, verdict_notes, verdict_at, created_at, completed_at')
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(25);
        if (error) {
            setLoadError(error.message);
            return;
        }
        setLoadError(null);
        const rows = (data ?? []) as unknown as RaceRow[];
        setRaces(rows);
        setSelectedId((prev) => prev ?? rows[0]?.id ?? null);
    }, [supabase]);

    useEffect(() => {
        void load();
    }, [load]);

    const race = races.find((r) => r.id === selectedId) ?? null;

    // Live refresh while the selected race is still running.
    useEffect(() => {
        if (!race || race.status !== 'running') return;
        const t = setInterval(() => void load(), 10_000);
        return () => clearInterval(t);
    }, [race, load]);

    useEffect(() => {
        setNotes(race?.verdict_notes ?? '');
    }, [race?.id, race?.verdict_notes]);

    const saveVerdict = useCallback(
        async (winner: ArmKey | null) => {
            if (!race) return;
            setSaving(true);
            const { data: auth } = await supabase.auth.getUser();
            const { error } = await supabase
                .schema('podcast')
                .from('pc_race')
                .update({
                    verdict_winner: winner,
                    verdict_notes: notes || null,
                    verdict_at: new Date().toISOString(),
                    verdict_by: auth.user?.id ?? null,
                })
                .eq('id', race.id);
            setSaving(false);
            if (!error) {
                setSavedAt(new Date().toLocaleTimeString());
                void load();
            } else {
                setLoadError(error.message);
            }
        },
        [race, notes, supabase, load],
    );

    return (
        <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
            <RaceLauncher
                onStarted={(raceId) => {
                    setSelectedId(raceId);
                    void load();
                }}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h1 className="text-lg font-semibold text-foreground">Podcast Race</h1>
                    <p className="text-[12px] text-muted-foreground">
                        Same request, three systems. Listen, compare, hand down the verdict.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={selectedId ?? ''}
                        onChange={(e) => setSelectedId(e.target.value || null)}
                        className="max-w-[420px] rounded border border-border bg-background px-2 py-1 text-[12px] text-foreground"
                    >
                        {races.map((r) => (
                            <option key={r.id} value={r.id}>
                                {new Date(r.created_at).toLocaleString()} · {r.status} · {r.topic.slice(0, 60)}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="rounded border border-border px-2 py-1 text-[12px] text-foreground hover:bg-muted"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {loadError ? (
                <div className="rounded border border-red-500/40 bg-red-500/5 p-2 text-[12px] text-red-600 dark:text-red-400">
                    {loadError}
                </div>
            ) : null}

            {!race ? (
                <div className="rounded border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    No races yet. Fire one with <code>scripts/run_podcast_race.py</code> in aidream.
                </div>
            ) : (
                <>
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <div className="flex items-center gap-2">
                            <StatusBadge
                                status={race.status}
                                lost={
                                    race.status === 'running' &&
                                    ARM_ORDER.every((a) => {
                                        const d = race.arms?.[a] ?? {};
                                        return d.status !== 'running' || isArmLost(d);
                                    })
                                }
                            />
                            <span className="text-[11px] text-muted-foreground">
                                started {new Date(race.created_at).toLocaleString()}
                            </span>
                            {race.verdict_winner ? (
                                <span className="ml-auto text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
                                    Verdict: {ARM_META[race.verdict_winner as ArmKey]?.label ?? race.verdict_winner}
                                </span>
                            ) : null}
                        </div>
                        <p className="mt-1 text-sm text-foreground">{race.topic}</p>
                    </div>

                    <div className="flex flex-col gap-3 lg:flex-row">
                        {ARM_ORDER.map((arm) => (
                            <ArmCard
                                key={arm}
                                arm={arm}
                                data={race.arms?.[arm] ?? {}}
                                isWinner={race.verdict_winner === arm}
                                canJudge
                                onPick={() => void saveVerdict(arm)}
                            />
                        ))}
                    </div>

                    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                        <label htmlFor="race-notes" className="text-[12px] font-medium text-foreground">
                            What did you notice? (becomes training signal)
                        </label>
                        <textarea
                            id="race-notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder="Which parts were strong or weak, what was wrong, what you would have wanted instead…"
                            className="w-full rounded border border-border bg-background p-2 text-[13px] text-foreground"
                        />
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => void saveVerdict((race.verdict_winner as ArmKey) ?? null)}
                                className="rounded border border-border px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
                            >
                                {saving ? 'Saving…' : 'Save notes'}
                            </button>
                            {savedAt ? (
                                <span className="text-[11px] text-muted-foreground">saved {savedAt}</span>
                            ) : null}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
