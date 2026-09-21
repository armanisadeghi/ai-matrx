-- lane: ARGS-RULED
--
-- chair-step: it REPLACES the live bodies of two client doors — platform.relation_label and
--   platform.relation_history — so the judge cannot read from an allow-list what the
--   statements will do. Nothing is dropped, nothing is revoked, no row of anybody's data is
--   touched: two existing bodies gain one access decision each. The inverse is
--   migrations/inverse/argsruled_the_far_end_of_a_relation_is_decided_too_down.sql and it
--   restores both bodies character for character.
--
-- based-on: platform.relation_label(uuid, text, uuid) c8c1caac04055ef15ad8a263176a8d54f749405e927c358cb115124a2498c9b6
-- based-on: platform.relation_history(uuid, uuid) 22e939b9a8208d48297e45c9ed6867f65525da24291b2aeb4f474ba5efdc1166
--
-- ARGS-RULED — TWO ID ARGUMENTS OF THE RELATION SURFACE WERE READ WITHOUT BEING DECIDED.
--
-- 1 — `platform.relation_label(org, target_type, target_id)` DECIDED ONLY THE `record` ARM.
--
-- REL-14 gave the record arm a real ladder: a target this reader may not open answers
-- `platform.relation_withheld_label()`. The OTHER arm — every one of the 179 entity types in
-- `platform.entity_types` that declares a `title_column` — read the title straight out of the
-- named table with `execute format('select %I::text from %I.%I where id = $1')`, with no access
-- decision and NO ORGANIZATION IN THE WHERE CLAUSE AT ALL. `p_organization_id` gated who could
-- call the door; it never gated the row the door then read.
--
-- MEASURED, NOT ARGUED. From test@test.com's `authenticated` seat on the MAIN database, in a
-- rolled-back transaction, naming Rincon Plumbing Co (an organization she IS in) as
-- `p_organization_id`:
--
--     platform.relation_label(rincon, 'organization',  <Calder Approvals, a tenant she is
--                                                       not a member of>)  = 'Calder Approvals'
--     platform.relation_label(rincon, 'user_profile',  <admin@admin.com>)  = 'AI Matrx Admin'
--
-- That is the name of another tenant, and the display name of another account, handed to any
-- signed-in member of any organization — one id at a time, across `agent.definition`,
-- `chat.conversation`, `crm.party`, `hr.employee`, `users.credential_items` and 174 more.
--
-- THE FIX IS THE ONE THE RECORD ARM ALREADY MAKES, ASKED OF THE KERNEL THAT OWNS THOSE TOKENS.
-- `iam.has_access(token, id, 'viewer')` is the platform's own answer for a non-record entity —
-- it is what `custom.reaches_directly` arm 1 asks — and it was measured before this file was
-- written: the caller's OWN organization answers true, a foreign organization answers false, a
-- catalogue row (`ai_model`) answers true, so the platform's own catalogue keeps its labels.
-- A withheld target gets the SAME SENTENCE the record arm gives, never the title and never the
-- bare id. The two arms of one function now decide the same way.
--
-- IT IS ASKED ONLY OF A REAL PRINCIPAL. Exactly as the record arm does: a server lane
-- (`custom.query_principal()` null) and the role that owns the store are unchanged, because
-- they have already decided access before reaching here.
--
-- 2 — `platform.relation_history(org, association_id)` SKIPPED ITS LADDER ON ONE BRANCH.
--
-- It resolved the edge's source record and asked `custom.assert_client_may_open` on it — but
-- only `if v_source is not null`. An association row that is NOT in this organization, or whose
-- `source_type` is not `record` (`platform.associations` is the platform's one association
-- table and carries other kinds), left `v_source` null, the ladder was never asked, and the
-- body went on to return `history.row_versions` for that id. So every version of any non-record
-- edge in the organization was readable by any member, with nothing between them and it.
--
-- The branch now ANSWERS THE EMPTY HISTORY — byte-identical to an invented id, which is what
-- this door's own comment already promised — instead of reading rows nobody decided about.
--
-- WHAT THIS DOES NOT CHANGE. `platform.assert_relations_door` is still not called by
-- `relation_label`: the switch is a PRODUCT switch and never the security boundary (the
-- sentence is `custom.assert_store_door`'s own), and the boundary this door needed was the one
-- added above. `custom.field_declare` and the trigger `platform.enforce_relation_edge` both
-- call `relation_label`, and neither passes through a switch here, so nothing that works today
-- stops working.

set lock_timeout = '4s';

CREATE OR REPLACE FUNCTION platform.relation_label(p_organization_id uuid, p_target_type text, p_target_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_title text;
  v_col   text;
  v_sch   text;
  v_tab   text;
  v_me    uuid;
begin
  -- REL-14. The label is READ, never stored on the edge.
  --
  -- THE FAR END OF A RELATION IS A DIFFERENT RECORD, IN A DIFFERENT TABLE, AND THE READER MAY
  -- NOT HOLD IT. Until now this function answered the title to anybody who could call it, so
  -- the reverse side of a shared record told a member the names of records nobody had shared
  -- with her. The access question is asked BEFORE the title is read, and a reader who may not
  -- open the target is told so in words — `platform.relation_withheld_label()` — never given
  -- the title and never handed the bare id.
  perform custom.assert_client_may_reach(p_organization_id, 'platform.relation_label');

  v_me := custom.query_principal();

  if p_target_type = 'record' then
    if v_me is not null
       and not custom.query_is_store_owner()
       and exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = p_target_id)
       and not custom.has_visibility(v_me, 'record', p_target_id, 'viewer'::public.permission_level) then
      return platform.relation_withheld_label();
    end if;
    select r.data ->> (t.data ->> 'title_field') into v_title
      from custom.record r
      join custom.record t on t.id = r.table_id
     where r.id = p_target_id and r.deleted_at is null
       and (r.organization_id = p_organization_id or r.data_class = 'kernel')
     limit 1;
    if v_title is null then
      select l.cached_title into v_title
        from custom.external_link l
       where l.record_id = p_target_id and l.organization_id = p_organization_id
       limit 1;
    end if;
    if v_title is not null then
      v_title := custom._card_words(p_organization_id, v_title, 'record');
    end if;
    return v_title;
  end if;

  select e.schema_name, e.table_name, nullif(e.title_column, '')
    into v_sch, v_tab, v_col
    from platform.entity_types e
   where e.token = p_target_type
   limit 1;
  if v_col is null or v_sch is null or v_tab is null then
    return null;
  end if;

  -- ARGS-RULED (2026-09-21). THE SAME DECISION THE RECORD ARM MAKES, ASKED OF THE KERNEL THAT
  -- OWNS THIS TOKEN — and asked BEFORE the row is read, so a target the reader may not hold and
  -- an invented id answer the same sentence. `p_target_id` was, until this line, an id this
  -- door read out of whatever table `p_target_type` named, in whatever organization it lived in.
  if v_me is not null
     and not custom.query_is_store_owner()
     and not iam.has_access(p_target_type, p_target_id, 'viewer'::public.permission_level) then
    return platform.relation_withheld_label();
  end if;

  execute format('select %I::text from %I.%I where id = $1 limit 1', v_col, v_sch, v_tab)
    into v_title using p_target_id;
  return v_title;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.relation_history(p_organization_id uuid, p_association_id uuid)
 RETURNS TABLE(version integer, operation text, at_time timestamp with time zone, actor_id uuid, role text, target_type text, target_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_source uuid;
begin
  perform platform.assert_relations_door(p_organization_id);
  perform custom.assert_client_may_reach(p_organization_id, 'platform.relation_history');
  -- The history of an edge is the history of the record it comes OUT of, so it is decided at
  -- that record's reading threshold. An edge that is not in this organization answers nothing,
  -- which is the same answer an invented id gets.
  select a.source_id into v_source
    from platform.associations a
   where a.id = p_association_id and a.organization_id = p_organization_id
     and a.source_type = 'record'
   limit 1;
  -- ARGS-RULED (2026-09-21). AND SO DOES AN EDGE WHOSE SOURCE IS NOT A RECORD. This branch used
  -- to fall through to the read with the ladder never asked, so the whole version history of any
  -- non-record association in the organization came back to any member. The promise two lines
  -- above is now kept on every branch: no source record to decide about means no history.
  if v_source is null then
    return;
  end if;
  perform custom.assert_client_may_open(p_organization_id, v_source, 'platform.relation_history',
                                        'viewer'::public.permission_level, 'record');
  return query
    select v.version, v.operation, v.occurred_at, v.actor_id,
           v.row_data ->> 'role',
           v.row_data ->> 'target_type',
           nullif(v.row_data ->> 'target_id', '')::uuid
      from history.row_versions v
     where v.entity_type = 'agent_surface_binding'
       and v.row_id = p_association_id
       and v.organization_id = p_organization_id
     order by v.version, v.occurred_at;
end;
$function$;
