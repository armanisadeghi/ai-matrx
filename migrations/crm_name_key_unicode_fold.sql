-- crm_name_key_unicode_fold.sql — make crm.name_key() agree with its Python twin
-- on accented names, and re-stamp every row that disagrees.
--
-- THE DEFECT (found live 2026-08-14 while promoting research experts): the DB
-- function folds on `[^a-z0-9]+`, which treats every accented character as
-- punctuation. "José Fábio Lana" became "jos f bio lana"; the server-side party
-- resolver's canonicalizer (aidream services/crm/canonicalize.py::party_name_key)
-- NFKD-folds first and produced "jose fabio lana". Two authorities, two answers,
-- so the resolver's name lookup missed a row that WAS there and created a second
-- José on every run — the duplicate factory the whole resolver exists to prevent.
-- Reproduced end to end: promoting the same expert twice minted two parties.
--
-- THE FIX: decompose (NFKD) and drop the combining marks BEFORE the existing
-- pipeline. "José" and "Jose" are the same identity — which is the behaviour the
-- Python side already had, and the better semantics for identity matching either
-- way. Pure-ASCII names are byte-for-byte unchanged, so no existing English row
-- moves. `normalize()` is immutable in PG13+, so the function stays IMMUTABLE and
-- indexable.
--
-- Idempotent; safe to re-run. Contract: features/crm/FEATURE.md.

create or replace function crm.name_key(p_name text)
returns text language sql immutable strict set search_path to 'pg_catalog' as $fn$
  select nullif(btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          -- NFKD-decompose, then strip the combining diacritical block — the
          -- byte-for-byte twin of Python's unicodedata.normalize("NFKD", …)
          -- + "drop combining" in aidream services/crm/canonicalize.py.
          regexp_replace(
            normalize(lower(p_name), NFKD),
            '[' || U&'\0300' || '-' || U&'\036F' || ']', '', 'g'),
          '[^a-z0-9]+', ' ', 'g'),
        '\s+(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|gmbh|plc|llp|pllc)\s*$', '', 'g'),
      '\s+(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|gmbh|plc|llp|pllc)\s*$', '', 'g'),
    '\s+', ' ', 'g')), '');
$fn$;

-- Re-stamp the rows the old spelling got wrong. Only accented names move.
update crm.party set name_key = crm.name_key(display_name)
 where name_key is distinct from crm.name_key(display_name);
