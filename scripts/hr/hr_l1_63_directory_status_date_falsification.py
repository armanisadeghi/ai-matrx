"""hr_l1_63 — the directory status derives from DATES, not a stale enum. Real HTTPS PostgREST.

Run:  cd /Users/armanisadeghi/code/aidream && uv run --with asyncpg --with httpx \
        python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hr_l1_63_directory_status_date_falsification.py

D4A: hr.employee_directory_status short-circuited on `em.status = 'pending'`, a column nothing in
the database ever writes a second time, so all 7 pending employments read `prehire` on their hire
date, the next morning, and 90 days later — permanently.
D4B: `em.status = 'terminated'` was tested with NO reference to p_on, so somebody who has left read
`terminated` at every as-of date, including dates they were working here — reachable through the
`?as_of=` query string on the profile route.

🚨 THE ORACLE IS INDEPENDENT ON PURPOSE. Expected status is computed HERE, from hire_date and
termination_date alone — `prehire` before the hire date, `terminated` after the termination date,
`active` in between — and never by calling hr.employee_directory_status. Asserting the door against
the function the door itself calls proves only that the function is deterministic.

That date-only oracle is valid only while no spell carries a dateless termination or a leave state
(the two facts no date can express, which the derivation still reads the enum for). The run ASSERTS
that precondition first and refuses to score itself if it does not hold.

No fixtures are staged and nothing is written. Tokens come from admin generate_link + verify; no
password is set or typed anywhere.
"""
import asyncio, sys
from datetime import date, timedelta

import asyncpg, httpx

ENV = "/Users/armanisadeghi/code/aidream/.env"
WTS = "2643e470-b275-47f3-95f3-ae275ad3ca47"   # the employer the D4 numbers were measured in
TODAY = date(2026, 8, 28)
DERIVED_VOCABULARY = {"prehire", "active", "on_leave", "terminated"}

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


def oracle(hire: date, term, on: date) -> str:
    """Truth from DATES only. The enum is deliberately not consulted."""
    if on < hire:
        return "prehire"
    if term is not None and on > term:
        return "terminated"
    return "active"


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

    async def rpc(tokn, fn, payload):
        r = await http.post(f"{base}/rest/v1/rpc/{fn}",
                            headers={"apikey": anon, "Authorization": f"Bearer {tokn}",
                                     "Content-Type": "application/json",
                                     "Content-Profile": "public", "Accept-Profile": "public"},
                            json=payload)
        if r.status_code >= 400:
            return None, f"HTTP {r.status_code} {r.text[:200]}"
        return r.json(), ""

    try:
        # ---- 0. the oracle's own precondition -------------------------------------------------
        bad = await conn.fetchval("""
            select count(*) from hr.employment
             where deleted_at is null
               and (status in ('on_leave','suspended')
                 or (status = 'terminated' and termination_date is null))""")
        rec("oracle precondition: no dateless termination and no leave state on any spell",
            0, bad, "a date-only oracle cannot score those two populations")
        if bad:
            print("\nABORT — the date-only oracle is not valid against this data.")
            return 1

        spells = await conn.fetch("""
            select em.employee_id::text as eid, e.display_name, em.status,
                   em.hire_date, em.termination_date, em.organization_id::text as org
              from hr.employment em join hr.employee e on e.id = em.employee_id
             where em.deleted_at is null order by em.hire_date""")
        pend = [s for s in spells if s["status"] == "pending"]
        term = [s for s in spells if s["status"] == "terminated"]
        rec("population: pending employments on the system", 7, len(pend))
        rec("population: terminated employments on the system", 3, len(term))

        token = await mint("admin@admin.com")

        async def door_status(eid, on):
            j, err = await rpc(token, "hr_employee_profile",
                               {"p_employee_id": eid, "p_as_of": on.isoformat()})
            if err:
                return None, err
            if not j.get("granted"):
                return None, f"refused: {j.get('reason')}"
            return (j.get("header") or {}).get("status"), ""

        # ---- 1. D4A: every pending employment starts on its hire date -------------------------
        print("\n── D4A · the morning the hire date arrives, through the profile door ──")
        for s in pend:
            h = s["hire_date"]
            for label, on in (("day before", h - timedelta(days=1)), ("ON hire day", h),
                              ("next day", h + timedelta(days=1)), ("+90d", h + timedelta(days=90))):
                got, err = await door_status(s["eid"], on)
                rec(f"{s['display_name']} (hire {h}) @ {on} [{label}]",
                    oracle(h, s["termination_date"], on), got, err)

        # ---- 2. D4B: a leaver's history is not rewritten by their leaving ---------------------
        print("\n── D4B · as-of dates a terminated person was working here ──")
        for s in term:
            h, t = s["hire_date"], s["termination_date"]
            for label, on in (("before they started", h - timedelta(days=1)),
                              ("first day", h),
                              ("mid-tenure", h + (t - h) // 2),
                              ("last day worked", t),
                              ("after they left", t + timedelta(days=1)),
                              ("today", TODAY)):
                got, err = await door_status(s["eid"], on)
                rec(f"{s['display_name']} (hire {h}, left {t}) @ {on} [{label}]",
                    oracle(h, t, on), got, err)

        # ---- 3. no raw enum ever escapes the door --------------------------------------------
        print("\n── every value the door emits is in the DERIVED vocabulary ──")
        leaked = set()
        sweep_dates = [date(2026, 1, 1), date(2026, 5, 1), TODAY, date(2026, 9, 1),
                       date(2026, 9, 16), date(2026, 12, 31)]
        wts_ids = sorted({s["eid"] for s in spells if s["org"] == WTS})
        for eid in wts_ids:
            for on in sweep_dates:
                got, err = await door_status(eid, on)
                if got is not None and got not in DERIVED_VOCABULARY:
                    leaked.add(got)
        rec(f"raw enum values leaked over {len(wts_ids)} people x {len(sweep_dates)} as-of dates",
            set(), leaked, "'pending' and 'suspended' are RAW hr.employment.status values")

        # ---- 4. must-not-break: today's live numbers ------------------------------------------
        print("\n── must-not-break · today's numbers, through the doors ──")
        j, err = await rpc(token, "hr_directory_list",
                           {"p_organization_id": WTS, "p_filter": {}, "p_limit": 200,
                            "p_offset": 0, "p_sort": None, "p_direction": None})
        rows = (j or {}).get("rows") or []
        counts = {}
        for r in rows:
            counts[r.get("directory_status")] = counts.get(r.get("directory_status"), 0) + 1
        rec("hr_directory_list · rows returned today", 17, len(rows), err)
        rec("hr_directory_list · active today", 14, counts.get("active", 0))
        rec("hr_directory_list · prehire today", 3, counts.get("prehire", 0))
        rec("hr_directory_list · terminated hidden from the default list today", 0,
            counts.get("terminated", 0))

        j, err = await rpc(token, "hr_directory_list",
                           {"p_organization_id": WTS, "p_filter": {"status": ["terminated"]},
                            "p_limit": 200, "p_offset": 0, "p_sort": None, "p_direction": None})
        trows = (j or {}).get("rows") or []
        rec("hr_directory_list · the 3 terminated are still terminated on the filter",
            3, len(trows), err)

        j, err = await rpc(token, "hr_org_summary", {"p_organization_id": WTS})
        hc = None
        if isinstance(j, dict):
            hc = j.get("headcount")
            if hc is None:
                for v in j.values():
                    if isinstance(v, dict) and "headcount" in v:
                        hc = v["headcount"]
        rec("hr_org_summary · headcount today", 14, hc, err if err else str(j)[:200])

        # ---- 5. the headcount date sweep, derived vs truth-from-dates -------------------------
        print("\n── the date sweep · derived headcount vs truth from dates ──")
        for on in (date(2026, 8, 29), date(2026, 9, 1), date(2026, 9, 10), date(2026, 9, 16)):
            truth = await conn.fetchval("""
                select count(*) from hr.employment
                 where deleted_at is null and organization_id = $1::uuid
                   and hire_date <= $2 and (termination_date is null or termination_date >= $2)""",
                WTS, on)
            derived = await conn.fetchval("""
                select count(*) from (select distinct employee_id from hr.employment
                                       where deleted_at is null and organization_id = $1::uuid) x
                 where hr.employee_directory_status(x.employee_id, $2) = 'active'""", WTS, on)
            rec(f"headcount @ {on}", truth, derived)

        # ---- 6. the contract is intact -------------------------------------------------------
        broken = await conn.fetch("select * from hr.function_contracts_broken()")
        rec("hr.function_contracts_broken()", 0, len(broken),
            "; ".join(f"{b['qname']}:{b['missing_or_present']}" for b in broken))

    finally:
        await conn.close()
        await http.aclose()

    bad = [r for r in R if not r[3]]
    print(f"\n{'='*78}\n{len(R)-len(bad)}/{len(R)} PASS")
    for c, e, g, _, d in bad:
        print(f"  FAIL {c}: expected {e}, got {g} {d}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
