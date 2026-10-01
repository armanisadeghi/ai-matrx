#!/usr/bin/env python3
"""Test: the two GO-time switches in scripts/sync-main.py — the pause and the old-path refusal —
do nothing when their file is absent and do exactly their job when it is present.
Run: python3 scripts/test_sync_main_go_switches.py

Every case runs a REAL sweep, in a throwaway clone whose origin is a throwaway bare repo; the
real checkout is never touched. SYNC_MAIN_PATH points the suite at another copy of the script
(how the suite was proven red against the version without the switches)."""
import datetime
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.environ.get("SYNC_MAIN_PATH") or os.path.join(HERE, "sync-main.py")
SHIP = os.path.join(os.path.dirname(HERE), "ship.sh")
PAUSE = ".matrx/sync-paused"
MOVED = ".matrx/moved-paths.txt"


def sh(cwd, *args, check=True):
    r = subprocess.run(list(args), cwd=cwd, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise AssertionError("%s failed: %s%s" % (" ".join(args), r.stdout, r.stderr))
    return r


class Repo:
    """origin.git (bare) + work/ (a clone on main with one commit), both in a temp folder."""

    def __init__(self):
        self.tmp = tempfile.mkdtemp(prefix="sync-main-go-")
        self.origin = os.path.join(self.tmp, "origin.git")
        self.work = os.path.join(self.tmp, "work")
        sh(self.tmp, "git", "init", "-q", "--bare", "-b", "main", self.origin)
        sh(self.tmp, "git", "clone", "-q", self.origin, self.work)
        for c in (["config", "user.email", "t@t"], ["config", "user.name", "t"],
                  ["checkout", "-q", "-b", "main"]):
            sh(self.work, "git", *c)
        self.write(".gitignore", ".matrx/sync-paused\n")
        self.write("features/chat/kept.ts", "export const kept = 1;\n")
        sh(self.work, "git", "add", "-A")
        sh(self.work, "git", "commit", "-q", "-m", "init")
        sh(self.work, "git", "push", "-q", "origin", "main")

    def write(self, rel, text, mode="w"):
        p = os.path.join(self.work, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, mode) as f:
            f.write(text)
        return p

    def exists(self, rel):
        return os.path.lexists(os.path.join(self.work, rel))

    def read(self, rel):
        with open(os.path.join(self.work, rel), "rb") as f:
            return f.read()

    def sweep(self, *args):
        return sh(self.work, sys.executable, SCRIPT, *args, check=False)

    def head(self, ref="HEAD", repo=None):
        return sh(repo or self.work, "git", "rev-parse", ref).stdout.strip()

    def origin_head(self):
        return sh(self.origin, "git", "rev-parse", "main").stdout.strip()

    def tracked(self, rel):
        return sh(self.work, "git", "ls-files", "--error-unmatch", rel, check=False).returncode == 0

    def close(self):
        shutil.rmtree(self.tmp, ignore_errors=True)


class Base(unittest.TestCase):
    def setUp(self):
        self.r = Repo()

    def tearDown(self):
        self.r.close()


class Pause(Base):
    def test_no_pause_file_sweeps_as_before(self):
        self.r.write("notes.md", "work\n")
        res = self.r.sweep()
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertTrue(self.r.tracked("notes.md"))
        self.assertEqual(self.r.origin_head(), self.r.head())
        self.assertNotIn("PAUSE", res.stdout + res.stderr)
        self.assertNotIn("old-path refusal", res.stdout + res.stderr)

    def test_pause_stops_every_sweep_and_touches_nothing(self):
        self.r.write("notes.md", "work\n")
        before, origin_before = self.r.head(), self.r.origin_head()
        res = self.r.sweep("--pause", "chat package move", "--minutes", "30", "--by", "owner")
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertTrue(self.r.exists(PAUSE))
        res = self.r.sweep()
        self.assertEqual(res.returncode, 3, res.stdout + res.stderr)
        self.assertIn("SYNC PAUSED by owner", res.stderr)
        self.assertIn("chat package move", res.stderr)
        self.assertIn("--resume", res.stderr)
        self.assertEqual(self.r.head(), before)
        self.assertEqual(self.r.origin_head(), origin_before)
        self.assertFalse(self.r.tracked("notes.md"))
        self.assertFalse(self.r.tracked(PAUSE))
        status = self.r.sweep("--status")
        self.assertIn("SYNC PAUSED by owner", status.stdout)
        res = self.r.sweep("--resume")
        self.assertEqual(res.returncode, 0)
        self.assertFalse(self.r.exists(PAUSE))
        res = self.r.sweep()
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertTrue(self.r.tracked("notes.md"))
        self.assertFalse(self.r.tracked(PAUSE))

    def test_expired_pause_is_removed_and_sweep_runs(self):
        self.r.write(PAUSE, "by: owner\nreason: forgotten\nsince: 2026-01-01T00:00:00+00:00\n"
                            "until: 2026-01-01T01:00:00+00:00\n")
        self.r.write("notes.md", "work\n")
        res = self.r.sweep()
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertIn("SYNC PAUSE EXPIRED", res.stdout)
        self.assertFalse(self.r.exists(PAUSE))
        self.assertTrue(self.r.tracked("notes.md"))

    def test_hand_written_pause_can_never_outlive_the_cap(self):
        far = (datetime.datetime.now().astimezone() + datetime.timedelta(days=30)).isoformat()
        p = self.r.write(PAUSE, "by: owner\nreason: forever\nuntil: %s\n" % far)
        old = datetime.datetime.now().timestamp() - 9 * 3600     # written 9 h ago, cap is 8 h
        os.utime(p, (old, old))
        self.assertEqual(self.r.sweep().returncode, 0)
        self.assertFalse(self.r.exists(PAUSE))

    def test_unreadable_until_still_expires(self):
        p = self.r.write(PAUSE, "paused, no until line\n")
        self.assertEqual(self.r.sweep().returncode, 3)          # fresh file: paused
        old = datetime.datetime.now().timestamp() - 2 * 3600    # default is 90 min
        os.utime(p, (old, old))
        self.assertEqual(self.r.sweep().returncode, 0)

    def test_pause_refuses_unbounded_or_empty(self):
        self.assertNotEqual(self.r.sweep("--pause", "x", "--minutes", "100000").returncode, 0)
        self.assertNotEqual(self.r.sweep("--pause").returncode, 0)
        self.assertFalse(self.r.exists(PAUSE))

    def test_ship_sh_releases_nothing_while_paused(self):
        os.makedirs(os.path.join(self.r.work, "scripts"))
        shutil.copy(SHIP, os.path.join(self.r.work, "ship.sh"))
        shutil.copy(SCRIPT, os.path.join(self.r.work, "scripts", "sync-main.py"))
        marker = os.path.join(self.r.tmp, "released")
        self.r.write("scripts/release.sh", "#!/bin/bash\ntouch %s\n" % marker)
        self.r.write("scripts/check-conflict-markers.py", "print('clean')\n")
        os.chmod(os.path.join(self.r.work, "scripts", "release.sh"), 0o755)
        sh(self.r.work, sys.executable, "scripts/sync-main.py", "--pause", "move", "--minutes", "5")
        res = sh(self.r.work, "bash", "ship.sh", check=False)
        self.assertEqual(res.returncode, 3, res.stdout + res.stderr)
        self.assertIn("release skipped", res.stdout)
        self.assertFalse(os.path.exists(marker))
        sh(self.r.work, sys.executable, "scripts/sync-main.py", "--resume")
        res = sh(self.r.work, "bash", "ship.sh", check=False)
        self.assertTrue(os.path.exists(marker), res.stdout + res.stderr)


class OldPathRefusal(Base):
    def test_no_list_commits_old_paths_as_before(self):
        self.r.write("features/chat/new.ts", "export const n = 1;\n")
        self.assertEqual(self.r.sweep().returncode, 0)
        self.assertTrue(self.r.tracked("features/chat/new.ts"))

    def test_recreated_old_path_is_moved_aside_never_committed_there(self):
        self.r.write(MOVED, "# chat package move\nfeatures/chat/ -> packages/chat/src/\n"
                            "lib/old-helper.ts -> packages/chat/src/helper.ts\n")
        sh(self.r.work, "git", "add", MOVED)
        sh(self.r.work, "git", "commit", "-q", "-m", "moved list")
        stale = b"export const stale = 'peer wrote me at the old path';\n"
        self.r.write("features/chat/panel/Stale.tsx", stale.decode())
        self.r.write("lib/old-helper.ts", "export const h = 2;\n")
        self.r.write("lib/innocent.ts", "export const i = 3;\n")
        self.r.write("features/chat/kept.ts", "export const kept = 2;\n")   # tracked: not moved
        self.r.write("features/chat/staged.ts", "export const s = 4;\n")
        sh(self.r.work, "git", "add", "features/chat/staged.ts")
        res = self.r.sweep()
        out = res.stdout + res.stderr
        self.assertEqual(res.returncode, 0, out)
        for p in ("features/chat/panel/Stale.tsx", "lib/old-helper.ts", "features/chat/staged.ts"):
            self.assertFalse(self.r.tracked(p), p)
            self.assertFalse(self.r.exists(p), p)
            self.assertIn("OLD PATH REFUSED: %s" % p, out)
        self.assertIn("belongs at packages/chat/src/panel/Stale.tsx", out)
        self.assertIn("belongs at packages/chat/src/helper.ts", out)
        self.assertFalse(self.r.exists("features/chat/panel"))       # emptied old folder removed
        self.assertTrue(self.r.tracked("lib/innocent.ts"))
        self.assertEqual(self.r.read("features/chat/kept.ts"), b"export const kept = 2;\n")
        self.assertTrue(self.r.tracked("features/chat/kept.ts"))
        held = [l for l in sh(self.r.work, "git", "ls-files", "_conflicts").stdout.split()
                if l.endswith("features/chat/panel/Stale.tsx.held")]
        self.assertEqual(len(held), 1)
        self.assertIn("-old-path-refused/", held[0])
        self.assertTrue(self.r.read(held[0]).endswith(stale))        # the work, bytes intact
        log = self.r.read("_conflicts/README.md").decode()
        self.assertIn(held[0], log)
        self.assertIn("belongs at packages/chat/src/panel/Stale.tsx", log)
        self.assertEqual(self.r.origin_head(), self.r.head())

    def test_binary_and_name_status_format(self):
        self.r.write(MOVED, "R100\tassets/logo.png\tpackages/chat/assets/logo.png\n")
        png = b"\x89PNG\r\n\x1a\n\x00\x00binary"
        self.r.write("assets/logo.png", png.decode("latin-1"), mode="w")
        with open(os.path.join(self.r.work, "assets/logo.png"), "wb") as f:
            f.write(png)
        self.assertEqual(self.r.sweep().returncode, 0)
        self.assertFalse(self.r.tracked("assets/logo.png"))
        files = sh(self.r.work, "git", "ls-files", "_conflicts").stdout.split()
        data = [f for f in files if f.endswith("logo.png.held")]
        self.assertEqual(len(data), 1)
        self.assertEqual(self.r.read(data[0]), png)
        self.assertIn(data[0] + "-note.txt", files)


if __name__ == "__main__":
    unittest.main()
