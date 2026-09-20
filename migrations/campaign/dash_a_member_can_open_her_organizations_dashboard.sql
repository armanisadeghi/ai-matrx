-- target: branch,production
-- additive: yes
--   It REPLACES exactly two functions this lane created an hour ago, `custom.dashboard_run`
--   and `custom.dashboards`, keeping their signatures, their security, their search_path and
--   every other branch. What changes is WHICH access question each asks before it answers.
--   No table, column, trigger, policy or grant is touched; no row is read or written; nothing
--   any other lane owns is involved.
--   The inverse is `migrations/inverse/dash_a_dashboard_is_a_record_with_doors_down.sql`,
--   which drops both functions along with the rest of the lane.
-- guard: custom/system_enabled
-- based-on: custom.dashboards(uuid, uuid) 61971059d8d5a68135bd4eca3f22cadc2a524f462884e63ba03349ed8eb1c103
-- based-on: custom.dashboard_run(uuid, uuid, jsonb) dac44479358a38214f9c90444a2a745204f751c8d775243f2985621772eb338e
--
-- LANE DASHBOARDS — THE DEFECT THE PROOF FOUND, AND IT IS THE PRODUCT'S WHOLE CLAIM.
--
-- WHAT HAPPENED, MEASURED 2026-09-20 on the main database. A throwaway organization with a
-- Jobs table of two hundred records, `custom/member_default_visibility = shared_only` (VIS-19:
-- membership alone shows nothing), and a member shared fifty of them. The admin's dashboard
-- answered correctly. The member's seat got:
--
--     You do not have access to this dashboard, so custom.dashboard_run may not write to it.
--
-- She was refused the whole canvas — not narrowed numbers, the whole canvas — because
-- `custom.dashboard_run` asked `custom.assert_client_may_change` at the VIEWER rung against
-- the DASHBOARD RECORD, and under `shared_only` an `internal` record nobody explicitly shared
-- with her is a record she cannot open. So the one sentence this product exists to make true —
-- *one dashboard, and every person's own honest answer on it* — was false for every
-- organization that takes sharing seriously, which is exactly the organization that wants it.
--
-- WHY THE RECORD-LEVEL CHECK WAS THE WRONG QUESTION, AND NOT MERELY TOO STRICT
-- ---------------------------------------------------------------------------
-- A dashboard contains no data. Its document is a name and a list of questions; every number
-- on it is produced at read time by `custom.record_aggregate` under the CALLER'S OWN
-- principal. So the record-level check protected nothing: a caller refused the dashboard could
-- ask `custom.record_aggregate` the identical question about the identical Table and get the
-- identical answer, because that door judges the Table and not the dashboard. The check cost
-- the product its central claim and bought no secrecy at all.
--
-- THE QUESTION IT ASKS NOW is the one the store already asks of everything that reads a
-- Table without reading a row: `custom.assert_may_know_table` (VIS-5 / T10) — *you know a
-- Table if you may open the Table itself, or if anything in it has been shared with you.*
-- That is the same wall `custom.forms`, `custom.record_aggregate` and `custom.dashboard_stuck`
-- stand behind, so there is one answer to "may this person look at this Table" on this
-- platform and a dashboard is not a second one.
--
-- WHAT DID NOT CHANGE, AND THIS IS THE HALF THAT MATTERS
-- -----------------------------------------------------
--   · Every number is still computed under the caller's own principal, with the visibility
--     predicate in the same WHERE as the filter and below the aggregate node. The member sees
--     HER fifty; the admin sees two hundred; neither is told about the other's.
--   · A block naming a DIFFERENT Table is still judged on its own, by the same wall, inside
--     `custom.dashboard_block_normalize` — so a canvas that reaches a Table this caller may
--     not know refuses THAT block, by name, and still answers the rest.
--   · `custom.dashboard_declare` still asks ADMIN on the subject Table, and
--     `custom.dashboard_delete` still asks ADMIN on the dashboard record itself. CHANGING or
--     REMOVING a shared artefact is a different act from looking at one, and it keeps the
--     stricter question.
--   · `custom.dashboards` still refuses to reveal a Table: the list is still narrowed to
--     Tables in `custom.query_visible_ids`. What it drops is the SECOND narrowing, by the
--     dashboard record's own visibility, which hid an organization's dashboards from its own
--     members for the same reason and with no sentence at all — the list simply came back
--     empty, which is the silent half of the same defect.
--
-- COMPANY: Linear Insights shares a view with the team and still shows each member only the
-- issues they can see; Airtable Interfaces shares the interface with collaborators and applies
-- record permissions inside it. Neither hides the page and calls it security.

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function custom.dashboards(p_organization_id uuid, p_table_id uuid default null)
returns table(dashboard_id uuid, table_id uuid, name text, blocks jsonb,
              presentation jsonb, block_count integer, version integer,
              created_at timestamptz, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboards');
  return query
    select d.id,
           nullif(d.data ->> 'subject_table_id', '')::uuid,
           d.data ->> 'name',
           coalesce(d.data -> 'blocks', '[]'::jsonb),
           coalesce(d.data -> 'presentation', '{}'::jsonb),
           jsonb_array_length(coalesce(d.data -> 'blocks', '[]'::jsonb)),
           d.version,
           d.created_at,
           d.updated_at
      from custom.record d
     where d.organization_id = p_organization_id
       and d.table_id = custom.presentation_kernel_id()
       and d.data_class = custom.dashboard_class()
       and d.deleted_at is null
       -- ONE WALL, AND IT IS THE TABLE'S. A dashboard holds no record and reveals none; what
       -- it names is a Table, so the question is the Table's own (VIS-5) and the answer is
       -- the same one custom.forms gives. The dashboard record's own visibility is NOT asked
       -- here: under custom/member_default_visibility = shared_only it hid an organization's
       -- dashboards from the organization's own members, silently, by returning nothing.
       and nullif(d.data ->> 'subject_table_id', '')::uuid
             in (select v from custom.query_visible_ids(p_organization_id,
                                                        custom.table_kernel_id()) v)
       and (p_table_id is null or nullif(d.data ->> 'subject_table_id', '')::uuid = p_table_id)
     order by d.created_at desc;
end;
$fn$;

comment on function custom.dashboards(uuid, uuid) is
  'SCR-16: an organization''s dashboards over the Tables this caller can already open — the '
  'same wall custom.forms stands behind (VIS-5). It returns the saved blocks and no number '
  'computed over any record; the numbers come from custom.dashboard_run, under the caller''s '
  'own principal.';

create or replace function custom.dashboard_run(
  p_organization_id uuid,
  p_dashboard_id uuid,
  p_filter jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_doc     jsonb;
  v_name    text;
  v_subject uuid;
  v_out     jsonb := '[]'::jsonb;
  v_rows    jsonb;
  v_block   jsonb;
  v_merged  jsonb;
  v_started timestamptz;
  b         jsonb;
  k         text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboard_run');

  select d.data into v_doc
    from custom.record d
   where d.organization_id = p_organization_id
     and d.id = p_dashboard_id
     and d.table_id = custom.presentation_kernel_id()
     and d.data_class = custom.dashboard_class()
     and d.deleted_at is null;
  if v_doc is null then
    raise exception 'There is no dashboard % in this organization.', p_dashboard_id
      using errcode = '02000',
            hint = 'A dashboard id from another organization reads as absent — organizations are hard walls (REC-29).';
  end if;

  v_name    := v_doc ->> 'name';
  v_subject := nullif(v_doc ->> 'subject_table_id', '')::uuid;

  -- READING A DASHBOARD IS KNOWING ITS TABLE, and nothing more, because a dashboard holds no
  -- record: every number below is produced by custom.record_aggregate under THIS caller's own
  -- principal, and this caller could ask that door the same question about the same Table
  -- directly. Asking about the dashboard RECORD instead protected nothing and, under
  -- custom/member_default_visibility = shared_only, refused an organization's own members
  -- their own organization's dashboard (measured 2026-09-20).
  perform custom.assert_may_know_table(p_organization_id, v_subject, 'custom.dashboard_run');

  for b in select e from jsonb_array_elements(coalesce(v_doc -> 'blocks', '[]'::jsonb)) e loop
    -- RE-JUDGED ON THE WAY OUT, NOT TRUSTED BECAUSE IT WAS JUDGED ON THE WAY IN. A Field
    -- can be deleted or renamed after a block was saved, and a block naming a Table THIS
    -- caller may not know is refused here by the same wall — so a canvas that reaches
    -- somebody else's Table loses that ONE block and answers the rest.
    begin
      v_block := custom.dashboard_block_normalize(p_organization_id, v_subject, b);
    exception when others then
      v_out := v_out || jsonb_build_object(
        'title', coalesce(b ->> 'title', 'Block'),
        'kind', coalesce(b ->> 'kind', 'number'),
        'refused', sqlerrm,
        'sqlstate', sqlstate);
      continue;
    end;

    -- ONE FILTER BAR ACROSS EVERY PANEL (SCR-16, Linear Insights). The canvas's filter is
    -- merged over each block's own, and the block's own wins on a key they share.
    v_merged := coalesce(v_block -> 'filter', '{}'::jsonb);
    if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
      for k in select kk from jsonb_object_keys(p_filter) kk loop
        if not (v_merged ? k) then
          v_merged := v_merged || jsonb_build_object(k, p_filter -> k);
        end if;
      end loop;
    end if;

    v_started := clock_timestamp();
    begin
      if v_block ->> 'kind' = 'stuck' then
        select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_rows
          from custom.dashboard_stuck(p_organization_id,
                                      (v_block ->> 'table_id')::uuid,
                                      v_block ->> 'state_key',
                                      (v_block ->> 'days')::integer,
                                      v_merged,
                                      (v_block ->> 'limit')::integer,
                                      'viewer') s;
      else
        select coalesce(jsonb_agg(jsonb_build_object('groups', a.groups,
                                                     'measures', a.measures,
                                                     'row_count', a.row_count)), '[]'::jsonb)
          into v_rows
          from custom.record_aggregate(p_organization_id,
                                       (v_block ->> 'table_id')::uuid,
                                       coalesce(v_block -> 'group_by', '[]'::jsonb),
                                       coalesce(v_block -> 'measures', '[]'::jsonb),
                                       v_block -> 'bucket',
                                       v_merged,
                                       (v_block ->> 'limit')::integer,
                                       'viewer') a;
      end if;
    exception when others then
      -- NOTHING FAILS SILENTLY: one block that refuses is one block that says why, and the
      -- other seven still answer. A canvas that went blank because one Field was renamed
      -- would be the screen telling a lie about the whole organization.
      v_out := v_out || (v_block || jsonb_build_object('refused', sqlerrm, 'sqlstate', sqlstate));
      continue;
    end;

    v_out := v_out || (v_block || jsonb_build_object(
      'rows', v_rows,
      'filter', v_merged,
      'ms', round(extract(epoch from (clock_timestamp() - v_started)) * 1000.0, 1)));
  end loop;

  return jsonb_build_object(
    'dashboard_id', p_dashboard_id,
    'name', v_name,
    'subject_table_id', v_subject,
    'presentation', coalesce(v_doc -> 'presentation', '{}'::jsonb),
    'filter', coalesce(p_filter, '{}'::jsonb),
    'blocks', v_out);
end;
$fn$;

comment on function custom.dashboard_run(uuid, uuid, jsonb) is
  'SCR-16: the WHOLE canvas in ONE call and ONE snapshot. Reading it is knowing its subject '
  'Table (VIS-5) — a dashboard holds no record — and every number is answered by '
  'custom.record_aggregate or custom.dashboard_stuck under the CALLER''S OWN principal, so a '
  'member shared fifty of two hundred records sees fifty on the organization''s own dashboard. '
  'One block that refuses says why and the rest still answer.';
