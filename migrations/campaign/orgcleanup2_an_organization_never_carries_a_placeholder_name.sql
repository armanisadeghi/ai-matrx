-- additive: yes
--
-- ORG-CLEANUP-2 — THE ORGANIZATION DOOR REFUSES A PLACEHOLDER NAME, IN A SENTENCE.
--
-- THE FACTS. Lane ORG-CLEANUP archived 35 throwaway organizations on 2026-09-22. By the
-- next morning 48 MORE were live and back on the picker: "ZZZ APPROVAL-FIX throwaway
-- 6d9b1708 — safe to delete", "Throwaway Dash 3fee58c2", "Throwaway Pipe 21d0e260".
-- Fourteen suites in aidream's `matrx-records` package each minted one per run. Those
-- suites are fixed (they now reuse ONE named fixture organization by slug), but a cleanup
-- that only fixes the fourteen callers it found is the instance, not the class: the
-- FIFTEENTH script is written next week and nothing stops it.
--
-- So the DOOR refuses the name. Arman's law of 2026-09-21: every organization carries the
-- use case's own business name — never "ZZZ …", never "throwaway", never "test fixture",
-- because a name is what he reads on the screen. "Test fixture" is a CLASSIFICATION and it
-- belongs in `settings.test_fixture`, which is exactly how cleanup finds these rows; this
-- file does not touch settings and never will.
--
-- WHAT IT REFUSES, AND WHAT IT DELIBERATELY DOES NOT
--   · `iam.placeholder_in_a_name(name, slug)` returns the offending token, or null. It is
--     a plain immutable function on purpose: a guard, a suite or a screen can ask it the
--     same question the trigger asks, so the three can never drift.
--   · the trigger fires BEFORE INSERT, and on UPDATE only when the name or the slug
--     actually CHANGES. That is load-bearing: the 48 rows archived this morning still carry
--     their junk names, and an archive, a restore or any other update of one of them must
--     keep working. Making the row worse is refused; leaving it as it is never is.
--   · it refuses with 23514 and a sentence that says what is wrong, what to write instead,
--     and where the classification goes. Nothing fails silently and nothing refuses mutely.
--
-- THE LOCK. `create or replace function` takes ACCESS SHARE and `create trigger` takes
-- SHARE ROW EXCLUSIVE on an unpartitioned table (the measured census in
-- scripts/lib/ddl-lock-footprint.json) — neither is window-class, and no reader and no
-- sign-in is blocked. The INVERSE carries `drop trigger`, which IS window-class; it says so
-- in its own header.

set lock_timeout = '4s';

create or replace function iam.placeholder_in_a_name(p_name text, p_slug text default null)
returns text
language sql
immutable
as $function$
  -- The offending token, or null. One list, asked by the trigger, by the release guard and
  -- by anything else that wants the same answer.
  select token from (
    select t.token
      from (values
        ('ZZZ / ZZ prefix',      '(^|[^a-z0-9])zz+([\s_-]|$)'),
        ('throwaway',            'throwaway'),
        ('placeholder',          'placeholder'),
        ('test-only',            'test[\s_-]only'),
        ('safe to delete',       'safe[\s_-]to[\s_-]delete'),
        ('test fixture in a name', 'test[\s_-]fixture'),
        ('test organization',    'test[\s_-]org(anization|anisation)?([^a-z]|$)'),
        ('lorem ipsum',          'lorem[\s_-]ipsum'),
        ('disposable',           'disposable[\s_-]org')
      ) as t(token, pattern)
     where coalesce(p_name, '') ~* t.pattern
        or coalesce(p_slug, '') ~* t.pattern
     limit 1
  ) hit;
$function$;

comment on function iam.placeholder_in_a_name(text, text) is
  'ORG-CLEANUP-2: the one list of names an organization may not carry. Returns the '
  'offending token or null. Arman''s no-fake-test-data law, 2026-09-21.';

create or replace function iam.organization_name_is_never_a_placeholder()
returns trigger
language plpgsql
as $function$
declare
  v_token text := iam.placeholder_in_a_name(new.name, new.slug);
begin
  if v_token is null then
    return new;
  end if;
  raise exception
    'An organization cannot be called "%" — its name carries %.', new.name, v_token
    using errcode = '23514',
          hint = 'Name it after the real business the use case is about — "Cedar Ridge '
                 'Veterinary Clinic", "Lakeshore Window & Door". If this is a test fixture, '
                 'that is a CLASSIFICATION, not a name: put it in settings.test_fixture, '
                 'which is how cleanup finds it, and reuse the same organization by slug '
                 'instead of making a new one each run.',
          detail = format('name=%L slug=%L', new.name, new.slug);
end
$function$;

-- TWO triggers, not one with a `tg_op` test: PostgreSQL does not expose `tg_op` in a WHEN
-- clause, and it forbids naming OLD in the WHEN clause of an INSERT trigger. So the insert
-- half is unconditional and the update half carries the "only when it CHANGES" condition.
-- `create or replace trigger` rather than `drop` + `create`, because `drop trigger` takes
-- ACCESS EXCLUSIVE on the 23 auth/storage/realtime relations supautils hooks — it would make
-- this file window-class and freeze sign-in. Measured on the clone: the replace does not.

create or replace trigger organization_name_is_never_a_placeholder_i
  before insert on iam.organizations
  for each row
  execute function iam.organization_name_is_never_a_placeholder();

create or replace trigger organization_name_is_never_a_placeholder_u
  before update of name, slug on iam.organizations
  for each row
  when (new.name is distinct from old.name or new.slug is distinct from old.slug)
  execute function iam.organization_name_is_never_a_placeholder();

comment on function iam.organization_name_is_never_a_placeholder() is
  'ORG-CLEANUP-2: refuses a placeholder organization name at the door, with the sentence '
  'that says what to write instead. Fires on INSERT and on a name/slug CHANGE only, so the '
  'rows already carrying junk names can still be archived, restored and updated.';
