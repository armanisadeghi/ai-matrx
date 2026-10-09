#!/usr/bin/env python3
"""
GUARD for the `edit_content` share level ("Can edit content", lane SHARE-EDIT-CONTENT, 2026-10-07).

Runs against the live database as admin@admin.com and test@test.com inside ONE transaction that is ALWAYS
rolled back (nothing persists), through the real doors with the callers' JWT claims set, and asserts the
grade's whole behaviour matrix. Exit 1 on any deviation. Run from aidream so its .env is found:
  cd aidream && uv run python ../matrx-frontend/scripts/db-proofs/edit-content-grade.py
"""
import json, sys, psycopg
from dotenv import dotenv_values

env = dotenv_values('/Users/armanisadeghi/code/aidream/.env')
ORG = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'
TABLE = 'b4147d99-c7ff-4108-87db-15e100f73feb'      # admin's "Tasks" table
ROW = '6aa1dc8a-7f29-4108-a089-61fe26428ddd'
DOC = '6fff109d-cf6d-51ef-b489-ce48d72c7f8a'        # admin's personal markdown page
ADMIN = '87a6e699-3622-4869-8843-d0867456c0dd'
TEST = '4060701e-706a-4c76-b3ca-0bbc69fa5a14'

conn = psycopg.connect(host=env['SUPABASE_MATRIX_HOST'], port=5432, dbname=env['SUPABASE_MATRIX_DATABASE_NAME'],
                       user=env['SUPABASE_MATRIX_USER'], password=env['SUPABASE_MATRIX_PASSWORD'], autocommit=False)
cur = conn.cursor()
failures = []
n = [0]

def seat(uid):
    cur.execute("reset role")
    cur.execute("select set_config('request.jwt.claims', %s, true), set_config('request.jwt.claim.sub', %s, true)",
                (json.dumps({"sub": uid, "role": "authenticated"}), uid))
    cur.execute("set local role authenticated")

def attempt(label, expect, sql, args=()):
    """expect: 'allowed' | 'refused' ; the result text must also contain `contains` when given as tuple."""
    want, contains = expect if isinstance(expect, tuple) else (expect, None)
    n[0] += 1
    sp = f"sp{n[0]}"
    cur.execute(f"savepoint {sp}")
    try:
        cur.execute(sql, args)
        if cur.description is None:
            got, text = ('allowed', f'{cur.rowcount} row updated') if cur.rowcount > 0 else ('refused', 'zero rows matched (row policy)')
        else:
            r = cur.fetchone()
            got, text = 'allowed', str(r[0] if r else cur.rowcount)
    except Exception as e:
        got, text = 'refused', f"{getattr(e, 'sqlstate', None)} {str(e).splitlines()[0]}"
        cur.execute(f"rollback to savepoint {sp}")
    ok = got == want and (contains is None or contains in text)
    print(f"{'PASS' if ok else 'FAIL'}  {label:62s} {got:8s} {text[:110]}")
    if not ok:
        failures.append(label)

try:
    # ---- TABLE / RECORD (the store's doors) ----
    seat(ADMIN)
    attempt("admin shares the table at edit_content with test", 'allowed', "select public.share_resource_with_user('record',%s,%s,'edit_content')::text", (TABLE, TEST))
    seat(TEST)
    attempt("test reads edit_content on the row", ('allowed', 'edit_content'), "select custom.my_level(%s,%s,'record')::text", (ORG, ROW))
    attempt("test edits a row (record_update)", 'allowed', "select custom.record_update(%s,%s,%s::jsonb,null)::text", (ORG, ROW, json.dumps({"status": "done"})))
    attempt("test adds a row (record_write)", 'allowed', "select custom.record_write(%s,%s,%s::jsonb)::text", (ORG, TABLE, json.dumps({"task": "Guard row", "status": "done", "kind": "caption_batch"})))
    attempt("test adds a column (field_declare)", ('refused', 'edit_content level'), "select custom.field_declare(%s,%s,%s::jsonb)::text", (ORG, TABLE, json.dumps({"key": "g_col", "label": "G", "type": "text"})))
    attempt("test changes sharing (share_grant)", ('refused', 'needs the admin level'), "select custom.share_grant(%s,%s,'person',%s,'viewer')::text", (ORG, TABLE, ADMIN))
    attempt("test deletes a row (record_delete)", ('refused', 'needs the editor level'), "select custom.record_delete(%s,%s)::text", (ORG, ROW))
    seat(ADMIN)
    attempt("admin lowers test to commenter", 'allowed', "select public.update_permission_level('record',%s,%s,null,'commenter')::text", (TABLE, TEST))
    seat(TEST)
    attempt("[control] commenter may NOT edit a row", ('refused', 'needs the edit_content level'), "select custom.record_update(%s,%s,%s::jsonb,null)::text", (ORG, ROW, json.dumps({"status": "done"})))

    # ---- SPACES PAGE (content.document) + entity-value doors ----
    seat(TEST)
    attempt("[before share] test may NOT edit the page", 'refused', "update content.document set summary='guard' where id=%s", (DOC,))
    seat(ADMIN)
    attempt("admin shares the page at edit_content with test", 'allowed', "select public.share_resource_with_user('document',%s,%s,'edit_content')::text", (DOC, TEST))
    seat(TEST)
    attempt("test reads edit_content on the page (entity_seat_level)", ('allowed', 'edit_content'), "select custom.entity_seat_level(%s,'document',%s)::text", (ORG, DOC))
    attempt("test edits the page's content (summary)", 'allowed', "update content.document set summary='edited by a content editor' where id=%s", (DOC,))
    attempt("test edits the page's custom values", 'allowed', "update content.document set custom_fields = coalesce(custom_fields,'{}'::jsonb) where id=%s", (DOC,))
    for col, val in [("visibility", "'internal'"), ("archived_at", "now()"), ("deleted_at", "now()"), ("folder_id", "gen_random_uuid()"), ("published_to_web", "true")]:
        attempt(f"test may NOT change the page's {col}", ('refused', 'Edit-content access does not include'), f"update content.document set {col}={val} where id=%s", (DOC,))
    attempt("test changes sharing of the page", ('allowed', 'You need Admin'), "select public.update_permission_level('document',%s,%s,null,'admin')::text", (DOC, TEST))
    seat(ADMIN)
    attempt("admin raises test to editor (control)", 'allowed', "select public.update_permission_level('document',%s,%s,null,'editor')::text", (DOC, TEST))
    seat(TEST)
    attempt("[control] editor may change the page's visibility", 'allowed', "update content.document set visibility='internal' where id=%s", (DOC,))
finally:
    cur.execute("reset role")
    conn.rollback()
    conn.close()
    print("ROLLED BACK - nothing persisted")
if failures:
    print("FAILED:", failures)
    sys.exit(1)
print("edit_content grade: every assertion holds")
