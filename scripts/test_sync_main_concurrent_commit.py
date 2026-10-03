#!/usr/bin/env python3
"""Test: a sweep whose staged files are committed by another session mid-sweep does not stop.

Run: python3 scripts/test_sync_main_concurrent_commit.py
ship-all 2026-10-03_14-13-08: while sync-main wrote the sweep message, another session ran
`git commit --only scripts/release.sh ...`, our commit found nothing to commit, and the sync
died with "SYNC STOPPED", pushing nothing. A real commit failure must still stop the sync.
"""
import importlib.util
import os
import subprocess
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("sync_main", os.path.join(HERE, "sync-main.py"))
sm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sm)


def sh(cwd, *args):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, check=True).stdout


class ConcurrentCommitIsNotAFailure(unittest.TestCase):
    def setUp(self):
        self.repo = os.path.realpath(tempfile.mkdtemp(prefix="sweep-race-"))
        sh(self.repo, "git", "init", "-q", "-b", "main")
        sh(self.repo, "git", "config", "user.email", "t@example.com")
        sh(self.repo, "git", "config", "user.name", "t")
        with open(os.path.join(self.repo, "release.sh"), "w") as f:
            f.write("v1\n")
        sh(self.repo, "git", "add", "-A")
        sh(self.repo, "git", "commit", "-qm", "init")
        with open(os.path.join(self.repo, "release.sh"), "w") as f:
            f.write("v2\n")
        self.cwd = os.getcwd()
        os.chdir(self.repo)
        self.orig = sm.sweep_message_body

    def tearDown(self):
        sm.sweep_message_body = self.orig
        os.chdir(self.cwd)

    def test_other_session_commits_the_staged_files(self):
        def racing_body(files):
            sh(self.repo, "git", "commit", "-q", "--only", "-m", "other session", "--", "release.sh")
            return "body"
        sm.sweep_message_body = racing_body
        self.assertEqual(sm.commit_all(), 0)
        self.assertEqual(sh(self.repo, "git", "log", "-1", "--format=%s").strip(), "other session")
        self.assertEqual(sh(self.repo, "git", "status", "--porcelain").strip(), "")

    def test_real_commit_failure_still_stops(self):
        def broken_body(files):
            # --no-verify skips hooks, so break the commit another way: an unwritable objects dir
            os.chmod(os.path.join(self.repo, ".git", "objects"), 0o500)
            return "body"
        sm.sweep_message_body = broken_body
        try:
            with self.assertRaises(SystemExit):
                sm.commit_all()
        finally:
            os.chmod(os.path.join(self.repo, ".git", "objects"), 0o755)

    def test_normal_sweep_commits(self):
        sm.sweep_message_body = lambda files: "body"
        self.assertEqual(sm.commit_all(), 1)
        self.assertEqual(sh(self.repo, "git", "log", "-1", "--format=%s").strip(), sm.LOCAL_MSG)


if __name__ == "__main__":
    unittest.main()
