#!/usr/bin/env python3
"""Process-boundary acceptance tests; never run the project's full typecheck."""
import importlib.util
import json
import multiprocessing as mp
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('tsc_queue', HERE / 'tsc-queue.py')
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)
CTX = mp.get_context('fork')


def client(base, compiler, name, args, env):
    base = Path(base)
    queue = MODULE.Queue(base / 'queue', base / 'config.json', base / 'legacy', lambda: [])
    with (base / f'{name}.out').open('wb') as out, (base / f'{name}.err').open('wb') as err:
        status = queue.run(base, Path(compiler), 'tsc6', args, env, base, out, err)
    (base / f'{name}.status').write_text(str(status))


class QueueAcceptance(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='tsc-queue-test-')
        self.base = Path(self.temp.name)
        self.clients = []
        (self.base / 'config.json').write_text('{"max_concurrent":1}')
        self.compiler = self.base / 'compiler'
        self.compiler.write_text(f'''#!{sys.executable}
import os, pathlib, sys, time
base = pathlib.Path.cwd()
value = (base / 'source').read_text()
(base / ('started-' + str(os.getpid()))).write_text(value)
while not (base / ('release-' + value)).exists(): time.sleep(.02)
print('stdout:' + value)
print('stderr:' + value, file=sys.stderr)
sys.exit(int((base / 'exit-code').read_text()))
''')
        self.compiler.chmod(0o755)
        (self.base / 'source').write_text('A')
        (self.base / 'exit-code').write_text('0')
        self.env = dict(os.environ)

    def tearDown(self):
        # Release owned synthetic work even when an assertion fails.
        for value in ['A', 'D', 'E']:
            (self.base / ('release-' + value)).touch()
        for proc in self.clients:
            proc.join(3)
            if proc.is_alive():
                proc.terminate()
                proc.join(2)
        for run in self.runs():
            pid = run.get('process_group')
            if run.get('state') == 'running' and pid:
                try: os.killpg(pid, signal.SIGKILL)
                except ProcessLookupError: pass
        time.sleep(.1)
        self.temp.cleanup()

    def wait(self, condition, message, timeout=12):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            result = condition()
            if result: return result
            time.sleep(.03)
        self.fail(message)

    def runs(self):
        try: return list(json.loads((self.base / 'queue/state.json').read_text())['runs'].values())
        except FileNotFoundError: return []

    def launch(self, name, args=None, env=None, compiler=None):
        proc = CTX.Process(target=client, args=(str(self.base), str(compiler or self.compiler), name, args or ['--noEmit'], env or self.env))
        proc.start()
        self.clients.append(proc)
        return proc

    def started(self):
        return list(self.base.glob('started-*'))

    def result(self, name, expected=0):
        self.wait(lambda: (self.base / f'{name}.status').exists(), f'{name} did not receive results')
        self.assertEqual(int((self.base / f'{name}.status').read_text()), expected)
        return ((self.base / f'{name}.out').read_bytes(), (self.base / f'{name}.err').read_bytes())

    def joined(self, count):
        def enough():
            for run in self.runs():
                if run['state'] != 'pending': continue
                waiters = run.get('waiters', [])
                total = run.get('waiter_count', waiters if isinstance(waiters, int) else len(waiters))
                if total >= count: return True
            return False
        self.wait(enough, f'{count} callers did not join pending generation')

    def test_a_then_bcd_share_latest_pending_results(self):
        self.launch('A')
        self.wait(lambda: len(self.started()) == 1, 'A did not start')
        for name in ['B', 'C', 'D']: self.launch(name)
        self.joined(3)
        self.assertEqual(len(self.started()), 1)
        (self.base / 'source').write_text('D')
        (self.base / 'release-A').touch()
        self.wait(lambda: len(self.started()) == 2, 'pending run did not start')
        self.assertEqual(self.result('A'), (b'stdout:A\n', b'stderr:A\n'))
        (self.base / 'exit-code').write_text('2')
        (self.base / 'release-D').touch()
        for name in ['B', 'C', 'D']:
            self.assertEqual(self.result(name, 2), (b'stdout:D\n', b'stderr:D\n'))
        self.assertEqual(len(self.started()), 2)

    def test_cap_two_but_same_key_never_overlaps(self):
        (self.base / 'config.json').write_text('{"max_concurrent":2}')
        self.launch('A')
        self.wait(lambda: len(self.started()) == 1, 'A did not start')
        self.launch('B')
        self.joined(1)
        self.launch('C', ['--noEmit', '--strict'])
        self.wait(lambda: len(self.started()) == 2, 'distinct check should use second slot')
        self.launch('D', ['--noEmit', '--strictNullChecks'])
        self.wait(lambda: sum(r['state'] == 'pending' for r in self.runs()) == 2, 'D should wait at cap')
        self.assertEqual(len(self.started()), 2)
        (self.base / 'release-A').touch()
        for name in ['A', 'B', 'C', 'D']: self.result(name)
        self.assertEqual(len(self.started()), 4)

    def test_cancelling_caller_does_not_cancel_shared_execution(self):
        a = self.launch('A')
        self.wait(lambda: len(self.started()) == 1, 'A did not start')
        self.launch('B')
        c = self.launch('C')
        self.joined(2)
        c.terminate(); c.join(2)
        a.terminate(); a.join(2)
        time.sleep(.2)
        self.assertEqual(len(self.started()), 1)
        (self.base / 'source').write_text('D')
        (self.base / 'release-A').touch()
        self.wait(lambda: len(self.started()) == 2, 'surviving waiter did not run')
        (self.base / 'release-D').touch()
        self.assertEqual(self.result('B'), (b'stdout:D\n', b'stderr:D\n'))

    def test_supervisor_kill_cleans_compiler_before_next_check(self):
        self.launch('A')
        self.wait(lambda: len(self.started()) == 1, 'A did not start')
        compiler_pid = int(self.started()[0].name.split('-')[1])
        run = self.wait(lambda: next((r for r in self.runs() if r.get('guard_pid')), None), 'compiler not recorded')
        os.kill(run['supervisor_pid'], signal.SIGKILL)
        (self.base / 'source').write_text('D')
        self.launch('B', ['--strict'])
        self.wait(lambda: len(self.started()) == 2, 'guard did not stop orphan and recover capacity')
        try:
            os.kill(compiler_pid, 0)
        except ProcessLookupError:
            pass
        else:
            self.fail('unsafe orphan compiler survived its monitor')
        (self.base / 'release-D').touch()
        self.result('A', 70)
        self.result('B')

    def test_invalid_configuration_fails_without_compiler(self):
        (self.base / 'config.json').write_text('{"max_concurrent":0}')
        self.launch('A')
        self.wait(lambda: not self.clients[0].is_alive(), 'invalid cap did not fail')
        self.assertEqual(len(self.started()), 0)
        status = self.base / 'A.status'
        self.assertTrue(not status.exists() or status.read_text() != '0')

    def test_environment_isolation(self):
        (self.base / 'config.json').write_text('{"max_concurrent":2}')
        self.launch('A')
        self.wait(lambda: len(self.started()) == 1, 'A did not start')
        self.launch('B', env={**self.env, 'NODE_PATH': '/different/typecheck/modules'})
        self.wait(lambda: len(self.started()) == 2, 'different environment was incorrectly coalesced')
        (self.base / 'release-A').touch()
        self.result('A'); self.result('B')

    def test_default_cap_and_late_arrival_gets_next_generation(self):
        (self.base / 'config.json').unlink()
        self.launch('A')
        self.wait(lambda: len(self.started()) == 1, 'A did not start')
        self.launch('B')
        self.joined(1)
        (self.base / 'source').write_text('D')
        (self.base / 'release-A').touch()
        self.wait(lambda: len(self.started()) == 2, 'D did not start')
        self.launch('E')
        self.joined(1)
        (self.base / 'source').write_text('E')
        (self.base / 'release-D').touch()
        self.wait(lambda: len(self.started()) == 3, 'late caller reused an already running result')
        (self.base / 'release-E').touch()
        self.assertEqual(self.result('E'), (b'stdout:E\n', b'stderr:E\n'))

    def test_agent_metadata_does_not_split_equivalent_checks(self):
        self.launch('A')
        self.wait(lambda: len(self.started()) == 1, 'A did not start')
        for name in ['B', 'C', 'D']:
            self.launch(name, env={**self.env, 'CODEX_THREAD_ID': name,
                                  'npm_lifecycle_event': name})
        self.joined(3)
        (self.base / 'release-A').touch()
        for name in ['A', 'B', 'C', 'D']: self.result(name)
        self.assertEqual(len(self.started()), 2)

    def test_corrupt_state_refuses_to_start(self):
        (self.base / 'queue').mkdir(mode=0o700)
        (self.base / 'queue/state.json').write_text('{broken')
        self.launch('A')
        self.result('A', 70)
        self.assertEqual(len(self.started()), 0)
        # Avoid reading deliberately corrupt JSON in tearDown.
        (self.base / 'queue/state.json').write_text('{"version":1,"runs":{}}')

    def test_guard_kill_cleans_compiler_and_is_not_success(self):
        self.launch('A')
        self.wait(lambda: len(self.started()) == 1, 'compiler did not start')
        actual_pid = int(self.started()[0].name.split('-')[1])
        run = self.wait(lambda: next((r for r in self.runs() if r.get('guard_pid')), None), 'compiler not recorded')
        os.kill(run['guard_pid'], signal.SIGKILL)
        self.result('A', 137)
        with self.assertRaises(ProcessLookupError):
            os.kill(actual_pid, 0)

    def test_actual_typescript_diagnostic_and_success(self):
        compiler = HERE.parent / 'node_modules/.bin/tsc6'
        self.assertTrue(compiler.exists(), 'installed TypeScript compiler is required')
        (self.base / 'sample.ts').write_text('const value: number = "wrong";\n')
        args = ['--noEmit', '--skipLibCheck', '--strict', 'sample.ts']
        self.launch('A', args, compiler=compiler)
        output, _ = self.result('A', 2)
        self.assertIn(b'TS2322', output)
        (self.base / 'sample.ts').write_text('const value: number = 1;\n')
        self.launch('B', args, compiler=compiler)
        self.assertEqual(self.result('B'), (b'', b''))

    def test_rss_ceiling_returns_137_without_allocating_gigabytes(self):
        original_snapshot = MODULE.process_snapshot
        def excessive_rss():
            return [{**row, 'rss': 21 * 1048576} for row in original_snapshot()]
        MODULE.process_snapshot = excessive_rss
        try:
            self.launch('A')
        finally:
            MODULE.process_snapshot = original_snapshot
        _, error = self.result('A', 137)
        self.assertIn(b'RSS ceiling', error)

    def test_peak_report_setting_is_not_coalesced(self):
        (self.base / 'config.json').write_text('{"max_concurrent":2}')
        self.launch('A')
        self.wait(lambda: len(self.started()) == 1, 'A did not start')
        self.launch('B', env={**self.env, 'MATRX_TSC_REPORT_PEAK': '1'})
        self.wait(lambda: len(self.started()) == 2, 'peak output option incorrectly coalesced')
        (self.base / 'release-A').touch()
        self.assertNotIn(b'peak RSS', self.result('A')[1])
        self.assertIn(b'peak RSS', self.result('B')[1])

    def test_launch_failure_is_loud(self):
        self.compiler.write_text('#!/no/such/interpreter\n')
        self.launch('A')
        _, error = self.result('A', 70)
        self.assertTrue(error)


    def test_actual_shell_wrapper_with_isolated_queue_storage(self):
        # Intercept only interpreter startup to inject test storage; the real
        # wrapper, CLI parsing, queue, guard and installed compiler all execute.
        shims = self.base / 'shims'
        shims.mkdir()
        shim = shims / 'python3'
        shim.write_text(f'''#!{sys.executable}
import importlib.util, pathlib, sys
module_path = sys.argv.pop(1)
spec = importlib.util.spec_from_file_location("tsc_queue_cli", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
base = pathlib.Path({str(self.base)!r})
def factory(*args):
    return module.Queue(base / "queue", base / "config.json", base / "legacy", lambda: [])
sys.exit(module.main(queue_factory=factory))
''')
        shim.chmod(0o755)
        (self.base / 'sample.ts').write_text('const value: number = "wrong";\n')
        command = ['bash', str(HERE / 'tsc-capped.sh'), 'tsc6',
                   '--noEmit', '--skipLibCheck', '--strict', 'sample.ts']
        env = {**self.env, 'PATH': str(shims) + os.pathsep + self.env['PATH']}
        bad = subprocess.run(command, cwd=self.base, env=env, capture_output=True, timeout=15)
        self.assertEqual(bad.returncode, 2, bad.stderr)
        self.assertIn(b'TS2322', bad.stdout)
        (self.base / 'sample.ts').write_text('const value: number = 1;\n')
        good = subprocess.run(command, cwd=self.base, env=env, capture_output=True, timeout=15)
        self.assertEqual(good.returncode, 0, good.stderr)
        self.assertEqual(good.stdout, b'')



if __name__ == '__main__':
    unittest.main()
