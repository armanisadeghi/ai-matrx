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
    // THE VOICE-FIRST DOOR, opened 2026-09-12
    // (aidream/db/migrations/enable_masterwork_monologue_approach.sql). The
    // server lane had existed since the recording lane shipped; the row said
    // "coming soon" only because the product had no capture surface of its
    // own and sent an Expert who wanted to TALK to the generic upload card.
    key: "monologue",
    enabled: true,
    availability: "available",
    intakeQuery: { ingest: "monologue" },
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
    // THE MEETING SCAVENGER, opened 2026-09-15. The row sat `coming_soon` while
    // the platform already stored every word of every meeting it hosts
    // (`communication.meet_transcript_segments`, speaker-attributed and
    // timestamped) — the lane was missing, not the data. Flipped through the
    // registry's own write path (`aidream/scripts/set_approach_enabled.py`).
    key: "meeting_scavenger",
    enabled: true,
    availability: "available",
    intakeQuery: { meeting: "1" },
    launchHref: null,
  },
  {
    // Flipped coming_soon -> live on 2026-09-15 by
    // `aidream/db/migrations/0716_shadow_the_inbox_is_live.sql`, whose parity
    // block refuses the write unless the row ends up enabled, available AND
    // carrying a lane key — the `timeline` defect (census row 3) cannot recur
    // through this row. The lane: the Expert's real mail diffed against a
    // blind generic reply (`features/masterwork/components/detail/ShadowInboxDialog.tsx`).
    key: "shadow_inbox",
    enabled: true,
    availability: "available",
    intakeQuery: { shadowInbox: "1" },
    launchHref: null,
  },
  {
    // Flipped coming_soon -> live on 2026-09-15 through the platform's own
    // registry write path (`aidream/scripts/set_approach_enabled.py`, the Matrx
    // ORM ApproachManager), in the same wave as the lane behind it: the markup
    // dialog (`components/detail/RedPenDialog.tsx`), the server lane
    // (`aidream/services/distillation/markup_ingest.py`) and the mandate
    // `masterwork.markup_distiller`. The card was a static coming-soon tile for
    // as long as the product had no door for it — never because the idea was
    // unfinished.
    key: "red_pen",
    enabled: true,
    availability: "available",
    intakeQuery: { red_pen: "1" },
    launchHref: null,
  },
  {
    // Flipped coming_soon -> live on 2026-09-15 in the same wave as the lane
    // behind it: the probe page (`app/(core)/masterwork/[id]/probe/page.tsx`),
    // the server lane (`aidream/services/distillation/probe.py`,
    // `POST /masterworks/probe`) and the two mandates
    // `masterwork.bad_example_probe` + `masterwork.critique_distiller`. The
    // registry write, the three `masterwork.bad_example_probe` knobs and the
    // durable-run operation vocabulary all land in ONE ledgered migration
    // (`aidream/db/migrations/0714_bad_example_probe_is_live.sql`) whose parity
    // block refuses to commit a row that is enabled with no lane key.
    key: "bad_example_probe",
    enabled: true,
    availability: "available",
    intakeQuery: { probe: "1" },
    launchHref: null,
  },
  {
    // THE TRIAD GAME, opened 2026-09-15 by its own lane build (this row is
    // recorded here so the shared snapshot matches the live registry; the lane
    // itself resolves `{triad:"1"}` in approachLane.ts).
    key: "triad_game",
    enabled: true,
    availability: "available",
    intakeQuery: { triad: "1" },
    launchHref: null,
  },
  {
    // THE PREDICTION LEDGER — "call it before you know". The door exists in
    // this repo as of 2026-09-15: `{kind:"prediction"}` in `approachLane.ts`,
    // `PredictionLedgerDialog` on `/masterwork/[id]`, the `?predictions=1`
    // deep link, and the on-page calibration readout.
    //
    // The live row was flipped by the SERVER half on 2026-09-15 (it carries the
    // distillation lane, `POST /masterworks/ingest-predictions`, and owns the
    // registry write — the same discipline as the `monologue` flip, made
    // through the platform's own write path rather than by hand from a
    // client). Verified live from this checkout the same day: enabled=true,
    // intake_query={"predictions":"1"}, availability=available.
    key: "prediction_ledger",
    enabled: true,
    availability: "available",
    intakeQuery: { predictions: "1" },
    launchHref: null,
  },
  {
    // THE SORTING TABLE — a NEW Approach, not one of the twenty Arman named on
    // 2026-08-17, so its row carries no `catalog_number`. Created live and
    // enabled on 2026-09-15 by `aidream/db/migrations/0745_the_sorting_table_is_live.sql`,
    // whose parity block refuses to commit a row that is enabled with no lane
    // key — the `timeline` defect (census row 3) cannot recur through this row.
    // The lane: `/masterwork/[id]/sort`, `features/masterwork/sorting/`.
    key: "sorting_table",
    enabled: true,
    availability: "available",
    intakeQuery: { sort: "1" },
    launchHref: null,
  },
  {
    // THE TEACH-BACK — another NEW Approach, not one of the twenty Arman named
    // on 2026-08-17, so its row carries no `catalog_number` and its card words
    // are marked `words_reviewed_by_arman: false` rather than passing as his.
    // Created live and enabled on 2026-09-15 through the platform's own write
    // path (`aidream/scripts/seed_teach_back_approach.py`, the Matrx ORM
    // Approach model) together with its three `masterwork.teach_back` knobs —
    // no schema edit, because migration 0727 made the run-kind vocabulary
    // code-seeded. The lane: `/masterwork/[id]/teach-back`,
    // `features/masterwork/teach-back/`, `POST /masterworks/teach-back`.
    key: "teach_back",
    enabled: true,
    availability: "available",
    intakeQuery: { teachBack: "1" },
    launchHref: null,
  },
  {
    // THE CAPTURE PLAN — a PROGRAM over the other Approaches rather than a
    // lane of its own, live 2026-09-15 by
    // `aidream/db/migrations/0744_the_capture_plan_is_a_program.sql`. It is a
    // NEW Approach, not one of the twenty Arman named on 2026-08-17, so its row
    // carries no `catalog_number`.
    //
    // Its `mandate_key` is the literal string `none` and its metadata carries
    // `runs_no_agent: true` — deliberately, and guarded by
    // `features/masterwork/capture-plan/__tests__/registry-posture.test.ts`.
    // Every other row names the agent that runs its lane; this one runs no
    // agent at all (the planner is arithmetic over the yield ledger) and every
    // session it opens credits the lane's own mandate on that lane's own
    // screen. Naming a plausible mandate here would declare an AI integration
    // that is never invoked.
    key: "capture_plan",
    enabled: true,
    availability: "available",
    intakeQuery: { plan: "1" },
    launchHref: null,
  },
  {
    // THE DAILY DRIP — one short question a day about the work the Expert
    // actually did, by text, email or in-app, answered by talking into one
    // field on their phone. Live 2026-09-15 by
    // `aidream/scripts/seed_daily_drip_approach.py` (the row and its five knobs
    // are DATA, written through the ORM — there is no migration in this lane,
    // and the run kind needs none either since 0727 made the Masterwork
    // operation vocabulary a seeded table rather than a hand-typed CHECK).
    //
    // A NEW Approach, not one of the twenty Arman named on 2026-08-17, so its
    // row carries no `catalog_number` — claiming a number it was never given
    // would be the catalog lying about its own provenance. Its metadata says
    // `introduced: "2026-09-15"` instead.
    key: "daily_drip",
    enabled: true,
    availability: "available",
    intakeQuery: { drip: "1" },
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

  it("opens the Meeting Scavenger on its own door", () => {
    const row = REGISTRY_SNAPSHOT_2026_09_12.find(
      (r) => r.key === "meeting_scavenger",
    );
    expect(row).toBeDefined();
    expect(row!.enabled).toBe(true);
    expect(resolveApproachLane(row!)).toEqual<ApproachLane>({ kind: "meeting" });
  });

  it("opens the monologue Approach on the voice-first ingest lane", () => {
    const row = REGISTRY_SNAPSHOT_2026_09_12.find((r) => r.key === "monologue");
    expect(row).toBeDefined();
    expect(row!.enabled).toBe(true);
    expect(resolveApproachLane(row!)).toEqual<ApproachLane>({
      kind: "ingest",
      lane: "monologue",
    });
  });

  it("opens the prediction_ledger Approach on the ledger door", () => {
    const row = REGISTRY_SNAPSHOT_2026_09_12.find(
      (r) => r.key === "prediction_ledger",
    );
    expect(row).toBeDefined();
    expect(row!.enabled).toBe(true);
    expect(resolveApproachLane(row!)).toEqual<ApproachLane>({
      kind: "prediction",
    });
  });

  it("opens the red_pen Approach on the markup door — the card is a real door", () => {
    const row = REGISTRY_SNAPSHOT_2026_09_12.find((r) => r.key === "red_pen");
    expect(row).toBeDefined();
    // THE CARD IS NOT A POSTER. Before 2026-09-15 this row was
    // `enabled=false`, `availability="coming_soon"`, `intake_query={}` — a tile
    // rendering `aria-disabled="true"` with `cursor: not-allowed` and no link,
    // logged as such in two consecutive censuses. A live card that resolves to
    // null would be worse (an Expert can select it and the product cannot open
    // it), so both halves are asserted here: the row PROMISES a lane, and the
    // lane exists.
    expect(promisesALane(row as DistillationApproach)).toBe(true);
    expect(row!.enabled).toBe(true);
    expect(resolveApproachLane(row!)).toEqual<ApproachLane>({ kind: "redPen" });
  });

  it("opens the bad_example_probe Approach on the probe page — the card is a real door", () => {
    const row = REGISTRY_SNAPSHOT_2026_09_12.find(
      (r) => r.key === "bad_example_probe",
    );
    expect(row).toBeDefined();
    // THE CARD IS NOT A POSTER. Before 2026-09-15 this row was
    // `enabled=false`, `availability="coming_soon"`, `intake_query={}` — a tile
    // rendering `aria-disabled="true"` with `cursor: not-allowed` and no link,
    // logged as such in two consecutive censuses (2026-09-12 and 2026-09-15).
    // A live card that resolved to null would be WORSE than the poster: an
    // Expert could select it and the product could not open it. Both halves are
    // asserted here — the row PROMISES a lane, and the lane exists.
    expect(promisesALane(row as DistillationApproach)).toBe(true);
    expect(row!.enabled).toBe(true);
    expect(resolveApproachLane(row!)).toEqual<ApproachLane>({ kind: "probe" });
  });

  it("opens the sorting_table Approach on its own page — the card is a real door", () => {
    const row = REGISTRY_SNAPSHOT_2026_09_12.find((r) => r.key === "sorting_table");
    expect(row).toBeDefined();
    // Both halves, as for every other lane here: the row PROMISES a lane, and
    // the lane exists. A live card that resolved to null would let an Expert
    // select an Approach the product cannot open.
    expect(promisesALane(row as DistillationApproach)).toBe(true);
    expect(row!.enabled).toBe(true);
    expect(resolveApproachLane(row!)).toEqual<ApproachLane>({
      kind: "sortingTable",
    });
  });

  it("opens the teach_back Approach on its own page — the card is a real door", () => {
    const row = REGISTRY_SNAPSHOT_2026_09_12.find((r) => r.key === "teach_back");
    expect(row).toBeDefined();
    // Both halves, as for every other lane here: the row PROMISES a lane, and
    // the lane exists. A live card that resolved to null would let an Expert
    // select an Approach the product cannot open — and this one is the lane a
    // brand-new Rulebook is most likely to be sent to, because it is the only
    // one that needs no material at all.
    expect(promisesALane(row as DistillationApproach)).toBe(true);
    expect(row!.enabled).toBe(true);
    expect(resolveApproachLane(row!)).toEqual<ApproachLane>({
      kind: "teachBack",
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

/**
 * THE THIRD HALF OF THE DEAD END — the one census row 3 taught us THREE times.
 *
 * `resolveApproachLane` resolving and `launchApproach` dispatching are both
 * only reached when somebody picks an Approach ON the Rulebook page. The GUIDED
 * START does not: it creates the Rulebook and lands on
 * `/masterwork/<id>?<intake_query>` with nobody having picked anything. So a
 * lane whose `intake_query` key the detail page never READS is a card that is
 * live, resolvable, dispatchable — and still drops the Expert on a bare
 * Rulebook page when she comes through the funnel.
 *
 * It happened to `timeline` (2026-09-12), to `bad_example_probe` (2026-09-15),
 * and to `sorting_table` the same afternoon, each found only by a human driving
 * the funnel by hand. This asserts it mechanically instead: every key in every
 * promised row's `intake_query` is read by `RulebookDetailPage`.
 *
 * Proven red before green (2026-09-15): with the `searchParams.get("sort")`
 * handoff removed, this fails naming `sorting_table -> sort`.
 */
describe("the guided start's deep link reaches every promised lane", () => {
  it("has the detail page reading every intake_query key", () => {
    const pageSource = readFileSync(
      resolve(__dirname, "../../components/detail/RulebookDetailPage.tsx"),
      "utf8",
    );
    const unread: string[] = [];
    for (const row of REGISTRY_SNAPSHOT_2026_09_12) {
      if (!promisesALane(row as DistillationApproach)) continue;
      for (const key of Object.keys(row.intakeQuery)) {
        if (!pageSource.includes(`searchParams.get("${key}")`)) {
          unread.push(`${row.key} -> ${key}`);
        }
      }
    }
    expect(
      // A row here is a card the funnel can start and then abandon the Expert
      // on. Give the key a `searchParams.get(...)` handoff in the detail page.
      unread.join(", "),
    ).toBe("");
  });
});

/**
 * THE OTHER HALF OF THE DEAD END. `resolveApproachLane` returning a lane is
 * only half a door: the `timeline` defect of census row 3 was a registry row
 * that resolved fine and then fell through the detail page's dispatch. So this
 * reads BOTH source files and asserts that every `ApproachLane` variant
 * declared in `approachLane.ts` has a `case` in `RulebookDetailPage`'s
 * `launchApproach` switch.
 *
 * THE BREAK IT CATCHES: add a `| { kind: "x" }` variant (or a new registry row
 * that resolves to one) and forget the `case "x":` — the card opens nothing,
 * silently, exactly as `timeline` did. TypeScript does not catch it: the
 * switch's callback returns `void`, so a missing case is not a type error.
 *
 * Proven red before green (2026-09-15): with `case "prediction":` removed from
 * `RulebookDetailPage.tsx`, this fails naming `prediction`.
 */
describe("every lane variant is dispatched by the Rulebook detail page", () => {
  it("has a case in launchApproach for each ApproachLane kind", () => {
    const laneSource = readFileSync(
      resolve(__dirname, "../approachLane.ts"),
      "utf8",
    );
    const pageSource = readFileSync(
      resolve(__dirname, "../../components/detail/RulebookDetailPage.tsx"),
      "utf8",
    );
    // The variants of the exported `ApproachLane` union, read from its own
    // declaration — never a hand-kept second list, which would drift.
    const union = laneSource.slice(
      laneSource.indexOf("export type ApproachLane ="),
    );
    const kinds = [
      ...new Set(
        [...union.matchAll(/\{\s*kind:\s*"([a-zA-Z_]+)"/g)].map((m) => m[1]),
      ),
    ];
    expect(kinds).toContain("prediction");
    expect(kinds.length).toBeGreaterThanOrEqual(8);
    const undispatched = kinds.filter(
      (kind) => !pageSource.includes(`case "${kind}":`),
    );
    expect(
      // A kind here is a live Approach card that opens nothing at all.
      undispatched.join(", "),
    ).toBe("");
  });
});
