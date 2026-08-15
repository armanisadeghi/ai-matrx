-- D164 mint-time guard — a hand-authored kind may not be MINTED with a shape a
-- LIVE hand-authored kind already owns.
--
-- WHAT HAPPENED: `keyword_set` and `keyword_variant_set` were created 32ms
-- apart by the agent kind-authoring tool, byte-identical (same
-- `emitted_json_schema`, same `emitted_fingerprint`, byte-identical
-- `sample_data`). Nothing objected. An unrelated re-emit tool found it three
-- weeks later, and in the meantime `matchKindForSchema` /
-- `buildKindFingerprintIndex` — first-writer-wins — meant an agent bound to one
-- DISPLAYED as the other, with nothing told to the agent, the tool, or the
-- human. Resolved 2026-08-15 by deactivating `keyword_set`;
-- `keyword_variant_set` survives.
--
-- WHAT ALREADY EXISTS, AND WHY THIS IS NOT A THIRD SYSTEM:
--   * `_duplicate_shape_refusal` in matrx-ai `kind_authoring.py` refuses the
--     same collision inside `kind_create` / `kind_update_schema` — but it is
--     ONE tool. A second writer (the browser `create-shape.ts` path, a script,
--     a future tool) walks straight around it.
--   * `content_ir.evaluate_kind_activation` refuses the collision at
--     ACTIVATION (content_ir_activation_refuses_duplicate_shape.sql) — the
--     later seam, and the only one that catches the literal D164 pair (both
--     were minted INACTIVE, so at mint time neither held the fingerprint).
--
-- This migration is the DB floor under both: the same rule, applied to every
-- writer including a future one, at the earliest moment it can be applied. The
-- three legs are deliberately the SAME predicate stated at three seams, not
-- three different rules — change one, change all three.
--
-- SCOPE — DO NOT WIDEN. Fingerprint collisions are endemic and LEGITIMATE:
-- 100+ collision groups across ~1158 kinds, almost all machine-minted
-- `is_contract_artifact` snapshots (`action_io_*` / `tool_io_*` / `agent_io_*`
-- / `workflow_io_*`), where every tool sharing an input shape with another
-- collides by construction. Refusing those would break the aidream contract
-- publisher. The guard applies ONLY to hand-authored display kinds: not a
-- contract artifact, not soft-deleted, carrying a fingerprint, and marked
-- hand-authored.
--
-- TWO MARKERS, ONE POPULATION (measured, not assumed): the Python tool writes
-- `metadata.family = 'user_authored'`; the browser `create-shape.ts` path
-- writes `metadata.user_authored = true`. Both mean the same thing and both are
-- honored here. Unifying them is a separate change with its own readers to
-- migrate — this guard must not be the thing that silently ignores half the
-- population while looking enforced.
--
-- MEASURED LIVE 2026-08-15 BEFORE APPLYING: 28 hand-authored kinds, 22 of them
-- active, and ZERO fingerprint collisions among the active ones. The only
-- collision group in the whole hand-authored population is the D164 pair, whose
-- `keyword_set` half is already inactive. This guard therefore refuses nothing
-- that exists today.
--
-- WHEN IT RUNS:
--   INSERT — always. This is the mint-time rule: you may not create a shadow of
--            a kind that is already live, active or not.
--   UPDATE — only when the row is (or is becoming) active, when its fingerprint
--            changed, or when it is being undeleted. An ordinary metadata edit
--            on an INACTIVE colliding row (exactly `keyword_set` today) must
--            stay editable; it simply can never go live again.
--
-- THE RESIDUAL GAP, STATED PLAINLY: two kinds minted inactive in the same
-- instant still both mint — neither is active, so neither shadows the other
-- yet. That case is caught at activation by `evaluate_kind_activation`, which
-- refuses the second one. Widening this to inactive-vs-inactive would block an
-- agent legitimately drafting a variant and is a product decision, not an
-- agent's to make.
--
-- No bypass flag. There is no legitimate reason to mint a duplicate live shape,
-- and a deliberate data repair can always `alter table ... disable trigger`
-- inside its own migration.

create or replace function content_ir.guard_kind_shape_uniqueness()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_dup_kind text;
    v_dup_id   uuid;
    v_check    boolean;
begin
    -- Is the incoming row in the guarded population at all?
    if new.deleted_at is not null
       or new.emitted_fingerprint is null
       or coalesce(new.is_contract_artifact, false)
       or not (
            coalesce(new.metadata ->> 'family', '') = 'user_authored'
            or coalesce(new.metadata ->> 'user_authored', '') = 'true'
          )
    then
        return new;
    end if;

    if tg_op = 'INSERT' then
        v_check := true;
    else
        v_check := coalesce(new.is_active, false)
                or new.emitted_fingerprint is distinct from old.emitted_fingerprint
                or (old.deleted_at is not null and new.deleted_at is null);
    end if;

    if not v_check then
        return new;
    end if;

    select o.kind, o.id
      into v_dup_kind, v_dup_id
      from content_ir.kind_definition o
     where o.emitted_fingerprint = new.emitted_fingerprint
       and o.id <> new.id
       and o.is_active
       and o.deleted_at is null
       and not coalesce(o.is_contract_artifact, false)
       and (
            coalesce(o.metadata ->> 'family', '') = 'user_authored'
            or coalesce(o.metadata ->> 'user_authored', '') = 'true'
           )
     order by o.created_at
     limit 1;

    if v_dup_kind is not null then
        raise exception
            'content_ir.kind_definition: the shape of "%" is byte-identical to the ACTIVE kind "%" (id %, fingerprint %). Two names for one shape is banned — the render registry is first-writer-wins, so one would silently display as the other.',
            new.kind, v_dup_kind, v_dup_id, left(new.emitted_fingerprint, 16) || '…'
            using hint =
                'Bind to "' || v_dup_kind || '" instead (kind_get(''' || v_dup_kind
                || ''') / /shapes/' || v_dup_kind || '). If this really is a DIFFERENT '
                || 'concept, the schema has to differ too — a distinct shape needs '
                || 'distinct fields, not just a distinct name.',
            errcode = 'unique_violation';
    end if;

    return new;
end;
$function$;

drop trigger if exists kind_definition_guard_shape_uniqueness
    on content_ir.kind_definition;
create trigger kind_definition_guard_shape_uniqueness
    before insert or update on content_ir.kind_definition
    for each row execute function content_ir.guard_kind_shape_uniqueness();

comment on function content_ir.guard_kind_shape_uniqueness() is
    'D164 mint-time guard: refuses inserting (or activating / re-fingerprinting) a hand-authored kind whose emitted_fingerprint already belongs to an ACTIVE hand-authored kind, naming that kind in the error. Contract artifacts and data-only generated families are exempt — their collisions are legitimate and endemic.';
