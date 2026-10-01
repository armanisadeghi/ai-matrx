#!/usr/bin/env python3
"""Test: the sync's sweep commit names the sessions that edited each file (run: python3 scripts/test_sync_main_authors.py)."""
import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("sync_main", os.path.join(HERE, "sync-main.py"))
sm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sm)


def row(sid, title, last, kind="edited", tool="claude"):
    return {"tool": tool, "session": sid, "title": title, "last": last, "kind": kind, "edits": 1}


class AuthorsBody(unittest.TestCase):
    def test_lists_session_files_and_time(self):
        found = {"a.ts": [row("S1", "File picker", "2026-09-30 14:02")],
                 "b.ts": [row("S1", "File picker", "2026-09-30 14:10")]}
        body = sm.authors_body(["a.ts", "b.ts", "c.ts"], found)
        self.assertIn('claude S1 "File picker" last edit 2026-09-30 14:10: a.ts, b.ts', body)
        self.assertIn("unknown (no session found): 1 files: c.ts", body)

    def test_mentioned_only_is_not_an_author(self):
        body = sm.authors_body(["a.ts"], {"a.ts": [row("S9", "x", "2026-09-30 1:00", kind="mentioned")]})
        self.assertNotIn("S9", body)
        self.assertIn("authors unknown", body)

    def test_caps(self):
        files = ["f%02d.ts" % i for i in range(20)]
        found = {f: [row("S%d" % i, "t", "2026-09-30 10:%02d" % i)] for i, f in enumerate(files)}
        body = sm.authors_body(files, found)
        self.assertIn("+8 more sessions", body)
        one = sm.authors_body(files, {f: [row("S", "t", "2026-09-30 10:00")] for f in files})
        self.assertIn("+14 more", one)

    def test_lookup_failure_says_authors_unknown(self):
        self.assertEqual(sm.authors_body(["a"], None, "lookup timed out after 45s"),
                         "authors unknown (lookup timed out after 45s)")

    def test_message_body_never_raises(self):
        orig = sm.lookup_authors
        try:
            def boom(_):
                raise RuntimeError("disk on fire")
            sm.lookup_authors = boom
            self.assertTrue(sm.sweep_message_body(["a"]).startswith("authors unknown"))
        finally:
            sm.lookup_authors = orig


class SweepCommit(unittest.TestCase):
    def test_commit_keeps_subject_and_adds_body(self):
        orig, cwd = sm.lookup_authors, os.getcwd()
        with tempfile.TemporaryDirectory() as d:
            try:
                for c in (["init", "-q"], ["config", "user.email", "t@t"], ["config", "user.name", "t"]):
                    subprocess.run(["git", "-C", d, *c], check=True)
                open(os.path.join(d, "x.txt"), "w").write("1")
                os.chdir(d)
                sm.lookup_authors = lambda files: ({"x.txt": [row("SESS-1", "Picker work", "2026-09-30 09:00")]}, None)
                self.assertEqual(sm.commit_all(), 1)
                subject = subprocess.run(["git", "log", "-1", "--format=%s"], capture_output=True, text=True).stdout.strip()
                body = subprocess.run(["git", "log", "-1", "--format=%b"], capture_output=True, text=True).stdout
                self.assertEqual(subject, sm.LOCAL_MSG)
                self.assertIn("SESS-1", body)
                self.assertIn("x.txt", body)
            finally:
                os.chdir(cwd)
                sm.lookup_authors = orig

    def test_lookup_missing_tool_does_not_block(self):
        with tempfile.TemporaryDirectory() as d:
            cwd = os.getcwd()
            try:
                os.chdir(d)
                orig = sm.find_sessions_tool
                sm.find_sessions_tool = lambda: None
                found, why = sm.lookup_authors(["x.txt"])
                self.assertIsNone(found)
                self.assertIn("not found", why)
            finally:
                sm.find_sessions_tool = orig
                os.chdir(cwd)


if __name__ == "__main__":
    unittest.main()
