#!/usr/bin/env python3
"""Host-only cooperative patrol ownership. Keep acquire's stdin open; renew its lease.

This is not a cross-host lock or a fence on remote writes. A caller must stop
work if renewal fails or expires. Never unlink the lock file (inode is identity).
"""
import argparse
import fcntl
import json
import math
import os
from pathlib import Path
import secrets
import select
import sys
import time


def emit(**value):
    print(json.dumps(value), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("acquire", "status"))
    parser.add_argument("--path", type=Path, default=Path.home() / ".codex" / "locks" / "persistent-path-patrol.lock")
    parser.add_argument("--ttl", type=float, default=900)
    parser.add_argument("--owner", default="unspecified", help="Task ID or operator label; no credentials")
    args = parser.parse_args()
    if not math.isfinite(args.ttl) or args.ttl <= 0:
        parser.error("--ttl must be positive and finite")
    if len(args.owner) > 200 or any(ord(char) < 32 for char in args.owner):
        parser.error("--owner must be at most 200 characters without control characters")
    args.path.parent.mkdir(parents=True, exist_ok=True)
    with args.path.open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            lock.seek(0)
            try:
                owner = json.loads(lock.read(4096))
            except ValueError:
                owner = {"owner": "metadata_initializing_or_unavailable"}
            emit(held=True, acquired=False, scope="this-host", owner=owner)
            return 2 if args.action == "acquire" else 0
        if args.action == "status":
            emit(held=False, scope="this-host")
            return 0
        token = secrets.token_urlsafe(32)
        lock.seek(0)
        lock.truncate()
        json.dump({"owner": args.owner, "pid": os.getpid(), "acquired_at": time.time()}, lock)
        lock.flush()
        deadline = time.monotonic() + args.ttl
        emit(acquired=True, scope="this-host", owner_token=token, pid=os.getpid(), ttl_seconds=args.ttl)
        # Read bytes directly: TextIO buffering can hide a second command from
        # select, causing a queued release/renewal to wait until lease expiry.
        pending = b""
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not select.select([sys.stdin], [], [], remaining)[0]:
                emit(released=True, reason="lease_expired")
                return 0
            chunk = os.read(sys.stdin.fileno(), 4096)
            if not chunk:
                emit(released=True, reason="owner_input_closed")
                return 0
            pending += chunk
            if len(pending) > 65536:
                emit(released=True, reason="oversized_command")
                return 1
            while b"\n" in pending:
                line, pending = pending.split(b"\n", 1)
                try:
                    request = json.loads(line)
                    valid_owner = secrets.compare_digest(str(request.get("owner_token", "")), token)
                except (ValueError, AttributeError):
                    emit(ok=False, error="invalid_json_command")
                    continue
                if not valid_owner:
                    emit(ok=False, error="owner_token_mismatch")
                elif request.get("action") == "renew":
                    deadline = time.monotonic() + args.ttl
                    emit(ok=True, renewed=True, ttl_seconds=args.ttl)
                elif request.get("action") == "release":
                    emit(ok=True, released=True, reason="owner_released")
                    return 0
                else:
                    emit(ok=False, error="unknown_action")


if __name__ == "__main__":
    raise SystemExit(main())
