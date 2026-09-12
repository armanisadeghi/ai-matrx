/**
 * Server-side timing utility for measuring named spans during SSR.
 *
 * Usage in any server component or layout:
 *   const timer = createServerTimer();
 *   const authData = await timer.measure('auth', () => supabase.auth.getUser());
 *   const shellData = await timer.measure('rpc', () => getSSRShellData(supabase, userId));
 *   timer.mark('render-start');
 *   // ... render work ...
 *   timer.done();  // logs summary to terminal
 *
 * The timer produces:
 *   1. Structured terminal output with color-coded durations
 *   2. A Server-Timing header value (for browser DevTools Network > Timing tab)
 *
 * Server-Timing header format (RFC 7611):
 *   Server-Timing: auth;dur=12.3;desc="Supabase auth", rpc;dur=45.1;desc="Shell RPC"
 *   → Visible in DevTools under Network > select request > Timing tab
 */

interface TimingEntry {
    name: string;
    description?: string;
    startMs: number;
    durationMs?: number;
}

export interface ServerTimer {
    measure: <T>(name: string, fn: () => Promise<T>, description?: string) => Promise<T>;
    mark: (name: string, description?: string) => void;
    done: (label?: string) => void;
    getEntries: () => ReadonlyArray<TimingEntry & { durationMs: number }>;
    getServerTimingHeader: () => string;
    getTotalMs: () => number;
}

// UNFINISHED, NOT DEAD. This timer has no importers yet — it is waiting to be
// wired into the SSR shell, not abandoned (/policies/unfinished-work-alarm.md).
// Its old `SSR_TIMING=1` switch is gone: an env var may not control behaviour
// (Arman, 2026-09-10). When this is wired up, the on/off switch becomes a knob
// under platform > observability, beside `platform.debug.config_parity_shadow`.
const ENABLE_TIMING = process.env.NODE_ENV === 'development';

function createNoopTimer(): ServerTimer {
    return {
        measure: async <T>(_name: string, fn: () => Promise<T>) => fn(),
        mark: () => {},
        done: () => {},
        getEntries: () => [],
        getServerTimingHeader: () => '',
        getTotalMs: () => 0,
    };
}

export function createServerTimer(): ServerTimer {
    if (!ENABLE_TIMING) return createNoopTimer();

    const t0 = performance.now();
    const entries: TimingEntry[] = [];

    const measure = async <T>(name: string, fn: () => Promise<T>, description?: string): Promise<T> => {
        const start = performance.now();
        try {
            const result = await fn();
            entries.push({ name, description, startMs: start - t0, durationMs: performance.now() - start });
            return result;
        } catch (err) {
            entries.push({ name: `${name}:error`, description, startMs: start - t0, durationMs: performance.now() - start });
            throw err;
        }
    };

    const mark = (name: string, description?: string) => {
        entries.push({ name, description, startMs: performance.now() - t0, durationMs: 0 });
    };

    const getEntries = () =>
        entries.filter((e): e is TimingEntry & { durationMs: number } => e.durationMs !== undefined);

    const getTotalMs = () => performance.now() - t0;

    const getServerTimingHeader = () =>
        entries
            .filter(e => e.durationMs && e.durationMs > 0)
            .map(e => {
                const parts = [e.name, `dur=${e.durationMs!.toFixed(1)}`];
                if (e.description) parts.push(`desc="${e.description}"`);
                return parts.join(';');
            })
            .join(', ');

    const done = (label = 'SSR Layout') => {
        const total = getTotalMs();
        const maxNameLen = Math.max(...entries.map(e => e.name.length), 5);

        const lines = entries.map(e => {
            const dur = e.durationMs ?? 0;
            const bar = dur > 0 ? '█'.repeat(Math.max(1, Math.round(dur / 5))) : '·';
            const color = dur > 100 ? '\x1b[31m' : dur > 50 ? '\x1b[33m' : '\x1b[32m';
            const reset = '\x1b[0m';
            return `  ${color}${e.name.padEnd(maxNameLen)}${reset}  ${dur > 0 ? dur.toFixed(1).padStart(8) + 'ms' : 'mark'.padStart(10)}  ${color}${bar}${reset}`;
        });

        console.log(
            `\n\x1b[36m⏱ ${label}\x1b[0m  (${total.toFixed(1)}ms total)\n` +
            lines.join('\n') +
            '\n'
        );
    };

    return { measure, mark, done, getEntries, getServerTimingHeader, getTotalMs };
}
