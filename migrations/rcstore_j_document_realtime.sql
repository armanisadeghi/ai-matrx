-- RC-A1 step 7 (STORE-DESIGN §3.12, §5 step 7): realtime for content.document, in its own
-- migration as the design requires.
--
--   * content.document joins the supabase_realtime publication (filtered postgres_changes under
--     RLS; subscribers MUST filter id=eq.<id> for an open document or organization_id=eq.<org>
--     for a list, and treat an event over 1 MB — body omitted — as "refetch", never as empty);
--   * the private broadcast topic prefix `document` is registered: a topic `document:<uuid>`
--     (Yjs co-editing, presence) admits exactly the callers who hold editor on that document,
--     decided by iam.has_access — the elected writer persists through the CAS on `version`.
--
-- ALTER PUBLICATION ... ADD TABLE takes SHARE UPDATE EXCLUSIVE on content.document only (an
-- empty, new table). Apply inside the 1–4 AM PT window with the rest of RC-A1.

set local lock_timeout = '2s';

alter publication supabase_realtime add table content.document;

create or replace function content.realtime_topic_admits(p_topic text)
returns boolean
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
begin
  -- THE GRAMMAR: document:<uuid>, nothing else. A malformed topic is not a refused person.
  if p_topic is null
     or p_topic !~ '^document:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  if auth.uid() is null then
    return false;
  end if;
  return coalesce(iam.has_access('document', substring(p_topic from 10)::uuid, 'editor'), false);
end;
$fn$;
comment on function content.realtime_topic_admits(text) is
  'Admission for the private broadcast topic document:<uuid> (Yjs co-editing / presence): the signed-in caller must hold editor on that document (iam.has_access). Called by platform.realtime_topic_admits through platform.realtime_topic_prefix.';

insert into platform.realtime_topic_prefix (prefix, admits_fn, description)
values ('document', 'content.realtime_topic_admits(text)'::regprocedure,
        'One private topic per content.document (document:<uuid>) for Yjs co-editing and presence. The payload is edit traffic, so admission is editor on that document and nobody else; the elected writer persists the text through the compare-and-swap on content.document.version.')
on conflict (prefix) do update
   set admits_fn = excluded.admits_fn, description = excluded.description;
