-- templates_claim_then_create.sql — applied on live 2026-10-05 (lane KITS-MERGE-2, Kits → Template merge).
--
-- THE BUG. A template install's host steps (copying agents, creating workflows) created first and
-- noted after. A page closed between the two left a copy nobody recorded: the re-open created a
-- second copy, and Remove archived only the recorded one.
--
-- THE FIX: claim-then-create. The host CLAIMS the entry (kind + title) on the install's `made`
-- BEFORE it creates anything (`custom.template_install_claim`); `template_install_note` then fills
-- that claim with the id. A re-open resumes from the claim:
--   made  — the entry already has its id: use it, create nothing.
--   held  — another tab claimed it inside the lease (knob templates.run_lease_seconds): wait.
--   claimed (stale claim taken over) — answers `orphans`: the caller's own agents (copies of the
--          same source) / workflows (same name) in this organization created since the stale
--          claim and recorded on no install. The host adopts the first and archives the rest.
-- Also moves the limits' knob feature `kits` → `templates` (the product is Template).

create or replace function custom.template_install_claim(
  p_organization_id uuid, p_install_id uuid, p_kind text, p_label text,
  p_source_id uuid default null, p_lease_seconds integer default null)
returns jsonb
language plpgsql security definer set search_path to 'pg_catalog'
as $function$
declare
  v_i custom.template_install;
  v_e jsonb;
  v_prior timestamptz;
  v_uid uuid := auth.uid();
  v_orphans jsonb := '[]'::jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.template_install_claim');
  if coalesce(p_kind, '') not in ('agent', 'workflow') then
    raise exception 'An install claims only what its host makes (an agent or a workflow), not "%".', coalesce(p_kind, '(none)') using errcode = '22023';
  end if;
  if coalesce(p_label, '') = '' then
    raise exception 'A claim needs the title of what is being made.' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 1 then
    raise exception 'A claim needs its lease in seconds (the templates.run_lease_seconds knob).' using errcode = '22023';
  end if;
  select * into v_i from custom.template_install i
   where i.id = p_install_id and i.organization_id = p_organization_id and i.state <> 'uninstalled' for update;
  if not found then
    raise exception 'There is no such install in this organization.' using errcode = 'P0002';
  end if;
  select x into v_e from jsonb_array_elements(v_i.made) x
   where x ->> 'kind' = p_kind and x ->> 'title' = p_label limit 1;

  if v_e is not null and nullif(v_e ->> 'id', '') is not null then
    return jsonb_build_object('claim', jsonb_build_object('state', 'made', 'id', v_e ->> 'id'), 'answer', custom._template_answer(v_i));
  end if;
  if v_e is not null and (v_e ->> 'claimed_at')::timestamptz > now() - make_interval(secs => p_lease_seconds) then
    return jsonb_build_object('claim', jsonb_build_object('state', 'held', 'claimed_at', v_e ->> 'claimed_at'), 'answer', custom._template_answer(v_i));
  end if;

  v_prior := (v_e ->> 'claimed_at')::timestamptz;
  if v_prior is not null then
    if p_kind = 'agent' then
      select coalesce(jsonb_agg(a.id order by a.created_at), '[]'::jsonb) into v_orphans
        from agent.definition a
       where a.organization_id = p_organization_id and a.created_by = v_uid
         and (p_source_id is null or a.source_agent_id = p_source_id)
         and a.created_at >= v_prior and a.deleted_at is null and not coalesce(a.is_archived, false)
         and not exists (select 1 from custom.template_install t, jsonb_array_elements(t.made) m
                          where t.organization_id = p_organization_id and m ->> 'id' = a.id::text);
    else
      select coalesce(jsonb_agg(w.id order by w.created_at), '[]'::jsonb) into v_orphans
        from workflow.definition w
       where w.organization_id = p_organization_id and w.created_by = v_uid and w.name = p_label
         and w.created_at >= v_prior and w.deleted_at is null and not coalesce(w.is_archived, false)
         and not exists (select 1 from custom.template_install t, jsonb_array_elements(t.made) m
                          where t.organization_id = p_organization_id and m ->> 'id' = w.id::text);
    end if;
  end if;

  update custom.template_install i
     set made = coalesce((select jsonb_agg(x order by o) from jsonb_array_elements(i.made) with ordinality as e(x, o)
                           where not (x ->> 'kind' = p_kind and x ->> 'title' = p_label)), '[]'::jsonb)
                || jsonb_build_array(jsonb_build_object('kind', p_kind, 'id', null, 'ref', p_kind, 'title', p_label,
                     'step', 'claimed', 'claimed_at', now(), 'claimed_by', v_uid)),
         updated_at = now()
   where i.id = v_i.id
  returning * into v_i;
  return jsonb_build_object('claim', jsonb_build_object('state', 'claimed', 'orphans', v_orphans), 'answer', custom._template_answer(v_i));
end;
$function$;
revoke all on function custom.template_install_claim(uuid,uuid,text,text,uuid,integer) from public, anon;
grant execute on function custom.template_install_claim(uuid,uuid,text,text,uuid,integer) to authenticated;

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'template_install_claim',
  'p_organization_id uuid, p_install_id uuid, p_kind text, p_label text, p_source_id uuid, p_lease_seconds integer',
  array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'text'::regtype, 'uuid'::regtype, 'integer'::regtype]::oid[],
  'Claims an agent or workflow a host is about to make for an install (claim-then-create), and answers the orphans a stale claim left. custom.assert_client_may_reach on the organization; the install must be of that organization; orphans are only the CALLER''s own rows in that organization.',
  'templates_claim_then_create.sql', true, false,
  jsonb_build_object('version', 1, 'declared_by', 'templates_claim_then_create.sql', 'declared_at', '2026-10-05 lane KITS-MERGE-2',
    'arguments', jsonb_build_object(
      'p_organization_id', jsonb_build_object('type','uuid','check','custom.assert_client_may_reach(arg1) before anything is read.','entity','organization','foreign',jsonb_build_object('sqlstate','42501','same_as_invented',true),'position',1,'verified','2026-10-05 lane KITS-MERGE-2 — written with this body'),
      'p_install_id', jsonb_build_object('type','uuid','check','matched only with organization_id = arg1.','entity','template_install','foreign',jsonb_build_object('sqlstate','P0002','not_a_leak',true,'same_as_invented',true),'position',2,'verified','2026-10-05 lane KITS-MERGE-2 — written with this body'),
      'p_source_id', jsonb_build_object('type','uuid','check','only narrows the orphan search, which is already limited to rows created_by auth.uid() in organization arg1.','entity','agent','foreign',jsonb_build_object('note','a foreign source id matches none of the caller''s own copies and answers no orphans.','bounded',true,'not_a_leak',true),'position',5,'verified','2026-10-05 lane KITS-MERGE-2 — written with this body'))));

-- The note fills its claim (same kind + title) instead of appending a second entry.
create or replace function custom.template_install_note(p_organization_id uuid, p_install_id uuid, p_kind text, p_id uuid, p_label text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog'
AS $function$
declare
  v_i custom.template_install;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.template_install_note');
  if coalesce(p_kind, '') not in ('agent', 'workflow') then
    raise exception 'An install records only what its host makes outside the store (an agent or a workflow); "%" is made by the install itself.', coalesce(p_kind, '(none)')
      using errcode = '22023';
  end if;
  select * into v_i from custom.template_install i
   where i.id = p_install_id and i.organization_id = p_organization_id and i.state <> 'uninstalled' for update;
  if not found then
    raise exception 'There is no such install in this organization.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_i.made) x where x ->> 'kind' = p_kind and x ->> 'id' = p_id::text) then
    if p_label is not null and exists (select 1 from jsonb_array_elements(v_i.made) x
                                        where x ->> 'kind' = p_kind and x ->> 'title' = p_label and nullif(x ->> 'id', '') is null) then
      update custom.template_install i
         set made = (select jsonb_agg(case when x ->> 'kind' = p_kind and x ->> 'title' = p_label and nullif(x ->> 'id', '') is null
                                          then jsonb_build_object('kind', p_kind, 'id', p_id, 'ref', p_kind, 'title', p_label, 'step', null)
                                          else x end order by o)
                       from jsonb_array_elements(i.made) with ordinality as e(x, o)),
             updated_at = now()
       where i.id = v_i.id
      returning * into v_i;
    else
      update custom.template_install i
         set made = i.made || jsonb_build_array(jsonb_build_object('kind', p_kind, 'id', p_id, 'ref', p_kind, 'title', p_label, 'step', null)),
             updated_at = now()
       where i.id = v_i.id
      returning * into v_i;
    end if;
  end if;
  return custom._template_answer(v_i);
end;
$function$;

update platform.feature_knob set feature = 'templates' where feature = 'kits';
