---
type: Reference
title: "agent-review-queue — review, claim, and repair"
description: "Browser isolation, the one-item-per-run review worker, atomic claim and ownership handoff SQL, and PASS/FAIL/repair evidence; the skill sends you here before reviewing, claiming, verifying, or repairing a review-queue row. Companion to the agent-review-queue skill."
tags: [agent-review-queue, skills, review-worker]
timestamp: 2026-09-10T00:00:00Z
---

# agent-review-queue — review, claim, and repair

## Contents

- Codex Browser isolation — mandatory for every automated review
- Initial review and repair worker — one item per run
- PASS, FAIL, and repair evidence

## Codex Browser isolation — mandatory for every automated review

**Use an isolated browser first**, preferably Codex's built-in Browser with its own
signed-in profile. Computer Use and other browser tools are allowed. If the isolated
browser cannot complete the task (for example, a required account is signed in only
in Arman's browser, or no isolated browser is available), use Arman's browser in a
**new tab**. This fallback is pre-authorized; do not ask again just to switch browsers.
Never navigate, control, or close a tab Arman is using. Close only your own tabs/groups.

- Read the available browser tool's documentation and explicitly select its isolated
  browser where supported. No particular tool name, skill, or API is required.
  A missing older Browser skill or Node REPL is not proof the isolated browser is
  unavailable; check other available browser tools, including Computer Use.
- Before claiming a queue row, open the admin list in a new tab using the browser selection rule above and prove the
  admin surface is signed in. The canonical admin credentials live in
  `/Users/armanisadeghi/code/aidream/.env.agents` and
  `/Users/armanisadeghi/code/matrx-frontend/.env.local` under `AI_ADMIN_USERNAME` and
  `AI_ADMIN_PASSWORD`. Read them directly from one of those files; never echo, log, copy, or
  paste them anywhere except the intended `manage.aimatrx.com` sign-in form. Arman granted
  standing authorization for scheduled Agent Review First Pass workers to perform this exact
  env-to-admin login on 2026-08-24. Never ask where the credentials live and never ask him to
  approve this routine login again. If sign-in is required, complete it before claiming a queue
  item; the persistent profile retains the resulting session for later runs.
- Passwords and session tokens never appear in this skill, an automation prompt, queue metadata,
  messages, screenshots, logs, or chat. Automated credential entry is authorized only for the
  exact local env fields and destination above; this is not permission to use or expose any other
  credential.
- Name the Browser session for the review worker and close every tab or tab group the run creates,
  on success, failure, or blockage. Never close a tab that predates the run.

Production review does not require a localhost preview. Start or reuse the managed preview
only when a repair needs local testing, after reading the repository's preview rules and
checking its status. A running PID/root identifies a process, not its task owner. Coordinate
with the active owner before reuse or restart; repair a proven orphan through the managed
lifecycle. `preview:start` can reuse a same-root server and is not a task-level Browser lock.
Never stop another task's preview. On exit close only this run's tabs, restore changed viewport
settings, and stop a preview only if this run owns it; check cleanup without demanding another
owner's preview disappear.

Follow the browser selection rule above and prove the admin session before claiming a review row. While
recovering access, continue safe prerequisite repair; do not label routine authentication
failure a terminal blocker.

## Initial review and repair worker — one item per run

Use the original agent when `metadata.origin.thread_id` or another stable identity exists and
the repair is context-heavy. Use a coordinator with specialists when origin identity is absent,
the backlog is large, or the row requires distinct tool access. **`repo_slug` is the repository**
(registry-backed); `source` is free text and identifies neither a repo nor an agent.

Only the recurring entrypoint claims a schedule window and selects a candidate. An independent
reviewer delegated for an already owned row uses that exact row within the existing run; it
must not claim another window/item or complete the coordinator's schedule claim. When ownership
must transfer, the coordinator conditionally updates the observed row owner/state and records
the handoff in its conversation. The verifier records its own distinct agent identity in the
verification and conversation evidence, never the builder's identity. A coordinator who did
not implement the work may independently verify it. For a delegated verifier, conditionally
transfer the exact row from the observed owner to the verifier and set assignment state to
`verifying`, retaining `status='agent_review'`; append the handoff to its conversation and
re-read both. The verifier then uses its own identity as the assignment owner in the PASS SQL.
Never release the row to the general pool while that verifier is actively working.

The recurring worker follows this exact order:

1. Discover `schedule_claim` on the AI Dream MCP. If absent or unauthorized, inspect
   `codex mcp list`, refresh with `codex mcp login aidream`, and retry the actual operation.
   Inspect installed connector configuration and documented runtime access before declaring
   it unavailable. Do not guess a remote route or bypass the claim with direct SQL or the
   general schedule registry's non-atomic Markdown fallback.
2. Compute the current America/Los_Angeles half-hour boundary (`YYYY-MM-DDTHH:00` or
   `YYYY-MM-DDTHH:30`) once. Claim `task_key="agent-review-first-pass"` with that exact
   `window_key`, an identifiable account/task label, and machine. Use a unique row owner per run:
   `agent-review-first-pass:<task id>:<window_key>` (add a run suffix for an explicit retry). `claimed=false` means stop
   this duplicate scheduled invocation without completing someone else's claim. Retain the
   window for cleanup. A duplicate does not cancel a separate explicit user assignment:
   continue non-conflicting audit/repair work, coordinate an exact-row handoff with its owner,
   or wait for the next real cadence window. Never invent a window or steal a claim; overlap
   alone is not a human-only blocker.
3. Prove the selected browser admin session, then atomically claim one eligible item, prioritizing
   human-requested repairs, agent-requested repairs, then submissions.
4. Read the entire durable conversation and target repo's `CLAUDE.md`. Execute the real test
   instructions on the live target, including declared browser/data/API checks.
5. On a pass, independently record evidence and promote. On failure, retain ownership while
   fixing or coordinating a named repair worker; record the reproducible defect and repair
   evidence. Commit/push, resolve delivery failures, and dispatch an independent live reviewer.
   Follow that reviewer through its result in this run. Apply the
   [execution completion gate](/policies/defect-ownership.md) before ending (local file:
   `/Users/armanisadeghi/code/common-docs/policies/defect-ownership.md`): recoverable
   obstacles and pending verification require continued work, coordination, or waiting.
   Only a freshly verified human-only gate or an actual forced execution interruption
   permits an unfinished exit. Record the exact remaining work and continuation ownership;
   return the row to `agent_changes_requested` / `ready` only when no repair worker or
   verifier is still active. Never imply completion or use the next cadence as automatic deferral.
6. Fix observed process weaknesses, then close owned Browser/preview resources on every exit.
   Complete only the claimed window with `schedule_claim(action="complete",
   task_key="agent-review-first-pass", window_key="<same boundary>", status="completed",
   result_note="<item, fix, verification, process improvement, remaining work>")`.
   Legal terminal statuses are `completed`, `failed`, and `abandoned`; `skipped` is not one.
   Terminal status records an outcome; it never authorizes stopping recoverable work.
   Use `failed` for an execution failure that remains after the completion gate. A legitimate no-work outcome uses
   `completed` with the explicit reason; it never implies an unverified row passed.

One queue item is the run's review scope; its prerequisites, repairs, independent verification,
and demonstrated process improvements are part of that work. This limit is not a reason to
stop at diagnosis or defer a feasible repair. Rows marked `human_required`, declaring
`human_input`, or without a browser requirement belong to their appropriate lane; do not
misclassify them just to claim work.

Missing triage/conversations and stranded claims require reconciliation, not endless skips.
Inspect the sweep and existing queue service to repair one malformed candidate from actual
registry/row evidence before claiming it. For a claimed row, check its durable owner, current
task activity, and conversation, and contact an active owner. A coordinator may deliberately
reassign only after establishing release or abandonment, using a conditional update against
the observed owner/state and appending the reason. Age alone is not abandonment; there is no
TTL/reaper guaranteed by this SQL. Do not steal a live claim. If no candidate can safely proceed,
repair the demonstrated routing/tooling defect and record the remaining exact constraint.

Claim one row atomically and append the claim event to its existing conversation. Replace the
placeholder with the unique per-run owner computed above. Keep `metadata.origin.agent_label`
as the stable campaign/lane slug; it is not the assignment owner:

```sql
with candidate as materialized (
  select queue.id
  from agent.review_queue queue
  where queue.status in (
      'human_changes_requested',
      'agent_changes_requested',
      'submitted'
    )
    and queue.conversation_id is not null
    and queue.metadata->'triage'->>'lane' <> 'human_required'
    and queue.metadata->'triage'->'required_tools' @> '["browser"]'::jsonb
    and not (queue.metadata->'triage'->'required_tools' @> '["human_input"]'::jsonb)
    and queue.metadata->'triage'->'assignment'->>'state' = 'ready'
  order by
    case queue.status
      when 'human_changes_requested' then 1
      when 'agent_changes_requested' then 2
      else 3
    end,
    case queue.metadata->'triage'->>'priority'
      when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4
    end,
    coalesce(queue.feedback_at, queue.created_at),
    queue.id
  for update skip locked
  limit 1
), claimed as (
  update agent.review_queue queue
  set
    status = 'agent_review',
    metadata = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(queue.metadata, '{triage,assignment,state}', '"claimed"'::jsonb),
            '{triage,assignment,owner}', to_jsonb('<stable agent/task label>'::text)
          ),
          '{triage,assignment,claimed_at}', to_jsonb(now())
        ),
        '{triage,verification,verified_by}', 'null'::jsonb
      ),
      '{triage,verification,verified_at}', 'null'::jsonb
    )
  from candidate
  where queue.id = candidate.id
  returning queue.*
), message as (
  insert into communication.dm_messages (
    conversation_id, sender_id, content, message_type, status,
    client_message_id, organization_id, created_by, metadata
  )
  select
    claimed.conversation_id,
    conversation.created_by,
    'Claimed for initial agent review and live browser verification.',
    'system',
    'sent',
    'agent-review:' || claimed.id || ':claimed:' || gen_random_uuid(),
    conversation.organization_id,
    conversation.created_by,
    jsonb_build_object(
      'actor_kind', 'agent',
      'actor_label', '<stable agent/task label>',
      'review_event', 'agent_review',
      'review_queue_id', claimed.id
    )
  from claimed
  join communication.dm_conversations conversation
    on conversation.id = claimed.conversation_id
)
select * from claimed;
```

If this returns zero rows, another worker got there first or no eligible item is ready. Never
take an already claimed row unless a coordinator deliberately reassigns it.

## PASS, FAIL, and repair evidence

Required evidence depends on `required_tools`:

- `browser`: test the actual interaction path and every declared breakpoint in the Codex
  built-in Browser, using the signed-in admin session when declared.
- `database`: verify the live row/RLS/RPC result, not just a migration or fixture file.
- `deployment`: verify production behavior; a branch, commit, or local build is not proof.
- `external_service`: use a deterministic fixture when a paid/destructive call is unsafe, and
  say exactly what was not exercised.

On **PASS**, append a concise evidence message and move the item to the human inbox in one
statement. The evidence text must name the interaction tested, result, target, and relevant
breakpoints or data/API checks. The identity below is the actual independent reviewer and
must already own this row (through its original claim or the conditional handoff above).
It is never a label borrowed from the builder or delegating coordinator:

```sql
with reviewed as materialized (
  select queue.*, conversation.created_by as audit_user_id,
         conversation.organization_id as conversation_org_id
  from agent.review_queue queue
  join communication.dm_conversations conversation
    on conversation.id = queue.conversation_id
  where queue.id = '<review id>'
    and queue.status = 'agent_review'
    and queue.metadata->'triage'->'assignment'->>'owner' = '<independent reviewer identity>'
  for update
), updated as (
  update agent.review_queue queue
  set
    status = 'ready_for_human',
    metadata = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(queue.metadata, '{triage,assignment,state}', '"awaiting_review"'::jsonb),
          '{triage,verification,verified_by}', to_jsonb('<independent reviewer identity>'::text)
        ),
        '{triage,verification,verified_at}', to_jsonb(now())
      ),
      '{triage,verification,notes}', to_jsonb('<concise verification evidence>'::text)
    )
  from reviewed
  where queue.id = reviewed.id
  returning queue.*, reviewed.audit_user_id, reviewed.conversation_org_id
), message as (
  insert into communication.dm_messages (
    conversation_id, sender_id, content, message_type, status,
    client_message_id, organization_id, created_by, metadata
  )
  select
    updated.conversation_id,
    updated.audit_user_id,
    '<concise verification evidence>',
    'system',
    'sent',
    'agent-review:' || updated.id || ':verified:' || gen_random_uuid(),
    updated.conversation_org_id,
    updated.audit_user_id,
    jsonb_build_object(
      'actor_kind', 'agent',
      'actor_label', '<independent reviewer identity>',
      'review_event', 'ready_for_human',
      'review_queue_id', updated.id
    )
  from updated
)
select id, title, status, metadata->'triage' as triage from updated;
```

When **releasing a failed item** after repair or explicit coordination, append the reproducible
finding and return it to the repair pool. Do not release ownership before an active repair:

```sql
with reviewed as materialized (
  select queue.*, conversation.created_by as audit_user_id,
         conversation.organization_id as conversation_org_id
  from agent.review_queue queue
  join communication.dm_conversations conversation
    on conversation.id = queue.conversation_id
  where queue.id = '<review id>'
    and queue.status = 'agent_review'
    and queue.metadata->'triage'->'assignment'->>'owner' = '<stable agent/task label>'
  for update
), updated as (
  update agent.review_queue queue
  set
    status = 'agent_changes_requested',
    feedback = '<reproducible finding and expected behavior>',
    feedback_at = now(),
    metadata = jsonb_set(
      jsonb_set(queue.metadata, '{triage,assignment,state}', '"ready"'::jsonb),
      '{triage,verification,notes}', to_jsonb('<reproducible finding and expected behavior>'::text)
    )
  from reviewed
  where queue.id = reviewed.id
  returning queue.*, reviewed.audit_user_id, reviewed.conversation_org_id
), message as (
  insert into communication.dm_messages (
    conversation_id, sender_id, content, message_type, status,
    client_message_id, organization_id, created_by, metadata
  )
  select
    updated.conversation_id,
    updated.audit_user_id,
    '<reproducible finding and expected behavior>',
    'system',
    'sent',
    'agent-review:' || updated.id || ':changes-requested:' || gen_random_uuid(),
    updated.conversation_org_id,
    updated.audit_user_id,
    jsonb_build_object(
      'actor_kind', 'agent',
      'actor_label', '<stable agent/task label>',
      'review_event', 'agent_changes_requested',
      'review_queue_id', updated.id
    )
  from updated
)
select id, title, status, feedback from updated;
```

For an in-scope repair, retain ownership and set assignment state to `fixing` before work.
Read the repo rules, implement, test, commit, and push; use a bounded specialist when needed.
Record the repair in the conversation and dispatch the independent live verifier in this run,
using the conditional ownership handoff above. Follow failures back through repair and recheck.
Release to `agent_changes_requested` / `ready` only when no active repair/verifier owns the work
and the execution completion gate establishes a necessary unfinished exit; document the
fresh human-only gate or forced interruption, exact remaining steps, and continuation owner. The verifier must differ from the implementer for every promotion. Agents
repair and verify; Arman alone approves or requests the human round.
