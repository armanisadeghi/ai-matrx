-- target: branch
-- based-on: iam._record_access_audit(uuid, text, text, text, text, text, boolean, uuid[], integer, uuid, text, text, uuid, uuid, timestamp with time zone, boolean, uuid, uuid) d272430f66ecc662c46c5f5a67698aa106ef5c2caa17c9bdbf793feddf0a9e87
-- based-on: iam.assert_may_transfer(text, uuid, uuid, uuid, text, uuid) 0e70200b17c69162c3aa24d2b63a5cd4de44190623fe6ccffd5fbc2d30540534
-- based-on: iam.entity_read_kernel_expected() d43fbdafe61332bd77a764869439ef6c33e65ec7c0e0f98f6d3cdcd72920751d
-- based-on: platform._ddl_guard() 8b3c8341926463e96b269185d673b867e699142b1f25c424e05491fd84f546f8
-- based-on: platform._entity_types_class_regenerates() b37b98f5d77aecb892abb361ab887e0c19e6b19018c13449c542de6b3dbed1bc
-- based-on: platform._entity_types_classify_default() f04d2158f9f28a87123480c06538db2a3961fc814c7e7ff2d007f73b289ec764
-- based-on: platform._metadata_guard() cde4a466c8da847228b54eaf4f0a08545ba7d2a8456f08aa95d02cab9843d9d5
-- based-on: platform.create_entity_table(text, text, text, text, text[], text, boolean, boolean, text, boolean, boolean, boolean, boolean, text[], platform.data_class, platform.list_scope) 9b6a650448d963b8770b33ae116f28ad01ff19c28f45dd2fbd81c894af16e613
-- based-on: platform.rebuild_reachability() f912f115352b16ff08e69c9f9ece1b2b8f44ffc7e4eb44ee3cac2841a4ebcf31
--
-- w0_sync_ruling_schema_functions — platform / iam LEVEL WITH PRODUCTION.
--
-- The provisioner sync closed one subsystem. This closes the rest of the FUNCTION
-- drift in the schemas the campaign rules on — `platform`, `iam`, `history`: five
-- functions production has and this branch lacked, and nine whose bodies had moved
-- apart. Among them are the two the campaign leans on hardest — `platform._ddl_guard`,
-- the guard every lane's DDL meets, and `platform.create_entity_table`, the one
-- sanctioned way a lane lays a table down. A rehearsal whose provisioner and whose DDL
-- guard are older than production's rehearses a system nobody is going to ship.
--
-- It was found by running the campaign's own gate: `scripts/gate-corpus/run.ts` went RED
-- on `function "platform.assert_same_org" does not exist` — a production-only function,
-- already sitting in this lane's BEFORE measurement. The gate was reading the drift.
--
-- Every body is production's `pg_get_functiondef` byte for byte. The `-- based-on:` shas
-- are this branch's current bodies, so this file cannot apply anywhere else.
--
--   uv run python db/apply_migrations.py --source campaign \
--     --only w0_sync_ruling_schema_functions.sql --target branch --lane W0-SYNC --no-generate

-- ------------------------------------------------------------------
-- THE SHAPE GUARD IS STOOD DOWN FOR THIS FILE, AND ONLY FOR THIS FILE.
--
-- `iam.record_transfer_refusal(jsonb)` is SECURITY DEFINER and has NO
-- `platform.client_callable_door` row — ON PRODUCTION EITHER. It does not need one
-- there because it was created BEFORE `provision_shape_guard` existed; the guard's
-- `definer_no_door` lane fires on NEW objects only and carries no at-rest backlog. On
-- this branch the same function is a NEW object, so the guard charges it debt that
-- production never charged it, and the file that is trying to make the branch MATCH
-- production is refused for not matching it.
--
-- Inventing a door row production does not have, or a grandfather row production does
-- not have, would make the branch differ from production in a NEW way to stop it
-- differing in an old one. So instead this file takes the escape the guard itself
-- documents for lane A (`postgres`, which owns the trigger): the deferred constraint
-- trigger is disabled for the length of this transaction and re-enabled inside it. It
-- is re-enabled UNCONDITIONALLY below and then PROVED enabled — this file does not end
-- with the branch's newest guard switched off.
ALTER TABLE platform.provision_shape_debt DISABLE TRIGGER provision_shape_settled;
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION iam.record_transfer_refusal(p_refusal jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'iam', 'public'
AS $function$
declare v_id uuid; v_org uuid;
begin
  -- The durable half of the transfer door. `iam.assert_may_transfer` REFUSES by raising,
  -- which rolls back everything its own transaction did — including, until 0765, the audit
  -- row it tried to write about the refusal. There is no autonomous transaction on this
  -- instance (see the 0765 header for the census), so the record is written HERE, by the
  -- boundary that caught the 42501, in a transaction that commits. The refusal payload is
  -- the JSON the door put in the exception's DETAIL: nothing is re-decided or re-guessed.
  if p_refusal is null or jsonb_typeof(p_refusal) <> 'object' then
    raise exception 'iam.record_transfer_refusal: pass the JSON object the transfer door put in the exception DETAIL'
      using errcode = '22023';
  end if;
  if coalesce(p_refusal->>'door', '') <> 'iam.assert_may_transfer' then
    raise exception 'iam.record_transfer_refusal: this records refusals from iam.assert_may_transfer, not from %',
      coalesce(nullif(p_refusal->>'door', ''), '(no door named)')
      using errcode = '22023';
  end if;
  v_org := nullif(p_refusal->>'row_organization', '')::uuid;
  if v_org is null then
    select so.organization_id into v_org from iam.system_orgs so where so.key = 'system';
    if v_org is null then
      raise exception 'iam.record_transfer_refusal: no organization in the refusal and iam.system_orgs has no row keyed ''system'''
        using errcode = '22023';
    end if;
  end if;

  insert into iam.access_audit(
    action, target_token, data_class, purpose, basis, is_emergency_door, granted,
    denial_reason, actor_user_id, organization_id, request_context)
  values (
    'rewrite_owner',
    coalesce(nullif(p_refusal->>'token', ''), 'unknown'),
    coalesce(nullif(p_refusal->>'data_class', ''), 'private'),
    'transfer_door', 'definer_function', false, false,
    coalesce(nullif(p_refusal->>'denial_reason', ''), 'the transfer door refused and gave no reason'),
    nullif(p_refusal->>'actor', '')::uuid,
    v_org,
    p_refusal)
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION platform._retired_migrates_from_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  -- VALIDATION ONLY: raises or returns NEW unchanged. Never assigns a column.
  IF new.source_type = 'plan_node' AND new.target_type = 'web_page' AND new.role = 'migrates_from' THEN
    RAISE EXCEPTION 'platform.associations: the plan_node -> web_page role `migrates_from` was retired on 2026-09-16 with 0 rows. Where a legacy page is going is recorded as a web_page -> seo_map_topic edge with role `intent` and payload kind map_page_intent — write it through seo.set_page_intents (disposition merge or redirect, into_node_id = this plan node).'
      USING ERRCODE = '23514';
  END IF;
  RETURN new;
END $function$;

CREATE OR REPLACE FUNCTION platform._touch_rulebook()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    shape jsonb := to_jsonb(NEW);
    --  🚨 THE DECLARED BACKGROUND KEYS. A metadata key written by a machine ABOUT the
    --  rulebook, never by or for the Expert, and therefore never a new version of her
    --  work. Mirrored by BACKGROUND_METADATA_KEYS in
    --  aidream/services/distillation/rulebook_writes.py; a guard test refuses drift.
    background_keys text[] := ARRAY['coherence'];
    rest_new  jsonb;
    rest_old  jsonb;
    meta_new  jsonb;
    meta_old  jsonb;
BEGIN
    -- DD-184: NEVER `NEW := jsonb_populate_record(NEW, ...)` here. That rebuilds the row
    -- from a TupleDesc cached at the first firing in this transaction, so a column added
    -- in between is silently written back as NULL. Direct field assignment is resolved
    -- against the tuple itself, every time. (Inherited from platform._touch_row, which
    -- this function is a Rulebook-scoped copy of.)
    IF shape ? 'updated_at' THEN
        NEW.updated_at := now();
    END IF;

    IF TG_OP = 'UPDATE' AND shape ? 'version' THEN
        rest_new := to_jsonb(NEW) - 'metadata' - 'updated_at' - 'updated_by' - 'version';
        rest_old := to_jsonb(OLD) - 'metadata' - 'updated_at' - 'updated_by' - 'version';
        meta_new := COALESCE(to_jsonb(NEW) -> 'metadata', '{}'::jsonb) - background_keys;
        meta_old := COALESCE(to_jsonb(OLD) -> 'metadata', '{}'::jsonb) - background_keys;

        IF rest_new = rest_old AND meta_new = meta_old THEN
            -- Nothing an Expert or a reader can see moved: a background writer left its
            -- findings, or another trigger moved a stamp. Carrying the version forward is
            -- what stops that write from ageing out the save somebody is in the middle of.
            NEW.version := COALESCE((to_jsonb(OLD) ->> 'version')::integer, 0);
        ELSE
            NEW.version := COALESCE((to_jsonb(OLD) ->> 'version')::integer, 0) + 1;
        END IF;
    END IF;

    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION platform.assert_same_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_col    text := tg_argv[0];
  v_target text := tg_argv[1];
  v_fk     uuid;
  v_theirs uuid;
  v_mine   uuid;
begin
  execute format('select ($1).%I, ($1).organization_id', v_col) into v_fk, v_mine using new;
  if v_fk is null then return new; end if;
  execute format('select t.organization_id from %s t where t.id = $1', v_target)
    into v_theirs using v_fk;
  if v_theirs is null then return new; end if;
  if v_theirs is distinct from v_mine then
    raise exception 'assert_same_org: %.% = % belongs to organization %, but this row belongs to organization %',
      tg_table_name, v_col, v_fk, v_theirs, v_mine
      using errcode = 'check_violation',
            hint = 'A row may only reference a row of the same organization. The initiating operation supplies organization_id explicitly; nothing here assigns it (NO-BACKSTOP, db-rules §2/§6e).';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.enforce_client_association_endpoint_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_endpoints_moved boolean;
  v_became_live     boolean;
begin
  -- VALIDATION ONLY. RAISES or returns NEW unchanged; never assigns a column.

  -- Server lanes (owner, BYPASSRLS roles, SECURITY DEFINER bodies owned by
  -- postgres) have no row security on this table: they are not client writes.
  if not pg_catalog.row_security_active('platform.associations'::pg_catalog.regclass) then
    return new;
  end if;

  -- The platform-admin lane is granted outright by `platform_admin_all`.
  if (select public.is_platform_admin()) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_endpoints_moved :=
         new.source_type is distinct from old.source_type
      or new.source_id   is distinct from old.source_id
      or new.target_type is distinct from old.target_type
      or new.target_id   is distinct from old.target_id;

    -- A REVIVE IS A WRITE: a tombstoned row coming back live puts an edge into
    -- the graph exactly as an insert does, so it is judged exactly as one.
    v_became_live := old.deleted_at is not null and new.deleted_at is null;

    -- Everything else an UPDATE can do is free: tombstoning (deleted_at going
    -- non-null), and metadata / position / label edits on a row that was
    -- already live and stays where it is.
    if not v_endpoints_moved and not v_became_live then
      return new;
    end if;
  end if;

  -- One message for every refusal: forbidden and nonexistent read the same.
  if coalesce(iam.has_access(new.source_type, new.source_id, 'editor'::public.permission_level), false) is not true
     or coalesce(iam.has_access(new.target_type, new.target_id, 'viewer'::public.permission_level), false) is not true then
    raise exception
      'platform.associations: a % -> % edge written by a client needs editor access to its source and viewer access to its target',
      new.source_type, new.target_type
      using errcode = '42501',
            hint = 'Write edges through public.assoc_link / public.assoc_add, with access to both endpoints. Reviving a tombstoned edge is a write and is judged the same way.';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION iam._record_access_audit(p_organization_id uuid, p_action text, p_target_token text, p_data_class text, p_purpose text, p_basis text, p_granted boolean, p_target_ids uuid[] DEFAULT '{}'::uuid[], p_row_count integer DEFAULT NULL::integer, p_subject_user_id uuid DEFAULT NULL::uuid, p_justification text DEFAULT NULL::text, p_denial_reason text DEFAULT NULL::text, p_request_id uuid DEFAULT NULL::uuid, p_permission_id uuid DEFAULT NULL::uuid, p_grant_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_is_emergency_door boolean DEFAULT true, p_actor_user_id uuid DEFAULT NULL::uuid, p_granted_to_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'iam', 'public'
AS $function$
declare v_id uuid; v_actor uuid := coalesce(p_actor_user_id, auth.uid()); v_org uuid := p_organization_id;
begin
  -- 🚨 NO-BACKSTOP (AD229, 2026-09-15). iam.access_audit no longer carries
  -- `_stamp_org_default`, so THIS writer supplies the organization. Every caller today passes
  -- a non-null one (iam.emergency_door_open / _approve / _deny and public.hr_break_glass all
  -- refuse before they get here when the target row has no organization), which is why the
  -- trigger has never actually fired on this path. A future caller that forgets does NOT get a
  -- silent 23502 that loses an audit row, and does NOT get a personal workspace stamped on a
  -- platform record: the row goes to the platform tenant and the omission SCREAMS by name.
  if v_org is null then
    select so.organization_id into v_org from iam.system_orgs so where so.key = 'system';
    if v_org is null then
      raise exception 'iam._record_access_audit: no organization was supplied and iam.system_orgs has no row keyed ''system'', so this audit row has no tenant to belong to'
        using errcode = '22023';
    end if;
    raise warning 'iam._record_access_audit: a caller recorded a % row about % with NO organization_id. Attributed to the platform tenant. FIX THE CALLER: the writer supplies the organization (NO-BACKSTOP law).',
      p_action, p_target_token;
  end if;
  -- 🚨 THE TWO-PERSON ACTION MUST SAY WHO THE KEY IS FOR. `approved` is the only action whose
  -- actor and grantee are different people by construction, so the convenience default is a
  -- LIE there and is refused rather than silently taken.
  if p_action = 'approved' and p_granted_to_user_id is null then
    raise exception 'iam._record_access_audit: an `approved` row must name the person the key was minted FOR — the approver is not the reader'
      using errcode = '22023',
            hint = 'Pass p_granted_to_user_id (the requester). Defaulting it to the actor is what told a subject the wrong name on her own access page (V-38, 2026-09-12).';
  end if;

  -- 🚨 DD-213c: THIS ORGANIZATION'S LOG RECORDS ITS OWN PEOPLE. Until 2026-09-14 a
  -- signed-in stranger who named any organization's row got a refusal from the
  -- emergency door AND a row in that organization's access log — repeatably, from
  -- any free account, with ids that are not secrets. The test is DD-213b's one
  -- rule: standing in the employer, or a pending invitation it issued. A granted
  -- row is never suppressed, and the anonymous lane is untouched.
  if coalesce(p_granted, false) = false
     and v_actor is not null
     and p_organization_id is not null
     and not hr._has_audit_standing(v_actor, p_organization_id) then
    return null;
  end if;

  insert into iam.access_audit
    (organization_id, action, target_token, target_ids, row_count, subject_user_id, data_class,
     purpose, basis, justification, is_emergency_door, granted, denial_reason, request_id,
     permission_id, grant_expires_at, actor_user_id, granted_to_user_id, created_by, visibility)
  values
    (v_org, p_action, p_target_token, coalesce(p_target_ids, '{}'::uuid[]), p_row_count,
     p_subject_user_id, p_data_class, p_purpose, p_basis, p_justification, p_is_emergency_door,
     p_granted, p_denial_reason, p_request_id, p_permission_id, p_grant_expires_at, v_actor,
     coalesce(p_granted_to_user_id, v_actor),
     v_actor, 'personal'::platform.visibility)
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION iam.assert_may_transfer(p_token text, p_row_owner uuid, p_target_owner uuid, p_row_org uuid DEFAULT NULL::uuid, p_container_type text DEFAULT NULL::text, p_container_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid    uuid    := auth.uid();
  v_class  text;
  v_why    text;
  -- 🚨 DECLARED HERE, NOT INSIDE THE IF. The first version declared it in a nested block and read it
  -- after that block's `end` — where it is out of scope. It compiled, and it failed at RUN time with
  -- `column "v_kernel" does not exist`, on the ONE arm the migration's own proof never exercised:
  -- the bootstrap path, where a person claims their first membership in an organization they just
  -- created. A live rehearsal of organization creation found it; the proof had not.
  v_kernel boolean;
  -- 🚨 NO-BACKSTOP (AD229, 2026-09-15). This function's own audit row is the ONLY writer
  -- into iam.access_audit that could reach the table with organization_id NULL: p_row_org
  -- defaults to NULL, the column is NOT NULL, and the `_stamp_org_default` BEFORE-INSERT
  -- trigger was filling it from the REFUSED CALLER'S personal organization -- so a refusal
  -- about someone else's row landed in the refused person's own workspace. Same answer as
  -- 0752 and as iam.class_allows two functions over: a door's own refusal record belongs to
  -- the platform tenant, READ from iam.system_orgs, never guessed and never trigger-assigned.
  v_org uuid;
  -- 🚨 AND THE RECORD IS NOT WRITTEN HERE (0765). This function ends by RAISING, so an insert
  -- it performs is rolled back with the caller: iam.access_audit held 0 rows with
  -- purpose='transfer_door' for the whole life of the door, and always would have. There is
  -- no autonomous transaction on this instance (0765 header: no dblink credential, no
  -- pg_background, and cron/net/GUC are all transactional). So the door hands the complete
  -- refusal out instead of swallowing it: a `raise warning` that survives the rollback in the
  -- server log, and this JSON in the exception's DETAIL, which the boundary that catches the
  -- 42501 passes to iam.record_transfer_refusal() in a transaction that commits.
  v_refusal jsonb;
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'assert_may_transfer: no token. A door asked about nothing answers nothing.'
      using errcode = '22023';
  end if;

  -- ARM 1 — the server itself. A service-role caller is not a browser and is not subject to a
  -- browser's class gate; it is subject to the code that holds the key.
  if coalesce(auth.role() = 'service_role', false) then return; end if;

  -- ARM 2 — a platform administrator, through the admin door that already audits itself (DD-136).
  if public.is_super_admin() then return; end if;

  -- ARM 3 — an owner or admin OF THE ROW'S OWN ORGANIZATION. This is the answer the three bespoke
  -- checks were each spelling differently; it is resolved here from the kernel's own predicate.
  if p_row_org is not null and v_uid is not null and iam.is_org_manager(p_row_org, v_uid) then
    return;
  end if;

  -- ARM 3b — an admin of the CONTAINER the row hangs off, asked of the kernel (iam.has_access), not
  -- accepted from the caller. A project admin who is not an organization manager lands here.
  if p_container_type is not null and p_container_id is not null and v_uid is not null then
    begin
      v_kernel := iam.has_access(p_container_type, p_container_id, 'admin'::public.permission_level);
    exception when others then
      -- The kernel could not answer. That is NOT a pass and NOT a silent skip: the arm is closed and
      -- the reason travels with the refusal below.
      v_kernel := false;
      perform set_config('iam.transfer_door_kernel_error', sqlerrm, true);
    end;
    if v_kernel then return; end if;
  end if;

  -- ARM 4 — NOTHING ACTUALLY MOVED. A "transfer" whose two ends are the same person is a claim, not
  -- a transfer: creating your own first membership in the organization you just created lands here,
  -- and refusing it would mean nobody could ever own anything.
  if v_uid is not null and p_row_owner is not distinct from v_uid
                       and p_target_owner is not distinct from v_uid then
    return;
  end if;

  -- ARM 5 — the owner handing their OWN row to somebody else, which only the data class may allow.
  if v_uid is not null and p_row_owner is not distinct from v_uid then
    if iam.class_allows(p_token, 'rewrite_owner', p_row_org) then return; end if;
    -- `iam.class_allows` already wrote the audit row and the reason; re-raise it verbatim so the
    -- person reads the class's own sentence and not a second, vaguer one.
    raise exception 'Refused: %',
      coalesce(nullif(current_setting('iam.class_gate_last_reason', true), ''),
               format('the data class of %L does not allow this row to be handed to someone else',
                      p_token))
      using errcode = '42501',
            detail  = format('token=%s action=rewrite_owner row_owner=%s target=%s',
                             p_token, p_row_owner, p_target_owner),
            hint    = 'This is the data class of the table, not a permission you can be granted.';
  end if;

  -- Nothing allowed it. Say which question failed, not "denied".
  select et.data_class::text into v_class
    from platform.entity_types et where et.token = p_token and et.is_active;
  v_class := coalesce(v_class, 'private');
  v_why := format('you are not the owner of this %s row, not an owner or admin of the organization '
                  'it belongs to, and not a platform administrator, so you cannot change who owns it',
                  p_token);
  if nullif(current_setting('iam.transfer_door_kernel_error', true), '') is not null then
    v_why := v_why || format(' [the access kernel could not be asked about %s %s: %s]',
                             p_container_type, p_container_id,
                             current_setting('iam.transfer_door_kernel_error', true));
  end if;

  v_org := coalesce(p_row_org,
                    (select so.organization_id from iam.system_orgs so where so.key = 'system'));
  v_refusal := jsonb_build_object(
    'door', 'iam.assert_may_transfer',
    'token', p_token,
    'data_class', v_class,
    'denial_reason', v_why,
    'actor', v_uid,
    'row_owner', p_row_owner,
    'target_owner', p_target_owner,
    'row_organization', v_org,
    'container_type', p_container_type,
    'container_id', p_container_id,
    'refused_at', now());

  -- The rollback-proof half: this line reaches the server log even though the transaction that
  -- read it is about to be thrown away.
  raise warning 'iam.assert_may_transfer REFUSED a % transfer (owner % -> %) for actor %. This refusal is NOT audited unless the caller records it: catch the 42501 and pass the DETAIL JSON to iam.record_transfer_refusal() in a NEW transaction.',
    p_token, p_row_owner, p_target_owner, coalesce(v_uid::text, '(anonymous)');

  raise exception 'Refused: %', v_why
    using errcode = '42501',
          detail  = v_refusal::text,
          hint    = 'Ask an owner or admin of the organization that holds this row to move it. '
                 || 'To make this refusal durable, catch this error and call '
                 || 'iam.record_transfer_refusal(<this DETAIL, as jsonb>) in a new transaction.';
end
$function$;

CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$ select '2c20acc18f73ab979f0eb8f0e39c8c42'::text $function$;

CREATE OR REPLACE FUNCTION platform._ddl_guard()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  cmd record;
  v_schema text; v_rel text; v_kind "char"; v_ispart boolean;
  c_known_assignment_oids CONSTANT oid[] := ARRAY[1700130::oid,1700188::oid,1700217::oid,1700348::oid,1700827::oid,1700940::oid,2299203::oid,2299426::oid];
  v_assignment_target_oid oid; v_function_source text; v_default_oid oid; v_default_ref text; v_default_md5 text;
  v_scan_chars text[]; v_scan_len integer; v_scan_pos integer; v_scan_next_pos integer; v_scan_uescape_pos integer; v_scan_comment_depth integer; v_scan_index integer; v_scan_decode_pos integer; v_scan_token text; v_scan_tokens text[]; v_scan_dollar_delimiter text; v_scan_raw_identifier text; v_scan_decoded_identifier text; v_scan_escape_char text; v_scan_hex text; v_scan_codepoint integer; v_scan_next_codepoint integer; v_standard_conforming_strings boolean; v_direct_assignment boolean;
  -- grandfathered visibility-type offenders (live census at apply; fixes = owners' queue)
  c_vis_grandfather CONSTANT text[] := ARRAY[
    'files.uploads_inflight','public.heatmap_saves'];
  -- grandfathered project_id-FK tables (live census at apply, 17 tables)
  c_proj_grandfather CONSTANT text[] := ARRAY[
    'agent.shortcut','agent.template','public.app_instances','canvas.canvas_items',
    'chat.agent_plan','code.code_file_folders','code.code_files','code.code_repositories',
    'context.user_active_context','docproc.page_extraction_jobs','legal.wc_claim',
    'public.message_template','public.sandbox_instances','skill.definition',
    'skill.render_definition','workbench.udt_datasets','workspace.tasks'];
  -- NO NULL ORG (owner ruling, 2026-08-21). Grandfathered nullable-org tables:
  -- the live census at apply time, MINUS the tables this ruling's migrations
  -- have fixed (seo.gsc_dig_rule, seo.keyword_class_rule, users.profiles, and
  -- as of 2026-08-21 rag.library_docs -- aidream migration 0167, and the ops
  -- capture lane ops.system_error + ops.system_write_failure -- aidream
  -- migration 0443). These are the
  -- legacy backlog, and the backlog is the RATCHET's business, not this guard's
  -- -- hard-failing every unrelated ALTER on them would block releases that have
  -- nothing to do with organization_id. A table leaves this list by being fixed,
  -- never by being excused.
  c_nullorg_grandfather CONSTANT text[] := ARRAY['dictionary.dict_entries',
    'docproc.processed_documents', 'education.study_structured_section',
    'platform._bak_assoc_file_processed_document_20260812',
    'platform.assists', 'platform.associations', 'platform.retention_policy',
    'platform.share_links', 'rag.context_item_suggestions', 'rag.data_stores',
    'rag.kg_alerts', 'rag.kg_chunks', 'rag.kg_suggestion_ack',
    'rag.kg_value_matches', 'rag.ner_canonicalizer_shadow',
    'rag.scope_association_suggestions', 'rag.scope_item_value_suggestions',
    'rag.scope_suggestions', 'research.rs_context_bundle',
    'users.credential_items', 'users.integration_connections',
    'users.invitation_codes', 'users.invitation_requests',
    'users.user_secrets', 'workbench.udt_dataset_fields',
    'workbench.udt_dataset_rows', 'workbench.udt_documents',
    'workbench.udt_structured_list_items', 'workbench.udt_structured_lists'];
  c_exempt_schemas CONSTANT text[] := ARRAY[
    'graveyard','auth','storage','realtime','vault','extensions','supabase_functions',
    'supabase_migrations','cron','net','pgsodium','_analytics','_realtime'];
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    IF cmd.in_extension THEN CONTINUE; END IF;

    -- ERROR lane (c): the banned mirror machinery may never come back
    IF cmd.command_tag = 'CREATE FUNCTION'
       AND cmd.object_identity LIKE '%._mirror_fk_to_assoc(%' THEN
      RAISE EXCEPTION 'ddl_guard: creating % is FORBIDDEN', cmd.object_identity
        USING HINT = 'platform._mirror_fk_to_assoc creates two competing relationship authorities. Write canonical platform.associations edges via assoc_link instead. (matrx-frontend CLAUDE.md, Forbidden relationship shortcuts.)',
              ERRCODE = 'check_violation';
    END IF;


    -- ERROR lane (f) [rls_generator_planner_trap]: the RLS read-lane generators may never emit a §6d planner
    -- trap again (D266, 2026-09-12). `unnest(<STABLE fn>)` and `= ANY (<STABLE fn>)`
    -- are const-folded by the planner, which then EXECUTES the SECURITY DEFINER
    -- access walk while planning EVERY statement against the table (files.files:
    -- 1,289 ms planning / 1.6 ms executing a primary-key read → 57014 under load).
    -- Both forms were fixed at the emitter on 2026-08-24 and came back on
    -- 2026-08-29 through a wholesale CREATE OR REPLACE from a stale file copy.
    -- Patch a generator from pg_get_functiondef(); never replace it from a file.
    IF cmd.command_tag = 'CREATE FUNCTION'
       AND (cmd.object_identity LIKE 'iam.entity_read_expr(%'
            OR cmd.object_identity LIKE 'iam._apply_rls_unchecked(%')
       AND EXISTS (
         SELECT 1 FROM pg_proc p WHERE p.oid = cmd.objid
           AND (p.prosrc ~ '(^|[^_a-z.])unnest\s*\(\s*iam\.accessible_entity_ids\s*\('
                OR p.prosrc ~* '=\s*any\s*\(\s*iam\.accessible_entity_ids\s*\(')
       ) THEN
      RAISE EXCEPTION 'ddl_guard: % emits a §6d RLS planner trap (unnest(iam.accessible_entity_ids(…)) or = ANY (iam.accessible_entity_ids(…)))', cmd.object_identity
        USING HINT = 'The planner const-folds STABLE functions inside unnest()/= ANY() and EXECUTES the access walk while planning every statement (D266, files.files 57014 outage 2026-09-12). Emit `<col> in (select iam.unnest_uuids(iam.accessible_entity_ids(…)))`. You are probably re-creating the generator from a file copy: patch the live definition from pg_get_functiondef() instead, so no prior fix is lost. See common-docs/systems/platform/db-rules/FEATURE.md §6d.',
              ERRCODE = 'check_violation';
    END IF;


    -- DB-T02: new organization defaults and known assignment triggers are forbidden.
    -- This code runs before the table-only branch because CREATE TRIGGER has a trigger
    -- OID, not a relation OID.  OID comparisons are schema-qualified at resolution
    -- time; never compare regproc-rendered text (it drops schemas on search_path).
    IF cmd.command_tag = 'CREATE FUNCTION' THEN
      v_assignment_target_oid := cmd.objid;
    ELSIF cmd.command_tag = 'CREATE TRIGGER' THEN
      SELECT t.tgfoid INTO v_assignment_target_oid
      FROM pg_trigger t WHERE t.oid = cmd.objid AND NOT t.tgisinternal;
    ELSE
      v_assignment_target_oid := NULL;
    END IF;

    IF v_assignment_target_oid IS NOT NULL THEN
      SELECT p.prosrc,
             coalesce(
               (SELECT split_part(v_setting, '=', 2)
                FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS settings(v_setting)
                WHERE split_part(v_setting, '=', 1) = 'standard_conforming_strings'
                LIMIT 1),
               current_setting('standard_conforming_strings')
             ) = 'on'
        INTO v_function_source, v_standard_conforming_strings
      FROM pg_proc p WHERE p.oid = v_assignment_target_oid;
      v_direct_assignment := false;
      v_scan_tokens := ARRAY[]::text[];
      v_scan_pos := 1;
      v_scan_len := length(v_function_source);
      v_scan_chars := string_to_array(v_function_source, NULL);
      WHILE v_scan_pos <= v_scan_len LOOP
        v_scan_token := coalesce(v_scan_chars[v_scan_pos], '');
        IF v_scan_token ~ '[[:space:]]' THEN
          v_scan_pos := v_scan_pos + 1;
        ELSIF v_scan_token = '-' AND coalesce(v_scan_chars[v_scan_pos + 1], '') = '-' THEN
          v_scan_next_pos := position(E'\n' IN substr(v_function_source, v_scan_pos + 2));
          v_scan_pos := CASE WHEN v_scan_next_pos = 0 THEN v_scan_len + 1 ELSE v_scan_pos + 1 + v_scan_next_pos END;
        ELSIF v_scan_token = '/' AND coalesce(v_scan_chars[v_scan_pos + 1], '') = '*' THEN
          v_scan_comment_depth := 1;
          v_scan_pos := v_scan_pos + 2;
          WHILE v_scan_pos <= v_scan_len AND v_scan_comment_depth > 0 LOOP
            IF (coalesce(v_scan_chars[v_scan_pos], '') || coalesce(v_scan_chars[v_scan_pos + 1], '')) = '/*' THEN
              v_scan_comment_depth := v_scan_comment_depth + 1;
              v_scan_pos := v_scan_pos + 2;
            ELSIF (coalesce(v_scan_chars[v_scan_pos], '') || coalesce(v_scan_chars[v_scan_pos + 1], '')) = '*/' THEN
              v_scan_comment_depth := v_scan_comment_depth - 1;
              v_scan_pos := v_scan_pos + 2;
            ELSE
              v_scan_pos := v_scan_pos + 1;
            END IF;
          END LOOP;
        ELSIF lower(v_scan_token) = 'e' AND coalesce(v_scan_chars[v_scan_pos + 1], '') = '''' THEN
          -- Escape strings always honor backslash escapes. Ordinary strings do
          -- so only when standard_conforming_strings is off (handled below).
          v_scan_pos := v_scan_pos + 2;
          WHILE v_scan_pos <= v_scan_len LOOP
            IF ascii(coalesce(v_scan_chars[v_scan_pos], '')) = 92 THEN
              v_scan_pos := v_scan_pos + 2;
            ELSIF coalesce(v_scan_chars[v_scan_pos], '') = '''' THEN
              IF coalesce(v_scan_chars[v_scan_pos + 1], '') = '''' THEN v_scan_pos := v_scan_pos + 2; ELSE v_scan_pos := v_scan_pos + 1; EXIT; END IF;
            ELSE
              v_scan_pos := v_scan_pos + 1;
            END IF;
          END LOOP;
        ELSIF v_scan_token = '''' THEN
          v_scan_pos := v_scan_pos + 1;
          WHILE v_scan_pos <= v_scan_len LOOP
            IF NOT v_standard_conforming_strings AND ascii(coalesce(v_scan_chars[v_scan_pos], '')) = 92 THEN
              v_scan_pos := v_scan_pos + 2;
            ELSIF coalesce(v_scan_chars[v_scan_pos], '') = '''' THEN
              IF coalesce(v_scan_chars[v_scan_pos + 1], '') = '''' THEN v_scan_pos := v_scan_pos + 2; ELSE v_scan_pos := v_scan_pos + 1; EXIT; END IF;
            ELSE
              v_scan_pos := v_scan_pos + 1;
            END IF;
          END LOOP;
        ELSIF v_scan_token = '$' THEN
          v_scan_dollar_delimiter := (regexp_match(substr(v_function_source, v_scan_pos), '^(\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$)'))[1];
          IF v_scan_dollar_delimiter IS NULL THEN
            v_scan_tokens := array_append(v_scan_tokens, '$');
            v_scan_pos := v_scan_pos + 1;
          ELSE
            v_scan_next_pos := position(v_scan_dollar_delimiter IN substr(v_function_source, v_scan_pos + length(v_scan_dollar_delimiter)));
            v_scan_pos := CASE WHEN v_scan_next_pos = 0 THEN v_scan_len + 1 ELSE v_scan_pos + length(v_scan_dollar_delimiter) + v_scan_next_pos - 1 + length(v_scan_dollar_delimiter) END;
          END IF;
        ELSIF lower((coalesce(v_scan_chars[v_scan_pos], '') || coalesce(v_scan_chars[v_scan_pos + 1], ''))) = 'u&'
              AND coalesce(v_scan_chars[v_scan_pos + 2], '') = '"' THEN
          -- PostgreSQL Unicode-escaped quoted identifiers are identifiers, not
          -- strings. Decode their 4-hex and +6-hex escapes before comparing the
          -- field name, while retaining quoted-identifier case semantics.
          v_scan_raw_identifier := '';
          v_scan_next_pos := v_scan_pos + 3;
          WHILE v_scan_next_pos <= v_scan_len LOOP
            IF coalesce(v_scan_chars[v_scan_next_pos], '') = '"' THEN
              IF coalesce(v_scan_chars[v_scan_next_pos + 1], '') = '"' THEN
                v_scan_raw_identifier := v_scan_raw_identifier || '"';
                v_scan_next_pos := v_scan_next_pos + 2;
              ELSE
                v_scan_next_pos := v_scan_next_pos + 1;
                EXIT;
              END IF;
            ELSE
              v_scan_raw_identifier := v_scan_raw_identifier || coalesce(v_scan_chars[v_scan_next_pos], '');
              v_scan_next_pos := v_scan_next_pos + 1;
            END IF;
          END LOOP;
          IF v_scan_next_pos > v_scan_len + 1 THEN
            RAISE EXCEPTION 'ddl_guard: malformed Unicode-escaped identifier in %', cmd.object_identity
              USING ERRCODE = 'check_violation';
          END IF;
          v_scan_escape_char := chr(92);
          -- Comments and whitespace are interchangeable lexical separators in
          -- PostgreSQL, including around UESCAPE and its one-character string.
          v_scan_uescape_pos := v_scan_next_pos;
          LOOP
            IF coalesce(v_scan_chars[v_scan_uescape_pos], '') ~ '[[:space:]]' THEN
              v_scan_uescape_pos := v_scan_uescape_pos + 1;
            ELSIF (coalesce(v_scan_chars[v_scan_uescape_pos], '') || coalesce(v_scan_chars[v_scan_uescape_pos + 1], '')) = '--' THEN
              v_scan_next_pos := position(E'\n' IN substr(v_function_source, v_scan_uescape_pos + 2));
              v_scan_uescape_pos := CASE WHEN v_scan_next_pos = 0 THEN v_scan_len + 1 ELSE v_scan_uescape_pos + 1 + v_scan_next_pos END;
            ELSIF (coalesce(v_scan_chars[v_scan_uescape_pos], '') || coalesce(v_scan_chars[v_scan_uescape_pos + 1], '')) = '/*' THEN
              v_scan_comment_depth := 1;
              v_scan_uescape_pos := v_scan_uescape_pos + 2;
              WHILE v_scan_uescape_pos <= v_scan_len AND v_scan_comment_depth > 0 LOOP
                IF (coalesce(v_scan_chars[v_scan_uescape_pos], '') || coalesce(v_scan_chars[v_scan_uescape_pos + 1], '')) = '/*' THEN v_scan_comment_depth := v_scan_comment_depth + 1; v_scan_uescape_pos := v_scan_uescape_pos + 2;
                ELSIF (coalesce(v_scan_chars[v_scan_uescape_pos], '') || coalesce(v_scan_chars[v_scan_uescape_pos + 1], '')) = '*/' THEN v_scan_comment_depth := v_scan_comment_depth - 1; v_scan_uescape_pos := v_scan_uescape_pos + 2;
                ELSE v_scan_uescape_pos := v_scan_uescape_pos + 1;
                END IF;
              END LOOP;
            ELSE EXIT;
            END IF;
          END LOOP;
          IF lower(substr(v_function_source, v_scan_uescape_pos, 7)) = 'uescape'
             AND coalesce(v_scan_chars[v_scan_uescape_pos + 7], '') !~ '[A-Za-z_0-9$]' THEN
            v_scan_uescape_pos := v_scan_uescape_pos + 7;
            LOOP
              IF coalesce(v_scan_chars[v_scan_uescape_pos], '') ~ '[[:space:]]' THEN v_scan_uescape_pos := v_scan_uescape_pos + 1;
              ELSIF (coalesce(v_scan_chars[v_scan_uescape_pos], '') || coalesce(v_scan_chars[v_scan_uescape_pos + 1], '')) = '--' THEN
                v_scan_next_pos := position(E'\n' IN substr(v_function_source, v_scan_uescape_pos + 2));
                v_scan_uescape_pos := CASE WHEN v_scan_next_pos = 0 THEN v_scan_len + 1 ELSE v_scan_uescape_pos + 1 + v_scan_next_pos END;
              ELSIF (coalesce(v_scan_chars[v_scan_uescape_pos], '') || coalesce(v_scan_chars[v_scan_uescape_pos + 1], '')) = '/*' THEN
                v_scan_comment_depth := 1; v_scan_uescape_pos := v_scan_uescape_pos + 2;
                WHILE v_scan_uescape_pos <= v_scan_len AND v_scan_comment_depth > 0 LOOP
                  IF (coalesce(v_scan_chars[v_scan_uescape_pos], '') || coalesce(v_scan_chars[v_scan_uescape_pos + 1], '')) = '/*' THEN v_scan_comment_depth := v_scan_comment_depth + 1; v_scan_uescape_pos := v_scan_uescape_pos + 2;
                  ELSIF (coalesce(v_scan_chars[v_scan_uescape_pos], '') || coalesce(v_scan_chars[v_scan_uescape_pos + 1], '')) = '*/' THEN v_scan_comment_depth := v_scan_comment_depth - 1; v_scan_uescape_pos := v_scan_uescape_pos + 2;
                  ELSE v_scan_uescape_pos := v_scan_uescape_pos + 1;
                  END IF;
                END LOOP;
              ELSE EXIT;
              END IF;
            END LOOP;
            IF coalesce(v_scan_chars[v_scan_uescape_pos], '') = ''''
               AND coalesce(v_scan_chars[v_scan_uescape_pos + 2], '') = ''''
               AND coalesce(v_scan_chars[v_scan_uescape_pos + 1], '') !~ '[0-9A-Fa-f+''[:space:]]' THEN
              v_scan_escape_char := coalesce(v_scan_chars[v_scan_uescape_pos + 1], '');
              v_scan_next_pos := v_scan_uescape_pos + 3;
            END IF;
          END IF;
          v_scan_decoded_identifier := '';
          v_scan_decode_pos := 1;
          WHILE v_scan_decode_pos <= length(v_scan_raw_identifier) LOOP
            v_scan_token := substr(v_scan_raw_identifier, v_scan_decode_pos, 1);
            IF v_scan_token <> v_scan_escape_char THEN
              v_scan_decoded_identifier := v_scan_decoded_identifier || v_scan_token;
              v_scan_decode_pos := v_scan_decode_pos + 1;
            ELSIF substr(v_scan_raw_identifier, v_scan_decode_pos + 1, 1) = v_scan_escape_char THEN
              v_scan_decoded_identifier := v_scan_decoded_identifier || v_scan_escape_char;
              v_scan_decode_pos := v_scan_decode_pos + 2;
            ELSIF substr(v_scan_raw_identifier, v_scan_decode_pos + 1, 1) = '+' THEN
              v_scan_hex := substr(v_scan_raw_identifier, v_scan_decode_pos + 2, 6);
              IF v_scan_hex !~ '^[0-9A-Fa-f]{6}$' THEN
                RAISE EXCEPTION 'ddl_guard: malformed Unicode-escaped identifier in %', cmd.object_identity USING ERRCODE = 'check_violation';
              END IF;
              v_scan_codepoint := (('x' || lpad(v_scan_hex, 8, '0'))::bit(32))::integer;
              IF v_scan_codepoint > 1114111 OR v_scan_codepoint BETWEEN 55296 AND 57343 THEN
                RAISE EXCEPTION 'ddl_guard: malformed Unicode-escaped identifier in %', cmd.object_identity USING ERRCODE = 'check_violation';
              END IF;
              v_scan_decoded_identifier := v_scan_decoded_identifier || chr(v_scan_codepoint);
              v_scan_decode_pos := v_scan_decode_pos + 8;
            ELSE
              v_scan_hex := substr(v_scan_raw_identifier, v_scan_decode_pos + 1, 4);
              IF v_scan_hex !~ '^[0-9A-Fa-f]{4}$' THEN
                RAISE EXCEPTION 'ddl_guard: malformed Unicode-escaped identifier in %', cmd.object_identity USING ERRCODE = 'check_violation';
              END IF;
              v_scan_codepoint := (('x' || lpad(v_scan_hex, 8, '0'))::bit(32))::integer;
              IF v_scan_codepoint BETWEEN 55296 AND 56319 THEN
                IF substr(v_scan_raw_identifier, v_scan_decode_pos + 5, 1) <> v_scan_escape_char
                   OR substr(v_scan_raw_identifier, v_scan_decode_pos + 6, 4) !~ '^[0-9A-Fa-f]{4}$' THEN
                  RAISE EXCEPTION 'ddl_guard: malformed Unicode-escaped identifier in %', cmd.object_identity USING ERRCODE = 'check_violation';
                END IF;
                v_scan_next_codepoint := (('x' || lpad(substr(v_scan_raw_identifier, v_scan_decode_pos + 6, 4), 8, '0'))::bit(32))::integer;
                IF v_scan_next_codepoint NOT BETWEEN 56320 AND 57343 THEN
                  RAISE EXCEPTION 'ddl_guard: malformed Unicode-escaped identifier in %', cmd.object_identity USING ERRCODE = 'check_violation';
                END IF;
                v_scan_decoded_identifier := v_scan_decoded_identifier || chr(65536 + (v_scan_codepoint - 55296) * 1024 + v_scan_next_codepoint - 56320);
                v_scan_decode_pos := v_scan_decode_pos + 10;
              ELSIF v_scan_codepoint BETWEEN 56320 AND 57343 THEN
                RAISE EXCEPTION 'ddl_guard: malformed Unicode-escaped identifier in %', cmd.object_identity USING ERRCODE = 'check_violation';
              ELSE
                v_scan_decoded_identifier := v_scan_decoded_identifier || chr(v_scan_codepoint);
                v_scan_decode_pos := v_scan_decode_pos + 5;
              END IF;
            END IF;
          END LOOP;
          v_scan_tokens := array_append(v_scan_tokens, v_scan_decoded_identifier);
          v_scan_pos := v_scan_next_pos;
        ELSIF v_scan_token = '"' THEN
          v_scan_next_pos := v_scan_pos + 1;
          WHILE v_scan_next_pos <= v_scan_len LOOP
            IF coalesce(v_scan_chars[v_scan_next_pos], '') = '"' THEN
              IF coalesce(v_scan_chars[v_scan_next_pos + 1], '') = '"' THEN v_scan_next_pos := v_scan_next_pos + 2; ELSE v_scan_next_pos := v_scan_next_pos + 1; EXIT; END IF;
            ELSE
              v_scan_next_pos := v_scan_next_pos + 1;
            END IF;
          END LOOP;
          v_scan_tokens := array_append(v_scan_tokens, replace(substr(v_function_source, v_scan_pos + 1, v_scan_next_pos - v_scan_pos - 2), '""', '"'));
          v_scan_pos := v_scan_next_pos;
        ELSIF v_scan_token ~ '[A-Za-z_]' THEN
          v_scan_next_pos := v_scan_pos + 1;
          WHILE v_scan_next_pos <= v_scan_len AND coalesce(v_scan_chars[v_scan_next_pos], '') ~ '[A-Za-z_0-9$]' LOOP v_scan_next_pos := v_scan_next_pos + 1; END LOOP;
          v_scan_tokens := array_append(v_scan_tokens, lower(substr(v_function_source, v_scan_pos, v_scan_next_pos - v_scan_pos)));
          v_scan_pos := v_scan_next_pos;
        ELSIF (coalesce(v_scan_chars[v_scan_pos], '') || coalesce(v_scan_chars[v_scan_pos + 1], '')) = ':=' THEN
          v_scan_tokens := array_append(v_scan_tokens, ':='); v_scan_pos := v_scan_pos + 2;
        ELSE
          v_scan_tokens := array_append(v_scan_tokens, v_scan_token); v_scan_pos := v_scan_pos + 1;
        END IF;
      END LOOP;
      FOR v_scan_index IN 1..GREATEST(cardinality(v_scan_tokens) - 3, 0) LOOP
        IF v_scan_tokens[v_scan_index] = 'new'
           AND v_scan_tokens[v_scan_index + 1] = '.'
           AND v_scan_tokens[v_scan_index + 2] = 'organization_id'
           AND (v_scan_tokens[v_scan_index + 3] = ':='
                OR (v_scan_tokens[v_scan_index + 3] = '='
                    AND (v_scan_index = 1 OR v_scan_tokens[v_scan_index - 1] = ANY (ARRAY[';','begin','then','else','loop'])))) THEN
          v_direct_assignment := true;
          EXIT;
        END IF;
      END LOOP;
      IF v_assignment_target_oid = ANY(c_known_assignment_oids) OR v_direct_assignment THEN
        RAISE EXCEPTION 'ddl_guard: % creates or clones an organization-assignment trigger function', cmd.object_identity
          USING HINT = 'Writers must supply organization_id explicitly. A validation-only trigger may refuse a missing value, but no trigger/function may assign one.',
                ERRCODE = 'check_violation';
    END IF;
    END IF;

    -- DB-T02 frozen debt: only these exact existing default identities/bodies may
    -- remain. This catalog comparison does not inspect the migration's query text,
    -- so unrelated ALTER TABLE work on one of these tables stays legal.
    IF cmd.command_tag IN ('CREATE TABLE','ALTER TABLE') THEN
      SELECT d.oid, n.nspname || '.' || c.relname, md5(pg_get_expr(d.adbin, d.adrelid))
        INTO v_default_oid, v_default_ref, v_default_md5
      FROM pg_attrdef d
      JOIN pg_class c ON c.oid = d.adrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
      WHERE d.adrelid = cmd.objid AND a.attname = 'organization_id' AND NOT a.attisdropped;
      IF v_default_ref IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM (VALUES
             (1702067::oid,'admin.feature_docs','74188ac5336e8d3bf1a14eee28fc6297'),
             (3421071::oid,'context.system_context_item','74188ac5336e8d3bf1a14eee28fc6297'),
             (1700870::oid,'education.learn_doc','74188ac5336e8d3bf1a14eee28fc6297'),
             (1700228::oid,'platform.output_feedback','4f5b09b52e1a7f210b4c0d8b8bfa8cb9'),
             (1709788::oid,'seo.keyword','74188ac5336e8d3bf1a14eee28fc6297'),
             (1709833::oid,'seo.keyword_edge','74188ac5336e8d3bf1a14eee28fc6297'),
             (1709854::oid,'seo.keyword_market','74188ac5336e8d3bf1a14eee28fc6297'),
             (1709882::oid,'seo.keyword_topic','74188ac5336e8d3bf1a14eee28fc6297'),
             (1710180::oid,'seo.topic','74188ac5336e8d3bf1a14eee28fc6297')
           ) AS debt(attrdef_oid, object_ref, definition_md5)
           WHERE debt.attrdef_oid = v_default_oid
             AND debt.object_ref = v_default_ref AND debt.definition_md5 = v_default_md5
         ) THEN
        RAISE EXCEPTION 'ddl_guard: % adds or changes an organization_id default', v_default_ref
          USING HINT = 'Supply organization_id explicitly at every insert/RPC/job boundary. The nine frozen defaults are historical debt; no new identity or definition is allowed.',
                ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF cmd.command_tag NOT IN ('CREATE TABLE','ALTER TABLE') THEN CONTINUE; END IF;

    SELECT n.nspname, c.relname, c.relkind, c.relispartition
      INTO v_schema, v_rel, v_kind, v_ispart
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.oid = cmd.objid;
    IF v_rel IS NULL OR v_kind NOT IN ('r','p') OR v_ispart
       OR v_schema LIKE 'pg\_%' OR v_schema = ANY (c_exempt_schemas) THEN
      CONTINUE;
    END IF;

    -- ERROR lane (a): the column name `visibility` is RESERVED (access-architecture §2.4b)
    IF v_schema||'.'||v_rel <> ALL (c_vis_grandfather) AND EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = cmd.objid AND a.attname = 'visibility'
        AND NOT a.attisdropped AND a.atttypid <> 'platform.visibility'::regtype
    ) THEN
      RAISE EXCEPTION 'ddl_guard: %.% has a column named "visibility" that is not type platform.visibility', v_schema, v_rel
        USING HINT = 'The name is RESERVED for access visibility — a name-colliding column breaks the org RLS lane (the seo.competitor numeric-index incident). Rename the domain metric (e.g. serp_visibility) or use the platform.visibility enum.',
              ERRCODE = 'check_violation';
    END IF;

    -- ERROR lane (b): new project-FK as feature ownership (forbidden relationship shortcut)
    IF v_schema||'.'||v_rel <> ALL (c_proj_grandfather) AND EXISTS (
      SELECT 1 FROM pg_constraint fk
      WHERE fk.conrelid = cmd.objid AND fk.contype = 'f'
        AND fk.confrelid = to_regclass('workspace.projects')
        AND EXISTS (SELECT 1 FROM unnest(fk.conkey) k
                    JOIN pg_attribute a ON a.attrelid = fk.conrelid AND a.attnum = k
                    WHERE a.attname = 'project_id')
    ) THEN
      RAISE EXCEPTION 'ddl_guard: %.% adds a project_id FK to workspace.projects', v_schema, v_rel
        USING HINT = 'A feature table may not depend on a project FK for ownership/lifecycle/authorization. Project membership is an optional platform.associations edge between entity tokens (assoc_link); the feature must work with no project at all. (matrx-frontend CLAUDE.md, Forbidden relationship shortcuts.)',
              ERRCODE = 'check_violation';
    END IF;

    -- ERROR lane (d) MOVED, 2026-09-16 (table-provisioning wave 3).
    -- It lived here and it was wrong twice over. (1) It examined the COMMAND TAG
    -- `CREATE TABLE`, so `CREATE TABLE AS`, `SELECT INTO`, `PARTITION OF`, `LIKE`,
    -- materialised views and foreign tables all made a relation and all walked past.
    -- (2) It skipped itself whenever the GUC named below read back as '1' --
    -- and `matrx.provisioner` is a CUSTOM GUC that ANY caller of ANY role may set, so the "forced" path was
    -- cooperation (lessons ledger 15). It now lives in
    -- platform._provision_shape_guard (event trigger `provision_shape_guard`), which
    -- enumerates pg_event_trigger_ddl_commands() by object_type and proves the
    -- provisioner with a row keyed by txid that only the DEFINER setter can write.
    -- Do not re-add it here: two copies would disagree the first time one is edited.

    -- ERROR lane (e): NO NULL ORG at birth (owner ruling, 2026-08-21)
    -- "If something belongs to the system, that CANNOT EVER be represented by a
    --  NULL org! ... NO NULL ORG. the system has an org and this is
    --  well-established." (db-rules §2/§6e.)
    -- Hard block, and it costs nothing: platform.create_entity_table has never
    -- emitted a nullable organization_id, so no legitimate creation path can
    -- trip this. It exists because lane (d) only catches UNPROVISIONED
    -- entity-looking tables -- a provisioner-marked or already-registered
    -- CREATE could still have slipped a nullable org column through.
    IF cmd.command_tag = 'CREATE TABLE'
       AND EXISTS (SELECT 1 FROM pg_attribute a
                   WHERE a.attrelid = cmd.objid AND a.attname = 'organization_id'
                     AND NOT a.attisdropped AND NOT a.attnotnull)
       AND (EXISTS (SELECT 1 FROM platform.entity_types e
                    WHERE e.schema_name = v_schema AND e.table_name = v_rel)
            OR (SELECT count(*) FROM pg_attribute a
                WHERE a.attrelid = cmd.objid AND NOT a.attisdropped
                  AND a.attname IN ('created_by','created_at','updated_at','deleted_at','metadata','version','visibility')) >= 3) THEN
      RAISE EXCEPTION 'ddl_guard: %.% is born with a NULLABLE organization_id', v_schema, v_rel
        USING HINT = 'Declare organization_id uuid NOT NULL REFERENCES iam.organizations(id). The initiating operation must provide its organization_id explicitly; no resolver, default, trigger, backstop, or assignment may choose it.',
              ERRCODE = 'check_violation';
    END IF;

    -- ERROR lane (g) [no_new_public_tables]: NEW relations only (table-provisioning W0-2).
    -- Doctrine §7 — `public` keeps functions and RPCs, never tables. This was the WARN
    -- lane from 2026-08-15 to 2026-09-15. All 19 rows it ever wrote were ad-hoc probe or
    -- scratch tables from rehearsals; 18 of the 19 objects no longer exist. The warning
    -- recorded a line, it never held one. Flipped to ERROR in the same migration that
    -- takes CREATE on schema public away from PUBLIC (and so from anon, authenticated
    -- and service_role, which held it only through PUBLIC).
    -- NEW relations only: an ALTER on one of the relations already in public is untouched,
    -- and a partition child was already skipped above.
    IF cmd.command_tag = 'CREATE TABLE' AND v_schema = 'public' THEN
      RAISE EXCEPTION 'ddl_guard: %.% is a NEW table in schema public', v_schema, v_rel
        USING HINT = 'Doctrine §7: public keeps functions and RPCs, never tables. THE SANCTIONED PATH is platform.create_entity_table(...) naming the FEATURE schema this table belongs to (db-rules §2) — it builds columns + registry + triggers + RLS in one transaction and rolls back on any gate FAIL. A scratch or probe relation belongs in a TEMP table (create temp table …), which this lane never sees. Relations already in public are untouched; this refuses NEW tables only.',
              ERRCODE = 'check_violation';
    END IF;

    -- LOG lane — may NEVER abort DDL (severities: error | warn | notice)
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_attribute a
                 WHERE a.attrelid = cmd.objid AND NOT a.attisdropped
                   AND ((a.attname IN ('is_deleted','deleted') AND a.atttypid = 'boolean'::regtype)
                     OR (a.attname = 'is_public' AND a.atttypid = 'boolean'::regtype)
                     OR a.attname = 'org_id')) THEN
        INSERT INTO platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
        VALUES ('warn','kill_list_columns', v_schema||'.'||v_rel, cmd.command_tag,
                'Kill-list column present (is_deleted/is_public boolean, org_id). Canonical: deleted_at timestamptz, visibility enum, organization_id. (db-rules §2.)');
        RAISE WARNING 'ddl_guard[kill_list_columns]: %.% carries a kill-list column — use deleted_at / visibility / organization_id.', v_schema, v_rel;
      END IF;

      IF cmd.command_tag = 'CREATE TABLE'
         AND (SELECT count(*) FROM pg_constraint fk
              WHERE fk.conrelid = cmd.objid AND fk.contype = 'f'
                AND EXISTS (SELECT 1 FROM platform.entity_types e
                            WHERE e.is_active AND e.table_ref = fk.confrelid)) >= 2
         AND NOT EXISTS (SELECT 1 FROM pg_attribute a
                         WHERE a.attrelid = cmd.objid AND a.attname = 'created_at' AND NOT a.attisdropped) THEN
        INSERT INTO platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
        VALUES ('warn','junction_table', v_schema||'.'||v_rel, cmd.command_tag,
                'Looks like an x_y junction (>=2 entity FKs, no lifecycle columns). A new junction table is a bug — anything-to-anything is a row in platform.associations (assoc_link). (db-rules §3.)');
        RAISE WARNING 'ddl_guard[junction_table]: %.% looks like a junction table — use platform.associations instead.', v_schema, v_rel;
      END IF;


      -- RED: an ALTER that LEAVES organization_id nullable on an entity-looking
      -- table. Logged at severity 'error' and screamed, never aborted -- the
      -- grandfathered backlog above is owned by the nullable-org-columns ratchet
      -- (matrx-frontend scripts/canonical-ratchets), which BLOCKS on growth.
      IF cmd.command_tag = 'ALTER TABLE'
         AND v_schema||'.'||v_rel <> ALL (c_nullorg_grandfather)
         AND EXISTS (SELECT 1 FROM pg_attribute a
                     WHERE a.attrelid = cmd.objid AND a.attname = 'organization_id'
                       AND NOT a.attisdropped AND NOT a.attnotnull)
         AND (EXISTS (SELECT 1 FROM platform.entity_types e
                      WHERE e.schema_name = v_schema AND e.table_name = v_rel)
              OR (SELECT count(*) FROM pg_attribute a
                  WHERE a.attrelid = cmd.objid AND NOT a.attisdropped
                    AND a.attname IN ('created_by','created_at','updated_at','deleted_at','metadata','version','visibility')) >= 3) THEN
        INSERT INTO platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
        VALUES ('error','nullable_org', v_schema||'.'||v_rel, cmd.command_tag,
                'NO NULL ORG (owner ruling 2026-08-21): this entity-looking table still allows organization_id IS NULL. Declare organization_id NOT NULL. The initiating operation must provide its organization_id explicitly; no resolver, default, trigger, backstop, or assignment may choose it. (db-rules §2/§6e.)');
        RAISE WARNING 'ddl_guard[nullable_org]: %.% still allows a NULL organization_id — NO NULL ORG (db-rules §2/§6e).', v_schema, v_rel;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- the WARN lane may NEVER abort DDL; scream that the guard itself is sick
      RAISE WARNING 'ddl_guard: warn-lane internal error (%) — guard needs repair, DDL allowed', SQLERRM;
    END;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION platform._entity_types_class_regenerates()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.data_class is not distinct from old.data_class then return new; end if;
  if new.rls_variant in ('component','ledger') then return new; end if;
  if not new.is_active then return new; end if;
  if to_regclass(format('%I.%I', new.schema_name, new.table_name)) is null then return new; end if;
  -- A regeneration inside the provisioner's own window would be a second one on a table it is
  -- still building; create_entity_table calls apply_rls itself, right after.
  if platform.is_provisioning() then return new; end if;  -- wave 3: a proof only the provisioner can write, never the forgeable `matrx.provisioner` GUC
  -- DD-163 (2026-09-12): iam.apply_rls refuses machinery by construction, so regenerating here is
  -- not something this trigger can do — and raising instead meant a machinery token's class could
  -- never be corrected. Say so; never pretend the policies moved.
  if new.audit_class = 'machinery' then
    raise notice 'DD-163: % changed class % -> %, and its policies were NOT regenerated: audit_class is machinery and iam.apply_rls refuses machinery by construction (db-rules §1). The class regime now SEES this table correctly; its policies remain the bespoke set its own feature wrote.',
      new.token, old.data_class, new.data_class;
    return new;
  end if;

  raise notice 'DD-137b: % changed class %s -> %s; regenerating its policies in this commit',
    new.token, old.data_class, new.data_class;
  perform iam.apply_rls(new.schema_name, new.table_name, new.token, new.rls_variant);
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION platform._entity_types_classify_default()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- 🚨 0775 — `detail` IS A LEGAL rls_variant CHECK VALUE (0773) WITH NO RUNTIME
  -- TREATMENT. iam._apply_rls_unchecked, iam.class_lanes and this function all key
  -- their component handling on the LITERAL string 'component', not a synonym set,
  -- and platform.create_entity_table's own p_variant allow-list does not include
  -- 'detail' at all. Registering a table with rls_variant='detail' today would
  -- either hard-fail in apply_rls (missing created_by/organization_id) or, worse,
  -- silently resolve the WRONG data_class in iam.class_lanes (own class instead of
  -- the parent's, contradicting DD-137b10). The provisioner (platform.provision_apply,
  -- 0756) already does the right thing — it maps spec `detail` to registered
  -- rls_variant='component' — so this refusal costs it nothing. It exists to stop a
  -- future hand-written INSERT or edit from registering the literal word before
  -- iam._apply_rls_unchecked, iam.class_lanes, platform._entity_types_classify_default,
  -- platform.create_entity_table and matrx-frontend's
  -- scripts/access-matrix/check-component-created-by.ts census are all taught it.
  if new.rls_variant = 'detail' then
    raise exception
      'platform.entity_types: rls_variant=''detail'' is not yet supported. The word is a legal '
      'CHECK value (0773) but iam._apply_rls_unchecked, iam.class_lanes and this trigger all still '
      'key their component treatment on the literal string ''component'' — a ''detail'' row would '
      'either hard-fail RLS generation or silently resolve the wrong data_class. Use rls_variant='
      '''component'' (what platform.provision_apply already registers for spec type ''detail'') '
      'until those functions, platform.create_entity_table''s variant allow-list, and matrx-frontend''s '
      'check-component-created-by.ts census are updated together. See db/migrations/'
      '0775_detail_is_not_yet_component_refuse_the_literal_word.sql.'
      using errcode = '23514';
  end if;

  if new.rls_variant = 'component' then
    -- A component's access IS its parent's (db-rules §6d-1); it holds no class of its own.
    new.data_class := null; new.default_list_scope := null; new.data_class_reason := null;
    return new;
  end if;
  if new.rls_variant = 'ledger' then
    -- DD-137b10: a ledger has NO composition parent, so "ask the parent" has nothing to ask and an
    -- unset class would have to be guessed. It keeps the class it was registered with, and
    -- `default_list_scope` stays NULL because a ledger row has a position, not a "mine".
    -- (Before 2026-09-12 this branch nulled the class too, so every new ledger was born FAILing
    --  iam.verify_canonical's data_class_set check with nothing to tell anyone why. DD-159.)
    new.default_list_scope := null;
    if new.data_class is null then
      new.data_class := platform.derive_data_class(new.rls_variant, new.default_visibility::text);
      new.data_class_reason := coalesce(new.data_class_reason,
        'Born unclassified and derived by platform.derive_data_class. A ledger must STATE its class '
        '(DD-137b10) — reclassify deliberately.');
    end if;
    return new;
  end if;
  if new.data_class is null then
    new.data_class := platform.derive_data_class(new.rls_variant, new.default_visibility::text);
    new.data_class_reason := coalesce(new.data_class_reason, format(
      'Born unclassified and derived by platform.derive_data_class from rls_variant=%s, '
      'default_visibility=%s. Reclassify deliberately if this table is not what its birth flags '
      'say it is — a derived class is a description, not a decision.',
      new.rls_variant, coalesce(new.default_visibility::text, 'unset')));
  end if;
  if new.default_list_scope is null then
    new.default_list_scope := platform.derive_list_scope(new.rls_variant, new.data_class);
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION platform._metadata_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'auth', 'platform'
AS $function$
declare
  v_role  text := auth.role();
  v_token text;
  v_new   jsonb := coalesce(new.metadata, '{}'::jsonb);
  v_old   jsonb := '{}'::jsonb;
  k       text;
begin
  -- service_role, postgres, the migration runner: not a client, not guarded.
  if v_role is distinct from 'anon' and v_role is distinct from 'authenticated' then
    return new;
  end if;
  -- the provisioner's cooperation marker (platform.create_entity_table).
  if platform.is_provisioning() then  -- wave 3: a proof only the provisioner can write, never the forgeable `matrx.provisioner` GUC
    return new;
  end if;

  if jsonb_typeof(v_new) <> 'object' then
    raise exception 'matrx_validation_gate: %.%.metadata must be a JSON object (got %) — metadata is system-owned and holds keyed system state, never a scalar or an array',
      tg_table_schema, tg_table_name, jsonb_typeof(v_new)
      using errcode = '42501';
  end if;

  v_token := nullif(tg_argv[0], '');
  if v_token is null then
    select e.token into v_token from platform.entity_types e where e.table_ref = tg_relid limit 1;
  end if;

  if tg_op = 'UPDATE' then
    v_old := coalesce(old.metadata, '{}'::jsonb);
    if jsonb_typeof(v_old) <> 'object' then v_old := '{}'::jsonb; end if;
  end if;

  for k in select jsonb_object_keys(v_new) loop
    -- only keys this write actually CHANGES are judged; untouched legacy keys survive.
    continue when tg_op = 'UPDATE' and (v_new -> k) is not distinct from (v_old -> k);
    if not exists (
      select 1 from platform.metadata_reserved_keys r
       where r.key = k and r.table_token in ('*', coalesce(v_token, ''))
    ) then
      raise exception 'matrx_validation_gate: metadata key "%" is not system-owned state on %.% — the metadata column belongs to the platform, never to user content. Put this in a real column on the table (or in custom_fields), not in metadata.',
        k, tg_table_schema, tg_table_name
        using errcode = '42501',
              hint = 'AI Matrx Data Doctrine §3.2/§4.4 (DD-060). If this key really is system state the server stamps, the server writes it with the service role (which bypasses this guard) or it is registered in platform.metadata_reserved_keys with a reason.';
    end if;
  end loop;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.create_entity_table(p_schema text, p_table text, p_token text, p_label text, p_fields text[], p_variant text, p_versioned boolean, p_soft_delete boolean, p_visibility text, p_category boolean, p_listed boolean, p_org_default boolean, p_gin_jsonb boolean, p_parents text[] DEFAULT NULL::text[], p_data_class platform.data_class DEFAULT NULL::platform.data_class, p_default_list_scope platform.list_scope DEFAULT NULL::platform.list_scope)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_cols text; v_f text; v_colname text; v_fails text; v_has_vis boolean;
  v_parent text; v_parent_token text; v_fk_column text;
BEGIN
  IF p_org_default THEN
    RAISE EXCEPTION 'create_entity_table: p_org_default=true is forbidden'
      USING HINT = 'Supply organization_id explicitly in every writer; migrate this caller to p_org_default => false before provisioning the table.';
  END IF;

  PERFORM set_config('matrx.provisioner', '1', true);
  PERFORM platform.provision_marker_set(true);   -- wave 3: the proof the guards actually read

  IF to_regclass(format('%I.%I',p_schema,p_table)) IS NOT NULL THEN
    RAISE EXCEPTION 'create_entity_table: %.% already exists', p_schema, p_table; END IF;
  IF p_variant NOT IN ('entity','component','ledger','system','restricted','personal') THEN
    RAISE EXCEPTION 'create_entity_table: invalid variant %', p_variant; END IF;

  IF (p_data_class IS NULL) <> (p_default_list_scope IS NULL) THEN RAISE EXCEPTION 'create_entity_table: p_data_class and p_default_list_scope must be supplied together'; END IF;
  IF p_variant='restricted' AND (p_data_class IS NULL OR p_default_list_scope IS NULL) THEN RAISE EXCEPTION 'create_entity_table: restricted variant requires explicit p_data_class and p_default_list_scope'; END IF;
  v_has_vis := (p_visibility <> 'none');
  IF v_has_vis THEN PERFORM p_visibility::platform.visibility; END IF;   -- validates the value
  IF p_variant='restricted' AND p_visibility IS DISTINCT FROM 'none' THEN RAISE EXCEPTION 'create_entity_table: restricted variant requires p_visibility => ''none'''; END IF;
  IF p_variant='system' AND NOT v_has_vis THEN
    RAISE EXCEPTION 'create_entity_table: system variant requires a visibility value (not ''none'')'; END IF;
  IF p_variant='component' AND v_has_vis THEN
    RAISE EXCEPTION 'create_entity_table: component % must not have visibility (pass p_visibility => ''none''); a component''s access is its parent''s', p_token;
  END IF;

  IF p_variant='component' AND COALESCE(array_length(p_parents,1),0) = 0 THEN
    RAISE EXCEPTION 'create_entity_table: component % requires p_parents (entries shaped ''parent_token:fk_column'')', p_token;
  END IF;
  IF p_variant<>'component' AND COALESCE(array_length(p_parents,1),0) > 0 THEN
    RAISE EXCEPTION 'create_entity_table: p_parents declares composition parents and is only valid for p_variant=''component'' (got %)', p_variant;
  END IF;

  FOREACH v_f IN ARRAY COALESCE(p_fields,'{}') LOOP
    v_colname := lower(split_part(btrim(v_f),' ',1));
    IF v_colname IN ('id','organization_id','created_by','updated_by','created_at','updated_at',
                     'deleted_at','version','metadata','visibility','category_id') THEN
      RAISE EXCEPTION 'create_entity_table: custom field "%" collides with a base column', v_colname; END IF;
  END LOOP;

  v_cols := 'id uuid PRIMARY KEY DEFAULT gen_random_uuid()';
  FOREACH v_f IN ARRAY COALESCE(p_fields,'{}') LOOP v_cols := v_cols || ', ' || v_f; END LOOP;
  v_cols := v_cols || ', organization_id uuid NOT NULL REFERENCES iam.organizations(id)';
  v_cols := v_cols || ', created_by uuid REFERENCES auth.users(id)';
  v_cols := v_cols || ', updated_by uuid REFERENCES auth.users(id)';
  v_cols := v_cols || ', created_at timestamptz NOT NULL DEFAULT now()';
  v_cols := v_cols || ', updated_at timestamptz NOT NULL DEFAULT now()';
  IF p_soft_delete THEN v_cols := v_cols || ', deleted_at timestamptz'; END IF;
  v_cols := v_cols || ', version integer NOT NULL DEFAULT 1';
  v_cols := v_cols || ', metadata jsonb NOT NULL DEFAULT ''{}''::jsonb';
  IF v_has_vis THEN
    v_cols := v_cols || format(', visibility platform.visibility NOT NULL DEFAULT %L::platform.visibility', p_visibility);
  END IF;
  IF p_category THEN v_cols := v_cols || ', category_id uuid REFERENCES platform.categories(id)'; END IF;

  EXECUTE format('CREATE TABLE %I.%I (%s)', p_schema, p_table, v_cols);

  EXECUTE format('CREATE INDEX ON %I.%I (organization_id)', p_schema, p_table);
  EXECUTE format('CREATE INDEX ON %I.%I (created_by)', p_schema, p_table);
  IF p_category THEN EXECUTE format('CREATE INDEX ON %I.%I (category_id)', p_schema, p_table); END IF;
  IF p_gin_jsonb THEN
    FOREACH v_f IN ARRAY COALESCE(p_fields,'{}') LOOP
      IF v_f ~* '\yjsonb\y' THEN
        v_colname := split_part(btrim(v_f),' ',1);
        EXECUTE format('CREATE INDEX ON %I.%I USING gin (%I)', p_schema, p_table, v_colname);
      END IF;
    END LOOP;
  END IF;

  -- 2026-09-12 (qd_000): a `private` class closes the platform-admin lane by definition
  -- (verify_canonical §3.1 derivation two), so the row is born with the lane suppressed —
  -- previously only `restricted` was, and every private ENTITY failed its own certification.
  -- 2026-09-15 (0720): coalesce(...,false) — p_data_class is NULL for every component and
  -- ledger, and (false OR NULL) is NULL, which this NOT NULL column answered with a bare 23502.
  INSERT INTO platform.entity_types(
    token,schema_name,table_name,label,is_versioned,has_soft_delete,is_component,is_listed,
    default_visibility,rls_variant,table_ref,is_active,data_class,default_list_scope,suppress_platform_admin_lane)
  VALUES (p_token,p_schema,p_table,p_label,p_versioned,p_soft_delete,(p_variant='component'),p_listed,
    CASE WHEN v_has_vis THEN p_visibility::platform.visibility ELSE NULL END,
    p_variant, format('%I.%I',p_schema,p_table)::regclass, true,p_data_class,p_default_list_scope,
    coalesce(p_variant='restricted' OR p_data_class = 'private', false));

  IF COALESCE(array_length(p_parents,1),0) > 0 THEN
    FOREACH v_parent IN ARRAY p_parents LOOP
      v_parent_token := btrim(split_part(v_parent, ':', 1));
      v_fk_column    := btrim(split_part(v_parent, ':', 2));
      IF v_parent_token = '' OR v_fk_column = '' OR strpos(v_parent, ':') = 0 THEN
        RAISE EXCEPTION 'create_entity_table: p_parents entry "%" is not shaped ''parent_token:fk_column''', v_parent;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM platform.entity_types et WHERE et.token = v_parent_token) THEN
        RAISE EXCEPTION 'create_entity_table: p_parents entry "%" names unknown parent token %', v_parent, v_parent_token;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
         WHERE c.table_schema = p_schema AND c.table_name = p_table AND c.column_name = v_fk_column
      ) THEN
        RAISE EXCEPTION 'create_entity_table: p_parents entry "%" names column % which %.% does not have',
          v_parent, v_fk_column, p_schema, p_table;
      END IF;
      INSERT INTO platform.entity_relationships(child_type,parent_type,fk_column,kind)
      VALUES (p_token, v_parent_token, v_fk_column, 'composition');
    END LOOP;
  END IF;

  EXECUTE format('CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor()', p_schema,p_table);
  -- 🚨 B-77 (2026-09-13) — THE ONE SANCTIONED BUILDER COULD NOT BUILD AN ENTITY TABLE.
  -- `platform._admit_entity_type_attaches_carrier` fires on the INSERT into platform.entity_types
  -- eleven lines above and attaches _stamp_actor_tier itself for the entity and component
  -- variants. This line then created it a SECOND time and Postgres answered 42710 — so every
  -- `entity`/`system` call to this function raised, and the only path platform._ddl_guard admits
  -- for a new canonical table was closed. Found by DD-185's forcing test, which could not build
  -- its probe. (`ledger` was unaffected, which is why nothing noticed: the admission trigger
  -- returns early for that variant.)
  -- The test is BY FUNCTION, never by name — the same lesson DD-173 paid for when a by-name drop
  -- missed platform.change_type_default carrying _touch_row() under the name _touch.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = format('%I.%I', p_schema, p_table)::regclass AND NOT t.tgisinternal
       AND t.tgfoid = 'platform._stamp_actor_tier()'::regprocedure
  ) THEN
    EXECUTE format('CREATE TRIGGER _stamp_actor_tier BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor_tier()', p_schema,p_table);
  END IF;
  EXECUTE format('CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform._touch_row()', p_schema,p_table);
  IF p_versioned THEN
    EXECUTE format('CREATE TRIGGER _version_capture AFTER INSERT OR DELETE OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform._version_capture(%L)', p_schema,p_table,p_token);
  END IF;

  EXECUTE format('CREATE TRIGGER _metadata_guard BEFORE INSERT OR UPDATE OF metadata ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform._metadata_guard(%L)', p_schema,p_table,p_token);

  PERFORM platform.sync_association_gc_triggers(p_token);

  PERFORM iam.apply_rls(p_schema,p_table,p_token,p_variant);

  SELECT string_agg(check_name||COALESCE(': '||detail,''), '; ')
    INTO v_fails FROM iam.verify_canonical(p_schema,p_table,p_token) WHERE status='FAIL';
  IF v_fails IS NOT NULL THEN
    RAISE EXCEPTION 'create_entity_table: %.% failed canonical verify: %', p_schema,p_table,v_fails; END IF;

  PERFORM set_config('matrx.provisioner', '0', true);
  PERFORM platform.provision_marker_set(false);
  RETURN format('%s.%s created + canonical (variant=%s versioned=%s soft_delete=%s visibility=%s category=%s listed=%s parents=%s)',
                p_schema,p_table,p_variant,p_versioned,p_soft_delete,p_visibility,p_category,p_listed,
                COALESCE(array_to_string(p_parents,','),'none'));
END; $function$;

CREATE OR REPLACE FUNCTION platform.rebuild_reachability()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_count bigint;
BEGIN
  -- Serialises rebuilds against each other and nothing else. Held to transaction end.
  PERFORM pg_advisory_xact_lock(hashtextextended('platform.reachability:rebuild', 0));
  -- DELETE, not TRUNCATE: ROW EXCLUSIVE instead of ACCESS EXCLUSIVE. See the header —
  -- a TRUNCATE here closed the platform's hottest read table for 77 s on 2026-09-15.
  DELETE FROM platform.reachability;
  INSERT INTO platform.reachability (container_type, container_id, item_type, item_id, depth, max_level)
  SELECT c.container_type, c.container_id, d.item_type, d.item_id, d.depth, d.max_level
  FROM (SELECT DISTINCT container_type, container_id FROM platform.containment_edges) c
  CROSS JOIN LATERAL platform.derive_reachability(c.container_type, c.container_id) d;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $function$;

-- ------------------------------------------------------------------
-- and back on, with a proof rather than a promise.
ALTER TABLE platform.provision_shape_debt ENABLE TRIGGER provision_shape_settled;

do $mig$
begin
  if not exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'platform.provision_shape_debt'::regclass
       and t.tgname  = 'provision_shape_settled'
       and t.tgenabled <> 'D')
  then
    raise exception 'w0_sync: provision_shape_settled is still DISABLED at the end of this file. The branch would carry a switched-off guard and this must not be ledgered.';
  end if;
end $mig$;
-- ------------------------------------------------------------------
