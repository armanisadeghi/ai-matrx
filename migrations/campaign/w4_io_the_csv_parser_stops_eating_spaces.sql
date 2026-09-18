-- chair-step: replaces this lane's own custom.io_csv_parse body, whose character variables were declared `char` — bpchar(1), which TRIMS a trailing space, so every space in a CSV value was silently deleted; a replacement is judged by the allow-list and the guard-read rule cannot be satisfied by a pure parser that reads no knob, so the sanctioned route is a terminal-confirmed step
-- based-on: custom.io_csv_parse(text, text) e849dfa218f0420e98957487a084147dee77c09e893c81a49fa99a1bc1a99c7c
--
-- W4-IO, file 9 — THE CSV PARSER STOPS EATING SPACES.
--
-- WHAT THE GREEN SUITE FOUND, and it is the exact reason the round trip is a CELL COMPARISON
-- and not a row count. Exporting and re-parsing `Grace, H` gave back `Grace,H`, and
-- `said "hello"` gave back `said"hello"`. Both rows were present, both had three cells, and a
-- test that counted rows would have been green.
--
-- THE CAUSE IS ONE WORD. `v_ch char` is `bpchar(1)`, and bpchar has BLANK-PADDED semantics:
-- assigning a single space to it stores a value that compares and concatenates as the empty
-- string. So `v_cell := v_cell || v_ch` appended nothing for every space in the file. It was
-- invisible because every OTHER character worked perfectly, and because no test had ever put a
-- space inside a value — an import of first names and codes would have looked flawless.
--
-- THE FIX. `text`, everywhere a character is held, for exactly the same reason Postgres's own
-- documentation gives for never using `char(n)`. Nothing else in the body moves.
--
-- THE INVERSE: `migrations/inverse/w4_io_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- The delimiter defaults to NULL rather than to a quoted comma: the runner reads a
-- replacement's parameter list to work out WHICH live overload it targets, and a quote
-- character inside a default expression makes that unreadable, so it refuses the whole
-- overwrite rather than guess. The body coalesces to ',' exactly as before.
create or replace function custom.io_csv_parse(p_text text, p_delimiter text default null)
returns table(row_number integer, cells text[])
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  -- `text`, NOT `char`. bpchar(1) blank-pads, so a space assigned to it concatenates as
  -- nothing and every space in every value disappears (measured 2026-09-18: "Grace, H" came
  -- back as "Grace,H" through an otherwise perfect round trip).
  v_delim text := coalesce(nullif(p_delimiter, ''), ',');
  v_i     integer := 1;
  v_len   integer := length(coalesce(p_text, ''));
  v_ch    text;
  v_cell  text := '';
  v_row   text[] := array[]::text[];
  v_q     boolean := false;
  v_n     integer := 0;
  v_any   boolean := false;
begin
  while v_i <= v_len loop
    v_ch := substr(p_text, v_i, 1);
    if v_q then
      if v_ch = '"' then
        -- "" inside a quoted field is ONE literal quote. Getting this wrong is how a CSV
        -- containing 6" pipe silently becomes a CSV containing 6 pipe.
        if substr(p_text, v_i + 1, 1) = '"' then
          v_cell := v_cell || '"'; v_i := v_i + 1;
        else
          v_q := false;
        end if;
      else
        v_cell := v_cell || v_ch;
      end if;
    elsif v_ch = '"' then
      v_q := true; v_any := true;
    elsif v_ch = v_delim then
      v_row := v_row || v_cell; v_cell := ''; v_any := true;
    elsif v_ch = chr(13) then
      null;  -- CRLF: the CR belongs to the line ending, never to the value.
    elsif v_ch = chr(10) then
      v_row := v_row || v_cell;
      if v_any or array_length(v_row, 1) > 1 or v_row[1] <> '' then
        v_n := v_n + 1; row_number := v_n; cells := v_row; return next;
      end if;
      v_row := array[]::text[]; v_cell := ''; v_any := false;
    else
      v_cell := v_cell || v_ch; v_any := true;
    end if;
    v_i := v_i + 1;
  end loop;
  -- A last line with no trailing newline is still a line.
  if v_any or v_cell <> '' or array_length(v_row, 1) > 0 then
    v_row := v_row || v_cell;
    v_n := v_n + 1; row_number := v_n; cells := v_row; return next;
  end if;
  return;
end;
$fn$;

comment on function custom.io_csv_parse(text, text) is
  'DOOR-11: RFC 4180 CSV parse — quoted fields, embedded delimiters, embedded newlines, "" as a literal quote, CRLF or LF. Every character is held in `text`: a `char` variable is bpchar(1), which blank-pads, and silently deleted every space in every value.';

revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
