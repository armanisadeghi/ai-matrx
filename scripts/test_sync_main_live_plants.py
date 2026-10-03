#!/usr/bin/env python3
"""Test: the sync's sweep never commits a file while a forcing-function plant is live in it.

Run: python3 scripts/test_sync_main_live_plants.py
2026-10-02: two sweeps captured live plant.py mutations and pushed them (aidream e91f90881e,
491fbdc7d7). plant.py records each live plant ("<pid>\\n<absolute path>\\n") in
<git common dir>/matrx-live-plants/<pid> and in its lock's pid file; sync-main's step 1 reads
both and leaves exactly that file out. A dead pid is no plant.
"""
import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SYNC = os.path.join(HERE, "sync-main.py")
spec = importlib.util.spec_from_file_location("sync_main", SYNC)
sm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sm)
sm.sweep_message_body = lambda files: "test sweep"


def sh(cwd, *args):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, check=True).stdout


def find_plant():
    repo = os.path.dirname(HERE)
    for p in (os.path.join(repo, ".claude", "skills", "forcing-function-tests", "plant.py"),
              os.path.join(repo, "skills", "forcing-function-tests", "plant.py"),
              os.path.join(os.path.dirname(repo), "common-docs", "skills", "forcing-function-tests",
                           "plant.py")):
        if os.path.exists(p):
            return p
    return None


class LivePlantsAreNeverSwept(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="sweep-plant-")
        self.repo = os.path.realpath(os.path.join(self.tmp, "repo"))
        os.makedirs(self.repo)
        sh(self.repo, "git", "init", "-q", "-b", "main")
        sh(self.repo, "git", "config", "user.email", "t@example.com")
        sh(self.repo, "git", "config", "user.name", "t")
        for name in ("planted.py", "other.py"):
            with open(os.path.join(self.repo, name), "w") as f:
                f.write("x = 1\n")
        sh(self.repo, "git", "add", "-A")
        sh(self.repo, "git", "commit", "-qm", "init")
        # every other kind of dirty file the sweep must still take
        self.write("planted.py", "x = 2  # MUTANT\n")
        self.write("other.py", "x = 3\n")
        self.write("new file [1].txt", "new\n")
        self.state = os.path.join(self.tmp, "state")
        self.old_env = os.environ.get("PLANT_STATE_DIR")
        os.environ["PLANT_STATE_DIR"] = self.state
        self.cwd = os.getcwd()
        os.chdir(self.repo)

    def tearDown(self):
        os.chdir(self.cwd)
        if self.old_env is None:
            os.environ.pop("PLANT_STATE_DIR", None)
        else:
            os.environ["PLANT_STATE_DIR"] = self.old_env

    def write(self, rel, text):
        with open(os.path.join(self.repo, rel), "w") as f:
            f.write(text)

    def record(self, where, pid, path):
        os.makedirs(os.path.dirname(where), exist_ok=True)
        with open(where, "w") as f:
            f.write("%d\n%s\n" % (pid, path))

    def marker(self, pid, path):
        self.record(os.path.join(self.repo, ".git", "matrx-live-plants", str(pid)), pid, path)

    def dead_pid(self):
        p = subprocess.Popen([sys.executable, "-c", "pass"])
        p.wait()
        return p.pid

    def swept(self):
        sm.commit_all()
        return set(sh(self.repo, "git", "show", "--name-only", "--format=", "HEAD").split("\n")) - {""}

    def dirty(self):
        return sh(self.repo, "git", "status", "--porcelain")

    def test_marker_live_plant_is_left_out_and_everything_else_goes_in(self):
        self.marker(os.getpid(), os.path.join(self.repo, "planted.py"))
        self.assertEqual(self.swept(), {"other.py", "new file [1].txt"})
        self.assertIn(" M planted.py", self.dirty())

    def test_lock_record_live_plant_is_left_out(self):
        self.record(os.path.join(self.state, "locks", "abc", "pid"), os.getpid(),
                    os.path.join(self.repo, "planted.py"))
        self.assertEqual(self.swept(), {"other.py", "new file [1].txt"})

    def test_dead_pid_is_no_plant(self):
        self.marker(self.dead_pid(), os.path.join(self.repo, "planted.py"))
        self.assertEqual(self.swept(), {"planted.py", "other.py", "new file [1].txt"})

    def test_plant_in_another_repo_skips_nothing(self):
        self.marker(os.getpid(), os.path.join(self.tmp, "elsewhere", "planted.py"))
        self.assertEqual(self.swept(), {"planted.py", "other.py", "new file [1].txt"})

    def test_already_staged_mutation_is_unstaged_not_committed(self):
        sh(self.repo, "git", "add", "planted.py")
        self.marker(os.getpid(), os.path.join(self.repo, "planted.py"))
        self.assertEqual(self.swept(), {"other.py", "new file [1].txt"})
        self.assertIn(" M planted.py", self.dirty())

    def test_real_plant_py_is_honoured_by_the_sweep(self):
        plant = find_plant()
        if not plant:
            self.skipTest("plant.py not found beside this repo; the record-format tests above stand")
        self.write("planted.py", "x = 1\n")
        sweep = ("import importlib.util,sys;"
                 "s=importlib.util.spec_from_file_location('sm',%r);m=importlib.util.module_from_spec(s);"
                 "s.loader.exec_module(m);m.sweep_message_body=lambda f:'t';m.commit_all()" % SYNC)
        p = subprocess.run([sys.executable, plant, "--file", os.path.join(self.repo, "planted.py"),
                            "--old", "x = 1", "--new", "x = 99", "--expect", "green", "--",
                            sys.executable, "-c", sweep],
                           cwd=self.repo, capture_output=True, text=True,
                           env=dict(os.environ, PLANT_STATE_DIR=self.state))
        out = p.stdout + p.stderr
        self.assertNotEqual(p.returncode, 5, "the sweep committed the live mutation:\n" + out)
        self.assertEqual(p.returncode, 0, out)
        self.assertIn("SWEEP SKIPPED planted.py", out)
        committed = set(sh(self.repo, "git", "show", "--name-only", "--format=", "HEAD").split())
        self.assertNotIn("planted.py", committed)
        self.assertIn("other.py", committed)
        self.assertNotIn("99", sh(self.repo, "git", "show", "HEAD:planted.py"))
        self.assertEqual(os.listdir(os.path.join(self.repo, ".git", "matrx-live-plants")), [],
                         "plant.py left its marker behind")


if __name__ == "__main__":
    unittest.main()
