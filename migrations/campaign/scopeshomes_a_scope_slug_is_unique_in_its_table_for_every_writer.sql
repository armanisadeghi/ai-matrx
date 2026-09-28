-- chair-step: lane SCOPES-STORE-HOMES, third file (coordinator 2026-09-28). The scope's Slug Field carries the store's own unique rule (custom._unique_rule_holds), declared by the store half custom._ctx_scope_columns and by the mover (scopes.SCOPE_COLUMNS), so a second live scope of a type with the same slug is refused for every writer, not only the scope door; Copy again and Step 1 carry the rule to every scope Table. The scopes switch's own_words_copied sentence names every word it checks. Two function bodies; writes no row at apply.
-- based-on: custom._ctx_scope_columns(uuid, uuid) e3c12e3b8081c4a662365de378c333b0e8cf4c515c458e4901c38ae83f00e02c
-- based-on: platform._cutover_seam_readiness(text, uuid) 717420cc78cf73dcf795667622388dd494b7d8f7848cb0a4f9b311a8c82fdd6d
-- lane: SCOPES-STORE-HOMES
-- INVERSE: migrations/inverse/scopeshomes_a_scope_slug_is_unique_in_its_table_for_every_writer_down.sql
-- window-class: two function bodies; no DDL on any table. Applied directly (owner, 2026-09-24).

CREATE OR REPLACE FUNCTION custom._ctx_scope_columns(p_org uuid, p_type uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c record;
begin
  for c in select * from (values ('slug', 'Slug', '{"behavior":"text"}'::jsonb, 2000),
                                 ('sort_order', 'Sort order', custom._ctx_item_shape('{"value_type":"number"}'::jsonb, false), 2001)) v(k, label, shape, sort)
  loop
    update custom.record t
       set data = t.data || jsonb_build_object('fields', (t.data -> 'fields') || jsonb_build_array(jsonb_build_object('name', c.k)))
     where t.organization_id = p_org and t.id = p_type
       and not exists (select 1 from jsonb_array_elements(t.data -> 'fields') e where e ->> 'name' = c.k);
    perform custom._ctx_upsert_doc(p_org, custom._ctx_id('scope-column-field', p_type::text, c.k),
      custom.field_kernel_id(), 'field',
      custom._ctx_field_doc(c.k, c.label, c.shape, p_type, false, c.sort, 'internal', 'exclude', 'manual', null, null, true)
        -- THE SLUG IS UNIQUE AMONG THE TABLE'S LIVE RECORDS, for every writer (the store's own `unique`
        -- rule, custom._unique_rule_holds) — as ctx_scopes_type_slug_uniq keeps it on the old side.
        || case when c.k = 'slug' then '{"rules": [{"kind": "unique"}]}'::jsonb else '{}'::jsonb end,
      jsonb_build_object('moved_from', jsonb_build_object('table', 'context.scopes', 'id', p_type::text,
                         'note', format('the %s column, which was never a context item', c.k))), null);
  end loop;
end;
$function$

;

CREATE OR REPLACE FUNCTION platform._cutover_seam_readiness(p_seam text, p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s platform.cutover_seam;
  v_checks jsonb := '[]'::jsonb;
  v_n bigint; v_c bigint; v_missing bigint; v_stale bigint; v_lag bigint;
  v_tn bigint; v_tc bigint; v_sn bigint; v_sc bigint; v_in bigint; v_ic bigint;
  v_names text;
  v_pre jsonb;
  v_count jsonb;
  v_any bigint; v_hooks bigint;
  v_ev jsonb;
  v_diff jsonb;
  v_part jsonb;
  v_rest text;
  v_ln bigint; v_lc bigint; v_lmiss bigint; v_lnames text;
  v_rm jsonb; v_rmn bigint;
begin
  select * into s from platform.cutover_seam where seam_key = p_seam and retired_at is null;
  if s.seam_key is null then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'known', 'says', 'This switch exists', 'met', false,
                         'detail', format('There is no switch called %s.', p_seam))));
  end if;

  if s.press_kind = 'platform_switch' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'pressed_here', 'says', 'Switched for one organization', 'met', false,
                         'detail', 'This one switches for everyone at once, in its own rehearsed step, not from an organization''s settings.')));
  elsif s.press_kind = 'already_switched' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'already', 'says', 'Already on the new system', 'met', true,
                         'detail', s.flip_does)));
  end if;

  if p_seam = 'older_tables' then
    -- ONE COUNT, shared with the mover's census (lane CUTOVER-CENSUS): the organization's live
    -- older tables against their live same-id copies; archived older tables and the option lists
    -- the app keeps are never counted on either side.
    v_count := platform.cutover_tables_copied(p_org);
    v_n := (v_count ->> 'older_live')::bigint;
    v_c := (v_count ->> 'copied')::bigint;
    v_missing := (v_count ->> 'rows_missing')::bigint;
    v_stale := (v_count ->> 'rows_stale')::bigint;
    select string_agg(x, ', ' order by x) into v_names
      from jsonb_array_elements_text(v_count -> 'not_yet') x;

    -- MOVER-CARRY-TAILS: every check of this switch says how many of its differences copying again
    -- clears (copy_again_clears) and how many it leaves (copy_again_leaves); the settings card offers
    -- "Copy again" only when one unmet check has something it clears, and each sentence says what to
    -- do about the rest instead.
    v_checks := v_checks || jsonb_build_object(
      'key', 'copied', 'says', 'Every table is copied into the new system', 'met', v_c = v_n,
      'copy_again_clears', greatest(v_n - v_c, 0), 'copy_again_leaves', 0,
      'detail', case when v_n = 0 then 'This organization has no older tables left.'
                     else format('%s of %s tables copied.', v_c, v_n)
                          || case when v_c < v_n then ' Not yet: ' || v_names || case when v_n - v_c > 5 then format(' and %s more', v_n - v_c - 5) else '' end || '.' else '' end end);

    -- LISTS-AFTER-SWITCH: the press archives the organization's live older pick lists too, and
    -- refuses (rolled back whole) when a list's Table-of-choices copy or any live choice is not in
    -- the store. Said here, before the press, with Copy again offered to bring them.
    select count(*), count(t.id),
           -- CHOICE-COLUMN-EDIT, 2026-09-27: a choice is "not in its copy" when the copy has no
           -- option with its id AT ALL. It used to be a count (older live choices minus the copy's
           -- live ones), so a choice a person RETIRED on the copy counted as not copied forever
           -- (Copy again cannot bring back what a person removed) and one a person ADDED hid a
           -- genuinely missing one. An edit made in the new system is neither.
           coalesce(sum((select count(*) from workbench.udt_structured_list_items i
                          where i.list_id = l.id and i.deleted_at is null
                            and not exists (select 1 from custom.record c
                                             where c.organization_id = l.organization_id and c.table_id = l.id
                                               and c.id = i.id and c.data_class = 'record'))), 0),
           string_agg(case when t.id is null then coalesce(nullif(btrim(l.list_name), ''), 'Untitled list') end, ', '
                      order by l.list_name)
      into v_ln, v_lc, v_lmiss, v_lnames
      from workbench.udt_structured_lists l
      left join custom.record t
        on t.organization_id = l.organization_id and t.id = l.id and t.data_class = 'table' and t.deleted_at is null
     where l.organization_id = p_org and l.deleted_at is null;

    v_checks := v_checks || jsonb_build_object(
      'key', 'lists_copied', 'says', 'Every pick list is copied into the new system',
      'met', v_lc = v_ln and v_lmiss = 0,
      'copy_again_clears', greatest(v_ln - v_lc, 0) + v_lmiss, 'copy_again_leaves', 0,
      'detail', case when v_ln = 0 then 'This organization has no older pick lists left.'
                     when v_lc = v_ln and v_lmiss = 0 then format('%s of %s pick lists copied, every choice in its copy.', v_lc, v_ln)
                     else format('%s of %s pick lists copied.', v_lc, v_ln)
                          || case when v_lnames is not null then ' Not yet: ' || v_lnames || '.' else '' end
                          || case when v_lmiss > 0 then format(' %s choices are not in their copies yet.', v_lmiss) else '' end
                          || ' Copying again brings them.' end);

    -- MOVER-DELETIONS: what the older side REMOVED since the copy — a row, a column, a list's choice,
    -- a whole table or list — that its copy still holds, and what the rerun archived whose older
    -- original is back. The rerun (platform.cutover_carry_removals) archives each on the copy, never a
    -- hard delete; until it runs, the switch would bring each one back to life.
    v_rm := platform.cutover_older_removals(p_org);
    v_rmn := coalesce((v_rm ->> 'count')::bigint, 0);
    v_checks := v_checks || jsonb_build_object(
      'key', 'removals_carried', 'says', 'Nothing removed from an older table or list is still on its copy',
      'met', v_rmn = 0, 'counts', v_rm -> 'by_kind',
      'copy_again_clears', v_rmn, 'copy_again_leaves', 0,
      'detail', case when v_rmn = 0
                     then 'Every row, column, choice, table and list removed on the older side is gone from its copy too, and no copy has a choice its older list never had.'
                     else format('%s %s the older side does not have %s still on the copies: %s. Copying again archives %s on the copies (restorable, never deleted).',
                                 v_rmn, case when v_rmn = 1 then 'thing' else 'things' end,
                                 case when v_rmn = 1 then 'is' else 'are' end,
                                 (select string_agg(x, '; ') from jsonb_array_elements_text(v_rm -> 'examples') x)
                                   || case when v_rmn > 5 then format(' and %s more', v_rmn - 5) else '' end,
                                 case when v_rmn = 1 then 'it' else 'them' end) end);

    v_checks := v_checks
      || jsonb_build_object('key', 'rows_present', 'says', 'No row is missing from a copy',
           'met', v_missing = 0, 'copy_again_clears', v_missing, 'copy_again_leaves', 0,
           'detail', case when v_missing = 0 then 'Every row of every copied table is in its copy.'
                          else format('%s rows are not in their copies yet. Copying the table again brings them.', v_missing) end)
      || jsonb_build_object('key', 'rows_current', 'says', 'No row was edited in an older table after it was copied',
           'met', v_stale = 0, 'copy_again_clears', v_stale, 'copy_again_leaves', 0,
           'detail', case when v_stale = 0 then 'Every copy is as current as its older table.'
                          else format('%s rows were edited in the older tables after they were copied. Copying again brings the edits.', v_stale) end);

    -- WHAT THE COPIES WOULD SHOW DIFFERENTLY (CUTOVER-READINESS). The rows checks above never looked
    -- at a table's colours, its columns' checks and formats, or who it is shared with, so the switch
    -- could show a copy that looks, refuses and opens differently from the older table while saying
    -- "ready". Each is compared here as the switch will leave the copy, and each difference is named.
    v_diff := platform.cutover_copy_differences(p_org);
    foreach v_rest in array array['colours', 'checks', 'formats', 'shares'] loop
      v_part := coalesce(v_diff -> v_rest, '{}'::jsonb);
      v_checks := v_checks || jsonb_build_object(
        'key', v_rest || '_match',
        'says', case v_rest when 'colours' then 'Every copy shows the colours its older table shows'
                            when 'checks' then 'No copy refuses a write its older table takes'
                            when 'formats' then 'Every column means on its copy what it means on its older table'
                            else 'Every copy is shared exactly as its older table' end,
        'met', coalesce((v_part ->> 'count')::int, 0) = 0,
        'counts', v_diff -> v_rest,
        'copy_again_clears', coalesce((v_part ->> 'clears')::int, 0),
        'copy_again_leaves', greatest(coalesce((v_part ->> 'count')::int, 0) - coalesce((v_part ->> 'clears')::int, 0), 0),
        'detail', platform.cutover_difference_sentence(v_rest, v_part));
    end loop;

    -- WHAT THE SWITCH REPLACES FIRST (COPY-WRITABLE). People may test the copies while the switch
    -- is off; the switch puts every row they changed back to the older table's version and
    -- archives the rows they added, and logs the counts. Always met: it is what the press does,
    -- said before it is pressed.
    v_ev := v_count -> 'evaluation';
    v_checks := v_checks
      || jsonb_build_object('key', 'test_edits_replaced', 'says', 'Test edits on the copies are replaced by the older tables first',
           'met', true,
           'counts', v_ev,
           'detail', case when coalesce((v_ev ->> 'rows')::bigint, 0) = 0
                          then 'Nobody has changed a copy while testing; nothing is replaced.'
                          else format('%s %s changed while testing, in %s %s: %s edited %s put back to the older table''s version, %s added %s archived (never deleted), %s table or column %s put back. Each table''s counts are kept in a log.',
                                      v_ev ->> 'rows', case when (v_ev ->> 'rows')::bigint = 1 then 'row was' else 'rows were' end,
                                      v_ev ->> 'tables', case when (v_ev ->> 'tables')::bigint = 1 then 'table' else 'tables' end,
                                      v_ev ->> 'edited', case when (v_ev ->> 'edited')::bigint = 1 then 'row is' else 'rows are' end,
                                      v_ev ->> 'added', case when (v_ev ->> 'added')::bigint = 1 then 'row is' else 'rows are' end,
                                      v_ev ->> 'settings', case when (v_ev ->> 'settings')::bigint = 1 then 'setting is' else 'settings are' end) end);

    -- What the switch cannot carry by itself (CUTOVER-PLAN D8, F19): an automation on "any older
    -- table" names no table to follow, and an outbound webhook subscribed to older row events has
    -- no copy to listen to. Either would go silent at the switch, so each holds it back, named.
    select count(*) into v_any from scheduler.sch_trigger t
     where t.organization_id = p_org and t.deleted_at is null and t.enabled and t.type = 'event'
       and t.config ->> 'entity_type' = 'user_table_row' and coalesce(t.config ->> 'table_id', '') = '';
    select count(*) into v_hooks from files.webhooks w
     where w.organization_id = p_org and w.is_active
       and w.event_types && array['row.created','row.updated','row.deleted','row.archived','row.restored']::text[];
    v_checks := v_checks
      || jsonb_build_object('key', 'automations_follow', 'says', 'Every "when a row changes" automation names its table',
           'met', v_any = 0, 'copy_again_clears', 0, 'copy_again_leaves', v_any,
           'detail', case when v_any = 0 then 'Each one moves to its table''s copy at the switch and back with Switch back.'
                          else format('%s automations run on a change to any older table. Pick the table each one watches first, so it can follow it.', v_any) end)
      || jsonb_build_object('key', 'webhooks_follow', 'says', 'No outbound webhook listens for older-table row changes',
           'met', v_hooks = 0, 'copy_again_clears', 0, 'copy_again_leaves', v_hooks,
           'detail', case when v_hooks = 0 then 'Nothing outside the platform is waiting on older-table changes.'
                          else format('%s outbound webhooks still listen for older-table row changes. Point each at its table''s changes in the new system first.', v_hooks) end);

  elsif p_seam = 'agent_context' then
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_tn, v_tc
      from context.scope_types t
      left join custom.record r on r.organization_id = p_org and r.id = t.id
     where t.organization_id = p_org and t.deleted_at is null;
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_sn, v_sc
      from context.scopes x
      join context.scope_types t on t.id = x.scope_type_id and t.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = x.id
     where x.organization_id = p_org and x.deleted_at is null;
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_in, v_ic
      from context.context_items i
      join context.scope_types t on t.id = i.scope_type_id and t.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = i.id
     where t.organization_id = p_org and i.deleted_at is null and i.is_active;

    v_checks := v_checks || jsonb_build_object(
      'key', 'copied', 'says', 'Every scope type, scope and context field is copied',
      'met', v_tc = v_tn and v_sc = v_sn and v_ic = v_in,
      'detail', case when v_tn = 0 then 'This organization has no scopes.'
                     else format('%s of %s scope types, %s of %s scopes, %s of %s context fields copied.',
                                 v_tc, v_tn, v_sc, v_sn, v_ic, v_in) end);

    select count(*) into v_lag
      from custom.io_outbox x
     where x.organization_id = p_org and x.event_key = 'context.follow'
       and x.consumed_at is null and x.deleted_at is null;

    v_checks := v_checks || jsonb_build_object(
      'key', 'follow_current', 'says', 'No edit is waiting to be copied', 'met', v_lag = 0,
      'detail', case when v_lag = 0 then 'The copy has every edit made in the current screens.'
                     else format('%s edits made in the current screens are waiting for the copy.', v_lag) end);
  end if;

  if p_seam = 'scopes_screens' then
    -- SCOPES-ROWS-COPIED (2026-09-28). (−1) EVERY ROW IS IN THE STORE, BY ID, COUNTED AS THE OWNER. The
    -- parity check below is a compare through a test seat, and a seat sees only the organizations it
    -- belongs to: Titanium's 843 Tag scopes with no Record read as "0 defects" and ready. This counts
    -- every live older row with no live store twin — scope types, context items, scopes (Tag scopes
    -- named apart), current values and "<kind> -> scope" tags — for this organization, whoever asks.
    v_part := platform.cutover_scope_rows_copied(p_org);
    v_rmn := coalesce((v_part ->> 'count')::bigint, 0);
    v_checks := v_checks || jsonb_build_object(
      'key', 'rows_copied', 'says', 'Every scope row is in the new system',
      'met', v_rmn = 0, 'counts', v_part -> 'by_kind',
      'copy_again_clears', v_rmn, 'copy_again_leaves', 0,
      'measured_at', v_part -> 'measured_at',
      'detail', case when v_rmn = 0
                     then format('Every scope type, context field, scope, current value and tag is in the new system (%s scopes, %s tags counted by id).',
                                 v_part -> 'live' ->> 'scopes', v_part -> 'live' ->> 'tag_edges')
                     else (select string_agg(x, '; ') from jsonb_array_elements_text(v_part -> 'examples') x)
                          || case when jsonb_array_length(v_part -> 'by_type') > 5
                                  then format(' and %s more scope types', jsonb_array_length(v_part -> 'by_type') - 5) else '' end
                          || '. Copying again brings them.' end);
    -- SCOPES-TAILS. (0) EVERY WORD A SCOPE TYPE OR A CONTEXT FIELD SAYS ABOUT ITSELF IS ON ITS COPY: a
    -- type's description and sort order, a field's category, tags and status note. Copying again
    -- brings each one; Switch back carries the copy's words back to the current screens.
    v_part := platform.cutover_scope_own_words(p_org);
    v_rmn := coalesce((v_part ->> 'count')::bigint, 0);
    v_checks := v_checks || jsonb_build_object(
      'key', 'own_words_copied', 'says', 'Every scope type''s, context field''s and scope''s own words are on its copy',
      'met', v_rmn = 0, 'counts', v_part -> 'by_kind',
      'copy_again_clears', v_rmn, 'copy_again_leaves', 0,
      'detail', case when v_rmn = 0
                     -- SCOPES-STORE-HOMES: every word the old screens read, at its home in the store.
                     then 'Every scope type''s description, order, assignment limit and suggested variables; every context field''s description, status, status note, category, tags, item limit, custom component, dataset source and allowed types; and every scope''s slug and order is on its copy.'
                     else format('%s %s what the current screens show: %s. Copying again brings %s.',
                                 v_rmn, case when v_rmn = 1 then 'copy does not say' else 'copies do not say' end,
                                 (select string_agg(x, '; ') from jsonb_array_elements_text(v_part -> 'examples') x)
                                   || case when v_rmn > 5 then format(' and %s more', v_rmn - 5) else '' end,
                                 case when v_rmn = 1 then 'it' else 'them' end) end);
    -- SCOPES-WRITE-THROUGH. (1) THE COPY HAS EVERY EDIT: no follow row waiting for this organization.
    select count(*) into v_lag
      from custom.io_outbox x
     where x.organization_id = p_org and x.event_key = 'context.follow'
       and x.consumed_at is null and x.deleted_at is null;
    v_checks := v_checks || jsonb_build_object(
      'key', 'follow_current', 'says', 'No edit is waiting to be copied', 'met', v_lag = 0,
      'detail', case when v_lag = 0 then 'The copy has every edit made in the current screens.'
                     else format('%s edits made in the current screens are waiting for the copy.', v_lag) end);
    -- (2) PARITY: the newest context parity run for this organization found no defect, and nothing
    -- changed in its scopes after that run.
    declare
      m platform.cutover_seam_measure;
      v_changed timestamptz;
    begin
      -- NOTHING TO COMPARE IS MET (found by lane FINAL-SWITCH's rehearsal): an organization with no
      -- live scope type hands every agent nothing on both systems, so there is no parity to measure,
      -- and the switch must never hold it for want of a measurement.
      if not exists (select 1 from context.scope_types t where t.organization_id = p_org and t.deleted_at is null) then
        v_checks := v_checks || jsonb_build_object(
          'key', 'parity', 'says', 'Agents are handed the same context by both systems', 'met', true,
          'detail', 'This organization has no scopes: both systems hand an agent nothing, so there is nothing to compare.');
      else
      select * into m from platform.cutover_seam_measure x
       where x.seam_key = 'scopes_screens' and x.organization_id = p_org and x.key = 'parity'
       order by x.measured_at desc limit 1;
      select greatest(
               (select max(t.updated_at) from context.scope_types t where t.organization_id = p_org),
               (select max(sc.updated_at) from context.scopes sc where sc.organization_id = p_org),
               (select max(i.updated_at) from context.context_items i join context.scope_types t on t.id = i.scope_type_id where t.organization_id = p_org),
               (select max(v.created_at) from context.context_item_values v join context.scopes sc on sc.id = v.scope_id where sc.organization_id = p_org))
        into v_changed;
      v_checks := v_checks || jsonb_build_object(
        'key', 'parity', 'says', 'Agents are handed the same context by both systems',
        'met', m.id is not null and m.met and (v_changed is null or m.measured_at >= v_changed),
        'measured_at', m.measured_at,
        'detail', case when m.id is null
                         then 'Not measured yet for this organization: uv run python scripts/context_parity.py --organization ' || p_org::text || ' --record (aidream).'
                       when not m.met then m.says
                       when v_changed is not null and m.measured_at < v_changed
                         then format('Measured %s, but this organization''s scopes changed after that (%s); measure again.', m.measured_at, v_changed)
                       else m.says end);
      end if;
    end;
  end if;

  for v_pre in select * from jsonb_array_elements(s.prerequisites) loop
    v_checks := v_checks || jsonb_build_object(
      'key', v_pre ->> 'key', 'says', v_pre ->> 'says',
      'met', coalesce((v_pre ->> 'met')::boolean, false),
      'detail', v_pre ->> 'evidence',
      -- When a measured fact was last measured (the census writes it; every release re-runs it).
      'measured_at', v_pre ->> 'measured_at');
  end loop;

  return jsonb_build_object(
    'ready', not exists (select 1 from jsonb_array_elements(v_checks) c where not (c ->> 'met')::boolean),
    'checked_at', now(),
    'checks', v_checks);
end;
$function$

;
