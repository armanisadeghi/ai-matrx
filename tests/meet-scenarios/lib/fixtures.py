"""Server-side fixtures and server truth for the meet scenarios — run inside aidream's environment.

    uv run --directory <aidream> python tests/meet-scenarios/lib/fixtures.py <command> ...

Commands (each prints ONE JSON object on stdout; secrets never printed except the one-use link hash):

  member  --org <uuid> --suite <name> --purpose <text>
          A realistic person from the persona factory (aidream/testing/persona.py: tagged
          app_metadata.test_fixture with an expiry, created through the factory's GoTrue door — never
          a raw auth insert), made an active MEMBER of the host's organization, plus a one-use
          magic-link token hash. The harness opens the product's own /auth/confirm with it, the same
          door a person's emailed sign-in link opens.
  delete  --user <uuid> [--org <uuid>]
          Teardown through the factory (the fixture sweeper is the net if a run dies first).
  meeting --slug <slug>
          Server truth for one meeting: id, organization, room, ended_at, and metadata.auto_end
          (what the product's own auto-end wrote when IT ended the meeting).
  room    --name <room>
          LiveKit truth: does the room exist right now, and who is in it.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from typing import Any


def _print(obj: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj, default=str) + "\n")


def member(org: str, suite: str, purpose: str, ttl_hours: float) -> None:
    import psycopg

    from aidream.testing import persona as factory

    target = factory.fixture_target()
    user = factory.create_fixture_user(
        target, suite=suite, purpose=purpose, ttl_hours=ttl_hours
    )
    try:
        assert target.dsn, "fixture target has no database url"
        with psycopg.connect(target.dsn) as conn:
            conn.execute(
                """
                insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
                values (%s, 'organization', %s, %s, 'member', 'active')
                """,
                (org, org, user.user_id),
            )
            conn.commit()
        # The factory's own GoTrue door (the only one allowed); a magic link, as a person would be emailed.
        link = factory._gotrue(
            target, "POST", "generate_link", {"type": "magiclink", "email": user.persona.email}
        )
        token_hash = link.get("hashed_token") or (link.get("properties") or {}).get("hashed_token")
        if not token_hash:
            raise RuntimeError("generate_link returned no hashed_token")
    except Exception:
        factory.delete_fixture_user(target, user.user_id)
        raise
    _print(
        {
            "user_id": user.user_id,
            "email": user.persona.email,
            "full_name": user.persona.full_name,
            "company": user.persona.company,
            "organization_id": org,
            "token_hash": token_hash,
            "expires_at": user.tag.get("expires_at"),
        }
    )


def delete(user_id: str, org: str | None) -> None:
    import psycopg

    from aidream.testing import persona as factory

    target = factory.fixture_target()
    removed = 0
    if org and target.dsn:
        # The membership this helper added goes first, so the host's organization is clean at once
        # even when the account delete below is slow (the factory's sweep clears dependents).
        with psycopg.connect(target.dsn) as conn:
            removed = conn.execute(
                "delete from iam.memberships where organization_id = %s and user_id = %s and container_type = 'organization'",
                (org, user_id),
            ).rowcount
            conn.commit()
    factory.delete_fixture_user(target, user_id)
    _print({"deleted": user_id, "memberships_removed": removed})


def meeting(slug: str) -> None:
    import psycopg
    from psycopg.rows import dict_row

    from aidream.testing.live_database import live_database_url

    with psycopg.connect(live_database_url(), row_factory=dict_row) as conn:
        row = conn.execute(
            """
            select m.id, m.organization_id, m.room_name, m.started_at, m.ended_at,
                   m.metadata -> 'auto_end' as auto_end,
                   (select s.note_taker ->> 'ended_by'
                      from communication.meet_sessions s
                     where s.meeting_id = m.id
                     order by s.started_at desc limit 1) as ended_by
              from communication.meet_meetings m
             where m.slug = %s and m.deleted_at is null
            """,
            (slug,),
        ).fetchone()
    _print({"found": row is not None, **(row or {})})


def _conn():
    import psycopg
    from psycopg.rows import dict_row

    from aidream.testing.live_database import live_database_url

    return psycopg.connect(live_database_url(), row_factory=dict_row)


def deadlines(slug: str) -> None:
    """Read-only: the run(s) of this meeting and every deadline job (workflow.run) armed for it."""
    with _conn() as conn:
        m = conn.execute("select id from communication.meet_meetings where slug = %s", (slug,)).fetchone()
        if not m:
            _print({"found": False})
            return
        sessions = conn.execute(
            """select id, started_at, ended_at, emptied_at, metadata ->> 'last_room_finished_at' as last_room_finished_at
                 from communication.meet_sessions where meeting_id = %s order by started_at""",
            (m["id"],),
        ).fetchall()
        jobs = conn.execute(
            """select id, status, created_at, updated_at, input ->> 'kind' as kind, input ->> 'slot' as slot,
                      input ->> 'armed_by' as armed_by, output -> 'decide_deadline' ->> 'outcome' as outcome
                 from workflow.run where input ->> 'meeting_id' = %s and input ? 'kind' order by created_at""",
            (str(m["id"]),),
        ).fetchall()
    _print({"found": True, "meeting_id": str(m["id"]), "sessions": sessions, "jobs": jobs})


def notifications(meeting_id: str, event_key: str) -> None:
    """Read-only: platform notification rows for one meeting + event."""
    with _conn() as conn:
        rows = conn.execute(
            """select id, event_key, channel, status, recipient_user_id, subject, created_at
                 from communication.notification
                where target_id = %s and event_key = %s and deleted_at is null order by created_at""",
            (meeting_id, event_key),
        ).fetchall()
    _print({"count": len(rows), "rows": rows})


def profile_check() -> None:
    """Read-only: user-level meet.behavior_profile overrides held by admin@admin.com (should be none)."""
    with _conn() as conn:
        rows = conn.execute(
            """select o.organization_id, o.value, o.updated_at
                 from platform.knob_override o join auth.users u on u.id = o.scope_id
                where o.feature = 'meet' and o.key = 'behavior_profile' and o.scope_kind = 'user'
                  and u.email = 'admin@admin.com'""",
        ).fetchall()
    _print({"overrides": rows})


def room(name: str) -> None:
    import os
    from pathlib import Path

    from dotenv import dotenv_values

    for key, value in dotenv_values(Path.cwd() / ".env").items():
        if key.startswith("LIVEKIT_") and value and key not in os.environ:
            os.environ[key] = value
    from aidream.services.meet.livekit import list_participants, list_rooms, load_livekit_config

    async def run() -> dict[str, Any]:
        config = load_livekit_config()
        rooms = await list_rooms(config)
        exists = any(str(r.get("name")) == name for r in rooms)
        people = await list_participants(config, room=name) if exists else []
        return {
            "room": name,
            "exists": exists,
            "participants": [str(p.get("identity") or "?") for p in people],
        }

    _print(asyncio.run(run()))


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    m = sub.add_parser("member")
    m.add_argument("--org", required=True)
    m.add_argument("--suite", default="matrx-frontend/tests/meet-scenarios")
    m.add_argument("--purpose", default="signed-in member of the host's organization")
    m.add_argument("--ttl-hours", type=float, default=3)
    d = sub.add_parser("delete")
    d.add_argument("--user", required=True)
    d.add_argument("--org")
    g = sub.add_parser("meeting")
    g.add_argument("--slug", required=True)
    dl = sub.add_parser("deadlines")
    dl.add_argument("--slug", required=True)
    nt = sub.add_parser("notifications")
    nt.add_argument("--meeting-id", required=True)
    nt.add_argument("--event", default="meet.knock_waiting")
    sub.add_parser("profile-check")
    r = sub.add_parser("room")
    r.add_argument("--name", required=True)
    a = parser.parse_args()
    if a.cmd == "member":
        member(a.org, a.suite, a.purpose, a.ttl_hours)
    elif a.cmd == "delete":
        delete(a.user, a.org)
    elif a.cmd == "meeting":
        meeting(a.slug)
    elif a.cmd == "deadlines":
        deadlines(a.slug)
    elif a.cmd == "notifications":
        notifications(a.meeting_id, a.event)
    elif a.cmd == "profile-check":
        profile_check()
    else:
        room(a.name)


if __name__ == "__main__":
    main()
