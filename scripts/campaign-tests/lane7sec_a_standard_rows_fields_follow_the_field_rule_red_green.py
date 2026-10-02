"""LANE7-SEC guard: the field rule on a standard row, as the real seats and the real server writers, on the clone.

    python3 lane7sec_a_standard_rows_fields_follow_the_field_rule_red_green.py <mode> [--plant <case>]

Every case below states what must be true once the rule is right. Modes choose the database
state, and the SAME expectations are read in every mode, so red and green are one list:

  pre      the store as it was before lane 7 SEC (both SEC files' inverses applied in the txn):
           the 11 original defects show as FAIL.
  r0       the store after the first SEC file only (round 1's inverse applied in the txn):
           the round-1 regressions (form profile, `_` keys, the client's agent/system header)
           show as FAIL.
  current  the database as it is (after the round-1 file is applied): all PASS.
  r1       the round-1 file applied inside the txn on top of whatever is there: all PASS.

  --plant <case>  (with r1/current) breaks exactly what a legitimate case depends on, and exactly
           the cases named for that plant — no others — must go red:
             opentable  the closed-table knob also names `note`        -> opentable
             freeform   the closed-table knob also names the profile   -> freeform (client cases)
             mover      the mover skips its declare step               -> mover
             r0guard    the guard that refused every writer (lane7sec_a's body) is put back
                        -> servernotice, legacy, opentable, freeform, prefix, header

The rule (CHAIR-SEC-R1): an undeclared key is refused only for a CLIENT writer on a table the
knob custom/closed_custom_field_tables names (default: party); the platform's own writers keep
the key and a NOTICE names it; a key the row already carries stays editable; only `_values`,
`_actor` and `_on_behalf_of` are the store's own keys.

Everything runs in ONE transaction that is rolled back. People are seated as PostgREST seats
them (role authenticated + request.jwt.claims [+ request.headers]); the server job and the
mover are seated as the service role with no person. Clone only (asserted by its ref).
"""
import json, sys
from pathlib import Path
import psycopg

ARGS = sys.argv[1:]
MODE = ARGS[0]
PLANT = ARGS[ARGS.index('--plant') + 1] if '--plant' in ARGS else None
REPO = Path(__file__).resolve().parents[2]
CAMPAIGN = REPO / 'migrations/campaign'
INVERSE = REPO / 'migrations/inverse'
SEC = CAMPAIGN / 'lane7sec_a_standard_rows_fields_follow_the_field_rule.sql'
R1 = CAMPAIGN / 'lane7sec_r1_every_writer_follows_the_field_rule.sql'
SEC_DOWN = INVERSE / 'lane7sec_a_standard_rows_fields_follow_the_field_rule_down.sql'
R1_DOWN = INVERSE / 'lane7sec_r1_every_writer_follows_the_field_rule_down.sql'

ORG = '0a54df90-eab8-4d07-ab29-81a45fb41e04'      # Cedar Ridge Physical Therapy
ADMIN = '87a6e699-3622-4869-8843-d0867456c0dd'    # admin@admin.com (owner)
TEST = '4060701e-706a-4c76-b3ca-0bbc69fa5a14'     # test@test.com (member)
PID = 'aeb8d0c2-c614-4d80-94a4-b709fa7d48ba'      # Rosa Delgado, a CRM person in Cedar Ridge
results = []


def conn():
    url = [l.split('=', 1)[1].strip().strip('"') for l in
           Path('/Users/armanisadeghi/code/aidream/.env').read_text().splitlines() if l.startswith('CLONE_DATABASE_URL=')][0]
    assert 'ajrnyxwasqbmxdmzvfdy' in url, 'not the current clone (see common-docs operations/clone/CURRENT.md)'
    return psycopg.connect(url.replace(':6543/', ':5432/'), autocommit=False)


def seat(cur, uid, headers=None):
    cur.execute("reset role")
    cur.execute("select set_config('request.jwt.claims', %s, true), set_config('request.headers', %s, true), "
                "set_config('app.actor_tier', '', true), set_config('role','authenticated',true)",
                (json.dumps({'sub': uid, 'role': 'authenticated'}), json.dumps(headers or {})))


def server(cur, tier='system', system='matrx-records-mover'):
    """A server job: the service role, no person, its tier declared on the connection."""
    cur.execute("reset role")
    cur.execute("select set_config('request.jwt.claims', '', true), set_config('request.headers', '', true), "
                "set_config('app.actor_tier', %s, true), set_config('app.actor_system', %s, true), "
                "set_config('role','service_role',true)", (tier, system))


def owner(cur):
    cur.execute("reset role")
    cur.execute("select set_config('request.jwt.claims', '', true), set_config('request.headers', '', true)")


def step(cur, sql, args=()):
    cur.execute("savepoint s")
    try:
        cur.execute(sql, args)
        r = cur.fetchall() if cur.description else None
        cur.execute("release savepoint s")
        return ('OK', r)
    except Exception as e:
        cur.execute("rollback to savepoint s")
        return ('REFUSED', f"{getattr(e, 'sqlstate', '')} {str(e).splitlines()[0]}")


def record(kind, case, label, outcome, want):
    ok = bool(want(outcome))
    results.append((kind, case, label, ok))
    print(f"[{kind}] {'PASS' if ok else 'FAIL'} {label}\n      -> {str(outcome)[:400]}")


refused = lambda o: o[0] == 'REFUSED'
accepted = lambda o: o[0] == 'OK'
first = lambda o: o[1][0][0] if o[0] == 'OK' and o[1] else None

notices = []
with conn() as c:
    c.add_notice_handler(lambda d: notices.append(d.message_primary or ''))
    cur = c.cursor()
    cur.execute("select (select count(*) from cron.job where active),(select count(*) from pg_extension where extname='pg_net')")
    q = cur.fetchone(); assert q == (0, 0), q
    print('clone quarantine ok', q, 'mode', MODE, 'plant', PLANT)

    # The DDL below needs the registry table for an instant, and the shared clone reads it all the
    # time: short waits, retried, so this run never queues other lanes behind it for long.
    cur.execute("set local lock_timeout = '3s'")

    def ddl(sql):
        import time
        for attempt in range(60):
            cur.execute("savepoint ddl")
            try:
                cur.execute(sql); cur.execute("release savepoint ddl"); return
            except psycopg.errors.LockNotAvailable:
                cur.execute("rollback to savepoint ddl"); time.sleep(5)
        raise SystemExit('could not take the registry lock on the clone in 60 tries; nothing measured')
    cur.execute("select exists(select 1 from information_schema.columns where table_schema='platform' and table_name='entity_types' and column_name='custom_fields_free_form')")
    r1_live = cur.fetchone()[0]
    if MODE == 'pre':
        if r1_live: ddl(R1_DOWN.read_text())
        ddl(SEC_DOWN.read_text())
    elif MODE == 'r0':
        if r1_live: ddl(R1_DOWN.read_text())
    elif MODE == 'r1':
        ddl(R1.read_text())
    elif MODE != 'current':
        sys.exit(f'unknown mode {MODE}')

    # ── fixtures, through the real doors ───────────────────────────────────────────────────
    seat(cur, ADMIN)
    step(cur, "update crm.party set deleted_at=null where id=%s returning id", (PID,))
    for key, label in (('referral_source', 'Referral source'), ('intake_notes', 'Intake notes')):
        step(cur, "select custom.entity_field_declare(%s,'party',%s::jsonb)", (ORG, json.dumps({'label': label, 'type': 'text', 'key': key})))
    step(cur, "select custom.entity_field_declare(%s,'note','{\"label\":\"Study topic\",\"type\":\"text\",\"key\":\"study_topic\"}'::jsonb)", (ORG,))
    print('seed', step(cur, "select custom.entity_value_write(%s,'party',%s,%s::jsonb)->'custom'",
          (ORG, PID, json.dumps({'preferred_clinic_location': 'Westside', 'referral_source': 'Dr. Patel, Harbor Orthopedics', 'intake_notes': 'Left knee, post-ACL'}))))
    owner(cur)
    # A protected Field that existed before the fix (the fix refuses new ones), stood up with
    # the shape guard stepped around inside this rolled-back transaction.
    cur.execute("set local session_replication_role = replica")
    cur.execute("""update custom.record set data = data || jsonb_build_object('sensitivity',
                     case data->>'key' when 'preferred_clinic_location' then 'confidential' else 'restricted' end)
                   where table_id=custom.field_kernel_id() and organization_id=%s and data->>'table_token'='party'
                     and data->>'key' in ('preferred_clinic_location','referral_source')""", (ORG,))
    cur.execute("set local session_replication_role = origin")
    cur.execute("select count(*) from custom.doors_not_masking_fields()"); sweep_count = cur.fetchone()[0]
    # A note in Cedar Ridge that test@test.com wrote (a non-party standard table).
    seat(cur, TEST)
    note = first(step(cur, "insert into workbench.notes (organization_id, created_by, label, content) values (%s,%s,'Home exercise plan','Quad sets, 3x10') returning id", (ORG, TEST)))
    print('note', note)

    # ── the plants: each removes the one thing a legitimate case stands on ──────────────────
    if PLANT in ('opentable', 'freeform'):
        owner(cur)
        extra = 'note' if PLANT == 'opentable' else 'user_form_profile'
        cur.execute("update platform.feature_knob set value = value || to_jsonb(%s::text) where feature='custom' and key='closed_custom_field_tables' returning value", (extra,))
        print('plant: closed tables now', cur.fetchall())
    if PLANT == 'r0guard':
        owner(cur)
        down = R1_DOWN.read_text()
        ddl(down[down.index('CREATE OR REPLACE FUNCTION custom._entity_custom_fields_guard()'):down.index('$function$;', down.index('CREATE OR REPLACE FUNCTION custom._entity_custom_fields_guard()')) + len('$function$;')])
        print('plant: the guard that refused every writer is back')

    # ── DEFECTS: what a person or a payload must never do ──────────────────────────────────
    seat(cur, TEST)
    o = step(cur, "select custom.entity_record_read(%s,'party',%s)->'custom'", (ORG, PID))
    record('DEFECT', 'read', 'member reads a restricted field through entity_record_read', o,
           lambda o: o[0] == 'OK' and first(o).get('referral_source') is None and 'referral_source' in first(o).get('_hidden', {}))
    o = step(cur, "select custom.entity_records_find(%s,'party','referral_source',null)->'rows'", (ORG,))
    record('DEFECT', 'find', 'member lists a restricted field through entity_records_find', o,
           lambda o: o[0] == 'OK' and all(r.get('value') is None and r.get('hidden') for r in first(o)))
    o = step(cur, "select jsonb_array_length(custom.entity_records_find(%s,'party','referral_source','\"Dr. Patel, Harbor Orthopedics\"'::jsonb)->'rows')", (ORG,))
    record('DEFECT', 'oracle', 'member filters BY a restricted value', o, lambda o: o[0] == 'OK' and first(o) == 0)
    o = step(cur, "select custom.entity_value_write(%s,'party',%s,'{\"preferred_clinic_location\":\"Harbor\"}'::jsonb)", (ORG, PID))
    record('DEFECT', 'overwrite', 'member overwrites a confidential field through entity_value_write', o, refused)
    o = step(cur, "select custom.entity_value_write(%s,'party',%s,'{\"intake_notes\":\"x\",\"made_up_key\":\"x\"}'::jsonb)", (ORG, PID))
    record('DEFECT', 'undeclared', 'member writes an undeclared key through entity_value_write', o, refused)
    o = step(cur, "update crm.party set custom_fields = custom_fields || '{\"zz_undeclared\":\"x\"}'::jsonb where id=%s returning id", (PID,))
    record('DEFECT', 'undeclared', 'member direct UPDATE adds an undeclared key (supabase-js shape)', o, refused)
    o = step(cur, "update crm.party set custom_fields = custom_fields || '{\"preferred_clinic_location\":\"Harbor\"}'::jsonb where id=%s returning id", (PID,))
    record('DEFECT', 'overwrite', 'member direct UPDATE overwrites a confidential field', o, refused)
    o = step(cur, "update crm.party set custom_fields = custom_fields || '{\"intake_notes\":\"Right knee\",\"_actor\":\"system\"}'::jsonb where id=%s returning id", (PID,))
    record('DEFECT', 'actor', 'member forges the author as "system"', o, refused)
    o = step(cur, "update crm.party set custom_fields = custom_fields || jsonb_build_object('intake_notes','Right knee','_actor','agent','_on_behalf_of',%s::text) where id=%s returning id", (ADMIN, PID))
    record('DEFECT', 'actor', 'member forges an agent acting for admin@admin.com', o, refused)
    o = step(cur, "update crm.party set custom_fields = custom_fields || '{\"_smuggle\":\"a value no field describes\"}'::jsonb where id=%s returning id", (PID,))
    record('DEFECT', 'prefix', 'member hides an undeclared value behind a "_" key', o, refused)
    o = step(cur, "update crm.party set custom_fields = custom_fields || '{\"_values\":{\"ghost_key\":{\"ver\":1}}}'::jsonb where id=%s returning id", (PID,))
    record('DEFECT', 'prefix', 'member writes an envelope for a key no field declares', o, refused)
    seat(cur, ADMIN)
    o = step(cur, "select custom.entity_field_declare(%s,'party','{\"label\":\"Insurance member number\",\"type\":\"text\",\"key\":\"insurance_member_number\",\"sensitivity\":\"restricted\"}'::jsonb)", (ORG,))
    record('DEFECT', 'shape', 'admin declares a RESTRICTED field on a standard table', o, refused)
    seat(cur, TEST)
    o = step(cur, "update crm.party set custom_fields = custom_fields || '{\"made_up_key\":\"x\"}'::jsonb where id=%s returning id", (PID,))
    record('DEFECT', 'undeclared', 'member adds an undeclared key on party (a closed table)', o, refused)

    # ── LEGIT: what must keep working ──────────────────────────────────────────────────────
    seat(cur, ADMIN)
    o = step(cur, "select custom.entity_record_read(%s,'party',%s)->'custom'", (ORG, PID))
    record('LEGIT', 'admin', 'admin reads every field, the restricted one included', o,
           lambda o: o[0] == 'OK' and first(o).get('referral_source') == 'Dr. Patel, Harbor Orthopedics' and not first(o).get('_hidden'))
    o = step(cur, "select custom.entity_value_write(%s,'party',%s,'{\"preferred_clinic_location\":\"Northgate\"}'::jsonb)->'custom'->>'preferred_clinic_location'", (ORG, PID))
    record('LEGIT', 'admin', 'admin writes the confidential field', o, lambda o: first(o) == 'Northgate')
    seat(cur, TEST)
    o = step(cur, "select custom.entity_record_read(%s,'party',%s)->'custom'->>'preferred_clinic_location'", (ORG, PID))
    record('LEGIT', 'member', 'member (editor on this row) reads the confidential field — editor may read it', o, lambda o: first(o) is not None)
    o = step(cur, "select custom.entity_value_write(%s,'party',%s,'{\"intake_notes\":\"Left knee, week 3\"}'::jsonb)->'custom'->>'intake_notes'", (ORG, PID))
    record('LEGIT', 'member', 'member writes an internal field through the door', o, lambda o: first(o) == 'Left knee, week 3')
    o = step(cur, "update crm.party set custom_fields = coalesce(custom_fields,'{}'::jsonb) || '{\"intake_notes\":\"Left knee, week 4\"}'::jsonb where id=%s returning custom_fields->'_values'->'intake_notes'->>'actor'", (PID,))
    record('LEGIT', 'member', 'member direct UPDATE of an internal field, stamped "user"', o, lambda o: first(o) == 'user')
    o = step(cur, "update crm.party set display_name = display_name where id=%s returning id", (PID,))
    record('LEGIT', 'member', 'member UPDATE of a real column only', o, accepted)
    o = step(cur, "select custom.entity_value_write(%s,'party',%s,jsonb_build_object('intake_notes','Agent summary: improving','_actor','agent','_on_behalf_of',%s::text))->'custom_written'->'intake_notes'", (ORG, PID, TEST))
    record('LEGIT', 'member', 'records-tool agent write for the signed-in member', o,
           lambda o: o[0] == 'OK' and first(o).get('actor') == 'agent' and first(o).get('on_behalf_of') == TEST)
    seat(cur, TEST, {'x-matrx-actor-tier': 'agent', 'x-matrx-actor-system': 'matrx-extend'})
    o = step(cur, "update crm.party set custom_fields = coalesce(custom_fields,'{}'::jsonb) || '{\"intake_notes\":\"Extension agent note\"}'::jsonb where id=%s returning custom_fields->'_values'->'intake_notes'", (PID,))
    record('LEGIT', 'header', 'the extension\'s agent header is recorded as "agent" for the member', o,
           lambda o: o[0] == 'OK' and first(o).get('actor') == 'agent' and first(o).get('on_behalf_of') == TEST)
    seat(cur, TEST, {'x-matrx-actor-tier': 'system', 'x-matrx-actor-system': 'matrx-extend-sync'})
    o = step(cur, "update crm.party set custom_fields = coalesce(custom_fields,'{}'::jsonb) || '{\"intake_notes\":\"Synced note\"}'::jsonb where id=%s returning custom_fields->'_values'->'intake_notes'->>'actor'", (PID,))
    record('LEGIT', 'header', 'the extension\'s machinery header is recorded as "system"', o, lambda o: first(o) == 'system')
    seat(cur, TEST)
    o = step(cur, "update workbench.notes set custom_fields = coalesce(custom_fields,'{}'::jsonb) || '{\"study_topic\":\"ACL rehab\"}'::jsonb where id=%s returning custom_fields->>'study_topic'", (note,))
    record('LEGIT', 'nonparty', 'member writes a declared field on a NOTE (a non-party table)', o, lambda o: first(o) == 'ACL rehab')
    server(cur)
    o = step(cur, "update crm.party set custom_fields = coalesce(custom_fields,'{}'::jsonb) || '{\"intake_notes\":\"Imported from intake form\"}'::jsonb where id=%s returning custom_fields->'_values'->'intake_notes'->>'actor'", (PID,))
    record('LEGIT', 'service', 'a server job (service role) writes a declared key, stamped "system"', o, lambda o: first(o) == 'system')
    # The platform's own writer keeps an undeclared key, and a NOTICE names it (never silent).
    server(cur)
    notices.clear()
    o = step(cur, "update crm.party set custom_fields = coalesce(custom_fields,'{}'::jsonb) || '{\"legacy_intake_ref\":\"IF-2291\"}'::jsonb where id=%s returning custom_fields->>'legacy_intake_ref'", (PID,))
    said = [n for n in notices if 'legacy_intake_ref' in n]
    record('LEGIT', 'servernotice', 'a server job writes an undeclared key: kept, and a NOTICE names it', (o, said),
           lambda x: first(x[0]) == 'IF-2291' and len(x[1]) > 0)
    # A key the row already carries (legacy) stays editable and clearable by a person.
    seat(cur, TEST)
    o = step(cur, "update crm.party set custom_fields = custom_fields || '{\"legacy_intake_ref\":\"IF-2292\"}'::jsonb where id=%s returning custom_fields->>'legacy_intake_ref'", (PID,))
    record('LEGIT', 'legacy', 'member edits a legacy (undeclared, already present) key on party', o, lambda o: first(o) == 'IF-2292')
    o = step(cur, "update crm.party set custom_fields = custom_fields - 'legacy_intake_ref' where id=%s returning custom_fields ? 'legacy_intake_ref'", (PID,))
    record('LEGIT', 'legacy', 'member clears a legacy key on party', o, lambda o: first(o) is False)
    # A client on a table that is NOT closed keeps an undeclared key.
    o = step(cur, "update workbench.notes set custom_fields = coalesce(custom_fields,'{}'::jsonb) || '{\"reading_list\":\"Knee rehab basics\"}'::jsonb where id=%s returning custom_fields->>'reading_list'", (note,))
    record('LEGIT', 'opentable', 'member writes an undeclared key on a NOTE (not a closed table): kept', o, lambda o: first(o) == 'Knee rehab basics')
    # The mover: declares through the store's declare door, then writes the value.
    owner(cur)
    if PLANT != 'mover':
        print('mover declares', step(cur, "select custom.entity_field_declare(%s,'party','{\"label\":\"Insurance plan\",\"type\":\"text\",\"key\":\"insurance_plan\"}'::jsonb)", (ORG,)))
    server(cur)
    o = step(cur, "update crm.party set custom_fields = coalesce(custom_fields,'{}'::jsonb) || '{\"insurance_plan\":\"Blue Shield PPO\"}'::jsonb where id=%s returning custom_fields->>'insurance_plan'", (PID,))
    seat(cur, ADMIN)
    o = step(cur, "select f->>'value' from jsonb_array_elements(custom.entity_record_read(%s,'party',%s)->'fields') f where f->>'key'='insurance_plan'", (ORG, PID))
    record('LEGIT', 'mover', 'a mover declares the field, then writes its value: it reads back as a field', o, lambda o: first(o) == 'Blue Shield PPO')
    # The autofill profile: one person's own free keys (not a closed table).
    seat(cur, TEST)
    o = step(cur, "insert into users.user_form_profile (user_id, organization_id, custom_fields) values (%s, (select organization_id from users.profiles where id=%s), '{\"gate_code\":\"4471\"}'::jsonb) on conflict (user_id) do update set custom_fields = excluded.custom_fields returning custom_fields->>'gate_code'", (TEST, TEST))
    record('LEGIT', 'freeform', 'member upserts her autofill profile with her own keys (the extension upsert shape)', o, lambda o: first(o) == '4471')
    o = step(cur, "update users.user_form_profile set custom_fields = custom_fields || '{\"tshirt_size\":\"M\"}'::jsonb where user_id=%s returning custom_fields->>'tshirt_size'", (TEST,))
    record('LEGIT', 'freeform', 'member updates her own autofill keys (the /api/user/form-profile PATCH shape)', o, lambda o: first(o) == 'M')
    server(cur, 'system', 'form-profile')
    o = step(cur, "select public.user_form_profile_set_custom_field(%s,'parking_spot','\"B12\"'::jsonb)->>'parking_spot'", (TEST,))
    record('LEGIT', 'freeform', 'service role sets an autofill key for a person', o, lambda o: first(o) == 'B12')
    seat(cur, ADMIN)
    o = step(cur, "select custom.entity_field_declare(%s,'party','{\"label\":\"Preferred therapist\",\"type\":\"text\",\"key\":\"preferred_therapist\"}'::jsonb)", (ORG,))
    record('LEGIT', 'admin', 'admin declares an internal field on a standard table', o, accepted)
    owner(cur)
    cur.execute("select count(*) from custom.doors_not_masking_fields()"); after = cur.fetchone()[0]
    record('LEGIT', 'sweep', f'masking sweep stays at its count ({sweep_count} -> {after})', ('OK', after), lambda o: o[1] == sweep_count)
    c.rollback(); print('rolled back')

bad = [r for r in results if not r[3]]
print(f"\n{MODE}{' plant=' + PLANT if PLANT else ''}: {len(results) - len(bad)}/{len(results)} expectations met")
for r in bad:
    print('  FAIL', r[0], r[1], '-', r[2])
EXPECTED_RED = {'opentable': {'opentable'}, 'freeform': {'freeform'}, 'mover': {'mover'},
                'r0guard': {'servernotice', 'legacy', 'opentable', 'freeform', 'prefix', 'header'}}
if PLANT:
    planted = {r[1] for r in bad}
    ok = planted == EXPECTED_RED[PLANT]
    print(f"plant {PLANT}: {'RED EXACTLY WHERE PLANTED' if ok else 'UNEXPECTED: ' + str(sorted(planted))}")
    sys.exit(0 if ok else 1)
sys.exit(1 if bad else 0)
