-- chair-step: RC-A3 inverse of rca3_block_accepts_its_kind_marker — restores the validator body that refused `__kind` on the nested block hint (the rca3_text_anchor_and_annotates body).
-- based-on: platform.text_anchor_problem(jsonb) 57a65732928ee058650b45eba5fb44659fceaaef4004ce13becaa59fb6e15462

create or replace function platform.text_anchor_problem(p jsonb)
returns text
language plpgsql
immutable
parallel safe
set search_path to 'pg_catalog'
as $fn$
declare
  v_key text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return 'a text_anchor must be a JSON object';
  end if;
  if p ->> '__kind' is distinct from 'text_anchor' then
    return 'a text_anchor carries "__kind": "text_anchor"';
  end if;
  for v_key in select jsonb_object_keys(p) loop
    if v_key not in ('__kind', 'content_version', 'start', 'end', 'exact', 'prefix', 'suffix', 'block') then
      return format('a text_anchor has no field "%s"', v_key);
    end if;
  end loop;
  if jsonb_typeof(p -> 'content_version') is distinct from 'number'
     or (p ->> 'content_version') !~ '^[0-9]+$' or (p ->> 'content_version')::bigint < 1 then
    return 'content_version must be the whole-number content version (>= 1) the offsets were captured against';
  end if;
  if jsonb_typeof(p -> 'start') is distinct from 'number' or (p ->> 'start') !~ '^[0-9]+$'
     or jsonb_typeof(p -> 'end') is distinct from 'number' or (p ->> 'end') !~ '^[0-9]+$' then
    return 'start and end must be whole-number Unicode code-point offsets';
  end if;
  if (p ->> 'end')::bigint <= (p ->> 'start')::bigint then
    return 'end must be greater than start (a whole-document link carries no anchor)';
  end if;
  if jsonb_typeof(p -> 'exact') is distinct from 'string' or p ->> 'exact' = '' then
    return 'exact must be the selected text';
  end if;
  if char_length(p ->> 'exact') <> (p ->> 'end')::bigint - (p ->> 'start')::bigint then
    return format('end - start (%s) must equal the code-point length of exact (%s); offsets are Unicode code points, never UTF-16 indexes',
                  (p ->> 'end')::bigint - (p ->> 'start')::bigint, char_length(p ->> 'exact'));
  end if;
  if char_length(p ->> 'exact') > 20000 then
    return 'exact is longer than 20,000 code points';
  end if;
  if p ? 'prefix' and (jsonb_typeof(p -> 'prefix') <> 'string' or char_length(p ->> 'prefix') > 64) then
    return 'prefix must be at most 64 code points of text';
  end if;
  if p ? 'suffix' and (jsonb_typeof(p -> 'suffix') <> 'string' or char_length(p ->> 'suffix') > 64) then
    return 'suffix must be at most 64 code points of text';
  end if;
  if p ? 'block' and jsonb_typeof(p -> 'block') <> 'null' then
    if jsonb_typeof(p -> 'block') <> 'object'
       or exists (select 1 from jsonb_object_keys(p -> 'block') k where k not in ('index', 'hash'))
       or jsonb_typeof(p -> 'block' -> 'index') is distinct from 'number'
       or (p -> 'block' ->> 'index') !~ '^[0-9]+$'
       or jsonb_typeof(p -> 'block' -> 'hash') is distinct from 'string'
       or char_length(p -> 'block' ->> 'hash') not between 1 and 128 then
      return 'block must be {"index": <whole number>, "hash": "<1-128 characters>"}';
    end if;
  end if;
  return null;
end;
$fn$;
