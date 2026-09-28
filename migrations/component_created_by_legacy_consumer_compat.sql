-- chair-step: temporary compatibility bridge for already-live component identity columns. Legacy
-- frontend consumers still use the former conflict keys and the now-corrected server writer may
-- need to create an alert before every deployed caller has recipient_id. This bridge retains
-- viewer_id/recipient_id and their new indexes, adds only the former arbiters after proving they
-- do not collide, and relaxes recipient_id until the coordinated final contract migration. It
-- never deletes, repoints, reopens, or sends an alert.
-- component_created_by_legacy_consumer_compat — temporary expand/consumer/contract bridge
set local lock_timeout = '2s';

-- Refuse rather than discard anyone's per-viewer state or open alert. These are the exact legacy
-- identities we reintroduce below; a concurrent writer that made either duplicate means a senior
-- must inspect it before compatibility is restored.
do $compat$
begin
  if exists (
    select 1
    from canvas.canvas_item_state
    group by canvas_id, created_by
    having count(*) > 1
  ) then
    raise exception 'compatibility bridge refused: canvas rows now collide on former (canvas_id, created_by) identity';
  end if;
  if exists (
    select 1
    from agent.drift_alert
    where status in ('pending', 'acknowledged')
    group by created_by, agent_id
    having count(*) > 1
  ) then
    raise exception 'compatibility bridge refused: open drift alerts now collide on former (created_by, agent_id) identity';
  end if;
end
$compat$;

-- Both legacy arbors coexist with the corrected recipient/viewer arbors. The old client can again
-- infer its conflict target; the corrected client continues to use the named columns.
alter table canvas.canvas_item_state
  add constraint canvas_item_state_canvas_created_by_key unique (canvas_id, created_by);

create unique index agx_drift_alert_open_unique
  on agent.drift_alert (created_by, agent_id)
  where status in ('pending', 'acknowledged');

-- Do not invent a recipient for legacy creates. The server writer supplies recipient_id after its
-- coordinated rollout; final contract reasserts NOT NULL only after that writer is universal.
alter table agent.drift_alert alter column recipient_id drop not null;
