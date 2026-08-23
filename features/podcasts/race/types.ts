/**
 * Podcast RACE — shared types for the systems-comparison surface.
 *
 * One race = ONE locked spec, produced by several competing systems at once.
 * The row (`podcast.pc_race`) is the durable record the surface reads and the
 * verdict writes back to; the two COMPUTE actions (start a race, re-run one
 * arm) go through the aidream API.
 */

/** The systems that compete. Server-side truth: RACE_ARM_NAMES. */
export type ArmKey = 'twin' | 'challenger' | 'frontier';

export const ARM_KEYS: ArmKey[] = ['twin', 'challenger', 'frontier'];

/** What each arm IS — shown in the UI so a judge knows what they're hearing. */
export const ARM_META: Record<ArmKey, { label: string; blurb: string }> = {
    twin: {
        label: 'Production pipeline',
        blurb: 'The system that ships today — fixed Python orchestration. The control.',
    },
    challenger: {
        label: 'Workflow graph',
        blurb: 'The same job composed from eight reusable workflows. The contender.',
    },
    frontier: {
        label: 'Frontier model floor',
        blurb: 'One strong model, one prompt, web search. The "do we even need a pipeline?" check.',
    },
};

export interface ArmData {
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
    cost_note?: string;
}

export interface RaceRow {
    id: string;
    topic: string;
    status: string;
    arms: Partial<Record<ArmKey, ArmData>>;
    request?: RaceSpec | null;
    verdict_winner?: string | null;
    verdict_notes?: string | null;
    verdict_at?: string | null;
    created_at: string;
    completed_at?: string | null;
}

/**
 * The spec every arm receives — the request body of `POST /podcast/races`.
 * Mirrors the server's `RaceRequest`.
 */
export interface RaceSpec {
    topic: string;
    host_count: number;
    language: string;
    image_cap: number;
    video_cap: number;
    include_feature_image: boolean;
    audio_style: string;
    /** THE LOCKED SPEC — delivered verbatim to every arm. */
    episode_spec: string;
}

/**
 * 🚨 Why `episode_spec` exists, in one place so nobody re-opens it:
 * a comparison is only meaningful when every dimension EXCEPT the one under
 * test is locked. If one system quietly writes a shorter episode, it spends
 * less on speech synthesis and "wins" on cost while proving nothing — half
 * the cake at half the price. Length, structure and tone are decided ONCE
 * here, for everyone.
 */
export const DEFAULT_EPISODE_SPEC =
    'Target a tight 8-10 minute episode (roughly 1,300-1,600 spoken words). ' +
    'Be concise and information-dense: no filler, no restating, no drawn-out ' +
    'intros or outros. Cover the subject completely within that budget — ' +
    'depth over padding. Two hosts in natural conversation.';

export const DEFAULT_SPEC: RaceSpec = {
    topic: '',
    host_count: 2,
    language: 'english',
    image_cap: 2,
    video_cap: 0,
    include_feature_image: false,
    audio_style: '',
    episode_spec: DEFAULT_EPISODE_SPEC,
};

/** Rough spoken-minutes estimate from a script, for normalized cost. */
export function estimatedMinutes(script?: string): number | null {
    if (!script) return null;
    const words = script.trim().split(/\s+/).filter(Boolean).length;
    if (words < 20) return null;
    return words / 150; // ~150 wpm conversational delivery
}

/**
 * Cost per delivered minute — the ONLY cost number that survives a length
 * difference. Raw cost is still shown beside it, never instead of it.
 */
export function costPerMinute(arm: ArmData): number | null {
    const mins = estimatedMinutes(arm.script);
    const cost = arm.cost_usd;
    if (!mins || !cost) return null;
    return cost / mins;
}
