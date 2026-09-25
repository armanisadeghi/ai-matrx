-- Withdraw the 44 builtin copies an unscoped run of aidream's
-- scripts/repair_system_mandate_defaults.py made on 2026-09-25 13:18-13:23 PT.
--
-- The run duplicated 44 org-internal agents belonging to four people into the
-- Matrx System org as builtins. The revert rebound every mandate to its source
-- and archived the copies, but archiving does not remove read access: the
-- system org is global_readable and agent.definition's std_select arm does not
-- filter is_archived/deleted_at, so every authenticated user could still read
-- all 44 prompts (and their 88 version rows) although the sources are visible
-- only inside their own orgs. Verified before this file: a non-member identity
-- saw 44/44 copies and 88/88 versions; with this change applied in a rolled-back
-- transaction it saw 0 and 0.
--
-- Soft delete + personal visibility (never a hard delete). Nothing references
-- these copies: no live mandate default, binding, treatment, shortcut, chat,
-- app, exemplar, permission or association row (checked 2026-09-25).
-- The two live builtin copies from the same minutes (111e0687, b8af1a3d) are the
-- intended cms.* defaults and are NOT in this list.

select set_config('app.actor_system', 'mandate_sweep_incident_2026_09_25', true);

do $$
declare
  v_ids uuid[] := array[
  'f2c4650f-c148-4e14-83b0-2507a9cabbf8',
  '1ef5c1dd-c1de-4dd5-82a3-eada14f2c4fe',
  'f77c57a7-f6b5-4b0a-b33e-8c78de1282fe',
  '6a26e5cf-3730-4961-a56c-010b49de4ab0',
  '548abd16-af11-4616-88f8-6f8277a668cf',
  'b10e1d7b-2e0d-4552-abeb-37aa9ece5881',
  '90928e8c-ed76-4af8-b4a9-cf077ea7c549',
  '9e653e53-357c-4889-b73e-2cbee20a96db',
  '985ccf5b-bff6-4730-8346-3485d902b320',
  'c37a5f68-402f-41d5-94b0-6698c5a7cf5d',
  '55f43480-de09-4790-86d6-b37a65fb17cd',
  '2c2cc219-38af-42dd-b25c-6b2e5209e998',
  'd135be88-766b-4ecb-b3ed-64e9889f7a5a',
  '109a0c03-de6e-42a1-9756-4f7098fc7320',
  '15826b9e-15c1-4c32-bae5-614baa006880',
  'f7937e37-084f-4602-8bc4-5542328b01c5',
  'b6ac3b0e-1f7e-4e22-a475-68c9596637be',
  'c84befe0-33cb-49aa-a164-983d73bdbde9',
  '8d4b36ce-56f8-41b2-b40f-24770a01d93f',
  '6affd396-f4af-4a9a-9f05-30f30c5fdda1',
  '65cca647-bca6-4d89-8493-edab1e7fc564',
  'e80f4e30-5f8e-4bbb-976b-085e31720474',
  'f4d5d5f1-8031-4f53-a440-ebabd7215a74',
  '368ec878-3a9a-4aaf-b50f-088fd97bcccb',
  '100fcf84-874b-49f4-9e6b-64d355a0274e',
  '1b5deb7c-aa73-4536-99f9-800693dd9152',
  '86248429-4f16-4c06-bb0f-785325fc9d79',
  '218d8504-41e6-49a9-899b-61054ba11148',
  'c5ca95d5-e254-4b01-a665-b629d5be59ae',
  '502881f3-71bf-434b-b6ea-dd6b71602931',
  '642d2d31-c61d-49a6-ad63-399b3f944367',
  'e993e4a4-d509-4cda-9142-1544f44db994',
  '8d1aa9f6-fd79-4e07-913e-f0ec563a6144',
  'fd47ec06-50b2-458a-a514-971b8342cca0',
  'e2a7fb1e-c535-4b7e-ae7e-168dbb94114c',
  '323be7c6-4c8a-4fb2-90aa-ac4b784aac9f',
  '21048362-5cd7-4635-9722-00cc94b37569',
  '8293e719-7c63-4a82-89b5-558c92754286',
  'ca2a91d4-104f-4403-ac81-36fb66dcb0bd',
  '7f7e7e02-4125-4ed1-82b7-b3d5526230dc',
  '071646e1-1a84-4036-968e-bf428fb2d24d',
  '0ab192cd-1549-4d82-9059-2dfe6b902eb5',
  '4cb7543e-3739-4d26-8c43-a3e568114c42',
  'b829ebd4-cbc9-471c-b678-8b53281729d9'
  ]::uuid[];
  v_refs int;
  v_n int;
begin
  -- Refuse if any copy has become live or referenced since the check.
  select count(*) into v_refs from mandate.definition
   where deleted_at is null and default_holder_id = any(v_ids);
  if v_refs > 0 then
    raise exception 'agent_sweep_copies_withdrawn: % live mandate default(s) now hold a sweep copy; re-verify before withdrawing', v_refs;
  end if;
  select count(*) into v_refs from mandate.binding
   where deleted_at is null and holder_id = any(v_ids);
  if v_refs > 0 then
    raise exception 'agent_sweep_copies_withdrawn: % live binding(s) now hold a sweep copy; re-verify before withdrawing', v_refs;
  end if;
  select count(*) into v_n from agent.definition
   where id = any(v_ids) and agent_type = 'builtin' and is_archived;
  if v_n <> 44 then
    raise exception 'agent_sweep_copies_withdrawn: expected 44 archived builtin copies, found %', v_n;
  end if;

  update agent.definition
     set visibility = 'personal',
         deleted_at = coalesce(deleted_at, now())
   where id = any(v_ids)
     and (visibility <> 'personal' or deleted_at is null);
  get diagnostics v_n = row_count;
  raise notice 'agent_sweep_copies_withdrawn: % copies withdrawn', v_n;
end
$$;
