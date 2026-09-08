-- A retained call outlives its expiring recording media. Governed deletion of
-- files.files must therefore clear only crm.interaction.recording_file_id;
-- provider lifecycle, consent, custody time, and audit receipts remain durable.

alter table crm.interaction
  drop constraint if exists interaction_recording_file_id_fkey;

alter table crm.interaction
  add constraint interaction_recording_file_id_fkey
  foreign key (recording_file_id)
  references files.files(id)
  on delete set null;

do $$
declare
  v_delete_action "char";
begin
  select c.confdeltype
  into strict v_delete_action
  from pg_catalog.pg_constraint c
  where c.conrelid = 'crm.interaction'::regclass
    and c.conname = 'interaction_recording_file_id_fkey';

  if v_delete_action <> 'n' then
    raise exception 'recording file retention FK must use ON DELETE SET NULL';
  end if;
end
$$;
