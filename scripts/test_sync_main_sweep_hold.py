#!/usr/bin/env python3
"""Test: the sync-main sweep never commits a file the installed @ai-matrx packages cannot build,
and commits it on the first sync after the package is served.
Run: python3 scripts/test_sync_main_sweep_hold.py

The break it guards (2026-10-07 21:05:41): the sweep committed providers/WarmupHost.tsx, which
calls warmup.currentScope() — a method that exists only in @ai-matrx/agents 0.58.0 — while npm
still served 0.57.0 (0.58.0 arrived 21:14:08). v0.4.2991 built green and manage.aimatrx.com
crashed with "v.currentScope is not a function".

Every case runs a REAL sweep (scripts/sync-main.py) in a throwaway clone whose origin is a
throwaway bare repo, with the REAL scripts/check-sweep-resolves.mjs copied in; the real checkout
is never touched. SYNC_MAIN_PATH points the suite at another copy of sync-main (how it was proven
red against the version without the hold)."""
import json
import os
import shutil
import subprocess
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SCRIPT = os.environ.get("SYNC_MAIN_PATH") or os.path.join(HERE, "sync-main.py")
CHECK = os.path.join(HERE, "check-sweep-resolves.mjs")

AGENTS_0_57 = ("export interface WarmupController { warmSession(orgId: string): void; }\n"
               "export declare function createWarmup(): WarmupController;\n")
AGENTS_0_58 = ("export interface WarmupController { warmSession(orgId: string): void; "
               "currentScope(): { organizationId: string | null }; }\n"
               "export declare function createWarmup(): WarmupController;\n")
WARMUP_HOST = ("import { createWarmup } from '@ai-matrx/agents/matrx';\n"
               "const warmup = createWarmup();\n"
               "export function lastScope() { return warmup.currentScope(); }\n")
CLINIC_HOURS = "export const CLINIC_HOURS = { open: '08:00', close: '17:30' };\n"


def sh(cwd, *args, check=True, env=None):
    r = subprocess.run(list(args), cwd=cwd, capture_output=True, text=True, env=env)
    if check and r.returncode != 0:
        raise AssertionError("%s failed: %s%s" % (" ".join(args), r.stdout, r.stderr))
    return r


class Repo:
    def __init__(self):
        self.tmp = tempfile.mkdtemp(prefix="sync-main-hold-")
        self.origin = os.path.join(self.tmp, "origin.git")
        self.work = os.path.join(self.tmp, "work")
        sh(self.tmp, "git", "init", "-q", "--bare", "-b", "main", self.origin)
        sh(self.tmp, "git", "clone", "-q", self.origin, self.work)
        for c in (["config", "user.email", "t@t"], ["config", "user.name", "t"],
                  ["checkout", "-q", "-b", "main"]):
            sh(self.work, "git", *c)
        self.write(".gitignore", "node_modules/\n.matrx/sync-paused\n")
        self.write("tsconfig.json", json.dumps({"compilerOptions": {
            "strict": True, "module": "esnext", "moduleResolution": "bundler", "jsx": "react-jsx",
            "skipLibCheck": True, "noEmit": True, "types": [], "paths": {"@/*": ["./*"]}}}))
        self.write("features/schedule/hours.ts", "export const OPEN = '08:00';\n")
        os.makedirs(os.path.join(self.work, "scripts"))
        shutil.copy(CHECK, os.path.join(self.work, "scripts", "check-sweep-resolves.mjs"))
        self.write("node_modules/@ai-matrx/agents/package.json", json.dumps({
            "name": "@ai-matrx/agents", "version": "0.57.0", "type": "module",
            "exports": {"./matrx": {"types": "./dist/matrx.d.ts", "default": "./dist/matrx.js"}}}))
        self.write("node_modules/@ai-matrx/agents/dist/matrx.d.ts", AGENTS_0_57)
        self.write("node_modules/@ai-matrx/agents/dist/matrx.js", "export function createWarmup(){}\n")
        sh(self.work, "git", "add", "-A")
        sh(self.work, "git", "commit", "-q", "-m", "init")
        sh(self.work, "git", "push", "-q", "origin", "main")

    def write(self, rel, text):
        p = os.path.join(self.work, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w") as f:
            f.write(text)

    def sync(self):
        env = dict(os.environ, NODE_PATH=os.path.join(REPO, "node_modules"))
        return sh(self.work, "python3", SCRIPT, check=False, env=env)

    def on_origin(self, rel):
        return sh(self.work, "git", "--git-dir", self.origin, "cat-file", "-e", "main:" + rel,
                  check=False).returncode == 0

    def uncommitted(self):
        return sh(self.work, "git", "status", "--porcelain", "--untracked-files=all").stdout

    def close(self):
        shutil.rmtree(self.tmp, ignore_errors=True)


class SweepHold(unittest.TestCase):
    def setUp(self):
        self.r = Repo()

    def tearDown(self):
        self.r.close()

    def test_file_needing_an_unserved_package_member_is_held_and_its_neighbour_ships(self):
        self.r.write("providers/WarmupHost.ts", WARMUP_HOST)
        self.r.write("features/schedule/clinic-hours.ts", CLINIC_HOURS)
        out = self.r.sync()
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertTrue(self.r.on_origin("features/schedule/clinic-hours.ts"),
                        "the clean file was not swept and pushed:\n" + out.stdout)
        self.assertFalse(self.r.on_origin("providers/WarmupHost.ts"),
                         "the sweep pushed a file that calls currentScope() against agents 0.57.0")
        self.assertIn("?? providers/WarmupHost.ts", self.r.uncommitted(),
                      "the held file must stay on disk, uncommitted")
        self.assertIn("SWEEP HELD providers/WarmupHost.ts", out.stdout)
        self.assertIn("currentScope", out.stdout)

    def test_held_file_ships_on_the_first_sync_after_the_package_is_served(self):
        self.r.write("providers/WarmupHost.ts", WARMUP_HOST)
        self.r.sync()
        self.r.write("node_modules/@ai-matrx/agents/dist/matrx.d.ts", AGENTS_0_58)
        out = self.r.sync()
        self.assertTrue(self.r.on_origin("providers/WarmupHost.ts"),
                        "agents 0.58.0 is installed, the file must go out now:\n" + out.stdout)
        self.assertEqual(self.r.uncommitted().strip(), "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
