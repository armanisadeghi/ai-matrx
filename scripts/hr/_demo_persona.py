"""The one door the HR staging scripts use to get a demo person (junk-data-cleanup, 2026-09-30).

The permanent HR demo personas already exist, tagged `app_metadata.test_fixture` (suite
`hr-demo`, `expires_at` null), and are named by id in `common-docs/projects/junk-data-cleanup/
renames.md`. A staging script therefore LOOKS THEM UP BY ID and reads the mailbox back from the
auth admin API: no mailbox is ever typed into a script, so the persona's address can change
without touching a script.

If the id no longer exists (a database refresh, a sweep), the script does not hand-roll an
account: it asks the persona factory (aidream/aidream/testing/persona.py) for a new realistic
person, tagged with a 7-day expiry so the sweeper removes it. The new person carries a new id,
which the caller uses from then on.
"""

from __future__ import annotations

import sys
from typing import Any

AIDREAM = "/Users/armanisadeghi/code/aidream"
SUITE = "hr-demo"
RECREATED_TTL_HOURS = 24 * 7


async def resolve_demo_persona(
    http: Any, base: str, admin_hdr: dict[str, str], user_id: str, *, purpose: str
) -> tuple[str, str]:
    """Return `(user_id, email)` for a demo persona: the existing one by id, else a factory-made one."""
    r = await http.get(f"{base}/auth/v1/admin/users/{user_id}", headers=admin_hdr)
    if r.status_code < 300:
        return r.json()["id"], r.json()["email"]
    if r.status_code != 404:
        raise SystemExit(f"demo persona lookup failed: HTTP {r.status_code} {r.text[:200]}")
    if AIDREAM not in sys.path:
        sys.path.insert(0, AIDREAM)
    from aidream.testing.persona import create_fixture_user, live_target

    made = create_fixture_user(
        live_target(reason=f"HR demo persona {user_id} is gone; staging {purpose}"),
        suite=SUITE,
        purpose=purpose,
        ttl_hours=RECREATED_TTL_HOURS,
    )
    print(f"demo persona    RE-MADE   {made.user_id}  expires {made.tag['expires_at']} (the old id {user_id} no longer exists)")
    return made.user_id, made.email
