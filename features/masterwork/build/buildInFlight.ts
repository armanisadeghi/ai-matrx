/**
 * IS A BUILD RUNNING FOR THIS RULEBOOK RIGHT NOW? — asked of the SERVER, not
 * of this browser.
 *
 * ## The defect this exists for (cold walk 7, finding 1, 2026-09-17)
 *
 * The Build is a durable run: it keeps going on the server whether or not the
 * person who started it is still watching, and the Build window says so in as
 * many words ("Building. You can keep working; this keeps going without you").
 * Everything that knew a build was in flight, though, lived in ONE browser:
 * the run's receipt is a `localStorage` pointer (`lib/durable-run`), and the
 * window that renders the progress is mounted by the tab that launched it.
 *
 * So cold walk 7 started a Quick Build, closed the browser context entirely —
 * a real close-and-reopen, not a tab reload — came back to the Rulebook inside
 * the build's own stated "usually about a minute", and was shown "0 Built, 0
 * outputs": a page identical to one where nothing had ever been started. The
 * control run proved the build itself completed correctly, so nothing was
 * lost; what was missing was any signal at all, for ~40 seconds, that the work
 * she had paid for was still happening. A screen is absent or honest — and
 * "0 Built" over a live build is neither.
 *
 * ## Why the answer is a row, not a receipt
 *
 * `platform.masterwork_run` already holds the fact: one row per run, with
 * `operation = 'build'`, the Rulebook it is for, `status = 'processing'` while
 * it works, `started_at` for the clock the person watches, and `heartbeat_at`
 * renewed by the worker. Reading it needs no pointer, no tab and no prior
 * visit, which is exactly the property the browser receipt does not have.
 *
 * `heartbeat_at` is also why this never trades one lie for another: a row that
 * stopped reporting in is NOT reported as progress. It comes back as
 * `stalled`, and the surface says that instead of spinning forever over a
 * worker that died.
 */

import { supabase } from "@/utils/supabase/client";
import { operationFailed } from "@/utils/errors";

/** The `operation` the Build pipeline stamps on its run row. */
export const BUILD_OPERATION = "build";

/** The one non-terminal status the run ledger uses. */
const IN_FLIGHT_STATUS = "processing";

/**
 * How long a build may go without renewing its heartbeat before this stops
 * calling it live.
 *
 * The durable-run lease is ~5 minutes, renewed every 60s
 * (`lib/durable-run/useDurableRun.ts`), so three missed renewals is the first
 * point at which "still working" stops being the honest reading. Under it we
 * say the build is running; over it we say it stopped reporting in. We never
 * say nothing.
 */
export const BUILD_HEARTBEAT_GRACE_MS = 3 * 60 * 1000;

/** How long a Build usually takes — the window's own measured expectation. */
export const BUILD_USUAL_MS = 60_000;

export interface BuildInFlight {
  runId: string;
  /** What the Expert called this Masterwork, when the run row carries it. */
  label: string | null;
  /** Epoch ms — hand straight to `<WorkingNotice startedAt>`. */
  startedAt: number;
  /**
   * `running` — the worker renewed its lease recently enough to be believed.
   * `stalled` — it has not, so the screen says THAT rather than spinning on.
   */
  liveness: "running" | "stalled";
  /** Epoch ms of the last heartbeat, or null when the row carries none. */
  heartbeatAt: number | null;
}

function ms(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * The newest in-flight Build for this Rulebook, or null when there is none.
 *
 * Bounded read of a single row — a "is something happening" question, never a
 * completeness read.
 */
export async function getBuildInFlight(
  rulebookId: string,
): Promise<BuildInFlight | null> {
  const { data, error } = await supabase
    .schema("platform")
    .from("masterwork_run")
    .select("id,label,status,started_at,heartbeat_at,created_at")
    .eq("rulebook_id", rulebookId)
    .eq("operation", BUILD_OPERATION)
    .eq("status", IN_FLIGHT_STATUS)
    .is("deleted_at", null)
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw operationFailed("check whether a Build is running", error);
  if (!data) return null;

  const startedAt = ms(data.started_at) ?? ms(data.created_at);
  // A row we cannot put a clock on is not something to render a clock for.
  if (startedAt === null) return null;
  const heartbeatAt = ms(data.heartbeat_at);
  const lastSign = heartbeatAt ?? startedAt;
  return {
    runId: data.id,
    label: typeof data.label === "string" && data.label.trim() ? data.label : null,
    startedAt,
    heartbeatAt,
    liveness:
      Date.now() - lastSign > BUILD_HEARTBEAT_GRACE_MS ? "stalled" : "running",
  };
}
