-- REACH — THE THIRTY-SIX VERBS A PERSON MAY NOW CALL.
--
-- Measured live on 2026-09-19: 28 of the 263 functions in schema `custom` held
-- EXECUTE for `authenticated`. Everything a person actually DOES with records
-- once they exist — rename, retype, merge, split, reparent, promote, demote,
-- extract, delete, purge; query across homes, by coordinates, as of a date, by
-- rollup; add a home, own a relation, follow one; the aggregates; import and
-- export; the document templates — was reachable only as the role that owns the
-- store. The frontend talks to this database directly with supabase-js and never
-- through the Python server, so "server-only" meant "nobody".
--
-- WHAT THIS FILE DOES TO EACH OF THEM, and it is the same two things every time:
--
--   1. SECURITY DEFINER, where it was not already. `authenticated` holds SELECT
--      on ZERO tables in schema `custom` and that stays true — the store is
--      reached through its doors or not at all — so a SECURITY INVOKER function
--      granted to a client would raise "permission denied for table record" and
--      be a door in name only.
--
--   2. THE DECISION, FIRST, IN THE BODY. Every one of them now opens with
--      `custom.assert_client_may_reach(organization, door)` — the organization
--      wall — and the ones that name a record or a Table follow it with
--      `custom.assert_client_may_change` (a write) or `custom.assert_client_may_open`
--      (a read) at the level that verb needs: editor to change a record, admin to
--      restructure a Table, viewer to read one. Both are the ONE ladder,
--      `custom.has_visibility`, which is the same question `custom.read_record`
--      asks. `platform.door_body_must_decide` enforces this on the door rows in
--      the file beside this one; it is written here because a door row is not a
--      door check.
--
-- EIGHT of them were `LANGUAGE sql` and are now `LANGUAGE plpgsql` with the same
-- statement inside a `return query` / `return (...)`: a decision has to run
-- BEFORE the read, and a SQL function has no "before". They open with
-- `#variable_conflict use_column` so that a bare column name that matches one of
-- the RETURNS TABLE names still means the column, exactly as it did.
--
-- NOTHING ELSE MOVED. Every refusal, every message, every line of logic inside
-- these bodies is the byte it was; the diff is the header and the prologue.
--
-- ADDITIVE: it replaces 35 functions. It grants nothing, revokes nothing, drops
-- nothing. The grants are `custom.reopen_declared_doors()` in the next file, and
-- they follow from the declared door rows rather than being decided here.
--
-- THE INVERSE: migrations/inverse/reach_the_client_doors_of_the_store_down.sql.

-- based-on: custom.agg_explain(uuid, uuid, jsonb, jsonb, jsonb, jsonb, text) 5284403ef6b3fda2031ec2fb2c20ed0615756b843f19b98c3431390d3187d68b
-- based-on: custom.doc_render_document(uuid, uuid, uuid) 99cfc06a6eb67cdecc12aced51ff2c78c96310e22ad1cb565d8e64c780ee29ac
-- based-on: custom.doc_sign(uuid, uuid, text, text, uuid) af68fa421a232460883e48a7471ed6b3996f49e0bb4f31f0f7f19f7305307d4d
-- based-on: custom.doc_template_save(uuid, uuid, text, text, uuid) 254f2ce97cfdde800e4037e02fc62aaa53a344738b467bb3bd53d8b2ff6b5092
-- based-on: custom.home_add(uuid, uuid, uuid) 242f992f429bef399e1ce3785988dd69ad7d87568ff8a1141442fb425bb1a470
-- based-on: custom.io_export(uuid, uuid, text[], integer, text) 02f6cc91486ce3431335c274f76e436aaa6bc189c9302e5f65e2b791b94ef9fe
-- based-on: custom.io_export_csv(uuid, uuid, text[], integer, text, text) 2c8a97d99576d5a15a7bc7682030337f97f65a6c73a3e24bc724fee425b1935b
-- based-on: custom.io_import_open(uuid, uuid, text, text, jsonb) c70b334c4433283b5c6e26cd5d5ea71fcadf52ef2fd6a1bad228c07f942d7d18
-- based-on: custom.io_import_rows(uuid, uuid, jsonb, jsonb) 7e335fbd72ad4cdec59cf2929b1c6eb16746e980368502f7fd58abbb8a82d1fa
-- based-on: custom.io_proposal_accept(uuid, uuid, text, text, text) 04f2c20d737857d5dd9b8de2f25cdd1c5cdcef77deb633a2847b9787556eb928
-- based-on: custom.io_proposal_reject(uuid, uuid, text) 46620d06af8f94f81e8d3f880e5f0223c0af9bb3649cff5213070ecab9b23329
-- based-on: custom.migrate_delete(uuid, uuid, text) 8807dcffcb2504a0c64406a7faa5ab58dca4ccf8233a398e8e1e06b945c5c5f2
-- based-on: custom.migrate_demote(uuid, uuid, text) 032ba421c3e8cf1bbecad9386a71c5417faeb3c21d797dbc8015ee6accd096aa
-- based-on: custom.migrate_extract_parent(uuid, uuid, uuid, text[], text) 08f868d1a8f9bed2d9f3fbfd9ce87875ac26d83681f78d98b786534206dff969
-- based-on: custom.migrate_merge(uuid, uuid, uuid, text) d627f4e4ae9da1aae39256f0bdd6d834da877d207476a14edc0611ddb79676dd
-- based-on: custom.migrate_promote(uuid, uuid, text) 6aa79752ac8919d91c6b876664ef9c3dd8a5ed78df2306e2b1829a021572f877
-- based-on: custom.migrate_rename(uuid, uuid, text, text) eef76bb16001adc6bd7ec154c22b8facdac61eb0a5edda209905bc47d6d61eb8
-- based-on: custom.migrate_reparent(uuid, uuid, uuid, text) df65cc9d949ed3328bc7cda74644dc0a80ab4f46023c82eb4ccf1b4e54000d55
-- based-on: custom.migrate_retype(uuid, uuid, text, text) 91c17bba65010f238ea0dc236abe96a86d1cb6d0bdc9005582ed3e03c794e262
-- based-on: custom.migrate_split(uuid, uuid, text[], text) 0806f5749af6a4efbb61aac25ff5107ea279f7d74735144c5872607cff2d5c8b
-- based-on: custom.query_across_homes(uuid, uuid, integer, integer, text) 4e451d13b446c96af956ca8b77d2e038ab77b4bf6caabdf8faf95524ceac3d41
-- based-on: custom.query_by_coordinates(uuid, uuid, jsonb, integer, integer, text) 6840d8d4ad375bd45d74b5a6f2fb84fd35f1d8ccbdfe853d8ff2e47d412bd22a
-- based-on: custom.query_can_see(uuid, uuid, text) d0e29ba1c6720be29c69b77ff7813d5894aba69e8dd1805bdf3e5586ef319077
-- based-on: custom.query_record_as_of(uuid, uuid, timestamp with time zone, date, text) 07f3312222b698074af3a777119a6ad01455974a7fd258ec55aace66dce4d80d
-- based-on: custom.query_relation_edges(uuid, text, text) 67591bdc98aa69427be667b6d1890b8e452f55df9d95c9ac6302c19df402f541
-- based-on: custom.query_rollup(uuid, uuid[], text, text, integer, text) 1781ca2f5c215876789a80b3a52fc36494b6be735f39267e232f8f6be2ae23c1
-- based-on: custom.query_rollup_sum(uuid, uuid[], text, text, text, integer, text) 8a7552cea35daf344ba09aab273eb424782bce18cc897432a35c4a4009782976
-- based-on: custom.query_table_as_of(uuid, uuid, timestamp with time zone, date, integer, integer, text) e39f716f2bcb822c483ec1a0e483f46337559b55a215cdb37176a780575ae48c
-- based-on: custom.query_table_homes(uuid, uuid) 54a7e057daf5be6589f86ebd87360dea24aa839f268fe5ef4c778d31dcc25591
-- based-on: custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text) 5ad0b62974e68eec00620fae912d83b73cd188ce32aa6916ee1944a182c517f9
-- based-on: custom.record_reparent(uuid, uuid, uuid) 6085749ad4a6cde9c0926329f14fd336f4b5826754d358f48a074dc408148a94
-- based-on: custom.record_values_versioned(uuid, uuid) 6c54f5e5c1dbdd3aee134955796069bca316cb84bd951855776c5e490a36dc03
-- based-on: custom.relation_own(uuid, uuid, uuid) 2d902bca6b0965e2478bfa37f819f9c8a1fdfeba219e9fcd591265cd37e5b776
-- based-on: custom.relation_targets(uuid, uuid, text) f8c9ff17d8e58f797510983abfe6569df09041a61e2db28c7d4061e4acd803a2
-- based-on: custom.tables_at_home(uuid, uuid[]) f0f2012208f6450b635a7606fa831b65a2b73a7c4c1166503bde2cb4cebca600

set lock_timeout = '5s';
set statement_timeout = '600s';

CREATE OR REPLACE FUNCTION custom.agg_explain(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_required text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_plan jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.agg_explain');
  execute 'explain (analyze, format json, timing off, summary off) ' ||
          custom.agg_sql(p_organization_id, p_table_id, p_group_by, p_measures,
                         p_bucket, p_filter, 200, p_required)
    into v_plan;
  return v_plan;
end;
$function$;


CREATE OR REPLACE FUNCTION custom.doc_render_document(p_organization_id uuid, p_template_id uuid, p_record_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_body text;
  v_ver  integer;
  v_tbl  uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_render_document');
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.doc_render_document', 'viewer'::public.permission_level, 'record');
  -- THE DOOR. One call to the ONE predicate, which resolves this file's guard
  -- (custom/system_enabled) through platform.knob_resolve and judges custom.caller_role().
  perform custom.assert_store_door(p_organization_id, 'custom.doc_render_document');

  select coalesce((t.data ->> 'template_version')::integer, 1),
         (t.data ->> 'renders_table_id')::uuid
    into v_ver, v_tbl
    from custom.record t
   where t.organization_id = p_organization_id and t.id = p_template_id
     and t.data_class = 'doc_template' and t.deleted_at is null;
  if v_ver is null then
    raise exception 'there is no document template % in this organization', p_template_id
      using errcode = '02000';
  end if;

  v_body := custom.doc_render_body(p_organization_id, p_template_id, p_record_id);

  return custom.doc_render_write(p_organization_id, p_template_id, p_record_id, v_tbl,
                                 v_ver, v_body, custom.doc_content_hash(v_body));
end;
$function$;


CREATE OR REPLACE FUNCTION custom.doc_sign(p_organization_id uuid, p_render_id uuid, p_field_key text, p_signer_name text, p_signer_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc    record;
  v_field  jsonb;
  v_have   jsonb;
  v_prior  uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_sign');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.doc_sign', 'editor'::public.permission_level, 'record');
  -- THE DOOR. One call to the ONE predicate.
  perform custom.assert_store_door(p_organization_id, 'custom.doc_sign');

  if p_organization_id is null or p_render_id is null then
    raise exception 'custom.doc_sign: organization_id and the document version are both required'
      using errcode = '22004';
  end if;

  select d.record_id, d.table_id, d.content_hash, d.template_version, d.template_id
    into v_doc
    from custom.doc_render d
   where d.organization_id = p_organization_id and d.id = p_render_id
     and d.deleted_at is null;
  if v_doc.record_id is null then
    raise exception 'there is no document % in this organization to sign', p_render_id
      using errcode = '02000',
            hint = 'A signature seals a rendered document version. Render one first: custom.doc_render_document(organization, template, record).';
  end if;

  -- VAL-10: the Value a signature IS. It lives on a Field of the record's own Table, and
  -- that Field is a text Field whose format is signature — FLD-1's closed behaviour set,
  -- unwidened. A Field that is not one is refused BY NAME, naming the ones that are.
  select f.data into v_field
    from custom.field f
   where f.organization_id = p_organization_id
     and f.entity_definition_id = v_doc.table_id
     and f.key = p_field_key;
  if v_field is null then
    raise exception 'there is no field "%" on the table this document was rendered from', p_field_key
      using errcode = '23503', hint = 'VAL-10: a signature is a Value, so it belongs to a Field.';
  end if;
  if not custom.doc_signature_field_ok(v_field) then
    raise exception '"%" is a % field, and a signature is written on a text field whose format is signature',
                    coalesce(v_field ->> 'label', p_field_key), coalesce(v_field ->> 'type', 'nothing')
      using errcode = '23514',
            hint = format('VAL-10 through FLD-1''s closed set: one of list, range, text, relation, formula, and a signature is text. The signature fields on this table are: %s.',
                          coalesce((select string_agg(format('%s (%s)', g.label, g.key), ', ' order by g.sort, g.key)
                                      from custom.field g
                                     where g.organization_id = p_organization_id
                                       and g.entity_definition_id = v_doc.table_id
                                       and custom.doc_signature_field_ok(g.data)),
                                   'none yet - declare one with type text and format signature'));
  end if;

  -- ③ THE DOOR REFUSES TO OVERWRITE A SIGNED VALUE. A seal already standing behind this
  -- Field's value on this record is what makes it immutable through every door this lane
  -- owns; ④ in this file's header names the one path that is not covered and who owns it.
  select s.id into v_prior
    from custom.doc_signature s
   where s.organization_id = p_organization_id
     and s.record_id = v_doc.record_id
     and s.field_key = p_field_key
     and s.deleted_at is null
   limit 1;
  if v_prior is not null then
    raise exception '"%" on this record is already signed, and a signature is immutable once signed',
                    coalesce(v_field ->> 'label', p_field_key)
      using errcode = '23505',
            hint = 'VAL-10. Every seal on this record stays exactly as it was made. A further agreement is a further Field with its own signature, or a further document version with its own seal - never a rewriting of this one.';
  end if;

  -- THE VALUE. Written through the store's OWN door, so the envelope law stamps its version,
  -- its author and its time exactly as it does for every other Value, and the interned
  -- provenance carries the two facts the CLOSED envelope has no key for: the document
  -- version this signature sealed, and its hash.
  perform custom.record_update(p_organization_id, v_doc.record_id,
    jsonb_build_object(
      '_actor', 'user',
      p_field_key, to_jsonb(btrim(p_signer_name)),
      '_values', jsonb_build_object(
        p_field_key, jsonb_build_object(
          'src', jsonb_build_object(
            'kind',             'signed_document',
            'render_id',        p_render_id,
            'template_id',      v_doc.template_id,
            'document_version', v_doc.template_version,
            'document_hash',    v_doc.content_hash)))));

  -- THE SEAL, through this table's one write door.
  return custom.doc_signature_write(p_organization_id, p_render_id, v_doc.record_id,
                                    p_field_key, p_signer_name, p_signer_user_id,
                                    v_doc.content_hash, v_doc.template_version);
end;
$function$;


CREATE OR REPLACE FUNCTION custom.doc_template_save(p_organization_id uuid, p_table_id uuid, p_name text, p_body text, p_template_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id      uuid;
  v_bad     record;
  v_tname   text;
  v_ver     integer;
  v_labels  text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_template_save');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.doc_template_save', 'editor'::public.permission_level, 'table');
  -- THE DOOR. One call to the ONE predicate. This is a SECURITY DEFINER door, so
  -- `current_user` in here is already the definer; `custom.assert_store_door` judges
  -- `custom.caller_role()` — what the caller actually held — and resolves the guard this
  -- file is headed with, custom/system_enabled, through platform.knob_resolve.
  perform custom.assert_store_door(p_organization_id, 'custom.doc_template_save');

  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.doc_template_save: organization_id and the table the template renders are both required'
      using errcode = '22004';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'a document template needs a name - it is what a person picks it by'
      using errcode = '23514', hint = 'REC-68.';
  end if;

  select t.data ->> 'name' into v_tname
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_tname is null then
    raise exception 'this template says it renders records of something that is not a table of this organization'
      using errcode = '23503',
            hint = 'REC-68: a template renders the records of ONE Table, and its tokens are that Table''s Fields.';
  end if;

  -- ── REC-68, THE REFUSAL. A token naming no Field is refused AT SAVE, BY NAME. ──────
  -- It names the token it refused and the Fields that ARE available, because a refusal
  -- that does not say what to write instead is a dead end.
  select * into v_bad
    from custom.doc_unresolved_tokens(p_organization_id, p_table_id, p_body)
   order by raw
   limit 1;
  if v_bad.raw is not null then
    select string_agg(format('%s (%s)', f.label, f.id), ', ' order by f.sort, f.key)
      into v_labels
      from custom.field f
     where f.organization_id = p_organization_id
       and f.entity_definition_id = p_table_id;
    raise exception 'the template "%" points at % and %', btrim(p_name), v_bad.raw, v_bad.why
      using errcode = '23503',
            hint = format('REC-68: a token names a Field of %s by its id, never by a name, so renaming a field never breaks a template. The fields you can merge here are: %s.',
                          v_tname, coalesce(v_labels, 'none - this table has declared no fields yet'));
  end if;

  -- ── the positive path: it is a Record, written the way every Record is written ─────
  if p_template_id is null then
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, null, 'doc_template', jsonb_build_object(
      'renders_table_id', p_table_id,
      'name', btrim(p_name),
      'body', coalesce(p_body, ''),
      'template_version', 1))
    returning id into v_id;
    return v_id;
  end if;

  -- REC-68 + VAL-10: EVERY SAVE OF AN EXISTING TEMPLATE IS A NEW TEMPLATE VERSION. A
  -- signature seals a document version (VAL-10), so a template whose body could move under
  -- a sealed document without the version moving would make the seal meaningless.
  select coalesce((r.data ->> 'template_version')::integer, 1) into v_ver
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_template_id
     and r.data_class = 'doc_template' and r.deleted_at is null;
  if v_ver is null then
    raise exception 'there is no document template % in this organization', p_template_id
      using errcode = '02000';
  end if;

  update custom.record r
     set data = r.data
                || jsonb_build_object('renders_table_id', p_table_id,
                                      'name', btrim(p_name),
                                      'body', coalesce(p_body, ''),
                                      'template_version', v_ver + 1)
   where r.organization_id = p_organization_id and r.id = p_template_id
  returning r.id into v_id;
  return v_id;
end;
$function$;


CREATE OR REPLACE FUNCTION custom.home_add(p_organization_id uuid, p_table_id uuid, p_home_record_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id        uuid;
  v_is_table  boolean;
  v_home_type text;
  v_already   uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.home_add');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.home_add', 'admin'::public.permission_level, 'table');
  if p_organization_id is null or p_table_id is null or p_home_record_id is null then
    raise exception 'custom.home_add: the organization, the table and the home record are all required'
      using errcode = '22004';
  end if;

  select (r.table_id = custom.table_kernel_id()) into v_is_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_table_id;
  if v_is_table is not true then
    raise exception 'that is not a table, so it cannot be given another home'
      using errcode = '23503', hint = 'REC-3: additional Homes are placements of a Table.';
  end if;

  -- REC-11: a detail Table's records cannot be Homes.
  select t.data ->> 'type' into v_home_type
    from custom.record h
    join custom.record t
      on t.organization_id = h.organization_id and t.id = h.table_id
   where h.organization_id = p_organization_id and h.id = p_home_record_id;
  if v_home_type is null then
    raise exception 'that home record is not in this organization'
      using errcode = '23503', hint = 'REC-3: a Home is a Record of this organization.';
  end if;
  if v_home_type = 'detail' then
    raise exception 'a detail record cannot be a home'
      using errcode = '23514',
            hint = 'REC-11: a detail table inherits only - its records take no direct shares and cannot be Homes.';
  end if;

  -- REC-3: the same Table in the same Record twice is one placement, not two. Announced by
  -- name rather than quietly de-duplicated.
  select hr.relation_id into v_already
    from custom.home_relations() hr
   where hr.organization_id = p_organization_id
     and hr.table_id = p_table_id
     and hr.home_record_id = p_home_record_id
   limit 1;
  if v_already is not null then
    raise exception 'that table already has a home there'
      using errcode = '23505',
            hint = 'REC-3: a Table appears in a Record once. Nothing was written and the existing placement is unchanged.';
  end if;

  -- REC-26: a referenced CARRYING relation, from the Home record to the Table record.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'relation',
          jsonb_build_object('kind', 'referenced', 'carrying', true, 'role', 'home',
                             'from', p_home_record_id, 'to', p_table_id))
  returning id into v_id;
  return v_id;
end;
$function$;


CREATE OR REPLACE FUNCTION custom.io_export(p_organization_id uuid, p_table_id uuid, p_columns text[] DEFAULT NULL::text[], p_limit integer DEFAULT 10000, p_required text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cols  text[];
  v_token text;
  v_rows  jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_export');
  perform custom.assert_store_door(p_organization_id, 'custom.io_export');

  select t.data ->> 'token' into v_token from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id;

  -- The column list is the TABLE's own Fields unless the caller named one. Exporting whatever
  -- keys happen to be in the documents would ship whatever an older shape left behind.
  v_cols := coalesce(p_columns,
    (select array_agg(f.data ->> 'key' order by coalesce((f.data ->> 'sort')::int, 0),
                                                 f.data ->> 'key')
       from custom.applicable_fields(p_organization_id, p_table_id, null) f),
    (select array_agg(k order by k)
       from (select distinct jsonb_object_keys(r.data) k
               from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = p_table_id
                and r.deleted_at is null) ks
      where left(k, 1) <> '_'),
    array[]::text[]);

  -- THE READ DOOR DECIDES WHICH ROWS. `custom.query_visible_ids` answers SETOF uuid, so it is
  -- an id set and not a joinable row source; an export that selected from custom.record
  -- directly would hand a viewer every row in the organization, which is the single worst bug
  -- an export can have.
  select coalesce(jsonb_agg(r.doc order by r.created_at, r.id), '[]'::jsonb) into v_rows
    from (select rec.id, rec.created_at,
                 (select coalesce(jsonb_object_agg(c, coalesce(lv.vals -> c, 'null'::jsonb)),
                                  '{}'::jsonb)
                    from unnest(v_cols) c) as doc
            from custom.record rec
     cross join lateral (select custom.record_values(p_organization_id, rec.id) as vals) lv
           where rec.organization_id = p_organization_id
             and rec.table_id = p_table_id
             and rec.deleted_at is null
             and rec.id in (select custom.query_visible_ids(p_organization_id, p_table_id, p_required))
           order by rec.created_at, rec.id
           limit greatest(1, least(coalesce(p_limit, 10000), 100000))) r;

  return jsonb_build_object('table_id', p_table_id, 'token', v_token,
                            'columns', to_jsonb(v_cols), 'rows', v_rows);
end;
$function$;


CREATE OR REPLACE FUNCTION custom.io_export_csv(p_organization_id uuid, p_table_id uuid, p_columns text[] DEFAULT NULL::text[], p_limit integer DEFAULT 10000, p_delimiter text DEFAULT chr(44), p_required text DEFAULT 'viewer'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_export jsonb := custom.io_export(p_organization_id, p_table_id, p_columns, p_limit, p_required);
  v_cols   text[];
  v_out    text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_export_csv');
  select array_agg(value #>> '{}') into v_cols from jsonb_array_elements(v_export -> 'columns');
  v_cols := coalesce(v_cols, array[]::text[]);
  select string_agg(custom.io_csv_escape(c, p_delimiter), p_delimiter) into v_out from unnest(v_cols) c;
  v_out := coalesce(v_out, '');
  -- One pass, header then rows, every value escaped by the same function the parser reads back.
  select v_out || coalesce(string_agg(chr(10) || line, ''), '')
    into v_out
    from (select (select string_agg(custom.io_csv_escape(
                           case when jsonb_typeof(row -> c) in ('null') or row -> c is null then null
                                when jsonb_typeof(row -> c) = 'string' then row ->> c
                                else row -> c #>> '{}' end, p_delimiter), p_delimiter)
                    from unnest(v_cols) c) as line
            from jsonb_array_elements(v_export -> 'rows') row) lines;
  return v_out;
end;
$function$;


CREATE OR REPLACE FUNCTION custom.io_import_open(p_organization_id uuid, p_table_id uuid, p_format text DEFAULT 'csv'::text, p_source_name text DEFAULT NULL::text, p_source_columns jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_open');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.io_import_open', 'editor'::public.permission_level, 'table');
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_open');
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.io_import_open: an import belongs to one organization and one Table; both are required'
      using errcode = '22004';
  end if;
  if coalesce(p_format, '') not in ('csv', 'xlsx') then
    raise exception 'custom.io_import_open: format is csv or xlsx, not "%". The parse differs; nothing after it does.', p_format
      using errcode = '22023';
  end if;
  insert into custom.io_import (organization_id, table_id, format, source_name, source_columns, state)
  values (p_organization_id, p_table_id, p_format, p_source_name,
          coalesce(p_source_columns, '[]'::jsonb), 'open')
  returning id into v_id;
  return v_id;
end;
$function$;


CREATE OR REPLACE FUNCTION custom.io_import_rows(p_organization_id uuid, p_import_id uuid, p_rows jsonb, p_mapping jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_run       custom.io_import;
  v_row       jsonb;
  v_doc       jsonb;
  v_key       text;
  v_val       jsonb;
  v_mapped    text;
  v_seen      integer := 0;
  v_written   integer := 0;
  v_refusals  jsonb := '[]'::jsonb;
  v_unmapped  jsonb := '{}'::jsonb;
  v_proposals jsonb := '[]'::jsonb;
  v_fields    text[];
  v_id        uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_rows');
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_rows');
  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then
    raise exception 'custom.io_import_rows: no open import run % for this organization', p_import_id
      using errcode = '23503';
  end if;

  select coalesce(array_agg(f.key), array[]::text[]) into v_fields
    from custom.field f where f.organization_id = p_organization_id;

  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_seen := v_seen + 1;
    v_doc := '{}'::jsonb;
    for v_key, v_val in select key, value from jsonb_each(v_row) loop
      -- The mapping is authored (a person chose), or it is the identity (the header already
      -- spells a Field key). Both are the same row here: a mapped column is a mapped column.
      v_mapped := coalesce(p_mapping ->> v_key, v_run.mapping ->> v_key,
                           case when v_key = any (v_fields) then v_key else null end);
      if v_mapped is null then
        -- DOOR-14: not an error, an OFFER. Remember it with a sample so the proposal can say
        -- what the column actually looked like rather than merely that it existed.
        v_unmapped := v_unmapped || jsonb_build_object(
          v_key, coalesce(v_unmapped -> v_key, '[]'::jsonb) ||
                 case when jsonb_array_length(coalesce(v_unmapped -> v_key, '[]'::jsonb)) < 5
                      then jsonb_build_array(v_val) else '[]'::jsonb end);
      else
        v_doc := v_doc || jsonb_build_object(v_mapped, v_val);
      end if;
    end loop;

    begin
      -- THE ONE WRITE DOOR. Validation, the value envelope, provenance, the rules and the
      -- outbox all hang off this call; an INSERT here would skip every one of them.
      v_id := custom.record_write(p_organization_id, v_run.table_id,
                                  v_doc || jsonb_build_object('_actor', 'system'));
      v_written := v_written + 1;
    exception when others then
      -- A refusal is RECORDED, never swallowed and never fatal to the run. An import that
      -- half worked must be able to say which half, by row number and by reason.
      v_refusals := v_refusals || jsonb_build_array(
        jsonb_build_object('row', v_seen, 'sqlstate', sqlstate, 'reason', sqlerrm));
    end;
  end loop;

  -- The proposals, built once at the end from everything the run saw.
  select coalesce(jsonb_agg(jsonb_build_object(
           'column', u.key,
           'samples', u.value,
           'inferred_type', custom.io_infer_type(u.value),
           'state', 'proposed')), '[]'::jsonb)
    into v_proposals
    from jsonb_each(v_unmapped) u;

  update custom.io_import
     set rows_seen    = rows_seen + v_seen,
         rows_written = rows_written + v_written,
         refusals     = refusals || v_refusals,
         proposals    = case when v_proposals = '[]'::jsonb then proposals else v_proposals end,
         mapping      = mapping || coalesce(p_mapping, '{}'::jsonb),
         state        = 'written'
   where organization_id = p_organization_id and id = p_import_id;

  return jsonb_build_object('import_id', p_import_id, 'rows_seen', v_seen,
                            'rows_written', v_written, 'refusals', v_refusals,
                            'proposals', v_proposals);
end;
$function$;


CREATE OR REPLACE FUNCTION custom.io_proposal_accept(p_organization_id uuid, p_import_id uuid, p_column text, p_type text DEFAULT NULL::text, p_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_run      custom.io_import;
  v_proposal jsonb;
  v_type     text;
  v_word     text;
  v_format   text;
  v_key      text;
  v_field_id uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_proposal_accept');
  perform custom.assert_store_door(p_organization_id, 'custom.io_proposal_accept');
  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then
    raise exception 'custom.io_proposal_accept: no import run % for this organization', p_import_id
      using errcode = '23503';
  end if;

  select p into v_proposal
    from jsonb_array_elements(v_run.proposals) p
   where p ->> 'column' = p_column
   limit 1;
  if v_proposal is null then
    raise exception 'custom.io_proposal_accept: import run % proposed no column "%". Its proposals are %.',
      p_import_id, p_column, coalesce((select string_agg(p ->> 'column', ', ')
                                         from jsonb_array_elements(v_run.proposals) p), '(none)')
      using errcode = '23503';
  end if;
  if v_proposal ->> 'state' = 'accepted' then
    raise exception 'custom.io_proposal_accept: "%" was already accepted on this run. Accepting twice would mint a second Field with the same key.', p_column
      using errcode = '23505';
  end if;

  -- THE PROPOSAL SPEAKS HUMAN; THE FIELD SPEAKS BEHAVIOUR. What a person sees offered is
  -- "this looks like a number" — but `custom._field_shape_guard` holds a Field's `type` to
  -- exactly five BEHAVIOURS (list, range, text, relation, formula), because "number",
  -- "currency" and "percent" are one behaviour wearing three units. So the human word is
  -- translated here, once, and the flavour is kept where the store keeps flavour: `format`.
  v_word := coalesce(nullif(btrim(coalesce(p_type, '')), ''), v_proposal ->> 'inferred_type', 'text');
  if v_word in ('list', 'range', 'text', 'relation', 'formula') then
    v_type := v_word;                    -- the caller named a behaviour outright
    v_format := null;
  elsif v_word = 'number' then
    v_type := 'range'; v_format := null;
  elsif v_word = 'date' then
    v_type := 'range'; v_format := 'date';
  elsif v_word = 'email' then
    v_type := 'text';  v_format := 'email';
  elsif v_word = 'url' then
    v_type := 'text';  v_format := 'url';
  elsif v_word = 'phone' then
    v_type := 'text';  v_format := 'phone';
  else
    -- Everything else, `checkbox` included: TEXT. A checkbox is a two-item list and a list
    -- needs an options Table nobody chose, so proposing one would mint a Field a person then
    -- has to repair. Conservative here costs one dropdown; wrong here costs a data repair.
    v_type := 'text';  v_format := null;
  end if;
  -- The key is the column's own name, lowered and de-spaced, because that is what the next
  -- import of the same file will match on without anyone authoring a mapping.
  v_key := regexp_replace(lower(btrim(p_column)), '[^a-z0-9]+', '_', 'g');
  v_key := btrim(v_key, '_');
  if v_key = '' then
    raise exception 'custom.io_proposal_accept: column "%" leaves no usable Field key', p_column
      using errcode = '22023';
  end if;

  -- DOOR-14 IS "ADD THIS AS A FIELD", AND A TABLE OWNS ITS FIELD LIST.
  -- `custom._field_definition_write` refuses a Field whose Table does not declare its key —
  -- "the table does not declare a field called X, declare it there first" — and that rule is
  -- right: the Table document is what says which fields exist, and a Field record that
  -- appeared beside it without being declared would be a field only half the system knew
  -- about. So accepting a proposal declares it on the Table FIRST, through the record write
  -- door like any other change, and only then mints the Field.
  if not exists (select 1 from custom.record t, jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) f
                  where t.organization_id = p_organization_id and t.id = v_run.table_id
                    and f ->> 'name' = v_key) then
    perform custom.record_update(
      p_organization_id, v_run.table_id,
      jsonb_build_object('fields',
        coalesce((select t.data -> 'fields' from custom.record t
                   where t.organization_id = p_organization_id and t.id = v_run.table_id),
                 '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('name', v_key))),
      null);
  end if;

  -- THE SAME DOOR A HAND-MADE FIELD GOES THROUGH. An accepted proposal is a Field, not a
  -- second kind of Field, so nothing downstream ever has to ask where a Field came from.
  v_field_id := custom.record_write(
    p_organization_id, custom.field_kernel_id(),
    -- A FIELD DOCUMENT IS NOT THREE KEYS. `custom._field_shape_guard` requires every Field to
    -- SAY the things a Field has to say — what it is a field OF, whether it holds one value or
    -- many, whether it is required, whether it is dated, its rules (even empty), where its
    -- values come from, and how sensitive they are. An accepted proposal must produce the same
    -- complete document a hand-made Field produces, or it is a second kind of Field after all.
    jsonb_build_object('entity_definition_id', v_run.table_id,
                       'key', v_key,
                       'label', coalesce(nullif(btrim(coalesce(p_label, '')), ''), btrim(p_column)),
                       'type', v_type,
                       'format', v_format,
                       'multi', false,
                       'required', false,
                       'dated', false,
                       'sort', 0,
                       'rules', '[]'::jsonb,
                       'config', '{}'::jsonb,
                       'depends_on', '[]'::jsonb,
                       'applies_to_types', '[]'::jsonb,
                       -- `manual`, because that is the closed vocabulary's word for "a person
                       -- fills this in". WHERE it came from is source_config, below.
                       'source', 'manual',
                       'source_config', jsonb_build_object('origin', 'import_proposal',
                                                           'import_id', p_import_id,
                                                           'source_column', p_column),
                       -- `internal` is the conservative default: a column nobody has classified
                       -- is the organization's business and not the world's.
                       'sensitivity', 'internal',
                       'context_policy', 'include',
                       '_actor', 'system'));

  update custom.io_import
     set proposals = (select jsonb_agg(case when p ->> 'column' = p_column
                                            then p || jsonb_build_object('state', 'accepted',
                                                                         'field_id', v_field_id)
                                            else p end)
                        from jsonb_array_elements(proposals) p),
         mapping   = mapping || jsonb_build_object(p_column, v_key)
   where organization_id = p_organization_id and id = p_import_id;

  return v_field_id;
end;
$function$;


CREATE OR REPLACE FUNCTION custom.io_proposal_reject(p_organization_id uuid, p_import_id uuid, p_column text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_proposal_reject');
  perform custom.assert_store_door(p_organization_id, 'custom.io_proposal_reject');
  update custom.io_import
     set proposals = (select jsonb_agg(case when p ->> 'column' = p_column
                                            then p || jsonb_build_object('state', 'rejected')
                                            else p end)
                        from jsonb_array_elements(proposals) p)
   where organization_id = p_organization_id and id = p_import_id;
  -- A rejected proposal STAYS on the run. Deleting it would make the same column come back as
  -- a fresh offer on every future import of the same file, which is how people learn to ignore
  -- a prompt.
  return found;
end;
$function$;


CREATE OR REPLACE FUNCTION custom.migrate_delete(p_organization_id uuid, p_record_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row     custom.record%rowtype;
  v_cascade uuid[];
  v_log     uuid;
  v_took    uuid[] := '{}';
  v_child   uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_delete');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.migrate_delete', 'editor'::public.permission_level, 'record');
  -- THE SWITCH. Every line below is behind custom/system_enabled: custom.assert_store_door
  -- resolves that knob and, while it is false, this store takes writes only from the role that
  -- owns custom.record. The switch never removes a check; it closes the door.
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_delete');

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to delete.', p_record_id
      using errcode = '02000',
            hint = 'REC-23: a record already deleted is still here and still reversible — custom.record_restore(organization, record) brings it back until its Table''s retention runs out.';
  end if;

  -- THE SAME RULE THE DOOR WILL APPLY, asked not to change anything, so the inverse names
  -- exactly the records the door is about to take. It raises the refusals here too, before
  -- a Migration row exists for a delete that is not going to happen.
  v_cascade := custom.delete_cascade_closure(p_organization_id, p_record_id);

  v_log := history.migration_record(p_organization_id, 'delete', v_row.data_class, p_record_id,
             jsonb_build_object('kind', 'restore', 'record_id', p_record_id::text,
                                'also', to_jsonb(v_cascade)),
             coalesce(p_note, format('deleted with %s record(s) it contained or owned', coalesce(array_length(v_cascade, 1), 0))));

  perform custom.record_delete(p_organization_id, p_record_id);

  foreach v_child in array v_cascade loop
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is not null) then
      v_took := v_took || v_child;
    end if;
  end loop;

  return jsonb_build_object('verb', 'delete', 'record_id', p_record_id,
                            'migration_id', v_log, 'took_with_it', to_jsonb(v_took),
                            'cascaded', coalesce(array_length(v_took, 1), 0),
                            'reversible_until', 'the end of this table''s retention (REC-23)',
                            'at', now());
end;
$function$;


CREATE OR REPLACE FUNCTION custom.migrate_demote(p_organization_id uuid, p_table_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_was text;
  v_log uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_demote');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.migrate_demote', 'admin'::public.permission_level, 'table');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_demote');
  v_was := custom.table_storage(p_organization_id, p_table_id);
  if v_was is null then
    raise exception 'That is not a table of this organization, so there was nothing to demote.'
      using errcode = '23503';
  end if;

  v_log := history.migration_record(p_organization_id, 'demote', 'table', p_table_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_table_id::text,
                                'patch', jsonb_build_object('storage', v_was)),
             coalesce(p_note, format('moved to light storage from %s', v_was)));

  -- Demoting leaves the promoted columns' INDEXES alone deliberately: dropping them is not
  -- additive, it is not reversible inside this transaction, and an index nobody reads costs a
  -- write, not an answer. `W1-INDEX` owns their removal.
  perform custom.record_update(p_organization_id, p_table_id,
                               jsonb_build_object('storage', 'light'));

  return jsonb_build_object('verb', 'demote', 'table_id', p_table_id, 'was', v_was,
                            'now', custom.table_storage(p_organization_id, p_table_id),
                            'migration_id', v_log,
                            'indexes', 'left in place — dropping them is W1-INDEX''s, and an unread index costs a write rather than an answer',
                            'at', now());
end;
$function$;


CREATE OR REPLACE FUNCTION custom.migrate_extract_parent(p_organization_id uuid, p_id uuid, p_parent_table_id uuid, p_moved_keys text[], p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row    custom.record%rowtype;
  v_parent uuid;
  v_data   jsonb := '{}'::jsonb;
  v_was    uuid;
  v_key    text;
  v_log    uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_extract_parent');
  perform custom.assert_client_may_change(p_organization_id, p_id, 'custom.migrate_extract_parent', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_extract_parent');
  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to extract a parent from.', p_id using errcode = '02000';
  end if;
  v_was := nullif(v_row.data ->> 'parent_id', '')::uuid;

  foreach v_key in array coalesce(p_moved_keys, '{}') loop
    if v_row.data ? v_key then
      v_data := v_data || jsonb_build_object(v_key, v_row.data -> v_key);
    end if;
  end loop;

  -- T5: extracting a Person parent from Practitioner Chen COPIES the shared facts up rather
  -- than moving them, because the Practitioner record is still a Practitioner and still has a
  -- phone number. The two Persons that result are two records — which is exactly why the next
  -- verb in T5 is a merge.
  v_parent := custom.record_write(p_organization_id, p_parent_table_id,
                v_data || case when v_was is null then '{}'::jsonb
                               else jsonb_build_object('parent_id', v_was::text) end);

  v_log := history.migration_record(p_organization_id, 'extract_parent', 'record', p_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                'patch', jsonb_build_object('parent_id', v_was),
                                'delete_after', v_parent::text),
             coalesce(p_note, format('a parent was extracted above this record as %s', v_parent)));

  perform custom.record_reparent(p_organization_id, p_id, v_parent);

  return jsonb_build_object('verb', 'extract_parent', 'record_id', p_id, 'parent', v_parent,
                            'was_under', v_was, 'migration_id', v_log, 'at', now());
end;
$function$;


CREATE OR REPLACE FUNCTION custom.migrate_merge(p_organization_id uuid, p_winner_id uuid, p_loser_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_win  custom.record%rowtype;
  v_lose custom.record%rowtype;
  v_log  uuid;
  v_moved integer := 0;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_merge');
  perform custom.assert_client_may_change(p_organization_id, p_winner_id, 'custom.migrate_merge', 'editor'::public.permission_level, 'record');
  perform custom.assert_client_may_change(p_organization_id, p_loser_id, 'custom.migrate_merge', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_merge');

  if p_winner_id = p_loser_id then
    raise exception 'A record cannot be merged into itself.'
      using errcode = '22023', hint = 'REC-21: nothing was changed.';
  end if;

  select * into v_win  from custom.record r
   where r.organization_id = p_organization_id and r.id = p_winner_id and r.deleted_at is null;
  select * into v_lose from custom.record r
   where r.organization_id = p_organization_id and r.id = p_loser_id and r.deleted_at is null;
  if v_win.id is null or v_lose.id is null then
    raise exception 'Both records have to be here to merge them, and % is not.',
                    coalesce(case when v_win.id is null then p_winner_id else p_loser_id end)
      using errcode = '02000';
  end if;

  -- THE INVERSE, BEFORE ANYTHING MOVES: the loser's whole document, so undo can put both
  -- records and both ids back exactly (T5's last sentence).
  v_log := history.migration_record(p_organization_id, 'merge', v_lose.data_class, p_loser_id,
             jsonb_build_object('kind', 'restore', 'record_id', p_loser_id::text,
                                'unalias', p_loser_id::text,
                                'document', v_lose.data),
             coalesce(p_note, format('merged into %s', p_winner_id)));

  -- T5: the two phone numbers become ALTERNATES inside the winner's one document, each with
  -- its source — never a second record, and never a value quietly overwritten.
  declare
    v_data jsonb := v_win.data;
    v_key  text;
    v_val  jsonb;
    v_alts jsonb;
  begin
    for v_key, v_val in select * from jsonb_each(v_lose.data) loop
      if left(v_key, 1) = '_' or v_key in ('parent_id') then
        continue;
      end if;
      if not (v_data ? v_key) then
        v_data := v_data || jsonb_build_object(v_key, v_val);
        v_moved := v_moved + 1;
      elsif (v_data -> v_key) is distinct from v_val then
        v_alts := coalesce(v_data -> '_values' -> v_key -> 'alternates', '[]'::jsonb);
        -- VAL-4: THE RANK IS THE ARRIVAL ORDER, which is the only ordering a merge knows.
        -- The winner's own value is the trusted one and holds no rank; the first record
        -- merged in ranks 1, the next 2. Never a score, never a confidence.
        v_alts := v_alts || jsonb_build_array(jsonb_build_object(
                    'value', v_val,
                    'rank', jsonb_array_length(v_alts) + 1,
                    -- The SOURCE, written as a source. custom.intern_provenance interns it to
                    -- a pointer and files the description in _sources; a caller that wrote the
                    -- pointer itself would be naming something this store owns (VAL-1).
                    'src', jsonb_build_object('kind', 'record', 'id', p_loser_id::text)));
        v_data := jsonb_set(
                    jsonb_set(v_data, array['_values', v_key],
                              coalesce(v_data -> '_values' -> v_key, '{}'::jsonb), true),
                    array['_values', v_key, 'alternates'], v_alts, true);
        v_moved := v_moved + 1;
      end if;
    end loop;
    perform custom.record_update(p_organization_id, p_winner_id, v_data);
  end;

  -- Everything the loser contained now hangs off the winner, or the merge would orphan it.
  update custom.record r
     set data = r.data || jsonb_build_object('parent_id', p_winner_id::text)
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and nullif(r.data ->> 'parent_id', '')::uuid = p_loser_id;

  -- REC-21: FOREVER. The alias goes in BEFORE the loser is deleted, so there is no instant in
  -- which the id resolves to nothing.
  insert into custom.record_alias (organization_id, old_id, new_id, verb, reason, migration_id)
  values (p_organization_id, p_loser_id, p_winner_id, 'merge',
          coalesce(p_note, 'merged'), v_log)
  on conflict (organization_id, old_id) do update
        set new_id = excluded.new_id, verb = excluded.verb,
            reason = excluded.reason, migration_id = excluded.migration_id;

  perform custom.record_delete(p_organization_id, p_loser_id);

  return jsonb_build_object('verb', 'merge', 'winner', p_winner_id, 'loser', p_loser_id,
                            'migration_id', v_log, 'values_taken', v_moved,
                            'resolves_to', custom.resolve_id(p_organization_id, p_loser_id),
                            'at', now());
end;
$function$;


CREATE OR REPLACE FUNCTION custom.migrate_promote(p_organization_id uuid, p_table_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_was text;
  v_log uuid;
  v_res jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_promote');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.migrate_promote', 'admin'::public.permission_level, 'table');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_promote');
  v_was := custom.table_storage(p_organization_id, p_table_id);
  if v_was is null then
    raise exception 'That is not a table of this organization, so there was nothing to promote.'
      using errcode = '23503';
  end if;

  v_log := history.migration_record(p_organization_id, 'promote', 'table', p_table_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_table_id::text,
                                'patch', jsonb_build_object('storage', v_was)),
             coalesce(p_note, format('moved to fast storage from %s', v_was)));
  v_res := custom.promote_table(p_organization_id, p_table_id);

  return jsonb_build_object('verb', 'promote', 'table_id', p_table_id, 'was', v_was,
                            'now', custom.table_storage(p_organization_id, p_table_id),
                            'migration_id', v_log, 'detail', v_res, 'at', now());
end;
$function$;


CREATE OR REPLACE FUNCTION custom.migrate_rename(p_organization_id uuid, p_id uuid, p_to text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row custom.record%rowtype;
  v_key text;
  v_was text;
  v_log uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_rename');
  perform custom.assert_client_may_change(p_organization_id, p_id, 'custom.migrate_rename', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_rename');
  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to rename.', p_id using errcode = '02000';
  end if;

  -- What "the name" IS depends on what this row is: a Table and a Field carry `name`/`label`
  -- of their own, and a record is named by its Table's title field (REC-1).
  v_key := case v_row.data_class
             when 'record' then coalesce(custom.table_type_field(p_organization_id, v_row.table_id), null)
             else null end;
  v_key := case when v_row.data_class = 'record'
                then coalesce((select t.data ->> 'title_field' from custom.record t
                                where t.organization_id = p_organization_id and t.id = v_row.table_id), 'name')
                when v_row.data ? 'name'  then 'name'
                when v_row.data ? 'label' then 'label'
                else 'name' end;
  v_was := v_row.data ->> v_key;

  v_log := history.migration_record(p_organization_id, 'rename', v_row.data_class, p_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                'patch', jsonb_build_object(v_key, v_was)),
             coalesce(p_note, format('%s renamed from "%s" to "%s"', v_key, coalesce(v_was, 'nothing'), p_to)));
  perform custom.record_update(p_organization_id, p_id, jsonb_build_object(v_key, p_to));

  return jsonb_build_object('verb', 'rename', 'record_id', p_id, 'field', v_key,
                            'was', v_was, 'now', p_to, 'migration_id', v_log, 'at', now());
end;
$function$;


CREATE OR REPLACE FUNCTION custom.migrate_reparent(p_organization_id uuid, p_id uuid, p_parent_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_was uuid;
  v_log uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_reparent');
  perform custom.assert_client_may_change(p_organization_id, p_id, 'custom.migrate_reparent', 'editor'::public.permission_level, 'record');
  perform custom.assert_client_may_change(p_organization_id, p_parent_id, 'custom.migrate_reparent', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_reparent');
  select nullif(r.data ->> 'parent_id', '')::uuid into v_was
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id and r.deleted_at is null;
  if not found then
    raise exception 'There is no record % here to move.', p_id using errcode = '02000';
  end if;

  v_log := history.migration_record(p_organization_id, 'reparent', 'record', p_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                'patch', jsonb_build_object('parent_id', v_was)),
             coalesce(p_note, format('moved from %s to %s', coalesce(v_was::text, 'nothing'), coalesce(p_parent_id::text, 'nothing'))));

  -- REC-24: ONE statement, so the containment edge and every Visibility answer that reads it
  -- change in the same commit. There is no window in which the old audience still reaches it.
  perform custom.record_reparent(p_organization_id, p_id, p_parent_id);

  return jsonb_build_object('verb', 'reparent', 'record_id', p_id, 'was', v_was,
                            'now', p_parent_id, 'migration_id', v_log,
                            'atomic_with_visibility', true, 'at', now());
end;
$function$;


CREATE OR REPLACE FUNCTION custom.migrate_retype(p_organization_id uuid, p_id uuid, p_to text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row     custom.record%rowtype;
  v_log     uuid;
  v_keep    jsonb;
  v_misfit  jsonb := '{}'::jsonb;
  v_ok      text[];
  v_key     text;
  v_to_tbl  uuid;
  v_was     text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_retype');
  perform custom.assert_client_may_change(p_organization_id, p_id, 'custom.migrate_retype', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_retype');

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to retype.', p_id using errcode = '02000';
  end if;

  -- ── ARM TWO FIRST, because it is the smaller one: a FIELD changes what it behaves as
  --    (FLD-4 / T12). The Values already written stay exactly where they are; this verb does
  --    not walk the records and coerce them.
  if v_row.data_class = 'field' then
    v_was := v_row.data ->> 'type';
    if v_was = p_to then
      return jsonb_build_object('verb', 'retype', 'field_id', p_id, 'was', v_was, 'now', p_to,
                                'changed', false, 'at', now());
    end if;
    v_log := history.migration_record(p_organization_id, 'retype', 'field', p_id,
               jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                  'patch', jsonb_build_object('type', v_was)),
               coalesce(p_note, format('%s behaves as %s instead of %s; values that do not fit are in History as they were, neither coerced nor deleted (FLD-4)', coalesce(v_row.data ->> 'label', v_row.data ->> 'key'), p_to, v_was)));
    perform custom.record_update(p_organization_id, p_id, jsonb_build_object('type', p_to));
    return jsonb_build_object('verb', 'retype', 'field_id', p_id, 'was', v_was, 'now', p_to,
                              'changed', true, 'migration_id', v_log,
                              'values', 'unchanged — nothing is coerced and nothing is deleted (FLD-4)',
                              'at', now());
  end if;

  -- ── ARM ONE: a RECORD moves to another Table (REC-N-18 / T9). The id does not change, so
  --    every relation to it still resolves — that is the whole point of the verb.
  select t.id into v_to_tbl from custom.record t
   where t.organization_id = p_organization_id and t.data_class = 'table'
     and t.deleted_at is null
     and (t.id::text = p_to or t.data ->> 'slug' = p_to or t.data ->> 'name' = p_to)
   limit 1;
  if v_to_tbl is null then
    raise exception 'There is no table "%" in this organization to retype it to.', p_to
      using errcode = '02000', hint = 'REC-N-18: name the table by id, slug or name.';
  end if;

  select coalesce(array_agg(f.data ->> 'key'), '{}')
    into v_ok
    from custom.applicable_fields(p_organization_id, v_to_tbl, null) f;

  v_keep := v_row.data;
  for v_key in select jsonb_object_keys(v_row.data) loop
    if left(v_key, 1) = '_' or v_key in ('parent_id') then
      continue;
    end if;
    if not (v_key = any (v_ok)) then
      v_misfit := v_misfit || jsonb_build_object(v_key, v_row.data -> v_key);
      v_keep := v_keep - v_key;
      -- THE ENVELOPE GOES WITH THE VALUE. A record saying where a value it no longer holds
      -- came from is orphan provenance, and W1-VAL refuses it by name — correctly. The value
      -- and this envelope are both in history.row_versions as the record stood a moment ago,
      -- and the value is in the inverse below with the reason, so nothing is lost.
      v_keep := case when v_keep ? '_values'
                     then jsonb_set(v_keep, array['_values'], (v_keep -> '_values') - v_key)
                     else v_keep end;
    end if;
  end loop;

  v_log := history.migration_record(p_organization_id, 'retype', 'record', p_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                'patch', v_row.data, 'table_id', v_row.table_id::text),
             coalesce(p_note, format('retyped to %s; %s value(s) did not fit and are in History with this reason, neither coerced nor deleted',
                                     coalesce((select t.data ->> 'name' from custom.record t
                                                where t.organization_id = p_organization_id and t.id = v_to_tbl), p_to),
                                     (select count(*) from jsonb_object_keys(v_misfit)))));

  -- The table_id is not part of `data`, so it is not something custom.record_update can move.
  -- The door above has already judged this caller, and every BEFORE trigger on the table —
  -- the shape guards, the validation, the envelope — runs on this write exactly as on any
  -- other, which is what makes the target Table's rules apply from the first moment.
  update custom.record r
     set table_id = v_to_tbl, data = v_keep
   where r.organization_id = p_organization_id and r.id = p_id;

  return jsonb_build_object('verb', 'retype', 'record_id', p_id, 'kept_the_id', true,
                            'from_table', v_row.table_id, 'to_table', v_to_tbl,
                            'migration_id', v_log,
                            'misfits', v_misfit,
                            'misfits_are', 'in History with the reason, on migration ' || v_log::text,
                            'at', now());
end;
$function$;


CREATE OR REPLACE FUNCTION custom.migrate_split(p_organization_id uuid, p_record_id uuid, p_moved_keys text[], p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row  custom.record%rowtype;
  v_new  uuid;
  v_keep jsonb;
  v_side jsonb := '{}'::jsonb;
  v_key  text;
  v_log  uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_split');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.migrate_split', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_split');

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to split.', p_record_id using errcode = '02000';
  end if;
  if p_moved_keys is null or array_length(p_moved_keys, 1) is null then
    raise exception 'A split has to say what moves to the other side.'
      using errcode = '22004',
            hint = 'REC-22: name the fields that go to the new record. Everything else stays where it is, on the id that everything already points at.';
  end if;

  v_keep := v_row.data;
  foreach v_key in array p_moved_keys loop
    if v_row.data ? v_key then
      v_side := v_side || jsonb_build_object(v_key, v_row.data -> v_key);
      v_keep := v_keep - v_key;
      -- The value's envelope goes with the value. Leaving it behind would be a record
      -- carrying provenance for something it no longer holds.
      v_keep := case when v_keep ? '_values'
                     then jsonb_set(v_keep, array['_values'], (v_keep -> '_values') - v_key)
                     else v_keep end;
    end if;
  end loop;

  -- REC-22: ONE SIDE KEEPS THE ID, and it is the original record — never a new pair of ids
  -- with the old one pointing at one of them, because every relation, bookmark and citation
  -- out there already names it.
  v_new := custom.record_write(p_organization_id, v_row.table_id,
             v_side || jsonb_build_object('parent_id', nullif(v_row.data ->> 'parent_id', '')));

  v_log := history.migration_record(p_organization_id, 'split', v_row.data_class, p_record_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_record_id::text,
                                'patch', v_row.data, 'delete_after', v_new::text),
             coalesce(p_note, format('split %s off into %s', array_to_string(p_moved_keys, ', '), v_new)));

  -- A SPLIT MOVES. `custom.record_update` is `data || patch`, so a shortened document handed
  -- to it removes nothing and the value stays on both sides — measured 2026-09-18. The write
  -- is direct, and every BEFORE trigger on custom.record still runs on it.
  update custom.record r
     set data = v_keep
   where r.organization_id = p_organization_id and r.id = p_record_id;

  -- The NEW side is recorded as having come from the keeper. The keeper's own id is NOT
  -- aliased: `custom.resolve_id` answers with it, because it never stopped being a record.
  insert into custom.record_alias (organization_id, old_id, new_id, verb, reason, migration_id)
  values (p_organization_id, v_new, p_record_id, 'split',
          coalesce(p_note, 'split off from the record that kept the id'), v_log)
  on conflict (organization_id, old_id) do nothing;

  return jsonb_build_object('verb', 'split', 'kept_the_id', p_record_id, 'new_record', v_new,
                            'migration_id', v_log, 'moved', to_jsonb(p_moved_keys),
                            'old_id_resolves_to', custom.resolve_id(p_organization_id, p_record_id),
                            'at', now());
end;
$function$;


CREATE OR REPLACE FUNCTION custom.query_across_homes(p_organization_id uuid, p_table_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_required text DEFAULT 'viewer'::text)
 RETURNS TABLE(record_id uuid, home_record_id uuid, data jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_across_homes');
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.query_across_homes: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  return query
  with homes as (select h from custom.query_table_homes(p_organization_id, p_table_id) h)
  select r.id,
         -- The record's own Home: the nearest ancestor in its containment chain that is one
         -- of this Table's Homes. A record directly under a Home has depth 1; a record three
         -- containers down still reports the Home it ultimately sits in.
         (select c.ancestor_id
            from custom.containment_chain(p_organization_id, r.id) c
            join homes on homes.h = c.ancestor_id
           order by c.depth
           limit 1),
         r.data,
         r.created_at
    from custom.query_visible_ids(p_organization_id, p_table_id, p_required) v
    join custom.record r
      on r.organization_id = p_organization_id and r.id = v
   order by r.created_at desc, r.id
   limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;


CREATE OR REPLACE FUNCTION custom.query_by_coordinates(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid, p_coordinates jsonb DEFAULT '[]'::jsonb, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_required text DEFAULT 'viewer'::text)
 RETURNS TABLE(record_id uuid, table_id uuid, data jsonb, coordinates_matched integer)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_n integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_by_coordinates');
  if p_organization_id is null then
    raise exception 'custom.query_by_coordinates: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if jsonb_typeof(coalesce(p_coordinates, '[]'::jsonb)) <> 'array' then
    raise exception 'custom.query_by_coordinates: p_coordinates is a JSON ARRAY of coordinates, one object per relation end; got %',
                    jsonb_typeof(p_coordinates)
      using errcode = '22023',
            hint = 'e.g. [{"role":"client","target_id":"…"},{"role":"project","target_id":"…","direction":"to"}]. An empty array means no coordinate constraint, which is the whole Table.';
  end if;

  select count(*) into v_n from jsonb_array_elements(coalesce(p_coordinates, '[]'::jsonb));

  return query
  with coord as (
    select ord                                        as n,
           c ->> 'role'                               as role,
           (c ->> 'target_id')::uuid                  as target_id,
           coalesce(c ->> 'direction', 'from')        as direction
      from jsonb_array_elements(coalesce(p_coordinates, '[]'::jsonb))
           with ordinality as t(c, ord)
  ),
  -- ONE pass over the edges: every record that satisfies at least one coordinate, with the
  -- count of DISTINCT coordinates it satisfies. Two edges answering the same coordinate count
  -- once, which is why `distinct co.n` and not `count(*)`.
  hit as (
    select case when co.direction = 'to' then a.source_id else a.target_id end as other_id,
           case when co.direction = 'to' then a.target_id else a.source_id end as rec_id,
           co.n
      from coord co
      join platform.associations a
        on a.organization_id = p_organization_id
       and a.deleted_at is null
       and a.relation_field_id is not null
       and (co.role is null or a.role = co.role)
       and ((co.direction = 'from' and a.source_type = 'record'
             and a.target_id = co.target_id)
         or (co.direction = 'to'
             and a.source_id = co.target_id))
  ),
  satisfied as (
    select rec_id, count(distinct n)::integer as matched
      from hit
     group by rec_id
    having count(distinct n) = v_n
  )
  select r.id, r.table_id, r.data, coalesce(s.matched, 0)
    from custom.query_visible_ids(p_organization_id, p_table_id, p_required) v
    join custom.record r
      on r.organization_id = p_organization_id and r.id = v
    left join satisfied s on s.rec_id = v
   where v_n = 0 or s.rec_id is not null
   order by r.created_at desc, r.id
   limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;


CREATE OR REPLACE FUNCTION custom.query_can_see(p_organization_id uuid, p_record_id uuid, p_required text DEFAULT 'viewer'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_can_see');
  return (
select exists (select 1 from custom.query_visible_ids(p_organization_id, null, p_required) v
                  where v = p_record_id)
  );
end;
$function$;


CREATE OR REPLACE FUNCTION custom.query_record_as_of(p_organization_id uuid, p_record_id uuid, p_recorded_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_world_on date DEFAULT NULL::date, p_required text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc jsonb;
  v_out jsonb := '{}'::jsonb;
  v_key text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_record_as_of');
  -- Visibility first and through the same helper: history is not a side door into rows the
  -- principal may not read today.
  if not custom.query_can_see(p_organization_id, p_record_id, p_required) then
    return null;
  end if;

  -- CLOCK ONE, the system clock: what the store SAID at that moment.
  if p_recorded_at is null then
    select r.data into v_doc from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id;
  else
    v_doc := history.record_at(p_organization_id, p_record_id, p_recorded_at);
    v_doc := coalesce(v_doc -> 'data', v_doc);
  end if;
  if v_doc is null then
    return null;
  end if;

  -- CLOCK TWO, the world clock: what was TRUE on that date, inside the document clock one
  -- just chose. Applied per key, because `dated` is a property of a Field and not of a record.
  if p_world_on is null then
    return v_doc;
  end if;
  for v_key in select jsonb_object_keys(v_doc) loop
    v_out := v_out || jsonb_build_object(v_key, history.value_in_document(v_doc, v_key, p_world_on));
  end loop;
  return v_out;
end;
$function$;


CREATE OR REPLACE FUNCTION custom.query_relation_edges(p_organization_id uuid, p_flavor text DEFAULT NULL::text, p_role text DEFAULT NULL::text)
 RETURNS TABLE(parent_id uuid, child_id uuid, role text, flavor text)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_relation_edges');
  return query
select a.source_id, a.target_id, a.role, d.declaration ->> 'flavor'
    from platform.associations a
    cross join lateral (select platform.relation_declaration(p_organization_id, a.relation_field_id)
                          as declaration) d
   where a.organization_id = p_organization_id
     and a.deleted_at is null
     and a.relation_field_id is not null
     and a.source_type = 'record'
     and (p_role is null or a.role = p_role)
     and (p_flavor is null or d.declaration ->> 'flavor' = p_flavor);
end;
$function$;


CREATE OR REPLACE FUNCTION custom.query_rollup(p_organization_id uuid, p_roots uuid[], p_flavor text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_max_depth integer DEFAULT 33, p_required text DEFAULT 'viewer'::text)
 RETURNS TABLE(record_id uuid, depth integer)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cap integer := least(greatest(coalesce(p_max_depth, 33), 1), 64);
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_rollup');
  if p_organization_id is null or p_roots is null or cardinality(p_roots) = 0 then
    raise exception 'custom.query_rollup: the organization and at least one root are required'
      using errcode = '22004';
  end if;
  if p_flavor is not null and not (p_flavor = any (platform.relation_flavors())) then
    raise exception 'custom.query_rollup: % is not a relation flavor', p_flavor
      using errcode = '22023',
            hint = format('Legal flavors: %s. Null means every flavor.',
                          array_to_string(platform.relation_flavors(), ', '));
  end if;

  return query
  with recursive edge as (
    select e.parent_id, e.child_id from custom.query_relation_edges(p_organization_id, p_flavor, p_role) e
  ),
  walk (node, d) as (
      select x, 0 from unnest(p_roots) as x
    union all
      select e.child_id, walk.d + 1
        from walk
        join edge e on e.parent_id = walk.node
       where walk.d < v_cap
  ) cycle node set is_cycle using path
  -- The join is the Visibility filter (DOOR-10): a node the principal cannot see is never
  -- fetched, and a rollup therefore counts what THIS principal may see, which is the only
  -- number that is ever correct to show them.
  select w.node, min(w.d)::integer
    from walk w
    join custom.query_visible_ids(p_organization_id, null, p_required) v on v = w.node
   where not w.is_cycle
   group by w.node;
end;
$function$;


CREATE OR REPLACE FUNCTION custom.query_rollup_sum(p_organization_id uuid, p_roots uuid[], p_field_key text, p_flavor text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_max_depth integer DEFAULT 33, p_required text DEFAULT 'viewer'::text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_rollup_sum');
  return (
-- The value is read out of the Value ENVELOPE when there is one (`{"value": …}`) and out of
  -- the plain key when there is not, which is the same reading every other surface does.
  select coalesce(sum(
           case when jsonb_typeof(r.data -> p_field_key) = 'object'
                      and (r.data -> p_field_key) ? 'value'
                then nullif(r.data -> p_field_key ->> 'value', '')::numeric
                else nullif(r.data ->> p_field_key, '')::numeric end), 0)
    from custom.query_rollup(p_organization_id, p_roots, p_flavor, p_role, p_max_depth, p_required) k
    join custom.record r on r.organization_id = p_organization_id and r.id = k.record_id
  );
end;
$function$;


CREATE OR REPLACE FUNCTION custom.query_table_as_of(p_organization_id uuid, p_table_id uuid, p_recorded_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_world_on date DEFAULT NULL::date, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_required text DEFAULT 'viewer'::text)
 RETURNS TABLE(record_id uuid, data jsonb)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_table_as_of');
  return query
select v, custom.query_record_as_of(p_organization_id, v, p_recorded_at, p_world_on, p_required)
    from custom.query_visible_ids(p_organization_id, p_table_id, p_required) v
    join custom.record r on r.organization_id = p_organization_id and r.id = v
   order by r.created_at desc, r.id
   limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;


CREATE OR REPLACE FUNCTION custom.query_table_homes(p_organization_id uuid, p_table_id uuid)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_table_homes');
  return query
-- Both ways a Table declares a Home: the containment parent it was declared under, and
  -- every carrying `home` relation `custom.home_add` writes. One list, deduplicated, because
  -- "every Home" must not depend on which mechanism named it.
  select home_record_id from custom.home
   where organization_id = p_organization_id and table_id = p_table_id
  union
  select home_record_id from custom.home_relations()
   where organization_id = p_organization_id and table_id = p_table_id;
end;
$function$;


CREATE OR REPLACE FUNCTION custom.record_aggregate(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text)
 RETURNS TABLE(groups jsonb, measures jsonb, row_count bigint)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_aggregate');
  return query execute custom.agg_sql(p_organization_id, p_table_id, p_group_by, p_measures,
                                      p_bucket, p_filter, p_limit, p_required);
end;
$function$;


CREATE OR REPLACE FUNCTION custom.record_reparent(p_organization_id uuid, p_record_id uuid, p_parent_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_reparent');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_reparent', 'editor'::public.permission_level, 'record');
  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_reparent: the organization and the record are required'
      using errcode = '22004';
  end if;
  update custom.record r
     set data = case when p_parent_id is null
                     then r.data - 'parent_id'
                     else r.data || jsonb_build_object('parent_id', p_parent_id::text) end
   where r.organization_id = p_organization_id and r.id = p_record_id;
  if not found then
    raise exception 'that record is not in this organization' using errcode = '23503';
  end if;
end;
$function$;


CREATE OR REPLACE FUNCTION custom.record_values_versioned(p_organization_id uuid, p_record_id uuid)
 RETURNS TABLE(field_key text, field_id uuid, value jsonb, value_version integer, source jsonb, absent_reason text, actor text, on_behalf_of text, written_at timestamp with time zone, alternates jsonb)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_values_versioned');
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.record_values_versioned', 'viewer'::public.permission_level, 'record');
  return query
with r as (
    select rec.* from custom.record rec
     where rec.organization_id = p_organization_id and rec.id = p_record_id
  ),
  vals as (
    select custom.record_values(p_organization_id, p_record_id) v
  ),
  keys as (
    select k from vals, jsonb_object_keys(vals.v) k
    union
    select k from r, jsonb_object_keys(coalesce(r.data -> '_values', '{}'::jsonb)) k
  )
  select keys.k,
         f.id,
         vals.v -> keys.k,
         coalesce((r.data -> '_values' -> keys.k ->> 'ver')::integer, 1),
         r.data -> '_sources' -> (r.data -> '_values' -> keys.k ->> 'src'),
         r.data -> '_values' -> keys.k ->> 'absent',
         r.data -> '_values' -> keys.k ->> 'actor',
         r.data -> '_values' -> keys.k ->> 'on_behalf_of',
         (r.data -> '_values' -> keys.k ->> 'at')::timestamptz,
         coalesce((select jsonb_agg(jsonb_build_object('value', a -> 'value',
                                                       'rank',  a -> 'rank',
                                                       'source', r.data -> '_sources' -> (a ->> 'src'))
                                    order by (a ->> 'rank')::int)
                     from jsonb_array_elements(coalesce(r.data -> '_values' -> keys.k -> 'alternates',
                                                        '[]'::jsonb)) a),
                  '[]'::jsonb)
    from r
    cross join vals
    cross join keys
    left join lateral (
      select af.id
        from custom.applicable_fields(p_organization_id, r.table_id,
                                      r.data ->> custom.table_type_field(p_organization_id, r.table_id)) af
       where af.data ->> 'key' = keys.k
       limit 1
    ) f on true
   order by keys.k;
end;
$function$;


CREATE OR REPLACE FUNCTION custom.relation_own(p_organization_id uuid, p_owner_id uuid, p_target_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_own');
  perform custom.assert_client_may_change(p_organization_id, p_target_id, 'custom.relation_own', 'editor'::public.permission_level, 'record');
  if p_organization_id is null or p_owner_id is null or p_target_id is null then
    raise exception 'custom.relation_own: the organization, the owner and the target are all required'
      using errcode = '22004';
  end if;

  -- REC-10: an owned relation MAKES ITS TARGET CONTAINED. The containment edge and the
  -- relation are written in one transaction, so the target cannot be owned without being
  -- contained. Every REC-7 / REC-8 / REC-N-4 refusal applies, because the edge goes in
  -- through custom._containment_guard like any other write.
  update custom.record r
     set data = r.data || jsonb_build_object('parent_id', p_owner_id::text)
   where r.organization_id = p_organization_id and r.id = p_target_id;
  if not found then
    raise exception 'that record is not in this organization'
      using errcode = '23503';
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'relation',
          jsonb_build_object('kind', 'owned', 'carrying', true,
                             'from', p_owner_id, 'to', p_target_id))
  returning id into v_id;
  return v_id;
end;
$function$;


CREATE OR REPLACE FUNCTION custom.relation_targets(p_organization_id uuid, p_record_id uuid, p_via_key text)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_targets');
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.relation_targets', 'viewer'::public.permission_level, 'record');
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


CREATE OR REPLACE FUNCTION custom.tables_at_home(p_organization_id uuid, p_home_ids uuid[])
 RETURNS TABLE(table_id uuid, home_record_id uuid, kind text)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.tables_at_home');
  return query
select h.table_id, h.home_record_id, h.kind
    from custom.home h
   where h.organization_id = p_organization_id
     and h.home_record_id = any (p_home_ids);
end;
$function$;

-- ── THE DOORS, DECLARED IN THE SAME TRANSACTION AS THE BODIES ────────────────
-- Schema `custom` never issues a raw GRANT. A function becomes reachable by
-- declaring a row in `platform.client_callable_door` that says who may knock and
-- why, and then asking `custom.reopen_declared_doors()` to make the catalogue
-- match the declaration; the grant is a consequence of the row, never a decision
-- of its own. The declaration is in THIS transaction because it has to be:
-- `provision_shape_guard` refuses to let a SECURITY DEFINER function reach COMMIT
-- with no access decision declared in data, and `door_body_must_decide` refuses a
-- row whose function's body does not actually decide. The two guards meet here.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom',
       p.proname,
       pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes),
       true,
       false,
       'migrations/campaign/reach_the_client_doors_of_the_store.sql (lane REACH)',
       v.reason
  from (values
  ('agg_explain', 'The query plan for that aggregate, for the person tuning a slow dashboard. It explains the same statement the aggregate runs, over the same visibility join.'),
  ('doc_render_document', 'Rendering a template against one record into a document version. Viewer on the record, on the one ladder: a document is the record''s own values, so reaching the document must take reaching the record.'),
  ('doc_sign', 'Signing a field on a rendered document. It writes through the store''s own write door so the signature is a Value with a version and an author, and it refuses to overwrite a seal. Editor on the record.'),
  ('doc_template_save', 'Saving a document template against a Table. Every save is a new template version, because a signature seals a version. EDITOR on the Table on the one ladder.'),
  ('home_add', 'Giving a Table a second home. It is config a person does once and then forgets, and it takes ADMIN on the Table on the one ladder, because where a Table lives decides who inherits reach to everything in it.'),
  ('io_export', 'Exporting a Table as JSON. The rows come from custom.query_visible_ids, and the columns are the Table''s own declared Fields rather than whatever keys a document happens to carry.'),
  ('io_export_csv', 'The same export as CSV, escaped by the same function the importer parses back. A person exporting their own data should never need somebody with a database connection.'),
  ('io_import_open', 'Opening an import run against a Table. It takes EDITOR on that Table on the one ladder, because an import run is the first half of writing rows into it.'),
  ('io_import_rows', 'Feeding rows into an open import run. Every row goes through the store''s one write door, so validation, the value envelope, provenance and the rules all apply; a refused row is recorded with its reason rather than failing the run.'),
  ('io_proposal_accept', 'Accepting an unmapped import column as a new Field - the moment a spreadsheet becomes a shape. It is the offer half of the import and is useless if only a server can take it.'),
  ('io_proposal_reject', 'Declining that offer, so the column is remembered as refused rather than proposed again on the next run.'),
  ('migrate_delete', 'The delete verb that honours the rules a person set on their relations and homes - it refuses when something still points at the record, cascades containment, and stores the inverse before it removes anything. It is the delete the app must use, so it must be the delete the app can reach. Editor on the record.'),
  ('migrate_demote', 'The inverse of promote, and the same threshold: admin on the Table, decided before anything moves.'),
  ('migrate_extract_parent', 'Pulling a set of keys out of a record into a new parent record is how a flat import becomes a shape. Editor on the record it extracts from.'),
  ('migrate_merge', 'Merging two records of the same person or company is an everyday piece of housekeeping and it needs both sides: it decides editor on the winner AND on the loser before it touches either, so a merge can never be used to pull a record somebody may not reach into one they may.'),
  ('migrate_promote', 'Promoting a detail Table to a full one is a structural change to a Table, so it takes admin on that Table on the one ladder. A person restructuring their own data should never need a server lane to do it.'),
  ('migrate_rename', 'Renaming a record, a Table or a Field is something a person does in the app, and it is the verb that keeps History''s inverse with it. It decides the organization wall and then the record at editor on the one ladder, and it writes through custom.record_update like every other write.'),
  ('migrate_reparent', 'Moving a record to a different parent is a drag in the app. It decides editor on the record AND on the parent it is moving under, because reparenting into a container somebody may not reach is how a record leaves the reach of everyone who could see it.'),
  ('migrate_retype', 'Turning a circle into a rectangle is a person''s act in the app, and it is the ONLY path that retires the values that no longer apply with the sentence explaining why. Reachable so that changing a record''s type never has to be done by rewriting the document by hand. Editor on the record, on the one ladder.'),
  ('migrate_split', 'Splitting one record into two is the inverse of the merge and is the same person''s act. Editor on the record it splits, decided before the split is planned.'),
  ('query_across_homes', 'Reading a Table''s records together with the Home each one sits in - the query behind "show me everything in this table, wherever it lives". Every row it returns comes out of custom.query_visible_ids, which is the one ladder per row.'),
  ('query_by_coordinates', 'Finding records by the relations they are on ("every task on this project for this client"). It is the filter behind a real list screen, and its rows come out of the one ladder.'),
  ('query_can_see', 'Asking whether the signed-in person may see one record, at one level. A screen that cannot ask this has to guess, and a screen that guesses shows a dead control. It answers about the caller''s own reach and reads nothing else.'),
  ('query_record_as_of', 'What this record looked like at a moment, or on a date in the world it describes. The two clocks are a product feature and belong to the person, not to the server. It refuses through the same visibility helper as a read today, so history is not a side door.'),
  ('query_relation_edges', 'The relation edges of an organization, optionally by flavor and role - what a graph or a picker needs to draw. It reads the association rows of one organization and nothing about anybody else''s.'),
  ('query_rollup', 'Walking a relation from one or more roots and answering the records underneath with their depth - the "everything under this project" read. The walk is cycle-guarded and every node is filtered by the one ladder, so a rollup counts what this person may see.'),
  ('query_rollup_sum', 'The total of one field over that same walk. A sum computed in the client from rows it was allowed to fetch is a different, wrong number; this one is computed over exactly the records the ladder admits.'),
  ('query_table_as_of', 'The same two clocks across a whole Table - the "what did this look like in March" screen. Rows come from the one ladder and each is resolved by query_record_as_of.'),
  ('query_table_homes', 'Which records a Table lives in. A Table with two homes is a supported shape, and a screen that cannot list them cannot show the second one.'),
  ('record_aggregate', 'Totals and counts grouped by a field or bucketed by time. The visibility join is inside the aggregate''s own statement, below the aggregate node, so the numbers are computed over the rows this person may see and the rest are never fetched.'),
  ('record_reparent', 'Setting or clearing a record''s containment parent - the plain move, without the migration log the reparent verb keeps. Editor on the record.'),
  ('record_values_versioned', 'Every value on a record with its version, its author, its time, its source and its alternates - the "where did this number come from" panel. Viewer on the record, on the one ladder.'),
  ('relation_own', 'Creating an OWNED relation, which is how one record comes to contain another. This is the link the platform''s sharing engine conveys access along, so a person who cannot create one cannot share a container and its contents together. Editor on the record being taken in.'),
  ('relation_targets', 'Following a relation field to the records it points at. Viewer on the record you are following FROM, on the one ladder, so a relation cannot be used to enumerate ids out of a record you may not open.'),
  ('tables_at_home', 'Which Tables live in this record - the other half of the two-homes screen, and what the delete verb reads before it refuses. Organization wall first.')
  ) as v(fname, reason)
  join pg_proc p
    on p.pronamespace = 'custom'::regnamespace
   and p.proname = v.fname
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- The grant follows from the declaration, and only from the declaration.
select custom.reopen_declared_doors();
