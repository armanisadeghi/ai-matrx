"""LANE ORPHAN-CHOICES (2026-10-01, SAFETY-NET-B B0/B11) — A PICK LIST STEP 1 ADOPTS IS COPIED WITH ITS CHOICES.

    cd matrx-frontend
    uv run --project ../aidream python scripts/campaign-tests/orphanchoices_an_adopted_lists_choices_copy_red_green.py

THE USE CASE. A recruiter at Harbor Staffing Co made the pick list "Shift types" before lists had
organizations; she belongs to many organizations, so her membership cannot say where it lives. Her
organization's agent "Draft shift confirmation" has a "shift" variable whose picker chooses from it, so
Step 1 gives the list Harbor Staffing Co (PRESS-AT-SIZE W12). Its three choices were made before choices
had organizations.

RED on the body before orphanchoices_an_adopted_lists_choices_take_its_organization.sql:
  G1 after the adoption the list's choices still have no organization;
  G2 Copy again for Harbor Staffing Co (the real mover, `matrx_records.movers.copy_again`) is refused —
     "custom.record_write_many: organization_id is required";
GREEN after: G1 every choice has the list's organization, G2 Copy again is not refused, G3 the three
labels read back from the store under Harbor Staffing Co, unchanged, and G4 readiness (the real
`platform._final_switch_readiness`) no longer says Harbor Staffing Co needs Copy again.

Clone only (refuses a database with active cron jobs or pg_net). ONE transaction on the clone's SESSION
pooler (5432); the mover's own writes are savepoints inside it; everything is rolled back.
"""

from __future__ import annotations

import asyncio
import json
import sys
import uuid
from urllib.parse import urlsplit, urlunsplit

ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd"  # admin@admin.com, a member of many organizations
ORG = "c4397784-4435-4e3c-b94c-bebafcad084b"    # Harbor Staffing Co (admin owns it; no older tables or lists)
LABELS = ["Day shift (7a-3p)", "Swing shift (3p-11p)", "Overnight (11p-7a)"]


def session_dsn() -> str:
    from aidream.testing.clone_database import clone_database_url

    parts = urlsplit(clone_database_url())
    netloc = parts.netloc.replace(":6543", ":5432")
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


async def main() -> int:
    import asyncpg

    from matrx_records.movers.copy_again import CopyAgainTarget, copy_again

    conn = await asyncpg.connect(session_dsn(), statement_cache_size=0)
    fails: list[str] = []
    notes: list[str] = []
    tx = conn.transaction()
    await tx.start()
    try:
        if await conn.fetchval("select (select count(*) from cron.job where active) <> 0 "
                               "or exists (select 1 from pg_extension where extname = 'pg_net')"):
            raise SystemExit("REFUSED: not the dev clone")
        await conn.execute("set local lock_timeout = '10s'; set local statement_timeout = '600s'")
        lst = str(uuid.uuid4())
        # The planted list is the shape production still holds (made before lists and choices had an
        # organization); the organization guard refuses writing one fresh, so the fixture rows go in with
        # triggers off for these inserts only, inside this rolled-back transaction.
        await conn.execute("set local session_replication_role = replica")
        await conn.execute(
            "insert into workbench.udt_structured_lists (id, list_name, user_id, created_by, organization_id, visibility) "
            "values ($1::uuid, 'Shift types', $2::uuid, $2::uuid, null, 'personal')", lst, ADMIN)
        for label in LABELS:
            await conn.execute(
                "insert into workbench.udt_structured_list_items (list_id, label, user_id, created_by, organization_id) "
                "values ($1::uuid, $2, $3::uuid, $3::uuid, null)", lst, label, ADMIN)
        await conn.execute(
            "insert into agent.definition (name, organization_id, variable_definitions) values "
            "('Draft shift confirmation', $1::uuid, $2::jsonb)", ORG,
            json.dumps([{"name": "shift", "customComponent": {"type": "select", "picklist": {"listId": lst}}}]))
        await conn.execute("set local session_replication_role = origin")

        res = json.loads(await conn.fetchval(
            "select e::text from jsonb_array_elements(platform._final_switch_orphan_lists()) e where e ->> 'id' = $1", lst))
        if res.get("resolution") != "organization" or res.get("organization_id") != ORG:
            fails.append(f"G0 the planted list resolved {res.get('resolution')} ({res.get('why')}), not Harbor Staffing Co")

        # Step 1, as the page's server calls it: the adoption as the signed-in platform administrator.
        await conn.execute(
            "select set_config('request.jwt.claims', $1, true), set_config('request.headers', $2, true), "
            "set_config('matrx.admin_lane', 'on', true)",
            json.dumps({"sub": ADMIN, "role": "authenticated", "email": "admin@admin.com", "session_id": "orphan-choices-test"}),
            json.dumps({"origin": "http://orphan-choices.localhost:3001"}))
        adopted = json.loads(await conn.fetchval("select platform.final_switch_adopt_orphan_lists($1::uuid)::text", str(uuid.uuid4())))
        notes.append(f"adoption: {adopted.get('says')}")
        if not adopted.get("ok") or lst not in {a.get("id") for a in adopted.get("adopted") or []}:
            fails.append(f"G0 the adoption did not adopt the planted list: {adopted}")
        # The mover runs on the server's own connection: no person's claims.
        await conn.execute("select set_config('request.jwt.claims', '', true), set_config('request.headers', '', true), "
                           "set_config('matrx.admin_lane', '', true)")

        orgless = await conn.fetchval(
            "select count(*) from workbench.udt_structured_list_items where list_id = $1::uuid and organization_id is null", lst)
        if orgless:
            fails.append(f"G1 after the adoption {orgless} of {len(LABELS)} choices still have no organization")

        sp = conn.transaction()
        await sp.start()
        try:
            report = await copy_again(conn, CopyAgainTarget(organization_id=ORG, organization_name="Harbor Staffing Co"),
                                      entry="the ORPHAN-CHOICES test")
            row = report.as_dict()
            notes.append(f"Copy again: {row.get('says')}")
            refused = (row.get("tables_refused") or []) + (row.get("refused") or [])
            if refused:
                fails.append(f"G2 Copy again for Harbor Staffing Co refused: {refused[0]}")
            await sp.commit()
        except Exception as exc:  # noqa: BLE001 — the refusal IS the red
            await sp.rollback()
            fails.append(f"G2 Copy again for Harbor Staffing Co refused: {getattr(exc, 'says', None) or exc}")
        else:
            got = await conn.fetch(
                "select organization_id::text org, data ->> 'name' as name from custom.record "
                "where table_id = $1::uuid and deleted_at is null", lst)
            if sorted(r["name"] for r in got) != sorted(LABELS) or {r["org"] for r in got} != {ORG}:
                fails.append(f"G3 the store holds {[(r['org'][:8], r['name']) for r in got]}, not the 3 labels under Harbor Staffing Co")
            r = json.loads(await conn.fetchval("select platform._final_switch_readiness()::text"))
            mine = next((o for o in r.get("organizations") or [] if o.get("id") == ORG), None)
            if mine and mine.get("needs_copy_again"):
                fails.append("G4 readiness still says Harbor Staffing Co needs Copy again: "
                             + "; ".join((c.get("detail") or c.get("says") or "")[:160] for c in mine.get("rerun_clears") or []))
            notes.append(f"readiness for Harbor Staffing Co: needs_copy_again={bool(mine and mine.get('needs_copy_again'))}")
    finally:
        await tx.rollback()
        await conn.close()
    for n in notes:
        print("  ·", n)
    if fails:
        print("RED: " + " | ".join(fails))
        return 1
    print("GREEN: the list Step 1 adopts is copied with its choices under its organization (G1-G4); rolled back")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
