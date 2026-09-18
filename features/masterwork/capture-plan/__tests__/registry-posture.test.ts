/**
 * @jest-environment node
 */
/**
 * THE GUARD that keeps the Capture Plan honest as the catalog grows.
 *
 * ## The class
 *
 * `approachLaneCoverage.test.ts` closed the class where `platform.approach`
 * grows a row the product has no DOOR for. This closes the same class one layer
 * in: the registry can grow a row the PLANNER has no OPINION about — and the
 * failure has two faces, both silent:
 *
 *   * the plan starts putting a brand-new lane on somebody's calendar without
 *     anyone deciding a ten-minute slot can hold it, or
 *   * the plan quietly never offers a perfectly good new lane, and nobody ever
 *     finds out it was left out.
 *
 * This is not hypothetical. THREE lanes — `sorting_table`, `teach_back` and
 * `daily_drip` — went live in `platform.approach` DURING the afternoon this
 * program was built, by other sessions. Two of them belong in a plan and one
 * emphatically does not (a daily-drip programme inside a plan means two things
 * deciding when to interrupt the same person). Without this test the difference
 * would have been decided by whichever of us edited last.
 *
 * ## What it forces
 *
 * 1. Every Approach in the live registry has a POSTURE, and a posture is a
 *    sentence: `plannable` with a real session length and a real ask, or
 *    `excluded` with a reason in the Expert's language.
 * 2. Every plannable method has a DOOR the session host can actually open —
 *    `resolveSessionDoor` never answers `missing` for one.
 * 3. The `capture_plan` row itself is excluded, because a plan that scheduled
 *    itself is a loop.
 * 4. The `capture_plan` row declares NO agent, matching the screen that says
 *    every session credits the lane's own.
 *
 * Two halves, the same shape `approachLaneCoverage.test.ts` set:
 *   * THE SNAPSHOT (always runs, CI-safe): the live registry as read on
 *     2026-09-15, asserted row by row.
 *   * THE LIVE READ (runs whenever `SUPABASE_SECRET_KEY` is set): the registry
 *     as it actually is right now, which is what catches the row a peer minted
 *     an hour ago.
 */

import { resolveApproachLane } from "../../browse/approachLane";
import type { DistillationApproach } from "../../browse/approaches";
import { METHOD_POSTURE } from "../methods";
import { resolveSessionDoor } from "../SessionHost";

/**
 * The live `platform.approach` registry (family `distillation`) as read on
 * 2026-09-15, after `capture_plan`, `sorting_table`, `teach_back` and
 * `daily_drip` landed. Key → intake_query.
 */
const SNAPSHOT: Record<string, Record<string, string>> = {
  vision_interview: {},
  capture_plan: { plan: "1" },
  interview: { interview: "1" },
  source: { ingest: "source" },
  timeline: { ingest: "timeline" },
  exemplar: { ingest: "exemplar" },
  body_of_work: { body_of_work: "1" },
  file: { ingest: "file" },
  monologue: { ingest: "monologue" },
  chat_import: { chatImport: "1" },
  matrx_conversations: { tab: "matrx", chatImport: "1" },
  dump: { dump: "1" },
  oracle_tap: {},
  meeting_scavenger: { meeting: "1" },
  shadow_inbox: { shadowInbox: "1" },
  red_pen: { red_pen: "1" },
  bad_example_probe: { probe: "1" },
  triad_game: { triad: "1" },
  prediction_ledger: { predictions: "1" },
  sorting_table: { sort: "1" },
  teach_back: { teachBack: "1" },
  daily_drip: { drip: "1" },
};

const LAUNCH_HREF: Record<string, string | null> = {
  vision_interview: "/masterwork/vision-interview/new",
  oracle_tap: "/chat",
};

function row(key: string, intakeQuery: Record<string, string>): DistillationApproach {
  return {
    id: `id-${key}`,
    key,
    label: key,
    blurb: "",
    whatItNeeds: "",
    costTimeShape: "",
    mandateKey: "",
    intakeQuery,
    sortOrder: 0,
    enabled: true,
    availability: "available",
    launchHref: LAUNCH_HREF[key] ?? null,
    catalogNumber: null,
  } as DistillationApproach;
}

function assertPostured(approaches: DistillationApproach[], source: string) {
  const missing = approaches
    .map((a) => a.key)
    .filter((key) => !METHOD_POSTURE[key]);
  expect({ source, missing }).toEqual({ source, missing: [] });

  for (const approach of approaches) {
    const posture = METHOD_POSTURE[approach.key];
    if (posture.kind === "excluded") {
      // A reason, not a shrug — the plan page prints this sentence verbatim.
      expect(posture.why.length).toBeGreaterThan(20);
      continue;
    }
    expect(posture.minutes).toBeGreaterThan(0);
    expect(posture.ask.length).toBeGreaterThan(20);
    // A plannable method MUST have a door the session host can open.
    const lane = resolveApproachLane(approach);
    expect({ key: approach.key, hasLane: lane !== null }).toEqual({
      key: approach.key,
      hasLane: true,
    });
    const door = resolveSessionDoor(approach, "11111111-1111-1111-1111-111111111111");
    expect({ key: approach.key, door: door.kind }).not.toEqual({
      key: approach.key,
      door: "missing",
    });
  }
}

describe("every Approach in the catalog has a plan posture (snapshot)", () => {
  const approaches = Object.entries(SNAPSHOT).map(([key, q]) => row(key, q));

  it("has a posture, a reason or a real door, for every row", () => {
    assertPostured(approaches, "snapshot 2026-09-15");
  });

  it("never schedules itself", () => {
    expect(METHOD_POSTURE.capture_plan.kind).toBe("excluded");
  });

  it("never nests two scheduling programmes", () => {
    const drip = METHOD_POSTURE.daily_drip;
    expect(drip.kind).toBe("excluded");
    if (drip.kind === "excluded") {
      expect(drip.why).toMatch(/programme of its own/);
    }
  });
});

const LIVE = process.env.SUPABASE_SECRET_KEY ? describe : describe.skip;

LIVE("every Approach in the LIVE catalog has a plan posture", () => {
  it("reads platform.approach and finds a posture for every row", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://db.matrxserver.com";
    const client = createClient(url, process.env.SUPABASE_SECRET_KEY as string);
    const { data, error } = await client
      .schema("platform")
      .from("approach")
      .select("key,intake_query,enabled,metadata")
      .eq("family", "distillation")
      .is("deleted_at", null);
    expect(error).toBeNull();
    const approaches = (data ?? []).map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        ...row(String(r.key), (r.intake_query ?? {}) as Record<string, string>),
        enabled: Boolean(r.enabled),
        availability: (meta.availability as never) ?? "available",
        launchHref: (meta.launch_href as string | null) ?? null,
      };
    });
    assertPostured(approaches, "live registry");
  }, 30_000);

  it("the capture_plan row declares no agent of its own", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://db.matrxserver.com";
    const client = createClient(url, process.env.SUPABASE_SECRET_KEY as string);
    const { data } = await client
      .schema("platform")
      .from("approach")
      .select("mandate_key,metadata")
      .eq("family", "distillation")
      .eq("key", "capture_plan")
      .is("deleted_at", null)
      .maybeSingle();
    // If somebody binds a real agent here, the screen that says "every session
    // credits the lane's own agent" has become a lie and must change with it.
    expect(data?.mandate_key).toBe("none");
    expect((data?.metadata as Record<string, unknown>)?.runs_no_agent).toBe(true);
  }, 30_000);
});
