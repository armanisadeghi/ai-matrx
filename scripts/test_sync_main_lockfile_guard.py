#!/usr/bin/env python3
"""Test: sync-main never pushes a lockfile a package manager cannot read.

Run: python3 scripts/test_sync_main_lockfile_guard.py
2026-10-08, v0.4.3013: merge 406bfce877 kept two identical `'@ai-matrx/records@0.84.4':` blocks in
pnpm-lock.yaml; every Vercel build died on ERR_PNPM_BROKEN_LOCKFILE. guard_lockfiles() runs right
before the push: identical duplicates are dropped and committed; differing ones stop the push.
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

BLOCK = ("  '@ai-matrx/records@0.84.4':\n"
         "    resolution: {integrity: sha512-abc}\n"
         "    engines: {node: '>=20'}\n")
HEAD = "lockfileVersion: '9.0'\n\npackages:\n\n"
TAIL = "  '@ai-matrx/rich-content@0.2.55':\n    resolution: {integrity: sha512-def}\n"
CLEAN = HEAD + BLOCK + "\n" + TAIL


def sh(cwd, *args):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, check=True).stdout


class LockfileGuard(unittest.TestCase):
    def setUp(self):
        self.repo = os.path.realpath(tempfile.mkdtemp(prefix="lockfile-guard-"))
        sh(self.repo, "git", "init", "-q", "-b", "main")
        sh(self.repo, "git", "config", "user.email", "t@example.com")
        sh(self.repo, "git", "config", "user.name", "t")
        self.cwd = os.getcwd()
        os.chdir(self.repo)

    def tearDown(self):
        os.chdir(self.cwd)

    def commit_lock(self, text, path="pnpm-lock.yaml"):
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w") as f:
            f.write(text)
        sh(self.repo, "git", "add", "-A")
        sh(self.repo, "git", "commit", "-qm", "merge left a lockfile")

    def test_clean_lockfile_is_untouched(self):
        self.commit_lock(CLEAN)
        self.assertEqual(sm.guard_lockfiles(), [])
        self.assertEqual(sh(self.repo, "git", "rev-list", "--count", "HEAD").strip(), "1")

    def test_identical_duplicate_is_repaired_and_committed(self):
        self.commit_lock(HEAD + BLOCK + "\n" + BLOCK + "\n" + TAIL, "desktop/pnpm-lock.yaml")
        self.assertEqual(sm.guard_lockfiles(), ["desktop/pnpm-lock.yaml"])
        self.assertEqual(sh(self.repo, "git", "show", "HEAD:desktop/pnpm-lock.yaml"), CLEAN)
        self.assertIn("lockfile guard", sh(self.repo, "git", "log", "-1", "--format=%s"))
        self.assertEqual(sh(self.repo, "git", "status", "--porcelain").strip(), "")

    def test_differing_duplicate_stops_the_push(self):
        self.commit_lock(HEAD + BLOCK + "\n" + BLOCK.replace("abc", "xyz") + "\n" + TAIL)
        with self.assertRaises(SystemExit):
            sm.guard_lockfiles()
        self.assertEqual(sh(self.repo, "git", "rev-list", "--count", "HEAD").strip(), "1")

    def test_broken_package_lock_json_stops_the_push(self):
        self.commit_lock('{"name": "x", "name": "y"}\n', "package-lock.json")
        with self.assertRaises(SystemExit):
            sm.guard_lockfiles()


if __name__ == "__main__":
    unittest.main()
