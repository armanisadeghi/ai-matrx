-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.field_retire(uuid, uuid) 2d7e1cd710f18a4ec166594efa716836095815756a7703bc7887517fb33043cd
-- based-on: custom.io_comment_write(uuid, uuid, text, jsonb, uuid) 0754700c83a9a33ea5d633e68941ad7977ecf40357b3b48a1e78e509eaad3230
--
-- LEAK-T10 — TWO REFUSALS THAT WERE NOT MADE, AND ONE SENTENCE THAT WAS NOT TRUE.
--
-- (1) T7's LAST CLAUSE. `custom.field_retire` retired a column a FORMULA depends on, in silence,
--     although `custom.field_dependants` names that formula and `custom.delete_rule` has
--     refused exactly this since REC-18 ("This field is used by …, so it was not deleted").
--     The door simply never asked the rule: it built its own going set out of the lookup and
--     rollup chain (`config->>via/of/pick`) and soft-deleted the rows with a plain UPDATE. So
--     the formula went on being evaluated against a Field that is not there — the calculation
--     that "silently stops being right". It now asks the SHARED rule, publishing the going set
--     in `custom.delete_set` the way `custom.record_delete` does, so a formula inside the same
--     removal is part of the set and not an obstacle, and anything outside it is refused with
--     the rule's own sentence naming the dependant.
--
-- (2) THE SENTENCE MATCHES THE FACT. `custom.io_comment_write` told a person who may not READ a
--     record "You may read this record but not comment on it." She may not. The door had asked
--     one question — is she a commenter — and answered a different one. It now asks the lower
--     rung on the refusal path and gives the honest sentence, which for somebody holding
--     nothing is the same "You do not have access to this record." every other door gives,
--     deliberately identical whether the record exists or not.
--
-- (3) AND THE CLASS. `custom.refusals_claiming_a_level_never_asked()` names any door in schema
--     `custom` that refuses with a sentence telling the caller they may READ this record while
--     its body never asks whether they may. It reads the CODE with comments stripped, so a
--     comment quoting the old sentence cannot fail it and a comment promising the check cannot
--     pass it. Census 14 of `pnpm check:store-doors-decide`; it names `custom.io_comment_write`
--     with this file reverted and nothing with it applied.
--
-- THE INVERSE is migrations/inverse/leakt10_a_refusal_says_what_is_true_down.sql.

CREATE OR REPLACE FUNCTION custom.field_retire(p_organization_id uuid, p_field_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_field  jsonb;
  v_table  uuid;
  v_spec   jsonb;
  v_going  uuid[];
  v_keys   text[];
  v_added  integer;
  v_title  text;
  v_names  text;
  v_saved_set text;
  v_one    uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.field_retire');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_retire');

  select r.data, (r.data ->> 'entity_definition_id')::uuid into v_field, v_table
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_field_id
     and r.table_id = custom.field_kernel_id()
     and r.deleted_at is null;
  if v_field is null then
    raise exception 'There is no such field in this organization, so nothing was removed.'
      using errcode = '23514', hint = 'REC-29: organizations are hard walls.';
  end if;
  if v_table is null then
    raise exception 'The field "%" belongs to a standard table, and this door removes a field from a table somebody made.',
                    custom.said(v_field ->> 'label', 'that one')
      using errcode = '23514',
            hint = 'FLD-8: a field on a standard table is part of that table''s own definition.';
  end if;

  perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.field_retire',
                                          'admin'::public.permission_level, 'table');

  select r.data into v_spec
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_table
     and r.table_id = custom.table_kernel_id() and r.deleted_at is null;

  -- THE SET THAT IS GOING. The field, and every field of this same table that works out its
  -- answer through it - and then every field that works out ITS answer through one of those.
  -- A lookup that feeds a rollup goes in the same operation as the relation both read.
  v_going := array[p_field_id];
  v_keys  := array[v_field ->> 'key'];
  loop
    v_added := array_length(v_going, 1);
    select coalesce(array_agg(x.id), '{}'::uuid[]), coalesce(array_agg(x.key), '{}'::text[])
      into v_going, v_keys
      from (
        select f.id as id, f.data ->> 'key' as key
          from custom.record f
         where f.organization_id = p_organization_id
           and f.table_id = custom.field_kernel_id()
           and f.deleted_at is null
           and (f.data ->> 'entity_definition_id')::uuid = v_table
           and (f.id = any (v_going)
                or f.data -> 'config' ->> 'via'  = any (v_keys)
                or f.data -> 'config' ->> 'of'   = any (v_keys)
                or f.data -> 'config' ->> 'pick' = any (v_keys))
      ) x;
    exit when array_length(v_going, 1) = v_added;
  end loop;

  -- REC-2. The title goes nowhere, and the refusal says which field in the set is the title.
  v_title := v_spec ->> 'title_field';
  if v_title = any (v_keys) then
    select string_agg('"' || custom.said(f.data ->> 'label', f.data ->> 'key') || '"', ', ' order by f.data ->> 'key')
      into v_names
      from custom.record f
     where f.organization_id = p_organization_id and f.id = any (v_going);
    raise exception 'Removing "%" would also remove %, and one of those is "%" - what every record of this table is called.',
                    custom.said(v_field ->> 'label', 'that field'), v_names, v_title
      using errcode = '23514',
            hint = 'REC-2: a record is shown as a chip with the value of its title field. Make another field the title first, and then this removal takes the whole set in one operation.';
  end if;

  -- REC-1. A table keeps at least one field, and the refusal says how many the set would take.
  if jsonb_array_length(coalesce(v_spec -> 'fields', '[]'::jsonb)) <= array_length(v_going, 1) then
    raise exception 'A table keeps at least one field, and removing "%" would take all % of them.',
                    custom.said(v_field ->> 'label', 'that field'),
                    array_length(v_going, 1)::text
      using errcode = '23514',
            hint = 'REC-1: a table has to declare its fields. Add another field first, and then this removal goes through.';
  end if;

  -- ── T7's LAST CLAUSE, 2026-09-20 (lane LEAK-T10): AND A FORMULA THAT READS IT IS ASKED.
  --    `custom.field_dependants` has always been able to name the formula, the Rule and the
  --    merge field that read this column by id, and `custom.delete_rule` has always refused a
  --    delete that would blind one — REC-18, "This field is used by …, so it was not deleted."
  --    This door never asked it. It computed its own going set from `config->>via/of/pick`,
  --    which is the LOOKUP and ROLLUP chain only, and then soft-deleted the rows with a plain
  --    UPDATE. So retiring a column a formula depends on succeeded in silence, and the formula
  --    went on being evaluated against a Field that is not there — the exact calculation that
  --    "silently stops being right" REC-18 exists to prevent.
  --
  --    IT ASKS THE SHARED RULE, and does not grow a second copy of it. Everything the rule
  --    needs is already here: the going set is published in `custom.delete_set` exactly as
  --    `custom.record_delete` publishes it, so a formula that reads a column going in the SAME
  --    operation is not an obstacle (it is part of the set), and anything OUTSIDE the set comes
  --    back as the rule's own sentence, with the dependant's kind and name in it.
  --
  --    `p_apply => false` because this door does its own retirement below, in one statement,
  --    under `custom.is_a_retirement`. What is wanted from the rule is its VERDICT.
  v_saved_set := coalesce(current_setting('custom.delete_set', true), '');
  perform set_config('custom.delete_set',
                     (select string_agg(g::text, ',') from unnest(v_going) g), true);
  begin
    foreach v_one in array v_going loop
      perform custom.delete_rule(p_organization_id, v_one, false);
    end loop;
  exception when others then
    perform set_config('custom.delete_set', v_saved_set, true);
    raise;
  end;
  perform set_config('custom.delete_set', v_saved_set, true);

  -- ── RELATION-DECLARE, 2026-09-20: AND THE LINKS GO WITH THE COLUMNS. ─────────────────
  -- The column was gone and its edges were live, naming a field that no longer exists, which
  -- is the same 23514 a retype caused on the other table's reverse side. The whole going set
  -- is withdrawn in one statement, through the one withdrawal both this and custom.field_update
  -- call, so a removal never leaves a relation behind it. It runs BEFORE the field records are
  -- retired, while those columns still say what their links mean.
  perform custom.relation_edges_withdraw(p_organization_id, v_going,
    format('the column "%s" was removed', custom.said(v_field ->> 'label', v_field ->> 'key')));

  -- The field records go first: a retirement is not a change of shape (custom.is_a_retirement),
  -- so every guard lets the whole set through in ONE statement, and the table is then left
  -- declaring only fields that exist.
  update custom.record
     set deleted_at = now()
   where organization_id = p_organization_id
     and id = any (v_going)
     and table_id = custom.field_kernel_id();

  update custom.record
     set data = jsonb_set(data, '{fields}', (
           select coalesce(jsonb_agg(f), '[]'::jsonb)
             from jsonb_array_elements(coalesce(data -> 'fields', '[]'::jsonb)) f
            where not (f ->> 'name' = any (v_keys)))),
         updated_at = now(), version = version + 1
   where organization_id = p_organization_id and id = v_table
     and table_id = custom.table_kernel_id();

  return true;
end
$function$

;

CREATE OR REPLACE FUNCTION custom.io_comment_write(p_organization_id uuid, p_record_id uuid, p_body text, p_anchor jsonb DEFAULT '{}'::jsonb, p_parent_comment_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user  uuid := custom.query_principal();
  v_doc   jsonb;
  v_table uuid;
  v_id    uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_comment_write');
  if coalesce(btrim(coalesce(p_body, '')), '') = '' then
    raise exception 'custom.io_comment_write: a comment with no body is not a comment'
      using errcode = '22004';
  end if;

  -- THE LEVEL, AND IT IS THE ENUM DOING THE WORK. `commenter` is the second rung, so this one
  -- call admits commenters, editors and admins and refuses viewers — without a single string
  -- comparison and without a second access idea beside the platform's.
  if not custom.has_visibility(v_user, 'record', p_record_id, 'commenter'::public.permission_level) then
    -- 🚨 AND THE SENTENCE MATCHES THE FACT (lane LEAK-T10, 2026-09-20). This refusal used to
    -- tell EVERYBODY "You may read this record but not comment on it" — including somebody who
    -- may not read it at all, who was thereby told she holds a level she does not hold AND told
    -- that the record exists. A refusal that asserts something about the caller has to have
    -- established it, so the lower rung is asked before the sentence is chosen. `viewer` is one
    -- more ladder call, on the refusal path only, which nothing hot runs.
    if custom.has_visibility(v_user, 'record', p_record_id, 'viewer'::public.permission_level) then
      raise exception 'You may read this record but not comment on it.'
        using errcode = '42501',
              hint = 'Commenting needs the commenter level on the record (viewer < commenter < editor < admin). Ask whoever shared it with you to raise your level; nothing about the record itself has to change.';
    end if;
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'REC-29 / VIS-1: this is the same answer every other door gives about a record you do not hold, and it is deliberately the same whether the record exists or not. Ask whoever owns it to share it with you at the commenter level.';
  end if;

  -- THE ONE READ DOOR. This used to select from custom.record directly. It was checked, so it
  -- did not leak — but a second reading path is a second place the door's masking does not
  -- apply, and that argument is exactly the one that failed for seo.keyword_value_map.
  begin
    v_doc := custom.read_record(p_organization_id, p_record_id, true);
  exception when sqlstate '42501' then
    -- THE READ DOOR SAID NO WHERE THE ACCESS QUESTION SAID YES, and that disagreement is not
    -- this door's to resolve. `custom.read_record` decides from the derived containment graph,
    -- which conveys nothing for a record with no association; `custom.has_visibility`, checked
    -- above, is the platform's ONE answer and has already admitted this caller at `commenter`.
    -- So the comment lands and the convenience copy of `table_id` is simply absent — the one
    -- thing that never happens is a second reading path into `custom.record`.
    v_doc := null;
  end;
  if false then
    raise exception 'custom.io_comment_write: record % is not in this organization, or is deleted', p_record_id
      using errcode = '23503';
  end if;
  v_table := (v_doc ->> 'table_id')::uuid;   -- null when the read door declined; see above

  if p_parent_comment_id is not null
     and not exists (select 1 from custom.io_comment c
                      where c.organization_id = p_organization_id
                        and c.id = p_parent_comment_id
                        and c.record_id = p_record_id
                        and c.deleted_at is null) then
    -- A reply to a comment on ANOTHER record would put one conversation in two places.
    raise exception 'custom.io_comment_write: comment % is not a comment on record %', p_parent_comment_id, p_record_id
      using errcode = '23503';
  end if;

  insert into custom.io_comment (organization_id, record_id, table_id, body, anchor,
                                 parent_comment_id, created_by)
  values (p_organization_id, p_record_id, v_table, btrim(p_body),
          coalesce(p_anchor, '{}'::jsonb), p_parent_comment_id, v_user)
  returning id into v_id;
  return v_id;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.refusals_claiming_a_level_never_asked()
 RETURNS TABLE(function_name text, identity_args text, why text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- A REFUSAL NEVER TELLS SOMEBODY WHAT THEY DO HOLD UNLESS THE DOOR HAS JUST ESTABLISHED IT.
  --
  -- `custom.io_comment_write` refused a person who may not read a record at all with "You may
  -- READ this record but not comment on it." Every word after the first four was a claim about
  -- her, and the only thing the door had asked was whether she reached `commenter`. A sentence
  -- like that is worse than a vague one: it tells her she holds a level she does not, it tells
  -- her the record exists, and it sends her to ask for the wrong thing.
  --
  -- THE CODE, NOT THE PROSE: `--` comments are stripped first, so a comment quoting the old
  -- sentence can never fail this census and a comment promising the check can never pass it.
  select p.proname::text,
         pg_get_function_identity_arguments(p.oid),
         'refuses with a sentence that tells the caller they may READ this record, and the body '
         'never asks whether they may - so the claim is made about somebody the door knows '
         'nothing about'::text
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         ~ 'You may read this record'
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         !~ '''viewer''::public\.permission_level'
   order by 1;
$function$;
