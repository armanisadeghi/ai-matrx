-- inverse of share_edit_content_level_doors.sql
-- chair-step: rollback of the edit_content share level; the owner of lane SHARE-EDIT-CONTENT decides.
-- WHAT IT DOES NOT UNDO: the enum value `edit_content` stays in public.permission_level (Postgres cannot drop
-- an enum value). Grants already written at edit_content are first set to `commenter` below, so nobody is left
-- holding a level no door understands.
update iam.permissions set permission_level = 'commenter' where permission_level = 'edit_content';
update platform.share_links set permission_level = 'commenter' where permission_level = 'edit_content';

do $patch$
declare
  r record; v_def text; v_new text; v_n int; v_oid oid;
begin
  for r in select * from (values
    ($q$iam.content_levels()$q$, $q$\s*when 'edit_content' then '[^']*'(\s*when 'editor')$q$, $q$\1$q$, $q$edit_content$q$),
    ($q$iam.permission_means(public.permission_level)$q$, $q$when 'edit_content' then '[^']*'\s*(when 'editor')$q$, $q$\1$q$, $q$edit_content$q$),
    ($q$public.has_permission_for(uuid,text,uuid,public.permission_level)$q$, $q$'viewer', 'commenter', 'edit_content', 'editor', 'admin'$q$, $q$'viewer', 'commenter', 'editor', 'admin'$q$, $q$edit_content$q$),
    ($q$public.has_permission_for(uuid,text,uuid,public.permission_level)$q$, $q$'commenter', 'edit_content', 'editor', 'admin'\)\s*when 'edit_content' then p\.permission_level in \('edit_content', 'editor', 'admin'\)$q$, $q$'commenter', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$public.update_permission_level(text,uuid,uuid,uuid,text)$q$, $q$\('viewer', 'commenter', 'edit_content', 'editor', 'admin'\)$q$, $q$('viewer', 'commenter', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$public.share_resource_with_user(text,uuid,uuid,text)$q$, $q$\('viewer', 'commenter', 'edit_content', 'editor', 'admin'\)$q$, $q$('viewer', 'commenter', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$public.share_with_audience(text,uuid,text,text[])$q$, $q$\('viewer', 'commenter', 'edit_content', 'editor', 'admin'\)$q$, $q$('viewer', 'commenter', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$public.audience_share_preview(text,uuid,text)$q$, $q$\('viewer', 'commenter', 'edit_content', 'editor', 'admin'\)$q$, $q$('viewer', 'commenter', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$public.create_share_link(text,uuid,text,timestamp with time zone,integer,text)$q$, $q$\('viewer', 'commenter', 'edit_content', 'editor', 'admin'\)$q$, $q$('viewer', 'commenter', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$public.grant_org_availability(text,uuid,uuid,text)$q$, $q$\('viewer', 'commenter', 'edit_content', 'editor', 'admin'\)$q$, $q$('viewer', 'commenter', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$public.set_org_module_setting(uuid,text,boolean,boolean,text,boolean,boolean)$q$, $q$\('viewer', 'commenter', 'edit_content', 'editor', 'admin'\)$q$, $q$('viewer', 'commenter', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$public.get_user_file_tree(uuid,integer,integer,boolean,boolean,text)$q$, $q$\('viewer', 'commenter', 'edit_content', 'editor', 'admin'\)$q$, $q$('viewer', 'commenter', 'editor', 'admin')$q$, $q$edit_content$q$),
    ($q$custom.record_update(uuid,uuid,jsonb,integer)$q$, $q$(assert_client_may_change\(p_organization_id, p_record_id, 'custom\.record_update'), 'edit_content'::public\.permission_level, 'record'\)$q$, $q$\1)$q$, $q$edit_content$q$),
    ($q$custom.record_change_many(uuid,uuid,jsonb)$q$, $q$('custom\.record_change_many',\s+)'edit_content'(::public\.permission_level, 'table'\))$q$, $q$\1'editor'\2$q$, $q$edit_content$q$),
    ($q$custom.record_change_many(uuid,uuid,jsonb)$q$, $q$(assert_client_may_change\(p_organization_id, v_id, 'custom\.record_change_many'), 'edit_content'::public\.permission_level, 'record'\)$q$, $q$\1)$q$, $q$edit_content$q$),
    ($q$custom.record_upsert(uuid,uuid,text[],jsonb,integer)$q$, $q$('custom\.record_upsert',\s+)'edit_content'(::public\.permission_level, 'table'\))$q$, $q$\1'editor'\2$q$, $q$edit_content$q$),
    ($q$custom.record_write_graph(uuid,uuid,jsonb,jsonb,jsonb)$q$, $q$('custom\.record_write_graph',\s+)'edit_content'(::public\.permission_level, 'record'\))$q$, $q$\1'editor'\2$q$, $q$edit_content$q$)
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
