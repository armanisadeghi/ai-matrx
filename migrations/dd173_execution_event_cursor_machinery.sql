-- dd173_execution_event_cursor_machinery — DD-173, the second of the two hot tables.
--
-- `runtime.execution_event_cursor` is TWO COLUMNS: `root_execution_id uuid` (the primary key, and
-- a FK to `runtime.global_execution` ON DELETE CASCADE) and `last_seq bigint default 0`. No id, no
-- timestamp, no organization, no metadata. DD-159 batch 3 registered it `rls_variant = ledger`,
-- `data_class = confidential` because it carried a client grant and no registry row at all, and
-- `iam.apply_rls` has refused it ever since for a missing base contract. B-65 §5e recommended
-- `machinery`; this file establishes that from the READERS and the WRITERS, not from the
-- recommendation.
--
-- 🚨 WHO ACTUALLY TOUCHES IT (censused 2026-09-14 across aidream, matrx-frontend, matrx-sandbox,
--    matrx-local and matrx-extend, and across every function body in this database):
--      WRITER — exactly one, and it is a trigger: `runtime.exec_event_assign_seq()`, the BEFORE
--        INSERT trigger on `runtime.global_execution_event`. It resolves the event's root
--        execution and does
--            insert into runtime.execution_event_cursor as c (root_execution_id, last_seq)
--            values (new.root_execution_id, 1)
--            on conflict (root_execution_id) do update set last_seq = c.last_seq + 1
--            returning last_seq into new.seq;
--        That is the whole purpose of the table: it is the runtime's per-execution-tree SEQUENCE
--        ALLOCATOR, held in a row so the allocation is atomic under the row lock.
--      READER — nobody. No client read in any of the five repos. In Python it appears only as the
--        generated model and as a COMMENT in `matrx-runtime/store.py` describing what the
--        in-memory store stands in for ("the in-memory stand-in for the DB's
--        runtime.execution_event_cursor row + BEFORE INSERT trigger"). No function in this
--        database reads it except that trigger.
--
-- 🚨 WHY THE BASE CONTRACT IS INAPPLICABLE HERE BY DESIGN — MEASURED, NOT ARGUED. The §6d-3
--    contract for its registered variant wants `id uuid`, `organization_id NOT NULL` + FK,
--    `created_at`, `metadata`. Three of those are false statements about this row and the fourth
--    STOPS THE PLATFORM:
--      * `id` — the row has no identity of its own; it IS its parent execution. Nothing addresses
--        it and nothing can share it.
--      * `created_at` — a ledger's append instant. This row is not appended, it is UPDATED on
--        every single event; its `last_seq` is a current value, not a record of a moment.
--      * `organization_id NOT NULL` — proven live in a rolled-back transaction on 2026-09-14, and
--        reproduced as this file's own forcing limb below: with the column added and set NOT NULL,
--        the very next execution event insert dies `23502 null value in column "organization_id"
--        of relation "execution_event_cursor" violates not-null constraint`, because the trigger
--        that writes the cursor names no organization — and NO NULL ORG (owner ruling 2026-08-21)
--        forbids a default, a resolver and a trigger choosing one, which `platform._ddl_guard`
--        hard-aborts by name. Every running execution on the platform stops writing events.
--    That is exactly what db-rules §11 means by machinery: "the gate is circular or inapplicable
--    by design — never merely hard to fix".
--
-- 🚨 WHAT MACHINERY CHANGES, AND WHAT IT DOES NOT. `iam.apply_rls` refuses a machinery token BY
--    CONSTRUCTION ("machinery owns inputs consumed by the access resolver"), so this table can
--    never be silently regenerated into a class lane. `iam.verify_canonical` (DD-200) measures it
--    against the machinery contract — a stored reason, no generated class policy, no ungated
--    client lane, RLS on — and SKIPS the per-variant base contract with a named reason. It does
--    NOT loosen a single door: the two live policies stay exactly as they are, RLS stays on, and
--    `authenticated` keeps only what a `platform_admin_only` / `platform_admin_all` policy lets it
--    read, which for a non-admin is nothing. There is no `machinery` rls_variant to move to — the
--    variant CHECK does not define one (DD-200's correction) — so `rls_variant` stays `ledger`,
--    which is what it would be generated as if it ever stopped being machinery.
--
-- 🚨 ITS SIBLING IS NOT IN THIS FILE. `runtime.global_execution_control` (registered `component`)
--    is named in the same DD-173 line as needing the same call. It is NOT touched here: this file
--    changes one token on one table's evidence, and nobody censused that one's readers. Reported
--    to the chair instead of guessed at.

do $dd173eec$
declare
  v_variant text; v_audit text; v_cols int;
  v_exec uuid; v_org uuid; v_seq bigint;
  v_msg text; v_state text;
  v_fail text[] := '{}';
  v_pass text[] := '{}';
  r record;
begin
  -- ═══════ 1. THE TABLE AND THE REGISTRY MUST BE WHAT THIS FILE WAS WRITTEN AGAINST ═══════════
  select et.rls_variant, et.audit_class::text into v_variant, v_audit
    from platform.entity_types et
   where et.token = 'execution_event_cursor' and et.is_active
     and et.schema_name = 'runtime' and et.table_name = 'execution_event_cursor';
  if v_variant is null then
    raise exception 'dd173-eec: execution_event_cursor is not an active registered entity at runtime.execution_event_cursor. Nothing was changed.';
  end if;
  if v_audit = 'machinery' then
    raise notice 'dd173-eec: already machinery — this file is idempotent from here on';
  elsif v_audit <> 'entity' then
    raise exception 'dd173-eec: audit_class is %, which this file was not written against.', v_audit;
  end if;
  select count(*) into v_cols from information_schema.columns
   where table_schema='runtime' and table_name='execution_event_cursor';
  if v_cols <> 2 then
    raise exception 'dd173-eec: runtime.execution_event_cursor has % columns, not the two (root_execution_id, last_seq) this file''s whole argument rests on. Re-census before re-running it.', v_cols;
  end if;
  if not exists (select 1 from pg_trigger tg join pg_proc pr on pr.oid = tg.tgfoid
                  where tg.tgrelid = 'runtime.global_execution_event'::regclass
                    and pr.proname = 'exec_event_assign_seq' and not tg.tgisinternal) then
    raise exception 'dd173-eec: the allocator trigger exec_event_assign_seq is not on runtime.global_execution_event. The writer this file describes does not exist; nothing was changed.';
  end if;

  -- ═══════ 2. THE FORCING LIMB — THE BREAK, REPRODUCED AND UNDONE IN ONE SUBTRANSACTION ═══════
  -- A claim that "the entity contract would stop the runtime" is worth nothing unless it is run.
  -- Everything this block does — the probe event, the ALTERs — is rolled back by the block's own
  -- EXCEPTION handler; only the verdict survives.
  select ge.id, ge.organization_id into v_exec, v_org
    from runtime.global_execution ge
    join runtime.execution_event_cursor c on c.root_execution_id = ge.id
   order by ge.created_at desc limit 1;
  if v_exec is null then
    raise exception 'dd173-eec: no live execution with a cursor row to probe. The forcing limb cannot run, so this file does not proceed on an unproven claim.';
  end if;
  begin
    -- CONTROL: the real path, today
    insert into runtime.global_execution_event (id, execution_id, kind, detail, organization_id)
    values (gen_random_uuid(), v_exec, 'dd173.cursor.control', '{}'::jsonb, v_org)
    returning seq into v_seq;
    if v_seq is null then
      raise exception 'dd173-eec: CONTROL — the allocator did not stamp a seq. The writer is not what this file describes.';
    end if;
    -- RED: the organization column the base contract demands
    alter table runtime.execution_event_cursor add column organization_id uuid;
    update runtime.execution_event_cursor set organization_id = v_org;
    alter table runtime.execution_event_cursor alter column organization_id set not null;
    insert into runtime.global_execution_event (id, execution_id, kind, detail, organization_id)
    values (gen_random_uuid(), v_exec, 'dd173.cursor.red', '{}'::jsonb, v_org);
    -- Reaching here means the break did NOT happen and this file's argument is wrong.
    raise exception 'dd173-eec: THE FORCING LIMB DID NOT FIRE — an execution event inserted cleanly with organization_id NOT NULL on the cursor. The premise of this file is false and nothing should be reclassified on it.';
  exception when others then
    get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
    if v_msg like 'dd173-eec:%' then raise; end if;
    if v_state <> '23502' then
      raise exception 'dd173-eec: the forcing limb failed with % (%) instead of the expected 23502 not-null violation. An unexplained failure is not a proof.', v_state, v_msg;
    end if;
    raise notice 'dd173-eec: FORCING LIMB — control allocated seq %, then with organization_id NOT NULL on the cursor the next execution event died: % (%). Rolled back.', v_seq, v_state, v_msg;
  end;

  -- ═══════ 3. THE CLASSIFICATION, WITH ITS REASON ON THE ROW ══════════════════════════════════
  update platform.entity_types
     set audit_class = 'machinery',
         audit_class_reason =
           'DD-173 (2026-09-14): runtime.execution_event_cursor is the runtime''s per-execution-tree SEQUENCE ALLOCATOR, not a record anybody keeps. Two columns: root_execution_id (PK, FK to runtime.global_execution) and last_seq. Its only writer is the BEFORE INSERT trigger runtime.exec_event_assign_seq() on runtime.global_execution_event, which upserts the row to allocate the next seq under its row lock; it has no reader at all — no client read exists in aidream, matrx-frontend, matrx-sandbox, matrx-local or matrx-extend, and no other function in this database reads it. The per-variant base contract is inapplicable by design, not merely hard to apply: the row has no identity of its own (it IS its parent execution), it is updated on every event rather than appended so a created_at would be a false statement, and organization_id NOT NULL STOPS THE PLATFORM — proven live and re-proven as this migration''s own forcing limb: the next execution event insert dies 23502 because the allocator trigger names no organization, and NO NULL ORG forbids a default, a resolver or a trigger choosing one. rls_variant stays ledger (there is no machinery variant) and is what it would be generated as if it ever stopped being machinery. Registered machinery under the DD-173 chair''s brief, on this evidence, per db-rules §11.'
   where token = 'execution_event_cursor';

  -- ═══════ 4. THE MACHINERY CONTRACT, MEASURED — 0 FAIL OR THIS FILE DOES NOT STAND ═══════════
  for r in select * from iam.verify_canonical('runtime','execution_event_cursor','execution_event_cursor') loop
    if r.status = 'FAIL' then
      v_fail := array_append(v_fail, format('%s: %s', r.check_name, coalesce(r.detail,'')));
    elsif r.status = 'PASS' then
      v_pass := array_append(v_pass, r.check_name);
    end if;
    raise notice 'dd173-eec: % = % (%)', r.check_name, r.status, left(coalesce(r.detail,''), 160);
  end loop;
  if cardinality(v_fail) > 0 then
    raise exception 'dd173-eec: % certification FAIL(s) after the reclassification: %. A classification that does not certify is not a classification.',
      cardinality(v_fail), array_to_string(v_fail, ' ; ');
  end if;
  foreach v_msg in array array['machinery_has_reason','machinery_no_generated_policy','machinery_no_client_grant','machinery_rls_on'] loop
    if not (v_msg = any (v_pass)) then
      raise exception 'dd173-eec: the machinery contract check % did not PASS — the certifier did not route this token to the machinery universe (DD-200). Nothing stands on a skipped check.', v_msg;
    end if;
  end loop;
  raise notice 'dd173-eec: all four machinery contract checks PASS, 0 FAIL, base contract SKIPped by name';

  -- ═══════ 5. AND THE GENERATOR REFUSES IT BY CONSTRUCTION, PROVEN RATHER THAN ASSUMED ════════
  begin
    perform iam.apply_rls('runtime','execution_event_cursor','execution_event_cursor', v_variant);
    raise exception 'dd173-eec: iam.apply_rls GENERATED policies on a machinery token. The refusal this classification relies on does not exist; this file does not stand.';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'dd173-eec:%' then raise; end if;
    if v_msg not like '%machinery%' then
      raise exception 'dd173-eec: iam.apply_rls failed for a reason that is not the machinery refusal: %', v_msg;
    end if;
    raise notice 'dd173-eec: iam.apply_rls refuses it by construction — %', v_msg;
  end;
end $dd173eec$;
