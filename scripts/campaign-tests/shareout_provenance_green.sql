-- SHARE-OUT / item 2 — THE PROVENANCE FOOTNOTE, PROVED FROM A PERSON'S SEAT.
--
-- THE REAL USE CASE. Ironclad Mobile Mechanic is a one-van mobile mechanic who bills at the
-- kerbside: every invoice carries what the labour came to and what the parts came to, and
-- the TOTAL is never typed — the system works it out as LABOUR + PARTS. When the customer
-- queries a $238 bill, the owner opens the invoice and the record says, in one line, that
-- the total was worked out for her and when. Until today the record could not say that
-- about any value, on any record, in any organization on the platform.
--
-- 🚨 THE SEAT. Everything that asserts runs as `authenticated` with admin@admin.com's own
-- claims — the organization's owner. Nothing below runs as the role that owns the store,
-- because a door that answers the operator proves nothing about a person.
--
-- THE CLAUSES
--   1  the door is client-callable at all (it held no grant until SHARE-OUT)
--   2  the footnote returns the worked-out TOTAL of a real invoice, from her seat
--   3  the value it reports is LABOUR + PARTS, arithmetic included
--   4  a person with no membership of Ironclad is refused at the organization wall
--   5  a record of ANOTHER organization reads as absent through this door
--
-- The red twin is `shareout_provenance_red.sql`: the same five clauses against the body
-- that reads only the `_computed` block, which is carried by zero of the store's records.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'shareout_provenance_green.sql'
\set requires 'exec:custom.applicable_fields'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

do $green$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_org     constant uuid := '0a751390-558e-4775-ba0e-3891bdf82d45';   -- Ironclad Mobile Mechanic
  c_inv_tbl constant uuid := 'ffbddf5c-e5d8-417c-b82b-eff823f55fc4';   -- its Invoices table
  v_total   uuid;
  v_labor   uuid;
  v_parts   uuid;
  v_inv     uuid;
  v_labor_v numeric;
  v_parts_v numeric;
  v_rows    integer;
  v_val     numeric;
  v_other   uuid;
  v_msg     text;
begin
  perform set_config('app.actor_system', 'campaign.shareout.provenance.green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'SHARE-OUT provenance: the seat was not taken — current_user is %', current_user;
  end if;

  select f.id into v_total from custom.applicable_fields(c_org, c_inv_tbl, null) f where f.data ->> 'key' = 'total_amount';
  select f.id into v_labor from custom.applicable_fields(c_org, c_inv_tbl, null) f where f.data ->> 'key' = 'labor_amount';
  select f.id into v_parts from custom.applicable_fields(c_org, c_inv_tbl, null) f where f.data ->> 'key' = 'parts_amount';
  if v_total is null or v_labor is null or v_parts is null then
    raise exception 'SHARE-OUT provenance: Ironclad''s Invoices table is missing one of total/labor/parts';
  end if;

  -- THE MECHANIC'S OWN SET-UP, made through the field door from her seat: the total is a
  -- write-time formula over the two amounts. REC-17 — by field ID, never by name.
  perform custom.field_update(c_org, v_total, jsonb_build_object(
    'type', 'formula', 'parity_type', 'formula', 'source', 'formula',
    'label', 'Total', 'depends_on', jsonb_build_array(v_labor, v_parts),
    'expr', jsonb_build_object(
      'op', 'add',
      'args', jsonb_build_array(jsonb_build_object('field', v_labor),
                                jsonb_build_object('field', v_parts)))));

  -- NOTE, measured rather than assumed: `custom.field_update` produces
  -- `compute_on: "read"` — the store's own default for a formula — so Total is worked out
  -- on every read and is never stamped into `_derived`. That is the ORDINARY case on this
  -- platform, and it is the case the footnote has to answer.

  select rr.id,
         (rr.document ->> 'labor_amount')::numeric,
         (rr.document ->> 'parts_amount')::numeric
    into v_inv, v_labor_v, v_parts_v
    from custom.read_records(c_org, c_inv_tbl, false, 500, 0) rr
   where (rr.document ->> 'labor_amount') is not null
     and (rr.document ->> 'parts_amount') is not null
   order by rr.document ->> 'invoice_number'
   limit 1;
  if v_inv is null then
    raise exception 'CLAUSE 2 FAILED: no invoice came back through the read door';
  end if;

  -- CLAUSE 1 + 2 — the door answers her, and it has something to say.
  select count(*) into v_rows from custom.computed_provenance(c_org, v_inv);
  if v_rows < 1 then
    raise exception 'CLAUSE 2 FAILED: the footnote returned % rows for invoice %', v_rows, v_inv;
  end if;

  -- CLAUSE 3 — and what it says is the arithmetic.
  select (p.value #>> '{}')::numeric into v_val
    from custom.computed_provenance(c_org, v_inv) p where p.field_key = 'total_amount';
  if v_val is distinct from (v_labor_v + v_parts_v) then
    raise exception 'CLAUSE 3 FAILED: the footnote says total = %, labour % + parts % = %',
      v_val, v_labor_v, v_parts_v, v_labor_v + v_parts_v;
  end if;
  raise notice 'CLAUSE 1-3 OK: % footnote row(s); Total was worked out as % = % + %',
    v_rows, v_val, v_labor_v, v_parts_v;

  -- CLAUSE 4 — a person who is not in Ironclad is refused at the organization wall.
  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    perform count(*) from custom.computed_provenance(c_org, v_inv);
    raise exception 'CLAUSE 4 FAILED: a non-member read Ironclad''s provenance';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    raise notice 'CLAUSE 4 OK: %', v_msg;
  end;

  -- CLAUSE 5 — a record of another organization reads as absent, not as a different refusal.
  perform set_config('request.jwt.claims', c_admin_j, true);
  -- A record that is NOT in Ironclad: Rincon Plumbing's own Jobs table has 40 of them.
  select rr.id into v_other
    from custom.read_records('6069a466-1445-42df-a64e-cf37ecdc1b99'::uuid,
                             'af3bfff6-a255-41e5-9ac2-879d53816163'::uuid, false, 1, 0) rr;
  if v_other is null then
    raise exception 'CLAUSE 5 SETUP FAILED: no record of another organization to ask about';
  end if;
  select count(*) into v_rows from custom.computed_provenance(c_org, v_other);
  if v_rows <> 0 then
    raise exception 'CLAUSE 5 FAILED: a record of another organization returned % footnote rows', v_rows;
  end if;
  raise notice 'CLAUSE 5 OK: a record of another organization reads as absent through this door';

  raise notice 'SHARE-OUT / item 2 GREEN: all five clauses passed from admin@admin.com''s seat.';
end;
$green$;
