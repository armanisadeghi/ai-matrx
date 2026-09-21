import { connectDirect, loadDbEnv } from "./lib/direct-db";

const OWNER = "independent-reviewer-row-actions-20260921-v2";
const ROW = "97371913-d3e0-4775-b731-0da6c46d0deb";

async function main() {
  const env = loadDbEnv();
  const client = await connectDirect(env as any, "review-ra-claim");
  try {
    await client.query("begin");
    const res = await client.query(
      `update agent.review_queue
       set metadata = jsonb_set(
         jsonb_set(metadata, '{triage,assignment,owner}', to_jsonb($1::text)),
         '{triage,assignment,claimed_at}', to_jsonb(now())
       )
       where id = $2 and status = 'agent_review'
       returning id, status, metadata->'triage'->'assignment' as assignment`,
      [OWNER, ROW]
    );
    if (res.rowCount !== 1) {
      throw new Error("unexpected rowcount " + res.rowCount);
    }
    const msg = await client.query(
      `insert into communication.dm_messages (
        conversation_id, sender_id, content, message_type, status,
        client_message_id, organization_id, created_by, metadata
      )
      select
        conversation.id,
        conversation.created_by,
        'Prior reviewer was stopped mid-run with no evidence recorded; treating row as unclaimed and taking over as independent reviewer to re-run instructions live.',
        'system',
        'sent',
        'agent-review:' || $2 || ':reclaimed:' || gen_random_uuid(),
        conversation.organization_id,
        conversation.created_by,
        jsonb_build_object(
          'actor_kind', 'agent',
          'actor_label', $1::text,
          'review_event', 'agent_review',
          'review_queue_id', $2::uuid
        )
      from communication.dm_conversations conversation
      where conversation.id = '0be3d29d-fd91-450b-b551-8d44b3f11e35'
      returning id`,
      [OWNER, ROW]
    );
    await client.query("commit");
    console.log(JSON.stringify(res.rows, null, 2));
    console.log("message inserted:", msg.rowCount);
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
