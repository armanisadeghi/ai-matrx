-- ctx_war_room_base_retrofit.sql
-- Wave 3 base-retrofit — FIRST table of the `ctx` group. ADDITIVE / non-breaking / idempotent.
--
-- War Room adopts the changeover standard via the canonical platform.retrofit_entity routine:
--   * ctx_war_room_sessions  -> token 'war_room', org strategy 'personal' (owner user_id)
--   * ctx_war_room_tiles     -> token 'thread',   org strategy 'parent'  (org denormalized
--                               from the parent ctx_war_room_sessions via session_id)
-- The routine adds organization_id/created_by/updated_by/version, backfills org + actor,
-- swaps each legacy *_updated_at trigger (set_updated_at) for the shared
-- platform._touch_row / platform._stamp_actor, and self-verifies 0 null-org.
--
-- Sessions run FIRST so the tiles' parent-org backfill reads populated session orgs.
--
-- DEFERRED to separate, gated, post-deploy steps (NOT here -- would break the live app):
--   * _version_capture('war_room'|'thread') history capture
--   * org-first RLS flip -- iam.apply_rls('public', <table>, <token>, 'entity') + drop legacy policies
--   * organization_id NOT NULL
--   * is_deleted -> deleted_at soft-delete migration; metadata jsonb column
--   * litter/superseded drops (task_id/note_id/project_id/context_* + the legacy assignment tables)

select platform.retrofit_entity('ctx_war_room_sessions','war_room','personal','user_id', null, null, 'ctx_war_room_sessions_updated_at');
select platform.retrofit_entity('ctx_war_room_tiles','thread','parent','user_id','ctx_war_room_sessions','session_id','ctx_war_room_tiles_updated_at');

do $$
declare s_null int; t_null int; s_touch bool; s_stamp bool; t_touch bool; t_stamp bool;
begin
  select count(*) into s_null from public.ctx_war_room_sessions where organization_id is null;
  select count(*) into t_null from public.ctx_war_room_tiles    where organization_id is null;
  select exists(select 1 from pg_trigger where tgrelid='public.ctx_war_room_sessions'::regclass and tgname='_touch_row')  into s_touch;
  select exists(select 1 from pg_trigger where tgrelid='public.ctx_war_room_sessions'::regclass and tgname='_stamp_actor') into s_stamp;
  select exists(select 1 from pg_trigger where tgrelid='public.ctx_war_room_tiles'::regclass    and tgname='_touch_row')  into t_touch;
  select exists(select 1 from pg_trigger where tgrelid='public.ctx_war_room_tiles'::regclass    and tgname='_stamp_actor') into t_stamp;
  if s_null > 0 then raise exception 'WR retrofit FAIL: % null-org sessions remain', s_null; end if;
  if t_null > 0 then raise exception 'WR retrofit FAIL: % null-org tiles remain', t_null; end if;
  if not (s_touch and s_stamp and t_touch and t_stamp) then raise exception 'WR retrofit FAIL: shared triggers not attached'; end if;
  raise notice 'ctx_war_room base retrofit OK -- sessions + tiles, 0 null-org, _touch_row + _stamp_actor attached';
end $$;
