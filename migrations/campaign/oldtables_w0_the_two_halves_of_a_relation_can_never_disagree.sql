-- additive: yes
--
-- chair-step: it CREATES one function, `custom._relation_halves_agree()`, and TWO DEFERRED
--   constraint triggers that call it — one on `custom.record`, one on `platform.associations`.
--   Nothing is replaced, dropped, granted or revoked; no existing function body is touched; no
--   row of anybody's data is written or read outside the statement being judged. The inverse is
--   `migrations/inverse/oldtables_w0_the_two_halves_of_a_relation_can_never_disagree_down.sql`.
--
-- OLD-TABLES-CUTOVER rev 2, W0 — REL-11 IS CORRECTED, AND THE CORRECTION IS MADE HONEST.
--
-- THE CONTRACT ROW THAT WAS WRONG. `v5/CONTRACT.md` says it twice — REL-10 ("relations are
-- stored as associations with `role` = the field key") and REL-11 ("nothing about a relation is
-- stored in the value") — and the doctrine says the same as R5. The store that shipped does
-- BOTH: measured on the main database, one organization's `client` field holds 1,127 record ids
-- inside the record documents beside 1,176 association rows for the same field, and
-- `custom.relation_words` takes a VALUE read out of the document, which only works because the
-- id is there. `custom.record_relation_edges` still carries REL-11's sentence in a comment over
-- code that reads the id out of the value — the contradiction, in one function.
--
-- THE BUILT SHAPE IS RIGHT AND THE CONTRACT ROW WAS WRONG. The association is the edge and the
-- index — it is what makes "everything pointing at this customer" one query and what carries
-- access; the id in the document is the CELL, and a grid that had to join to associations to
-- render a column would pay for it on every page. Airtable and Notion both keep the link in the
-- record and the index beside it. So, under DD-023:
--
--   REL-11 (corrected) — A relation's value is the target's id; the edge is an association
--   written in the same transaction; NEITHER IS DERIVED FROM THE OTHER.
--
-- AND THIS FILE IS WHAT MAKES THAT CORRECTION HONEST RATHER THAN A LICENCE TO DRIFT. REL-11
-- existed to prevent exactly the drift it would now permit, so the correction keeps its intent
-- and changes only its mechanism: THE TWO HALVES CAN NEVER DISAGREE. A write that lands the
-- value without its association, or the association without its value, is REFUSED — not
-- reconciled later, not swept by a job, not logged.
--
-- WHY IT IS DEFERRED, AND WHY THAT IS THE WHOLE DESIGN. The value is written by BEFORE-ROW
-- triggers on `custom.record`; the edge is written by the AFTER-STATEMENT triggers
-- `zz_w2a_relation_association_s_i` / `_s_u`. At AFTER-ROW time the edge does not exist yet, so
-- an immediate trigger would refuse every legitimate write. `DEFERRABLE INITIALLY DEFERRED`
-- moves both arms to COMMIT, where both halves are visible and the question is finally
-- answerable. It also means the guard judges the TRANSACTION, not the statement: a caller is
-- free to write the two halves in either order, in any number of statements, and is refused
-- only if the transaction ends with them disagreeing. That is the correct boundary — "written
-- in the same transaction" is the contract's own wording.
--
-- WHAT IT DOES NOT DO. It never writes, repairs or reconciles anything: there is no arm that
-- inserts a missing association or clears a stale one, because a guard that fixes what it finds
-- is a sweep wearing a guard's name, and the class this replaces is exactly "the two halves
-- drifted and something quietly patched it up". It refuses, names both halves, and stops.
--
-- THE LOCK, MEASURED ON THE CLONE — AND THE ONE LINE THAT NEARLY FROZE SIGN-IN.
--
-- The first draft of this file opened each trigger with a `drop trigger if exists` for
-- idempotency. `pnpm db:rehearse --target clone` measured what that costs: the DROP took
-- ACCESS EXCLUSIVE on FORTY-ONE relations the file does not name — the whole
-- `auth.*` / `storage.* `/ `realtime.*` set that LANE-PREAMBLE's POLICY-LOCK rule describes,
-- PLUS all sixteen `custom.record` partitions — and held them to COMMIT, so nobody would have
-- signed in, refreshed a token, read a file or received a realtime message for ~810 ms. That
-- is Supabase's own `supautils` hook, not one of our event triggers, and duration is the only
-- lever we own. So the DROPs are gone: the runner refuses a re-application of ledgered bytes,
-- and removing a trigger is the inverse's job, which is where a DROP belongs.
--
-- What is left, re-measured: CREATE FUNCTION 169 ms, COMMENT 83 ms, the two
-- `CREATE CONSTRAINT TRIGGER`s, and NO ACCESS EXCLUSIVE anywhere. The heaviest lock is
-- SHARE ROW EXCLUSIVE on `custom.record` and its sixteen partitions — it blocks WRITERS to the
-- unified store for the transaction and blocks no reader at all. This file therefore does not
-- need the 1-4 AM window; the draft that carried the DROPs did.
--
-- WHAT A SOFT DELETE DOES. `custom.record_relation_edges` returns NOTHING for a row whose
-- `deleted_at` is set, so a soft-deleted record implies no edges and the cascade that soft-
-- deletes its associations is judged agreeing, not disagreeing. The same holds for a hard
-- delete, where the source row is gone and nothing is implied.

create or replace function custom._relation_halves_agree()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_rec       custom.record%rowtype;
  v_missing   text;
  v_implied   boolean;
  v_org       uuid;
  v_source    uuid;
  v_target    uuid;
  v_role      text;
  v_going     boolean;   -- is this edge on its way OUT (hard delete or soft delete)?
begin
  -- ── THE VALUE HALF ────────────────────────────────────────────────────────────────────
  -- Every edge this record's document implies must have a live association by COMMIT.
  if tg_table_schema = 'custom' then
    select string_agg(format('%L → %s', e.edge_role, e.target_id), ', ' order by e.edge_role)
      into v_missing
      from custom.record_relation_edges(new.organization_id, new.id, new.table_id,
                                        new.data_class, new.data, new.deleted_at) e
     where not exists (
             select 1
               from platform.associations a
              where a.source_type = 'record'
                and a.source_id   = new.id
                and a.target_type = 'record'
                and a.target_id   = e.target_id
                and a.role        = e.edge_role
                and a.deleted_at is null);

    if v_missing is not null then
      raise exception
        using errcode = '23514',
              message = format(
                'a relation landed its VALUE with no association beside it — record %s names %s',
                new.id, v_missing),
              detail  = 'REL-11, corrected under DD-023: a relation''s value is the target''s id and the '
                     || 'edge is an association written in the same transaction. Neither is derived from '
                     || 'the other, and neither may land alone.',
              hint    = 'Write the edge in the same transaction, or let the store''s own '
                     || 'zz_w2a_relation_association_s_* triggers write it — do not disable them.';
    end if;
    return null;
  end if;

  -- ── THE EDGE HALF ─────────────────────────────────────────────────────────────────────
  -- Only a RELATION edge is ours: one that names the field it came from. Every other kind of
  -- association on this table (containment, surface bindings, lineage) is somebody else's law.
  if coalesce(new.relation_field_id, old.relation_field_id) is null then
    return null;
  end if;

  v_org    := coalesce(new.organization_id, old.organization_id);
  v_source := coalesce(new.source_id, old.source_id);
  v_target := coalesce(new.target_id, old.target_id);
  v_role   := coalesce(new.role, old.role);
  v_going  := (tg_op = 'DELETE') or (new.deleted_at is not null);

  if coalesce(new.source_type, old.source_type) <> 'record'
     or coalesce(new.target_type, old.target_type) <> 'record' then
    return null;
  end if;

  select r.* into v_rec
    from custom.record r
   where r.organization_id = v_org
     and r.id = v_source;

  v_implied := found and exists (
    select 1
      from custom.record_relation_edges(v_rec.organization_id, v_rec.id, v_rec.table_id,
                                        v_rec.data_class, v_rec.data, v_rec.deleted_at) e
     where e.target_id = v_target
       and e.edge_role = v_role);

  if not v_going and not v_implied then
    raise exception
      using errcode = '23514',
            message = format(
              'a relation''s ASSOCIATION landed with no value beside it — record %s has no %L holding %s',
              v_source, v_role, v_target),
            detail  = 'REL-11, corrected under DD-023: the value and the edge are two halves of one fact '
                   || 'and can never disagree. An edge with no cell behind it is an index of something '
                   || 'nobody wrote.',
            hint    = 'Write the id into the record''s own document under the field''s key in the same '
                   || 'transaction, and the store''s triggers will write this edge for you.';
  end if;

  if v_going and v_implied then
    raise exception
      using errcode = '23514',
            message = format(
              'a relation''s ASSOCIATION was removed while its VALUE still names the record — record %s '
              || 'still holds %s under %L',
              v_source, v_target, v_role),
            detail  = 'REL-11, corrected under DD-023: neither half is derived from the other, so removing '
                   || 'the edge alone leaves a cell the index cannot find.',
            hint    = 'Clear the id from the record''s document in the same transaction.';
  end if;

  return null;
end;
$fn$;

comment on function custom._relation_halves_agree() is
  'OLD-TABLES-CUTOVER W0 / DD-023. The corrected REL-11, as a refusal: a relation''s value and its '
  'association are two halves of one fact written in the same transaction, and a transaction that '
  'ends with one of them missing is refused at COMMIT naming both halves. Installed as a DEFERRED '
  'constraint trigger on both custom.record and platform.associations; it never repairs anything.';

-- The value half. `data_class = 'record'` keeps it off kernel, field and table rows, which carry
-- no relation cells at all; `record_relation_edges` would return nothing for them anyway, and the
-- WHEN clause is what keeps that nothing from costing a function call per structure row.
create constraint trigger zzzz_relation_halves_agree
  after insert or update on custom.record
  deferrable initially deferred
  for each row
  when (new.data_class = 'record' and new.deleted_at is null)
  execute function custom._relation_halves_agree();

-- The edge half. No WHEN clause on `relation_field_id`, deliberately: the column is set by
-- `custom._store_relation_edge_names_its_field` in a BEFORE trigger, and a WHEN clause on a
-- constraint trigger is evaluated at COMMIT against the stored row — but writing the gate into
-- the function body instead keeps the DELETE arm, where only OLD exists, in the same place.
create constraint trigger zzzz_relation_halves_agree
  after insert or update or delete on platform.associations
  deferrable initially deferred
  for each row
  execute function custom._relation_halves_agree();
