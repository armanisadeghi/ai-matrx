#!/usr/bin/env python3
"""Test: sync-main's package step (1) waits for the @ai-matrx publish train that started before the
sync, and (2) never commits a package update that only breaks the build.
Run: python3 scripts/test_sync_main_package_adoption.py

The breaks it guards (2026-10-07):
  * the frontend release read npm in the middle of aidream's publish train and locked the previous
    versions of packages the consumer code already used (v0.4.2961, 2969, 2971, 2975, 2981-2983,
    2990-2991);
  * an update adopted a package release that had deleted or moved what this repo still imports
    (chat 0.4.0 deleted agents/model-registry -> v0.4.2980; kit dropped json-extract -> v0.4.2990).

The train cases drive wait_for_publish_train() with a scripted clock and a scripted `gh run list`
(GitHub is the external dependency; the waiting logic is real). The adoption cases run a REAL sync
in a throwaway clone with the REAL scripts/check-matrx-imports.mjs; only the package manager is a
double (`pnpm` on PATH: `run` executes the fixture's script, `install` lays down the node_modules
the lockfile names, as a frozen install would). SYNC_MAIN_PATH points the suite at another copy of
sync-main (how it was proven red against the version without these steps)."""
import importlib.util
import json
import os
import shutil
import stat
import subprocess
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SCRIPT = os.environ.get("SYNC_MAIN_PATH") or os.path.join(HERE, "sync-main.py")


def load_sync_main():
    spec = importlib.util.spec_from_file_location("sync_main_under_test", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


NOMINATE = "Nominate changed npm packages"
PUBLISH = "Publish TypeScript Package to npm"


class Train:
    """A scripted GitHub Actions history: (workflow, name, created, finished or None)."""

    def __init__(self, runs, t0=1000.0):
        self.clock = [t0]
        self.runs = runs
        self.sleeps = 0

    def now(self):
        return self.clock[0]

    def sleep(self, n):
        self.sleeps += 1
        self.clock[0] += n

    def listing(self):
        t = self.clock[0]
        return [(wf, end is None or t < end, created, name)
                for (wf, name, created, end) in self.runs if created <= t]


class PublishTrain(unittest.TestCase):
    def setUp(self):
        self.sm = load_sync_main()
        self.sm.say = lambda *_: None
        if not hasattr(self.sm, "wait_for_publish_train"):
            self.fail("sync-main has no publish-train wait: the package update reads npm mid-train")

    def run_train(self, train):
        return self.sm.wait_for_publish_train(now=train.now, sleep=train.sleep, runs=train.listing)

    def test_waits_for_publish_runs_in_flight_and_for_nothing_that_starts_later(self):
        train = Train([
            (PUBLISH, "Publish npm/agents/v0.58.0", 940, 1130),            # in flight at the sync
            (PUBLISH, "Publish npm/chat/v0.4.18", 990, 1050),              # in flight, ends first
            (NOMINATE, "Nominate changed npm packages", 900, None),        # walks the graph for an hour
            (PUBLISH, "Publish npm/records/v0.82.0", 1010, None),          # started after the sync
        ])
        line = self.run_train(train)
        self.assertIn("npm/agents/v0.58.0", line)
        self.assertIn("npm/chat/v0.4.18", line)
        self.assertNotIn("records", line)
        self.assertEqual(train.now(), 1140, "returned before agents 0.58.0 finished, or waited on a later run")

    def test_nothing_in_flight_costs_no_wait(self):
        train = Train([(PUBLISH, "Publish npm/chat/v0.4.15", 100, 400),
                       (NOMINATE, "Nominate changed npm packages", 900, None)])
        self.assertEqual(self.run_train(train), "publish train: nothing in flight")
        self.assertEqual(train.sleeps, 0)

    def test_a_publish_that_never_finishes_is_given_up_on_at_the_bound(self):
        train = Train([(PUBLISH, "Publish npm/records-ui/v0.109.5", 900, None)])
        line = self.run_train(train)
        self.assertIn("gave up", line)
        self.assertEqual(train.now() - 1000, self.sm.PUBLISH_WAIT_MAX_SECONDS)


class AdoptionRule(unittest.TestCase):
    def setUp(self):
        self.sm = load_sync_main()
        if not hasattr(self.sm, "update_breaks_build"):
            self.fail("sync-main has no adoption rule: every update is committed, breaking or not")

    def h(self, imports, sandbox=None):
        return {"imports": imports, "sandbox": sandbox}

    def test_update_that_only_adds_a_missing_import_is_refused(self):
        broke = self.sm.update_breaks_build(self.h({}), self.h({"k": "kit 0.9.0 drops ./json-extract"}))
        self.assertEqual(broke, ["kit 0.9.0 drops ./json-extract"])

    def test_update_that_also_fixes_something_is_adopted(self):
        self.assertEqual(self.sm.update_breaks_build(self.h({"old": "a"}), self.h({"new": "b"})), [])

    def test_update_that_breaks_the_kind_sandbox_is_refused(self):
        self.assertTrue(self.sm.update_breaks_build(self.h({}, True), self.h({}, False)))

    def test_unmeasured_imports_never_refuse(self):
        self.assertEqual(self.sm.update_breaks_build(self.h(None), self.h({"k": "x"})), [])


# ── the real sync ────────────────────────────────────────────────────────────

FAKE_PNPM = r'''#!/usr/bin/env python3
import json, os, re, shutil, subprocess, sys
args = [a for a in sys.argv[1:] if a not in ("-s", "--silent")]
if args[:1] == ["run"]:
    script = json.load(open("package.json"))["scripts"][args[1]]
    sys.exit(subprocess.call(script, shell=True))
if args[:1] == ["install"]:
    v = re.search(r"'@ai-matrx/chat@([0-9.]+)'", open("pnpm-lock.yaml").read()).group(1)
    shutil.rmtree("node_modules/@ai-matrx/chat", ignore_errors=True)
    shutil.copytree(".store/chat-" + v, "node_modules/@ai-matrx/chat")
    sys.exit(0)
sys.exit(0)
'''
FAKE_GH = "#!/bin/sh\necho '[]'\n"


def chat_package(version, exports_text):
    return {
        "package.json": json.dumps({"name": "@ai-matrx/chat", "version": version, "type": "module",
                                    "exports": {"./canvas": {"types": "./dist/canvas.d.ts",
                                                             "default": "./dist/canvas.js"}}}),
        "dist/canvas.d.ts": exports_text,
        "dist/canvas.js": exports_text.replace("declare ", "").replace(": string", " = ''"),
    }


V0415 = "export declare const SIDE_CHAT_PARAM: string;\n"
V0416 = "export declare const SIDE_CHAT_PARAM: string;\nexport declare const CANVAS_TAB_PARAM: string;\n"
V0500 = "export declare const CANVAS_TAB_PARAM: string;\n"   # dropped SIDE_CHAT_PARAM


class Fixture:
    def __init__(self, next_version, next_exports):
        self.tmp = tempfile.mkdtemp(prefix="sync-main-adopt-")
        self.origin = os.path.join(self.tmp, "origin.git")
        self.work = os.path.join(self.tmp, "work")
        self.bin = os.path.join(self.tmp, "bin")
        os.makedirs(self.bin)
        for name, text in (("pnpm", FAKE_PNPM), ("gh", FAKE_GH)):
            p = os.path.join(self.bin, name)
            with open(p, "w") as f:
                f.write(text)
            os.chmod(p, os.stat(p).st_mode | stat.S_IEXEC)
        run = lambda *a: subprocess.run(list(a), cwd=self.work if os.path.isdir(self.work) else self.tmp,
                                        check=True, capture_output=True)
        run("git", "init", "-q", "--bare", "-b", "main", self.origin)
        run("git", "clone", "-q", self.origin, self.work)
        for c in (["config", "user.email", "t@t"], ["config", "user.name", "t"], ["checkout", "-q", "-b", "main"]):
            run("git", *c)
        for v, text in (("0.4.15", V0415), (next_version, next_exports)):
            for rel, body in chat_package(v, text).items():
                self.write(".store/chat-%s/%s" % (v, rel), body)
        shutil.copytree(os.path.join(self.work, ".store/chat-0.4.15"), os.path.join(self.work, "node_modules/@ai-matrx/chat"))
        self.write(".gitignore", "node_modules/\n.store/\n")
        self.write("pnpm-lock.yaml", "packages:\n\n  '@ai-matrx/chat@0.4.15':\n    resolution: {integrity: sha512-x}\n")
        # The update: what `pnpm update "@ai-matrx/*" --latest` does — new lockfile, new node_modules.
        self.write("bump.sh", "set -e\nsed -i.bak 's/@ai-matrx\\/chat@0.4.15/@ai-matrx\\/chat@%s/' pnpm-lock.yaml && rm pnpm-lock.yaml.bak\n"
                              "rm -rf node_modules/@ai-matrx/chat && cp -R .store/chat-%s node_modules/@ai-matrx/chat\n" % (next_version, next_version))
        self.write("package.json", json.dumps({"name": "clinic-portal", "private": True,
                                               "scripts": {"sync:matrx-packages": "sh bump.sh"},
                                               "dependencies": {"@ai-matrx/chat": "latest"}}))
        os.makedirs(os.path.join(self.work, "scripts", "checks"))
        shutil.copy(os.path.join(HERE, "check-matrx-imports.mjs"), os.path.join(self.work, "scripts"))
        shutil.copy(os.path.join(HERE, "checks", "items.mjs"), os.path.join(self.work, "scripts", "checks"))
        self.write("features/canvas/side-chat.ts",
                   "import { SIDE_CHAT_PARAM } from '@ai-matrx/chat/canvas';\nexport const sideChatKey = SIDE_CHAT_PARAM;\n")
        run("git", "add", "-A")
        run("git", "commit", "-q", "-m", "clinic portal on chat 0.4.15")
        run("git", "push", "-q", "origin", "main")

    def write(self, rel, text):
        p = os.path.join(self.work, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w") as f:
            f.write(text)

    def sync(self):
        env = dict(os.environ, PATH=self.bin + os.pathsep + os.environ["PATH"],
                   NODE_PATH=os.path.join(REPO, "node_modules"))
        return subprocess.run(["python3", SCRIPT], cwd=self.work, capture_output=True, text=True, env=env)

    def origin_lock(self):
        return subprocess.run(["git", "--git-dir", self.origin, "show", "main:pnpm-lock.yaml"],
                              capture_output=True, text=True).stdout

    def installed(self):
        with open(os.path.join(self.work, "node_modules/@ai-matrx/chat/package.json")) as f:
            return json.load(f)["version"]

    def close(self):
        shutil.rmtree(self.tmp, ignore_errors=True)


class RealSync(unittest.TestCase):
    def test_update_that_drops_an_export_this_repo_imports_is_not_committed(self):
        fx = Fixture("0.5.0", V0500)
        try:
            out = fx.sync()
            self.assertIn("'@ai-matrx/chat@0.4.15'", fx.origin_lock(),
                          "the sync pushed a lockfile on chat 0.5.0, which no longer exports SIDE_CHAT_PARAM:\n"
                          + out.stdout + out.stderr)
            self.assertEqual(fx.installed(), "0.4.15", "node_modules was not put back to the lockfile")
            self.assertIn("PACKAGE UPDATE NOT ADOPTED", out.stdout)
            self.assertIn("SIDE_CHAT_PARAM", out.stdout)
        finally:
            fx.close()

    def test_update_that_keeps_every_import_is_committed(self):
        fx = Fixture("0.4.16", V0416)
        try:
            out = fx.sync()
            self.assertIn("'@ai-matrx/chat@0.4.16'", fx.origin_lock(), out.stdout + out.stderr)
            self.assertNotIn("NOT ADOPTED", out.stdout)
        finally:
            fx.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
