"""Exercise real process/OS lock races and recovery, with isolated lock files."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("local_patrol_lock.py")


class LocalLockTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = str(Path(self.directory.name) / "patrol.lock")

    def start(self, ttl="5"):
        process = subprocess.Popen(
            [sys.executable, str(SCRIPT), "acquire", "--path", self.path, "--ttl", ttl, "--owner", "test-owner-task"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
        )
        def cleanup():
            if process.poll() is None:
                process.kill()
            process.wait()
            process.stdin.close()
            process.stdout.close()
        self.addCleanup(cleanup)
        return process

    def read(self, process):
        return json.loads(process.stdout.readline())

    def command(self, process, action, token):
        process.stdin.write(json.dumps({"action": action, "owner_token": token}) + "\n")
        process.stdin.flush()
        return self.read(process)

    def test_simultaneous_owners_and_crash_recovery_reject_old_token(self):
        first, second = self.start(), self.start()
        a, b = self.read(first), self.read(second)
        self.assertEqual(sum(x["acquired"] for x in (a, b)), 1)
        owner, result = (first, a) if a["acquired"] else (second, b)
        owner.kill()
        owner.wait()
        replacement = self.start()
        new = self.read(replacement)
        self.assertTrue(new["acquired"])
        self.assertEqual(self.command(replacement, "release", result["owner_token"])["error"], "owner_token_mismatch")
        self.assertTrue(self.command(replacement, "renew", new["owner_token"])["renewed"])
        self.assertTrue(self.command(replacement, "release", new["owner_token"])["released"])

    def test_expiry_and_closed_input_release(self):
        owner = self.start("0.1")
        self.assertTrue(self.read(owner)["acquired"])
        self.assertEqual(self.read(owner)["reason"], "lease_expired")
        owner.wait(timeout=2)
        replacement = self.start()
        self.assertTrue(self.read(replacement)["acquired"])
        replacement.stdin.close()
        self.assertEqual(self.read(replacement)["reason"], "owner_input_closed")

    def test_status_names_owner_without_token(self):
        owner = self.start()
        acquired = self.read(owner)
        response = subprocess.check_output([sys.executable, str(SCRIPT), "status", "--path", self.path], text=True)
        self.assertNotIn(acquired["owner_token"], response)
        self.assertEqual(json.loads(response)["owner"]["owner"], "test-owner-task")

    def test_nonfinite_ttl_rejected(self):
        for ttl in ("nan", "inf", "-inf"):
            result = subprocess.run([sys.executable, str(SCRIPT), "acquire", "--path", self.path, "--ttl=" + ttl], capture_output=True)
            self.assertEqual(result.returncode, 2)


if __name__ == "__main__":
    unittest.main()
