-- org_abbreviation_no_me_override.sql
--
-- THE OVERRIDE
-- ------------
-- `iam.normalize_organization_abbreviation()` ran on every write to
-- iam.organizations and did this FIRST:
--
--     if coalesce(new.is_personal, false) then
--       new.abbreviation := 'ME';
--
-- Unconditionally. Not "when blank" — ALWAYS, discarding whatever the row or
-- the user supplied. `iam.derive_organization_abbreviation(name, is_personal)`
-- carried the same early return. So all 384 personal organizations in the
-- database literally store the string 'ME' in their `abbreviation` column.
--
-- 'ME' is a VIEWER-RELATIVE word saved as an ABSOLUTE fact. It is true only for
-- the row's owner, and the platform deliberately supports belonging to another
-- person's personal organization — so a user who does sees two organizations
-- wearing the identical 'ME' chip with no way to tell them apart. That is the
-- whole of the "why am I seeing two personal organizations" report, 2026-09-11.
--
-- Arman's ruling, same day: "annihilate the feature that renames an org and
-- gives it some override name by calling it my personal or something like that.
-- So just find any place where we're hard coding a replacement name and fix it
-- so that we always use the real name and this issue will never come up."
--
-- THE FIX
-- -------
-- 1. The deriver abbreviates from the NAME, for every organization. Its
--    `p_is_personal` parameter is kept only so `public.org_create` and any other
--    caller keeps compiling, and is now ignored — the same shape the sibling fix
--    to `formatOrgDisplayName` took on the client this morning. DD-045 P6 drops
--    the column and this parameter goes with it.
-- 2. The trigger no longer forces anything. Blank → derive from the name;
--    otherwise keep what the writer supplied, uppercased and trimmed. A personal
--    organization is now exactly as renameable as any other.
-- 3. Drop the CHECK constraint `organizations_personal_abbreviation`, which
--    spelled the override a THIRD time as `is_personal IS NOT TRUE OR
--    abbreviation = 'ME'` — a database-level refusal to let a personal
--    organization carry its own initials. `organizations_abbreviation_format`
--    (2-3 uppercase letters) stays; that one is a real format rule.
-- 4. Backfill every row still carrying the forced 'ME' so existing accounts see
--    real initials without waiting for a write to touch the row.
--
-- Idempotent: re-running re-derives the same values and the guards below hold.

ALTER TABLE iam.organizations
  DROP CONSTRAINT IF EXISTS organizations_personal_abbreviation;

CREATE OR REPLACE FUNCTION iam.derive_organization_abbreviation(
  p_name text,
  p_is_personal boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
declare
  v_word text;
  v_words text[] := '{}'::text[];
  v_result text := '';
begin
  -- p_is_personal is IGNORED. Every organization abbreviates from its own name;
  -- there is no 'ME' override. Parameter retained for caller compatibility only.
  foreach v_word in array pg_catalog.regexp_split_to_array(
    pg_catalog.upper(coalesce(p_name, '')),
    '[^A-Z]+'
  )
  loop
    if v_word = ''
       or v_word = any (array[
         'A', 'AN', 'AND', 'AT', 'BY', 'FOR', 'OF', 'THE',
         'CO', 'COMPANY', 'CORP', 'CORPORATION', 'INC', 'INCORPORATED',
         'LLC', 'LLP', 'LTD', 'LIMITED', 'LP', 'PLC'
       ]::text[]) then
      continue;
    end if;
    v_words := pg_catalog.array_append(v_words, v_word);
  end loop;

  if coalesce(pg_catalog.array_length(v_words, 1), 0) = 0 then
    return 'ORG';
  end if;

  if pg_catalog.array_length(v_words, 1) = 1 then
    v_result := pg_catalog.left(v_words[1], 3);
  else
    for v_word in
      select word
      from pg_catalog.unnest(v_words) as word
    loop
      if pg_catalog.length(v_result) >= 3 then
        exit;
      end if;

      -- Preserve a short leading initialism: AI Matrx -> AIM.
      if v_result = '' and pg_catalog.length(v_word) = 2 then
        v_result := v_result || v_word;
      else
        v_result := v_result || pg_catalog.left(v_word, 1);
      end if;
    end loop;
  end if;

  if pg_catalog.length(v_result) < 2 then
    v_result := pg_catalog.rpad(v_result, 2, 'X');
  end if;

  return pg_catalog.left(v_result, 3);
end;
$function$;

CREATE OR REPLACE FUNCTION iam.normalize_organization_abbreviation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
begin
  -- No personal-organization branch. Blank derives from the name; anything the
  -- writer supplied is theirs to keep.
  if new.abbreviation is null or pg_catalog.btrim(new.abbreviation) = '' then
    new.abbreviation := iam.derive_organization_abbreviation(new.name);
  else
    new.abbreviation := pg_catalog.upper(pg_catalog.btrim(new.abbreviation));
  end if;

  return new;
end;
$function$;

-- Backfill the rows the override already stamped.
UPDATE iam.organizations
   SET abbreviation = iam.derive_organization_abbreviation(name)
 WHERE is_personal IS TRUE
   AND abbreviation = 'ME';

DO $verify$
DECLARE
  v_left int;
  v_probe text;
BEGIN
  -- No personal organization may still be carrying the forced constant. (A
  -- non-personal org legitimately abbreviating to 'ME' — "Matrx Edge" — is not
  -- in scope and is left alone.)
  SELECT count(*) INTO v_left
    FROM iam.organizations
   WHERE is_personal IS TRUE AND abbreviation = 'ME';
  IF v_left > 0 THEN
    RAISE EXCEPTION 'org abbreviation backfill left % personal organization(s) on the forced ME', v_left;
  END IF;

  -- The deriver must ignore the personal flag in BOTH directions.
  -- "Arman's Org" -> words ARMAN, S, ORG -> A + S + O. The point of the probe is
  -- that passing is_personal=true changes NOTHING; the value itself is whatever
  -- the name gives.
  IF iam.derive_organization_abbreviation('Arman''s Org', true) <> 'ASO' THEN
    RAISE EXCEPTION 'deriver still overrides on is_personal=true: got %',
      iam.derive_organization_abbreviation('Arman''s Org', true);
  END IF;
  IF iam.derive_organization_abbreviation('AI Matrx', false) <> 'AIM' THEN
    RAISE EXCEPTION 'deriver regressed on the initialism case: got %',
      iam.derive_organization_abbreviation('AI Matrx', false);
  END IF;

  -- The trigger must no longer force a personal row's abbreviation.
  SELECT abbreviation INTO v_probe
    FROM iam.organizations
   WHERE is_personal IS TRUE AND name = 'admin''s Workspace'
   LIMIT 1;
  IF v_probe IS NOT NULL AND v_probe = 'ME' THEN
    RAISE EXCEPTION 'a personal organization is still stamped ME after backfill';
  END IF;

  -- And the CHECK that refused a real abbreviation must be gone.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'iam.organizations'::regclass
       AND conname = 'organizations_personal_abbreviation'
  ) THEN
    RAISE EXCEPTION 'organizations_personal_abbreviation still present — the ME override survives at the constraint layer';
  END IF;

  RAISE NOTICE 'org abbreviation override removed; personal organizations now abbreviate from their own names';
END
$verify$;
