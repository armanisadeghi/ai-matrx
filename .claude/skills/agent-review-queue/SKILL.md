---
name: agent-review-queue
type: Skill
title: agent-review-queue — get your work seen, get feedback back
description: Register anything you built that Arman must go see/test in the UI, read feedback, and route repair work by primary lane, required tools, ownership, and verification state. Use at the END of any task that produced something reviewable, at the START of a task to check prior feedback, and when coordinating or claiming review repairs. Every row is classified from the registry tables (platform.taxonomy_node + platform.repo) — domain_id and repo_slug are REQUIRED and free-text classification is banned. One table (agent.review_queue), written via the Supabase MCP; the human side is /administration/users/agent-review. Cross-repo — aidream/matrx-extend agents use the same table with their own source value.
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/agent-review-queue/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# Agent Review Queue — get your work seen, get feedback back

**The failure this kills:** agents build things, mention them mid-message, Arman misses it, and finished features rot undiscovered for weeks. The queue at `/administration/users/agent-review` is the ONE place he checks. If you built something he must look at and you didn't register it, assume it will never be seen.

## Everything is LIVE — never write deployment status into a row

**All agent code auto-merges to `main` and deploys within ~30 minutes; branches are then deleted. There is no such thing as not-yet-live code.** Arman only ever reviews the live app — by the time he opens a row, your work IS deployed, so any "not deployed yet" claim is false the moment he reads it.

- **Instructions describe the live app, period.** Never mention PR numbers, branches, "merge first", "pending release", "review after deploy", "RETEST AFTER DEPLOY", or any deploy caveat. Don't claim "deployed"/"verified live" either — deployment status simply does not appear.
- **Don't spend instructions on PR handling.** Nobody reviews PRs; they auto-approve and merge. Wondering what to do with your PR is wasted work.
- A row that leads with deploy caveats is a defect — it burns his review on a false premise.
- `metadata.origin.branch`/`commit` stay — that's provenance, not a status claim.

## 🚨 EVERY ROW IS CLASSIFIED FROM THE REGISTRY — this is the whole point

**Arman, 2026-08-20, on the 392-row backlog he could not filter:**

> "I have no way of filtering this for anything… whoever built this used weird
> terminology where they used repositories, lanes and tools. But guess what? For
> repositories, it's basically a text field where the agent can enter whatever name
> they want… repo names are gonna need to come directly from my GitHub so that they
> can't invent stuff."

Agents free-texted classification into `metadata` under 15+ invented keys (`triage`,
`origin`, `feature`, `repos`, `wave`, `area`, `program`, …). Nothing could be filtered,
because no two agents used the same word. **That is over.** Classification is now three
real columns with foreign keys:

| Column | Source of truth | Required |
|---|---|---|
| `repo_slug` | `platform.repo.slug` — synced from Arman's GitHub, never typed | **YES** |
| `domain_id` | `platform.taxonomy_node` where `level='domain'` | **YES** |
| `feature_id` | `platform.taxonomy_node` where `level='feature'` | when you honestly know it |

`domain_id` and `repo_slug` are **NOT NULL in the database**. An insert missing either
one FAILS — deliberately, because a skill instruction alone is exactly the loose thing
agents route around. `feature_id` is nullable on purpose: **domain-only is an honest
answer**, and it beats a wrong guess.

### Look them up first — one query, do not guess a slug

```sql
-- domains and their features (globally unique slugs)
select d.slug as domain, d.id as domain_id, f.slug as feature, f.id as feature_id
from platform.taxonomy_node d
left join platform.taxonomy_node f on f.parent_id = d.id and f.level = 'feature'
where d.level = 'domain'
order by d.slug, f.slug;

-- the approved repo list (GitHub-verified; never invent a name)
select slug, github_full_name from platform.repo where is_active order by slug;
```

Insert by slug so a copied uuid can never go stale:

```sql
insert into agent.review_queue (title, url, instructions, source, repo_slug, domain_id, feature_id, metadata)
select
  'Short human title of the thing',
  '/marketing/content-plan',
  'What to click, what to look for, and what feedback you need.',
  'ai-matrx',
  'matrx-frontend',                                                    -- platform.repo.slug
  (select id from platform.taxonomy_node where slug = 'marketing'      and level = 'domain'),
  (select id from platform.taxonomy_node where slug = 'content-planning' and level = 'feature'),
  '{}'::jsonb;
```

### When nothing fits — the easy path, so you never improvise

Per [`policies/feature-registry.md`](/policies/feature-registry.md) § THE REGISTRY IS DATA:

- **You MAY insert a `feature` (or `subfeature`) node** with `status='proposed'` under the
  closest honest parent, then keep working with it. One insert, no ceremony:

  ```sql
  insert into platform.taxonomy_node (slug, name, level, parent_id, status, anchors)
  select 'my-thing', 'My Thing', 'feature', id, 'proposed',
         jsonb_build_object('routes', jsonb_build_array('(core)/my-thing'))
  from platform.taxonomy_node where slug = '<closest-domain>' and level = 'domain';
  ```

- **You MAY NEVER** insert, rename, or re-status a `domain`, and never flip anything to
  `canonical` — those are Arman's, batched to him by the docs-steward.
- **You MAY NEVER add a repo slug you did not verify on GitHub.** `platform.repo` is synced
  from `gh repo list` (manual/steward work — there is no scheduled sync). A repo genuinely
  missing from the table is a sync gap to report, not a row to invent.
- If not even a proposed feature fits, set the closest domain, leave `feature_id` null, and
  say why in `metadata.notes`.

**Never stuff your thing into a wrong node because proposing felt slow** — that is the
behaviour this system exists to end.

## When to add an item (end of task)

Add a row when you produced **anything reviewable in the UI that Arman didn't explicitly walk through with you live**: a demo page, a new route, a reworked surface, an admin panel, a feature needing validation/approval. Skip it only when the work has no UI surface, or Arman already reviewed it in this conversation.

One row per reviewable thing. Registering is one INSERT via the Supabase MCP (project `brsgrqvjdzwihsvnfqkf`). Include the versioned triage envelope so a repair coordinator can route the item later without rereading prose. `required_tools` is intentionally multi-label; do not force a database + browser repair into one false either/or bucket.

```sql
insert into agent.review_queue (title, url, instructions, source, repo_slug, domain_id, feature_id, metadata)
select
  'Short human title of the thing',
  '/demos/my-new-thing',            -- app PATH, not absolute URL (works on localhost + prod); absolute only for external targets
  'What to click, what to look for, and what feedback you need. 2-6 sentences. Be specific — he tests exactly what you say.',
  'ai-matrx',                       -- your agent/session label; classification lives in the columns below
  'matrx-frontend',                 -- REQUIRED — platform.repo.slug, GitHub-verified
  (select id from platform.taxonomy_node where slug = '<domain-slug>' and level = 'domain'),   -- REQUIRED
  (select id from platform.taxonomy_node where slug = '<feature-slug>' and level = 'feature'), -- null is allowed
  jsonb_build_object(
    'origin', jsonb_build_object(
      'agent_label', '<your stable agent/task label>',
      'thread_id', '<thread id when available>',
      'branch', '<branch when applicable>',
      'commit', '<deployed commit when applicable>'
    ),
    'triage', jsonb_build_object(
      'version', 1,
      'lane', 'browser_ui',
      'required_tools', jsonb_build_array('browser', 'frontend_code', 'authenticated_session'),
      'workstreams', jsonb_build_array('responsive_ui', 'accessibility', 'verification'),
      'priority', 'normal',
      'assignment', jsonb_build_object('mode', 'origin_agent', 'state', 'ready'),
      'verification', jsonb_build_object(
        'browser_breakpoints', jsonb_build_array('desktop', 'tablet', 'mobile'),
        'notes', 'Re-run the instructions against the deployed target.'
      )
    )
  );
```

Allowed values are defined and runtime-validated in `features/admin/agent-review/triage.ts`:

- Primary lane: `browser_ui | code_only | database_data | backend_api | deployment | cross_system | human_required`
- Required tools: `browser | frontend_code | backend_code | database | deployment | authenticated_session | external_service | human_input`
- Assignment state: `ready | claimed | blocked | fixing | verifying | awaiting_review`
- Priority: `critical | high | normal | low`

Then say in your final message that you registered it, with the title.

## Statuses — the contract

🚨 **These seven are the ONLY legal values** — `agent.review_queue_status_check` rejects anything
else, and the frontend's `REVIEW_STATUSES` (`features/admin/agent-review/types.ts`) is the same
list in the same order. This doc taught `pending` / `changes_requested` until 2026-08-22; both
were rejected by the database, so every agent that followed those words got a constraint
violation. Never invent a status; read `REVIEW_STAGE_ORDER` if you need the order.

| status                    | meaning                                                             | who moves it |
| ------------------------- | ------------------------------------------------------------------- | ------------ |
| `submitted`               | You filed it. The default on insert — agents triage from here.       | you, on insert |
| `agent_review`            | An agent is reviewing it.                                            | the reviewing agent |
| `agent_changes_requested` | An agent found problems; repair is routed/claimed through metadata.  | the reviewing agent |
| `ready_for_human`         | **The only status that reaches Arman.** Agent-reviewed, repaired, verified. | the reviewing agent |
| `human_changes_requested` | Arman's feedback is in `feedback` (the service REQUIRES feedback text with this status). | Arman |
| `approved`                | Approved; do any follow-through, then archive.                       | Arman |
| `archived`                | Done. Hidden from the queue.                                         | **you**, after handling feedback |

**Agents review first — that is the whole point.** A row you insert sits at `submitted` and must
be agent-reviewed and repaired before anything sets `ready_for_human`; only then does Arman see
it. Filing straight to `ready_for_human` puts unverified work in front of him.

## Codex Browser isolation — mandatory for every automated review

The automated worker runs in **Codex's built-in Browser**, using its persistent signed-in
profile. It never borrows Arman's browser state.

- Invoke the `browser:control-in-app-browser` skill and explicitly select
  `agent.browsers.get("iab")` before opening the target. Never use `getForUrl`, `getDefault`,
  Chrome, the Chrome extension, Computer Use, or a tab that was already open.
- Before claiming a queue row, open the admin list in a new built-in Browser tab and prove the
  admin surface is signed in. If it lands on sign-in, **claim nothing** and report
  `Codex Browser admin session required`. A human signs in once; the persistent profile retains
  the session for later runs.
- Passwords and session tokens never appear in this skill, an automation prompt, queue metadata,
  messages, screenshots, logs, or chat. Never automate credential entry.
- Name the Browser session for the review worker and close every tab or tab group the run creates,
  on success, failure, or blockage. Never close a tab that predates the run.

This is a hard isolation boundary, not a preference. A run without a proven built-in Browser
admin session is blocked before ownership of any review item changes.

## Reading your own feedback (start of task)

```sql
select id, title, url, status, feedback, feedback_at, metadata from agent.review_queue
where status in ('agent_changes_requested','human_changes_requested','approved') and source = 'ai-matrx'
order by feedback_at desc;
```

- `agent_changes_requested` / `human_changes_requested` → claim it before work, make the changes, verify them, then set `status='ready_for_human'`, `assignment.state='awaiting_review'`, and replace `instructions` with what changed and what to re-check.
- `approved` → finish any follow-through (wire it in, remove the demo, etc.), then `set status='archived'`.
- **The queue must never rot.** Handling a row's feedback ends with YOU updating that row — re-request review or archive. Never leave a handled item sitting in `*_changes_requested`/`approved`. If a demo is superseded or deleted, archive its row.
- Arman may also paste a row at you via "Copy for AI" (`kind: agent-review-item`) — treat the embedded `feedback` as the instruction, then update the row per the rules above.

## Initial review and repair worker — one item per run

Use the original agent when `metadata.origin.thread_id` or another stable identity exists and
the repair is context-heavy. Use a coordinator with specialists when origin identity is absent,
the backlog is large, or the row requires distinct tool access. **`repo_slug` is the repository**
(registry-backed); `source` is free text and identifies neither a repo nor an agent.

The recurring worker follows this exact order:

1. Claim the schedule's current half-hour window through `schedule_claim`.
2. Prove the Codex built-in Browser admin session, without claiming queue work yet.
3. Claim exactly one eligible item, prioritizing human-requested repairs, then agent-requested
   repairs, then new submissions.
4. Read the entire conversation and target repository's `CLAUDE.md`; execute the row's actual
   test instructions on the live target.
5. If it passes, record evidence and move it to `ready_for_human`. If it fails, record precise
   findings and move it to `agent_changes_requested` for repair. If the worker repairs code,
   commit and push it, then leave the row ready for a later live-verification run; a local pass
   alone never promotes it.
6. Complete the schedule claim and close all created Browser tabs.

Rows with `lane='human_required'`, missing triage, missing a conversation, or no browser tool are
not eligible for this worker. A run processes **one item only**, even when it finishes quickly.

Claim one row atomically and append the claim event to its existing conversation. Replace the
placeholder with a stable label such as `agent-review-first-pass:<Codex task id>`:

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
breakpoints or data/API checks:

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
    status = 'ready_for_human',
    metadata = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(queue.metadata, '{triage,assignment,state}', '"awaiting_review"'::jsonb),
          '{triage,verification,verified_by}', to_jsonb('<stable agent/task label>'::text)
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
      'actor_label', '<stable agent/task label>',
      'review_event', 'ready_for_human',
      'review_queue_id', updated.id
    )
  from updated
)
select id, title, status, metadata->'triage' as triage from updated;
```

On **FAIL**, append the reproducible finding and return the row to the repair pool:

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

If repair is small and in scope, the worker owns it: set assignment state to `fixing`, read the
repo rules, implement, test locally, commit, and push. Then record the repair in the conversation,
set `status='agent_changes_requested'`, and return assignment state to `ready` so a later run can
prove the deployed behavior independently. Prefer a verifier different from the implementer for
high/critical work. Agents repair and verify; Arman alone approves or requests the human round.

## Rules

- **This queue, not prose.** A "please test /demos/foo" buried in a chat message is the anti-pattern — register it.
- **No deployment status, ever** — see "Everything is LIVE" above.
- Don't duplicate: before inserting, check for an existing row with the same `url` — update its `instructions` and reset to `submitted` instead.
- Never infer ownership from `source`; it is only the repository identifier.
- 🚨 **`url` is the DESTINATION — write the real deep route** the reviewer should
  open, never a bare `/`, never a placeholder, never the repo root. It is no
  longer the classifier (`domain_id`/`feature_id` are, and the url-guessing
  `deriveReviewArea` was deleted 2026-08-20), but a row he cannot open is still
  a row he cannot review.
- Filter your own backlog the way Arman does: `where domain_id = (select id from platform.taxonomy_node where slug='<domain>' and level='domain')`.
- UI lives at `matrx-frontend` `features/admin/agent-review/` (see its `FEATURE.md`). The table is deliberately minimal — do NOT add columns, RPCs, or satellite tables to it. Extend the versioned `metadata.triage` contract.
