-- lock: custom,platform
-- lane: VIEW-KEYS-SHEET
-- chair-step: the inverse of viewkeyssheet_every_view_bar_view_moves_in_and_one_default_stands.sql
--   (S0's inverse, byte for byte, plus step 0). Step 0 gives every copy that move made not default
--   back the default it claimed (`moved_from.was_default`), and takes the marks off, so the copies
--   are exactly S0's again. Then it brings every `records_ui_view` Table back — the Table, its
--   Fields and the view records the move archived, found by the instant the move wrote
--   (`moved_from.archived_at`) — and WITHDRAWS the copies in `platform.saved_view` (soft:
--   `deleted_at` set and `moved_from.withdrawn` true; nothing is deleted; re-applying the move
--   brings each copy back and judges its default again). A mover view's hidden columns go back
--   to `definition.hidden_fields` by Field id.
--   WHAT THAT MEANS: the view bar reads `custom.views`, so with the copies withdrawn it shows only
--   views saved after this inverse. Run it only together with the records-ui release before S0,
--   which read views out of the `records_ui_view` Table.

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local app.actor_system = 'migration:viewkeyssheet_every_view_bar_view_moves_in_and_one_default_stands_down';

do $back$
declare
  v_restored  integer := 0;
  v_withdrawn integer := 0;
  v_hidden    integer := 0;
  v_redefault integer := 0;
  r           record;
begin
  -- 0. THE ONE-DEFAULT RULE, UNDONE: each copy the move made not default claims it again.
  update platform.saved_view sv
     set definition = jsonb_set(sv.definition, '{is_default}', 'true'::jsonb)
                      #- '{moved_from,was_default}' #- '{moved_from,demoted_by}'
   where sv.surface_key = 'custom/records'
     and sv.definition -> 'moved_from' ->> 'demoted_by' = 'viewkeyssheet_every_view_bar_view_moves_in_and_one_default_stands';
  get diagnostics v_redefault = row_count;

  -- 1. THE ARCHIVE, UNDONE: every Table, Field and view record the move soft-deleted, and nothing
  --    else. The instants are the ones the move's copies carry (one per time it ran).
  for r in
    with instants as (
      select distinct (sv.definition -> 'moved_from' ->> 'archived_at')::timestamptz as at
        from platform.saved_view sv
       where sv.surface_key = 'custom/records'
         and sv.definition -> 'moved_from' ->> 'store' = 'records_ui_view'
    ),
    vt as (
      select t.organization_id, t.id
        from custom.record t
       where t.table_id = custom.table_kernel_id()
         and t.data_class = 'table'
         and t.data ->> 'slug' = 'records_ui_view'
         and t.deleted_at in (select at from instants)
    )
    select x.organization_id, x.id, x.data_class
      from custom.record x
      join vt on vt.organization_id = x.organization_id
     where x.deleted_at in (select at from instants)
       and (x.id = vt.id
            or x.table_id = vt.id
            or (x.data_class = 'field' and x.data ->> 'entity_definition_id' = vt.id::text))
     -- The Table first, then its Fields, then its records: a record comes back into a live Table.
     order by case x.data_class when 'table' then 0 when 'field' then 1 else 2 end, x.id
  loop
    perform custom.record_restore(r.organization_id, r.id);
    v_restored := v_restored + 1;
  end loop;

  -- 2. THE COPIES, WITHDRAWN (soft). Only the live ones: a copy that was archived already keeps
  --    its own archive and carries no mark.
  with w as (
    update platform.saved_view sv
       set deleted_at = now(),
           definition = jsonb_set(sv.definition, '{moved_from,withdrawn}', 'true'::jsonb, true)
     where sv.surface_key = 'custom/records'
       and sv.definition -> 'moved_from' ->> 'store' = 'records_ui_view'
       and sv.deleted_at is null
    returning 1
  )
  select count(*) into v_withdrawn from w;

  -- 3. A mover view's hidden columns back where the mover put them.
  with h as (
    update platform.saved_view sv
       set definition = jsonb_set(
                          jsonb_set(sv.definition, '{moved_from}',
                                    (sv.definition -> 'moved_from') - 'hidden_fields'::text),
                          '{hidden_fields}', sv.definition -> 'moved_from' -> 'hidden_fields')
                        #- '{presentation,hiddenFields}',
           updated_at = now()
     where sv.surface_key = 'custom/records'
       and jsonb_typeof(sv.definition -> 'moved_from' -> 'hidden_fields') = 'array'
    returning 1
  )
  select count(*) into v_hidden from h;

  raise notice 'VIEW-KEYS-SHEET move inverse: % copy default(s) given back; % record(s) of records_ui_view tables brought back; % copied view(s) withdrawn; % hidden-column list(s) put back by id.',
    v_redefault, v_restored, v_withdrawn, v_hidden;
end
$back$;
