#!/usr/bin/env python3
"""
GUARD (lane ARCHIVED-ORG-RESTORE, 2026-10-08): a MEMBER of an ARCHIVED organization who reaches a table of it through the
world lane (custom.assert_public_reader_names_a_public_table) is told the organization is archived, with DETAIL
organization_archived:<org>; a NON-member still meets "You are not a member of that organization".
Everything runs in ONE transaction that is ALWAYS rolled back. Exit 1 on deviation.
  cd aidream && uv run python ../matrx-frontend/scripts/db-proofs/archived-org-public-reader-says-archived.py
"""
import json, sys, uuid, psycopg
from dotenv import dotenv_values

env = dotenv_values('/Users/armanisadeghi/code/aidream/.env')
conn = psycopg.connect(host=env['SUPABASE_MATRIX_HOST'], port=5432, dbname=env['SUPABASE_MATRIX_DATABASE_NAME'],
                       user=env['SUPABASE_MATRIX_USER'], password=env['SUPABASE_MATRIX_PASSWORD'], autocommit=False)
cur = conn.cursor()
fails = []

def as_user(uid):
    cur.execute("select set_config('request.jwt.claims', %s, true), set_config('request.jwt.claim.sub', %s, true)",
                (json.dumps({"sub": uid, "role": "authenticated"}), uid))

def ask(org, label, want_text, want_detail):
    cur.execute("savepoint s")
    # The memo is stamped per statement, so the world-lane marker and the door run in ONE statement (a DO block).
    try:
        cur.execute("do $$ begin perform platform.memo_k_put('w:pub:' || %s, '1'); "
                    "perform custom.assert_public_reader_names_a_public_table(%s::uuid, %s::uuid, 'read_record'); end $$"
                    % (repr(org), repr(org), repr(str(uuid.uuid4()))))
        got, detail = "no refusal", None
    except Exception as e:
        got, detail = str(e).splitlines()[0], getattr(getattr(e, 'diag', None), 'message_detail', None)
    cur.execute("rollback to savepoint s")
    ok = want_text in got and (want_detail is None or detail == want_detail)
    print(("PASS" if ok else "FAIL"), label, "|", got[:90], "|", detail)
    if not ok: fails.append(label)

try:
    cur.execute("select o.id::text from iam.organizations o where o.archived_at is null and exists (select 1 from iam.organization_member m where m.organization_id=o.id) limit 1")
    org = cur.fetchone()[0]
    cur.execute("select user_id::text from iam.organization_member where organization_id=%s limit 1", (org,))
    member = cur.fetchone()[0]
    cur.execute("select u.id::text from auth.users u where not exists (select 1 from iam.organization_member m where m.organization_id=%s and m.user_id=u.id) limit 1", (org,))
    stranger = cur.fetchone()[0]
    cur.execute("update iam.organizations set archived_at = now() where id=%s", (org,))
    as_user(member)
    ask(org, "member of an archived organization is told it is archived", "This organization is archived", f"organization_archived:{org}")
    as_user(stranger)
    ask(org, "a non-member still meets the old sentence", "You are not a member of that organization", None)
finally:
    conn.rollback()
sys.exit(1 if fails else 0)
