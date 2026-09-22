-- lane: DEAD-KEYS
-- chair-step: the body is one UPDATE to one text column of one registry row, which the additive
-- allow-list does not enumerate. It withdraws nothing, grants nothing and drops nothing; it only
-- replaces the sentence the generator prints in its pending-withdrawal notice.
-- DD-249 / R12 — the one `anon_lane_pending_withdrawal_reason` row stops saying "undecided".
--
-- ANON-LANES wrote that row on 2026-09-22 to hand `platform.feature_knob` on rather than guess, and
-- it did the right thing. This lane measured it. The row now carries the RULING and the file that
-- executes it, so the generator's notice on every future generation tells the next person what was
-- decided and where the executable step is, instead of telling them nobody knows.
--
-- The ruling, in one line: there is no signed-out reader — DD-230's "194 anonymous 200s" were CORS
-- preflights, and the one tokenless GET in 24 h is a session-hydration race whose success caches a
-- ONE-ROW knob catalogue and makes every other knob report missing for 60 s.
--
-- ADDITIVE: one UPDATE to one text column of one row in our own registry. It withdraws nothing,
-- grants nothing, and leaves the lane exactly as live as it was.
-- Inverse: migrations/inverse/deadkeys_the_undecided_knob_row_records_its_ruling.inverse.sql

set local lock_timeout = '5s';

update platform.entity_types
   set anon_lane_pending_withdrawal_reason =
     'RULED, NOT UNDECIDED (lane DEAD-KEYS, 2026-09-22). platform.feature_knob has NO signed-out reader. DD-230''s "194 anonymous 200s in 24 h" counted CORS preflights: re-measured over the same window split by request.method / apikey prefix / auth_user, the table saw 2432 authenticated GETs, 828 OPTIONS preflights with no apikey and no user, and exactly ONE tokenless GET -- from www.aimatrx.com, supabase-ssr createBrowserClient, byte-identical query to the authenticated ones, i.e. a session-hydration race on an authenticated route. A four-repository code census agrees: every .from("feature_knob") site is lib/knobs/featureKnobs.ts or an admin service, every importer sits under (core)/(admin), nothing in app/(public)/** reads a knob, and toolKnobGating returns early with no organizationId so the single public_read row has no anonymous consumer. The lane also POISONS A CACHE: feature_knob_read_anon admits the 1 of 953 rows with public_read, loadAll treats the catalogue as complete and caches it 60 s, and readKnob then throws "Missing feature knob" for everything else in that tab. The executable withdrawal is migrations/campaign/deadkeys_feature_knob_has_no_signed_out_reader.sql -- written, judged and REHEARSED on the branch (up then inverse, both green), NOT applied: it drops a policy and revokes a grant in the protected platform schema, which is a chair step, not a lane''s call.'
 where schema_name = 'platform' and table_name = 'feature_knob';

do $$
declare v_len int;
begin
  select length(anon_lane_pending_withdrawal_reason) into v_len
    from platform.entity_types where schema_name='platform' and table_name='feature_knob';
  if coalesce(v_len, 0) < 40 then
    raise exception 'DEAD-KEYS: the pending-withdrawal reason did not land (length %).', v_len;
  end if;
  raise notice 'DEAD-KEYS: platform.feature_knob''s pending-withdrawal row now carries the ruling (% chars).', v_len;
end $$;
