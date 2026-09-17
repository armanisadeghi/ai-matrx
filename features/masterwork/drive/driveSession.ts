// features/masterwork/drive/driveSession.ts
//
// RESUME WITHOUT LOSING A WORD — the pure core of the drive lane's memory.
//
// A phone in a car loses signal in a tunnel, locks its screen at a light, and
// gets killed by iOS when the map comes to the front. Every one of those ends
// the page. None of them may end the INTERVIEW: the Expert taps the one
// control again (or the page simply reloads itself) and carries on in the same
// conversation, with everything she already said still in it.
//
// The conversation is the durable thing — it lives in `chat.conversation` and
// is tied to the Rulebook by a `platform.associations` edge the moment the
// first turn lands (`record/service.ts::associateInterviewWhenPersisted`). So
// resuming is a QUESTION, not a cache: "is there a drive conversation for this
// Rulebook that is still warm?" — answered from this device first (instant,
// survives a reload with no round trip) and from the Rulebook's own interview
// list second (survives cleared storage, a different phone, a new tab).
//
// Everything here is pure or storage-only so it can be tested without React,
// a store, or a network. Guard: `__tests__/driveSession.test.ts`.

/** What this device remembers about an in-flight drive interview. */
export interface DriveSessionMemory {
  rulebookId: string;
  conversationId: string;
  /** When the session was first started. */
  startedAtMs: number;
  /** Touched on every spoken turn — the freshness the resume window reads. */
  lastActiveAtMs: number;
}

/** A candidate found on the Rulebook itself (survives this device entirely). */
export interface RulebookInterviewCandidate {
  conversationId: string;
  lastActiveAtMs: number;
}

export type DriveSessionResolution =
  | {
      kind: "resume";
      conversationId: string;
      /** Where the answer came from — surfaced honestly in the UI copy. */
      from: "this-device" | "this-rulebook";
      /** How long the session has been idle, so the page can say it. */
      idleMs: number;
    }
  | { kind: "fresh" };

/**
 * Decide whether a drive session continues or starts over.
 *
 * `resumeWindowMinutes` is a knob (`masterwork.drive.resume_window_minutes`) —
 * how long a paused drive stays the same interview. Shorter than the window
 * and it is the same drive; longer and picking up mid-sentence three days
 * later would be stranger than starting clean.
 */
export function resolveDriveSession(args: {
  rulebookId: string;
  remembered: DriveSessionMemory | null;
  /** Newest interview conversation on this Rulebook, if any. */
  rulebookCandidate: RulebookInterviewCandidate | null;
  nowMs: number;
  resumeWindowMinutes: number;
}): DriveSessionResolution {
  const { rulebookId, remembered, rulebookCandidate, nowMs } = args;
  const windowMs = Math.max(0, args.resumeWindowMinutes) * 60_000;

  const withinWindow = (at: number): boolean =>
    nowMs - at >= 0 && nowMs - at <= windowMs;

  if (
    remembered &&
    remembered.rulebookId === rulebookId &&
    remembered.conversationId.length > 0 &&
    withinWindow(remembered.lastActiveAtMs)
  ) {
    return {
      kind: "resume",
      conversationId: remembered.conversationId,
      from: "this-device",
      idleMs: nowMs - remembered.lastActiveAtMs,
    };
  }

  if (rulebookCandidate && withinWindow(rulebookCandidate.lastActiveAtMs)) {
    return {
      kind: "resume",
      conversationId: rulebookCandidate.conversationId,
      from: "this-rulebook",
      idleMs: nowMs - rulebookCandidate.lastActiveAtMs,
    };
  }

  return { kind: "fresh" };
}

// ── Device memory ───────────────────────────────────────────────────────────
// `localStorage` is a per-viewer convenience here and NOTHING depends on it:
// every read is wrapped, and a throw or a miss falls through to the Rulebook's
// own interview list. Private mode, cleared site data and a brand-new phone
// all land on the same second answer.

const STORAGE_PREFIX = "matrx.masterwork.drive.";

function storageKey(rulebookId: string): string {
  return `${STORAGE_PREFIX}${rulebookId}`;
}

export function readDriveMemory(rulebookId: string): DriveSessionMemory | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(rulebookId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parseDriveMemory(parsed);
  } catch {
    return null;
  }
}

export function writeDriveMemory(memory: DriveSessionMemory): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(memory.rulebookId),
      JSON.stringify(memory),
    );
  } catch {
    // Storage is unavailable (private window, blocked site data). The
    // interview is unaffected — the Rulebook's own interview list answers
    // the resume question on the next load.
  }
}

export function clearDriveMemory(rulebookId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(rulebookId));
  } catch {
    /* see writeDriveMemory */
  }
}

/** Exported for the guard: a stored blob is data, never trusted as a shape. */
export function parseDriveMemory(value: unknown): DriveSessionMemory | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.rulebookId !== "string" || row.rulebookId.length === 0) {
    return null;
  }
  if (
    typeof row.conversationId !== "string" ||
    row.conversationId.length === 0
  ) {
    return null;
  }
  const startedAtMs =
    typeof row.startedAtMs === "number" && Number.isFinite(row.startedAtMs)
      ? row.startedAtMs
      : null;
  const lastActiveAtMs =
    typeof row.lastActiveAtMs === "number" &&
    Number.isFinite(row.lastActiveAtMs)
      ? row.lastActiveAtMs
      : null;
  if (startedAtMs === null || lastActiveAtMs === null) return null;
  return {
    rulebookId: row.rulebookId,
    conversationId: row.conversationId,
    startedAtMs,
    lastActiveAtMs,
  };
}

/** "3 minutes ago" for the one line the page is allowed to show on resume. */
export function describeIdle(idleMs: number): string {
  const minutes = Math.round(idleMs / 60_000);
  if (minutes < 1) return "a moment ago";
  if (minutes === 1) return "a minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "an hour ago" : `${hours} hours ago`;
}
