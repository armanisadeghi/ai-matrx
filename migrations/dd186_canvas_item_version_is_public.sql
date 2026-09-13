-- dd186_canvas_item_version_is_public — ONE COLUMN PUT BACK, BECAUSE A REAL READER NAMES IT
-- (DD-186. GRANTS ONLY.)
--
-- `dd186_anon_columns_canvas.sql` revoked `version` from `anon` on `canvas.canvas_items` with the
-- rest of the platform bookkeeping. It is the one place on the whole surface where that was wrong:
-- the canvas UI READS it on a SHARED artifact — `features/canvas/core/CanvasBody.tsx` keys its
-- render on `row.version`, and `features/canvas/materialization/ensureArtifactPersisted.ts` reports
-- it — and `canvasArtifactService.getById` / `.getBySource` are the shared-view path, reachable by a
-- signed-out visitor on `/s/[token]` and `/canvas/shared`. Revoking it does not close a leak; it
-- breaks a reader.
--
-- `canvas.canvas_items.version` is a monotonic integer on a row the visitor is already allowed to
-- see. It names no person, no organization and no secret. It is granted back, BY NAME, and the
-- register (`lib/security/public-exposure.ts#ANON_COLUMN_SURFACE`) carries this reason on that row
-- so the next sweep does not take it away again on the strength of the column's name.
--
-- Everything else stays revoked on this table: `user_id`, `organization_id`, `created_by`,
-- `updated_by`, `metadata`.

grant select (version) on canvas.canvas_items to anon;

do $$
declare bad text;
begin
  if not has_column_privilege('anon', 'canvas.canvas_items', 'version', 'SELECT') then
    raise exception using message = 'DD-186: canvas.canvas_items.version was not granted to anon.';
  end if;
  select string_agg(a.attname, ', ' order by a.attname) into bad
  from pg_attribute a
  where a.attrelid = 'canvas.canvas_items'::regclass and a.attnum > 0 and not a.attisdropped
    and a.attname = any (array['user_id','organization_id','created_by','updated_by','metadata'])
    and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT');
  if bad is not null then
    raise exception using message = 'DD-186: this file granted more than version on canvas.canvas_items: ' || bad;
  end if;
end $$;
