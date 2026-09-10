#!/usr/bin/env npx tsx
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { unwrapRows } from "../lib/integrity/unwrap";

const root = resolve(import.meta.dirname, "..");
const wanted = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;
const values: Record<string, string> = {};
for (const key of wanted) {
  if (process.env[key]) values[key] = process.env[key] as string;
}
for (const name of [".env.local", ".env.production.local", ".env.production", ".env"]) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!match || !wanted.includes(match[1] as (typeof wanted)[number])) continue;
    values[match[1]] ||= match[2].replace(/^['"]|['"]$/g, "");
  }
}
if (values.NEXT_PUBLIC_SUPABASE_URL !== "https://db.matrxserver.com") {
  throw new Error("Refusing unexpected database URL");
}
if (!values.SUPABASE_SECRET_KEY) throw new Error("Missing operator key");

const supabase = createClient(values.NEXT_PUBLIC_SUPABASE_URL, values.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function run(query: string) {
  const { data, error } = await supabase.rpc("execute_admin_query", { query });
  if (error) throw new Error(error.message);
  return unwrapRows(data);
}

const rowId = "4d32e2e2-081b-45da-b122-04ed17569890";
const owner = "agent-review-first-pass-verifier:2026-09-09T20:00:cbf601a814";
const mode = process.argv[2] ?? "read";

async function main() {
if (mode === "read") {
  const rows = await run(`
    select id, title, url, instructions, status, feedback, conversation_id,
      repo_slug, metadata, created_at, updated_at
    from agent.review_queue where id = '${rowId}'
  `);
  const messages = await run(`
    select m.id, m.created_at, m.content, m.metadata
    from communication.dm_messages m
    join agent.review_queue q on q.conversation_id = m.conversation_id
    where q.id = '${rowId}' order by m.created_at asc
  `);
  console.log(JSON.stringify({ rows, messages }, null, 2));
} else if (mode === "promote") {
  const evidence = process.env.VERIFIER_EVIDENCE;
  if (!evidence) throw new Error("Missing VERIFIER_EVIDENCE");
  const q = (text: string) => `'${text.replaceAll("'", "''")}'`;
  await run(`
    with reviewed as materialized (
      select queue.*, conversation.created_by as audit_user_id,
             conversation.organization_id as conversation_org_id
      from agent.review_queue queue
      join communication.dm_conversations conversation
        on conversation.id = queue.conversation_id
      where queue.id = '${rowId}'
        and queue.status = 'agent_review'
        and queue.metadata->'triage'->'assignment'->>'owner' = ${q(owner)}
      for update
    ), updated as (
      update agent.review_queue queue
      set status = 'ready_for_human',
        metadata = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(queue.metadata, '{triage,assignment,state}', '"awaiting_review"'::jsonb),
              '{triage,verification,verified_by}', to_jsonb(${q(owner)}::text)
            ),
            '{triage,verification,verified_at}', to_jsonb(now())
          ),
          '{triage,verification,notes}', to_jsonb(${q(evidence)}::text)
        )
      from reviewed where queue.id = reviewed.id
      returning queue.*, reviewed.audit_user_id, reviewed.conversation_org_id
    ), message as (
      insert into communication.dm_messages (
        conversation_id, sender_id, content, message_type, status,
        client_message_id, organization_id, created_by, metadata
      )
      select updated.conversation_id, updated.audit_user_id, ${q(evidence)}, 'system', 'sent',
        'agent-review:' || updated.id || ':verified:' || gen_random_uuid(),
        updated.conversation_org_id, updated.audit_user_id,
        jsonb_build_object('actor_kind', 'agent', 'actor_label', ${q(owner)},
          'review_event', 'ready_for_human', 'review_queue_id', updated.id)
      from updated
    )
    select id, title, status, metadata->'triage' as triage from updated
  `);
  console.log(JSON.stringify(await run(`
    select id, title, status, metadata->'triage' as triage, conversation_id
    from agent.review_queue where id = '${rowId}'
  `), null, 2));
  console.log(JSON.stringify(await run(`
    select id, created_at, content, metadata
    from communication.dm_messages
    where conversation_id = (select conversation_id from agent.review_queue where id = '${rowId}')
      and metadata->>'actor_label' = ${q(owner)}
      and metadata->>'review_event' = 'ready_for_human'
    order by created_at desc limit 1
  `), null, 2));
} else {
  throw new Error(`Unknown mode: ${mode}`);
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
