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

    def test_unreadable_pause_marker_is_ignored_loudly_never_permanent(self):
        # A marker with no trustworthy write time (here: a directory) could never expire, so it
        # must not pause anything — the sweep runs and says why (review finding D1, 2026-10-01).
        os.makedirs(os.path.join(self.r.work, PAUSE))
        self.r.write("notes.md", "work\n")
        res = self.r.sweep()
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertIn("SYNC PAUSE MARKER IGNORED", res.stdout + res.stderr)
        self.assertTrue(self.r.tracked("notes.md"))

    def test_future_dated_pause_cannot_stretch_the_cap(self):
        far = (datetime.datetime.now().astimezone() + datetime.timedelta(days=30)).isoformat()
        p = self.r.write(PAUSE, "by: owner\nreason: clock skew\nuntil: %s\n" % far)
        future = datetime.datetime.now().timestamp() + 24 * 3600   # mtime a day ahead
        os.utime(p, (future, future))
        res = self.r.sweep()
        self.assertEqual(res.returncode, 3)                      # paused now…
        self.assertIn("min left", res.stdout + res.stderr)
        left = int((res.stdout + res.stderr).split("(")[1].split(" min left")[0])
        self.assertLessEqual(left, 8 * 60 + 1)                  # …but never past 8 h from now

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


class EveryPushPathHonoursThePause(Base):
    """The pause is not a sweep-only switch: scripts/release.sh run DIRECTLY would merge this
    checkout's unpushed commits (a half-done move) into origin/main and push them. Every path
    that pushes or releases asks sync-main --pause-active (one reader). RELEASE_SH_PATH,
    PURGE_SH_PATH and SHIP_TS_PATH point the suite at other copies (how it was proven red)."""

    RELEASE = os.environ.get("RELEASE_SH_PATH") or os.path.join(HERE, "release.sh")
    PURGE = os.environ.get("PURGE_SH_PATH") or os.path.join(HERE, "git-purge-next-dirs.sh")
    SHIP_TS = os.environ.get("SHIP_TS_PATH") or os.path.join(HERE, "matrx", "ship.ts")

    def setUp(self):
        super().setUp()
        r = self.r
        os.makedirs(os.path.join(r.work, "scripts"))
        shutil.copy(SCRIPT, os.path.join(r.work, "scripts", "sync-main.py"))
        shutil.copy(self.RELEASE, os.path.join(r.work, "scripts", "release.sh"))
        for helper in ("release-stage.sh", "release-outcome.sh", "vercel-ignore-build.sh"):
            src = os.path.join(os.path.dirname(self.RELEASE), helper)
            if os.path.exists(src):
                shutil.copy(src, os.path.join(r.work, "scripts", helper))
        shutil.copy(self.PURGE, os.path.join(r.work, "scripts", "git-purge-next-dirs.sh"))
        r.write("package.json", '{\n  "name": "sandbox",\n  "version": "0.1.0",\n  "private": true\n}\n')
        r.write(".gitignore", ".matrx/sync-paused\ntmp/\n")
        sh(r.work, "git", "add", "-A")
        sh(r.work, "git", "commit", "-q", "-m", "seed")
        sh(r.work, "git", "push", "-q", "origin", "main")
        # The half-done move: a local commit not on origin yet.
        r.write("packages/chat/moved.ts", "export const halfway = 1;\n")
        sh(r.work, "git", "add", "-A")
        sh(r.work, "git", "commit", "-q", "-m", "half of the move")
        self.bin = os.path.join(r.tmp, "bin")
        self.aidream = os.path.join(r.tmp, "aidream")
        os.makedirs(os.path.join(self.aidream, "db"))
        open(os.path.join(self.aidream, "db", "apply_migrations.py"), "w").close()
        os.makedirs(self.bin)
        self.uv_calls = os.path.join(r.tmp, "uv-calls")
        with open(os.path.join(self.bin, "uv"), "w") as f:
            f.write("#!/usr/bin/env bash\necho \"$*\" >> %s\nexit 0\n" % self.uv_calls)
        os.chmod(os.path.join(self.bin, "uv"), 0o755)

    def release(self, *args, captured=False):
        env = dict(os.environ, PATH=self.bin + os.pathsep + os.environ["PATH"],
                   AIDREAM_DIR=self.aidream, RELEASE_AFTER_PHASE="off")
        env.pop("RELEASE_PHASE", None)
        if captured:
            env["RELEASE_LOG_CAPTURED"] = "1"
        else:
            env.pop("RELEASE_LOG_CAPTURED", None)
        return subprocess.run(["bash", "scripts/release.sh", *args], cwd=self.r.work,
                              capture_output=True, text=True, env=env)

    def pause(self):
        sh(self.r.work, sys.executable, "scripts/sync-main.py", "--pause", "chat package move",
           "--minutes", "30", "--by", "owner")

    def remote_tags(self):
        return sh(self.r.work, "git", "ls-remote", "--tags", "origin").stdout.strip()

    def test_reader_is_silent_and_zero_with_no_pause(self):
        res = sh(self.r.work, sys.executable, "scripts/sync-main.py", "--pause-active", check=False)
        self.assertEqual((res.returncode, res.stdout, res.stderr), (0, "", ""))
        self.assertEqual(self.r.origin_head(), self.r.head("HEAD~1"))   # it is no sweep

    def test_reader_says_paused_with_exit_3(self):
        self.pause()
        res = sh(self.r.work, sys.executable, "scripts/sync-main.py", "--pause-active", check=False)
        self.assertEqual(res.returncode, 3, res.stdout + res.stderr)
        self.assertIn("SYNC PAUSED by owner until", res.stderr)

    def test_direct_release_refuses_and_changes_nothing(self):
        self.pause()
        head, origin = self.r.head(), self.r.origin_head()
        res = self.release()
        out = res.stdout + res.stderr
        self.assertEqual(res.returncode, 3, out)
        self.assertIn("SYNC PAUSED by owner until", res.stderr)
        self.assertIn("chat package move", res.stderr)
        self.assertEqual(self.r.origin_head(), origin)                  # nothing pushed
        self.assertEqual(self.r.head(), head)                           # nothing committed
        self.assertEqual(self.remote_tags(), "")                        # no tag
        self.assertFalse(os.path.exists(self.uv_calls))                 # no migrations ran
        self.assertFalse(self.r.exists("tmp"))                          # not even a log
        self.assertTrue(self.r.exists(PAUSE))

    def test_release_with_no_pause_ships_as_before(self):
        res = self.release(captured=True)
        out = res.stdout + res.stderr
        self.assertEqual(res.returncode, 0, out)
        self.assertNotIn("PAUSE", out)
        self.assertRegex(res.stdout.strip(), r"^v0\.1\.1  pushed, build started  \(\d+s\)$")
        self.assertIn("refs/tags/v0.1.1", self.remote_tags())
        sh(self.r.work, "git", "fetch", "-q", "origin")
        self.assertEqual(sh(self.r.work, "git", "cat-file", "-t", "origin/main:packages/chat/moved.ts"
                            ).stdout.strip(), "blob")

    def test_expired_pause_releases_and_says_so(self):
        self.r.write(PAUSE, "by: owner\nreason: forgotten\nuntil: 2026-01-01T01:00:00+00:00\n")
        res = self.release(captured=True)
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertIn("SYNC PAUSE EXPIRED", res.stdout)
        self.assertFalse(self.r.exists(PAUSE))
        self.assertIn("refs/tags/v0.1.1", self.remote_tags())

    def test_dry_run_still_previews_while_paused(self):
        self.pause()
        origin = self.r.origin_head()
        res = self.release("--dry-run", captured=True)
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertIn("Dry run complete", res.stdout)
        self.assertEqual(self.r.origin_head(), origin)

    def test_purge_push_refuses_while_paused(self):
        self.r.write(".next/x", "build\n")
        sh(self.r.work, "git", "add", "-f", ".next/x")
        sh(self.r.work, "git", "commit", "-q", "-m", "tracked build dir")
        self.pause()
        head, origin = self.r.head(), self.r.origin_head()
        res = sh(self.r.work, "bash", "scripts/git-purge-next-dirs.sh", "--push", check=False)
        self.assertEqual(res.returncode, 3, res.stdout + res.stderr)
        self.assertIn("SYNC PAUSED by owner", res.stderr)
        self.assertEqual((self.r.head(), self.r.origin_head()), (head, origin))
        self.assertTrue(self.r.exists(".next/x"))

    def test_matrx_ship_cli_refuses_while_paused(self):
        tsx = os.path.join(os.path.dirname(HERE), "node_modules", ".bin", "tsx")
        tsconfig = os.path.join(os.path.dirname(HERE), "tsconfig.json")
        if not os.path.exists(tsx):
            self.skipTest("tsx is not installed in this checkout")
        self.r.write("notes.md", "uncommitted\n")
        self.pause()
        head, origin = self.r.head(), self.r.origin_head()
        res = subprocess.run([tsx, "--tsconfig", tsconfig, self.SHIP_TS, "ship it"], cwd=self.r.work,
                             capture_output=True, text=True,
                             env=dict(os.environ, MATRX_SHIP_URL="http://127.0.0.1:9",
                                      MATRX_SHIP_API_KEY="sandbox-not-a-key"))
        self.assertEqual(res.returncode, 3, res.stdout + res.stderr)
        self.assertIn("SYNC PAUSED by owner", res.stderr)
        self.assertEqual((self.r.head(), self.r.origin_head()), (head, origin))
        self.assertFalse(self.r.tracked("notes.md"))


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
