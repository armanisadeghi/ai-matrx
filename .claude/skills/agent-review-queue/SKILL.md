---
name: agent-review-queue
description: Register UI work for agent-first review, review or repair one claimed item, append every round to its durable Messages thread, verify it, and only then send it to Arman. Use at the end of reviewable UI work, when an Agent Review task is assigned, and when handling messages or status changes from /administration/users/agent-review.
---

# Agent Review — agent first, Arman last

**The failure this kills:** unfinished or unverified work must never arrive as Arman's homework. Every submission is reviewed and repaired by agents first. Arman sees only `ready_for_human` items.

## Submit reviewable work

Use the Supabase MCP against East project `brsgrqvjdzwihsvnfqkf`. Resolve the real `platform.repo.slug`, domain, and optional feature from `platform.taxonomy_node`; never infer a product taxonomy from a URL.

```sql
insert into agent.review_queue (
  title, url, instructions, source, repo_slug, domain_id, feature_id, metadata
) values (
  'Short human title', '/the/live/path',
  'What changed, how to exercise it, and what must be proven.',
  'ai-matrx', 'matrx-frontend',
  '<platform.taxonomy_node domain id>',
  '<platform.taxonomy_node feature id or null>',
  jsonb_build_object(
    'origin', jsonb_build_object(
      'agent_label', '<stable task label>',
      'thread_id', '<Codex task id when available>',
      'commit', '<commit when available>'
    ),
    'triage', jsonb_build_object(
      'version', 1, 'lane', 'browser_ui',
      'required_tools', jsonb_build_array('browser','frontend_code','authenticated_session'),
      'workstreams', jsonb_build_array('verification'), 'priority', 'normal',
      'assignment', jsonb_build_object('mode','coordinator','state','ready'),
      'verification', jsonb_build_object(
        'browser_breakpoints', jsonb_build_array('desktop','tablet','mobile')
      )
    )
  )
);
```

The insert trigger creates `communication.dm_conversations`, adds Arman as its participant, seeds the instructions as the first agent-authored message, and writes `conversation_id` back onto the row. **Never create a second review-message table and never overwrite conversation history.**

## Workflow

| Status | Meaning | Owner |
|---|---|---|
| `submitted` | Waiting for independent agent review | agent coordinator |
| `agent_review` | Claimed and being exercised | reviewing agent |
| `agent_changes_requested` | Reviewer found work the implementation agent must repair | implementation agent |
| `ready_for_human` | Agent review is clean; this is the only normal Arman inbox | Arman |
| `human_changes_requested` | Arman replied in the thread and sent it back | agent coordinator |
| `approved` | Arman approved; finish follow-through | implementation agent |
| `archived` | Complete | implementation agent |

**A status change always has a message.** Append the finding, repair receipt, verification evidence, approval, or request to the linked DM conversation, then update the queue row. The mutable `instructions` and `feedback` columns remain legacy summaries only; they are never the conversation.

Agent-authored DM messages use the authenticated user as the audit principal in `sender_id` and identify the effective actor in `metadata`:

```json
{
  "actor_kind": "agent",
  "actor_label": "stable agent or task label",
  "review_event": "review_started | changes_requested | repaired | verified | ready_for_human",
  "review_queue_id": "uuid"
}
```

Human messages carry `actor_kind: "human"`. The Messages UI and embedded review thread render the effective actor, while the database retains who authorized the write.

## Agent review contract

1. Atomically claim one `submitted` or `human_changes_requested` row; set `status='agent_review'` and `metadata.triage.assignment.state='claimed'` with owner and timestamp.
2. Open the exact target and read the entire DM thread before testing. Old feedback is history, not the current instruction.
3. Test the stated flow, desktop first; test tablet/mobile without degrading desktop. Check the target's governing doctrine and feature inventory.
4. If broken, append concrete findings and set `agent_changes_requested`. Do not send it to Arman.
5. After repair, use a different verifier for high/critical work. Append the repair and proof.
6. Only a clean item becomes `ready_for_human`. The final message tells Arman what to open, what was independently checked, and the narrow judgment still needed from him.

## Human feedback and later rounds

Arman's routed workspace is `/administration/users/agent-review/<review-id>`. His ordinary messages, change requests, approval, rerun request, and agent replies all remain in the same `communication.dm_conversations` thread and therefore also appear under `/messages/<conversation-id>`.

- `human_changes_requested` → read the newest human message, repair, independently verify, append proof, return to `ready_for_human`.
- `approved` → complete follow-through, append the receipt, then archive.
- “Run agent review again” → returns the item to `submitted` and appends a new-round message. Never erase or relabel the old round.

## Rules

- **Agents first.** Never insert or move work directly to `ready_for_human` without independent evidence.
- **Thread, not fields.** Never replace `instructions` or `feedback` to communicate a new round.
- **One item, one conversation.** Reuse `conversation_id`; no parallel chat, issue thread, or prose handoff.
- **Everything is live.** Review the deployed target; deployment/PR caveats do not belong in messages.
- **No duplicate rows.** Reuse an active row for the same artifact and append the next round to its thread.
- **Classification is required.** `repo_slug` + domain + feature are registry identities, not chips inferred from prose.
- **Schedules require approval.** No recurring reviewer runs until Arman approves the automation by name and interval.
