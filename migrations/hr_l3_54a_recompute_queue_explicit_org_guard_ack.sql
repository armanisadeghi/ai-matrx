-- HR domain L3 — acknowledge the deliberate explicit-org shape of hr._recompute_queue.
--
-- The queue was created with organization_id NOT NULL and no assignment trigger. That is the
-- required shape under the no-implicit-organization ruling: hr._recompute_enqueue requires
-- p_organization_id and writes that exact value into both the durable queue unit and its scheduler
-- doorbell. A database backstop would weaken that contract by making an incomplete writer appear
-- valid. The DDL sentinel still describes the retired backstop doctrine, so record the reviewed
-- exception against this one object and rule instead of changing the table.

do $mig$
begin
  perform platform.ddl_guard_ack(
    p_reason => 'hr._recompute_queue is deliberately org-explicit: hr._recompute_enqueue requires p_organization_id and inserts that exact value into the queue unit and scheduler doorbell. The no-implicit-organization ruling forbids an assignment default or trigger, so this NOT NULL table must have no backstop.',
    p_by => 'hr-migration hr_l3_54a_recompute_queue_explicit_org_guard_ack',
    p_rule => 'org_not_null_no_backstop',
    p_object_ref => 'hr._recompute_queue');

  if exists (
    select 1
      from platform.ddl_guard_log
     where acknowledged_at is null
       and rule = 'org_not_null_no_backstop'
       and object_ref = 'hr._recompute_queue'
  ) then
    raise exception 'hr_l3_54a: hr._recompute_queue guard firing remains unacknowledged';
  end if;
end
$mig$;
