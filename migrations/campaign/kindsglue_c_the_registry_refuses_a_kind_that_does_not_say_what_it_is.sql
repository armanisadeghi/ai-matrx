-- lane KINDS-GLUE wave 1b (2026-10-02) — the database refuses a live kind that does not say what its output is.
--
-- WHY. Wave 1 made every CODE path declare metadata.disposition (aidream @kind, the publisher, kind_create, the
-- provision offer sync, every seed script, the shape studio) and kindsglue_b declared every existing row. This is the
-- backstop for any path nobody has written yet — a hand INSERT, a future script, an MCP write, a migration file: an
-- INSERT, or an UPDATE, that leaves a LIVE (deleted_at is null) content_ir.kind_definition row without a disposition
-- from the closed set (record, envelope, receipt, proposal, prose = matrx_graph.content_ir.sdk.KIND_DISPOSITIONS;
-- the same set content_ir.evaluate_kind_activation's disposition leg reads) is refused with a plain sentence.
-- Soft-deleted rows are exempt (1,048 on the clone were archived undeclared); a restore (trash, version history)
-- is refused with its own sentence until the row declares. A wrong value ("Record") gets its own sentence too.
--
-- WHY A TRIGGER, NOT A CHECK CONSTRAINT. ALTER TABLE ... ADD CONSTRAINT takes ACCESS EXCLUSIVE on the table even with
-- NOT VALID, and every kind-catalog read waits behind that lock — kindsglue_a measured exactly that as a lock timeout
-- on the clone. CREATE TRIGGER takes SHARE ROW EXCLUSIVE: concurrent writes to this small registry wait for the
-- statement, reads never do. The trigger also speaks in a sentence where a constraint names itself.
-- Fires last among the BEFORE triggers that rewrite NEW (zzzz_ sorts after _a0_t13_dual_write, _stamp_actor, _touch_row),
-- before zzzzz_no_change_keeps_its_version.
--
-- PRECONDITION: kindsglue_b applied — every live row declared. Refused otherwise (an update to any undeclared live row
-- would start failing the moment this trigger exists).
-- Locks: SHARE ROW EXCLUSIVE on content_ir.kind_definition for the CREATE TRIGGER statement only (no DROP, no ALTER TABLE).
-- lane: KINDS-GLUE
-- INVERSE: migrations/inverse/kindsglue_c_the_registry_refuses_a_kind_that_does_not_say_what_it_is_down.sql

-- The registry is held against writes from here to commit, so no undeclared row can land between the
-- precondition count and the trigger's creation (SHARE ROW EXCLUSIVE: the same lock CREATE TRIGGER takes;
-- reads never wait).
lock table content_ir.kind_definition in share row exclusive mode;

do $pre$
declare
  v_undeclared int;
begin
  select count(*) into v_undeclared
    from content_ir.kind_definition
   where deleted_at is null
     and coalesce(metadata ->> 'disposition', '') not in ('record', 'envelope', 'receipt', 'proposal', 'prose');
  if v_undeclared > 0 then
    raise exception 'refused: % live kinds still do not say what their output is — apply kindsglue_b_every_kind_says_what_its_output_is.sql first.', v_undeclared;
  end if;
end
$pre$;

create or replace function content_ir._kind_says_what_its_output_is()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  v_disposition text := new.metadata ->> 'disposition';
  v_kind text := coalesce(quote_literal(new.kind), 'with no slug');
begin
  if new.deleted_at is not null
     or coalesce(v_disposition, '') in ('record', 'envelope', 'receipt', 'proposal', 'prose') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is not null then
    -- A restore (trash, version history): the archived row was born before kinds had to declare.
    raise exception 'The kind % cannot be restored until it says what its output is: declare what it is first.', v_kind
      using errcode = '23514',
            hint = 'Set metadata.disposition to one of record, envelope, receipt, proposal, prose, then restore it.';
  end if;
  if coalesce(v_disposition, '') <> '' then
    raise exception 'The kind % declares disposition %, which is not one of record, envelope, receipt, proposal, prose.', v_kind, quote_literal(v_disposition)
      using errcode = '23514';
  end if;
  raise exception 'The kind % does not say what its output is: metadata.disposition must be one of record, envelope, receipt, proposal, prose.', v_kind
    using errcode = '23514',
          hint = 'Write metadata.disposition with the kind; without it every emission of the kind is refused storage.';
end
$function$;

comment on function content_ir._kind_says_what_its_output_is() is
  'KINDS-GLUE: refuses a live kind_definition row without metadata.disposition in (record, envelope, receipt, proposal, prose) — the set is matrx_graph.content_ir.sdk.KIND_DISPOSITIONS.';

do $trg$
begin
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'content_ir.kind_definition'::regclass
                    and tgname = 'zzzz_kind_says_what_its_output_is') then
    create trigger zzzz_kind_says_what_its_output_is
      before insert or update on content_ir.kind_definition
      for each row execute function content_ir._kind_says_what_its_output_is();
  end if;
end
$trg$;
