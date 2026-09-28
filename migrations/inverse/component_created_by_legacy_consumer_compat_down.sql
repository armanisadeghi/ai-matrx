-- chair-step: inverse of component_created_by_legacy_consumer_compat. It removes only temporary
-- legacy conflict arbors and reasserts recipient_id NOT NULL after refusing any legacy-created
-- alert that has not been reconciled by the corrected writer.
-- component_created_by_legacy_consumer_compat_down
set local lock_timeout = '2s';

do $inverse$
begin
  if exists (select 1 from agent.drift_alert where recipient_id is null) then
    raise exception 'compatibility inverse refused: legacy drift alerts with NULL recipient_id require explicit recipient reconciliation';
  end if;
end
$inverse$;

alter table canvas.canvas_item_state
  drop constraint if exists canvas_item_state_canvas_created_by_key;
drop index if exists agent.agx_drift_alert_open_unique;
alter table agent.drift_alert alter column recipient_id set not null;
