// features/admin/spend/dailySpendPopoverState.ts
//
// "Shown N times today, dismissed for the rest of today" — local-first, per
// viewer, per local day, exactly as the window-persistence contract wants a
// per-viewer convenience kept (features/window-panels/FEATURE.md). Nothing here
// reaches the server: how many times YOUR browser has raised the window is not
// platform state, and the cadence that governs it is the knob
// `platform.spend_popover.times_per_day`.
//
// Every read and write is wrapped: a private window, cleared site data, or a
// browser that blocks storage must degrade to "not shown yet", never throw.
//
// Doc: features/admin/spend/FEATURE.md

const STORAGE_KEY = "matrx.spend_popover.v1";

export interface DailySpendPopoverState {
  /** Local day, `YYYY-MM-DD`. */
  day: string;
  /** How many times the window has been raised today. */
  shown: number;
  /** True once the viewer dismissed it — no more today, whatever the cadence. */
  dismissed: boolean;
}

/** The viewer's local day, matching the zone the RPC cut its boundaries in. */
export function localDay(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyState(day: string): DailySpendPopoverState {
  return { day, shown: 0, dismissed: false };
}

export function readState(day: string = localDay()): DailySpendPopoverState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState(day);
    const parsed = JSON.parse(raw) as Partial<DailySpendPopoverState> | null;
    if (!parsed || parsed.day !== day) return emptyState(day);
    return {
      day,
      shown: typeof parsed.shown === "number" ? parsed.shown : 0,
      dismissed: parsed.dismissed === true,
    };
  } catch {
    return emptyState(day);
  }
}

function writeState(state: DailySpendPopoverState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — the window simply shows again next load */
  }
}

export function recordShown(day: string = localDay()): DailySpendPopoverState {
  const current = readState(day);
  const next = { ...current, shown: current.shown + 1 };
  writeState(next);
  return next;
}

export function recordDismissed(day: string = localDay()): void {
  const current = readState(day);
  writeState({ ...current, dismissed: true });
}

/**
 * Should the window be raised right now?
 * `timesPerDay` of 0 means the viewer's organization turned it off entirely.
 */
export function shouldShow(
  timesPerDay: number,
  day: string = localDay(),
): boolean {
  if (!Number.isFinite(timesPerDay) || timesPerDay <= 0) return false;
  const state = readState(day);
  if (state.dismissed) return false;
  return state.shown < timesPerDay;
}
