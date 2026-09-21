-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.pipeline_gate_preview(uuid, uuid, text, jsonb) 795e13dbc900ca1134e1c913350a2ba06db17566ebe0358baba4c37b5f032c01
--
-- ══════════════════════════════════════════════════════════════════════════════════════
-- THE CARDS THE PREVIEW NAMES HAVE NAMES.
-- lane STAGE-RULES-2 · 2026-09-21
--
-- `custom.pipeline_gate_preview` landed an hour ago and, run against the Birchwood Avenue
-- renovation's real quotes, named the three cards it would refuse like this:
--
--     "title": "8896def2-71ca-46e9-a777-0b9260464710"
--
-- That is the whole point of the preview defeated. A count a person cannot check is a
-- number they have to take on trust, and the names are what makes it checkable — "yes,
-- that one should be stopped" or "no, I have written this wrong". A uuid is neither.
--
-- WHY IT HAPPENED, AND WHY IT IS NOT A BIRCHWOOD ODDITY. A Table's `title_field` may point
-- at a RELATION column — that renovation's quotes are titled by the room they are for —
-- and a relation's stored value is the other record's id. Every server-side reader that
-- reaches for `data ->> title_field` has this: `custom.portal_record_title` does it too,
-- and a public portal showing a uuid where a name belongs is the same defect in a place
-- strangers can see. The screens do not have it because `useRecordLabels` resolves a
-- relation in the browser — which is exactly why a door that answers without the browser
-- has to resolve it itself.
--
-- ONE HOP, AND THEN IT SAYS IT DOES NOT KNOW. A relation pointing at a record titled by
-- another relation is a chain, and a door that followed it forever would be a recursion a
-- person waits on. So: the value, or the title of the record it names, or an honest
-- "an untitled quote" — never an id dressed up as a name.
-- ══════════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────────────
-- THE WORDS ON A CARD, for a reader that has no browser to resolve a relation in.
create or replace function custom._card_words(p_organization_id uuid, p_value text, p_noun text)
  returns text language plpgsql stable set search_path = pg_catalog as $fn$
declare
  v_other uuid;
  v_title text;
begin
  if nullif(btrim(coalesce(p_value, '')), '') is null then
    return 'an untitled ' || p_noun;
  end if;
  -- Not a uuid at all: it is already the words somebody typed.
  begin
    v_other := p_value::uuid;
  exception when invalid_text_representation then
    return p_value;
  end;
  select coalesce(nullif(o.data ->> (t.data ->> 'title_field'), ''),
                  nullif(o.data ->> 'name', ''),
                  nullif(o.data ->> 'title', ''))
    into v_title
    from custom.record o
    left join custom.record t on t.organization_id = o.organization_id and t.id = o.table_id
   where o.organization_id = p_organization_id and o.id = v_other and o.deleted_at is null;
  -- The hop landed on another id, or on nothing: say so rather than print either.
  if v_title is null or v_title ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return 'an untitled ' || p_noun;
  end if;
  return v_title;
end;
$fn$;

-- ───────────────────────────────────────────────────────────────────────────────────────
-- THE PREVIEW, naming its cards through it.
CREATE OR REPLACE FUNCTION custom.pipeline_gate_preview(p_organization_id uuid, p_table_id uuid, p_stage text, p_gate jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_key       text;
  v_fid       uuid;
  v_skey      text;
  v_expr      jsonb;
  v_title     text;
  v_noun      text;
  r           custom.record;
  v_doc       jsonb;
  v_ctx       jsonb;
  v_me        uuid;
  v_level     public.permission_level;
  v_considered integer := 0;
  v_refused   integer := 0;
  v_examples  jsonb := '[]'::jsonb;
  v_looked    integer := 0;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_gate_preview');
  -- Reading it is a viewer's act — it says nothing the board does not already show — but
  -- a Table she may not know exists is not described to her (VIS-5).
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.pipeline_gate_preview');

  if jsonb_typeof(p_gate -> 'demands') <> 'object' then
    raise exception 'this rule does not say what it demands yet, so there is nothing to try it against'
      using errcode = '22004',
            hint = 'Finish the condition — "the amount is more than 5000" — and the preview will count the cards it would stop.';
  end if;

  v_key := custom._stage_field_key(p_organization_id, p_table_id);
  if v_key is null then
    return jsonb_build_object('is_pipeline', false, 'considered', 0, 'refused', 0,
             'examples', '[]'::jsonb,
             'why', 'This table has no stage column yet, so there is no board to try this against.');
  end if;
  select f.id into v_fid from custom.record f
   where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and f.data ->> 'key' = v_key;
  v_skey := custom._pipeline_stage_key(p_organization_id, v_fid, p_stage);
  v_expr := custom._pipeline_gate_expr(v_fid, v_skey, p_gate);

  select coalesce(nullif(t.data ->> 'title_field', ''), 'title'),
         lower(coalesce(nullif(t.data ->> 'label_singular', ''), nullif(t.data ->> 'name', ''), 'record'))
    into v_title, v_noun
    from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id;

  v_me := custom.query_principal();

  for r in
    select * from custom.record c
     where c.organization_id = p_organization_id
       and c.table_id = p_table_id
       and c.deleted_at is null
       and c.data_class = 'record'
       and coalesce(c.data ->> v_key, '') is distinct from v_skey
       and c.id in (select custom.query_visible_ids(p_organization_id, p_table_id, 'viewer'))
     order by c.created_at
     -- A CEILING, AND IT SAYS WHEN IT HIT ONE. A board with forty thousand cards would
     -- otherwise turn a keystroke in a text box into a full table scan.
     limit 501
  loop
    v_looked := v_looked + 1;
    exit when v_looked > 500;
    v_considered := v_considered + 1;
    -- The card AS IT WOULD BE after the move, judged against where it is now — the same
    -- pair `custom.pipeline_transition_refusal` builds, so the preview and the refusal are
    -- asking the same question of the same values.
    v_doc := jsonb_set(r.data, array[v_key], to_jsonb(v_skey));
    if v_me is not null then
      v_level := custom.effective_level(v_me, p_organization_id, r.id, 'record');
    end if;
    v_ctx := jsonb_build_object('previous_values', r.data,
                                'record_id', to_jsonb(r.id),
                                'table_id',  to_jsonb(p_table_id),
                                'actor_level', to_jsonb(v_level));
    if custom.rule_truth(custom.rule_eval(p_organization_id, v_expr, v_doc, v_ctx)) is false then
      v_refused := v_refused + 1;
      if jsonb_array_length(v_examples) < 3 then
        v_examples := v_examples || jsonb_build_object(
          'record_id', r.id,
          'title', custom._card_words(p_organization_id, r.data ->> v_title, v_noun));
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'is_pipeline',  true,
    'stage',        v_skey,
    'considered',   v_considered,
    'refused',      v_refused,
    'examples',     v_examples,
    'truncated',    v_looked > 500,
    'on_fail',      coalesce(nullif(lower(p_gate ->> 'on_fail'), ''), 'refuse'),
    'noun',         v_noun);
end;
$function$

;
