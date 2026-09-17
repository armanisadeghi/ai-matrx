/**
 * @jest-environment node
 */
/**
 * A BUILD IN FLIGHT IS READABLE FROM THE SERVER ROW — WITH NO BROWSER RECEIPT.
 *
 * ## The defect this exists to catch (cold walk 7, finding 1, 2026-09-17)
 *
 * The Build is durable: it keeps going without the person who started it, and
 * the Build window promises exactly that in words. But everything that KNEW a
 * build was in flight lived in one browser — the durable receipt is a
 * `localStorage` pointer, and the progress is rendered by the window that
 * launched the run.
 *
 * So the walk started a Quick Build, closed the browser context entirely (a
 * real close-and-reopen, a stronger test than the "close the panel, reopen it"
 * re-check walk 6 ran), returned to the Rulebook inside the build's own stated
 * "usually about a minute", and was shown "0 Built, 0 outputs" — a page
 * indistinguishable from one where nothing had ever been started, for ~40
 * seconds. The control run proved the build completed correctly, so this was
 * never data loss; it was the complete absence of a confidence signal over
 * work somebody had paid for.
 *
 * ## What this pins
 *
 * `getBuildInFlight` reads `platform.masterwork_run` — a fact that needs no
 * pointer, no tab and no prior visit — and it does NOT trade one lie for
 * another: a run whose heartbeat has gone quiet past the lease comes back as
 * `stalled`, so the surface can say that instead of spinning forever over a
 * worker that died.
 *
 * The query itself is asserted, not just the mapping, because the filter IS
 * the contract: the wrong `operation`, a missing `status`, or a forgotten
 * `deleted_at` would each quietly report the wrong Rulebook's work, or a
 * finished build as live.
 *
 * Proven red before green (2026-09-17): the module did not exist, and the
 * Rulebook page had no path from a server row to a signal on screen.
 */

type Row = Record<string, unknown> | null;

const filters: Array<[string, unknown, unknown]> = [];
let row: Row = null;
let readError: { message: string; code?: string } | null = null;

const builder = {
  select: (...args: unknown[]) => {
    filters.push(["select", args[0], null]);
    return builder;
  },
  eq: (column: string, value: unknown) => {
    filters.push(["eq", column, value]);
    return builder;
  },
  is: (column: string, value: unknown) => {
    filters.push(["is", column, value]);
    return builder;
  },
  order: (column: string, opts: unknown) => {
    filters.push(["order", column, opts]);
    return builder;
  },
  limit: (n: number) => {
    filters.push(["limit", n, null]);
    return builder;
  },
  maybeSingle: async () => ({ data: row, error: readError }),
};

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: (name: string) => {
      filters.push(["schema", name, null]);
      return { from: (table: string) => {
        filters.push(["from", table, null]);
        return builder;
      } };
    },
  },
}));

import {
  BUILD_HEARTBEAT_GRACE_MS,
  BUILD_OPERATION,
  getBuildInFlight,
} from "../buildInFlight";

const RULEBOOK = "bc21544c-d5df-464f-88ee-cba41bc072c5";

function find(kind: string, column: string): unknown {
  const hit = filters.find(([k, c]) => k === kind && c === column);
  return hit ? hit[2] : undefined;
}

beforeEach(() => {
  filters.length = 0;
  row = null;
  readError = null;
});

describe("getBuildInFlight", () => {
  it("asks platform.masterwork_run for THIS Rulebook's live build only", async () => {
    await getBuildInFlight(RULEBOOK);
    expect(filters.find(([k]) => k === "schema")?.[1]).toBe("platform");
    expect(filters.find(([k]) => k === "from")?.[1]).toBe("masterwork_run");
    expect(find("eq", "rulebook_id")).toBe(RULEBOOK);
    expect(find("eq", "operation")).toBe(BUILD_OPERATION);
    // A finished build is not a live one — without this the notice would
    // spin forever over every Rulebook that had ever built anything.
    expect(find("eq", "status")).toBe("processing");
    expect(find("is", "deleted_at")).toBeNull();
  });

  it("reports a fresh build as running, with the clock the person watches", async () => {
    const startedAt = Date.now() - 12_000;
    row = {
      id: "run-1",
      label: "Kitchen Remodel Estimator",
      status: "processing",
      started_at: new Date(startedAt).toISOString(),
      heartbeat_at: new Date(Date.now() - 5_000).toISOString(),
      created_at: new Date(startedAt).toISOString(),
    };
    const live = await getBuildInFlight(RULEBOOK);
    expect(live).not.toBeNull();
    expect(live!.liveness).toBe("running");
    expect(live!.label).toBe("Kitchen Remodel Estimator");
    // Within a second of the row's own started_at — this is what
    // `<WorkingNotice startedAt>` renders the elapsed clock from.
    expect(Math.abs(live!.startedAt - startedAt)).toBeLessThan(1000);
  });

  it("calls a build that stopped reporting in STALLED, never progress", async () => {
    const longAgo = Date.now() - BUILD_HEARTBEAT_GRACE_MS - 60_000;
    row = {
      id: "run-2",
      label: null,
      status: "processing",
      started_at: new Date(longAgo).toISOString(),
      heartbeat_at: new Date(longAgo).toISOString(),
      created_at: new Date(longAgo).toISOString(),
    };
    const live = await getBuildInFlight(RULEBOOK);
    expect(live!.liveness).toBe("stalled");
  });

  it("falls back to created_at when a row carries no started_at", async () => {
    const createdAt = Date.now() - 8_000;
    row = {
      id: "run-3",
      label: null,
      status: "processing",
      started_at: null,
      heartbeat_at: null,
      created_at: new Date(createdAt).toISOString(),
    };
    const live = await getBuildInFlight(RULEBOOK);
    expect(live!.liveness).toBe("running");
    expect(Math.abs(live!.startedAt - createdAt)).toBeLessThan(1000);
  });

  it("returns null when there is nothing running", async () => {
    row = null;
    expect(await getBuildInFlight(RULEBOOK)).toBeNull();
  });

  it("refuses to render a clock it cannot put a time on", async () => {
    row = {
      id: "run-4",
      label: null,
      status: "processing",
      started_at: null,
      heartbeat_at: null,
      created_at: null,
    };
    expect(await getBuildInFlight(RULEBOOK)).toBeNull();
  });

  it("throws on a real read failure rather than reporting 'nothing running'", async () => {
    readError = { message: "permission denied", code: "42501" };
    await expect(getBuildInFlight(RULEBOOK)).rejects.toThrow();
  });
});
