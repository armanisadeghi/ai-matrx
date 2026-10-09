-- Teach every door that lists or compares share levels about `edit_content` ("Can edit content").
-- Lane SHARE-EDIT-CONTENT. Apply AFTER share_edit_content_level_enum.sql.
--
-- Three groups, all patched in place from the live body (so no other lane's later edit is reverted;
-- a body that no longer carries the text this edits stops the file with a sentence, nothing half-applied):
--   1. THE ONE LEVEL LIST, read by custom.share_levels() and so by every picker: iam.content_levels(),
--      and iam.permission_means().
--   2. THE LISTS THAT NAME LEVELS: the share doors' accepted-level lists and the legacy
--      has_permission_for ladder, so a holder of edit_content still passes every viewer and commenter
--      check they pass today.
--   3. THE STORE'S ROW-CONTENT DOORS: custom.record_update, record_change_many, record_upsert and
--      record_write_graph ask `edit_content` (they asked `editor`). Everything that changes structure
--      (field_declare/update/retire, views, settings, imports' declare steps), deletes, or shares keeps
--      asking `editor` or `admin`, so edit_content cannot reach it.
-- Nothing is tightened: edit_content sorts below `editor`, so no existing grant changes behaviour.

do $patch$
declare
  r record; v_def text; v_new text; v_n int; v_oid oid;
begin
  for r in select * from (values
    ($q$iam.content_levels()$q$, $q$when 'editor'\s+then 'can change it'$q$, $q$when 'edit_content' then 'can change the content, not the structure or the sharing'
             when 'editor'    then 'can change it'$q$, $q$edit_content$q$),
    ($q$iam.permission_means(public.permission_level)$q$, $q$when 'editor' then 'can read and change it'$q$, $q$when 'edit_content' then 'can read and change the content, not the structure or the sharing'
           when 'editor' then 'can read and change it'$q$, $q$edit_content$q$),
    ($q$public.has_permission_for(uuid,text,uuid,public.permission_level)$q$, $q$when 'viewer' then p\.permission_level in \('viewer', 'commenter', 'editor', 'admin'\)$q$, $q$when 'viewer' then p.permission_level in ('viewer', 'commenter', 'edit_content', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$public.has_permission_for(uuid,text,uuid,public.permission_level)$q$, $q$when 'commenter' then p\.permission_level in \('commenter', 'editor', 'admin'\)$q$, $q$when 'commenter' then p.permission_level in ('commenter', 'edit_content', 'editor', 'admin')
        when 'edit_content' then p.permission_level in ('edit_content', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$public.update_permission_level(text,uuid,uuid,uuid,text)$q$, $q$\('viewer',\s*'commenter',\s*'editor',\s*'admin'\)$q$, $q$('viewer', 'commenter', 'edit_content', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$public.share_resource_with_user(text,uuid,uuid,text)$q$, $q$\('viewer',\s*'commenter',\s*'editor',\s*'admin'\)$q$, $q$('viewer', 'commenter', 'edit_content', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$public.share_with_audience(text,uuid,text,text[])$q$, $q$\('viewer',\s*'commenter',\s*'editor',\s*'admin'\)$q$, $q$('viewer', 'commenter', 'edit_content', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$public.audience_share_preview(text,uuid,text)$q$, $q$\('viewer',\s*'commenter',\s*'editor',\s*'admin'\)$q$, $q$('viewer', 'commenter', 'edit_content', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$public.create_share_link(text,uuid,text,timestamp with time zone,integer,text)$q$, $q$\('viewer',\s*'commenter',\s*'editor',\s*'admin'\)$q$, $q$('viewer', 'commenter', 'edit_content', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$public.grant_org_availability(text,uuid,uuid,text)$q$, $q$\('viewer',\s*'commenter',\s*'editor',\s*'admin'\)$q$, $q$('viewer', 'commenter', 'edit_content', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$public.set_org_module_setting(uuid,text,boolean,boolean,text,boolean,boolean)$q$, $q$\('viewer',\s*'commenter',\s*'editor',\s*'admin'\)$q$, $q$('viewer', 'commenter', 'edit_content', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$public.get_user_file_tree(uuid,integer,integer,boolean,boolean,text)$q$, $q$\('viewer',\s*'commenter',\s*'editor',\s*'admin'\)$q$, $q$('viewer', 'commenter', 'edit_content', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$custom.record_update(uuid,uuid,jsonb,integer)$q$, $q$(assert_client_may_change\(p_organization_id, p_record_id, 'custom\.record_update')\)$q$, $q$\1, 'edit_content'::public.permission_level, 'record')$q$, $q$edit_content$q$),
    ($q$custom.record_change_many(uuid,uuid,jsonb)$q$, $q$('custom\.record_change_many',\s+)'editor'(::public\.permission_level, 'table'\))$q$, $q$\1'edit_content'\2$q$, $q$edit_content$q$),
    ($q$custom.record_change_many(uuid,uuid,jsonb)$q$, $q$(assert_client_may_change\(p_organization_id, v_id, 'custom\.record_change_many')\)$q$, $q$\1, 'edit_content'::public.permission_level, 'record')$q$, $q$edit_content$q$),
    ($q$custom.record_upsert(uuid,uuid,text[],jsonb,integer)$q$, $q$('custom\.record_upsert',\s+)'editor'(::public\.permission_level, 'table'\))$q$, $q$\1'edit_content'\2$q$, $q$edit_content$q$),
    ($q$custom.record_write_graph(uuid,uuid,jsonb,jsonb,jsonb)$q$, $q$('custom\.record_write_graph',\s+)'editor'(::public\.permission_level, 'record'\))$q$, $q$\1'edit_content'\2$q$, $q$edit_content$q$)
  ) as t(sig, rx, rep, chk) loop
    v_oid := to_regprocedure(r.sig);
    if v_oid is null then raise exception 'SHARE-EDIT-CONTENT: % is not in the catalogue, so nothing was patched', r.sig; end if;
    v_def := pg_get_functiondef(v_oid);
    v_n := regexp_count(v_def, r.rx);
    if v_n = 0 then
      raise exception 'SHARE-EDIT-CONTENT: the text this change edits is not in % (another lane changed it, or it was already patched); nothing was patched', r.sig;
    end if;
    v_new := regexp_replace(v_def, r.rx, r.rep, 'g');
    execute v_new;
    raise notice 'SHARE-EDIT-CONTENT: % patched (% place(s))', r.sig, v_n;
  end loop;
end
$patch$;
