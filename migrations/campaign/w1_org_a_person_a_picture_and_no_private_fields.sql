-- target: branch,production
-- additive: yes
-- guard: custom/entity_custom_fields_guard
--
-- W1-ORG — REC-30, REC-31 and REC-39: A PERSON IS REACHED THROUGH A RELATION, A PICTURE IS A
-- FILE RECORD REACHED THROUGH A RELATION, AND NOBODY GETS A PRIVATE COLUMN ON A SHARED TABLE.
--
-- THE THREE LAWS, VERBATIM
-- ------------------------
-- REC-30: "Sign-in connects to a Person record through a relation, never as a Value on it."
--   COMPANY: Salesforce keeps User (who signs in) and Contact (a person tied to an Account) as
--   two separate standard objects joined by a lookup — never one object with a login column.
-- REC-31: "A picture is a File record reached through a relation."
-- REC-39: "No per-person fields exist on an organization's tables; a Person may instead create
--   their own custom tables."  COMPANY: Airtable and Notion ship no per-user private field on a
--   shared table; a private value needs a separate base or workspace, or the person's own table.
--
-- WHY ALL THREE LIVE IN ONE GUARD, AND WHY IT IS THIS ONE
-- -------------------------------------------------------
-- All three say the same thing in three places: a VALUE may not stand in for a RELATION, and a
-- shared table has no private half. The place a value gets declared on this platform is
-- `platform.custom_field_definition` — the extensibility layer every organization adds columns
-- through — so that is where the three are enforced, once, for every entity that participates.
-- Enforcing them in `custom._field_shape_guard` instead would cover the record store only and
-- would need `LOCK:custom`, which this lane does not hold.
--
-- THE FIELD TYPES ARE ALREADY THERE; THAT IS WHAT MAKES THIS A REFUSAL AND NOT A WISH
-- ------------------------------------------------------------------------------------
-- `custom_field_definition_field_type_check` already admits `user_reference`, `entity_reference`
-- and `file` alongside the scalars (measured 2026-09-18). So every refusal below has a remedy
-- that exists TODAY: the person declaring `owner_email text` is not being told "no", they are
-- being told "that is `user_reference`", and the field they wanted lands on the next attempt.
-- A law whose remedy does not exist yet is a wall; this one is a signpost.
--
-- IT IS A GUARD, NOT A SPELL-CHECKER — THE VOCABULARY IS DATA
-- -----------------------------------------------------------
-- `platform.doctrine_shape_vocabulary()` holds the words, one row each, with the law they serve
-- and the sentence the refusal prints. Adding a word is a row, not a body change, and the whole
-- list can be READ by anyone wondering why their field was refused. A regular expression buried
-- in a trigger body would have been the same rule nobody could see.
--
-- ADDITIVE, AND BEHIND `custom/entity_custom_fields_guard`
-- --------------------------------------------------------
-- The knob resolves FALSE on both databases today (measured 2026-09-18), so on production this
-- file adds one function, one vocabulary function and one trigger that passes everything
-- through untouched. Its OFF path is a `return new` and nothing else.
--
-- REVERSIBLE: `migrations/inverse/w1_org_a_person_a_picture_and_no_private_fields_down.sql`.

set lock_timeout = '5s';

create or replace function platform.doctrine_shape_vocabulary()
returns table(law text, kind text, word text, remedy_type text, sentence text)
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  -- kind = 'person'  : REC-30. A field key that names a human being, declared as a scalar.
  -- kind = 'picture' : REC-31. A field key that names an image, declared as a scalar.
  -- kind = 'private' : REC-39. A field key or display flag that claims to be one person's own.
  select v.law, v.kind, v.word, v.remedy_type, v.sentence
    from (values
      ('REC-30','person','user',           'user_reference',
       'A person is reached through a relation, never stored as a value. Declare this field as user_reference (or entity_reference at a Person table) and the sign-in identity stays one fact in one place.'),
      ('REC-30','person','owner',          'user_reference',  null),
      ('REC-30','person','assignee',       'user_reference',  null),
      ('REC-30','person','author',         'user_reference',  null),
      ('REC-30','person','member',         'user_reference',  null),
      ('REC-30','person','contact',        'user_reference',  null),
      ('REC-30','person','person',         'user_reference',  null),
      ('REC-30','person','employee',       'user_reference',  null),
      ('REC-30','person','manager',        'user_reference',  null),
      ('REC-30','person','login',          'user_reference',  null),
      ('REC-30','person','account_id',     'user_reference',  null),
      ('REC-31','picture','avatar',        'file',
       'A picture is a File record reached through a relation, never a URL or a name in a text column. Declare this field as file: the image then has one identity, one set of permissions and one place it is deleted from.'),
      ('REC-31','picture','photo',         'file',            null),
      ('REC-31','picture','picture',       'file',            null),
      ('REC-31','picture','image',         'file',            null),
      ('REC-31','picture','logo',          'file',            null),
      ('REC-31','picture','thumbnail',     'file',            null),
      ('REC-31','picture','headshot',      'file',            null),
      ('REC-31','picture','attachment',    'file',            null),
      ('REC-39','private','my_',           null,
       'No per-person fields exist on an organization''s table: a column that belongs to one member is a column every other member can see and nobody else can use. A Person who needs private values makes their own table - REC-39''s own remedy - and this field belongs there.'),
      ('REC-39','private','personal_',     null,              null),
      ('REC-39','private','private_',      null,              null),
      ('REC-39','private','_for_me',       null,              null),
      ('REC-39','private','only_i_',       null,              null)
    ) as v(law, kind, word, remedy_type, sentence);
$function$;

comment on function platform.doctrine_shape_vocabulary() is
  'REC-30/REC-31/REC-39: the words platform._doctrine_field_shape_guard() recognises, as DATA rather than a regular expression inside a trigger. law says which rule the word serves, remedy_type names the field type that IS the right answer, and sentence carries the refusal wording for the first word of each kind (the others inherit it). Anyone refused by that guard can read this list and see exactly why.';

create or replace function platform._doctrine_field_shape_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  v_on    boolean;
  v_hit   record;
  v_key   text := lower(coalesce(new.field_key, ''));
  v_name  text := lower(coalesce(new.display_name, ''));
begin
  -- THE KNOB. False on both databases today, so this guard passes everything through until the
  -- switch step turns the custom-fields layer on.
  select coalesce(
           (platform.knob_resolve('custom', 'entity_custom_fields_guard', new.organization_id) #>> '{}')::boolean,
           false)
    into v_on;
  if not v_on then
    return new;
  end if;

  -- REC-39 FIRST, because it refuses a field of ANY type: a private column on a shared table is
  -- wrong even when its type is right.
  select * into v_hit
    from platform.doctrine_shape_vocabulary() d
   where d.kind = 'private'
     and (v_key like '%' || d.word || '%' or v_name like '%' || replace(d.word, '_', ' ') || '%')
   limit 1;
  if found then
    raise exception 'REC-39: "%" is a per-person field on an organization''s table', new.field_key
      using errcode = 'check_violation',
            hint = (select d2.sentence from platform.doctrine_shape_vocabulary() d2
                     where d2.law = 'REC-39' and d2.sentence is not null limit 1);
  end if;
  if coalesce((new.display_config ->> 'per_user')::boolean, false)
     or coalesce((new.display_config ->> 'private_to_creator')::boolean, false) then
    raise exception 'REC-39: "%" declares itself per-person (display_config per_user / private_to_creator) on an organization''s table', new.field_key
      using errcode = 'check_violation',
            hint = (select d2.sentence from platform.doctrine_shape_vocabulary() d2
                     where d2.law = 'REC-39' and d2.sentence is not null limit 1);
  end if;

  -- REC-30 and REC-31 refuse only a SCALAR declaration. A field that already IS a relation --
  -- user_reference, entity_reference or file -- is the right answer and passes untouched.
  if new.field_type in ('user_reference', 'entity_reference', 'file') then
    return new;
  end if;

  select * into v_hit
    from platform.doctrine_shape_vocabulary() d
   where d.kind in ('person', 'picture')
     and (v_key like '%' || d.word || '%' or v_name like '%' || replace(d.word, '_', ' ') || '%')
   limit 1;
  if found then
    raise exception '%: "%" is declared % but it names a %',
      v_hit.law, new.field_key, new.field_type,
      case v_hit.kind when 'person' then 'person' else 'picture' end
      using errcode = 'check_violation',
            hint = (select d2.sentence from platform.doctrine_shape_vocabulary() d2
                     where d2.law = v_hit.law and d2.sentence is not null limit 1)
                   || ' (the field type this wants is ' || v_hit.remedy_type || ')';
  end if;

  return new;
end;
$function$;

comment on function platform._doctrine_field_shape_guard() is
  'REC-30 / REC-31 / REC-39, enforced where a value gets declared. Behind custom/entity_custom_fields_guard: OFF returns NEW untouched, ON refuses a scalar field that names a person (REC-30, remedy user_reference), a scalar field that names a picture (REC-31, remedy file) and any field that belongs to one member of an organization (REC-39, remedy: the Person''s own table). A field already typed user_reference / entity_reference / file is the right answer and is never refused. The words are data: platform.doctrine_shape_vocabulary().';

create trigger _doctrine_field_shape_guard
  before insert or update on platform.custom_field_definition
  for each row execute function platform._doctrine_field_shape_guard();
