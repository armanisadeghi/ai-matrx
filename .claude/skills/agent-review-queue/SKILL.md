---
name: agent-review-queue
timestamp: 2026-09-09T00:00:00Z
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

## Purpose and completion

**Find bugs and fix them.** A review finding is the start of repair, not the deliverable.
Own the selected item's repair through implementation, proportionate checks, commit/push,
and independent live verification. Delegate a bounded repair when another agent is better
placed, then follow its result; a status change or a message alone is not a fix. Never invent
a defect just to report activity when the selected item passes.

Every run also checks whether access recovery, tooling, instructions, or queue routing wasted
time. Fix the demonstrated cause and improve this canonical skill or the owning tool in the
same run; sync and validate instruction changes. Make no cosmetic edits merely to show activity.
Record the concrete improvement and remaining evidence gaps in the run outcome. Routine login,
missing dependencies, localhost failures, deployment lag, and unfamiliar code are repair work.
Escalate only an exhausted recovery path requiring human input or a consequential decision.

## Human instructions and live evidence

Keep the row's human-facing `instructions` about the interaction and expected outcome, without
PR handling or release chores. Automatic integration is not evidence that a particular repair
is deployed. Keep commit provenance, deployment checks, repair progress, and any unverified
behavior in metadata and the durable conversation; never hide an open gap or promote from a
local pass. An independent reviewer must exercise the actual live behavior before promotion.

## 🚨 THE THREE RULES THAT GET YOUR WORK SEEN (2026-09-07)

**Arman, 2026-09-07:**

> "I'm trying to find what you need me to review in agent-review but I can't seem to find it
> — it's one of the biggest weaknesses of the system."

Measured the same day: **573 rows at `submitted`, 74 at `ready_for_human`**, oldest submission
2026-07-24. Only `ready_for_human` reaches him, so nearly everything agents had built was
invisible to him — filed, and therefore assumed delivered. **Filing a row is not delivery.**

### 1. THE DIRECT-LINK RULE

Whenever any agent asks Arman to look at, test, or approve something, the message **carries the
row's own URL**:

```
https://manage.aimatrx.com/administration/users/agent-review/<id>
```

"It's in the agent review queue", "find it under Ready for you", a title alone, or a route to
the reviewed page without the row — all **banned**. He has one inbox and hundreds of rows; a
link is the difference between two seconds and a search that fails. This is
[`policies/human-steps-are-guided-sessions.md`](/policies/human-steps-are-guided-sessions.md)
("ONE link") applied to this queue, and it binds agent-to-agent messages too.

### 2. THE OWNED-REVIEW RULE

**The session that files a row is responsible for that row REACHING `ready_for_human`.**

- Immediately after inserting, dispatch an **INDEPENDENT reviewer agent** — a subagent in the
  same session, never the builder, never yourself — to run the review pass in this skill
  against the live surface, and to promote or reject with recorded evidence.
- Only **after** promotion do you tell Arman about it, with the direct link.
- **A row left at `submitted` is unfinished work**, exactly like uncommitted code. Do not end a
  turn claiming "registered for review" as if it were done — the six laws' first law is that
  done means verified by someone who did not build it, and `submitted` is the state of having
  skipped that.
- Never promote your own row. If no independent reviewer can be dispatched, say so plainly in
  your final message and name the row's URL — do not silently leave it in the pile.

The backlog is worked with `pnpm review-queue:sweep` in `matrx-frontend` (submitted rows older
than N hours, grouped by lane and repo, each with its direct URL, plus the claim SQL). The
recurring `agent-review-first-pass` worker takes **one row per 30 minutes** and skips rows with
no triage envelope, no `browser` tool, or no conversation — it is a floor, never your excuse.

### 3. THE LANE TAG RULE

**Every row carries `metadata.origin.agent_label` = the campaign/lane slug** (e.g.
`print-package`, `outreach-system`, `review-system`), so ONE filter shows a whole lane's items.
It is a first-class, sortable, filterable column in the UI — **Filed by / lane** — and rows
without it render as *Not labeled*. Use the same slug for every row a campaign files, for its
whole life; never a per-session unique string, never a sentence.

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

### SQL access and mutation confirmation

Discover the available SQL tool first. If no SQL MCP is exposed, the existing local operator
path is `matrx-frontend/scripts/review-queue-sweep.ts`: it calls `public.execute_admin_query`
through `supabase-js`, loading `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` privately
from local env files. Verify the URL is `https://db.matrxserver.com`; use that existing RPC
contract, never a guessed endpoint or printed credential. Explicitly select schema `public`;
raw REST calls require both `Content-Profile: public` and `Accept-Profile: public`. A default
`api` profile produces `PGRST202` even when this RPC exists. This SQL path does not replace
`schedule_claim` for schedule ownership.

**Re-read every mutation.** The admin-query RPC can execute a data-modifying CTE yet return only
`{"result":{"message":"Query executed successfully"}}`. Missing returned rows is not proof
nothing changed. After claim, query the exact unique assignment owner and confirm exactly one
owned row before proceeding; never rerun the claim merely because its payload omitted rows.
After transitions, re-read the row and conversation event to verify the intended state/evidence.
Resolve an uncertain result before retrying any mutation.

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

Use the complete insert below with registry slug lookups; do not file an empty metadata envelope.

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

One row per reviewable thing. Use the available authorized SQL capability against `https://db.matrxserver.com`; never select a database by project ref. Include the versioned triage envelope so a repair coordinator can route the item later without rereading prose. `required_tools` is intentionally multi-label; do not force a database + browser repair into one false either/or bucket.

```sql
insert into agent.review_queue (title, url, instructions, source, repo_slug, domain_id, feature_id, metadata)
select
  'Short human title of the thing',
  '/demos/my-new-thing',            -- app PATH, not absolute URL (works on localhost + prod); absolute only for external targets
  'What to click, what to look for, and what feedback you need. 2-6 sentences. Be specific — he tests exactly what you say.',
  'ai-matrx',                       -- legacy source label; use origin for ownership
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
  ) returning id, conversation_id;
```

Confirm the returned row has a durable conversation before dispatching review. If absent,
inspect and repair the existing queue conversation-creation path; do not invent a conversation
schema or leave the row permanently ineligible.

Allowed values are defined and runtime-validated in `features/admin/agent-review/triage.ts`:

- Primary lane: `browser_ui | code_only | database_data | backend_api | deployment | cross_system | human_required`
- Required tools: `browser | frontend_code | backend_code | database | deployment | authenticated_session | external_service | human_input`
- Assignment state: `ready | claimed | blocked | fixing | verifying | awaiting_review`
- Priority: `critical | high | normal | low`

`metadata.origin.agent_label` is not optional — THE LANE TAG RULE. Return the inserted `id`
(`returning id`), because your final message must carry
`https://manage.aimatrx.com/administration/users/agent-review/<id>`, and because the reviewer
agent you dispatch next needs it.

Dispatch the independent reviewer, follow the result, then report the direct link and actual
status. Registration alone does not fulfill THE OWNED-REVIEW RULE.

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

**And `submitted` is where work goes to die unless YOU move it** — see THE OWNED-REVIEW RULE
above. Dispatch the independent reviewer in the same session; do not hand the row to a queue
that drains one row per half hour.

## Codex Browser isolation — mandatory for every automated review

The automated worker runs in **Codex's built-in Browser**, using its persistent signed-in
profile. It never borrows Arman's browser state.

- Load the available in-app Browser instructions and explicitly select
  `agent.browsers.get("iab")` before opening the target. If the old named
  `browser:control-in-app-browser` skill is absent, discover the callable Node REPL and
  installed browser runtime documentation; a missing skill name is not proof the Browser
  is unavailable. Use the documented runtime bootstrap, not guessed browser APIs. Never use `getForUrl`, `getDefault`,
  Chrome, the Chrome extension, Computer Use, or a tab that was already open.
  Discover `browser-client.mjs` under `~/.codex/plugins/cache/openai-bundled/browser/` with
  `rg --files`; read that bundle's `docs/bootstrap-troubleshooting.md` and
  `docs/api-use-behavior.md`. In the callable `mcp__node_repl__js`, bootstrap with
  `var { setupBrowserRuntime } = await import('<discovered absolute scripts/browser-client.mjs>');`
  then `var agent = await setupBrowserRuntime();`. Next select
  `var browser = await agent.browsers.get('iab');` and read
  `nodeRepl.write(await browser.documentation());` before operating. Use the discovered bundle
  path rather than a pinned version; browser operation follows its documentation only.
- Before claiming a queue row, open the admin list in a new built-in Browser tab and prove the
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

Preserve Browser isolation and prove the admin session before claiming a review row. While
recovering access, continue safe prerequisite repair; do not label routine authentication
failure a terminal blocker.

## Reading your own feedback (start of task)

```sql
select id, title, url, status, feedback, feedback_at, metadata from agent.review_queue
where status in ('agent_changes_requested','human_changes_requested','approved')
  and metadata->'origin'->>'agent_label' = '<your stable campaign/lane label>'
order by feedback_at desc;
```

- `agent_changes_requested` / `human_changes_requested` → claim before work, repair and check it, then dispatch an independent live reviewer. Only that reviewer sets `ready_for_human` / `awaiting_review` after recording evidence. Update human instructions to the interaction to re-check and retain repair details in the conversation.
- `approved` → finish any follow-through (wire it in, remove the demo, etc.), then `set status='archived'`.
- **The queue must never rot.** Handling a row's feedback ends with YOU updating that row — re-request review or archive. Never leave a handled item sitting in `*_changes_requested`/`approved`. If a demo is superseded or deleted, archive its row.
- Arman may also paste a row at you via "Copy for AI" (`kind: agent-review-item`) — treat the embedded `feedback` as the instruction, then update the row per the rules above.

## Initial review and repair worker — one item per run

Use the original agent when `metadata.origin.thread_id` or another stable identity exists and
the repair is context-heavy. Use a coordinator with specialists when origin identity is absent,
the backlog is large, or the row requires distinct tool access. **`repo_slug` is the repository**
(registry-backed); `source` is free text and identifies neither a repo nor an agent.

The recurring worker follows this exact order:

1. Discover `schedule_claim` on the AI Dream MCP. If absent or unauthorized, inspect
   `codex mcp list`, refresh with `codex mcp login aidream`, and retry the actual operation.
   Inspect installed connector configuration and documented runtime access before declaring
   it unavailable. Do not guess a remote route or bypass the claim with direct SQL or the
   general schedule registry's non-atomic Markdown fallback.
2. Compute the current America/Los_Angeles half-hour boundary (`YYYY-MM-DDTHH:00` or
   `YYYY-MM-DDTHH:30`) once. Claim `task_key="agent-review-first-pass"` with that exact
   `window_key`, an identifiable account/task label, and machine. `claimed=false` means stop
   this duplicate run without completing someone else's claim. Retain the window for cleanup.
3. Prove the in-app Browser admin session, then atomically claim one eligible item, prioritizing
   human-requested repairs, agent-requested repairs, then submissions.
4. Read the entire durable conversation and target repo's `CLAUDE.md`. Execute the real test
   instructions on the live target, including declared browser/data/API checks.
5. On a pass, independently record evidence and promote. On failure, retain ownership while
   fixing or coordinating a named repair worker; record the reproducible defect and repair
   evidence. Commit/push, resolve delivery failures, and dispatch an independent live reviewer.
   If live evidence is still pending, return the row to `agent_changes_requested` / `ready`
   with the exact repair and remaining verification recorded; never imply completion.
6. Fix observed process weaknesses, then close owned Browser/preview resources on every exit.
   Complete only the claimed window with `schedule_claim(action="complete",
   task_key="agent-review-first-pass", window_key="<same boundary>", status="completed",
   result_note="<item, fix, verification, process improvement, remaining work>")`.
   Legal terminal statuses are `completed`, `failed`, and `abandoned`; `skipped` is not one.
   Use `failed` for an unresolved execution failure. A legitimate no-work outcome uses
   `completed` with the explicit reason; it never implies an unverified row passed.

One queue item is the run's review scope; its prerequisites, repairs, independent verification,
and demonstrated process improvements are part of that work. This limit is not a reason to
stop at diagnosis or defer a feasible repair. Rows marked `human_required` or without a browser
requirement belong to their appropriate lane; do not misclassify them just to claim work.

Missing triage/conversations and stranded claims require reconciliation, not endless skips.
Inspect the sweep and existing queue service to repair one malformed candidate from actual
registry/row evidence before claiming it. For a claimed row, check its durable owner, current
task activity, and conversation, and contact an active owner. A coordinator may deliberately
reassign only after establishing release or abandonment, using a conditional update against
the observed owner/state and appending the reason. Age alone is not abandonment; there is no
TTL/reaper guaranteed by this SQL. Do not steal a live claim. If no candidate can safely proceed,
repair the demonstrated routing/tooling defect and record the remaining exact constraint.

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
Read the repo rules, implement, test, commit, and push; use a bounded specialist when needed. Then record the repair in the conversation,
set `status='agent_changes_requested'`, and return assignment state to `ready` so a later run can
prove the deployed behavior independently. The verifier must be different from the implementer for every promotion. Agents repair and verify; Arman alone approves or requests the human round.

## Rules

- **This queue, not prose.** A "please test /demos/foo" buried in a chat message is the anti-pattern — register it. And a registered row you never mention with its link is the *other* anti-pattern — THE DIRECT-LINK RULE.
- **Find a row the way Arman does.** The list at `/administration/users/agent-review` searches title, instructions, target page, repository, domain/feature names, lane, and notes — and a search WIDENS to every non-archived step, saying how many matches sit outside the step you were browsing. Filter by **Filed by / lane** to see one campaign's whole backlog.
- Keep human instructions focused on the interaction; keep truthful deployment and verification evidence in metadata and the conversation.
- Before inserting, find an existing row for the same reviewable thing and target. Coordinate any active owner before updating it; preserve conversation/metadata and reset repaired work to the independent review pool. A matching URL alone does not authorize overwriting another item's claim.
- Never infer ownership or repository from `source`; use `metadata.origin` and registry-backed `repo_slug`.
- 🚨 **`url` is the DESTINATION — write the real deep route** the reviewer should
  open, never a bare `/`, never a placeholder, never the repo root. It is no
  longer the classifier (`domain_id`/`feature_id` are, and the url-guessing
  `deriveReviewArea` was deleted 2026-08-20), but a row he cannot open is still
  a row he cannot review.
- Filter your own backlog the way Arman does: `where domain_id = (select id from platform.taxonomy_node where slug='<domain>' and level='domain')`.
- UI lives at `matrx-frontend` `features/admin/agent-review/` (see its `FEATURE.md`). The table is deliberately minimal — do NOT add columns, RPCs, or satellite tables to it. Extend the versioned `metadata.triage` contract.
