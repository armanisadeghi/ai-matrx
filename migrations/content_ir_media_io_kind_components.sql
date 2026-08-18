-- The FE half of the four curated media kinds: one canonical web/output
-- `kind_component` row per kind, mirroring the compiled bridge that now ships
-- in matrx-frontend, then activation.
--
--   generated_image_set  -> GeneratedImageSetBlock   (legacyBlockType generated_image_set)
--   generated_video_set  -> GeneratedVideoSetBlock   (legacyBlockType generated_video_set)
--   generated_audio      -> GeneratedAudioBlock      (legacyBlockType generated_audio)
--   podcast_episode      -> PodcastEpisodeBlock      (legacyBlockType podcast_episode)
--
-- These are `source='bundled'` rows: the component lives in the repo and the
-- compiled floor (`registry/system-components.ts`) already resolves it before
-- any network read. The row is the warm-tier mirror of that floor — the same
-- convention `media_chapters` / `page_brief` / `transcript` follow — so the
-- registry, the shape doctor, and `/shapes` all agree on what renders these.
--
-- NO `kind_surface` ROW IS OWED. A surface exists only for a NON-JSON arrival
-- form (an XML tag or a custom fence language). All four kinds arrive as
-- canonical `__kind` JSON, which the parser detects natively, and a surface
-- row without an implemented `parser_strategy` is a phantom (there are already
-- eight of those; do not add more). See the `shape-system` skill, step 5.
--
-- Activation is via `content_ir.set_kind_activation` — the ONE write path for
-- `is_active`, which runs the dual gate and raises with the missing asset.
-- Every canonical `kind_example` for these four already validates `passed`.

insert into content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source, config, organization_id)
select kd.id, 'web', 'output', c.component_key, 'bundled',
       jsonb_build_object('legacyBlockType', c.component_key),
       kd.organization_id
from (values
        ('generated_image_set', 'generated_image_set'),
        ('generated_video_set', 'generated_video_set'),
        ('generated_audio', 'generated_audio'),
        ('podcast_episode', 'podcast_episode')
     ) as c(kind, component_key)
join content_ir.kind_definition kd
  on kd.kind = c.kind
 and kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 and kd.deleted_at is null
where not exists (
  select 1 from content_ir.kind_component existing
   where existing.kind_definition_id = kd.id
     and existing.platform = 'web'
     and existing.role = 'output'
     and existing.deleted_at is null);

-- The D1 input floor: every compiled kind can collect an instance through the
-- generic bridged form (`KindInputForm`). Mirrors the compiled input entry.
insert into content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source, config, organization_id)
select kd.id, 'web', 'input', 'generic_structured', 'bundled', '{}'::jsonb, kd.organization_id
from content_ir.kind_definition kd
where kd.kind in ('generated_image_set', 'generated_video_set', 'generated_audio', 'podcast_episode')
  and kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_component existing
     where existing.kind_definition_id = kd.id
       and existing.platform = 'web'
       and existing.role = 'input'
       and existing.deleted_at is null);

do $$
declare
    d record;
begin
    for d in
        select id, kind
          from content_ir.kind_definition
         where kind in ('generated_image_set', 'generated_video_set',
                        'generated_audio', 'podcast_episode')
           and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
           and deleted_at is null
           and not is_active
    loop
        perform content_ir.set_kind_activation(d.id, true);
    end loop;
end;
$$;
