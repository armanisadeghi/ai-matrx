'use client';

/**
 * Start a RACE from the UI — configure the locked spec, hit the API, watch it go.
 *
 * This is the door that makes the comparison a product rather than a script an
 * engineer runs on their laptop. Everything a race varies is editable here, and
 * everything it must LOCK is shown as locked with the reason attached.
 *
 * Canonical machinery, nothing bespoke: `callApi` starts the run (typed path,
 * org/project/task injected for us), the server owns every arm durably on one
 * `podcast.pc_race` row, and closing this page loses nothing — the arms keep
 * running server-side and the surface re-reads the row.
 */

import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProTextarea } from '@/components/official/ProTextarea';
import { callApi } from '@/lib/api/call-api';
import type { paths } from '@/types/python-generated/api-types';
import { useAppDispatch } from '@/lib/redux/hooks';
import { toast } from '@/lib/toast';
import { ARM_KEYS, ARM_META, DEFAULT_SPEC, type RaceSpec } from './types';

interface Props {
    /** Called with the new race id the moment the server mints the row. */
    onStarted?: (raceId: string) => void;
}

export function RaceLauncher({ onStarted }: Props) {
    const dispatch = useAppDispatch();
    const [spec, setSpec] = useState<RaceSpec>(DEFAULT_SPEC);
    const [starting, setStarting] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const set = <K extends keyof RaceSpec>(key: K, value: RaceSpec[K]) =>
        setSpec((s) => ({ ...s, [key]: value }));

    const start = async () => {
        if (spec.topic.trim().length < 8) {
            toast.error('Give the systems a real subject to work with (8+ characters).');
            return;
        }
        setStarting(true);
        try {
            const result = await dispatch(
                callApi({
                    // The endpoint is live (aidream POST /podcast/races). The
                    // generated `paths` union is rebuilt from the DEPLOYED
                    // OpenAPI spec, so this narrows itself the first time
                    // `pnpm sync-types` runs after the deploy carrying it —
                    // at which point this cast should be deleted.
                    path: '/podcast/races' as keyof paths,
                    method: 'POST',
                    body: spec as never,
                    stream: true,
                    // The arms run for many minutes server-side and record
                    // durably as they land; we only need the row id to start
                    // watching. The server emits it (PodcastRaceStartedEvent)
                    // before any arm spends a cent.
                    onStreamEvent: (event) => {
                        const data = (event as { data?: { race_id?: string } })?.data;
                        if (data?.race_id) onStarted?.(data.race_id);
                    },
                }),
            );
            const error = (result as { error?: { message?: string } }).error;
            if (error) {
                toast.error(error.message ?? 'The race could not be started.');
                return;
            }
            toast.success('Race started — every system is working on it now.');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'The race could not be started.');
        } finally {
            setStarting(false);
        }
    };

    return (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        Start a race
                    </h2>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        One subject, one set of rules — every system builds it at the same time.
                    </p>
                </div>
                <Button onClick={start} disabled={starting} size="sm">
                    {starting ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Play className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {starting ? 'Starting…' : 'Start race'}
                </Button>
            </div>

            <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                What should the episode be about?
            </label>
            <ProTextarea
                value={spec.topic}
                onChange={(e) => set('topic', e.target.value)}
                placeholder="The subject every system will research and turn into an episode…"
                rows={3}
            />

            {/* THE LOCKED SPEC — the thing that makes the result mean anything. */}
            <div className="mt-4 rounded-md border border-amber-300/60 bg-amber-50/60 p-3 dark:border-amber-700/40 dark:bg-amber-950/20">
                <label className="mb-1 block text-xs font-semibold text-amber-900 dark:text-amber-200">
                    The rules every system must follow
                </label>
                <p className="mb-2 text-[11px] leading-relaxed text-amber-800/80 dark:text-amber-300/70">
                    Delivered word-for-word to all of them. This is what keeps the comparison
                    honest: if one system quietly made a shorter episode it would spend less on
                    voice and look cheaper while proving nothing. Length and shape are decided
                    here, once, for everyone.
                </p>
                <ProTextarea
                    value={spec.episode_spec}
                    onChange={(e) => set('episode_spec', e.target.value)}
                    rows={3}
                />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Hosts">
                    <NumberInput
                        value={spec.host_count}
                        min={1}
                        max={10}
                        onChange={(n) => set('host_count', n)}
                    />
                </Field>
                <Field label="Language">
                    <TextInput
                        value={spec.language}
                        onChange={(v) => set('language', v)}
                    />
                </Field>
                <Field label="Images">
                    <NumberInput
                        value={spec.image_cap}
                        min={0}
                        max={5}
                        onChange={(n) => set('image_cap', n)}
                    />
                </Field>
                <Field label="Videos">
                    <NumberInput
                        value={spec.video_cap}
                        min={0}
                        max={2}
                        onChange={(n) => set('video_cap', n)}
                    />
                </Field>
            </div>

            <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="mt-3 text-xs text-neutral-500 underline-offset-2 hover:underline dark:text-neutral-400"
            >
                {showAdvanced ? 'Hide' : 'Show'} voice & artwork options
            </button>
            {showAdvanced && (
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="How it should sound">
                        <TextInput
                            value={spec.audio_style}
                            placeholder="e.g. warm, energetic, measured"
                            onChange={(v) => set('audio_style', v)}
                        />
                    </Field>
                    <Field label="Cover art from the script">
                        <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
                            <input
                                type="checkbox"
                                checked={spec.include_feature_image}
                                onChange={(e) =>
                                    set('include_feature_image', e.target.checked)
                                }
                            />
                            Derive a feature image
                        </label>
                    </Field>
                </div>
            )}

            {/* Who competes — stated plainly, because a judge should know what
                they are listening to (and, in blind mode, what the pool is). */}
            <div className="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-800">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Competing systems
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                    {ARM_KEYS.map((key) => (
                        <div
                            key={key}
                            className="rounded border border-neutral-200 p-2 dark:border-neutral-800"
                        >
                            <div className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                                {ARM_META[key].label}
                            </div>
                            <div className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                                {ARM_META[key].blurb}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                {label}
            </label>
            {children}
        </div>
    );
}

function TextInput({
    value,
    onChange,
    placeholder,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}) {
    return (
        <input
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
    );
}

function NumberInput({
    value,
    onChange,
    min,
    max,
}: {
    value: number;
    onChange: (n: number) => void;
    min: number;
    max: number;
}) {
    return (
        <input
            type="number"
            value={value}
            min={min}
            max={max}
            onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
            }}
            className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
    );
}
