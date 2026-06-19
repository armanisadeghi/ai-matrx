-- Wave 1 (artifact system): migrate stored `artifact_ref` content blocks to the
-- canonical R1 text form.
--
-- The prior materialization wrote a FOREIGN content block
--   {type:"artifact_ref", artifact_id, artifact_type, version, artifact_index, title}
-- which aidream cannot read (it dropped it → the model went blind to its own
-- artifact). The canonical form (vision R1) is plain text the model reads
-- natively and the UI renders by id:
--   <artifact type="X" id="<uuid>" version="N" title="T">…body…</artifact>
--
-- This rewrites every message still carrying an artifact_ref element, replacing
-- each with its id-bearing text tag (body sourced from the linked canvas_items
-- row), and archives the original into content_history.
--
-- Idempotent: only messages that actually contain an artifact_ref ELEMENT are
-- updated (guards the rare case of the literal string "artifact_ref" appearing
-- inside body text). Re-running is a no-op once all are migrated.
-- migrate: data migration (DML); safe to re-apply.

update cx_message msg
set content = sub.new_content,
    content_history = coalesce(msg.content_history, '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object(
           'content', msg.content,
           'reason', 'r1_artifact_ref_migration',
           'migrated_at', now()))
from (
  select m.id,
    jsonb_agg(
      case when elem->>'type' = 'artifact_ref' then
        jsonb_build_object('type', 'text', 'text',
          coalesce(
            (select '<artifact type="' || coalesce(elem->>'artifact_type', ci.type, 'html')
                 || '" id="' || (elem->>'artifact_id')
                 || '" version="' || coalesce(elem->>'version', '1') || '"'
                 || case when coalesce(elem->>'title','') <> ''
                      then ' title="' || regexp_replace(elem->>'title', '["\r\n]+', ' ', 'g') || '"'
                      else '' end
                 || '>' || E'\n'
                 || case when jsonb_typeof(ci.content->'data') = 'string'
                      then ci.content->>'data'
                      else (ci.content->'data')::text end
                 || E'\n</artifact>'
             from canvas_items ci where ci.id = (elem->>'artifact_id')::uuid),
            -- Fallback if the linked canvas row is missing: keep the title text
            -- so nothing renders broken and no content is silently dropped.
            coalesce(elem->>'title', 'Artifact')
          )
        )
      else elem end
      order by ord
    ) as new_content
  from cx_message m, jsonb_array_elements(m.content) with ordinality as t(elem, ord)
  where m.content::text like '%artifact_ref%'
    and exists (
      select 1 from jsonb_array_elements(m.content) e where e->>'type' = 'artifact_ref'
    )
  group by m.id
) sub
where msg.id = sub.id;
