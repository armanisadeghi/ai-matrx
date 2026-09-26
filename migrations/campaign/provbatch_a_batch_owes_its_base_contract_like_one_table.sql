-- chair-step: lane PROVISION-BATCH-FIX (2026-09-26). A BATCH OWES ITS BASE CONTRACT EXACTLY THE WAY ONE TABLE DOES. Since 2026-09-21 the base-contract foreign keys (organization_id -> iam.organizations, created_by / updated_by -> auth.users) are DEFERRED by default: the builder emits the columns bare, writes the debt to platform.provision_base_contract_pending, and the caller settles it with platform.provision_attach_base_contract + platform.provision_validate_base_contract, each in its OWN short transaction after the build commits (aidream services/provisioning _settle_base_contract, which already settles every member of a batch's tables[]). platform.provision knows the three checks are OWED, not failed; platform.provision_batch re-certified its members after their deferred cross-member constraints with its OWN copy of the certify loop that lacked that rule, so EVERY real batch (found by lane CLONE-LEVEL; a one-table batch reproduces it) refused with base_org_fk / base_created_by_fk / base_updated_by_fk missing, and its members never carried their base_contract debt, so the service could not have settled them either. Fix the class: NEW platform.provision_certify_judged(schema, table, token, defer_base) is the provisioner's ONE certification judgement; platform.provision and platform.provision_batch both call it and no longer carry a loop of their own (asserted at the end), so the two paths cannot diverge again. A batch member is judged deferred from what its own build did (its base_contract status), carries base_contract in tables[], and answers canonical_certify_ok NULL while pending, exactly like one table. REPLACES platform.provision (the certification block only) and platform.provision_batch (the member row and the re-certification). ALSO (found proving this, same class of 'the healed path never ran for a person'): platform.kernel_equivalence_answers() built its fixture under the CALLER's signed-in identity, so a provision run as a person (request.jwt.claims sub, e.g. admin@admin.com) could never self-heal a stale kernel: the fixture's people fired the personal-organization guard (42501 cannot create another user's personal organization) and the heal refused an equivalent kernel; it now clears the claims inside its always-rolled-back subtransaction. Its recorded answers are unchanged (each question sets its own person). No kernel body and no fingerprint changes (asserted). Proof: scripts/campaign-tests/provisionbatch_green.sql; selfheal_green.sql A4 now passes fully. No data write.
-- based-on: platform.provision(jsonb, text, uuid, text) b36487697c909d1f080d701476c4b427bd5bbf21ec6896a7925fec312bde3c36
-- based-on: platform.provision_batch(jsonb, text, uuid, text) 653f01fad8f3efe03ecdf8c9819914f6712537b49b40c701bd8df163f8b1e45d
-- based-on: platform.kernel_equivalence_answers() ccdfc72c5c359aa72a1f4ab95fce5f1e84961233426d1c4fcb1bbf77bc52372c
-- lane: PROVISION-BATCH-FIX
-- INVERSE: migrations/inverse/provbatch_a_batch_owes_its_base_contract_like_one_table_down.sql

do $pre$
begin
  perform set_config('provbatch.kernel_fp_before', iam.entity_read_kernel_fingerprint(), true);
  perform set_config('provbatch.kernel_expected_before', iam.entity_read_kernel_expected(), true);
end $pre$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. THE ONE JUDGEMENT.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.provision_certify_judged(p_schema text, p_table text, p_token text, p_defer_base boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_certify jsonb := '[]'::jsonb;
  v_refuse  jsonb := '[]'::jsonb;
  r         record;
begin
  -- THE ONE CERTIFICATION JUDGEMENT OF THE PROVISIONER (lane PROVISION-BATCH-FIX, 2026-09-26).
  -- platform.provision (one table) and platform.provision_batch (its members, again, after the
  -- batch's deferred constraints) both call this and nothing else, so the two paths cannot
  -- disagree about what refuses. The batch used to carry its own copy of the loop without the
  -- deferred base-contract rule, and refused every batch.
  --
  -- canonical_certify reports every WARN and FAIL under category `conformance`; the CHECK NAME is
  -- the prefix of `detail`. Refuse on every FAIL and every WARN except the three legacy-column
  -- WARNs (§3.1); INFO (the snapshot row) is ignored.
  --
  -- THE THREE BASE-CONTRACT CHECKS ARE OWED, NOT FAILED (2026-09-21), when p_defer_base: the
  -- foreign keys are added by platform.provision_attach_base_contract in the NEXT transaction, on
  -- purpose, so verify_canonical is RIGHT that they are absent and wrong to call it a defect here.
  -- They are recorded ONCE, as `PENDING`, the debt register carries the relation, and
  -- platform.provision_validate_base_contract re-runs the full certification once they are
  -- validated — the moment the table is actually certified. Deferral does not excuse the check;
  -- it moves it to where the answer is true.
  --
  -- Answers {certify: [{category, status, detail}], refuse: ["<category> [<status>]: <detail>"]}.
  for r in select * from iam.canonical_certify(p_schema, p_table, p_token) loop
    if p_defer_base
       and r.status = 'FAIL'
       and split_part(coalesce(r.detail, ''), ':', 1) in ('base_org_fk','base_created_by_fk','base_updated_by_fk') then
      v_certify := v_certify || jsonb_build_array(jsonb_build_object('category', r.category, 'status', 'PENDING',
        'detail', coalesce(r.detail,'') || ' — deferred to platform.provision_attach_base_contract, settled in its own short transaction'));
      continue;
    end if;
    v_certify := v_certify || jsonb_build_array(jsonb_build_object('category', r.category, 'status', r.status, 'detail', r.detail));
    if r.status = 'FAIL'
       or (r.status = 'WARN'
           and split_part(coalesce(r.detail, ''), ':', 1) not in ('legacy_owner_col','legacy_is_public','legacy_is_deleted')) then
      v_refuse := v_refuse || to_jsonb(format('%s [%s]: %s', r.category, r.status, coalesce(r.detail,'')));
    end if;
  end loop;
  return jsonb_build_object('certify', v_certify, 'refuse', v_refuse);
end;
$function$;
revoke all on function platform.provision_certify_judged(text, text, text, boolean) from public, anon, authenticated, service_role;
comment on function platform.provision_certify_judged(text, text, text, boolean) is
  'The provisioner''s ONE certification judgement (PROVISION-BATCH-FIX, 2026-09-26): platform.provision and platform.provision_batch both call it, so a batch member and a single table are refused (and owed their deferred base contract) by the same rules.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. platform.provision — its certification block now asks the one judgement.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.provision(p_spec jsonb, p_applied_via text DEFAULT 'supabase_mcp'::text, p_org_id uuid DEFAULT NULL::uuid, p_lane text DEFAULT 'full'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_pre      jsonb;
  v_heal     jsonb;   -- PROVISIONER-SELF-HEAL
  v_res      jsonb;
  n          jsonb;
  v_cur      record;
  v_hash     text;
  v_schema   text;
  v_table    text;
  v_token    text;
  v_variant  text;
  v_rel      text;
  v_cols     text;
  v_item     jsonb;
  v_txt      text;
  v_target   text;
  v_frag     text;
  v_soft     boolean;
  v_vis      text;
  v_cat      boolean;
  v_class    text;
  v_created  jsonb[] := '{}'::jsonb[];
  v_certify  jsonb[] := '{}'::jsonb[];
  v_refuse   text[]  := '{}'::text[];
  v_grants   text[]  := '{}'::text[];
  v_argf     jsonb[] := '{}'::jsonb[];
  v_refs     text[]  := '{}'::text[];
  v_idx      jsonb   := '[]'::jsonb;
  v_actor    uuid;
  v_role     text;
  v_part     jsonb;
  v_pkey     text;
  v_pcount   integer;
  v_ix       integer;
  v_client_exposed boolean;
  v_exposure_viol  text;
  r          record;
  v_dfk      jsonb[] := '{}'::jsonb[];
  v_lead     text[]  := '{}'::text[];
  v_od       text;
  v_defer_base boolean;   -- 2026-09-21: the base-contract FKs leave this transaction
  v_judged   jsonb;     -- PROVISION-BATCH-FIX: platform.provision_certify_judged
begin
  -- ---- a batch: several tables in ONE call (next-build item 2) -----------
  -- `tables[]` is the whole declaration. platform.provision_batch orders the members,
  -- creates the batch's types, calls THIS function once per table with the batch's
  -- tokens visible, then adds the foreign keys that could not exist yet (forward and
  -- self references) and the edges between batch tables. One transaction; a refusal
  -- anywhere leaves nothing.
  if jsonb_typeof(p_spec->'tables') = 'array' then
    return platform.provision_batch(p_spec, p_applied_via, p_org_id, p_lane);
  end if;

  -- ---- ONE PROVISIONING RUN AT A TIME, AND IT YIELDS (2026-09-21) --------
  -- pg_try_advisory_xact_lock, never the blocking form: a builder that waits on another
  -- builder waits while holding its own locks, which is how one slow build became a
  -- 22-session queue with sign-in in it. A second run is refused with 55P03, which lane
  -- B's service already retries. Re-entrant: provision_batch calls this function once per
  -- member inside the same transaction and re-taking the lock succeeds.
  perform platform.provision_run_claim('provision');

  -- ---- preflight -------------------------------------------------------
  v_pre := platform.provision_preflight();
  if not (v_pre->>'ok')::boolean then
    -- A STALE KERNEL FINGERPRINT IS REFUSED WITH A LOGGED ROW (lane KERNEL-TAILS, 2026-09-25).
    -- A raise here rolls back everything the caller's transaction did, so a refusal left no
    -- trace: SHARE-LANE-2's file refused every spec for 26 minutes and rca2b's for 57, and
    -- nobody saw either until a lane ran check:store-doors-decide. Nothing has been written yet
    -- at this point (the run claim is an advisory lock), so this branch writes ONE
    -- ops.system_error row (kind provisioner_fingerprint_stale, naming the moved body and the
    -- remedy), warns, and RETURNS the refusal — ok false, refused true — instead of raising.
    --
    -- 🚨 AND A STALE FINGERPRINT HEALS ITSELF WHEN THE KERNEL STILL ANSWERS THE SAME (lane
    -- PROVISIONER-SELF-HEAL, 2026-09-25, chair's ruling). The fingerprint exists so no table is
    -- provisioned against an UNKNOWN kernel; it was never meant to stop table creation because a
    -- file forgot a bookkeeping line (83 minutes on production on 2026-09-25, twice, once from
    -- outside the program). When stale-kernel is the ONLY finding, the kernel's own equivalence
    -- self-check runs here, in this call, on its fixed fixture (platform.kernel_equivalence_check,
    -- about a second): identical -> the fingerprint is re-recorded with a
    -- platform.kernel_fingerprint_record row and ONE ops.system_error row of kind
    -- kernel_fingerprint_auto_rerecorded, and provisioning continues; not identical -> the logged
    -- refusal below, with the evidence in the row.
    if exists (select 1 from jsonb_array_elements(v_pre->'findings') x
                where x->>'rule_id' = 'preflight.read_kernel') then
      if jsonb_array_length(v_pre->'findings') = 1 then
        v_heal := platform._provisioner_heals_a_stale_kernel(p_spec, v_pre, p_applied_via, p_org_id, p_lane);
        if coalesce((v_heal->>'healed')::boolean, false) then
          v_pre := platform.provision_preflight();
        else
          v_pre := v_pre || jsonb_build_object('equivalence', v_heal->'equivalence');
        end if;
      end if;
      if exists (select 1 from jsonb_array_elements(v_pre->'findings') x
                  where x->>'rule_id' = 'preflight.read_kernel') then
        return platform._provisioner_refuses_a_stale_kernel(p_spec, v_pre, p_applied_via, p_org_id, p_lane);
      end if;
    end if;
    if not (v_pre->>'ok')::boolean then
    raise exception 'provision: PREFLIGHT REFUSED (% problem(s)). Nothing was written.%',
      jsonb_array_length(v_pre->'findings'),
      (select string_agg(E'\n\n' || (x->>'message'), '') from jsonb_array_elements(v_pre->'findings') x)
      using errcode = 'check_violation',
            hint = 'The enforcement chain this path rests on is not intact. Fix the named condition and call platform.provision again; nothing was written, so there is nothing to undo.';
    end if;
  end if;

  -- ---- validate, inside THIS transaction (PLAN §3.2 — no plan fingerprint) ----
  v_res   := platform.provision_validate(p_spec, p_lane, p_org_id);
  n       := v_res->'normalized_spec';
  v_hash  := v_res->>'spec_hash';
  v_token := p_spec->>'token';

  -- ---- unchanged / changed --------------------------------------------
  if v_token is not null then
    -- 🚨 THE DECLARATION IS HISTORY; THE CATALOGUE IS STATE. `platform.provision_spec` is
    -- append-only by design — a trigger refuses a DELETE with "the applied declaration IS the
    -- record" — so a token whose relation has since been torn down STILL has a current row in
    -- this view. Without the existence test below, provision() answered `unchanged` for a
    -- table that does not exist, or refused it as "a DIFFERENT declaration", and that token
    -- could never be rebuilt. It made rule 27's down-then-up loop impossible for every
    -- provisioned table, which is how it was found. When the relation is gone the stored
    -- declaration is a record of what once stood there; provision() creates, so it proceeds
    -- and appends a new row beside the old one.
    select * into v_cur from platform.v_provision_spec_current c
     where c.token = v_token
       and to_regclass(format('%I.%I', c.spec->>'schema', c.spec->>'table')) is not null;
    if found then
      -- Lane B may only see its OWN declarations. Another organization's token answers
      -- exactly like any taken token, so neither existence nor the hash leaks.
      if p_lane = 'restricted' and v_cur.owner_org_id is distinct from p_org_id then
        raise exception '%', (platform.provision_finding('identity.token.taken', 'token', null, v_token))->>'message'
          using errcode = 'check_violation';
      end if;
      if v_cur.spec_hash = v_hash then
        return platform._provision_says_the_kernel_was_rerecorded(jsonb_build_object('ok', true, 'unchanged', true, 'token', v_token,
                 'spec_hash', v_hash, 'plan', '[]'::jsonb, 'created', '[]'::jsonb,
                 'certify', '[]'::jsonb,
                 'detail', format('%s already carries this exact declaration (applied %s). Nothing was written.',
                                  v_token, v_cur.applied_at)));
      end if;
      raise exception 'provision: % already carries a DIFFERENT declaration. provision() creates, it never alters. Changed: %',
        v_token,
        coalesce((select string_agg(k, ', ' order by k)
                    from (select key k from jsonb_each(n)
                          union select key from jsonb_each(v_cur.spec)) x
                   where (n->x.k) is distinct from (v_cur.spec->x.k)), '(no key-level difference — only the hash)')
        using errcode = 'check_violation',
              hint = (select otherwise from platform.provision_rule_message where rule_id = 'evolve.changed_spec');
    end if;
  end if;

  -- ---- findings: ONE error, and nothing written ------------------------
  if not (v_res->>'ok')::boolean then
    raise exception 'provision: % finding(s); call platform.provision_validate(<spec>) for the list. Nothing was written.',
      jsonb_array_length(v_res->'findings')
      using errcode = 'check_violation',
            hint = format('The rules that refused: %s',
                     (select string_agg(x->>'rule_id', ', ') from jsonb_array_elements(v_res->'findings') x));
  end if;

  v_schema  := n->>'schema';
  v_table   := n->>'table';
  v_variant := n->>'rls_variant';
  v_rel     := format('%I.%I', v_schema, v_table);
  v_soft    := (n->>'soft_delete')::boolean;
  v_vis     := n->'access'->>'visibility';
  v_cat     := (n->>'category')::boolean;
  v_class   := n->'access'->>'data_class';

  -- 🚨 THE SCHEMA'S DECLARED EXPOSURE, READ ONCE, HONOURED BY EVERY GRANT BELOW.
  -- `platform.schema_client_exposure` is the declaration; a schema with no row keeps the
  -- platform's historical answer (exposed), so an existing spec's result is unchanged.
  v_client_exposed := platform.schema_is_client_exposed(v_schema);

  perform set_config('matrx.provisioner', '1', true);
  perform platform.provision_marker_set(true);   -- wave 3: the proof the guards actually read

  -- ---- types[] ---------------------------------------------------------
  for v_item in select value from jsonb_array_elements(n->'types') loop
    if to_regtype(format('%I.%I', v_schema, v_item->>'name')) is not null
       and (platform.provision_batch_context()->'types' ? format('%s.%s', v_schema, v_item->>'name')) then
      continue;   -- created by platform.provision_batch before this member ran
    end if;
    execute format('create type %I.%I as enum (%s)', v_schema, v_item->>'name',
             (select string_agg(quote_literal(l), ', ')
                from jsonb_array_elements_text(v_item->'labels') l));
    v_created := v_created || jsonb_build_object('type', format('%s.%s', v_schema, v_item->>'name'));
  end loop;

  -- ---- the table -------------------------------------------------------
  -- PARTITIONED OR NOT, THIS IS THE SAME BUILDER. When the spec declares no partition the
  -- emitted DDL is byte-for-byte what it has always been; `v_part` is null, `v_pkey` is
  -- null, and every branch below collapses to the empty string.
  v_part := case when jsonb_typeof(n->'partition') = 'object' then n->'partition' else null end;
  if v_part is null then
    v_cols := 'id uuid primary key default gen_random_uuid()';
  else
    -- PostgreSQL refuses a unique constraint on a partitioned table that does not contain
    -- the partition key, so `id` stops being the whole key and becomes its tail.
    v_pcount := (v_part->>'count')::integer;
    v_pkey   := (select string_agg(format('%I', c), ', ')
                   from jsonb_array_elements_text(v_part->'key') c);
    v_cols   := 'id uuid not null default gen_random_uuid()';
  end if;
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    v_frag := format('%I %s', v_item->>'name', to_regtype(v_item->>'type')::text);
    if v_item ? 'generated' then
      v_frag := v_frag || format(' generated always as (%s) stored', v_item->'generated'->>'expression');
    else
      if coalesce((v_item->>'not_null')::boolean, false) then v_frag := v_frag || ' not null'; end if;
      if v_item ? 'default' and jsonb_typeof(v_item->'default') <> 'null' then
        v_frag := v_frag || format(' default %s', v_item->'default' #>> '{}');
      end if;
    end if;
    if v_item ? 'references' then
      v_target := v_item->'references'->>'target';
      v_od := case lower(v_item->'references'->>'on_delete')
                when 'cascade' then 'cascade' when 'restrict' then 'restrict'
                when 'set_null' then 'set null' else 'no action' end;
      v_target := coalesce(
        (select format('%I.%I', e.schema_name, e.table_name) from platform.entity_types e where e.token = v_target),
        platform.provision_batch_token_rel(v_target),
        case when v_target = v_token then v_rel end,
        to_regclass(v_target)::text);
      if to_regclass(v_target) is not null then
        v_frag := v_frag || format(' references %s(id) on delete %s', v_target, v_od);
      else
        -- G3/G13: the table itself (a tree), or a batch member not built yet. The
        -- constraint is added the moment its target exists; the column is born now.
        v_dfk := v_dfk || jsonb_build_object('column', v_item->>'name', 'target', v_target, 'on_delete', v_od);
      end if;
    end if;
    if v_item ? 'check' then
      v_frag := v_frag || format(' check (%s)', v_item->>'check');
    end if;
    v_cols := v_cols || ', ' || v_frag;
  end loop;

  -- 🚨 THE FRONT DOOR IS NOT HELD WHILE THE TABLE IS BUILT (incident 2026-09-21).
  -- `references auth.users` inside CREATE TABLE takes SHARE ROW EXCLUSIVE on auth.users and
  -- holds it to COMMIT — measured at 298,560 ms with 22 sessions queued behind it, GoTrue's
  -- sign-in read among them. In deferred mode the columns are born bare and the three
  -- foreign keys are added afterwards, each in its own short transaction, by
  -- platform.provision_attach_base_contract / _validate_base_contract. The debt is written
  -- down below and the result document carries the remedy: nothing about the gap is silent.
  v_defer_base := platform.provision_defer_base_fks();
  if v_defer_base then
    v_cols := v_cols || ', organization_id uuid not null';
    v_cols := v_cols || ', created_by uuid';
    v_cols := v_cols || ', updated_by uuid';
  else
    v_cols := v_cols || ', organization_id uuid not null references iam.organizations(id)';
    v_cols := v_cols || ', created_by uuid references auth.users(id)';
    v_cols := v_cols || ', updated_by uuid references auth.users(id)';
  end if;
  v_cols := v_cols || ', created_at timestamptz not null default now()';
  v_cols := v_cols || ', updated_at timestamptz not null default now()';
  if v_soft then v_cols := v_cols || ', deleted_at timestamptz'; end if;
  v_cols := v_cols || ', version integer not null default 1';
  v_cols := v_cols || ', metadata jsonb not null default ''{}''::jsonb';
  -- REC-40 / REC-60: the one field-value column, emitted by the builder, immediately after
  -- `metadata` so the platform-wide column is never confused with a table's own domain
  -- columns. The spec key already existed and the platform's answer is still `false`; what
  -- changes is that answering `true` now EMITS something instead of being recorded and
  -- ignored.
  if coalesce((n->>'custom_fields')::boolean, false) then
    v_cols := v_cols || ', custom_fields jsonb not null default ''{}''::jsonb';
  end if;
  if v_vis is not null then
    v_cols := v_cols || format(', visibility platform.visibility not null default %L::platform.visibility', v_vis);
  end if;
  if v_cat then v_cols := v_cols || ', category_id uuid references platform.categories(id)'; end if;
  for v_item in select value from jsonb_array_elements(n->'checks') loop
    v_cols := v_cols || format(', constraint %I check (%s)', v_item->>'name', v_item->>'expression');
  end loop;

  if v_part is not null then
    v_cols := v_cols || format(', constraint %I primary key (%s, id)',
                left(format('%s_pkey', v_table), 63), v_pkey);
  end if;

  execute format('create table %s (%s)%s', v_rel, v_cols,
    case when v_part is null then '' else format(' partition by hash (%s)', v_pkey) end);
  v_created := v_created || jsonb_build_object('table', format('%s.%s', v_schema, v_table));

  -- 🚨 THE REVOKE IS NOT BELT-AND-BRACES. 20 schemas carry ALTER DEFAULT PRIVILEGES
  -- rows that grant every NEW relation automatically — crm gives authenticated=arwd
  -- and service_role=arwd AT `CREATE TABLE`. iam.apply_table_grants (inside apply_rls)
  -- then grants what the variant actually earns.
  execute format('revoke all on table %s from public, anon, authenticated, service_role', v_rel);

  -- ---- the children, in THIS transaction --------------------------------
  -- They are created here, before the indexes and the triggers, so that every partitioned
  -- index and every row trigger the builder attaches to the parent propagates to all of
  -- them at birth rather than being a thing somebody has to remember for child seventeen.
  -- The guard exempts a partition child of a registered parent, and inside provision() the
  -- marker exempts both — Doctrine: partitions are their parent.
  if v_part is not null then
    for v_ix in 0 .. v_pcount - 1 loop
      execute format('create table %I.%I partition of %s for values with (modulus %s, remainder %s)',
                     v_schema, format('%s_p%s', v_table, lpad(v_ix::text, 2, '0')), v_rel, v_pcount, v_ix);
      execute format('revoke all on table %I.%I from public, anon, authenticated, service_role',
                     v_schema, format('%s_p%s', v_table, lpad(v_ix::text, 2, '0')));
    end loop;
    v_created := v_created || jsonb_build_object('partitions',
      format('%s hash partition(s) of %s on (%s), %s.%s_p00 … %s.%s_p%s',
             v_pcount, v_rel, v_pkey, v_schema, v_table, v_schema, v_table,
             lpad((v_pcount - 1)::text, 2, '0')));
  end if;

  -- ---- the foreign keys that could not be inline ------------------------
  -- A self reference can be added now (the table exists). A reference to a batch member
  -- that is not built yet is handed to platform.provision_batch, which adds it once every
  -- member exists. The covering index is created in the index block below either way.
  foreach v_item in array v_dfk loop
    if to_regclass(v_item->>'target') is not null then
      execute format('alter table %s add constraint %I foreign key (%I) references %s(id) on delete %s',
                     v_rel, left(format('%s_%s_fkey', v_table, v_item->>'column'), 63),
                     v_item->>'column', v_item->>'target', v_item->>'on_delete');
      v_created := v_created || jsonb_build_object('foreign_key',
        format('%s.%s -> %s (self reference)', v_rel, v_item->>'column', v_item->>'target'));
    elsif platform.provision_batch_context() ? 'batch_id' then
      perform platform.provision_batch_defer('fks', v_item || jsonb_build_object('relation', v_rel, 'table', v_table));
      v_created := v_created || jsonb_build_object('foreign_key_deferred',
        format('%s.%s -> %s (added by the batch once %s exists)', v_rel, v_item->>'column', v_item->>'target', v_item->>'target'));
    else
      raise exception 'provision: %.% references %, which does not exist and is not declared in this call', v_rel, v_item->>'column', v_item->>'target'
        using errcode = 'check_violation';
    end if;
  end loop;

  -- ---- comments (the cheapest machine-readable intent we have) ----------
  execute format('comment on table %s is %L', v_rel, n->>'description');
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    if v_item ? 'description' then
      execute format('comment on column %s.%I is %L', v_rel, v_item->>'name', v_item->>'description');
    end if;
  end loop;

  -- ---- indexes ---------------------------------------------------------
  -- EVERY FK gets a covering index, base columns organization_id and created_by included
  -- (they are columns the BUILDER emits, so the rule lives here and not in the
  -- declaration). NEVER updated_by: P3-05 measured 0 of 4,917 statements filtering on it
  -- and the platform's own FK-index batch excludes it by rule (G6). A declared index that
  -- LEADS with an FK column is that column's covering index, so the automatic one is not
  -- emitted beside it — which is how a partial FK index is declared (G5).
  select coalesce(array_agg(x.value->'columns'->>0), '{}'::text[]) into v_lead
    from jsonb_array_elements(n->'indexes') x
   where jsonb_typeof(x.value->'columns') = 'array' and jsonb_array_length(x.value->'columns') > 0;
  v_lead := v_lead || coalesce(array(select x.value->>'name' from jsonb_array_elements(n->'fields') x
                                      where coalesce((x.value->>'unique')::boolean, false)), '{}'::text[]);
  foreach v_txt in array array['organization_id','created_by'] loop
    if not (v_txt = any (v_lead)) then
      execute format('create index on %s (%I)', v_rel, v_txt);
    end if;
  end loop;
  if v_cat and not ('category_id' = any (v_lead)) then execute format('create index on %s (category_id)', v_rel); end if;
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    if v_item ? 'references' and coalesce((v_item->>'index')::boolean, true)
       and not ((v_item->>'name') = any (v_lead)) then
      execute format('create index on %s (%I)', v_rel, v_item->>'name');
    end if;
    if coalesce((v_item->>'unique')::boolean, false) then
      v_idx := v_idx || jsonb_build_array(jsonb_build_object(
        'columns', jsonb_build_array(v_item->>'name'), 'unique', true,
        'where', case when v_soft then 'deleted_at IS NULL' else null end));
    end if;
    if (n->>'gin_jsonb')::boolean and lower(coalesce(v_item->>'type','')) = 'jsonb' then
      execute format('create index on %s using gin (%I)', v_rel, v_item->>'name');
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(n->'indexes' || v_idx) loop
    execute format('create %s index on %s using %s (%s)%s',
      case when coalesce((v_item->>'unique')::boolean, false) then 'unique' else '' end,
      v_rel, coalesce(v_item->>'method','btree'),
      -- G4: `expression` is the parenthesised index expression, verbatim (lane A only —
      -- the validator refuses it on lane B by name); otherwise the quoted column list.
      coalesce(nullif(btrim(v_item->>'expression'), ''),
               (select string_agg(format('%I', c), ', ') from jsonb_array_elements_text(v_item->'columns') c)),
      case when v_item->>'where' is not null then format(' where %s', v_item->>'where') else '' end);
  end loop;

  -- ---- REGISTER (before the triggers: the admission trigger on this INSERT
  --      attaches _stamp_actor_tier itself — B-77) ------------------------
  insert into platform.entity_types(
    token, schema_name, table_name, label, origin, is_versioned, has_soft_delete,
    is_component, is_listed, default_visibility, rls_variant, table_ref, is_active,
    data_class, default_list_scope, suppress_platform_admin_lane, category,
    title_column, content_role, relation_kind, projects_token, audit_class, audit_class_reason,
    client_read_only, reference_pickable, agent_writable, agent_write_notes, confirmation_enabled,
    client_excluded_columns, component_anon_read_via_public_parent, taxonomy_node_id,
    base_tier, is_module, default_members_can_add, default_needs_approval, default_scopeable,
    default_auto_ingest, allow_preview, reference_candidate_predicates, governed_columns,
    retention_owner_column, user_artifact_kind, reference_category,
    lifecycle_enlisted, lifecycle_hot_days, version_store, data_class_reason,
    type, custom_fields_enabled)
  values (
    v_token, v_schema, v_table, n->>'label', n->>'origin',
    (n->>'versioned')::boolean, v_soft,
    (v_variant = 'component'), (n->>'is_listed')::boolean,
    nullif(v_vis,'')::platform.visibility, v_variant, v_rel::regclass, true,
    v_class::platform.data_class,
    (n->'access'->>'default_list_scope')::platform.list_scope,
    -- §3.1 derivation two: a private or confidential token closes the platform-admin
    -- lane. A detail's class is its parent's and is resolved below, once parents exist.
    coalesce(v_variant = 'restricted' or v_class in ('private', 'confidential'), false),
    n->>'category_label',
    n->>'title_column', n->>'content_role', n->>'relation_kind', n->>'projects_token',
    n->>'audit_class', n->>'audit_class_reason',
    (n->>'client_read_only')::boolean, (n->>'reference_pickable')::boolean,
    (n->>'agent_writable')::boolean, n->>'agent_write_notes', (n->>'confirmation_enabled')::boolean,
    nullif(array(select jsonb_array_elements_text(n->'client_excluded_columns')), '{}'),
    coalesce((n->>'component_anon_read_via_public_parent')::boolean, false),
    (n->>'taxonomy_node_id')::uuid,
    (n->>'base_tier')::smallint, (n->>'is_module')::boolean,
    (n->>'default_members_can_add')::boolean, (n->>'default_needs_approval')::boolean,
    (n->>'default_scopeable')::boolean, (n->>'default_auto_ingest')::boolean,
    (n->>'allow_preview')::boolean, n->'reference_candidate_predicates',
    case when jsonb_typeof(n->'governed_columns') = 'array'
         then array(select jsonb_array_elements_text(n->'governed_columns')) end,
    n->>'retention_owner_column', n->>'user_artifact_kind', n->>'reference_category',
    coalesce((n->'lifecycle'->>'enlisted')::boolean, false),
    (n->'lifecycle'->>'hot_days')::integer,
    n->>'version_store', n->'access'->>'data_class_reason',
    n->>'type', (n->>'type') in ('entity', 'detail'));
  v_created := v_created || jsonb_build_object('entity_type', v_token);

  -- ---- parents ---------------------------------------------------------
  for v_txt in select value #>> '{}' from jsonb_array_elements(n->'parents') loop
    insert into platform.entity_relationships(child_type, parent_type, fk_column, kind)
    values (v_token, btrim(split_part(v_txt, ':', 1)), btrim(split_part(v_txt, ':', 2)), 'composition');
  end loop;

  -- A detail (and a ledger) is judged on its RESOLVED class (DD-137b10): under a
  -- private or confidential parent the platform-staff lane is closed on it too.
  if v_variant in ('component', 'ledger')
     and (iam.class_lanes(v_token)).resolved_class::text in ('private', 'confidential') then
    update platform.entity_types set suppress_platform_admin_lane = true where token = v_token;
  end if;

  -- ---- triggers --------------------------------------------------------
  execute format('create trigger _stamp_actor before insert or update on %s for each row execute function platform._stamp_actor()', v_rel);
  -- B-77: the entity_types admission trigger may already have attached this one.
  -- The test is BY FUNCTION, never by name (DD-173).
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = v_rel::regclass and not t.tgisinternal
                    and t.tgfoid = 'platform._stamp_actor_tier()'::regprocedure) then
    execute format('create trigger _stamp_actor_tier before insert or update on %s for each row execute function platform._stamp_actor_tier()', v_rel);
  end if;
  execute format('create trigger _touch_row before insert or update on %s for each row execute function platform._touch_row()', v_rel);
  execute format('create trigger _metadata_guard before insert or update of metadata on %s for each row execute function platform._metadata_guard(%L)', v_rel, v_token);
  if (n->>'versioned')::boolean then
    execute format('create trigger _version_capture after insert or delete or update on %s for each row execute function platform._version_capture(%L)', v_rel, v_token);
  end if;

  -- The ONE shared tenancy trigger, per declared nullable FK into a tenant table.
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    if coalesce((v_item->>'tenancy_check')::boolean, false) then
      v_target := v_item->'references'->>'target';
      v_target := coalesce(
        (select format('%I.%I', e.schema_name, e.table_name) from platform.entity_types e where e.token = v_target),
        platform.provision_batch_token_rel(v_target),
        case when v_target = v_token then v_rel end,
        to_regclass(v_target)::text);
      execute format(
        'create trigger %I before insert or update of %I on %s for each row execute function platform.assert_same_org(%L, %L)',
        left(format('_same_org_%s', v_item->>'name'), 63), v_item->>'name', v_rel,
        v_item->>'name', v_target);
    end if;
  end loop;

  perform platform.sync_association_gc_triggers(v_token);

  -- ---- the single write door, DECLARED BEFORE THE GRANTS ARE GENERATED ---
  -- 🚨 THE CLASS FIX, NOT THE INSTANCE. iam.apply_table_grants issues
  -- `grant select, insert, update, delete … to authenticated` for every non-ledger variant,
  -- so a REVOKE issued AFTER apply_rls lasts exactly until the next regeneration — the
  -- failure that function's own DD-248 comment describes in as many words. The register it
  -- already reads is where a one-write-door table says so, so the generator itself issues
  -- the narrow grant and every regeneration keeps it.
  if n->>'write_door' = 'single' then
    insert into platform.stamped_write_table(
      schema_name, table_name, stamp_column, rls_variant, declared_by, reason)
    values (v_schema, v_table, 'created_by', v_variant, format('platform.provision(%s)', v_token),
            format('write_door = single. `authenticated` holds no direct INSERT, UPDATE or DELETE on %s; the only write path is %s, declared in platform.client_callable_door in this same transaction. iam.apply_table_grants reads THIS register (DD-248), so the narrow grant is what the generator issues rather than something revoked behind its back — which would last only until the next regeneration.',
                   v_rel,
                   coalesce((select string_agg(format('%s.%s', v_schema, x.value->>'name'), ', ')
                               from jsonb_array_elements(n->'functions') x), '(none declared)')))
    on conflict (schema_name, table_name) do nothing;
    v_created := v_created || jsonb_build_object('write_door', format('single: %s', v_rel));
  end if;

  -- ---- RLS -------------------------------------------------------------
  perform iam.apply_rls(v_schema, v_table, v_token, v_variant);

  -- A policy on the PARENT is not consulted when a partition is addressed DIRECTLY, and
  -- ENABLE ROW LEVEL SECURITY does not cascade. "Unreachable" must never depend on which
  -- relation name a caller happens to type, so every child carries RLS enabled with no
  -- policy of its own, which denies every non-owner outright.
  if v_part is not null then
    for v_ix in 0 .. v_pcount - 1 loop
      execute format('alter table %I.%I enable row level security',
                     v_schema, format('%s_p%s', v_table, lpad(v_ix::text, 2, '0')));
      execute format('revoke all on table %I.%I from public, anon, authenticated, service_role',
                     v_schema, format('%s_p%s', v_table, lpad(v_ix::text, 2, '0')));
    end loop;
  end if;

  -- ---- realtime (G10: was accepted and discarded) -----------------------
  -- `true` adds the table to the supabase_realtime publication, under its RLS.
  if coalesce((n->>'realtime')::boolean, false) then
    execute format('alter publication supabase_realtime add table %s', v_rel);
    v_created := v_created || jsonb_build_object('realtime', format('supabase_realtime carries %s', v_rel));
  end if;

  -- ---- association types -----------------------------------------------
  -- An edge naming a batch member that is not registered yet is handed to the batch,
  -- which writes it once every member exists.
  for v_item in select value from jsonb_array_elements(n->'association_types') loop
    if (platform.provision_batch_context() ? 'batch_id')
       and (not exists (select 1 from platform.entity_types e where e.token = v_item->>'source_type')
            or not exists (select 1 from platform.entity_types e where e.token = v_item->>'target_type')) then
      perform platform.provision_batch_defer('edges', v_item);
      v_created := v_created || jsonb_build_object('association_type_deferred',
        format('%s -> %s (written by the batch once both tokens exist)', v_item->>'source_type', v_item->>'target_type'));
      continue;
    end if;
    insert into platform.association_types(source_type, target_type, label, container_side, conveys_max, notes)
    values (v_item->>'source_type', v_item->>'target_type', v_item->>'label',
            coalesce(v_item->>'container_side','none'),
            coalesce(v_item->>'conveys_max','editor')::public.permission_level, v_item->>'notes')
    on conflict (source_type, target_type) do nothing;
  end loop;

  -- ---- knobs (SAME transaction: knob_resolve raises on a missing knob) ---
  for v_item in select value from jsonb_array_elements(n->'knobs') loop
    insert into platform.feature_knob(feature, key, value, default_value, value_type, unit,
      min_value, max_value, allowed_values, label, description, set_by, overridable_by,
      override_direction, propagation, taxonomy_node_id)
    values (v_item->>'feature', v_item->>'key', v_item->'value',
            coalesce(v_item->'default_value', v_item->'value'), v_item->>'value_type',
            v_item->>'unit', (v_item->>'min_value')::numeric, (v_item->>'max_value')::numeric,
            v_item->'allowed_values', v_item->>'label', v_item->>'description',
            coalesce(v_item->>'set_by','agent'),
            coalesce(array(select jsonb_array_elements_text(v_item->'overridable_by')), '{}'::text[]),
            coalesce(v_item->>'override_direction','any'), coalesce(v_item->>'propagation','next_load'),
            (v_item->>'taxonomy_node_id')::uuid)
    on conflict (feature, key) do nothing;
    v_created := v_created || jsonb_build_object('knob', format('%s/%s', v_item->>'feature', v_item->>'key'));
  end loop;

  -- ---- views -----------------------------------------------------------
  for v_item in select value from jsonb_array_elements(n->'views') loop
    execute format('create view %I.%I with (security_invoker = %s) as %s',
      v_schema, v_item->>'name',
      case when coalesce((v_item->>'security_invoker')::boolean, true) then 'true' else 'false' end,
      v_item->>'definition');
    -- A view in a CLOSED schema is a relation like any other: the schema's default ACL is the
    -- source of a new relation's grants (20 schemas carry one), so it is revoked by name here
    -- rather than left to whatever the schema happens to declare.
    if not v_client_exposed then
      execute format('revoke all on %I.%I from public, anon, authenticated, service_role',
                     v_schema, v_item->>'name');
    end if;
    v_created := v_created || jsonb_build_object('view', format('%s.%s', v_schema, v_item->>'name'));

    -- G9: `registered_as_projection` was checked and then nothing was written. The view is
    -- registered the way agent_card and workflow_card are: relation_kind = 'projection',
    -- projects_token naming the table it projects, audit_class = 'machinery' with the
    -- declared reason. The declared primary key must be columns the view actually has —
    -- db/generate.py hard-fails for EVERY schema on a registered view with a bad key.
    if coalesce((v_item->>'registered_as_projection')::boolean, false) then
      for v_txt in select jsonb_array_elements_text(v_item->'primary_key') loop
        if not exists (select 1 from pg_attribute a
                        where a.attrelid = to_regclass(format('%I.%I', v_schema, v_item->>'name'))
                          and a.attname = v_txt and a.attnum > 0 and not a.attisdropped) then
          raise exception '%', (platform.provision_finding('views.projection.primary_key.unknown',
                   format('views[%s].primary_key', v_item->>'name'), null,
                   format('%s is not a column of %s.%s', v_txt, v_schema, v_item->>'name')))->>'message'
            using errcode = 'check_violation';
        end if;
      end loop;
      insert into platform.entity_types(
        token, schema_name, table_name, label, origin, is_component, rls_variant,
        relation_kind, projects_token, audit_class, audit_class_reason, is_versioned,
        has_soft_delete, is_listed, is_active, taxonomy_node_id, category, type, custom_fields_enabled)
      values (v_item->>'token', v_schema, v_item->>'name', v_item->>'label', 'standard', true, 'component',
              'projection', coalesce(v_item->>'projects_token', v_token), 'machinery',
              format('Projection: %s.%s is a view over %s (%s). It owns no rows — it exists to carry the %s permission scope. %s',
                     v_schema, v_item->>'name', v_rel, v_token, v_item->>'token', v_item->>'reason'),
              false, false, false, true, (n->>'taxonomy_node_id')::uuid, n->>'category_label', 'system', false);
      v_created := v_created || jsonb_build_object('projection', format('%s (%s.%s, key %s)', v_item->>'token', v_schema, v_item->>'name', v_item->'primary_key'::text));
    end if;
  end loop;

  -- ---- functions -------------------------------------------------------
  -- An entry WITH a body is created (lane A only — the validator refuses a body on
  -- lane B). An entry WITHOUT one declares a door for a function that already exists.
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    if v_item ? 'body' then
      execute format('create function %I.%I(%s) returns %s language %s %s set search_path to %L as $provision_body$%s$provision_body$',
        v_schema, v_item->>'name', coalesce(v_item->>'args',''), v_item->>'returns',
        coalesce(v_item->>'language','plpgsql'),
        case when lower(coalesce(v_item->>'security','invoker')) = 'definer' then 'security definer' else 'security invoker' end,
        coalesce(v_item->>'search_path','pg_catalog'), v_item->>'body');
      -- PostgreSQL grants EXECUTE on a new function to PUBLIC implicitly (proacl stays NULL),
      -- so a function born in a CLOSED schema is callable by every client role unless this
      -- revoke is issued. Measured on the rehearsal branch 2026-09-17: four functions in
      -- schema `custom` read `proacl IS NULL`, which is PUBLIC=EXECUTE.
      if not v_client_exposed then
        execute format('revoke all on function %I.%I(%s) from public, anon, authenticated, service_role',
                       v_schema, v_item->>'name', coalesce(v_item->>'args',''));
      end if;
      v_created := v_created || jsonb_build_object('function', format('%s.%s', v_schema, v_item->>'name'));
    end if;
  end loop;

  -- ---- per-argument check, against the CATALOGUE (lessons ledger 23 + 27) ----
  -- The validator checked the text the spec wrote; this checks what exists, so a
  -- spec whose `args` text disagrees with its body, or a lane-B door on an existing
  -- function, cannot slip past.
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    select p.oid, pg_get_function_arguments(p.oid) as args into r
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = v_schema and p.proname = v_item->>'name'
     order by p.oid desc limit 1;
    if not found then
      v_argf := v_argf || platform.provision_finding('functions.not_found',
                 format('functions[%s].name', v_item->>'name'), null,
                 format('%s.%s does not exist', v_schema, v_item->>'name'));
    else
      v_argf := v_argf || platform.provision_arg_check_findings(v_item->>'name', r.args, v_item->'arg_checks');
    end if;
  end loop;
  if cardinality(v_argf) > 0 then
    raise exception 'provision: % function argument finding(s). Nothing was written.%',
      cardinality(v_argf),
      (select string_agg(E'\n\n' || (x->>'message'), '') from unnest(v_argf) x)
      using errcode = 'check_violation',
            hint = (select otherwise from platform.provision_rule_message where rule_id = 'functions.arg_checks.missing');
  end if;

  -- ---- sharing ---------------------------------------------------------
  if jsonb_typeof(n->'sharing') = 'object' then
    insert into platform.shareable_resource_registry(
      resource_type, schema_name, table_name, id_column, owner_column, display_label,
      url_path_template, is_link_shareable, is_scopeable, public_columns, content_role,
      organization_id, visibility)
    values (v_token, v_schema, v_table, 'id',
            coalesce(n->'sharing'->>'owner_column','created_by'),
            n->'sharing'->>'display_label', n->'sharing'->>'url_path_template',
            coalesce((n->'sharing'->>'is_link_shareable')::boolean, false),
            coalesce((n->'sharing'->>'is_scopeable')::boolean, false),
            nullif(array(select jsonb_array_elements_text(n->'sharing'->'public_columns')), '{}'),
            n->>'content_role',
            coalesce(p_org_id, public.system_org_id('system')),
            coalesce(nullif(v_vis,'')::platform.visibility, 'internal'::platform.visibility));
    v_created := v_created || jsonb_build_object('shareable_resource', v_token);
  end if;

  -- ---- DOORS, then GRANTS. In that order, always. -----------------------
  -- Lessons ledger 1 and 24: an undeclared grant is silently stripped, and a
  -- guard-log revoke row means the grant preceded the door — 51 times out of 86.
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    select p.oid, pg_get_function_identity_arguments(p.oid) ia, platform.door_argtypes(p.proargtypes) at,
           pg_get_function_arguments(p.oid) fa
      into r
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = v_schema and p.proname = v_item->>'name'
     order by p.oid desc limit 1;

    if exists (select 1 from platform.client_callable_door c
                where c.schema_name = v_schema and c.function_name = v_item->>'name'
                  and c.identity_argtypes = r.at) then
      raise exception '%', (platform.provision_finding('functions.door_exists',
               format('functions[%s].name', v_item->>'name'), null,
               format('%s.%s(%s)', v_schema, v_item->>'name', r.ia)))->>'message'
        using errcode = 'check_violation';
    end if;

    -- 0796: the per-argument rules are STORED, not validated and thrown away (G15).
    insert into platform.client_callable_door(
      schema_name, function_name, identity_args, identity_argtypes, reason,
      argument_rules, contract_probe,
      anonymous_callers, anonymous_purpose, signed_in_callers, non_client_lane, declared_by)
    values (v_schema, v_item->>'name', r.ia, r.at, v_item->>'reason',
            platform.door_rules_normalize(r.fa, v_item->'arg_checks'),
            case when jsonb_typeof(v_item->'contract_probe') = 'object' then v_item->'contract_probe' end,
            (v_item->>'client_access') = 'anonymous',
            case when (v_item->>'client_access') = 'anonymous' then v_item->>'anonymous_purpose' end,
            (v_item->>'client_access') in ('anonymous','signed_in'),
            case when (v_item->>'client_access') = 'server_only' then v_item->>'non_client_lane' end,
            format('platform.provision(%s)', v_token));
    v_created := v_created || jsonb_build_object('door', format('%s.%s(%s)', v_schema, v_item->>'name', r.ia));
    v_refs := v_refs || format('%s.%s(%s)', v_schema, v_item->>'name', r.ia);

    -- Collected, not issued: every GRANT goes last, as ONE block. Each GRANT fires a
    -- DB-wide re-sweep of ~2,000 DEFINER functions (ATTACK #8).
    -- The DOOR ROW is written whatever the schema's exposure is — it is the declaration of
    -- what this function is FOR, and it is what `iam.apply_table_grants`, the door census and
    -- switch-checklist step 3 all read. The GRANT is the access, and a CLOSED schema gets none.
    if not v_client_exposed then
      if (v_item->>'client_access') in ('signed_in','anonymous') then
        raise notice
          'provision: door %.%(%) is declared % and its platform.client_callable_door row was written, but schema % is declared CLOSED in platform.schema_client_exposure — the EXECUTE grant was NOT issued. Opening the schema (platform.schema_client_exposure.client_exposed = true) and re-running the provisioner issues it.',
          v_schema, v_item->>'name', r.ia, v_item->>'client_access', v_schema;
      end if;
      v_grants := v_grants || format('revoke all on function %I.%I(%s) from public, anon, authenticated, service_role',
                                     v_schema, v_item->>'name', r.ia);
    elsif (v_item->>'client_access') = 'signed_in' then
      v_grants := v_grants || format('grant execute on function %I.%I(%s) to authenticated',
                                     v_schema, v_item->>'name', r.ia);
    elsif (v_item->>'client_access') = 'anonymous' then
      v_grants := v_grants || format('grant execute on function %I.%I(%s) to anon, authenticated',
                                     v_schema, v_item->>'name', r.ia);
    end if;
  end loop;

  foreach v_txt in array v_grants loop
    execute v_txt;
  end loop;

  -- ---- the door proof (PLAN §4.5): what exists matches what was declared ----
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    select p.oid into r
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = v_schema and p.proname = v_item->>'name'
     order by p.oid desc limit 1;
    -- The door proof compares the catalogue to what was DECLARED **and what the schema's
    -- exposure allows** — in a closed schema the expected answer for both roles is false, and
    -- a proof that still expected the declaration would refuse every provision into one.
    if (has_function_privilege('authenticated', r.oid, 'EXECUTE')
          is distinct from (v_client_exposed and (v_item->>'client_access') in ('signed_in','anonymous')))
       or (has_function_privilege('anon', r.oid, 'EXECUTE')
          is distinct from (v_client_exposed and (v_item->>'client_access') = 'anonymous')) then
      raise exception '%', (platform.provision_finding('doors.proof_failed',
               format('functions[%s].client_access', v_item->>'name'), null,
               format('declared %s (schema client-exposed = %s); observed authenticated EXECUTE = %s, anon EXECUTE = %s',
                      v_item->>'client_access', v_client_exposed,
                      has_function_privilege('authenticated', r.oid, 'EXECUTE'),
                      has_function_privilege('anon', r.oid, 'EXECUTE'))))->>'message'
        using errcode = 'check_violation';
    end if;
  end loop;

  -- ---- the write-door proof: the narrow grant, OBSERVED -----------------
  -- Same shape as the door proof above, and for the same reason: the declaration is worth
  -- nothing unless the catalogue agrees with it at the end of the transaction.
  if n->>'write_door' = 'single' then
    if has_table_privilege('authenticated', v_rel::regclass, 'INSERT')
       or has_table_privilege('authenticated', v_rel::regclass, 'UPDATE')
       or has_table_privilege('authenticated', v_rel::regclass, 'DELETE') then
      raise exception '%', (platform.provision_finding('write_door.proof_failed', 'write_door', null,
               format('authenticated still holds INSERT=%s UPDATE=%s DELETE=%s on %s',
                      has_table_privilege('authenticated', v_rel::regclass, 'INSERT'),
                      has_table_privilege('authenticated', v_rel::regclass, 'UPDATE'),
                      has_table_privilege('authenticated', v_rel::regclass, 'DELETE'), v_rel)))->>'message'
        using errcode = 'check_violation';
    end if;
  end if;

  -- The guard revoked PUBLIC's default EXECUTE on every DEFINER function created above
  -- and logged it, BEFORE its door could exist (a door row cannot precede the function
  -- it names, and a both-flags-false door that precedes it makes the guard refuse the
  -- CREATE). The door now declares the decision, so the row is acknowledged with that
  -- reason — only rows this transaction produced, only for the functions just doored.
  update platform.ddl_guard_log l
     set acknowledged_at = now(),
         acknowledged_by = format('platform.provision(%s)', v_token),
         ack_reason = format('The birth revoke of PUBLIC''s default EXECUTE was correct; platform.provision(%s) declared this function''s door in the same transaction (lessons ledger 24).', v_token)
   where l.acknowledged_at is null
     and l.rule = 'definer_client_grant_revoked'
     and l.occurred_at >= now()
     and l.object_ref = any (v_refs);

  -- ---- certification ---------------------------------------------------
  -- ONE JUDGEMENT, SHARED WITH THE BATCH (lane PROVISION-BATCH-FIX, 2026-09-26). What
  -- refuses, what is owed, and what the certify document says are decided by
  -- platform.provision_certify_judged — the same function platform.provision_batch calls when
  -- it certifies its members again after their deferred constraints. Until this file the batch
  -- carried its own copy of this loop without the deferred base-contract rule, and so refused
  -- EVERY batch with base_org_fk / base_created_by_fk / base_updated_by_fk the moment the
  -- base contract was deferred (the default). One function; the two paths cannot diverge again.
  v_judged  := platform.provision_certify_judged(v_schema, v_table, v_token, v_defer_base);
  v_certify := array(select jsonb_array_elements(v_judged->'certify'));
  v_refuse  := array(select jsonb_array_elements_text(v_judged->'refuse'));
  if cardinality(v_refuse) > 0 then
    raise exception 'provision: % refused certification. Nothing was written.%',
      format('%s.%s', v_schema, v_table),
      E'\n  - ' || array_to_string(v_refuse, E'\n  - ')
      using errcode = 'check_violation',
            hint = (select otherwise from platform.provision_rule_message where rule_id = 'certify.refused');
  end if;

  -- ---- THE CLOSED-SCHEMA PROOF, FROM THE CATALOGUE ----------------------
  -- Same shape and same reason as the door proof and the write-door proof above: a rule the
  -- generator followed is worth nothing unless the catalogue agrees with it at the end of the
  -- transaction. For a schema declared CLOSED this asserts the whole of §6.3's fact two —
  -- schema USAGE, every relation and column ACL, every default-privilege row and every
  -- function's EXECUTE reachability, for PUBLIC, anon, authenticated and service_role — so a
  -- future grant added anywhere in this function, or by a trigger it fires, or standing in the
  -- schema from before, refuses the provision instead of quietly reopening the store.
  if not v_client_exposed then
    select string_agg(format('%s %s: %s', v.kind, v.object_name, v.detail), E'\n  - ' order by v.kind, v.object_name)
      into v_exposure_viol
      from platform.schema_exposure_violations(v_schema) v;
    if v_exposure_viol is not null then
      raise exception
        'provision: schema % is declared CLOSED to client roles in platform.schema_client_exposure, and it is NOT closed after this transaction. Nothing was written.%',
        v_schema, E'\n  - ' || v_exposure_viol
        using errcode = 'check_violation',
              hint = format('Close the schema and re-run: revoke all on schema %I from public, anon, authenticated, service_role; revoke all on all tables in schema %I from public, anon, authenticated, service_role; revoke all on all functions in schema %I from public, anon, authenticated, service_role; alter default privileges in schema %I revoke all on tables from public, anon, authenticated, service_role; (same for functions and sequences). To open it instead, set platform.schema_client_exposure.client_exposed = true for %L with a reason.',
                           v_schema, v_schema, v_schema, v_schema, v_schema);
    end if;
  end if;

  -- ---- capture, inside THIS transaction (PLAN §3.3) ---------------------
  -- WHO ACTUALLY ASKED. Lane B arrives as `SET LOCAL ROLE matrx_provisioner` and
  -- then this SECURITY DEFINER, so current_user and session_user BOTH say `postgres`
  -- and neither can tell the lanes apart. The GUC `role` and the verified JWT survive
  -- the DEFINER switch; p_lane is the lane the caller entered through.
  v_actor := auth.uid();
  v_role  := nullif(current_setting('role', true), 'none');

  insert into platform.provision_spec(
    token, spec, spec_hash, type, origin, owner_org_id, verb, result,
    applied_by, applied_via, artifacts_status,
    applied_lane, applied_actor, applied_role, batch_id)
  values (v_token, n, v_hash, n->>'type', n->>'origin', p_org_id,
          case when p_lane = 'restricted' then 'provision_restricted' else 'provision' end,
          jsonb_build_object('created', coalesce(to_jsonb(v_created), '[]'::jsonb),
                             'certify', coalesce(to_jsonb(v_certify), '[]'::jsonb)),
          coalesce(v_actor::text, v_role, session_user), p_applied_via, 'pending',
          case when p_lane = 'restricted' then 'restricted' else 'full' end,
          v_actor, coalesce(v_role, session_user),
          nullif(platform.provision_batch_context()->>'batch_id', '')::uuid);

  -- ---- the base-contract debt, written INSIDE this transaction ----------
  -- If this insert does not happen the deferral never happened either: the register and
  -- the CREATE TABLE commit together or not at all, so there is no state in which a table
  -- exists with bare base columns and nothing saying so.
  if v_defer_base then
    insert into platform.provision_base_contract_pending (relation, token, detail)
    values (v_rel, v_token,
            jsonb_build_object('schema', v_schema, 'table', v_table, 'lane', p_lane,
                               'applied_via', p_applied_via))
    on conflict (relation) do update set
      token = excluded.token, deferred_at = now(),
      attached_at = null, validated_at = null, detail = excluded.detail;
    v_created := v_created || jsonb_build_object('base_contract_deferred',
      format('%s: organization_id -> iam.organizations, created_by / updated_by -> auth.users are added by platform.provision_attach_base_contract in their own short transaction', v_rel));
  end if;

  perform set_config('matrx.provisioner', '0', true);
  perform platform.provision_marker_set(false);

  return platform._provision_says_the_kernel_was_rerecorded(jsonb_build_object(
    'ok', true, 'unchanged', false, 'token', v_token, 'spec_hash', v_hash,
    'plan', v_res->'plan',
    'created', coalesce(to_jsonb(v_created), '[]'::jsonb),
    'certify', coalesce(to_jsonb(v_certify), '[]'::jsonb),
    -- NULL, not false, while the base contract is pending: this table has not been
    -- certified YET, and `false` would read as "this table is wrong". The remedy below is
    -- the two statements that make it true.
    'canonical_certify_ok', case when v_defer_base then null
                                 else iam.canonical_certify_ok(v_schema, v_table, v_token) end,
    'base_contract', case when v_defer_base then jsonb_build_object(
        'status', 'pending_attach',
        'relation', v_rel,
        'why', 'The base-contract foreign keys point at auth.users and iam.organizations. Creating them inside this transaction would have held SHARE ROW EXCLUSIVE on both for the length of the build (2026-09-21: 298s, 22 sessions queued, sign-in included).',
        'remedy', format('begin; select platform.provision_attach_base_contract(%L); commit;  begin; select platform.provision_validate_base_contract(%L); commit;', v_rel, v_rel))
      else jsonb_build_object('status', 'inline') end,
    'artifacts_status', 'pending',
    'note', 'The repo projection, ORM models and frontend types are produced by db/provision_pull.py in the deploy train (PLAN §3.3), within one cycle. `pending` is by design for that window.'));
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. platform.provision_batch — each member carries its base_contract debt, and its second
--    certification is the same judgement, deferred exactly when the member's build deferred.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.provision_batch(p_spec jsonb, p_applied_via text DEFAULT 'supabase_mcp'::text, p_org_id uuid DEFAULT NULL::uuid, p_lane text DEFAULT 'full'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_pre      jsonb;
  v_heal     jsonb;   -- PROVISIONER-SELF-HEAL
  v_res      jsonb;
  v_ctx      jsonb;
  v_batch_id uuid := gen_random_uuid();
  v_order    text[];
  v_key      text;
  v_tbl      jsonb;
  v_r        jsonb;
  v_item     jsonb;
  v_def      jsonb;
  v_schema   text;
  v_results  jsonb[] := '{}'::jsonb[];
  v_created  jsonb[] := '{}'::jsonb[];
  v_refuse   text[]  := '{}'::text[];
  v_unchanged boolean := true;
  v_unch     text[]  := '{}'::text[];
  v_i        integer;
  r          record;
  v_judged   jsonb;     -- PROVISION-BATCH-FIX: platform.provision_certify_judged
  v_deferred boolean;
begin
  if platform.provision_batch_context() ? 'batch_id' then
    raise exception 'provision: a batch is already being built in this transaction (%). A batch never nests.',
      platform.provision_batch_context()->>'batch_id'
      using errcode = 'check_violation';
  end if;

  -- ---- preflight (the same refusal platform.provision makes, made once for the batch) ----
  v_pre := platform.provision_preflight();
  if not (v_pre->>'ok')::boolean then
    -- A STALE KERNEL FINGERPRINT IS REFUSED WITH A LOGGED ROW (lane KERNEL-TAILS, 2026-09-25).
    -- A raise here rolls back everything the caller's transaction did, so a refusal left no
    -- trace: SHARE-LANE-2's file refused every spec for 26 minutes and rca2b's for 57, and
    -- nobody saw either until a lane ran check:store-doors-decide. Nothing has been written yet
    -- at this point (the run claim is an advisory lock), so this branch writes ONE
    -- ops.system_error row (kind provisioner_fingerprint_stale, naming the moved body and the
    -- remedy), warns, and RETURNS the refusal — ok false, refused true — instead of raising.
    --
    -- 🚨 AND A STALE FINGERPRINT HEALS ITSELF WHEN THE KERNEL STILL ANSWERS THE SAME (lane
    -- PROVISIONER-SELF-HEAL, 2026-09-25, chair's ruling). The fingerprint exists so no table is
    -- provisioned against an UNKNOWN kernel; it was never meant to stop table creation because a
    -- file forgot a bookkeeping line (83 minutes on production on 2026-09-25, twice, once from
    -- outside the program). When stale-kernel is the ONLY finding, the kernel's own equivalence
    -- self-check runs here, in this call, on its fixed fixture (platform.kernel_equivalence_check,
    -- about a second): identical -> the fingerprint is re-recorded with a
    -- platform.kernel_fingerprint_record row and ONE ops.system_error row of kind
    -- kernel_fingerprint_auto_rerecorded, and provisioning continues; not identical -> the logged
    -- refusal below, with the evidence in the row.
    if exists (select 1 from jsonb_array_elements(v_pre->'findings') x
                where x->>'rule_id' = 'preflight.read_kernel') then
      if jsonb_array_length(v_pre->'findings') = 1 then
        v_heal := platform._provisioner_heals_a_stale_kernel(p_spec, v_pre, p_applied_via, p_org_id, p_lane);
        if coalesce((v_heal->>'healed')::boolean, false) then
          v_pre := platform.provision_preflight();
        else
          v_pre := v_pre || jsonb_build_object('equivalence', v_heal->'equivalence');
        end if;
      end if;
      if exists (select 1 from jsonb_array_elements(v_pre->'findings') x
                  where x->>'rule_id' = 'preflight.read_kernel') then
        return platform._provisioner_refuses_a_stale_kernel(p_spec, v_pre, p_applied_via, p_org_id, p_lane);
      end if;
    end if;
    if not (v_pre->>'ok')::boolean then
    raise exception 'provision: PREFLIGHT REFUSED (% problem(s)). Nothing was written.%',
      jsonb_array_length(v_pre->'findings'),
      (select string_agg(E'\n\n' || (x->>'message'), '') from jsonb_array_elements(v_pre->'findings') x)
      using errcode = 'check_violation',
            hint = 'The enforcement chain this path rests on is not intact. Fix the named condition and call platform.provision again; nothing was written, so there is nothing to undo.';
    end if;
  end if;

  -- ---- validate the whole batch, inside THIS transaction ---------------------------
  v_res := platform.provision_validate(p_spec, p_lane, p_org_id);

  -- A member whose token ALREADY carries this exact declaration (same normalized hash,
  -- relation still standing) is `unchanged`, exactly as platform.provision answers for one
  -- table — and for such a member the validator's "already exists" findings are the
  -- expected state, not a refusal. Every other finding refuses the whole batch.
  v_unch := array(
    select t.value->>'token'
      from jsonb_array_elements(v_res->'normalized_spec'->'tables') t
     where t.value->>'token' is not null
       and exists (select 1 from platform.v_provision_spec_current c
                    where c.token = t.value->>'token'
                      and c.spec_hash = md5(t.value::text)
                      and to_regclass(format('%I.%I', c.spec->>'schema', c.spec->>'table')) is not null));
  if exists (select 1 from jsonb_array_elements(coalesce(v_res->'findings', '[]'::jsonb)) x
              where not ((x->>'table') = any (v_unch)
                         and x->>'rule_id' in ('identity.token.taken', 'views.projection.token.taken', 'types.name.taken'))) then
    raise exception 'provision: % finding(s) across % table(s); call platform.provision_validate(<spec>) for the list. Nothing was written.',
      jsonb_array_length(v_res->'findings'), jsonb_array_length(p_spec->'tables')
      using errcode = 'check_violation',
            hint = format('The rules that refused: %s',
                     (select string_agg(distinct x->>'rule_id', ', ') from jsonb_array_elements(v_res->'findings') x));
  end if;
  v_ctx   := (v_res->'normalized_spec'->'batch_context') || jsonb_build_object('batch_id', v_batch_id);
  v_order := array(select jsonb_array_elements_text(v_res->'normalized_spec'->'batch_order'));

  perform set_config('matrx.provision_batch', v_ctx::text, true);
  perform set_config('matrx.provision_batch_deferred', '{"fks": [], "edges": []}', true);

  -- ---- every member's types, first, so a member may use a type another declares ------
  -- The marker is raised only around the DDL THIS function emits: every member call raises
  -- and lowers its own, and platform.provision_preflight refuses to start under a raised one
  -- (two provisioning runs must never interleave their DDL).
  perform set_config('matrx.provisioner', '1', true);
  perform platform.provision_marker_set(true);
  for v_tbl in select value from jsonb_array_elements(p_spec->'tables') loop
    v_schema := v_tbl->>'schema';
    for v_item in select value from jsonb_array_elements(coalesce(v_tbl->'types', '[]'::jsonb)) loop
      if to_regtype(format('%I.%I', v_schema, v_item->>'name')) is null then
        execute format('create type %I.%I as enum (%s)', v_schema, v_item->>'name',
                 (select string_agg(quote_literal(l), ', ') from jsonb_array_elements_text(v_item->'labels') l));
        v_created := v_created || jsonb_build_object('type', format('%s.%s', v_schema, v_item->>'name'));
      end if;
    end loop;
  end loop;

  perform set_config('matrx.provisioner', '0', true);
  perform platform.provision_marker_set(false);

  -- ---- every member, in dependency order, through the ONE builder --------------------
  foreach v_key in array v_order loop
    select t.value into v_tbl
      from jsonb_array_elements(p_spec->'tables') with ordinality t(value, ord)
     where coalesce(t.value->>'token', format('#%s', t.ord - 1)) = v_key;
    v_r := platform.provision(v_tbl, p_applied_via, p_org_id, p_lane);
    v_unchanged := v_unchanged and coalesce((v_r->>'unchanged')::boolean, false);
    v_results := v_results || jsonb_build_object(
      'token', v_key, 'unchanged', coalesce((v_r->>'unchanged')::boolean, false),
      'spec_hash', v_r->>'spec_hash', 'created', v_r->'created', 'certify', v_r->'certify',
      'canonical_certify_ok', v_r->'canonical_certify_ok',
      -- THE MEMBER'S BASE-CONTRACT DEBT TRAVELS WITH IT (PROVISION-BATCH-FIX). The service
      -- settles every member in `tables[]` whose base_contract says pending_attach, each in its
      -- own short follow-up transaction (aidream services/provisioning _settle_base_contract);
      -- a member that did not carry it here could never be settled and never certified.
      'base_contract', v_r->'base_contract');
  end loop;

  -- ---- the constraints and edges that had to wait for every member ------------------
  perform set_config('matrx.provisioner', '1', true);
  perform platform.provision_marker_set(true);
  v_def := coalesce(nullif(current_setting('matrx.provision_batch_deferred', true), '')::jsonb,
                    '{"fks": [], "edges": []}'::jsonb);
  for v_item in select value from jsonb_array_elements(coalesce(v_def->'fks', '[]'::jsonb)) loop
    if to_regclass(v_item->>'target') is null then
      raise exception 'provision: %.% references %, which this batch did not build. Nothing was written.',
        v_item->>'relation', v_item->>'column', v_item->>'target'
        using errcode = 'check_violation';
    end if;
    execute format('alter table %s add constraint %I foreign key (%I) references %s(id) on delete %s',
                   v_item->>'relation', left(format('%s_%s_fkey', v_item->>'table', v_item->>'column'), 63),
                   v_item->>'column', v_item->>'target', v_item->>'on_delete');
    v_created := v_created || jsonb_build_object('foreign_key',
      format('%s.%s -> %s (added after the batch built %s)', v_item->>'relation', v_item->>'column', v_item->>'target', v_item->>'target'));
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(v_def->'edges', '[]'::jsonb)) loop
    insert into platform.association_types(source_type, target_type, label, container_side, conveys_max, notes)
    values (v_item->>'source_type', v_item->>'target_type', v_item->>'label',
            coalesce(v_item->>'container_side','none'),
            coalesce(v_item->>'conveys_max','editor')::public.permission_level, v_item->>'notes')
    on conflict (source_type, target_type) do nothing;
    v_created := v_created || jsonb_build_object('association_type',
      format('%s -> %s', v_item->>'source_type', v_item->>'target_type'));
  end loop;

  -- ---- certification, AGAIN, after the constraints each member was waiting for -------
  -- THE SAME JUDGEMENT platform.provision MAKES (lane PROVISION-BATCH-FIX, 2026-09-26). This
  -- loop used to carry its own copy of the certify rules without the deferred base-contract
  -- rule, so with the base contract deferred (the default since 2026-09-21) every batch refused
  -- here with base_org_fk / base_created_by_fk / base_updated_by_fk: those three foreign keys are
  -- added by platform.provision_attach_base_contract in its OWN transaction after this one
  -- commits, so here they are owed, not failed. A member is judged deferred from what its own
  -- build actually did (its base_contract status), never from a second reading of the knob.
  for v_i in 1 .. cardinality(v_results) loop
    if (v_results[v_i]->>'unchanged')::boolean then continue; end if;
    v_key := v_results[v_i]->>'token';
    v_deferred := coalesce(v_results[v_i]->'base_contract'->>'status', '') = 'pending_attach';
    v_judged := platform.provision_certify_judged(
      v_ctx->'tokens'->v_key->>'schema', v_ctx->'tokens'->v_key->>'table', v_key, v_deferred);
    v_refuse := v_refuse || array(select format('%s %s', v_key, x)
                                    from jsonb_array_elements_text(v_judged->'refuse') x);
    v_results[v_i] := v_results[v_i] || jsonb_build_object(
      'certify', v_judged->'certify',
      -- NULL while the base contract is pending, exactly as platform.provision answers: not
      -- certified YET, and `false` would read as "this table is wrong".
      'canonical_certify_ok', case when v_deferred then null
        else to_jsonb(iam.canonical_certify_ok(v_ctx->'tokens'->v_key->>'schema', v_ctx->'tokens'->v_key->>'table', v_key)) end);
  end loop;
  if cardinality(v_refuse) > 0 then
    raise exception 'provision: the batch refused certification after its deferred constraints. Nothing was written.%',
      E'\n  - ' || array_to_string(v_refuse, E'\n  - ')
      using errcode = 'check_violation',
            hint = (select otherwise from platform.provision_rule_message where rule_id = 'certify.refused');
  end if;

  perform set_config('matrx.provision_batch', '', true);
  perform set_config('matrx.provision_batch_deferred', '', true);
  perform set_config('matrx.provisioner', '0', true);
  perform platform.provision_marker_set(false);

  return platform._provision_says_the_kernel_was_rerecorded(jsonb_build_object(
    'ok', true, 'batch', true, 'batch_id', v_batch_id, 'unchanged', v_unchanged,
    'spec_hash', v_res->>'spec_hash',
    'order', to_jsonb(v_order),
    'tables', coalesce(to_jsonb(v_results), '[]'::jsonb),
    'created', coalesce(to_jsonb(v_created), '[]'::jsonb),
    'plan', v_res->'plan',
    'artifacts_status', 'pending',
    'note', 'Every member''s capture row carries this batch_id. The repo projection, ORM models and frontend types are produced by db/provision_pull.py in the deploy train (PLAN §3.3), within one cycle. `pending` is by design for that window.'));
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3b. platform.kernel_equivalence_answers — the fixture is built by nobody, whoever calls.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.kernel_equivalence_answers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_version constant text := 'v1';
  c_org     constant uuid := 'f1ce0000-0000-4000-8000-0000000000d1';
  c_home    constant uuid := 'f1ce0000-0000-4000-8000-0000000000f0';
  c_people  constant text[] := array['author', 'org_owner', 'member', 'grantee', 'stranger'];
  c_names   constant text[] := array['Marisol Vega', 'Owen Pruitt', 'Keiko Tran', 'Rafael Duarte', 'Lena Holt'];
  c_ids     constant uuid[] := array['f1ce0000-0000-4000-8000-0000000000a1', 'f1ce0000-0000-4000-8000-0000000000a2',
                                     'f1ce0000-0000-4000-8000-0000000000a3', 'f1ce0000-0000-4000-8000-0000000000a4',
                                     'f1ce0000-0000-4000-8000-0000000000a5']::uuid[];
  c_levels  constant public.permission_level[] := array['viewer', 'commenter', 'editor', 'admin']::public.permission_level[];
  v_t0      timestamptz := clock_timestamp();
  v_ans     jsonb := '{}'::jsonb;
  v_things  jsonb := '[]'::jsonb;
  v_err     text;
  v_qual    text;
  v_b       boolean;
  v_set     uuid[];
  v_tbl     uuid;
  v_fields  jsonb := jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text'));
  i         integer;
  t         jsonb;
  lvl       public.permission_level;
begin
  -- Two callers never build the world at once (fixed ids); held to the caller's commit.
  perform pg_advisory_xact_lock(hashtext('platform.kernel_equivalence_fixture'));
  begin
    perform set_config('app.actor_system', 'kernel_equivalence_fixture', true);
    -- THE WORLD IS BUILT BY NOBODY (lane PROVISION-BATCH-FIX, 2026-09-26). The fixture used to
    -- inherit the CALLER's signed-in identity, so a provision run by a person (request.jwt.claims
    -- sub set, e.g. admin@admin.com) could never heal: inserting the fixture's people fired the
    -- personal-organization guard ("42501: cannot create another user's personal organization")
    -- and the heal refused an equivalent kernel. Cleared here, inside the subtransaction, so the
    -- rollback below gives the caller its identity back untouched.
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    for i in 1 .. 5 loop
      insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
      values (c_ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              lower(replace(c_names[i], ' ', '.')) || '.kernel-fixture@aimatrx.com',
              jsonb_build_object('display_name', c_names[i]), now(), now());
    end loop;
    insert into iam.organizations (id, name, slug, abbreviation, created_by)
    values (c_org, 'Harbor Point Dental Studio', 'harbor-point-dental-kernel-fixture', 'HPD', c_ids[2]);
    insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
      (c_org, 'organization', c_org, c_ids[2], 'owner',  'active'),
      (c_org, 'organization', c_org, c_ids[1], 'member', 'active'),
      (c_org, 'organization', c_org, c_ids[3], 'member', 'active');

    insert into code.code_repositories (id, organization_id, name, created_by, visibility) values
      ('f1ce0000-0000-4000-8000-0000000000b1', c_org, 'patient-reminder-scripts', c_ids[1], 'internal'),
      ('f1ce0000-0000-4000-8000-0000000000b2', c_org, 'marisol-scratch-notes',    c_ids[1], 'personal'),
      ('f1ce0000-0000-4000-8000-0000000000b3', c_org, 'public-booking-widget',    c_ids[1], 'public'),
      ('f1ce0000-0000-4000-8000-0000000000b4', c_org, 'insurance-claim-exports',  c_ids[1], 'personal'),
      ('f1ce0000-0000-4000-8000-0000000000b5', c_org, 'front-desk-templates',     c_ids[1], 'internal');
    insert into interview.session (id, organization_id, created_by, visibility) values
      ('f1ce0000-0000-4000-8000-0000000000c1', c_org, c_ids[1], 'internal'),
      ('f1ce0000-0000-4000-8000-0000000000c2', c_org, c_ids[1], 'personal'),
      ('f1ce0000-0000-4000-8000-0000000000c3', c_org, c_ids[1], 'personal');
    insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by) values
      ('code_repository',   'f1ce0000-0000-4000-8000-0000000000b4', c_ids[4], 'viewer',    c_ids[1]),
      ('code_repository',   'f1ce0000-0000-4000-8000-0000000000b5', c_ids[4], 'editor',    c_ids[1]),
      ('interview_session', 'f1ce0000-0000-4000-8000-0000000000c3', c_ids[3], 'commenter', c_ids[1]);
    insert into platform.comments (id, organization_id, entity_type, entity_id, body, created_by) values
      ('f1ce0000-0000-4000-8000-0000000000e1', c_org, 'code_repository', 'f1ce0000-0000-4000-8000-0000000000b1',
       'Can we move the reminder send to 9am?', c_ids[3]),
      ('f1ce0000-0000-4000-8000-0000000000e2', c_org, 'code_repository', 'f1ce0000-0000-4000-8000-0000000000b4',
       'Claim export for Q3 looks right.', c_ids[4]);

    -- The record store: a home, an open Table and a "mine" Table (its record personal, its rows
    -- internal — the shape SHARE-LANE-2 walled the organization roles out of).
    insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
    values (c_home, c_org, '11111111-0000-4000-8000-000000000004', 'record', '{"name": "Front desk"}', c_ids[2]);
    v_tbl := custom.table_declare(c_org, jsonb_build_object(
      'name', 'Patient recall list', 'slug', 'kf_recall', 'label_singular', 'Patient', 'label_plural', 'Patients',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
      'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true, 'fields', v_fields,
      'title_field', 'title', 'parent_id', c_home::text));
    update custom.record set created_by = c_ids[1] where organization_id = c_org and id = v_tbl;
    insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
    values ('f1ce0000-0000-4000-8000-0000000000f1', c_org, v_tbl, 'record',
            '{"title": "Recall: Jonah Ellis, 6-month cleaning"}', c_ids[1]);
    v_tbl := custom.table_declare(c_org, jsonb_build_object(
      'name', 'My chairside notes', 'slug', 'kf_notes', 'label_singular', 'Note', 'label_plural', 'Notes',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
      'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true, 'fields', v_fields,
      'title_field', 'title', 'parent_id', c_home::text));
    update custom.record set created_by = c_ids[1], visibility = 'personal' where organization_id = c_org and id = v_tbl;
    insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
    values ('f1ce0000-0000-4000-8000-0000000000f2', c_org, v_tbl, 'record',
            '{"title": "Crown prep went long, book 90 min next time"}', c_ids[1]);

    v_things := '[
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_internal","id":"f1ce0000-0000-4000-8000-0000000000b1","sets":true},
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_personal","id":"f1ce0000-0000-4000-8000-0000000000b2","sets":true},
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_public","id":"f1ce0000-0000-4000-8000-0000000000b3","sets":true},
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_personal_shared_viewer","id":"f1ce0000-0000-4000-8000-0000000000b4","sets":true},
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_internal_shared_editor","id":"f1ce0000-0000-4000-8000-0000000000b5","sets":true},
      {"token":"interview_session","schema":"interview","table":"session","thing":"session_internal","id":"f1ce0000-0000-4000-8000-0000000000c1","sets":true},
      {"token":"interview_session","schema":"interview","table":"session","thing":"session_personal","id":"f1ce0000-0000-4000-8000-0000000000c2","sets":true},
      {"token":"interview_session","schema":"interview","table":"session","thing":"session_personal_shared_commenter","id":"f1ce0000-0000-4000-8000-0000000000c3","sets":true},
      {"token":"comment","schema":"platform","table":"comments","thing":"comment_on_internal_repo","id":"f1ce0000-0000-4000-8000-0000000000e1","sets":false},
      {"token":"comment","schema":"platform","table":"comments","thing":"comment_on_shared_personal_repo","id":"f1ce0000-0000-4000-8000-0000000000e2","sets":false},
      {"token":"record","schema":"custom","table":"record","thing":"row_of_an_open_table","id":"f1ce0000-0000-4000-8000-0000000000f1","sets":false},
      {"token":"record","schema":"custom","table":"record","thing":"row_of_a_mine_table","id":"f1ce0000-0000-4000-8000-0000000000f2","sets":false}
    ]'::jsonb;

    for t in select x from jsonb_array_elements(v_things) x loop
      select p.qual into v_qual from pg_policies p
       where p.schemaname = t->>'schema' and p.tablename = t->>'table' and p.policyname = 'std_select';
      for i in 1 .. 5 loop
        perform set_config('request.jwt.claims',
          json_build_object('sub', c_ids[i], 'role', 'authenticated')::text, true);
        foreach lvl in array c_levels loop
          v_ans := v_ans || jsonb_build_object(
            format('k:%s:%s:%s:%s', t->>'token', t->>'thing', c_people[i], lvl),
            iam.has_access_for(c_ids[i], t->>'token', (t->>'id')::uuid, lvl));
        end loop;
        if v_qual is null then
          v_b := null;
        else
          execute format('select exists (select 1 from %I.%I where id = $1 and (%s))', t->>'schema', t->>'table', v_qual)
            into v_b using (t->>'id')::uuid;
        end if;
        v_ans := v_ans || jsonb_build_object(format('p:%s:%s:%s', t->>'token', t->>'thing', c_people[i]), v_b);
        if (t->>'sets')::boolean then
          v_set := iam.accessible_entity_ids(t->>'token', 'viewer'::public.permission_level, 0, true);
          v_ans := v_ans || jsonb_build_object(format('s:%s:%s:%s', t->>'token', t->>'thing', c_people[i]),
                                               (t->>'id')::uuid = any (coalesce(v_set, '{}'::uuid[])));
        end if;
      end loop;
    end loop;

    -- Everything above is undone here, every time: the world never outlives the question.
    raise exception using errcode = 'KF000', message = 'kernel equivalence fixture rolled back';
  exception
    when sqlstate 'KF000' then null;
    when others then
      v_err := sqlstate || ': ' || sqlerrm;
  end;
  return jsonb_build_object('version', c_version, 'answers', v_ans, 'error', v_err,
                            'ms', round((extract(epoch from clock_timestamp() - v_t0) * 1000)::numeric, 1));
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. THE GUARDS: neither path carries a certify loop of its own; both ask the one judgement; no
--    kernel body or fingerprint moved in this transaction.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
do $post$
declare f text;
begin
  foreach f in array array['platform.provision(jsonb,text,uuid,text)', 'platform.provision_batch(jsonb,text,uuid,text)'] loop
    if (select prosrc from pg_catalog.pg_proc where oid = f::regprocedure) ~ 'from\s+iam\.canonical_certify\s*\(' then
      raise exception 'provbatch: % still carries its own iam.canonical_certify loop', f;
    end if;
    if (select prosrc from pg_catalog.pg_proc where oid = f::regprocedure) !~ 'platform\.provision_certify_judged\(' then
      raise exception 'provbatch: % does not ask platform.provision_certify_judged', f;
    end if;
  end loop;
  if iam.entity_read_kernel_fingerprint() is distinct from current_setting('provbatch.kernel_fp_before', true)
     or iam.entity_read_kernel_expected() is distinct from current_setting('provbatch.kernel_expected_before', true) then
    raise exception 'provbatch: the access-kernel fingerprint moved inside this file; it must not';
  end if;
end $post$;
