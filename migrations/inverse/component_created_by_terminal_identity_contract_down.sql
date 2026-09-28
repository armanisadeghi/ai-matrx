-- chair-step: safe inverse of the terminal identity contract. It refuses legacy-key collisions
-- before restoring the temporary compatibility arbors; it deliberately retains deleted-alert
-- filtering in agx_usage_report because an inverse must not make removed rows visible.
-- component_created_by_terminal_identity_contract_down
set local lock_timeout = '2s';

do $inverse$
begin
  if exists (select 1 from canvas.canvas_item_state group by canvas_id, created_by having count(*) > 1) then
    raise exception 'terminal inverse refused: canvas rows collide on legacy identity';
  end if;
  if exists (select 1 from agent.drift_alert where status in ('pending','acknowledged') group by created_by, agent_id having count(*) > 1) then
    raise exception 'terminal inverse refused: open alerts collide on legacy identity';
  end if;
end
$inverse$;

alter table canvas.canvas_item_state add constraint canvas_item_state_canvas_created_by_key unique (canvas_id, created_by);
create unique index agx_drift_alert_open_unique on agent.drift_alert (created_by, agent_id)
  where status in ('pending', 'acknowledged');
drop index if exists agent.agx_drift_alert_open_recipient_unique;
create unique index agx_drift_alert_open_recipient_unique on agent.drift_alert (recipient_id, agent_id)
  where status in ('pending', 'acknowledged');
alter table agent.drift_alert alter column recipient_id drop not null;
