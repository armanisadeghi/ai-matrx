/**
 * @jest-environment node
 */
/**
 * THE GUARD for census row 3: a live Approach card must lead somewhere.
 *
 * ## The defect this exists to catch
 *
 * `platform.approach` grew a row — `timeline`, "A case that unfolds in time",
 * `enabled = true`, `metadata.availability = "available"`, a real server lane
 * behind it — and the frontend's dispatch was a hand-written three-way
 * `q.ingest === "source" | "exemplar" | "file"`. The card rendered, Start
 * created a Rulebook, and the Expert landed on a bare page with no capture UI,
 * no toast and no error. The registry could grow a lane the code silently did
 * not handle, and nothing said so.
 *
 * ## What this test forces
 *
 * Every Approach this product PROMISES (startable, or declared `available`)
 * resolves through `resolveApproachLane` to a real door. Two halves:
 *
 * 1. THE SNAPSHOT (always runs, CI-safe): the live registry as read on
 *    2026-09-12, asserted row by row. Deterministic, no network.
 * 2. THE LIVE READ (runs whenever `SUPABASE_SECRET_KEY` is set — which is how
 *    a developer and this repo's own `.env.local` run it): reads
 *    `platform.approach` for real and asserts BOTH that every promising row
 *    resolves AND that the snapshot still matches the live registry, so the
 *    snapshot cannot rot into a lie. When the key is absent the test says so
 *    out loud rather than pretending it checked (law 4).
 *
 * Proven red before green (2026-09-12): with `"timeline"` removed from
 * `INGEST_LANES`, both halves fail on `timeline` — "has no lane in the
 * product".
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  promisesALane,
  resolveApproachLane,
  type ApproachLane,
} from "../approachLane";
import type { DistillationApproach } from "../approaches";

type RegistryRow = Pick<
  DistillationApproach,
  "key" | "enabled" | "availability" | "intakeQuery" | "launchHref"
>;

/**
 * The live `platform.approach` family `distillation` as of 2026-09-12, in
 * `sort_order`. Only the fields that decide a lane are kept — the labels and
 * blurbs are copy, and copy changing is not this guard's business.
 */
const REGISTRY_SNAPSHOT_2026_09_12: RegistryRow[] = [
  {
    // Flipped `enabled` false -> true on 2026-09-12 through the platform's own
    // registry write path (`aidream/scripts/set_approach_enabled.py`, the
    // Matrx ORM ApproachManager). The row was declaring "not live" while its
    // own `launch_href` page ran a real interview end to end (census row 10),
    // and the catalog rendered it under "Ready now" anyway. `enabled` now
    // means only "this Approach is live"; whether the GUIDED START can run it
    // is asked of its lane (`startableApproaches` -> `hasIntakeLane`), which
    // still, correctly, excludes this row — its door is its own page.
    key: "vision_interview",
    enabled: true,
    availability: "available",
    intakeQuery: {},
    launchHref: "/masterwork/vision-interview/new",
  },
  {
    key: "interview",
    enabled: true,
    availability: "available",
    intakeQuery: { interview: "1" },
    launchHref: null,
  },
  {
    key: "source",
    enabled: true,
    availability: "available",
    intakeQuery: { ingest: "source" },
    launchHref: null,
  },
  {
    key: "timeline",
    enabled: true,
    availability: "available",
    intakeQuery: { ingest: "timeline" },
    launchHref: null,
  },
  {
    key: "exemplar",
    enabled: true,
    availability: "available",
    intakeQuery: { ingest: "exemplar" },
    launchHref: null,
  },
  {
    key: "body_of_work",
    enabled: true,
    availability: "available",
    intakeQuery: { body_of_work: "1" },
    launchHref: null,
  },
  {
    key: "file",
    enabled: true,
    availability: "available",
    intakeQuery: { ingest: "file" },
    launchHref: null,
  },
  {
    key: "monologue",
    enabled: false,
    availability: "coming_soon",
    intakeQuery: {},
    launchHref: null,
  },
  {
    key: "chat_import",
    enabled: true,
    availability: "available",
    intakeQuery: { chatImport: "1" },
    launchHref: null,
  },
  {
    key: "matrx_conversations",
    enabled: true,
    availability: "available",
    intakeQuery: { chatImport: "1", tab: "matrx" },
    launchHref: null,
  },
  {
    key: "dump",
    enabled: true,
    availability: "available",
    intakeQuery: { dump: "1" },
    launchHref: null,
  },
  {
    key: "oracle_tap",
    enabled: false,
    availability: "partial",
    intakeQuery: {},
    launchHref: "/chat",
  },
  {
    key: "meeting_scavenger",
    enabled: false,
    availability: "coming_soon",
    intakeQuery: {},
    launchHref: null,
  },
  {
    key: "shadow_inbox",
    enabled: false,
    availability: "coming_soon",
    intakeQuery: {},
    launchHref: null,
  },
  {
    key: "red_pen",
    enabled: false,
    availability: "coming_soon",
    intakeQuery: {},
    launchHref: null,
  },
  {
    key: "bad_example_probe",
    enabled: false,
    availability: "coming_soon",
    intakeQuery: {},
    launchHref: null,
  },
  {
    key: "triad_game",
    enabled: false,
    availability: "coming_soon",
    intakeQuery: {},
    launchHref: null,
  },
  {
    key: "prediction_ledger",
    enabled: false,
    availability: "coming_soon",
    intakeQuery: {},
    launchHref: null,
  },
];

function describe_(row: RegistryRow): string {
  return `${row.key} (enabled=${row.enabled}, availability=${row.availability}, intake_query=${JSON.stringify(row.intakeQuery)}, launch_href=${row.launchHref})`;
}

/** The assertion both halves share. */
function expectEveryPromiseHasALane(rows: RegistryRow[]): void {
  const promised = rows.filter((row) =>
    promisesALane(row as DistillationApproach),
  );
  expect(promised.length).toBeGreaterThan(0);
  const deadEnds = promised.filter((row) => resolveApproachLane(row) === null);
  expect(
    deadEnds.map(describe_).join("\n"),
    // A row here is a card an Expert can select that the product cannot open:
    // either give it a lane in `resolveApproachLane` (and the surface behind
    // it), or mark the registry row `coming_soon` so the card says so.
  ).toBe("");
}

describe("every promised Distillation Approach has a lane", () => {
  it("resolves every startable/available row in the 2026-09-12 registry", () => {
    expectEveryPromiseHasALane(REGISTRY_SNAPSHOT_2026_09_12);
  });

  it("opens the timeline Approach on the timeline ingest lane", () => {
    const row = REGISTRY_SNAPSHOT_2026_09_12.find((r) => r.key === "timeline");
    expect(row).toBeDefined();
    expect(resolveApproachLane(row!)).toEqual<ApproachLane>({
      kind: "ingest",
      lane: "timeline",
    });
  });

  it("returns null — never a guess — for a row the product has no door for", () => {
    expect(
      resolveApproachLane({ launchHref: null, intakeQuery: { ingest: "moon" } }),
    ).toBeNull();
    expect(resolveApproachLane({ launchHref: null, intakeQuery: {} })).toBeNull();
  });
});

/**
 * The live half reads the repo's own `.env.local` — the same file the app
 * reads — so a developer running this suite checks the REAL registry without
 * exporting anything. `jest.setup.ts` seeds a localhost placeholder URL, so
 * the file's value wins where it has one. CI has no `.env.local`; there the
 * live half announces that it did not run.
 */
function envFromDotLocal(): { url?: string; key?: string } {
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return {};
  }
  const read = (name: string) =>
    raw
      .split("\n")
      .find((line) => line.startsWith(`${name}=`))
      ?.slice(name.length + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  return {
    url: read("NEXT_PUBLIC_SUPABASE_URL"),
    key: read("SUPABASE_SECRET_KEY"),
  };
}

describe("the LIVE platform.approach registry", () => {
  const fromFile = envFromDotLocal();
  const url = fromFile.url || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = fromFile.key || process.env.SUPABASE_SECRET_KEY;
  const live = Boolean(url && key);

  it("matches the snapshot and has a lane for every promise", async () => {
    if (!live) {
      // ANNOUNCED, never silent: this half did not run, and here is how to run
      // it. The snapshot half above still ran, so the suite is never a no-op.
      console.warn(
        "[approach-lane-guard] the LIVE registry half did not run: set " +
          "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (they are in " +
          "matrx-frontend/.env.local) and re-run " +
          "`pnpm test:masterwork-approach-lanes` to check the real registry.",
      );
      return;
    }
    const res = await fetch(
      `${url}/rest/v1/approach?select=key,enabled,intake_query,metadata` +
        `&family=eq.distillation&deleted_at=is.null&order=sort_order,key`,
      {
        headers: {
          apikey: key!,
          Authorization: `Bearer ${key!}`,
          "Accept-Profile": "platform",
        },
      },
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as {
      key: string;
      enabled: boolean;
      intake_query: Record<string, unknown> | null;
      metadata: Record<string, unknown> | null;
    }[];
    const liveRows: RegistryRow[] = rows.map((r) => {
      const meta = r.metadata ?? {};
      const q = r.intake_query ?? {};
      const intakeQuery: Record<string, string> = {};
      for (const [k, v] of Object.entries(q)) {
        if (typeof v === "string" || typeof v === "number")
          intakeQuery[k] = String(v);
      }
      return {
        key: r.key,
        enabled: r.enabled,
        availability:
          meta.availability === "coming_soon" || meta.availability === "partial"
            ? meta.availability
            : "available",
        intakeQuery,
        launchHref:
          typeof meta.launch_href === "string" && meta.launch_href
            ? meta.launch_href
            : null,
      };
    });

    expectEveryPromiseHasALane(liveRows);

    // THE SNAPSHOT CANNOT ROT: a registry row added, retired, enabled or
    // re-pointed shows up here as a diff, and whoever changed it decides
    // whether the lane exists before updating the snapshot above.
    const norm = (r: RegistryRow) =>
      `${r.key}|${r.enabled}|${r.availability}|${JSON.stringify(Object.entries(r.intakeQuery).sort())}|${r.launchHref}`;
    expect(liveRows.map(norm).sort()).toEqual(
      REGISTRY_SNAPSHOT_2026_09_12.map(norm).sort(),
    );
  }, 30_000);
});
