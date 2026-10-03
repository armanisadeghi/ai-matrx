"""LANE 7 W2 on SEC r2 — run with mode : production bodies -> lane7sec_r2 -> lane7w2_a (Choice keys, re-based on r2) -> every SEC case + the Choice-key cases -> lane7w2_a inverse back to r2 byte for byte -> lane7w2_b applies and answers. One rolled-back transaction on the clone. The rest is lane7sec_a_..._red_green.py verbatim (all its modes still work).

LANE7-SEC guard (the ONE guard for this rule; it absorbed the chair's chair-sec-evidence/guard_r1.py cases): the field rule on a standard row, as the real seats and the real server writers, on the clone.

    python3 lane7sec_a_standard_rows_fields_follow_the_field_rule_red_green.py <mode> [--plant <case>]

Every case below states what must be true once the rule is right. Modes choose the database
state, and the SAME expectations are read in every mode, so red and green are one list:

  pre      the store as it was before lane 7 SEC (both SEC files' inverses applied in the txn):
           the 11 original defects show as FAIL.
  r0       the store after the first SEC file only (round 1's inverse applied in the txn):
           the round-1 regressions (form profile, `_` keys, the client's agent/system header)
           show as FAIL.
  current  the database as it is: all PASS once r2 is there.
  prod     production's bodies before r2 (r2's inverse applied in the txn): the archive and
           worked-out cases show as FAIL.
  r2       lane7sec_r2 applied in the txn: all PASS.
  r1       the round-1 file applied inside the txn on top of whatever is there: all PASS.

  --plant <case>  (with r1/current) breaks exactly what a legitimate case depends on, and exactly
           the cases named for that plant — no others — must go red:
             opentable  the closed-table knob also names `note`        -> opentable
             freeform   the closed-table knob also names the profile   -> freeform (client cases)
             mover      the mover skips its declare step               -> mover
             carryback  r2 without its archived-history carry-back     -> carryback
             r0guard    the guard that refused every writer (lane7sec_a's body) is put back
                        -> servernotice, legacy, opentable, freeform, prefix
                        (the header cases no longer depend on this guard: platform.declared_actor_tier
                        now reads the client channel inside a definer door, platform.is_client_channel)

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
R2 = CAMPAIGN / 'lane7sec_r2_an_archived_field_never_blocks_a_row.sql'
R2_DOWN = INVERSE / 'lane7sec_r2_an_archived_field_never_blocks_a_row_down.sql'
W2 = CAMPAIGN / 'lane7w2_a_a_choice_on_a_standard_row_holds_its_key.sql'
W2_DOWN = INVERSE / 'lane7w2_a_a_choice_on_a_standard_row_holds_its_key_down.sql'
WB = CAMPAIGN / 'lane7w2_b_one_read_of_a_tables_fields_across_organizations.sql'
WB_DOWN = INVERSE / 'lane7w2_b_one_read_of_a_tables_fields_across_organizations_down.sql'
GHASH = "select encode(sha256(convert_to(pg_get_functiondef('custom._entity_custom_fields_guard()'::regprocedure),'UTF8')),'hex')"
MARISOL = '82a25af4-27cb-4e94-a2de-155eae7c8992'

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
    # Round 1 is live when the guard body reads the closed-tables setting (CHAIR-SEC-R1).
    cur.execute("select pg_get_functiondef('custom._entity_custom_fields_guard()'::regprocedure) ~ 'closed_custom_field_tables'")
    r1_live = cur.fetchone()[0]
    print('round 1 live on this database:', r1_live)
    if MODE == 'pre':
        if r1_live: ddl(R1_DOWN.read_text())
        ddl(SEC_DOWN.read_text())
    elif MODE == 'r0':
        if r1_live: ddl(R1_DOWN.read_text())
    elif MODE == 'r1':
        ddl(R1.read_text())
    elif MODE == 'prod':
        ddl(R2_DOWN.read_text())      # the three bodies exactly as production held them before r2
    elif MODE == 'r2':
        ddl(R2.read_text())           # r2 applied in the txn (production's bodies + the archive fix)
    elif MODE == 'w2':
        ddl(R2_DOWN.read_text())      # production's bodies (pre-r2)
        cur.execute(GHASH); print('production guard', cur.fetchone()[0][:12])
        ddl(R2.read_text())           # SEC r2
        cur.execute(GHASH); r2_hash = cur.fetchone()[0]; print('r2 guard', r2_hash[:12])
        ddl(W2.read_text())           # W2 Choice keys, re-based on r2
        cur.execute(GHASH); print('r2+w2 guard', cur.fetchone()[0][:12])
    elif MODE != 'current':
        sys.exit(f'unknown mode {MODE}')
    if PLANT == 'carryback':
        # r2 with its archived-envelope carry-back block taken out
        txt = R2.read_text()
        a = txt.index("  -- LANE7-SEC-ARCHIVE: an archived Field's envelope is carried exactly")
        b = txt.index("  end if;\n", a) + len("  end if;\n")
        ddl(txt[:a] + txt[b:])

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

    # ── ARCHIVE: an archived field's value is carried, never a block (lane7sec_r2) ─────────────
    seat(cur, ADMIN)
    arow = first(step(cur, "insert into crm.party (organization_id, created_by, display_name, visibility, party_kind) values (%s,%s,'Marisol Vega','internal','person') returning id", (ORG, ADMIN)))
    step(cur, "select custom.entity_field_declare(%s,'party','{\"label\":\"Insurance verified\",\"type\":\"boolean\",\"key\":\"insurance_verified\"}'::jsonb)", (ORG,))
    print('archive fixture', step(cur, "select custom.entity_value_write(%s,'party',%s,'{\"insurance_verified\":true,\"intake_notes\":\"Referred by Dr. Patel\"}'::jsonb) is not null", (ORG, arow)))
    owner(cur)
    cur.execute("select id from custom.record where table_id=custom.field_kernel_id() and organization_id=%s and data->>'table_token'='party' and data->>'key'='insurance_verified' and deleted_at is null", (ORG,))
    fid = cur.fetchone()[0]
    cur.execute("select custom_fields->'_values'->'insurance_verified' from crm.party where id=%s", (arow,)); env_before = cur.fetchone()[0]
    seat(cur, ADMIN)
    print('archive "Insurance verified"', step(cur, "select custom.entity_field_retire(%s,%s)", (ORG, fid)))
    seat(cur, TEST)
    o = step(cur, "select custom.entity_value_write(%s,'party',%s,'{\"intake_notes\":\"Week 2: full extension\"}'::jsonb)->'custom'->>'intake_notes'", (ORG, arow))
    record('LEGIT', 'archive', 'member writes another field on a row holding an ARCHIVED field\'s value (door)', o, lambda o: first(o) == 'Week 2: full extension')
    o = step(cur, "update crm.party set custom_fields = custom_fields || '{\"intake_notes\":\"Week 3\"}'::jsonb where id=%s returning custom_fields->'insurance_verified', custom_fields->'_values'->'insurance_verified'", (arow,))
    record('LEGIT', 'archive', 'member direct UPDATE on that row: archived value and envelope carried untouched', (o, env_before),
           lambda x: x[0][0] == 'OK' and x[0][1][0][0] is True and x[0][1][0][1] == x[1])
    server(cur)
    o = step(cur, "update crm.party set custom_fields = custom_fields || '{\"intake_notes\":\"Imported week 4\"}'::jsonb where id=%s returning id", (arow,))
    record('LEGIT', 'archive', 'a server job writes a declared field on that row', o, accepted)
    seat(cur, TEST)
    o = step(cur, "update crm.party set custom_fields = custom_fields || '{\"insurance_verified\":false}'::jsonb where id=%s returning id", (arow,))
    record('DEFECT', 'archive', 'member writes a NEW value to the archived field: refused, saying it is archived', o,
           lambda o: o[0] == 'REFUSED' and 'archived' in o[1])
    o = step(cur, "select custom.entity_value_write(%s,'party',%s,'{\"insurance_verified\":false}'::jsonb) is not null", (ORG, arow))
    record('DEFECT', 'archive', 'member changes the archived field through the DOOR: the true archived sentence, never "no field"', o,
           lambda o: o[0] == 'REFUSED' and 'archived' in o[1] and 'no field' not in o[1])
    o = step(cur, "update crm.party set custom_fields = jsonb_set(custom_fields, '{_values,insurance_verified,ver}', '9') where id=%s returning id", (arow,))
    record('DEFECT', 'archive', 'member edits ONLY the archived field\'s stored history: refused in the sentence, never silently undone', o,
           lambda o: o[0] == 'REFUSED' and 'archived' in o[1])
    server(cur)
    o = step(cur, "update crm.party set custom_fields = (custom_fields - '_values') || '{\"intake_notes\":\"Imported week 5\"}'::jsonb where id=%s returning custom_fields->'_values'->'insurance_verified'", (arow,))
    record('LEGIT', 'carryback', 'a writer that sends no history at all: the archived field\'s history is carried back untouched', (o, env_before),
           lambda x: x[0][0] == 'OK' and x[0][1][0][0] == x[1])
    server(cur)
    o = step(cur, "update crm.party set custom_fields = custom_fields - 'insurance_verified' where id=%s returning id", (arow,))
    record('DEFECT', 'archive', 'a server job clears the archived field\'s value: refused (archived means restorable)', o,
           lambda o: o[0] == 'REFUSED' and 'archived' in o[1])
    seat(cur, ADMIN)
    o = step(cur, "select custom.entity_field_declare(%s,'party','{\"label\":\"Patient number\",\"type\":\"formula\",\"key\":\"patient_number_x\",\"source\":\"formula\",\"config\":{\"expr\":{\"op\":\"fx.autonumber\"},\"system\":\"autonumber\"}}'::jsonb)", (ORG,))
    record('DEFECT', 'worked', 'admin declares a worked-out field (record number) on a standard table: refused in "field" words', o,
           lambda o: o[0] == 'REFUSED' and 'field' in o[1].lower() and 'column' not in o[1].lower())
    o = step(cur, "select custom.entity_field_declare(%s,'party','{\"label\":\"Visits left\",\"type\":\"formula\",\"key\":\"visits_left\",\"formula_text\":\"{Intake notes}\"}'::jsonb)", (ORG,))
    record('DEFECT', 'worked', 'admin declares a formula NAMING a field on a standard table: refused in "field" words', o,
           lambda o: o[0] == 'REFUSED' and 'column' not in o[1].lower() and 'worked out' in o[1])
    # The way back the sentence names is real: restore from Trash, as admin, then the value changes.
    o = step(cur, "select public.org_trash_restore(%s,'record',%s)->>'restored'", (ORG, fid))
    record('LEGIT', 'restore', 'admin restores the archived field from Trash', o, lambda o: first(o) == 'true')
    seat(cur, TEST)
    o = step(cur, "select custom.entity_value_write(%s,'party',%s,'{\"insurance_verified\":false}'::jsonb)->'custom'->>'insurance_verified'", (ORG, arow))
    record('LEGIT', 'restore', 'after the restore, the member changes the value through the door', o, lambda o: first(o) == 'false')

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
    # The server connection itself (no role assumed, no person) keeps an undeclared key with a NOTICE.
    owner(cur)
    cur.execute("select set_config('app.actor_tier', 'system', true), set_config('app.actor_system', 'intake-import', true)")
    notices.clear()
    o = step(cur, "update crm.party set custom_fields = coalesce(custom_fields,'{}'::jsonb) || '{\"intake_batch\":\"2026-10 referrals\"}'::jsonb where id=%s returning custom_fields->>'intake_batch'", (PID,))
    said = [n for n in notices if 'intake_batch' in n]
    record('LEGIT', 'servernotice', 'the server connection (no role, no person) writes an undeclared key: kept, NOTICE', (o, said),
           lambda x: first(x[0]) == '2026-10 referrals' and len(x[1]) > 0)
    # A legacy key on a NOTE that predates the guard (the old studyAnnotation shape), written beneath it.
    cur.execute("set local session_replication_role = replica")
    cur.execute("update workbench.notes set custom_fields = coalesce(custom_fields,'{}'::jsonb) || '{\"studyAnnotation\":{\"kind\":\"note\",\"quote\":\"\"}}'::jsonb where id=%s", (note,))
    cur.execute("set local session_replication_role = origin")
    seat(cur, TEST)
    o = step(cur, "update workbench.notes set custom_fields = jsonb_set(custom_fields,'{studyAnnotation,quote}','\"Quad sets first\"') where id=%s returning custom_fields->'studyAnnotation'->>'quote'", (note,))
    record('LEGIT', 'legacy', 'member edits an old studyAnnotation key on her note', o, lambda o: first(o) == 'Quad sets first')
    o = step(cur, "update workbench.notes set custom_fields = custom_fields - 'studyAnnotation' where id=%s returning custom_fields ? 'studyAnnotation'", (note,))
    record('LEGIT', 'legacy', 'member clears the old studyAnnotation key', o, lambda o: first(o) is False)
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
    # The sweep names no token door that skips the mask (a count would move with other lanes' work).
    cur.execute("select coalesce(array_agg(function_name), '{}') from custom.doors_not_masking_fields() where function_name like 'entity%%'")
    named = cur.fetchone()[0]
    record('LEGIT', 'sweep', 'the masking sweep names no entity door', ('OK', named), lambda o: o[1] == [])
    if MODE == 'w2':
        seat(cur, ADMIN)
        def hc(v):
            o = step(cur, "select custom.entity_value_write(%s,'party',%s,%s::jsonb) is not null", (ORG, MARISOL, json.dumps({'home_clinic': v})))
            if o[0] != 'OK': return o
            return step(cur, "select custom_fields->>'home_clinic' from crm.party where id=%s", (MARISOL,))
        record('W2', 'choicekey', 'label "Harbor" is stored as its key', hc('Harbor'), lambda o: first(o) == 'harbor')
        record('W2', 'choicekey', 'the option id is stored as its key', hc('25b326d8-e2b2-402e-b9e9-251709295fa4'), lambda o: first(o) == 'westside')
        record('W2', 'choicekey', '"Uptown" (no such choice) is refused', hc('Uptown'), refused)
        o = step(cur, "update crm.party set custom_fields = custom_fields || %s::jsonb where id=%s returning custom_fields->>'home_clinic'", (json.dumps({'home_clinic': 'Downtown'}), MARISOL))
        record('W2', 'choicekey', 'a direct update with the label is stored as its key', o, lambda o: first(o) == 'downtown')
        owner(cur)
        ddl(W2_DOWN.read_text())
        cur.execute(GHASH); back = cur.fetchone()[0]
        cur.execute("select count(*) from pg_proc where proname='_entity_choice_keys'"); gone = cur.fetchone()[0] == 0
        record('W2', 'inverse', 'inverse returns r2 guard byte for byte and drops the helper', ('OK', [(back == r2_hash and gone,)]), lambda o: o[1][0][0] is True)
        cur.execute("select count(*) from pg_proc where proname='entity_fields_across'")
        if cur.fetchone()[0]: ddl(WB_DOWN.read_text())
        try:
            ddl(WB.read_text()); o = ('OK', None)
        except Exception as e:
            o = ('REFUSED', str(e).splitlines()[0])
        record('W2', 'fieldsdoor', 'lane7w2_b applies cleanly after r2 + w2', o, accepted)
        seat(cur, TEST)
        o = step(cur, "select jsonb_array_length(custom.entity_fields_across('party', array[%s]::uuid[])->'fields')", (ORG,))
        record('W2', 'fieldsdoor', 'the door answers as test@test.com', o, lambda o: (first(o) or 0) > 0)
        owner(cur)
    c.rollback(); print('rolled back')

bad = [r for r in results if not r[3]]
print(f"\n{MODE}{' plant=' + PLANT if PLANT else ''}: {len(results) - len(bad)}/{len(results)} expectations met")
for r in bad:
    print('  FAIL', r[0], r[1], '-', r[2])
EXPECTED_RED = {'opentable': {'opentable'}, 'freeform': {'freeform'}, 'mover': {'mover'}, 'carryback': {'carryback'},
                'r0guard': {'servernotice', 'legacy', 'opentable', 'freeform', 'prefix'}}
if PLANT:
    planted = {r[1] for r in bad}
    ok = planted == EXPECTED_RED[PLANT]
    print(f"plant {PLANT}: {'RED EXACTLY WHERE PLANTED' if ok else 'UNEXPECTED: ' + str(sorted(planted))}")
    sys.exit(0 if ok else 1)
sys.exit(1 if bad else 0)
