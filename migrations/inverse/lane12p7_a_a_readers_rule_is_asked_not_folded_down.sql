-- chair-step: inverse of lane12p7_a_a_readers_rule_is_asked_not_folded.sql - restores custom.confidential_answer(uuid, uuid, permission_level) to the body production held on 2026-10-03 (sha256 ea7c48c0 of the psql dump; CHAIR-ACCESS c). Re-base before running if production has moved since (CHAIR-GUIDANCE hazard 4).

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
        v_sql := case when custom.filter_is_rule(v_when)
                      then format('(custom.rule_truth(%s) is true)',
                                  custom.rule_filter_node_sql(v_org, v_table, v_when,
                                                              custom.choice_field_map(v_org, v_table), null))
                      else custom.record_filter_sql(v_when) end;
        execute format('select exists (select 1 from custom.record r where r.id = $1 and (%s))', v_sql)
           into v_true using v_anchor;
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
