#!/usr/bin/env python3
"""Run a command with a REAL controlling terminal on its stdin/stdout, type one
answer at it, and print everything it wrote.

`script(1)` cannot do this from a test runner: on macOS it calls tcgetattr on its
OWN stdin, which is a pipe under Jest, and dies. `pty.openpty()` has no such
requirement and is the same primitive underneath.

    python3 pty-run.py <answer> -- <cmd> [args...]

<answer> may be the empty string, in which case nothing is typed.
"""
import os, pty, select, subprocess, sys, time

answer = sys.argv[1]
sep = sys.argv.index("--")
cmd = sys.argv[sep + 1:]

master, slave = pty.openpty()
p = subprocess.Popen(cmd, stdin=slave, stdout=slave, stderr=slave, close_fds=True)
os.close(slave)

if answer != "":
    time.sleep(0.4)
    os.write(master, (answer + "\n").encode())

out = b""
deadline = time.time() + 120
while time.time() < deadline:
    r, _, _ = select.select([master], [], [], 0.5)
    if r:
        try:
            chunk = os.read(master, 65536)
        except OSError:
            break
        if not chunk:
            break
        out += chunk
    elif p.poll() is not None:
        break
p.wait(timeout=30)
os.close(master)
sys.stdout.write(out.decode("utf-8", "replace"))
