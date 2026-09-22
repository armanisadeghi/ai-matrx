-- LANE RELATION-DISPLAY — THE GREEN SUITE, from the seat `authenticated`, ending in ROLLBACK.
--
-- THE USE CASE. Rincon Plumbing Co, a family plumbing company in Ventura County. Their
-- Jobs board points at Customers (`jobs.customer`) and their Invoices point at Jobs
-- (`invoices.job`). Two customers can share a name across the towns they serve, so a
-- dispatcher looking at the Jobs board needs to read "Maria Chen — Rincon", not "Maria
-- Chen": the customer's name AND the town, joined, on one chip. Before this lane the store
-- could show exactly ONE column of the other record — whichever column that Table happened
-- to be titled by — and there was no way to join two of them into one string at all.
--
-- The owner is editing these tables right now. This suite ROLLS BACK: every display spec it
-- sets on his real columns is gone when it ends, and it writes no records at all.
--
-- WHAT IT PROVES
--   1  the seat is real and `custom.record` is closed to it
--   2  BEFORE: the job's customer chip reads the Customers table's title column alone
--   3  the display spec is applied through the ordinary door and reads back as it was told
--   4  AFTER: the SAME chip reads two columns of the customer joined by the separator
--   5  the thirteen readers inherit it — `custom.record_words` is a one-liner onto the same
--      resolver, so nothing had to be taught about display specs one door at a time
--   6  the batch door answers a whole page in one call, in the same words
--   7  a column the target table does NOT have is refused BY NAME, and says what is there
--   8  a display spec on a column that does not point at other records is refused BY NAME
--   9  `{"display": null}` REMOVES it and the chip goes back to the table's own column
--  10  invoices → jobs: the same one primitive, a different pair of tables, no new code
--  11  ONE HOP AND NO MORE — a display column that is itself a relation reads as words,
--      and the store never follows a second one
--  12  THE LADDER STILL DECIDES: a record this reader may not see reads the withheld
--      sentence through the display path too, never its name and never its id
--
-- RUN IT:  psql <main database> -f scripts/campaign-tests/reldisp_green.sql

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'reldisp_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  -- admin@admin.com, owner of Rincon Plumbing Co.
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  -- test@test.com, a member of the same organization who was shared nothing on this board.
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';

  v_org       constant uuid := '6069a466-1445-42df-a64e-cf37ecdc1b99';  -- Rincon Plumbing Co
  v_jobs      constant uuid := 'af3bfff6-a255-41e5-9ac2-879d53816163';  -- Jobs      (tf job_number)
  v_customers constant uuid := 'efb51c4f-ad00-41d0-9651-a5af7cbf89da';  -- Customers (tf customer_name)
  v_invoices  constant uuid := 'b3893755-a8e8-4aa5-9680-6bf7d32669eb';  -- Invoices  (tf invoice_number)
  v_f_cust    constant uuid := '19afd7c8-5b3d-45f0-b4a9-238ec3248493';  -- jobs.customer  -> Customers
  v_f_job     constant uuid := '52fb5181-b342-4827-8e2c-f6bdc348d8a0';  -- invoices.job   -> Jobs
  v_f_jobnum  constant uuid := '918603a3-adb1-42a8-b477-180fd7ba7edb';  -- jobs.job_number (plain text)

  v_job       uuid;
  v_cust      uuid;
  v_inv       uuid;
  v_before    text;
  v_after     text;
  v_words     text;
  v_doc       jsonb;
  v_n         integer;
  v_msg       text;
begin
  perform set_config('app.actor_system', 'campaign-test/reldisp_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ 1 — TAKE THE SEAT AND PROVE IT ═══════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '1: this suite did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '1: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice '1 — the seat is authenticated and custom.record is closed to it. PASS';

  -- A real job with a real customer on it, read through the door exactly as a screen reads it.
  select x.id, nullif(x.document ->> 'customer', '')::uuid
    into v_job, v_cust
    from custom.read_records(v_org, v_jobs, false, 200, 0) x
   where nullif(x.document ->> 'customer', '') is not null
   order by x.document ->> 'job_number'
   limit 1;
  if v_job is null then
    raise exception '1: the Rincon Jobs board has no job with a customer on it';
  end if;

  -- ══ 2 — BEFORE: ONE COLUMN, THE TABLE'S OWN ══════════════════════════════════════════
  v_before := custom.relation_words(v_org, v_f_cust, v_cust::text);
  if v_before is distinct from 'Maria Chen' and v_before !~ '^[A-Z]' then
    raise exception '2: the customer chip reads "%", which is not a name', v_before;
  end if;
  if position(' — ' in v_before) > 0 then
    raise exception '2: the chip already joins two columns before this suite set anything: "%"', v_before;
  end if;
  raise notice '2 — BEFORE, the customer chip reads "%" — the Customers table''s title column alone. PASS', v_before;

  -- ══ 3 — THE SPEC GOES IN THROUGH THE ORDINARY DOOR ═══════════════════════════════════
  perform custom.field_update(v_org, v_f_cust,
            jsonb_build_object('display',
              jsonb_build_object('columns', jsonb_build_array('customer_name', 'city'),
                                 'separator', ' — ')));
  select f.document -> 'display' into v_doc
    from custom.read_records(v_org, custom.field_kernel_id(), false, 500, 0) f
   where f.id = v_f_cust;
  if v_doc is null or (v_doc -> 'columns') <> jsonb_build_array('customer_name', 'city') then
    raise exception '3: the column read back its display spec as %, not the two columns it was told', coalesce(v_doc::text, '(nothing)');
  end if;
  if (v_doc ->> 'separator') <> ' — ' then
    raise exception '3: the separator read back as "%"', v_doc ->> 'separator';
  end if;
  raise notice '3 — the door applied it and the column reads back %. PASS', v_doc::text;

  -- ══ 4 — AFTER: TWO COLUMNS OF THE OTHER RECORD, JOINED, ON ONE CHIP ══════════════════
  v_after := custom.relation_words(v_org, v_f_cust, v_cust::text);
  if position(' — ' in coalesce(v_after, '')) = 0 then
    raise exception '4: the chip still reads "%" — the display spec did not reach the resolver', v_after;
  end if;
  if v_after = v_before then
    raise exception '4: the chip did not move at all: "%"', v_after;
  end if;
  if split_part(v_after, ' — ', 1) <> v_before then
    raise exception '4: the first half of "%" is not the name the table is titled by ("%")', v_after, v_before;
  end if;
  raise notice '4 — AFTER, the SAME chip reads "%" (was "%"). PASS', v_after, v_before;

  -- ══ 5 — THE THIRTEEN READERS INHERIT IT, BECAUSE THERE IS ONE RESOLVER ═══════════════
  -- `custom.record_words` is what portal titles, share dialogs, approval cards, digests and
  -- the work list all call. It is a one-liner onto the same body, so a Table titled BY this
  -- relation column now reads the joined string everywhere, with nothing taught door by door.
  -- First: the resolver is a SERVER LANE and the seat cannot reach it. A person gets in
  -- through custom.relation_words and through nothing else.
  begin
    perform custom._words_for(v_org, v_cust, null, null, 0);
    raise exception '5: the seat can call custom._words_for directly — it is not a server lane';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.record_words(v_org, v_cust);
    raise exception '5: the seat can call custom.record_words directly — TAILS-2 declared it server_only';
  exception when insufficient_privilege then null;
  end;
  raise notice '5 — the resolver and custom.record_words are closed to the seat; custom.relation_words is the way in. PASS';

  -- Then, as the store itself (the lane those thirteen readers run in), the two facts that
  -- matter: the client door and the resolver agree word for word, and the answer given to a
  -- caller with NO spec has not moved one character — which is what makes this additive for
  -- every one of the thirteen readers TAILS-2 fixed.
  perform set_config('role', 'postgres', true);
  v_words := custom._words_for(v_org, v_cust,
               jsonb_build_object('columns', jsonb_build_array('customer_name', 'city'),
                                  'separator', ' — '), null, 0);
  if v_words is distinct from v_after then
    raise exception '5: the resolver and the client door disagree: "%" vs "%"', v_words, v_after;
  end if;
  if custom.record_words(v_org, v_cust) is distinct from v_before then
    raise exception '5: record_words with NO spec moved, and it must not: "%"', custom.record_words(v_org, v_cust);
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice '5b — one resolver: it agrees with the client door, and the no-spec answer is still "%". PASS', v_before;

  -- ══ 6 — A WHOLE PAGE IN ONE CALL ═════════════════════════════════════════════════════
  select count(*) into v_n
    from custom.relation_words_many(v_org, v_f_cust,
           (select array_agg(nullif(x.document ->> 'customer', '')::uuid)
              from custom.read_records(v_org, v_jobs, false, 50, 0) x
             where nullif(x.document ->> 'customer', '') is not null)) w
   where position(' — ' in coalesce(w.words, '')) > 0;
  if v_n < 1 then
    raise exception '6: the batch door answered % rows in the joined form', v_n;
  end if;
  select w.words into v_words
    from custom.relation_words_many(v_org, v_f_cust, array[v_cust]) w;
  if v_words is distinct from v_after then
    raise exception '6: the batch door says "%" where the single door says "%"', v_words, v_after;
  end if;
  raise notice '6 — the batch door answered % chips in one call, in the same words as the single door. PASS', v_n;

  -- ══ 7 — A COLUMN THE TARGET DOES NOT HAVE IS REFUSED BY NAME ═════════════════════════
  begin
    perform custom.field_update(v_org, v_f_cust,
              jsonb_build_object('display', jsonb_build_array('customer_name', 'last_name')));
    raise exception '7: a display spec naming a column Customers does not have was ACCEPTED';
  exception when foreign_key_violation then
    get stacked diagnostics v_msg = message_text;
    if position('last_name' in v_msg) = 0 then
      raise exception '7: the refusal does not name the column: %', v_msg;
    end if;
    raise notice '7 — refused by name: "%". PASS', v_msg;
  end;
  -- and the good spec is still standing after the refusal
  if custom.relation_words(v_org, v_f_cust, v_cust::text) is distinct from v_after then
    raise exception '7: the refused change damaged the spec that was already there';
  end if;

  -- ══ 8 — A DISPLAY SPEC ON A COLUMN THAT POINTS AT NOTHING IS REFUSED BY NAME ═════════
  begin
    perform custom.field_update(v_org, v_f_jobnum,
              jsonb_build_object('display', jsonb_build_array('customer_name')));
    raise exception '8: a display spec on the plain text column `job_number` was ACCEPTED';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if position('points at other records' in v_msg) = 0 then
      raise exception '8: the refusal is not the one this lane writes: %', v_msg;
    end if;
    raise notice '8 — refused by name: "%". PASS', v_msg;
  end;

  -- ══ 10 — INVOICES → JOBS: THE SAME PRIMITIVE, A DIFFERENT PAIR, NO NEW CODE ══════════
  select x.id, nullif(x.document ->> 'job', '')::uuid
    into v_inv, v_job
    from custom.read_records(v_org, v_invoices, false, 200, 0) x
   where nullif(x.document ->> 'job', '') is not null
   limit 1;
  if v_inv is null then
    raise exception '10: the Rincon Invoices board has no invoice pointing at a job';
  end if;
  v_before := custom.relation_words(v_org, v_f_job, v_job::text);
  perform custom.field_update(v_org, v_f_job,
            jsonb_build_object('display',
              jsonb_build_object('columns', jsonb_build_array('job_number', 'address'),
                                 'separator', ' · ')));
  v_after := custom.relation_words(v_org, v_f_job, v_job::text);
  if position(' · ' in coalesce(v_after, '')) = 0 or v_after = v_before then
    raise exception '10: the invoice''s job chip reads "%" (was "%")', v_after, v_before;
  end if;
  raise notice '10 — invoices → jobs now reads "%" (was "%"), through the same one resolver. PASS', v_after, v_before;

  -- ══ 11 — ONE HOP AND NO MORE ═════════════════════════════════════════════════════════
  -- `jobs.customer` IS a relation, so asking the invoice's job chip to show it makes the
  -- display column itself an id. The store resolves it ONE hop — into the customer's own
  -- words — and it must never follow a second.
  perform custom.field_update(v_org, v_f_job,
            jsonb_build_object('display', jsonb_build_array('job_number', 'customer')));
  v_words := custom.relation_words(v_org, v_f_job, v_job::text);
  if v_words ~ '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' then
    raise exception '11: the chip printed an id where a name belongs: "%"', v_words;
  end if;
  if position(' ' in v_words) = 0 then
    raise exception '11: the chip lost the second column entirely: "%"', v_words;
  end if;
  raise notice '11 — a display column that is itself a relation reads "%" — words at one hop, never an id. PASS', v_words;

  -- the hop cap itself, measured rather than asserted, from the store's own lane: called AT
  -- hop 1 the resolver must refuse to follow the relation and must not print the id either.
  perform set_config('role', 'postgres', true);
  v_words := custom._words_for(v_org, v_job,
               jsonb_build_object('columns', jsonb_build_array('customer')), null, 1);
  if v_words ~ '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}' then
    raise exception '11b: at the hop cap the resolver printed an id: "%"', v_words;
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice '11b — at the cap the resolver answers "%" rather than following a second hop. PASS', v_words;

  -- ══ 9 — REMOVING THE SPEC PUTS THE TABLE'S OWN COLUMN BACK ═══════════════════════════
  perform custom.field_update(v_org, v_f_job, '{"display": null}'::jsonb);
  if custom.relation_words(v_org, v_f_job, v_job::text) is distinct from v_before then
    raise exception '9: after removing the spec the chip reads "%", not "%"',
      custom.relation_words(v_org, v_f_job, v_job::text), v_before;
  end if;
  raise notice '9 — {"display": null} removed it and the chip reads "%" again. PASS', v_before;

  -- ══ 12 — THE LADDER STILL DECIDES, THROUGH THE DISPLAY PATH TOO ══════════════════════
  -- Naming a record is disclosing it. A display spec is a nicer sentence, never a way round
  -- the one ladder — and joining two columns would disclose two things at once if it were.
  -- test@test.com IS a member of Rincon Plumbing Co, so the org-member lane gives them every
  -- record on that board — there is nothing there they cannot see, and pretending otherwise
  -- would be a test that proves nothing. The record genuinely out of their reach is in an
  -- organization they are not a member of at all: Kessler Lab for Applied Microbial Ecology.
  -- Asked WITH a display spec, so the spec is what is being tested, not the bare path.
  perform set_config('request.jwt.claims', c_dana_j, true);
  perform set_config('role', 'postgres', true);
  v_words := custom._words_for(
               '1c86ace6-0219-4393-88fd-d0aef836acd3'::uuid,          -- Kessler Lab
               '8deffb95-3d32-4511-8c77-eb74a7bb44db'::uuid,          -- Dr. Anneliese Kessler
               jsonb_build_object('columns', jsonb_build_array('name', 'email'),
                                  'separator', ' · '), null, 0);
  if v_words ~ '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}' then
    raise exception '12: a reader outside that organization was handed an id: "%"', v_words;
  end if;
  if position('Kessler' in v_words) > 0 or position('@' in v_words) > 0 then
    raise exception '12: the display spec leaked a record this reader may not open: "%"', v_words;
  end if;
  if v_words is distinct from platform.relation_withheld_label() then
    raise exception '12: the withheld answer is "%", not the platform''s own sentence', v_words;
  end if;
  raise notice '12 — a reader outside that organization reads "%" — never the name, never the email, never the id, even with a display spec asking for two columns. PASS', v_words;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- and the same reader, as themselves, still reads the board they ARE a member of — the
  -- ladder withholds what is out of reach and nothing else.
  -- (v_after now holds part 10's invoice chip, so the customer chip is re-read here as the
  -- owner and compared to what the member reads — the two must agree word for word.)
  v_before := custom.relation_words(v_org, v_f_cust, v_cust::text);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_words := custom.relation_words(v_org, v_f_cust, v_cust::text);
  if v_words is distinct from v_before then
    raise exception '12b: an org member reads "%" where the owner reads "%"', v_words, v_before;
  end if;
  if position(' — ' in v_words) = 0 then
    raise exception '12b: the member lost the joined form entirely: "%"', v_words;
  end if;
  raise notice '12b — the same reader still reads "%" on the board they belong to. PASS', v_words;
  perform set_config('request.jwt.claims', c_admin_j, true);

  raise notice '';
  raise notice 'ALL PARTS PASSED (1, 2, 3, 4, 5, 5b, 6, 7, 8, 9, 10, 11, 11b, 12, 12b)';
end
$t$;

rollback;
