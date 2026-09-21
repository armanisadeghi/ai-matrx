#!/usr/bin/env npx tsx
// Data crew D, phase 3: "use the product hard" probes against the podcast org's
// live data already entered: a working rollup, revisions/history, and a comment
// with a mention. Real door calls, not UI clicks (browser pane banned this
// session; headless Playwright already proved the ramp switch).
import path from "node:path";
import dotenv from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), override: true });
const ADMIN_EMAIL = process.env.AI_ADMIN_USERNAME as string;
const ADMIN_PASSWORD = process.env.AI_ADMIN_PASSWORD as string;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;

const LOG: Record<string, unknown>[] = JSON.parse(readFileSync(path.resolve(__dirname, "entry-limits.json"), "utf8"));
function limit(doing: string, said: string, expected: string) {
  LOG.push({ when: new Date().toISOString(), crew: "D", use_case: "A podcast's episode pipeline", doing, said, expected });
  console.log(`[LIMIT] ${doing} -> ${said}`);
}

async function main() {
  const results = JSON.parse(readFileSync(path.resolve(__dirname, "entry-results.json"), "utf8"));
  const podcast = results["Signal & Scale Podcast"];
  const orgId = podcast.orgId;
  const episodesId = podcast.tableIds.episodes;
  const sponsorsId = podcast.tableIds.sponsors;

  const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY);
  const signedIn = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (signedIn.error || !signedIn.data.user) throw new Error(`sign-in failed: ${signedIn.error?.message}`);
  const userId = signedIn.data.user.id;

  const store: RecordsClient = createRecordsClient({
    dataSource: recordsDataSource(supabase),
    actor: personActor(userId),
    organizationId: orgId,
  });

  // 1) A WORKING ROLLUP: on episodes (which HAS a forward "sponsor" relation),
  // surface the sponsor's own rate — proves the rollup door works when `via`
  // names a same-table relation field, per the refusal's own instructions.
  const rollup = await store.fieldDeclare({
    table_id: episodesId,
    spec: { name: "sponsor_rate_on_file", label: "sponsor_rate_on_file", type: "rollup", via: "sponsor", of: "rate_per_episode", agg: "max" } as any,
  });
  if (!rollup.ok) {
    limit("fieldDeclare rollup (episodes.sponsor_rate_on_file via episodes.sponsor)", rollup.error.message, "a rollup column surfacing the linked sponsor's rate on the episode");
  } else {
    console.log(`rollup field declared -> ${rollup.data}`);
  }

  // 2) HISTORY: read the revision trail after several edits. Pick episode 41's
  // record, do two real edits (status + publish note), then read revisions.
  const ep = await store.query({ table_id: episodesId, filters: [{ field: "episode_number", op: "eq", value: 41 }] } as any).catch((e) => ({ ok: false, error: { message: String(e) } } as any));
  let ep41Id: string | undefined;
  if ((ep as any).ok && (ep as any).data?.rows?.length) {
    ep41Id = (ep as any).data.rows[0].id ?? (ep as any).data.rows[0].record_id;
  }
  if (!ep41Id) {
    limit("query episodes by episode_number", JSON.stringify(ep), "a way to find episode 41's record id to test history on");
  } else {
    const edit1 = await store.recordWrite({ table_id: episodesId, data: { id: ep41Id, show_notes: "UPDATED: added a correction Priya sent after publish about the platform-adoption metric." } as any });
    const edit2 = await store.recordWrite({ table_id: episodesId, data: { id: ep41Id, status: "Published" } as any });
    if (!edit1.ok) limit("recordWrite edit 1 (show_notes correction)", edit1.error.message, "the edit to be saved");
    if (!edit2.ok) limit("recordWrite edit 2 (status re-confirm)", edit2.error.message, "the edit to be saved");
    const hist = await store.revisions({ record_id: ep41Id });
    if (!hist.ok) {
      limit("revisions (history) on episode 41", hist.error.message, "a readable list of who changed what and when");
    } else {
      console.log(`history: ${hist.data.length} revisions found on episode 41`);
      writeFileSync(path.resolve(__dirname, "history-episode-41.json"), JSON.stringify(hist.data, null, 2));
    }

    // 3) COMMENT WITH A MENTION on the same record.
    const comment = await store.commentWrite({
      record_id: ep41Id,
      body: "Sponsor read for Verity API Testing is approved — @admin please confirm the outro tag before this goes out.",
      mentions: [userId],
    } as any);
    if (!comment.ok) {
      limit("commentWrite with a mention on episode 41", comment.error.message, "a comment posted to the record's thread naming a mentioned person");
    } else {
      console.log(`comment written -> ${JSON.stringify(comment.data)}`);
    }
  }

  writeFileSync(path.resolve(__dirname, "entry-limits.json"), JSON.stringify(LOG, null, 2));
  console.log(`Done. ${LOG.length} total limitations recorded so far.`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
