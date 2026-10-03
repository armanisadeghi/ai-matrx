-- chair-step: this REPLACES two bodies, same signatures, same SECURITY DEFINER, volatility, search_path and grants (CREATE OR REPLACE keeps them): custom.confidential_answer(uuid, uuid, permission_level) and custom.relation_targets(uuid, uuid, text). One thing changes: while a Confidential reader entry's `when` is worked out for one row, that row is marked (transaction-local mx.confidential_rule_row, cleared on every exit) and custom.relation_targets reads THAT row's links without asking whether the caller may open it - the question being answered. Every other call of relation_targets asks exactly as before. No table, column, index, policy, grant or data row is touched.
-- lane: PLATFORM-APP-DATA (v6 lane 12, P7 - the HR employee-review template's reveal rule)
-- after: lane12p7_a_a_readers_rule_is_asked_not_folded.sql (its body is this file's confidential_answer based-on)
-- based-on: custom.confidential_answer(uuid, uuid, permission_level) c3441b84ac297b8ff12bc3fcd4f9afbd1e319391ae436f4c334ed85fb679da3e
-- based-on: custom.relation_targets(uuid, uuid, text) 5dc1f9f01b3cefdf334eba732b0ec8fd084bd943d25211ec2c840c9a4743d844
--
-- A READER'S RULE READS ITS OWN ROW WITH NO READER SEAT.
--
-- THE DEFECT (HR review template walk on the clone, 2026-10-03, after lane12p7_a). CHAIR-ACCESS c says the
-- rule is "worked out over the row's own stored values (every column, no reader seat)". A rule that reads a
-- lookup ("the cycle says both sides are submitted") works the lookup out through custom.relation_targets,
-- which first asks custom.assert_client_may_open(<this row>) - i.e. custom.confidential_answer(<this row>)
-- again. Measured as admin@admin.com: read_record of the employee's self-review answered {"code":"door",
-- "message":"You do not have access to this record, so custom.relation_targets has nothing to show you."}
-- and the reveal never happened. The mark gives the rule the seat-free read its contract already promises,
-- for that one row and that one evaluation; the reader still learns only whether the rule is true.
--
-- Guard: aidream apps/shared/records/scripts/hr-review-template/walk.ts (red before: REVEAL checks fail with
-- the sentence above; green after).
-- Inverse: migrations/inverse/lane12p7_b_a_readers_rule_reads_its_row_without_a_seat_down.sql

CREATE OR REPLACE FUNCTION custom.confidential_answer(p_user uuid, p_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- THE ONE ANSWER FOR A ROW OF A CONFIDENTIAL STORE TABLE (access ladder: "the owner and the people
-- the record's own rules name"). null = the row is not under a Confidential Table, ask the ladder
-- as always. Otherwise, at the level asked:
--   · the row's owner (created_by) and the Table's owner: every level - unless the Table says
--     maker_is_reader (CHAIR-DOORS-3A): then the Table belongs to the organization, and the person who
--     made it is a reader like anyone else (her own rows, her shares, the reader fields that name her);
--   · a share addressed to this person — on the row, or on its whole Table — at its own level
--     (sharing sits outside the ladder and works at every level);
--   · a person a reader field names (the Table's `readers`): that reader's level, never above editor;
--   · nobody else: no organization lane, no admin lane, no library lane, no containment.
-- An archived organization is closed to everyone. A child answers exactly as its Confidential row.
-- Asked by iam.has_access_for_base and custom.reaches_directly — the platform's one check and the
-- store's ladder — so they cannot disagree.
declare
  v_anchor  uuid;
  v_org     uuid;
  v_table   uuid;
  v_owner   uuid;
  v_data    jsonb;
  v_towner  uuid;
  v_readers jsonb;
  v_maker_reads boolean;   -- CHAIR-DOORS-3A: the Table's maker is only a reader
  v_grant   public.permission_level;
  v_reader  jsonb;
  v_level   public.permission_level;
  v_when    jsonb;     -- CHAIR-ACCESS c: the reader entry's own condition, in the saved-view where grammar
  v_sql     text;
  v_true    boolean;
begin
  v_anchor := custom.confidential_anchor(p_id);
  if v_anchor is null then return null; end if;
  if p_user is null then return false; end if;

  select r.organization_id, r.table_id, r.created_by, r.data, t.created_by, t.data -> 'readers',
         coalesce(t.data -> 'maker_is_reader' = 'true'::jsonb, false)
    into v_org, v_table, v_owner, v_data, v_towner, v_readers, v_maker_reads
    from custom.record r
    join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
   where r.id = v_anchor;

  if exists (select 1 from iam.organizations o where o.id = v_org and o.archived_at is not null) then
    return false;
  end if;
  if p_user = v_owner or (p_user = v_towner and not v_maker_reads) then
    return true;
  end if;

  select max(g.permission_level) into v_grant
    from iam.permissions g
   where g.resource_type = 'record'
     and g.resource_id in (v_anchor, v_table)
     and g.granted_to_user_id = p_user
     and g.status = 'active'
     and (g.expires_at is null or g.expires_at > now());
  if v_grant is not null and v_grant >= p_required then
    return true;
  end if;

  if jsonb_typeof(v_readers) = 'array' then
    for v_reader in select x from jsonb_array_elements(v_readers) x loop
      continue when jsonb_typeof(v_reader) is distinct from 'object';
      v_level := least(coalesce(nullif(v_reader ->> 'level', '')::public.permission_level, 'viewer'),
                       'editor'::public.permission_level);
      continue when v_level < p_required;
      -- CHAIR-ACCESS c (HR proof gap 3): A READER FIELD APPLIES WHEN ITS RULE IS TRUE. A reader entry may
      -- carry `when`, a condition on THIS row in the one filter grammar saved views and
      -- custom.read_records_page use (a flat {column: value} map, or a Rule expression) - e.g. the
      -- employee reads her review once status = shared. It is the TABLE's rule, worked out over the
      -- row's own stored values (every column, no reader seat), inside this same answer, so a reveal
      -- can be automated by the row's own state and nothing else. A `when` that is not true - or
      -- cannot be worked out - leaves this reader entry closed.
      v_when := v_reader -> 'when';
      if v_when is not null and jsonb_typeof(v_when) = 'object' then
        -- LANE 12 P7: an IF, never a CASE. custom.record_filter_sql(jsonb) is IMMUTABLE, so inside a CASE
        -- the planner folded the ELSE arm with v_when as a constant and raised "this filter is a Rule
        -- expression, and it has to be asked of a table" for every Rule  - even though the WHEN arm
        -- had chosen the Rule branch. Every Rule reader entry was closed, and every read of a row under it
        -- errored. An IF evaluates only the branch it takes.
        if custom.filter_is_rule(v_when) then
          v_sql := format('(custom.rule_truth(%s) is true)',
                          custom.rule_filter_node_sql(v_org, v_table, v_when,
                                                      custom.choice_field_map(v_org, v_table), null));
        else
          v_sql := custom.record_filter_sql(v_when);
        end if;
        -- LANE 12 P7: THE TABLE'S RULE IS WORKED OUT WITH NO READER SEAT (CHAIR-ACCESS c's own words). A
        -- lookup in it reads through custom.relation_targets, which asked whether the caller may open THIS
        -- row - the very question being answered here - and refused (42501), so a reader could never wait
        -- on a lookup ("both sides submitted", read through the review cycle). For the length of this one
        -- evaluation the row is marked, and custom.relation_targets reads the links OF THAT ROW without
        -- asking again. Nothing else honours the mark; no client can set it (set_config is no client door,
        -- the same shape as mx.platform_context_org); it is cleared on every exit.
        perform set_config('mx.confidential_rule_row', v_anchor::text, true);
        begin
          execute format('select exists (select 1 from custom.record r where r.id = $1 and (%s))', v_sql)
             into v_true using v_anchor;
        exception when others then
          perform set_config('mx.confidential_rule_row', '', true);
          raise;
        end;
        perform set_config('mx.confidential_rule_row', '', true);
        continue when not coalesce(v_true, false);
      elsif v_when is not null then
        continue;   -- a `when` that is not an object is refused at write time; one that got here is closed
      end if;
      if custom.confidential_names(v_org, v_data -> (v_reader ->> 'field'), p_user) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.relation_targets(p_organization_id uuid, p_record_id uuid, p_via_key text)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_targets');
  -- LANE 12 P7: the links of the row a Confidential Table's reader rule is being worked out for
  -- (custom.confidential_answer marks it for that one evaluation): the rule reads them with no reader seat.
  if nullif(current_setting('mx.confidential_rule_row', true), '') is distinct from p_record_id::text then
    perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.relation_targets', 'viewer'::public.permission_level, 'record');
  end if;
  return query
-- DISTINCT is the whole of "no double counting": a record listed twice in the same
  -- relation is one related record, whatever the document says.
  select distinct (t #>> '{}')::uuid
    from custom.record r
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(r.data -> p_via_key) = 'array' then r.data -> p_via_key
           when r.data ? p_via_key and jsonb_typeof(r.data -> p_via_key) = 'string'
                then jsonb_build_array(r.data -> p_via_key)
           else '[]'::jsonb end) t
   where r.organization_id = p_organization_id
     and r.id = p_record_id
     and r.deleted_at is null
     and (t #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
end;
$function$;
