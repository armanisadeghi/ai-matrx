#!/usr/bin/env python3
"""Plant ONE mutation into a production file, run a test command, ALWAYS restore.

THE way to run a forcing-function-tests §3 mutation pass in a SHARED CHECKOUT, where dozens of
sessions and deploy agents edit and commit the same tree. Born from a 2026-09-10 test-truth campaign
in which hand-rolled plants left mutations on disk three times and peer sweep commits captured three
live mutations (one an auth bypass). Every guarantee below answers one of those incidents.

- Per-file lock: two plants on the same file serialize (lock dir, stale-pid steal).
- The mutation lives on disk only for the command; restore runs in `finally` and on SIGINT/SIGTERM.
- Restore locates the mutation by its surrounding CONTEXT, so a peer's edit elsewhere in the file
  survives (a deletion mutation included). If it cannot, it screams and exits 3.
- Bytecode isolation: the command runs with a fresh PYTHONPYCACHEPREFIX and PYTHONDONTWRITEBYTECODE=1,
  and the file's mtime is pushed >=2s past any previous value on both write and restore. (Python
  validates .pyc by whole-second mtime + size, so a same-size mutation could otherwise run stale
  bytecode: a false GREEN, or mutated bytecode cached against the restored source.)
- Captured-mutation detection: HEAD is recorded before planting; after restore, every commit that
  touched the file since then (HEAD and origin/main) is checked for the mutation's context anchor.
  A hit screams and exits 5: revert that hunk and push immediately.
- A RED only counts when the output names what you expected (--must-mention), so an import error,
  a missing pytest, or a jest path pattern that matched nothing is never mistaken for a kill.

Usage:
  plant.py --file PATH (--old STR | --old-file F) (--new STR | --new-file F) \\
           [--expect red|green] [--must-mention STR ...] [--timeout SEC] [--lock-wait SEC] -- CMD...

Last line is the verdict: VERDICT: RED | GREEN | RED-BUT-UNNAMED.
Exit: 0 matched --expect · 1 did not · 2 bad spec · 3 RESTORE FAILURE · 4 lock timeout ·
      5 MUTATION WAS COMMITTED. Treat 3 and 5 as stop-everything.
Keep CMD to a single test file: the window during which a peer can commit your mutation is CMD's runtime.
Self-test: plant_selftest.sh beside this file.
"""
import argparse
import hashlib
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time

STATE_DIR = os.environ.get("PLANT_STATE_DIR") or os.path.join(tempfile.gettempdir(), "plant-mutation-state")
CTX = 60


def sha(b):
    return hashlib.sha256(b).hexdigest()


def log(name, line):
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(os.path.join(STATE_DIR, name), "a") as f:
        f.write(f"{time.strftime('%F %T')} {line}\n")


def bump_mtime(path, floor_ns):
    t = max(time.time_ns(), floor_ns + 2_000_000_000)
    os.utime(path, ns=(t, t))
    return t


def git(repo, *args):
    p = subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True)
    return p.returncode, p.stdout


def repo_of(path):
    rc, out = git(os.path.dirname(path), "rev-parse", "--show-toplevel")
    return out.strip() if rc == 0 else None


def committed_mutation(path, start_head, anchor):
    repo = repo_of(path)
    if not repo or not start_head:
        return []
    rel = os.path.relpath(path, repo)
    hits = []
    for ref in ("HEAD", "origin/main"):
        rc, out = git(repo, "log", "--format=%H", f"{start_head}..{ref}", "--", rel)
        if rc != 0:
            continue
        for commit in out.split():
            rc2, blob = git(repo, "show", f"{commit}:{rel}")
            if rc2 == 0 and anchor in blob and commit not in hits:
                hits.append(commit)
    return hits


def pid_alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def acquire_lock(path, wait):
    d = os.path.join(STATE_DIR, "locks", hashlib.sha1(path.encode()).hexdigest())
    os.makedirs(os.path.dirname(d), exist_ok=True)
    start = time.time()
    announced = False
    while True:
        try:
            os.mkdir(d)
            with open(os.path.join(d, "pid"), "w") as f:
                f.write(f"{os.getpid()}\n{path}\n")
            return d
        except FileExistsError:
            try:
                owner = int(open(os.path.join(d, "pid")).read().split()[0])
                if not pid_alive(owner):
                    shutil.rmtree(d, ignore_errors=True)
                    continue
            except (OSError, ValueError, IndexError):
                if time.time() - os.path.getmtime(d) > 30:
                    shutil.rmtree(d, ignore_errors=True)
                    continue
            if not announced:
                print(f"waiting for plant lock on {path} (another plant is using this file)")
                announced = True
            if time.time() - start > wait:
                return None
            time.sleep(2)


def main():
    argv = sys.argv[1:]
    if "--" not in argv:
        print("need -- CMD", file=sys.stderr)
        return 2
    i = argv.index("--")
    opts, cmd = argv[:i], argv[i + 1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--old")
    ap.add_argument("--old-file")
    ap.add_argument("--new")
    ap.add_argument("--new-file")
    ap.add_argument("--expect", choices=["red", "green"], default="red")
    ap.add_argument("--must-mention", action="append", default=[])
    ap.add_argument("--timeout", type=int, default=900)
    ap.add_argument("--lock-wait", type=int, default=1800)
    a = ap.parse_args(opts)
    old = a.old if a.old is not None else open(a.old_file).read() if a.old_file else None
    new = a.new if a.new is not None else open(a.new_file).read() if a.new_file else None
    if old is None or new is None or not cmd:
        print("need --old/--old-file, --new/--new-file and CMD", file=sys.stderr)
        return 2
    path = os.path.abspath(a.file)
    lock = acquire_lock(path, a.lock_wait)
    if lock is None:
        print(f"LOCK TIMEOUT on {path}", file=sys.stderr)
        return 4
    try:
        return run(a, path, old, new, cmd)
    finally:
        shutil.rmtree(lock, ignore_errors=True)


def run(a, path, old, new, cmd):
    orig = open(path, "rb").read()
    text = orig.decode()
    n = text.count(old)
    if n != 1:
        print(f"BAD SPEC: --old occurs {n} times in {path} (need exactly 1)", file=sys.stderr)
        return 2
    idx = text.index(old)
    before = text[max(0, idx - CTX):idx]
    after = text[idx + len(old):idx + len(old) + CTX]
    mutated_text = text[:idx] + new + text[idx + len(old):]
    if mutated_text == text:
        print("BAD SPEC: mutation is a no-op", file=sys.stderr)
        return 2
    mutated = mutated_text.encode()
    anchor = before + new + after
    orig_mtime = os.stat(path).st_mtime_ns
    repo = repo_of(path)
    start_head = git(repo, "rev-parse", "HEAD")[1].strip() if repo else None
    state = {"restored": False, "fail": False, "mut_mtime": orig_mtime}

    def fail(msg):
        state["fail"] = True
        print(f"RESTORE FAILURE: {msg}. Original sha {sha(orig)}. FIX BY HAND NOW.", file=sys.stderr)
        log("RESTORE_FAILURES.log", f"{path} {msg} orig_sha={sha(orig)} old={old!r} new={new!r}")

    def restore():
        if state["restored"]:
            return
        state["restored"] = True
        cur = open(path, "rb").read()
        if cur == mutated:
            open(path, "wb").write(orig)
        elif cur == orig:
            pass
        else:
            ct = cur.decode()
            hits = ct.count(anchor)
            if hits == 1:
                j = ct.index(anchor) + len(before)
                open(path, "wb").write((ct[:j] + old + ct[j + len(new):]).encode())
                print(f"WARNING: {path} was edited by someone else during the window; mutation reversed "
                      "by context, their edit kept.", file=sys.stderr)
            else:
                fail(f"{path} changed during the window and the mutation's context occurs {hits} times")
                return
        bump_mtime(path, state["mut_mtime"])
        fin = open(path, "rb").read()
        print(f"RESTORED {path} sha={sha(fin)[:12]} original_sha={sha(orig)[:12]} "
              f"{'IDENTICAL' if fin == orig else 'PEER-EDIT-PRESERVED'}")

    def on_sig(_signum, _frame):
        restore()
        sys.exit(3)

    signal.signal(signal.SIGINT, on_sig)
    signal.signal(signal.SIGTERM, on_sig)

    pyc = tempfile.mkdtemp(prefix="plant-pyc-")
    env = dict(os.environ, PYTHONPYCACHEPREFIX=pyc, PYTHONDONTWRITEBYTECODE="1")
    out = ""
    rc = None
    try:
        open(path, "wb").write(mutated)
        state["mut_mtime"] = bump_mtime(path, orig_mtime)
        print(f"PLANTED in {path}")
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=a.timeout, env=env)
            rc, out = p.returncode, p.stdout + p.stderr
        except subprocess.TimeoutExpired as e:
            rc, out = 124, f"TIMEOUT after {a.timeout}s\n{e.stdout or ''}{e.stderr or ''}"
    finally:
        restore()
        shutil.rmtree(pyc, ignore_errors=True)
    if state["fail"]:
        return 3
    if anchor not in orig.decode():
        leaked = committed_mutation(path, start_head, anchor)
        if leaked:
            msg = (f"MUTATION COMMITTED: {path} — commit(s) {', '.join(c[:10] for c in leaked)} captured the "
                   "planted mutation while it was live. Revert that hunk NOW (restore the original snippet) and push.")
            print(msg, file=sys.stderr)
            log("COMMITTED_MUTATIONS.log", f"{msg} old={old!r} new={new!r}")
            return 5
    tail = "\n".join(out.splitlines()[-60:])
    print("----- command output (tail) -----")
    print(tail)
    print("---------------------------------")
    missing = [m for m in a.must_mention if m not in out]
    verdict = "RED" if rc != 0 else "GREEN"
    if verdict == "RED" and missing:
        print(f"VERDICT: RED-BUT-UNNAMED (command failed but output lacks {missing}; "
              "not a valid red — probably the wrong reason)")
        return 1
    print(f"VERDICT: {verdict} (rc={rc}, expected {a.expect.upper()})")
    return 0 if verdict.lower() == a.expect else 1


if __name__ == "__main__":
    sys.exit(main())
