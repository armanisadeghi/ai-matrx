/**
 * Truth about "did this handle get tracked". The intake door answers an NDJSON stream that can
 * drop (network blip, proxy timeout, a tab throttled) AFTER the server has already saved the
 * account. A dropped stream is therefore never a verdict: the saved state is re-read and
 * reported. "Not reachable" is reserved for a drop where nothing was saved either.
 */

export interface SavedAccountRow {
  trackedAccountId: string;
  platform: string;
  handle: string;
}

export interface TrackOutcome {
  ok: boolean;
  /** True only for a real connection failure where nothing had been saved. */
  unavailable: boolean;
  trackedAccountId: string | null;
  message: string | null;
}

/** The bare, comparable handle of something typed: "@x", "x", "https://instagram.com/x/?hl=en". */
export function comparableHandle(typed: string): string {
  let text = typed.trim();
  try {
    if (/^https?:\/\//i.test(text)) {
      const url = new URL(text);
      const parts = url.pathname.split("/").filter(Boolean);
      // reddit r/x · u/x · user/x, linkedin company/x: the name is the last segment before any tail
      const kinds = ["r", "u", "user", "company", "in", "channel", "c"];
      text = kinds.includes(parts[0]?.toLowerCase() ?? "") ? (parts[1] ?? "") : (parts[0] ?? "");
    }
  } catch {
    /* not a URL */
  }
  return text.replace(/^\/+/, "").replace(/^(?:r|u|user)\//i, "").replace(/^@/, "").trim().toLowerCase();
}

/** The saved row that is the typed handle on that platform, if any. */
export function findSavedAccount(rows: SavedAccountRow[], platform: string, typed: string): SavedAccountRow | null {
  const want = comparableHandle(typed);
  if (!want) return null;
  return (
    rows.find((r) => r.platform.toLowerCase() === platform.toLowerCase() && comparableHandle(r.handle) === want) ?? null
  );
}

/**
 * Run the track call and report what is true.
 * - the call answered: its answer;
 * - the server refused (`isRefusal`): the refusal, nothing was saved;
 * - anything else (dropped stream, abort, timeout, network): re-read the saved state through
 *   `verify`; saved means success, not saved means a real connection failure.
 */
export async function resolveTrackOutcome(args: {
  call: () => Promise<{ trackedAccountId: string | null }>;
  isRefusal: (error: unknown) => boolean;
  refusalMessage: (error: unknown) => string;
  verify: () => Promise<string | null>;
  transportMessage: (error: unknown) => string | null;
}): Promise<TrackOutcome> {
  try {
    const answer = await args.call();
    return { ok: true, unavailable: false, trackedAccountId: answer.trackedAccountId, message: null };
  } catch (error) {
    if (args.isRefusal(error)) {
      return { ok: false, unavailable: false, trackedAccountId: null, message: args.refusalMessage(error) };
    }
    let savedId: string | null = null;
    try {
      savedId = await args.verify();
    } catch {
      /* the re-read itself failed: fall through to the connection failure */
    }
    if (savedId) return { ok: true, unavailable: false, trackedAccountId: savedId, message: null };
    return { ok: false, unavailable: true, trackedAccountId: null, message: args.transportMessage(error) };
  }
}
