-- chair-step: NOT A BODY REPLACEMENT — FOR THE CHAIR'S WATCHED WINDOW (lane REFERENCE-KEEPS-ARCHIVED,
--   chair ruling B3-21 of 2026-10-01). The words door for a relation chip,
--   `custom.relation_words_many`, gains ONE output column, `archived boolean`, so a chip can say its
--   record is in Archived items (state, not prose: records-ui draws the archived badge). Postgres
--   cannot change a function's OUT columns with CREATE OR REPLACE, so this is DROP + CREATE + the same
--   EXECUTE grants it holds today, put back by the DDL guard from the door's registry row. The door registry row
--   (platform.client_callable_door) is keyed by identity arguments, which do not change. The lock is the
--   function object's own (pg_proc row); no relation is locked. No other body calls this door.
--   `archived` is true only for a record the reader may see (the words are not the withheld sentence),
--   so it never discloses anything the ladder withholds.
--   Inverse: `migrations/inverse/refkeep_b_a_reference_says_its_record_is_archived_down.sql`.
-- lock: custom
-- lane: REFERENCE-KEEPS-ARCHIVED
-- based-on: custom.relation_words_many(uuid, uuid, uuid[]) dc892b892260488be3a1a5b3b786751da8918433b6152dbda4d311c9d9919154

DROP FUNCTION custom.relation_words_many(uuid, uuid, uuid[]);

CREATE FUNCTION custom.relation_words_many(p_organization_id uuid, p_field_id uuid, p_record_ids uuid[])
 RETURNS TABLE(record_id uuid, words text, archived boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_display  jsonb;
  v_withheld text := platform.relation_withheld_label();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_words_many');
  v_display := custom._display_of_field(p_organization_id, p_field_id);
  -- A PAGE AT A TIME, and the ladder is still asked per record inside the resolver, so
  -- batching buys a round trip and never a disclosure.
  --
  -- ARCHIVED (lane REFERENCE-KEEPS-ARCHIVED, chair ruling B3-21): an archive keeps every reference
  -- to what it archived, so a chip can point at a record in Archived items. The door says so, for
  -- a record this reader may see only — a withheld one answers null, exactly as before.
  return query
    select w.id, w.words,
           case when w.words is null or w.words = v_withheld then null
                else exists (select 1 from custom.record r
                              where r.organization_id = p_organization_id and r.id = w.id
                                and r.deleted_at is not null) end
      from (select i.id, custom._words_for(p_organization_id, i.id, v_display, null, 0) as words
              from unnest(coalesce(p_record_ids, '{}'::uuid[])) as i(id)
             where i.id is not null) w;
end
$function$;

-- Grants: none written here. The DDL guard re-opens a declared door's grants when it is born
-- (platform.reopen_declared_doors from its platform.client_callable_door row), so the signed-in
-- lane comes back exactly as it was and anon stays shut.
