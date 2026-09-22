-- target: branch,production
-- additive: yes
--   It ADDS four function OVERLOADS under this lane's own names —
--   `custom.history_restore_body`, `custom.io_restore`, `custom.record_restore_version`
--   and `custom.value_restore`, each taking one more argument than the form that exists —
--   and their `platform.client_callable_door` rows. Nothing is replaced, dropped or
--   revoked; every existing three- and four-argument call resolves exactly as it does
--   today, because each new signature takes a DIFFERENT number of arguments and carries no
--   default, so no call is made ambiguous. No table, column, trigger, policy or enum is
--   touched and no row is rewritten.
--   The inverse is `migrations/inverse/histscreens_a_restore_says_who_did_it_down.sql`.
-- guard: custom/system_enabled
--
-- LANE HISTORY-SCREENS — a defect found by running the AGENT's restore against the real
-- store and reading the version it produced.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- AN AGENT PUT A VALUE BACK AND THE RECORD SAID THE PERSON DID IT.
-- ════════════════════════════════════════════════════════════════════════════════
--
-- MEASURED on the main database, 2026-09-20, through `matrx_records`' own tool dispatch as
-- an agent acting for test@test.com. The agent's EDIT came back
-- `{"kind": "agent", "on_behalf_of": "…"}`, correctly. The agent's RESTORE came back
-- `{"kind": "user", "name": "test", "on_behalf_of": null}` — the same act, attributed to
-- the person who asked for it rather than to the machine that did it.
--
-- WHY. `custom._value_envelope` takes the author from the document's own `_actor` /
-- `_on_behalf_of` keys and falls back to the connection's declaration when the document is
-- silent. The restore doors build the document themselves — the target version's values,
-- with the envelope stripped — so it is ALWAYS silent, and the fallback decides. That
-- fallback is AMBIENT: it depends on a GUC landing at the right transaction boundary, and
-- when it does not the write still succeeds, stamped `user`. `matrx_records`'
-- `_declare_author` records that exact failure being found on 2026-09-18 for ordinary
-- writes and fixed by putting the author IN the document; the restore doors are the same
-- shape and were built without it.
--
-- AGT-N-4 is precisely the rule this breaks: an agent carries the exact authority of the
-- person operating it AND is never hidden behind them. A restore recorded as the person's
-- own edit is the platform's own history telling a lie about who acted — on the one screen
-- whose entire job is answering "who changed this".
--
-- THE FIX. Each door gains a form that takes the author and merges it into the body it is
-- about to write, so `custom._value_envelope` reads it from the document exactly as it
-- does for every other agent write and applies every check it always has — including the
-- one that REFUSES an agent naming nobody. Nothing is ambient any more for a caller that
-- knows who it is.
--
-- The existing forms are untouched and stay the right call for a browser, where the
-- session's own principal IS the author and there is nothing to declare.

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.history_restore_body — the same body, with the author in it.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.history_restore_body(p_current jsonb, p_target jsonb,
                                            p_field_key text, p_author jsonb)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $$
  -- `_actor` and `_on_behalf_of` are the ONLY keys taken from the author: anything else a
  -- caller put in that object is not authorship and has no business in somebody's record.
  -- `custom.actor_word` is still the judge of the word itself, at the trigger, where that
  -- judgement belongs.
  select custom.history_restore_body(p_current, p_target, p_field_key)
         || coalesce(
              (case when jsonb_typeof(p_author) = 'object'
                    then (case when p_author ? '_actor'
                               then jsonb_build_object('_actor', p_author -> '_actor')
                               else '{}'::jsonb end)
                         || (case when p_author ? '_on_behalf_of'
                                  then jsonb_build_object('_on_behalf_of', p_author -> '_on_behalf_of')
                                  else '{}'::jsonb end)
                    else '{}'::jsonb end),
              '{}'::jsonb);
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'history_restore_body',
        'p_current jsonb, p_target jsonb, p_field_key text, p_author jsonb',
        array['jsonb'::regtype, 'jsonb'::regtype, 'text'::regtype, 'jsonb'::regtype]::oid[],
        'It names no organization and no record and takes no decision, because it reaches nothing: it is a pure function of two documents its caller has already been admitted to both read and change, plus the two authorship keys. It writes nothing, reads nothing and executes nothing from any of them; the author word it copies is judged by custom.actor_word at the write, which refuses an unknown word and refuses an agent that names nobody.',
        'histscreens_a_restore_says_who_did_it.sql',
        'server_only: it is the shared half of the restore doors, so the sentence a person is shown and the write that follows it are computed by one body. A client holding both documents already holds the answer.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.io_restore — the same restore, saying who did it.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.io_restore(p_organization_id uuid, p_record_id uuid,
                                  p_version integer, p_author jsonb)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_user    uuid := custom.query_principal();
  v_target  jsonb;
  v_current jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_restore');
  if not custom.has_visibility(v_user, 'record', p_record_id, 'editor'::public.permission_level) then
    raise exception 'You may not restore this record to an earlier version.'
      using errcode = '42501',
            hint = 'Restoring rewrites every value on the record, so it needs the editor level — the same level that lets you change one of them by hand.';
  end if;
  if p_version is null then
    raise exception 'custom.io_restore: name the version to restore. custom.record_history(organization, record) lists them with who changed what.'
      using errcode = '22004';
  end if;

  select v.row_data -> 'data' into v_target
    from history.row_versions v
   where v.entity_type = 'custom.record'
     and v.organization_id = p_organization_id
     and v.row_id = p_record_id
     and v.version = p_version
   order by v.occurred_at desc, v.id desc
   limit 1;

  if v_target is null then
    raise exception 'There is no saved version % of this to go back to.', p_version
      using errcode = '02000',
            hint = 'The saved versions are listed by custom.record_history(organization, record). Value history older than this table''s retention may have been pruned — the two most recent are always kept.';
  end if;

  select r.data into v_current
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  return custom.record_update(p_organization_id, p_record_id,
                              custom.history_restore_body(v_current, v_target, null, p_author));
end;
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'io_restore',
        'p_organization_id uuid, p_record_id uuid, p_version integer, p_author jsonb',
        array['uuid'::regtype, 'uuid'::regtype, 'int4'::regtype, 'jsonb'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door on entry. p_record_id is checked by custom.has_visibility at the EDITOR rung, so another tenant''s record reads as absent. p_version is matched together with the organization and the record id. p_author contributes only _actor and _on_behalf_of, both judged at the write by custom.actor_word and custom._value_envelope, which refuse an unknown word, refuse an agent naming nobody and refuse an on-behalf-of from anything that is not an agent.',
        'histscreens_a_restore_says_who_did_it.sql',
        'server_only: a BROWSER never needs it — the session''s own principal IS the author there, which is exactly what the three-argument form uses. This form exists for the SERVER lane, where an agent acts for a person and the connection''s ambient declaration is the thing that cannot be trusted. Letting a client name its own author would let a signed-in person write history under somebody else''s name.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.record_restore_version and custom.value_restore — the same two verbs,
-- saying who did it.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.record_restore_version(p_organization_id uuid, p_record_id uuid,
                                              p_version integer, p_author jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_preview jsonb;
  v_new     integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_restore_version');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_restore_version');
  v_preview := custom.record_restore_preview(p_organization_id, p_record_id, p_version, null);
  v_new := custom.io_restore(p_organization_id, p_record_id, p_version, p_author);
  return jsonb_build_object(
    'record_id', p_record_id,
    'restored_from_version', p_version,
    'version', v_new,
    'changed', v_preview -> 'changes',
    'count', v_preview -> 'count',
    'history_rewritten', false);
end;
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'record_restore_version',
        'p_organization_id uuid, p_record_id uuid, p_version integer, p_author jsonb',
        array['uuid'::regtype, 'uuid'::regtype, 'int4'::regtype, 'jsonb'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door and custom.assert_client_may_reach on entry. p_record_id takes the EDITOR decision twice, in custom.record_restore_preview and again in custom.io_restore, both against THIS organization. p_version is matched together with the organization and the record id. p_author contributes only _actor and _on_behalf_of and is judged at the write by custom._value_envelope.',
        'histscreens_a_restore_says_who_did_it.sql',
        'server_only: a browser''s session IS the author, which the three-argument form already uses. This form exists for the SERVER lane, where an agent acts for a person; a client that could name its own author could write history under somebody else''s name.',
        false, false)
on conflict do nothing;

create or replace function custom.value_restore(p_organization_id uuid, p_record_id uuid,
                                     p_field_key text, p_version integer, p_author jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_preview jsonb;
  v_target  jsonb;
  v_current jsonb;
  v_new     integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.value_restore');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.value_restore');
  if coalesce(btrim(coalesce(p_field_key, '')), '') = '' then
    raise exception 'custom.value_restore: name the column to put back.'
      using errcode = '22004',
            hint = 'custom.record_history(organization, record) names the column on every change it lists.';
  end if;

  v_preview := custom.record_restore_preview(p_organization_id, p_record_id, p_version,
                                             p_field_key);

  select v.row_data -> 'data' into v_target
    from history.row_versions v
   where v.entity_type = 'custom.record'
     and v.organization_id = p_organization_id
     and v.row_id = p_record_id
     and v.version = p_version
   order by v.occurred_at desc, v.id desc
   limit 1;

  select r.data into v_current
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  v_new := custom.record_update(
             p_organization_id, p_record_id,
             custom.history_restore_body(v_current, v_target, p_field_key, p_author));

  return jsonb_build_object(
    'record_id', p_record_id,
    'field_key', p_field_key,
    'restored_from_version', p_version,
    'version', v_new,
    'changed', v_preview -> 'changes',
    'count', v_preview -> 'count',
    'history_rewritten', false);
end;
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'value_restore',
        'p_organization_id uuid, p_record_id uuid, p_field_key text, p_version integer, p_author jsonb',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'int4'::regtype,
              'jsonb'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door and custom.assert_client_may_reach on entry. p_record_id takes the EDITOR decision in custom.record_restore_preview and again in custom.record_update, both against THIS organization. p_version is matched together with the organization and the record id. p_field_key is a jsonb key written through custom.record_update, which refuses a key that names no declared Field, by name. p_author contributes only _actor and _on_behalf_of and is judged at the write by custom._value_envelope.',
        'histscreens_a_restore_says_who_did_it.sql',
        'server_only: a browser''s session IS the author, which the four-argument form already uses. This form exists for the SERVER lane, where an agent acts for a person; a client that could name its own author could write history under somebody else''s name.',
        false, false)
on conflict do nothing;
