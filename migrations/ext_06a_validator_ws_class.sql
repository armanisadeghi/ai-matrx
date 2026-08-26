-- ext_06a_validator_ws_class.sql
-- HRB-010 / C6 -- the NORMATIVE whitespace class and the two format regexes.
-- Extracted into their own pinned functions so the class is never re-typed
-- (the escapes are load-bearing and do not survive being retyped by hand).
--
-- CMS ruling (d), inherited verbatim: NEVER use \s in a shared format regex.
-- JS counts U+FEFF as whitespace and Python does not; Python counts
-- U+001C-U+001F and U+0085 and JS does not. This explicit union IS the contract.
-- CMS ruling (c): anchor with a form that does not also match before a trailing
-- newline. Postgres ARE's `$` matches only at end-of-string unless the `n` flag
-- is set, so `^...$` here is exactly Python's `^...\Z`.

CREATE OR REPLACE FUNCTION platform.cf_ws_class()
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT E'\\t\\n\\u000b\\f\\r \\u001c-\\u001f\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff' $$;

CREATE OR REPLACE FUNCTION platform.cf_re_email()
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT '^[^@' || platform.cf_ws_class() || ']+@[^@' || platform.cf_ws_class() || ']+\.[^@' || platform.cf_ws_class() || ']+$' $$;

CREATE OR REPLACE FUNCTION platform.cf_re_url()
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT '^https?://[^' || platform.cf_ws_class() || ']+$' $$;
