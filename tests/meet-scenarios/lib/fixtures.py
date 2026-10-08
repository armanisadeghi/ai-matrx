"""Server-side fixtures and server truth for the meet scenarios — run inside aidream's environment.

    uv run --directory <aidream> python tests/meet-scenarios/lib/fixtures.py <command> ...

Commands (each prints ONE JSON object on stdout; secrets never printed except the one-use link hash):

  member  --org <uuid> --suite <name> --purpose <text>
          A realistic person from the persona factory (aidream/testing/persona.py: tagged
          app_metadata.test_fixture with an expiry, created through the factory's GoTrue door — never
          a raw auth insert), made an active MEMBER of the host's organization, plus a one-use
          magic-link token hash. The harness opens the product's own /auth/confirm with it, the same
          door a person's emailed sign-in link opens.
  delete  --user <uuid>
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


def delete(user_id: str) -> None:
    from aidream.testing import persona as factory

    factory.delete_fixture_user(factory.fixture_target(), user_id)
    _print({"deleted": user_id})


def meeting(slug: str) -> None:
    import psycopg
    from psycopg.rows import dict_row

    from aidream.testing.live_database import live_database_url

    with psycopg.connect(live_database_url(), row_factory=dict_row) as conn:
        row = conn.execute(
            """
            select id, organization_id, room_name, started_at, ended_at,
                   metadata -> 'auto_end' as auto_end,
                   metadata -> 'note_taker' ->> 'ended_by' as ended_by
              from communication.meet_meetings
             where slug = %s and deleted_at is null
            """,
            (slug,),
        ).fetchone()
    _print({"found": row is not None, **(row or {})})


def room(name: str) -> None:
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
    g = sub.add_parser("meeting")
    g.add_argument("--slug", required=True)
    r = sub.add_parser("room")
    r.add_argument("--name", required=True)
    a = parser.parse_args()
    if a.cmd == "member":
        member(a.org, a.suite, a.purpose, a.ttl_hours)
    elif a.cmd == "delete":
        delete(a.user)
    elif a.cmd == "meeting":
        meeting(a.slug)
    else:
        room(a.name)


if __name__ == "__main__":
    main()
