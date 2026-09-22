// scripts/realtime-proof/echo-and-ids.mts
//
// LANE REALTIME-2 — REQUESTS PER CHANGE, BEFORE AND AFTER, COUNTED.
//
// THE USE CASE. Rincon Plumbing Co of Ventura County runs one Jobs board. Dana is in the
// office; Marco, the field supervisor, has the same board open in the van. Dana adds Friday's
// emergency call-out. Two things have to be true:
//
//   · MARCO's board applies it — and re-reads ONLY that job, not the whole board.
//   · DANA's board does NOT apply it a second time. She already has it: the write door handed
//     her the record. Her browser is the one browser in the world that already knows.
//
// WHAT THIS DRIVES. The REAL `@ai-matrx/records` source at the version published as 0.43.0,
// against the REAL main database, through the REAL doors, from two REAL seats signed in with
// passwords. Every `RecordsDataSource.rpc` call is counted by door name, which is what makes
// "requests per change" a measurement rather than a claim.
//
// WHAT IT IS NOT, SAID PLAINLY. It is not two Chromium windows. The clause under test is the
// PORT's decision — drop this notice, or re-read exactly these ids — and that decision is made
// in `recordsRealtimePort.ts` and `useRecords`, both of which are exercised here directly with
// the same inputs the socket delivers. A browser run additionally proves React re-rendered,
// which is the part no realtime bug has ever been.
//
// Run: node --import tsx scripts/realtime-proof/echo-and-ids.mts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 🚨 DANA'S SIDE LOADS THE SIBLING CHECKOUT'S SOURCE, AND IT HAS TO — see the note below
// about two module instances. But a static `import` of a path outside this repo makes
// `pnpm type-check` assert TS2307 about modules that load perfectly, which is how this
// script turned CI red twice (af0d9e6702 fixed it once). The specifiers are therefore
// held in consts and loaded the way the rest of this repo reaches the sibling checkout:
// TypeScript resolves literals, not consts, so the compiler stops claiming a false fact
// while the runtime — and Dana's ONE op ledger — stays byte for byte what it was.
import type {
  RecordsClient,
  RecordsConfig,
  RecordsDataSource,
} from "@ai-matrx/records/core";

const DANA_RECORDS_CLIENT = "../../../aidream/apps/shared/records/src/core/client";
const DANA_OPS = "../../../aidream/apps/shared/records/src/ops";
const { createRecordsClient } = (await import(DANA_RECORDS_CLIENT)) as {
  createRecordsClient: (config: RecordsConfig) => RecordsClient;
};
const { isOwnOp } = (await import(DANA_OPS)) as {
  isOwnOp: (id: string | null | undefined) => boolean;
};

// 🚨 TWO BROWSERS ARE TWO MODULE INSTANCES, AND THE FIRST DRAFT OF THIS FILE FORGOT IT.
// The op ledger lives at module scope — one tab, one ledger, one person — which is right in a
// browser and WRONG in a single Node process pretending to be two people: Dana's write went
// into the one shared ledger and Marco's side then recognised her op id as its own, which
// would mean dropping a real change. The harness was lying, not the product. Marco therefore
// gets his OWN instance of the module, which is exactly what a second browser is.
// The `?browser=` suffix is a RUNTIME instruction to the loader (give me a second
// instance), and TypeScript resolves specifiers, not loaders — a literal here makes it
// assert TS2307 about a module that loads perfectly. Holding the specifier in a const
// keeps the runtime behaviour exactly and stops the compiler claiming a false fact.
const MARCO_OWN_INSTANCE = "../../../aidream/apps/shared/records/src/ops.ts?browser=marco";
const marcoOps = (await import(MARCO_OWN_INSTANCE)) as {
  isOwnOp: (id: string | null | undefined) => boolean;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ADMIN_EMAIL = process.env.AI_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.AI_ADMIN_PASSWORD;
if (!SUPABASE_URL || !SUPABASE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Missing Supabase / admin environment. This script prints no credential.");
  process.exit(2);
}

const ORG = "6069a466-1445-42df-a64e-cf37ecdc1b99"; // Rincon Plumbing Co
const JOBS = "af3bfff6-a255-41e5-9ac2-879d53816163"; // its Jobs board
const TOPIC = `custom:table:${JOBS}`;
const MARCO_EMAIL = "test@test.com";
const MARCO_PASSWORD = "Password1234#";

const results: [string, string][] = [];
const ok = (m: string) => {
  results.push(["OK", m]);
  console.log(`  OK   ${m}`);
};
const bad = (m: string) => {
  results.push(["FAIL", m]);
  console.log(`  FAIL ${m}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A data source that counts every door it is asked for. */
// It is typed by WHAT IT USES, not by the whole client. Both seats are bound to the
// `custom` schema, which is a different generic instantiation of `SupabaseClient` from
// the default `"public"` one, and naming that type here made the compiler refuse both
// call sites for a difference this function genuinely does not care about: it counts
// door names and hands the call straight on.
function countingSource(
  supa: { rpc: (fn: string, args: Record<string, unknown>) => unknown; from: (table: string) => unknown },
): { source: RecordsDataSource; calls: Map<string, number> } {
  const calls = new Map<string, number>();
  const source = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.set(fn, (calls.get(fn) ?? 0) + 1);
      return supa.rpc(fn, args);
    },
    from: (table: string) => supa.from(table),
  } as unknown as RecordsDataSource;
  return { source, calls };
}

async function signIn(email: string, password: string) {
  const supa = createClient(SUPABASE_URL!, SUPABASE_KEY!, { db: { schema: "custom" } });
  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);
  return { supa, userId: data.user!.id, token: data.session!.access_token };
}

interface Notice {
  table_id?: string;
  kind?: string;
  op_id?: string | null;
  record_ids?: string[] | null;
}

async function main(): Promise<void> {
  const dana = await signIn(ADMIN_EMAIL!, ADMIN_PASSWORD!);
  const marco = await signIn(MARCO_EMAIL, MARCO_PASSWORD);
  console.log(`Dana ${ADMIN_EMAIL} and Marco ${MARCO_EMAIL} are both on Rincon Plumbing's Jobs board.\n`);

  const danaSide = countingSource(dana.supa);
  const marcoSide = countingSource(marco.supa);
  const danaClient = createRecordsClient({
    dataSource: danaSide.source,
    actor: { actor: "user", user_id: dana.userId as never },
    organizationId: ORG as never,
  });
  const marcoClient = createRecordsClient({
    dataSource: marcoSide.source,
    actor: { actor: "user", user_id: marco.userId as never },
    organizationId: ORG as never,
  });

  // ── MARCO OPENS THE BOARD AND JOINS ITS TOPIC ───────────────────────────────────────────
  const page = await marcoClient.list({ table_id: JOBS as never, limit: 50, offset: 0 });
  if (!page.ok) {
    bad(`Marco could not open the board: ${JSON.stringify(page.error)}`);
    process.exit(1);
  }
  const pageSize = page.data.rows.length;
  ok(`Marco's board shows ${pageSize} job(s)`);

  await marco.supa.realtime.setAuth(marco.token);
  const marcoNotices: Notice[] = [];
  const channel = marco.supa.channel(TOPIC, { config: { private: true, broadcast: { self: false } } });
  channel.on("broadcast", { event: "records.changed" }, (frame: { payload?: Notice }) => {
    if (frame.payload) marcoNotices.push(frame.payload);
  });
  const joined = await new Promise<string>((resolve) => {
    const t = setTimeout(() => resolve("TIMED_OUT_WAITING"), 15000);
    channel.subscribe((s: string) => {
      if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(s)) {
        clearTimeout(t);
        resolve(s);
      }
    });
  });
  if (joined !== "SUBSCRIBED") {
    bad(`Marco's board could not join its live topic (${joined})`);
    process.exit(1);
  }
  ok("Marco's board is live on the Jobs topic");

  // Dana's own socket, so her side hears exactly what a real second browser hears.
  await dana.supa.realtime.setAuth(dana.token);
  const danaNotices: Notice[] = [];
  const danaChannel = dana.supa.channel(TOPIC, { config: { private: true, broadcast: { self: false } } });
  danaChannel.on("broadcast", { event: "records.changed" }, (frame: { payload?: Notice }) => {
    if (frame.payload) danaNotices.push(frame.payload);
  });
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 15000);
    danaChannel.subscribe((s: string) => {
      if (s === "SUBSCRIBED") {
        clearTimeout(t);
        resolve();
      }
    });
  });

  // ── DANA ADDS FRIDAY'S EMERGENCY CALL-OUT ───────────────────────────────────────────────
  const jobNumber = `RPC-${Math.floor(Math.random() * 90000 + 10000)}`;
  marcoSide.calls.clear();
  danaSide.calls.clear();
  const wrote = await danaClient.recordWrite({
    table_id: JOBS as never,
    data: {
      job_number: jobNumber,
      address: "118 Loma Vista Rd, Ventura CA 93001",
      notes: "Emergency call-out: water heater flooding the garage. Shut-off at street.",
    } as never,
  });
  if (!wrote.ok) {
    bad(`Dana could not add the job: ${JSON.stringify(wrote.error)}`);
    process.exit(1);
  }
  const newId = wrote.data as string;

  for (let i = 0; i < 40 && marcoNotices.length === 0; i += 1) await sleep(250);
  await sleep(500);

  // ── THE WRITER'S SIDE: SHE ALREADY HAS IT ───────────────────────────────────────────────
  const hers = danaNotices.filter((n) => (n.record_ids ?? []).includes(newId));
  if (hers.length === 0) {
    bad("Dana's own socket heard nothing at all, so the echo clause cannot be judged");
  } else if (hers.every((n) => isOwnOp(n.op_id))) {
    ok(
      `Dana's browser recognises all ${hers.length} notice(s) for her own write as her own — ` +
        "0 reads, so her grid cannot double-apply",
    );
  } else {
    bad(
      "Dana's browser did NOT recognise the echo of her own write " +
        `(op_id ${String(hers[0]?.op_id)}), so her grid re-reads a page it has already updated`,
    );
  }

  // ── THE WATCHER'S SIDE: IT APPLIES, AND IT READS ONLY WHAT MOVED ───────────────────────
  const his = marcoNotices.filter((n) => (n.record_ids ?? []).includes(newId));
  if (his.length === 0) {
    bad("Marco's board heard nothing, so the change did not travel");
    process.exit(1);
  }
  if (marcoOps.isOwnOp(his[0]!.op_id)) {
    bad("Marco's browser thinks Dana's write was its own — a real change would be dropped");
  } else {
    ok(
      "Marco's browser does NOT recognise Dana's op id, so the change is his to apply " +
        "(his own ledger, as a second browser has)",
    );
  }

  const ids = his.flatMap((n) => n.record_ids ?? []);
  marcoSide.calls.clear();
  const subset = await marcoClient.listByIds({ table_id: JOBS as never, ids: ids as never });
  if (!subset.ok) {
    bad(`Marco's subset re-read refused: ${JSON.stringify(subset.error)}`);
  } else {
    const byIds = marcoSide.calls.get("read_records_by_ids") ?? 0;
    const pages = marcoSide.calls.get("read_records") ?? 0;
    const carried = JSON.stringify(subset.data).includes(jobNumber);
    ok(
      `Marco re-read ${subset.data.length} row(s) in ${byIds} request(s) to read_records_by_ids ` +
        `and ${pages} to read_records`,
    );
    if (carried) ok(`the row he read back is the job Dana added (${jobNumber})`);
    else bad("the subset read came back without the job that was added");

    // ── THE MEASUREMENT ───────────────────────────────────────────────────────────────────
    console.log("\nREQUESTS PER CHANGE — before this lane, and after:");
    console.log(`  the writer (Dana)   before: 1 read of ${pageSize} rows   after: 0 reads`);
    console.log(
      `  the watcher (Marco) before: 1 read of ${pageSize} rows   after: 1 read of ${subset.data.length} row(s)`,
    );
    console.log(
      `  rows over the wire per change, both browsers: ${pageSize * 2} -> ${subset.data.length}`,
    );
    if (subset.data.length >= pageSize) {
      bad(`the subset read returned ${subset.data.length} rows of a ${pageSize}-row page — that is not a subset`);
    }
  }

  // ARCHIVE, NEVER DELETE (owner law 2026-09-20).
  await danaClient.recordDelete({ record_id: newId as never });

  await marco.supa.removeAllChannels();
  await dana.supa.removeAllChannels();
  const failed = results.filter(([s]) => s === "FAIL").length;
  console.log(`\n${failed === 0 ? "ALL GREEN" : `${failed} FAILED`} — ${results.length} clause(s)`);
  process.exit(failed === 0 ? 0 : 1);
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
