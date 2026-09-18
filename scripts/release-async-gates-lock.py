#!/usr/bin/env python3
"""Acquire the common-repository advisory lock, then exec the Node worker."""
import fcntl
import os
import sys

if len(sys.argv) < 3:
    sys.stderr.write("usage: release-async-gates-lock.py LOCK_PATH NODE_WORKER...\n")
    raise SystemExit(2)

lock_path = sys.argv[1]
fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
# A detached waiter is intentional: every enqueue leaves a durable wake behind
# a live aggregate, so a killed worker cannot strand queued jobs.
fcntl.flock(fd, fcntl.LOCK_EX)
os.set_inheritable(fd, True)
env = os.environ.copy()
env["RELEASE_ASYNC_GATES_LOCK_FD"] = str(fd)
os.execvpe(sys.argv[2], sys.argv[2:], env)
