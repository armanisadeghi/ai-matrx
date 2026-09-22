// scripts/realtime-proof/scheduler-channel.mjs
//
// LANE REALTIME-2 — THE SCHEDULER'S PRIVATE CHANNEL: DOES IT JOIN, AND DOES IT DELIVER?
//
// `lib/scheduler-client/realtime.ts` has declared `private: true` on
// `scheduler:user:<user_id>` since it was written. RLS has been ENABLED on
// `realtime.messages` with ZERO POLICIES since this database was created, and lane REALTIME's
// one policy registers exactly one prefix — `custom:table`. So this channel has joined
// NOTHING, ever, behind a screen that looked healthy. This file is the before-and-after.
//
// THE USE CASE (owner law: no fake test data). Rincon Plumbing Co's office runs a standing
// job: "Ventura County permit board — Monday 6am sweep", a scheduled task that re-checks the
// county permit portal for the crew's open pulls and drops the results on the dispatcher's
// desk before the vans roll. Dana keeps the schedules page open on the office monitor. When
// the sweep's next run time moves — because somebody paused it, or because it just fired —
// that page must change without her reloading it.
//
// WHAT IT ASSERTS
//   1. The channel JOINS (`SUBSCRIBED`). Before the prefix is registered this is
//      `CHANNEL_ERROR` — run it before and after the migration and the two runs are the proof.
//   2. A real change to a real `scheduler.sch_task` row DELIVERS: the INSERT/UPDATE frame
//      reaches the socket, carrying the row `realtime.broadcast_changes` put on it.
//   3. A DIFFERENT person's feed is REFUSED at the join. `scheduler:user:<somebody else>` is
//      the whole of that person's scheduler, so this is the clause that matters most.
//
// Run: node scripts/realtime-proof/scheduler-channel.mjs      (env loaded; prints no credential)

import { createClient } from "@supabase/supabase-js";
import { formatDurationMs } from "@ai-matrx/kit/format";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ADMIN_EMAIL = process.env.AI_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.AI_ADMIN_PASSWORD;
if (!SUPABASE_URL || !SUPABASE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / " +
      "AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD. Run with the repo's env loaded.",
  );
  process.exit(2);
}

// test@test.com — a real second identity, used ONLY as the id of a feed that is not ours.
const SOMEBODY_ELSE = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";
// Rincon Plumbing Co of Ventura County — the real business this campaign's suites use.
const RINCON = "6069a466-1445-42df-a64e-cf37ecdc1b99";

const results = [];
const ok = (m) => {
  results.push(["OK", m]);
  console.log(`  OK   ${m}`);
};
const bad = (m) => {
  results.push(["FAIL", m]);
  console.log(`  FAIL ${m}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Join one private topic and report the status Realtime answered with. */
async function join(supa, topic, onFrame) {
  const channel = supa.channel(topic, { config: { private: true, broadcast: { self: false } } });
  for (const event of ["INSERT", "UPDATE", "DELETE"]) {
    channel.on("broadcast", { event }, (frame) => onFrame?.(event, frame));
  }
  const status = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve("TIMED_OUT_WAITING"), 15000);
    channel.subscribe((s) => {
      if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
        clearTimeout(timer);
        resolve(s);
      }
    });
  });
  return { channel, status };
}

async function main() {
  const supa = createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: "scheduler" } });
  const { data: auth, error: authError } = await supa.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (authError) {
    console.error(`could not sign in: ${authError.message}`);
    process.exit(2);
  }
  const me = auth.user.id;
  console.log(`signed in; this person's scheduler feed is scheduler:user:${me}`);

  // THE STEP WHOSE ABSENCE MAKES A PRIVATE CHANNEL LOOK HEALTHY AND DELIVER NOTHING FOREVER.
  await supa.realtime.setAuth(auth.session.access_token);

  const frames = [];
  const mine = await join(supa, `scheduler:user:${me}`, (event, frame) =>
    frames.push({ event, frame }),
  );
  if (mine.status === "SUBSCRIBED") ok(`the scheduler's own feed JOINS (scheduler:user:${me})`);
  else
    bad(
      `the scheduler's own feed did NOT join — Realtime answered ${mine.status}. ` +
        "That is the state this lane exists to end: the prefix `scheduler:user` is not " +
        "registered in platform.realtime_topic_prefix, so the one policy on realtime.messages " +
        "refuses it.",
    );

  const theirs = await join(supa, `scheduler:user:${SOMEBODY_ELSE}`);
  if (theirs.status === "SUBSCRIBED")
    bad(
      "somebody else's ENTIRE scheduler feed was joined — the payload on this topic is the " +
        "whole sch_* row, so this would hand over every schedule that person owns",
    );
  else ok(`another person's feed is refused at the join (${theirs.status})`);

  // A REAL CHANGE, THROUGH A REAL WRITE. `scheduler.sch_task` is a normal RLS table the
  // signed-in person writes directly (the frontend does exactly this), so no service role and
  // nothing privileged is used here.
  let delivered = null;
  if (mine.status === "SUBSCRIBED") {
    const label = "Ventura County permit board — Monday 6am sweep";
    const { data: row, error: writeError } = await supa
      .from("sch_task")
      .insert({
        user_id: me,
        organization_id: RINCON,
        kind: "agent",
        title: label,
        description:
          "Re-checks the Ventura County permit portal for Rincon Plumbing's open pulls and " +
          "drops the results on the dispatcher's desk before the vans roll.",
        next_due_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .select("id")
      .single();
    if (writeError) {
      bad(`could not write the schedule the proof needs: ${writeError.message}`);
    } else {
      const t0 = Date.now();
      for (let i = 0; i < 60 && !frames.some((f) => f.event === "INSERT"); i += 1) await sleep(250);
      const hit = frames.find((f) => f.event === "INSERT");
      if (hit) {
        delivered = Date.now() - t0;
        const payload = hit.frame?.payload ?? hit.frame;
        const carried = JSON.stringify(payload).includes(label);
        ok(
          `the change DELIVERED ${formatDurationMs(delivered, { style: "compact" })} after the write, on this person's own feed`,
        );
        if (carried)
          ok("the frame carries the row realtime.broadcast_changes put on it (the schedule's own name)");
        else bad("a frame arrived but it does not carry the row that was written");
      } else {
        bad("the channel joined but the write delivered nothing within 15 s");
      }
      // ARCHIVE, NEVER DELETE (owner law 2026-09-20). The row is a real schedule shape; it is
      // paused and marked so a cleanup sweep can find it by its settings, not by its name.
      await supa
        .from("sch_task")
        .update({ enabled: false, deleted_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  await supa.removeAllChannels();
  const failed = results.filter(([s]) => s === "FAIL").length;
  console.log(
    `\n${failed === 0 ? "ALL GREEN" : `${failed} FAILED`} — ${results.length} clause(s)`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

void main();
