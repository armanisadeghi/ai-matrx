-- lane: access-ladder T-10b (Claude Opus 5.5, standard lane) — part 4 of 4: chat.user_request is its root's child.
--
-- Law: common-docs/policies/access-ladder.md, "Children inherit their parent". With one root named
-- (parts 1–3), cx_user_request stops carrying a level of its own (it was Private, an entity with an
-- owner lane): it becomes a component of its conversation OR its workflow run — the two composition
-- edges below — and its policies are regenerated as a component. Whoever opens the conversation
-- (its owner, a person it is shared with) opens the turn's user request; whoever opens the workflow
-- run (its organization, Organization class) opens the requests that run started. A rootless row
-- (no turn ever landed) opens to no client.
--
-- The stray `visibility` column stays for now (verify_canonical WARN, never read by a component
-- lane); dropping a column is its own step.
--
-- Locks: SHARE UPDATE EXCLUSIVE on chat.user_request while the constraints validate (~20k rows);
-- ACCESS EXCLUSIVE on chat.user_request while iam.apply_rls swaps its policies (well under a second).
set local lock_timeout = '3s';
set local statement_timeout = '120s';

alter table chat.user_request validate constraint user_request_one_root;
alter table chat.user_request validate constraint user_request_conversation_id_fkey;
alter table chat.user_request validate constraint user_request_workflow_run_id_fkey;

insert into platform.entity_relationships (child_type, parent_type, fk_column, kind, note)
select v.child, v.parent, v.fk, 'composition', v.note
  from (values
    ('cx_user_request', 'conversation', 'conversation_id',
     'Access ladder T-10b (2026-09-28): a user request is its root''s — the top-level conversation it started in. Exactly one of conversation_id / workflow_run_id is set (user_request_one_root).'),
    ('cx_user_request', 'workflow_run', 'workflow_run_id',
     'Access ladder T-10b (2026-09-28): a user request a workflow run started is that run''s. Exactly one of conversation_id / workflow_run_id is set (user_request_one_root).')
  ) as v(child, parent, fk, note)
 where not exists (select 1 from platform.entity_relationships r
                    where r.child_type = v.child and r.parent_type = v.parent and r.kind = 'composition');

update platform.entity_types
   set type = 'detail',
       rls_variant = 'component', is_component = true,
       data_class = null, default_visibility = null, default_list_scope = null,
       data_class_reason = 'Access ladder T-10b (2026-09-28): a child of its root (conversation or workflow run); its access is its parent''s (common-docs/policies/access-ladder.md, "Children inherit their parent").'
 where token = 'cx_user_request';

select iam.apply_rls('chat', 'user_request', 'cx_user_request', 'component');

do $$
declare v_sel text;
begin
  select qual into v_sel from pg_policies
   where schemaname = 'chat' and tablename = 'user_request' and policyname = 'std_select';
  if v_sel is null or v_sel not like '%conversation_id%' or v_sel not like '%workflow_run_id%' then
    raise exception 'T-10b part 4: std_select does not defer to both roots: %', v_sel;
  end if;
  if v_sel like '%created_by = %' then
    raise exception 'T-10b part 4: std_select still carries an owner lane: %', v_sel;
  end if;
end $$;
