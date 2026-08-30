"""hr_c3_14 — HR BREAK-GLASS ACTUALLY GRANTS NOW, AND THE VETO STILL REFUSES ABSOLUTELY.

Run:  cd /Users/armanisadeghi/code/aidream && .venv/bin/python \
        /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hr_c3_14_break_glass_grants_falsification.py

🚨 WHY THIS EXISTS. `hr.derived_grant where reason='break_glass'` was **0 rows, ever**. Every
gate inside `public.hr_break_glass` was right and its last step — the one that makes the feature
mean anything — died on 23514, because not one of the sixteen tokens `hr._door_spec` marks
break-glass-permitted was registered in `platform.shareable_resource_registry`.

It survived three days of adversarial walking because THE ONLY CALL ANYBODY EVER MADE was on
`hr_incident`, by a subject-excluded caller, where the correct answer is REFUSE. The feature's one
test case was the single case in which working and broken are indistinguishable from outside.

So this suite refuses to prove break-glass by watching it say no. It proves all three:

  A  GRANTED — a record the HR admin genuinely cannot reach (`hr_legal_hold` needs
     `records.govern`, which `hr_admin` does not hold), no veto in play. Refused first as a
     control, then break-glassed: a `hr.derived_grant` row with `reason='break_glass'`, a real
     future `expires_at`, an `hr.access_audit` row carrying the justification verbatim, and — the
     assertion that separates a grant from a receipt — THE RECORD READ BACK through the ordinary
     audited door in the same session, `basis: break_glass`.

  B  🚨 THE MUST-NOT-BREAK — a subject-excluded `hr.incident`, break-glass ON, still refused
     absolutely, with SPEC-ACCESS §5's reason stored VERBATIM and no grant row anywhere. This
     half was already bulletproof. Repairing the other half must not have cost a single character
     of it, so the closing verifier's proof is re-asserted here rather than assumed.

  C  IT ENDS, AND NOT EVERYONE CAN START IT — the grant expires (the door refuses again the
     moment `expires_at` is in the past), a plain employee holding no `break_glass_allowed` role
     is refused by name, and `hr._guard_audited_tier_grant` refuses the unaudited side entrance
     that registering these tokens would otherwise have opened.

EVERYTHING RUNS INSIDE ONE TRANSACTION THAT IS ALWAYS ROLLED BACK. The fixture legal hold, the
fixture incident, the derived_grant this proves, its iam.permissions row and every audit row it
wrote are gone when the script exits — the disclosure obligation for a grant created as evidence
is discharged by the rollback, and the tail re-measures to prove it.

Connection comes from the five SUPABASE_MATRIX_* variables in aidream/.env.
🚨 statement_cache_size=0 is required: the host is pgbouncer in transaction pooling mode.
"""
import asyncio
import json
import pathlib
import sys

import asyncpg

cfg = {}
for line in pathlib.Path("/Users/armanisadeghi/code/aidream/.env").read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        cfg[k.strip()] = v.strip().strip('"').strip("'")

DSN = dict(
    host=cfg["SUPABASE_MATRIX_HOST"],
    port=int(cfg.get("SUPABASE_MATRIX_PORT") or 5432),
    user=cfg["SUPABASE_MATRIX_USER"],
    password=cfg["SUPABASE_MATRIX_PASSWORD"],
    database=cfg.get("SUPABASE_MATRIX_DATABASE_NAME") or "postgres",
    statement_cache_size=0,
)

# The live HR fixture org and its two real role-holders. Chosen, not invented: these are the only
# active HR role assignments in this org, and the admin/owner split is what makes case A possible.
ORG = "2643e470-b275-47f3-95f3-ae275ad3ca47"
U_ADMIN = "20149d3f-6572-4263-b43c-7e52f0e42058"  # hr_admin  — break_glass_allowed = true
EMPL_ADMIN = "ca9e12da-35bb-402d-8bda-1b76fa4c678d"
U_OWNER = "87a6e699-3622-4869-8843-d0867456c0dd"  # hr_owner  — owns the fixture rows
U_PLAIN = "daeb6d44-a7dd-4085-aba2-5025fb711b79"  # Tomo — a real employee, zero HR roles

JUSTIFICATION = (
    "Agency subpoena received 2026-08-29; counsel needs the preservation scope tonight."
)
VETO_REASON = "SPEC-ACCESS §5: the subject-exclusion veto overrides break-glass, absolutely"

out: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    out.append((name, bool(ok), detail))


async def as_user(conn, uid: str | None) -> None:
    """Become a real `authenticated` caller, or drop back to the definer role."""
    if uid is None:
        await conn.execute("set local role none")
        return
    await conn.execute("set local role authenticated")
    await conn.execute(
        "select set_config('request.jwt.claims', $1, true)",
        json.dumps({"sub": uid, "role": "authenticated"}),
    )


async def rpc(conn, sql: str, *args):
    """Call an RPC, returning either its jsonb or the SQLSTATE it raised."""
    await conn.execute("savepoint sp")
    try:
        v = await conn.fetchval(sql, *args)
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return {"__value": v}
        return v
    except asyncpg.PostgresError as e:
        await conn.execute("rollback to savepoint sp")
        return {"__sqlstate": e.sqlstate, "__msg": str(e)}


async def main() -> None:
    conn = await asyncpg.connect(**DSN)
    tx = conn.transaction()
    await tx.start()
    try:
        # ── PRE-STATE. The number this whole task exists to move off zero. ────────────────────
        before = await conn.fetchval(
            "select count(*) from hr.derived_grant where reason = 'break_glass'"
        )
        check(
            f"pre-state: hr.derived_grant reason='break_glass' = {before} (the domain-wide "
            "count that had never once been non-zero)",
            before == 0,
        )
        drift = await conn.fetch("select * from hr.break_glass_registration_drift()")
        check(
            f"all sixteen break-glass tokens are registered (drift = {len(drift)})",
            len(drift) == 0,
            ", ".join(r["token"] for r in drift),
        )

        # ── FIXTURES, written through the armed path the security model requires. ─────────────
        await conn.execute("select set_config('hr.privileged_write','on',true)")
        hold = await conn.fetchval(
            """insert into hr.legal_hold
                 (organization_id, matter_name, hold_kind, issued_by, scope_description,
                  opened_on, state, created_by)
               values ($1, 'C3-14 PROBE MATTER (synthetic)', 'preservation_letter',
                       'C3-14 probe counsel', 'SYNTHETIC TEST DATA — hr_c3_14 falsification.',
                       current_date, 'active', $2)
               returning id""",
            ORG,
            U_OWNER,  # owned by the OWNER, so the admin's owner arm cannot answer for them
        )
        incident = await conn.fetchval(
            """insert into hr.incident
                 (organization_id, incident_kind, subject_employment_id, occurred_at, reported_at,
                  summary, state, subject_excluded, created_by)
               values ($1, 'harassment', $2, now(), now(),
                       'SYNTHETIC TEST DATA — hr_c3_14 falsification.', 'intake', true, $3)
               returning id""",
            ORG,
            EMPL_ADMIN,  # 🚨 the HR ADMIN is the SUBJECT — this is what the veto exists for
            U_OWNER,
        )
        excluded = await conn.fetchval(
            "select hr.incident_excluded($1, $2)", U_ADMIN, incident
        )
        check(
            "fixture control: the HR admin really is inside the incident's excluded set",
            excluded is True,
        )

        # ══ A — GRANTED. A record the admin cannot reach, and no veto anywhere near it. ═══════
        await as_user(conn, U_ADMIN)

        control = await rpc(
            conn,
            "select public.hr_confidential_get('hr_legal_hold', $1, 'compliance')::text",
            hold,
        )
        check(
            "A1 control — the HR admin CANNOT normally read this legal hold "
            f"(records.govern is not an hr_admin capability): {control.get('granted')}",
            control.get("granted") is False,
            control.get("reason") or control.get("__sqlstate") or "",
        )

        granted = await rpc(
            conn,
            "select public.hr_break_glass('hr_legal_hold', $1, 'legal', $2)::text",
            hold,
            JUSTIFICATION,
        )
        check(
            "A2 🚨 break-glass GRANTS — the first time in this domain's history that it has",
            granted.get("granted") is True,
            granted.get("reason") or granted.get("__msg") or "",
        )
        check(
            "A3 it hands back a real permission_id and an expiry, not just a receipt",
            bool(granted.get("permission_id")) and bool(granted.get("expires_at")),
        )
        check(
            "A4 the row itself came back on the break-glass call",
            isinstance(granted.get("row"), dict) and bool(granted["row"]),
        )

        await as_user(conn, None)
        dg = await conn.fetchrow(
            """select dg.reason, dg.grantee_user_id, dg.resource_type, dg.expires_at,
                      dg.basis_kind, p.status, p.permission_level, p.expires_at as perm_expires,
                      extract(epoch from (p.expires_at - now()))/60 as minutes_left
                 from hr.derived_grant dg
                 join iam.permissions p on p.id = dg.permission_id
                where dg.reason = 'break_glass' and dg.resource_id = $1""",
            hold,
        )
        check("A5 a hr.derived_grant row exists with reason='break_glass'", dg is not None)
        if dg:
            ttl = float(dg["minutes_left"])
            check(
                f"A6 it is time-boxed to the knob's TTL — {ttl:.1f} minutes left "
                "(hr.access.break_glass_grant_ttl_minutes = 60)",
                55 <= ttl <= 61,
            )
            check(
                "A7 the mapped iam.permissions row is an active viewer grant to the caller",
                dg["status"] == "active"
                and str(dg["permission_level"]) == "viewer"
                and str(dg["grantee_user_id"]) == U_ADMIN,
            )
        audit = await conn.fetchrow(
            """select action, basis, granted, is_break_glass, justification, purpose,
                      sensitivity_tier
                 from hr.access_audit
                where target_token = 'hr_legal_hold' and $1 = any(target_ids)
                  and granted order by occurred_at desc limit 1""",
            hold,
        )
        check("A8 the grant is audited", audit is not None)
        if audit:
            check(
                "A9 the audit row says break_glass, is flagged, and stores the justification "
                "VERBATIM",
                audit["basis"] == "break_glass"
                and audit["is_break_glass"] is True
                and audit["justification"] == JUSTIFICATION
                and audit["purpose"] == "legal",
                f"basis={audit['basis']} justification={audit['justification']!r}",
            )

        # 🚨 THE ASSERTION THAT SEPARATES A GRANT FROM A RECEIPT.
        await as_user(conn, U_ADMIN)
        after_read = await rpc(
            conn,
            "select public.hr_confidential_get('hr_legal_hold', $1, 'compliance')::text",
            hold,
        )
        check(
            "A10 🚨 THE RECORD IS NOW READABLE THROUGH THE ORDINARY AUDITED DOOR, in the same "
            "session — the same call that was refused at A1",
            after_read.get("granted") is True,
            str(after_read.get("basis") or after_read.get("reason")),
        )
        check(
            "A11 and the door names break_glass as the basis, so the reach is explainable",
            after_read.get("basis") == "break_glass",
            str(after_read.get("basis")),
        )
        # hr_c3_15 — the floor under A10. `hr._door_get` stamps is_break_glass on this read, and
        # `access_audit_break_glass_justified` demands a >=20-char reason on any such row, but
        # `hr_confidential_get` hard-codes that argument NULL. Before hr_c3_15 this read died on
        # 23514 and — the audit write being fail-closed — took the read with it. The reason is
        # carried from the break-glass act, not asked for again.
        await as_user(conn, None)
        read_audit = await conn.fetchrow(
            """select basis, is_break_glass, justification, action
                 from hr.access_audit
                where id = $1""",
            after_read.get("audit_id"),
        )
        check("A12 the break-glass READ is audited in its own right", read_audit is not None)
        if read_audit:
            check(
                "A13 🚨 and it carries the reason break-glass was called, VERBATIM — so a year "
                "later any single row answers 'what did they look at, and why were they allowed'",
                read_audit["is_break_glass"] is True
                and read_audit["basis"] == "break_glass"
                and read_audit["justification"] == JUSTIFICATION,
                f"is_bg={read_audit['is_break_glass']} just={read_audit['justification']!r}",
            )
        check(
            "A14 control — the carrier cannot invent a reason for an actor who never broke glass",
            await conn.fetchval(
                "select hr._break_glass_justification($1, 'hr_legal_hold', $2)", U_PLAIN, hold
            )
            is None,
        )
        await as_user(conn, U_ADMIN)

        # ══ B — 🚨 THE MUST-NOT-BREAK. The veto still refuses, absolutely. ════════════════════
        veto = await rpc(
            conn,
            "select public.hr_break_glass('hr_incident', $1, 'investigation', $2)::text",
            incident,
            JUSTIFICATION,
        )
        check(
            "B1 🚨 break-glass on a SUBJECT-EXCLUDED incident is REFUSED — with the grant path "
            "now fully working",
            veto.get("granted") is False and veto.get("reason") == "subject_excluded",
            str(veto.get("reason") or veto.get("__msg")),
        )

        await as_user(conn, None)
        veto_audit = await conn.fetchrow(
            """select granted, basis, is_break_glass, denial_reason
                 from hr.access_audit
                where target_token = 'hr_incident' and $1 = any(target_ids)
                order by occurred_at desc limit 1""",
            incident,
        )
        check("B2 the refusal is audited", veto_audit is not None)
        if veto_audit:
            check(
                "B3 SPEC-ACCESS §5's reason is stored VERBATIM, byte for byte",
                veto_audit["denial_reason"] == VETO_REASON,
                repr(veto_audit["denial_reason"]),
            )
            check(
                "B4 the denial records that break-glass was ON — a refusal that did not know it "
                "was refusing break-glass would prove nothing",
                veto_audit["granted"] is False and veto_audit["is_break_glass"] is True,
            )
        check(
            "B5 🚨 and NO grant was written for the vetoed incident — the veto runs FIRST, so "
            "there is nothing to revoke afterwards",
            await conn.fetchval(
                "select count(*) from hr.derived_grant where resource_id = $1", incident
            )
            == 0,
        )
        check(
            "B6 nor any iam.permissions row on hr_incident at all",
            await conn.fetchval(
                "select count(*) from iam.permissions "
                "where resource_type = 'hr_incident' and resource_id = $1",
                incident,
            )
            == 0,
        )
        # The positive control that makes B mean something: same caller, same second, a token the
        # veto does not touch — still granted. B is the veto, not a dead function.
        check(
            "B7 positive control — the SAME caller still holds the A-case grant seconds later, "
            "so B measured the veto and not a broken door",
            await conn.fetchval(
                "select hr._break_glass_active($1, 'hr_legal_hold', $2)", U_ADMIN, hold
            )
            is True,
        )

        # ══ C — IT ENDS, AND NOT EVERYONE CAN START IT. ═══════════════════════════════════════
        check(
            "C1 the grant is live right now",
            await conn.fetchval(
                "select hr._break_glass_active($1, 'hr_legal_hold', $2)", U_ADMIN, hold
            )
            is True,
        )
        await conn.execute("select set_config('hr.privileged_write','on',true)")
        await conn.execute(
            "update iam.permissions set expires_at = now() - interval '1 minute' where id = $1",
            dg and (
                await conn.fetchval(
                    "select permission_id from hr.derived_grant "
                    "where reason='break_glass' and resource_id=$1",
                    hold,
                )
            ),
        )
        check(
            "C2 with expires_at in the past, hr._break_glass_active goes false — the TTL is the "
            "live revocation mechanism (G-EXPIRES), not a decoration",
            await conn.fetchval(
                "select hr._break_glass_active($1, 'hr_legal_hold', $2)", U_ADMIN, hold
            )
            is False,
        )
        await as_user(conn, U_ADMIN)
        expired_read = await rpc(
            conn,
            "select public.hr_confidential_get('hr_legal_hold', $1, 'compliance')::text",
            hold,
        )
        check(
            "C3 🚨 and the door refuses the record again — the reach really ended, it did not "
            "merely stop being advertised",
            expired_read.get("granted") is False,
            str(expired_read.get("basis") or expired_read.get("reason")),
        )

        await as_user(conn, U_PLAIN)
        plain = await rpc(
            conn,
            "select public.hr_break_glass('hr_legal_hold', $1, 'legal', $2)::text",
            hold,
            JUSTIFICATION,
        )
        check(
            "C4 an employee holding no break_glass_allowed role is refused by name, and never "
            "reaches the grant",
            plain.get("granted") is False and plain.get("reason") == "no_break_glass_role",
            str(plain.get("reason") or plain.get("__msg")),
        )

        # C5 — the hole registration would otherwise have opened. `created_by` is populated on
        # these tables (18/18 on hr.compensation), and shareable_owner_column falls back to it, so
        # without hr._guard_audited_tier_grant the row's creator could hand a confidential record
        # to anybody with one public RPC and no hr.access_audit row.
        await as_user(conn, None)
        await conn.execute("select set_config('hr.privileged_write','',true)")
        guard = await rpc(
            conn,
            "insert into iam.permissions (resource_type, resource_id, granted_to_user_id, "
            "permission_level, status) values ('hr_compensation', $1, $2, 'viewer', 'active') "
            "returning id::text",
            await conn.fetchval("select id from hr.compensation limit 1"),
            U_PLAIN,
        )
        check(
            "C5 🚨 an unarmed iam.permissions insert on an audited-tier HR token is REFUSED "
            "(42501) — registering the sixteen did not open an unaudited side entrance",
            isinstance(guard, dict)
            and guard.get("__sqlstate") == "42501"
            and "hr_grant_forbidden" in (guard.get("__msg") or ""),
            str(guard)[:160],
        )
        control_token = await rpc(
            conn,
            "insert into iam.permissions (resource_type, resource_id, granted_to_user_id, "
            "permission_level, status) values ('hr_employee', $1, $2, 'viewer', 'active') "
            "returning id::text",
            await conn.fetchval("select id from hr.employee limit 1"),
            U_PLAIN,
        )
        check(
            "C6 control — the guard is keyed on audited-tier tokens only: an ordinary hr_employee "
            "grant still inserts, so C5 measured the guard and not a dead table",
            not (isinstance(control_token, dict) and control_token.get("__sqlstate")),
            str(control_token)[:120],
        )
        check(
            "C7 and the 23514 guard this repair deliberately did NOT loosen is still standing "
            "over unregistered tokens",
            (
                await rpc(
                    conn,
                    "insert into iam.permissions (resource_type, resource_id, granted_to_user_id, "
                    "permission_level, status) values ('hr_incident', $1, $2, 'viewer', 'active') "
                    "returning id::text",
                    incident,
                    U_PLAIN,
                )
            ).get("__sqlstate")
            in ("23514", "42501"),
        )

        check(
            "C8 zero contracts broken",
            await conn.fetchval("select count(*) from hr.function_contracts_broken()") == 0,
        )
    finally:
        await tx.rollback()

    # ── THE DISCLOSURE OBLIGATION, DISCHARGED AND RE-MEASURED. ────────────────────────────────
    left_grants = await conn.fetchval(
        "select count(*) from hr.derived_grant where reason = 'break_glass'"
    )
    left_holds = await conn.fetchval(
        "select count(*) from hr.legal_hold where matter_name like 'C3-14 PROBE%'"
    )
    left_inc = await conn.fetchval(
        "select count(*) from hr.incident where summary like 'SYNTHETIC TEST DATA — hr_c3_14%'"
    )
    check(
        f"cleanup: the proving grant is gone ({left_grants} break_glass grants live), and so are "
        f"the fixtures ({left_holds} holds, {left_inc} incidents)",
        left_grants == 0 and left_holds == 0 and left_inc == 0,
    )
    await conn.close()

    bad = 0
    print("\nhr_c3_14 — HR BREAK-GLASS FALSIFICATION\n")
    for name, ok, detail in out:
        bad += 0 if ok else 1
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
        if detail and not ok:
            print(f"         {detail}")
    print()
    if bad:
        print(f"✗ {bad} of {len(out)} assertions FAILED")
        sys.exit(1)
    print(
        f"✓ all {len(out)} assertions pass — break-glass GRANTS, the §5 veto still refuses "
        "absolutely, the grant expires, and the database is byte-identical (rolled back)."
    )


asyncio.run(main())
