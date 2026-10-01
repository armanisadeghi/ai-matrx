-- Owner-session apply 2026-10-01 (rehearsed on the clone: 0 -> 92 override rows,
-- blobs unchanged). Keeps every person's current behaviour, `bare` included.
-- Moves each person's stored sandbox defaults (users.user_preferences
-- preferences->'sandbox') into user-rung overrides of the
-- infrastructure.sandbox.defaults knobs (seeded by
-- sandbox_defaults_01_new_sandbox_knobs.sql, which must already be applied).
--
-- Rules:
--   * A user-rung value is qualified by an organization, so a person's one
--     global preference is written into EVERY live (non-archived)
--     organization they belong to — the value they get today, wherever they
--     act. A person with no membership cannot hold a user-rung value; they are
--     counted and reported, and their blob is untouched.
--   * Only a value that DIFFERS from the knob's default becomes an override:
--     a stored copy of the default is not a choice, and copying it down would
--     freeze the person at today's default (settings-ladder rule 4).
--   * Exact behaviour is preserved: `template = bare` (22 blobs on the
--     2026-10-01 clone — the old shipped default, never offered by the old
--     page) is carried as a `bare` override, because that is what those
--     people's "New sandbox" creates today. Drop that clause only on purpose.
--   * Nothing is overwritten: an override already present (set through the
--     new screen) wins — ON CONFLICT DO NOTHING.
--   * A stored value the knob vocabulary cannot hold, or any non-empty `env`
--     (never honoured since vault Phase 5, and never a knob value), ABORTS the
--     whole migration by name rather than dropping it silently.
--   * users.user_preferences is NOT modified; the blob stays as the record
--     until the module is retired in a later, separate change.
do $$
declare
  v_missing int;
  v_bad text;
  v_env int;
begin
  select 6 - count(*) into v_missing
    from platform.feature_knob
   where feature = 'infrastructure.sandbox.defaults'
     and key in ('template', 'tier', 'auto_stop', 'git_repo', 'git_branch', 'auto_clone');
  if v_missing <> 0 then
    raise exception 'sandbox_defaults_02: % infrastructure.sandbox.defaults knob(s) are not seeded — apply sandbox_defaults_01 first', v_missing;
  end if;

  select count(*) into v_env
    from users.user_preferences p
   where p.deleted_at is null
     and coalesce(p.preferences->'sandbox'->'env', '{}'::jsonb) not in ('{}'::jsonb, 'null'::jsonb);
  if v_env <> 0 then
    raise exception 'sandbox_defaults_02: % preference blob(s) carry sandbox env vars; they belong in the person''s Vault, not a knob — move them first', v_env;
  end if;

  select string_agg(distinct format('%s=%s', k, val), ', ') into v_bad
    from (
      select 'template' k, p.preferences->'sandbox'->>'template' val
        from users.user_preferences p where p.deleted_at is null and p.preferences ? 'sandbox'
         and p.preferences->'sandbox'->>'template' is not null
         and p.preferences->'sandbox'->>'template' not in ('slim', 'aidream', 'bare')
      union all
      select 'tier', p.preferences->'sandbox'->>'tier'
        from users.user_preferences p where p.deleted_at is null and p.preferences ? 'sandbox'
         and p.preferences->'sandbox'->>'tier' is not null
         and p.preferences->'sandbox'->>'tier' not in ('ec2', 'hosted')
      union all
      select 'ttl_seconds', p.preferences->'sandbox'->>'ttl_seconds'
        from users.user_preferences p where p.deleted_at is null and p.preferences ? 'sandbox'
         and p.preferences->'sandbox'->>'ttl_seconds' is not null
         and p.preferences->'sandbox'->>'ttl_seconds' not in ('3600', '7200', '14400', '28800', '86400')
    ) bad;
  if v_bad is not null then
    raise exception 'sandbox_defaults_02: stored values the knob vocabulary cannot hold: % — extend allowed_values or decide each one', v_bad;
  end if;
end
$$;

with stored as (
  select p.user_id, p.preferences->'sandbox' s
    from users.user_preferences p
   where p.deleted_at is null and p.preferences ? 'sandbox'
),
wanted as (
  select user_id, 'template' as key, to_jsonb(s->>'template') as value from stored
   where s->>'template' is not null and s->>'template' <> 'slim'
  union all
  select user_id, 'tier', to_jsonb(s->>'tier') from stored
   where s->>'tier' is not null and s->>'tier' <> 'ec2'
  union all
  select user_id, 'auto_stop', to_jsonb(s->>'ttl_seconds') from stored
   where s->>'ttl_seconds' is not null
  union all
  select user_id, 'git_repo', to_jsonb(s->>'default_git_repo') from stored
   where coalesce(s->>'default_git_repo', '') <> ''
  union all
  select user_id, 'git_branch', to_jsonb(s->>'default_git_branch') from stored
   where coalesce(s->>'default_git_branch', '') <> ''
  union all
  select user_id, 'auto_clone', 'true'::jsonb from stored
   where (s->>'auto_clone_on_create')::boolean is true
)
insert into platform.knob_override
  (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
select 'infrastructure.sandbox.defaults', w.key, 'user', w.user_id, m.organization_id, w.value,
       'Carried over from your saved sandbox defaults (users.user_preferences) on the move to settings.',
       w.user_id
  from wanted w
  join iam.organization_member m on m.user_id = w.user_id
  join iam.organizations o on o.id = m.organization_id and o.archived_at is null
on conflict do nothing;
