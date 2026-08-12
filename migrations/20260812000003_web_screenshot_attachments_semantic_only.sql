-- Notes and supplemental files may be about a screenshot, but a screenshot is
-- not an independently shareable container. Its image is the file_id FK and
-- its access derives from the containing web_site composition relationship.
update platform.association_types
set
  container_side = 'none',
  notes = case source_type
    when 'note' then 'A note about this capture. Semantic link only; screenshot access derives from web_site. 2026-08-12'
    when 'file' then 'A supplemental file attached to this capture. The screenshot image itself is web.screenshot.file_id; semantic link only. 2026-08-12'
  end
where target_type = 'web_screenshot'
  and source_type in ('note', 'file')
  and (
    container_side is distinct from 'none'
    or notes is distinct from case source_type
      when 'note' then 'A note about this capture. Semantic link only; screenshot access derives from web_site. 2026-08-12'
      when 'file' then 'A supplemental file attached to this capture. The screenshot image itself is web.screenshot.file_id; semantic link only. 2026-08-12'
    end
  );

do $$
begin
  if exists (
    select 1
    from platform.association_types
    where target_type = 'web_screenshot'
      and source_type in ('note', 'file')
      and container_side <> 'none'
  ) then
    raise exception 'web_screenshot note/file attachments must remain semantic-only';
  end if;
end
$$;
