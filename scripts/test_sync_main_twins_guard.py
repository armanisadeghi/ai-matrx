#!/usr/bin/env python3
"""Test: sync-main never pushes a lockfile that Vercel's postinstall refuses for @ai-matrx twins.

Run: python3 scripts/test_sync_main_twins_guard.py
2026-10-08, v0.4.3061: pnpm-lock.yaml on main held @ai-matrx/design-system 0.86.26 AND 0.86.27;
`check-matrx-packages.mjs --duplicates` (the postinstall) exited 1 on every Vercel project.
guard_twins() runs right before the push: twins are remedied lockfile-only and committed; twins
this push would newly add and that cannot be remedied stop the push; twins already on origin are
announced (release.sh keeps them out of a release). A stub `pnpm` stands in for the registry.
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


def lock(app, meet):
    pkgs = "  '@ai-matrx/design-system@%s':\n    resolution: {integrity: sha512-a}\n\n" % app
    snaps = "  '@ai-matrx/design-system@%s': {}\n\n" % app
    if app != meet:
        pkgs += "  '@ai-matrx/design-system@%s':\n    resolution: {integrity: sha512-b}\n\n" % meet
        snaps += "  '@ai-matrx/design-system@%s': {}\n\n" % meet
    return ("lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n"
            "      '@ai-matrx/design-system':\n        specifier: latest\n        version: %s\n"
            "      '@ai-matrx/meet':\n        specifier: latest\n        version: 0.11.29\n\npackages:\n\n%s"
            "  '@ai-matrx/meet@0.11.29':\n    resolution: {integrity: sha512-c}\n\nsnapshots:\n\n%s"
            "  '@ai-matrx/meet@0.11.29':\n    dependencies:\n      '@ai-matrx/design-system': %s\n"
            % (app, pkgs, snaps, meet))


def sh(cwd, *args):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, check=True).stdout


class TwinsGuard(unittest.TestCase):
    def setUp(self):
        self.tmp = os.path.realpath(tempfile.mkdtemp(prefix="twins-guard-"))
        self.repo = os.path.join(self.tmp, "repo")
        sh(self.tmp, "git", "init", "-q", "--bare", "-b", "main", "origin.git")
        sh(self.tmp, "git", "clone", "-q", "origin.git", "repo")
        sh(self.repo, "git", "config", "user.email", "t@example.com")
        sh(self.repo, "git", "config", "user.name", "t")
        with open(os.path.join(self.repo, "package.json"), "w") as f:
            f.write('{"name": "x", "version": "0.0.1"}\n')
        self.commit_lock(lock("0.86.26", "0.86.26"), "seed")
        sh(self.repo, "git", "push", "-q", "origin", "main")
        bindir = os.path.join(self.tmp, "bin")
        os.makedirs(bindir)
        self.remedy = os.path.join(self.tmp, "pnpm-can-remedy")
        with open(os.path.join(bindir, "pnpm"), "w") as f:
            f.write("#!/usr/bin/env bash\nif [[ \"$1\" == update && -f %s ]]; then cat > pnpm-lock.yaml <<'L'\n%sL\nfi\nexit 0\n"
                    % (self.remedy, lock("0.86.27", "0.86.27")))
        os.chmod(os.path.join(bindir, "pnpm"), 0o755)
        self.env = dict(os.environ)
        os.environ["PATH"] = bindir + os.pathsep + os.environ["PATH"]
        os.environ["LOCKFILE_TWINS_CHECKER"] = os.path.join(HERE, "check-matrx-packages.mjs")
        self.cwd = os.getcwd()
        os.chdir(self.repo)

    def tearDown(self):
        os.chdir(self.cwd)
        os.environ.clear()
        os.environ.update(self.env)

    def commit_lock(self, text, msg="adopt meet by hand"):
        with open(os.path.join(self.repo, "pnpm-lock.yaml"), "w") as f:
            f.write(text)
        sh(self.repo, "git", "add", "-A")
        sh(self.repo, "git", "commit", "-qm", msg)

    def count(self):
        return int(sh(self.repo, "git", "rev-list", "--count", "HEAD").strip())

    def test_clean_lockfile_is_untouched(self):
        self.assertFalse(sm.guard_twins())
        self.assertEqual(self.count(), 1)

    def test_twins_are_remedied_and_committed(self):
        open(self.remedy, "w").close()
        self.commit_lock(lock("0.86.26", "0.86.27"))
        self.assertTrue(sm.guard_twins())
        self.assertEqual(sh(self.repo, "git", "show", "HEAD:pnpm-lock.yaml"), lock("0.86.27", "0.86.27"))
        self.assertIn("twins guard", sh(self.repo, "git", "log", "-1", "--format=%s"))
        self.assertEqual(sh(self.repo, "git", "status", "--porcelain").strip(), "")

    def test_unremediable_twins_this_push_adds_stop_the_push(self):
        self.commit_lock(lock("0.86.26", "0.86.27"))
        with self.assertRaises(SystemExit):
            sm.guard_twins()
        self.assertEqual(self.count(), 2)

    def test_twins_already_on_origin_are_announced_not_a_stop(self):
        self.commit_lock(lock("0.86.26", "0.86.27"))
        sh(self.repo, "git", "push", "-q", "origin", "main")
        self.assertFalse(sm.guard_twins())


if __name__ == "__main__":
    unittest.main()
