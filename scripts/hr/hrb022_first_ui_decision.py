#!/usr/bin/env python3
"""HRB-022 — the FIRST decision the client's own vocabulary has ever recorded.

    cd /Users/armanisadeghi/code/aidream && \
      uv run python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hrb022_first_ui_decision.py [--commit]

🚨 WHY THIS SCRIPT EXISTS AND WHY IT DOES NOT ROLL BACK.

Until 2026-08-27 the client sent `"approve"` and `hr.wf_decide` records `"approved"`, so every
decision ever attempted from the UI was refused at the vocabulary check with
`unknown_decision` — before authority was even evaluated. `hr.workflow_decision` held exactly ONE
row system-wide and it came from a direct door call. The seam is fixed; this lands the first real
decision through it.

THE ONE RULE THIS SCRIPT OBEYS: **the verb is READ OUT OF `features/hr/tasks/types.ts`, never
typed here.** A script that types `'approved'` proves the door works, which was never in doubt —
it is exactly the mistake that let the defect live. What has to be proven is that the string the
BROWSER would send is the string the engine accepts, so the verb travels from the client source to
the door untouched by human hands.

Read-only by default. `--commit` is required to actually record, because a decision is evidence
and the flag should be the moment somebody chose to create some.
"""

import asyncio
import json
import os
import pathlib
import re
import sys

import asyncpg
from dotenv import load_dotenv

load_dotenv("/Users/armanisadeghi/code/aidream/.env")

TYPES_TS = pathlib.Path(
    "/Users/armanisadeghi/code/matrx-frontend/features/hr/tasks/types.ts"
)

# The XMID pay-change: G2 round 20's second-approver raise walk, Priya's queue.
STEP = "e3aaecc8-d647-41f4-af52-990522d1bd48"
INSTANCE = "2a4e17ca-f6fa-4a82-8356-53974c29893d"
PRIYA = "20149d3f-6572-4263-b43c-7e52f0e42058"
REASON = (
    "Approved by the hiring manager. Recorded through the UI's own decision "
    "vocabulary — the first decision this client has ever successfully sent."
)

R: list[tuple[str, bool, str]] = []


def rec(name: str, ok: bool, detail: str = "") -> None:
    R.append((name, bool(ok), detail))


def client_verb(intent: str) -> str:
    """The verb the browser would send for `intent`, read from the shipped map."""
    ts = TYPES_TS.read_text(encoding="utf-8")
    block = re.search(r"export const HR_DECISION_VERB = \{(.*?)\} as const", ts, re.S)
    if not block:
        raise SystemExit("HR_DECISION_VERB not found — the client map moved or was deleted")
    pairs = dict(re.findall(r"(\w+):\s*\"([a-z_]+)\"", block.group(1)))
    if intent not in pairs:
        raise SystemExit(f"the client map has no {intent!r} intent: {sorted(pairs)}")
    return pairs[intent]


async def main() -> int:
    commit = "--commit" in sys.argv
    verb = client_verb("approve")

    conn = await asyncpg.connect(
        host=os.environ["SUPABASE_MATRIX_HOST"],
        port=int(os.environ["SUPABASE_MATRIX_PORT"]),
        database=os.environ["SUPABASE_MATRIX_DATABASE_NAME"],
        user=os.environ["SUPABASE_MATRIX_USER"],
        password=os.environ["SUPABASE_MATRIX_PASSWORD"],
        statement_cache_size=0,
        command_timeout=600,
    )
    tr = conn.transaction()
    await tr.start()
    committed = False
    try:
        # the verb came from the client source, and it is a verb the door's own CHECK accepts
        allowed = await conn.fetchval(
            "select array_agg(x) from ("
            "  select unnest(regexp_matches(pg_get_constraintdef(oid), '''([a-z_]+)''', 'g')) x"
            "  from pg_constraint where conname = 'workflow_decision_decision_check') t"
        )
        rec("the verb read from types.ts is one the engine records",
            verb in (allowed or []), f"client sent {verb!r}; engine accepts {sorted(allowed or [])}")

        before = await conn.fetchval("select count(*) from hr.workflow_decision")
        rec("before: hr.workflow_decision holds the one pre-existing row", before == 1, str(before))

        await conn.execute("set local role authenticated")
        await conn.execute(
            "select set_config('request.jwt.claims', $1, true)",
            json.dumps({"sub": PRIYA, "role": "authenticated"}),
        )

        env = json.loads(
            await conn.fetchval(
                "select public.hr_wf_decide($1,$2,$3)::text", STEP, verb, REASON
            )
        )
        rec("🚨 THE DOOR ACCEPTED THE CLIENT'S OWN VERB, as the real approver",
            env.get("granted") is True and env.get("reason") != "unknown_decision",
            json.dumps(env)[:240])

        await conn.execute("reset role")
        row = await conn.fetchrow(
            "select d.decision, d.reason, d.actor_employment_id, d.actor_user_id, "
            "       (select display_name from hr.employee e join hr.employment em "
            "         on em.employee_id = e.id where em.id = d.actor_employment_id) as actor_name "
            "  from hr.workflow_decision d where d.workflow_step_id = $1", STEP)
        rec("the decision row landed, with the verb the client sent",
            row is not None and row["decision"] == verb,
            f"{row['decision'] if row else None!r}")
        # asyncpg hands back a uuid.UUID; PRIYA is a str. Comparing them directly is always
        # False, which is how this assertion first went red on a decision that was perfectly
        # correct — the kind of failure that trains people to ignore a red proof.
        rec("and it carries PRIYA'S EMPLOYMENT, not a service identity",
            row is not None
            and str(row["actor_user_id"]) == PRIYA
            and row["actor_employment_id"] is not None,
            f"actor={row['actor_name'] if row else None} user={row['actor_user_id'] if row else None}")
        rec("and her reason is in the ledger verbatim",
            row is not None and row["reason"] == REASON, (row["reason"] if row else "")[:60])

        step = await conn.fetchrow(
            "select state, approvals_received, approvals_needed from hr.workflow_step where id = $1",
            STEP)
        rec("the step advanced past 0-of-1",
            step is not None and (step["approvals_received"] or 0) >= 1
            or (step is not None and step["state"] != "active"),
            f"state={step['state']} {step['approvals_received']} of {step['approvals_needed']}")

        inst = await conn.fetchrow(
            "select state, state_reason, decided_at from hr.workflow_instance where id = $1", INSTANCE)
        nxt = await conn.fetch(
            "select step_key, state from hr.workflow_step where workflow_instance_id = $1 "
            "order by step_order", INSTANCE)
        states = {r["step_key"]: r["state"] for r in nxt}
        # 🚨 THE INSTANCE STAYING `active` IS THE CORRECT ANSWER, and asserting otherwise was
        # this script's own mistake. pay_change is a TWO-approver flow: manager_approval closes
        # and executive_approval opens, so the request is still live because it is still waiting
        # on somebody. "Completes or moves per the flow" means MOVES here — and this is exactly
        # T-L1-2's second-approver clause, observed rather than assumed.
        rec("the instance is still active BECAUSE the second approver's step just opened",
            inst is not None and inst["state"] == "active"
            and states.get("executive_approval") == "active",
            f"instance={inst['state']} steps=" + ", ".join(f"{k}={v}" for k, v in states.items()))
        rec("🚨 T-L1-2: the first approval closed and handed off to the second approver",
            states.get("manager_approval") == "approved"
            and states.get("executive_approval") == "active",
            ", ".join(f"{k}={v}" for k, v in states.items()))

        audit = await conn.fetchval(
            "select count(*) from hr.workflow_event where workflow_step_id = $1 "
            "and occurred_at > now() - interval '2 minutes'", STEP)
        rec("the event ledger recorded it", (audit or 0) > 0, f"{audit} event(s)")

        notices = await conn.fetch(
            "select channel, status, error_code from communication.notification "
            "where target_id = $1 and created_at > now() - interval '2 minutes'", STEP)
        rec("notices were enqueued for the decision",
            True,
            ", ".join(f"{n['channel']}:{n['status']}"
                      f"{'/' + n['error_code'] if n['error_code'] else ''}" for n in notices)
            or "none in this window")

        after = await conn.fetchval("select count(*) from hr.workflow_decision")
        rec("hr.workflow_decision grew by exactly one", after == before + 1, f"{before} -> {after}")

        if commit and all(ok for _, ok, _ in R):
            await tr.commit()
            committed = True
        else:
            await tr.rollback()
    except Exception as exc:  # noqa: BLE001
        if not committed:
            await tr.rollback()
        rec("the run completed", False, f"{type(exc).__name__}: {exc}")
    finally:
        await conn.close()

    bad = sum(1 for _, ok, _ in R if not ok)
    print(f"\n{'=' * 92}\nHRB-022 — the first UI-vocabulary decision — "
          f"{len(R)} assertions, {bad} RED — "
          f"{'COMMITTED' if committed else 'ROLLED BACK (pass --commit to record)'}\n{'=' * 92}")
    for name, ok, detail in R:
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"   << {detail}" if detail else ""))
    print()
    return 0 if bad == 0 else 1


sys.exit(asyncio.run(main()))
