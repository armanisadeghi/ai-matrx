"""hr_l1_65 — the directory narrows to the viewer. Real HTTPS PostgREST, real sessions.

Run:  cd /Users/armanisadeghi/code/aidream && uv run --with asyncpg --with httpx \
        python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hr_l1_65_directory_tier_falsification.py

WHAT WAS WRONG. `hr_directory_list` computed `v_persona` on every call and read it in exactly ONE
place — the `directory_opt_out` arm. It decided who was IN the list and never what the list SAID.
Measured here before the fix: a contractor holding an EMPTY capability set received the SAME 24
fields as the employer's HR owner (fte, flsa_status, worker_class, schedule_class, hire_date,
employment_id, row_basis), could ASK for the three not-yet-started hires WITH their start dates,
and could ASK for the three former employees. Separately, the table header's "All" item clears the
status filter, and a cleared filter landed on a default of ['active','on_leave','prehire'] — so
"All" returned 17 of 20 people for everyone, HR admin included.

🚨 BOTH DIRECTIONS ARE SCORED, AND THE OVER-TIGHTENING HALF IS NOT DECORATION. SPEC-ACCESS §9.2
weights leak cases and over-tightening cases equally, and the common case here is the HR admin —
if their directory moves, everyone's directory breaks. The HR-admin assertions below are the
must-not-break bar; the byte-for-byte comparison against the PREVIOUS function body lives in the
migration's own apply-time proof (72 comparisons: 2 admins x 9 filters x 4 sorts, 0 differences),
because it needs both bodies alive at once inside one rolled-back transaction.

🚨 THE EXPECTED FIELD SETS ARE WRITTEN OUT HERE, NOT DERIVED FROM THE DOOR. Asserting that the
payload contains whatever the payload contains proves nothing. Directory tier = SPEC-ACCESS §3.1's
`hr.employee` row ("display/preferred name, work email/phone, employee number, photo, status …
Nothing else") plus the §3.3 DIR structure tables and route 10's manager column.

No fixtures are staged and nothing is written. Tokens come from admin generate_link + verify; no
password is set or typed anywhere. Every session's `sub` is DECODED and asserted before the walk —
/api/dev-login returns early when a session already exists and can silently leave a walk on
somebody else's persona.
"""
import asyncio, base64, json, sys

import asyncpg, httpx

ENV = "/Users/armanisadeghi/code/aidream/.env"
WTS = "2643e470-b275-47f3-95f3-ae275ad3ca47"   # Write Target Sandbox — 20 people, 3 terminated

# Who we walk as, and who they must turn out to be.
PERSONAS = {
    "hr_owner":   ("admin@admin.com",                          "87a6e699-3622-4869-8843-d0867456c0dd"),
    "hr_admin":   ("admin+g2v.priya@admin.com",                "20149d3f-6572-4263-b43c-7e52f0e42058"),
    "employee":   ("zzz.l3.punch.employee@example.invalid",    "ab94c16c-b4a5-49f0-a068-e2a11db34a2c"),
    "contractor": ("zzz.l5.plain.contractor@example.test",     "381213e9-a1d5-459e-809d-956447f47ca5"),
}

# SPEC-ACCESS §3.1 hr.employee + §3.3 DIR structure + route 10's manager column.
DIRECTORY_TIER = {
    "employee_id", "display_name", "employee_number", "work_email", "work_phone",
    "photo_file_id", "directory_status", "job_title_id", "job_title",
    "department_id", "department", "location_id", "location", "timezone",
    "manager_employee_id", "manager_name", "custom",
}
# hr.employment / hr.position_assignment — SPEC-ACCESS §3.2 marks these `—` for an org member.
WORKING_RECORD = {
    "employment_id", "worker_class", "flsa_status", "schedule_class", "fte",
    "hire_date", "row_basis",
}

R = []


def rec(case, expect, got, detail=""):
    ok = (expect == got)
    R.append((case, expect, got, ok, str(detail)[:200]))
    print(f"  [{'PASS' if ok else 'FAIL'}] {case}\n        expected {expect}\n        got      {got}"
          + (f"\n        {detail}" if detail else ""))


def load_env(p):
    out = {}
    for line in open(p):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def sub_of(token):
    """Decode the JWT's own claim. Never trust who we MEANT to be."""
    payload = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=="))["sub"]


async def main():
    env = load_env(ENV)
    base = env["SUPABASE_MATRIX_URL"].rstrip("/")
    anon = env["SUPABASE_MATRIX_PUBLISHABLE_KEY"]
    service = env["SUPABASE_MATRIX_SECRET_KEY"]
    http = httpx.AsyncClient(timeout=90)
    conn = await asyncpg.connect(
        host=env["SUPABASE_MATRIX_HOST"], port=int(env["SUPABASE_MATRIX_PORT"]),
        database=env["SUPABASE_MATRIX_DATABASE_NAME"], user=env["SUPABASE_MATRIX_USER"],
        password=env["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0)

    async def mint(email):
        r = await http.post(f"{base}/auth/v1/admin/generate_link",
                            headers={"apikey": service, "Authorization": f"Bearer {service}",
                                     "Content-Type": "application/json"},
                            json={"type": "magiclink", "email": email})
        r.raise_for_status()
        r = await http.post(f"{base}/auth/v1/verify",
                            headers={"apikey": anon, "Content-Type": "application/json"},
                            json={"type": "magiclink", "token_hash": r.json()["hashed_token"]})
        r.raise_for_status()
        return r.json()["access_token"]

    async def directory(tokn, **kw):
        payload = {"p_organization_id": WTS, "p_limit": 100}
        payload.update(kw)
        r = await http.post(f"{base}/rest/v1/rpc/hr_directory_list",
                            headers={"apikey": anon, "Authorization": f"Bearer {tokn}",
                                     "Content-Type": "application/json",
                                     "Content-Profile": "public", "Accept-Profile": "public"},
                            json=payload)
        if r.status_code >= 400:
            return None, r.status_code, r.json().get("message", r.text[:200])
        return r.json(), r.status_code, ""

    try:
        # ---- 0. the population this scores against ------------------------------------------
        counts = dict(await conn.fetchrow("""
            select count(*) filter (where hr.employee_directory_status(e.id, current_date) = 'terminated') as terminated,
                   count(*) filter (where hr.employee_directory_status(e.id, current_date) = 'prehire')    as prehire,
                   count(*)                                                                                as total
              from hr.employee e
             where e.organization_id = $1 and e.deleted_at is null""", WTS))
        print(f"\nWrite Target Sandbox: {counts['total']} people "
              f"({counts['prehire']} prehire, {counts['terminated']} terminated)\n")
        if counts["terminated"] == 0 or counts["prehire"] == 0:
            print("REFUSING TO SCORE: this employer no longer has both a prehire and a terminated "
                  "person, so the disclosure this run exists to catch cannot be observed.")
            return 2

        active_and_leave = counts["total"] - counts["prehire"] - counts["terminated"]
        default_for_hr = counts["total"] - counts["terminated"]

        tokens = {}
        for label, (email, expected_sub) in PERSONAS.items():
            tokn = await mint(email)
            rec(f"{label}: the session really is {email}", expected_sub, sub_of(tokn))
            tokens[label] = tokn

        # ---- 1. MUST NOT BREAK: the HR tier is untouched -------------------------------------
        for label in ("hr_owner", "hr_admin"):
            page, _, err = await directory(tokens[label])
            rec(f"{label}: default view is route 10's default set",
                default_for_hr, page and page["total"], err)
            rec(f"{label}: rows carry all 24 fields",
                DIRECTORY_TIER | WORKING_RECORD,
                page and set(page["rows"][0].keys()), err)
            rec(f"{label}: may ask for every status",
                ["active", "on_leave", "prehire", "terminated"],
                page and page["statuses"]["allowed"], err)
            rec(f"{label}: the start-date and worker-class columns are published",
                {"hire_date": True, "manager": True, "worker_class": True,
                 "employment_detail": True},
                page and page["columns"], err)

            page, _, err = await directory(tokens[label], p_filter={"status": ["prehire"]})
            rec(f"{label}: the prehire filter still works",
                counts["prehire"], page and page["total"], err)
            page, _, err = await directory(tokens[label], p_filter={"status": ["terminated"]})
            rec(f"{label}: the terminated filter still works",
                counts["terminated"], page and page["total"], err)
            page, _, err = await directory(tokens[label], p_filter={"worker_class": "contractor"})
            rec(f"{label}: the worker-class filter still works",
                True, bool(page) and page["total"] > 0, err)

            # THE "ALL" DEFECT: All must be all, not the default set.
            page, _, err = await directory(tokens[label], p_filter={"status": ["all"]})
            rec(f"{label}: All means ALL — every person, former employees included",
                counts["total"], page and page["total"], err)

        # ---- 2. THE LEAK: a directory-tier viewer gets the directory tier ---------------------
        for label in ("employee", "contractor"):
            page, _, err = await directory(tokens[label])
            rec(f"{label}: receives ONLY the directory tier — no employment fields at all",
                DIRECTORY_TIER, page and set(page["rows"][0].keys()), err)
            rec(f"{label}: not one working-record key survives in ANY row",
                set(),
                page and {k for row in page["rows"] for k in row if k in WORKING_RECORD}, err)
            rec(f"{label}: sees no prehire and no terminated person",
                {"active"} if active_and_leave else set(),
                page and {row["directory_status"] for row in page["rows"]}, err)
            rec(f"{label}: the start-date and worker-class columns are NOT published",
                {"hire_date": False, "manager": True, "worker_class": False,
                 "employment_detail": False},
                page and page["columns"], err)
            rec(f"{label}: may only ask for the two statuses that are theirs",
                ["active", "on_leave"], page and page["statuses"]["allowed"], err)

            # 🚨 REQUESTING the withheld category, not merely being defaulted away from it.
            for status in ("prehire", "terminated"):
                page, code, err = await directory(tokens[label], p_filter={"status": [status]})
                rec(f"{label}: asking for {status} is REFUSED, not silently emptied",
                    (403, True), (code, "not yours in this directory" in err), err)

            page, code, err = await directory(tokens[label], p_filter={"worker_class": "contractor"})
            rec(f"{label}: the worker-class probe is REFUSED",
                (403, True), (code, "not yours in this directory" in err), err)

            # All, for them, is all of what is theirs — and still no former employees.
            page, _, err = await directory(tokens[label], p_filter={"status": ["all"]})
            rec(f"{label}: All is all-they-may-see, and that is not everyone",
                (active_and_leave, {"active"} if active_and_leave else set()),
                (page and page["total"],
                 page and {row["directory_status"] for row in page["rows"]}), err)

            # Sorting by a withheld column is that column, said as an ordering.
            page, _, err = await directory(tokens[label], p_sort="hire_date", p_direction="asc")
            by_name, _, _ = await directory(tokens[label], p_sort="display_name", p_direction="asc")
            rec(f"{label}: the hire-date sort is clamped, not honoured",
                [r["display_name"] for r in (by_name or {}).get("rows", [])],
                [r["display_name"] for r in (page or {}).get("rows", [])], err)

    finally:
        await conn.close()
        await http.aclose()

    passed = sum(1 for r in R if r[3])
    print(f"\n{'=' * 78}\nhr_l1_65: {passed}/{len(R)} assertions passed")
    for case, expect, got, ok, detail in R:
        if not ok:
            print(f"  FAILED: {case}\n    expected {expect}\n    got      {got}\n    {detail}")
    return 0 if passed == len(R) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
