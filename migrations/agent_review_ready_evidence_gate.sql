-- Future transitions into Arman's inbox require concrete agent-verification
-- evidence. NOT VALID preserves the existing backlog while enforcing this
-- contract for every new insert or update; validate only after legacy
-- ready_for_human rows have been repaired in place.

alter table agent.review_queue
  drop constraint if exists review_queue_ready_evidence_check;

alter table agent.review_queue
  add constraint review_queue_ready_evidence_check check (
    status <> 'ready_for_human'
    or (
      nullif(btrim(metadata #>> '{triage,verification,verified_by}'), '') is not null
      and nullif(btrim(metadata #>> '{triage,verification,verified_at}'), '') is not null
      and metadata #>> '{triage,assignment,state}' = 'awaiting_review'
    )
  ) not valid;

insert into scheduler.agent_schedule (
  task_key,
  cadence,
  timezone,
  provider,
  instructions_path,
  approved_by,
  approved_on,
  enabled,
  notes
) values (
  'agent-review-first-pass',
  'every 30 minutes; exactly one item per run',
  'America/Los_Angeles',
  'codex',
  '/skills/agent-review-queue/SKILL.md',
  'Arman',
  date '2026-08-24',
  true,
  'Codex built-in Browser only. Claim an explicit America/Los_Angeles half-hour window before work; never use Chrome, Computer Use, or a pre-existing user tab.'
)
on conflict (task_key) do update set
  cadence = excluded.cadence,
  timezone = excluded.timezone,
  provider = excluded.provider,
  instructions_path = excluded.instructions_path,
  approved_by = excluded.approved_by,
  approved_on = excluded.approved_on,
  enabled = excluded.enabled,
  notes = excluded.notes,
  updated_at = now();
