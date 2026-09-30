#!/usr/bin/env python3
"""Coalesce pending checks, with OS-owned capacity that survives caller death.

Configuration: ~/.config/matrx/tsc-queue.json {"max_concurrent": 1}.
All wrapper callers on this host share /tmp/matrx-tsc-queue-<uid>.
Results are never reused by a later invocation. Finished results expire after a
 day (or earlier at the 1 GiB retention budget); logs are streamed from disk, never accumulated in the queue's RAM.

A check runs only for callers that are still alive. Each caller is recorded on
its run by identity (pid + process start time, so a reused pid never counts);
it removes itself on exit, and a sweep drops callers that died without doing so
(SIGKILL). A pending run with no live caller is dropped before it can start; a
running check with no live caller for ABANDON_GRACE_SECONDS is killed and its
slot released (2026-09-29: with a cap of 1, one abandoned compile blocked every
agent on the machine).

The memory ceiling measures REAL memory: on macOS each process's physical
footprint (proc_pid_rusage ri_phys_footprint, what Activity Monitor calls
"Memory"), because RSS excludes compressed pages — a process showed ~3 GB RSS
while its footprint was 44 GB. Elsewhere, or when the call fails, RSS.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import ctypes
import fcntl
import hashlib
import json
import os
import re
from pathlib import Path
import shutil
import select
import signal
import subprocess
import sys
import threading
import time
import uuid

POLL_SECONDS = 0.1
RESULT_TTL_SECONDS = 86400
MAX_LOG_BYTES = 128 * 1024 * 1024
MAX_RETAINED_BYTES = 1024 * 1024 * 1024
DEFAULT_MAX_MEMORY_GB = 24
# How often callers are checked for liveness, and how long a running check may
# go with no live caller before it is killed.
WAITER_CHECK_SECONDS = 1.0
ABANDON_GRACE_SECONDS = 10.0
CALLER_SIGNALS = (signal.SIGTERM, signal.SIGHUP)
# Shell/terminal bookkeeping does not affect TypeScript. Everything else is
# hashed (never stored), including compiler runtime and memory settings.
ENV_NOISE = {'_', 'SHLVL', 'PWD', 'OLDPWD', 'TERM', 'COLORTERM',
             'MATRX_TSC_MAX_CONCURRENT',
             'npm_lifecycle_event', 'npm_lifecycle_script', 'npm_command',
             'npm_execpath', 'npm_node_execpath'}


def process_snapshot():
    rows = []
    text = subprocess.check_output(
        ['ps', '-axo', 'pid=,ppid=,pgid=,rss=,command='], text=True)
    for line in text.splitlines():
        parts = line.strip().split(None, 4)
        if len(parts) == 5:
            rows.append({'pid': int(parts[0]), 'ppid': int(parts[1]),
                         'pgid': int(parts[2]), 'rss': int(parts[3]),
                         'command': parts[4]})
    return rows


class _RUsageInfoV0(ctypes.Structure):
    _fields_ = [('ri_uuid', ctypes.c_uint8 * 16)] + [
        (name, ctypes.c_uint64) for name in (
            'ri_user_time', 'ri_system_time', 'ri_pkg_idle_wkups',
            'ri_interrupt_wkups', 'ri_pageins', 'ri_wired_size',
            'ri_resident_size', 'ri_phys_footprint', 'ri_proc_start_abstime',
            'ri_proc_exit_abstime')]


_LIBPROC = None
if sys.platform == 'darwin':
    try:
        _LIBPROC = ctypes.CDLL('/usr/lib/libproc.dylib', use_errno=True)
        _LIBPROC.proc_pid_rusage.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_void_p]
        _LIBPROC.proc_pid_rusage.restype = ctypes.c_int
    except (OSError, AttributeError):
        _LIBPROC = None


def phys_footprint_bytes(pid):
    """macOS physical footprint (includes compressed memory); None if unavailable."""
    if _LIBPROC is None:
        return None
    info = _RUsageInfoV0()
    if _LIBPROC.proc_pid_rusage(pid, 0, ctypes.byref(info)) != 0:  # RUSAGE_INFO_V0
        return None
    return info.ri_phys_footprint


def process_memory_bytes(row):
    footprint = phys_footprint_bytes(row['pid'])
    return footprint if footprint is not None else row['rss'] * 1024


def waiter_identity(pid):
    """A caller is (pid, start time): a reused pid has a different start."""
    identities = process_identities([pid])
    return {'pid': pid, 'start': identities.get(pid)}


def process_identities(pids):
    """{pid: start time} for live, non-zombie processes among pids."""
    if not pids:
        return {}
    result = subprocess.run(['ps', '-o', 'pid=,stat=,lstart=', '-p',
                             ','.join(str(pid) for pid in pids)],
                            capture_output=True, text=True)
    identities = {}
    for line in result.stdout.splitlines():
        parts = line.split(None, 2)
        if len(parts) == 3 and not parts[1].startswith('Z'):
            identities[int(parts[0])] = ' '.join(parts[2].split())
    return identities


def live_waiters(waiters):
    alive = process_identities(sorted({w['pid'] for w in waiters}))
    return [w for w in waiters if w.get('start') and alive.get(w['pid']) == w['start']]


def prune_waiters(run):
    """Drop dead callers from a run; True when a caller is still alive.

    A run written by an older queue version carries an integer count, which
    cannot be checked; it is treated as alive rather than killed on a guess.
    """
    if not isinstance(run.get('waiters'), list):
        return True
    run['waiters'] = live_waiters(run['waiters'])
    return bool(run['waiters'])


def _caller_signalled(signum, frame):
    # SystemExit unwinds through _run's finally, which removes this caller.
    raise SystemExit(128 + signum)


# The compiler is the EXECUTABLE of a process (argv[0], or the script node runs
# as argv[1]) — never a substring anywhere in its command line. A substring test
# matched every editor's tsserver, whose `--cancellationPipeName
# .../T/<hash>/tscancellation*` argument contains "/tsc" under a
# ".../node_modules/typescript/lib/tsserver.js" path, so one open language
# server (Serena, VS Code) held every queued type-check pending forever
# (38 pending, none running, 2026-09-27).
COMPILER_EXECUTABLE = re.compile(
    r'(?:^|/)@?typescript[^/\s]*/(?:[^\s]*/)?(?:tsc[\w.-]*|tsgo)(?:\.js)?$'
    r'|(?:^|/)tsgo$')


def is_compiler_command(command):
    parts = command.split()
    return any(COMPILER_EXECUTABLE.search(part) for part in parts[:2])


def kill_compiler_group(group):
    """macOS may return EPERM for an already exited group; never hide a live one."""
    try:
        os.killpg(group, signal.SIGKILL)
    except ProcessLookupError:
        pass
    except PermissionError:
        rows = subprocess.check_output(['ps', '-axo', 'pgid=,stat='], text=True)
        members = [line.split() for line in rows.splitlines()]
        if any(int(parts[0]) == group and not parts[1].startswith('Z')
               for parts in members if len(parts) == 2):
            raise


def try_lock(path):
    fd = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        return None
    return fd


def locked(path):
    fd = try_lock(path)
    if fd is None:
        return True
    os.close(fd)
    return False


class Queue:
    def __init__(self, state_dir, config_path, legacy_slots_dir,
                 process_snapshot=process_snapshot):
        self.base = Path(state_dir)
        self.config = Path(config_path)
        self.legacy = Path(legacy_slots_dir)
        self.snapshot = process_snapshot
        self.base.mkdir(parents=True, mode=0o700, exist_ok=True)
        if self.base.stat().st_uid != os.getuid() or self.base.stat().st_mode & 0o077:
            raise RuntimeError('queue directory must be owned by this user and private (0700)')
        for name in ('results', 'slots', 'keys'):
            (self.base / name).mkdir(mode=0o700, exist_ok=True)
        self.state_path = self.base / 'state.json'

    @contextmanager
    def state(self):
        fd = os.open(self.base / 'state.lock', os.O_CREAT | os.O_RDWR, 0o600)
        fcntl.flock(fd, fcntl.LOCK_EX)
        try:
            try:
                data = json.loads(self.state_path.read_text())
            except FileNotFoundError:
                data = {'version': 1, 'runs': {}}
            if data.get('version') != 1 or not isinstance(data.get('runs'), dict):
                raise RuntimeError('invalid queue state; refusing to launch a compiler')
            yield data, fd
            staging = self.base / 'state.tmp'
            with staging.open('w') as output:
                json.dump(data, output)
                output.flush()
                os.fsync(output.fileno())
            os.replace(staging, self.state_path)
        finally:
            os.close(fd)

    def cap(self):
        try:
            value = json.loads(self.config.read_text())['max_concurrent']
        except FileNotFoundError:
            return 1
        if type(value) is not int or value < 1:
            raise ValueError(f'{self.config}: max_concurrent must be a positive integer')
        return value

    def recover(self, data):
        now = time.time()
        if now >= data.get('next_waiter_check_at', 0):
            data['next_waiter_check_at'] = now + WAITER_CHECK_SECONDS
            for rid, run in list(data['runs'].items()):
                # Nobody is left to receive this result: never start it.
                if run['state'] == 'pending' and not prune_waiters(run):
                    del data['runs'][rid]
        for rid, run in list(data['runs'].items()):
            if run['state'] == 'running' and not locked(self.base / 'keys' / run['key']):
                run.update(state='done', status=70, finished_at=now,
                           error='check runner exited before publishing its result; rerun the check')
            if run['state'] == 'done' and now - run['finished_at'] > RESULT_TTL_SECONDS:
                for field in ('stdout_path', 'stderr_path'):
                    Path(run[field]).unlink(missing_ok=True)
                del data['runs'][rid]
            if run['state'] == 'pending' and now - run['created_at'] > RESULT_TTL_SECONDS:
                # Old waiters get a loud missing-result error, never a cached success.
                del data['runs'][rid]
        if now >= data.get('next_cleanup_at', 0):
            retained = 0
            finished = sorted((r for r in data['runs'].values() if r['state'] == 'done'),
                              key=lambda r: r['finished_at'], reverse=True)
            for run in finished:
                for field in ('stdout_path', 'stderr_path'):
                    try: retained += Path(run[field]).stat().st_size
                    except FileNotFoundError: pass
                if retained > MAX_RETAINED_BYTES:
                    for field in ('stdout_path', 'stderr_path'):
                        Path(run[field]).unlink(missing_ok=True)
                    del data['runs'][run['id']]
            retained_keys = {r['key'] for r in data['runs'].values()}
            for path in (self.base / 'keys').iterdir():
                if path.name not in retained_keys and not locked(path):
                    path.unlink()
            data['next_cleanup_at'] = now + 60

    def legacy_running(self, data):
        if data.get('legacy_retry_after', 0) > time.time():
            return True
        rows = self.snapshot()
        data['legacy_retry_after'] = time.time() + 0.5
        ours = {r.get('process_group') for r in data['runs'].values()
                if r['state'] == 'running'}
        for row in rows:
            command = row['command']
            if row['pgid'] in ours:
                continue
            # Drain every old wrapper, including its waiters. New wrappers exec
            # Python, so they never remain in this census. Old waiting shells
            # must finish before the new cap can safely become authoritative.
            if re.match(r'^(?:\S*/)?bash(?:\s+-\w+)*\s+\S*tsc-capped\.sh(?:\s|$)', command):
                return True
            if is_compiler_command(command):
                return True
        # A live legacy slot is conservative evidence, even during compiler spawn.
        by_pid = {row['pid']: row for row in rows}
        for slot in self.legacy.glob('slot-*'):
            try:
                owner = int((slot / 'pid').read_text())
            except (OSError, ValueError):
                continue
            row = by_pid.get(owner)
            if row and 'tsc-capped.sh' in row['command']:
                return True
        data['legacy_retry_after'] = 0
        return False

    def capacity(self, cap):
        used = 0
        free = None
        for path in (self.base / 'slots').glob('*.lock'):
            if locked(path):
                used += 1
            elif free is None:
                free = path
        if used >= cap:
            return None
        if free is None:
            free = self.base / 'slots' / f'{uuid.uuid4().hex}.lock'
        return try_lock(free)

    def fingerprint(self, root, binary, args, env, cwd):
        stat = binary.stat()
        identity = {'root': str(root), 'cwd': str(cwd), 'binary': str(binary),
                    'binary_mtime': stat.st_mtime_ns, 'binary_size': stat.st_size,
                    'args': args, 'env': {k: v for k, v in env.items()
                                        if k not in ENV_NOISE and not k.startswith(
                                            ('CODEX_', 'CLAUDE_', 'npm_package_'))}}
        return hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()

    def run(self, root, compiler_bin, compiler_name, args, env, cwd, stdout, stderr):
        previous = {}
        if threading.current_thread() is threading.main_thread():
            for sig in CALLER_SIGNALS:
                previous[sig] = signal.signal(sig, _caller_signalled)
        try:
            return self._run(root, compiler_bin, compiler_name, args, dict(env), cwd, stdout, stderr)
        except Exception as error:
            stderr.write(f'[tsc-capped] ERROR: {error}\n'.encode())
            stderr.flush()
            return 70
        finally:
            for sig, handler in previous.items():
                signal.signal(sig, handler)

    def leave(self, target, me):
        """This caller no longer wants the result (finished, failed or killed)."""
        with self.state() as (data, _):
            run = data['runs'].get(target)
            if run is None or not isinstance(run.get('waiters'), list):
                return
            run['waiters'] = [w for w in run['waiters'] if w != me]
            if run['state'] == 'pending' and not run['waiters']:
                del data['runs'][target]

    def _run(self, root, compiler_bin, compiler_name, args, env, cwd, stdout, stderr):
        root, binary, cwd = Path(root).resolve(), Path(compiler_bin).resolve(), Path(cwd).resolve()
        if any(arg.lower().split('=')[0] in ('--watch', '-w') for arg in args):
            raise ValueError('watch mode is not supported by the finite check queue; use a one-shot --noEmit check')
        # The knob keeps its historical name; it bounds REAL memory (footprint).
        rss_gb = int(env.get('MATRX_TSC_MAX_RSS_GB', str(DEFAULT_MAX_MEMORY_GB)))
        if rss_gb < 1:
            raise ValueError('MATRX_TSC_MAX_RSS_GB must be a positive integer')
        key = self.fingerprint(root, binary, args, env, cwd)
        me = waiter_identity(os.getpid())
        if not me['start']:
            raise RuntimeError('could not read this process start time; refusing to queue a check nobody can track')
        target = None
        try:
            while True:
                completed = None
                # A caller signal waits until the state write is published, so a
                # fork and its publication are never split; it lands right after.
                signal.pthread_sigmask(signal.SIG_BLOCK, (*CALLER_SIGNALS, signal.SIGINT))
                try:
                    with self.state() as (data, state_fd):
                        cap = self.cap()
                        self.recover(data)
                        if target is None:
                            run = next((r for r in data['runs'].values()
                                        if r['key'] == key and r['state'] == 'pending'
                                        and isinstance(r.get('waiters'), list)), None)
                            if run is None:
                                rid = uuid.uuid4().hex
                                run = {'id': rid, 'key': key, 'state': 'pending', 'waiters': [],
                                       'created_at': time.time(),
                                       'stdout_path': str(self.base / 'results' / f'{rid}.out'),
                                       'stderr_path': str(self.base / 'results' / f'{rid}.err')}
                                data['runs'][rid] = run
                            target = run['id']
                            run['waiters'].append(me)
                            run['latest_requested_at'] = time.time()
                        else:
                            run = data['runs'].get(target)
                            if run is None:
                                raise RuntimeError('requested result expired; rerun the check')
                        if run['state'] == 'done':
                            completed = dict(run)
                        elif run['state'] == 'pending':
                            key_fd = try_lock(self.base / 'keys' / key)
                            slot_fd = self.capacity(cap) if key_fd is not None else None
                            if slot_fd is not None and self.legacy_running(data):
                                os.close(slot_fd)
                                slot_fd = None
                            if slot_fd is not None:
                                # fork under the state lock: publication and handoff are one
                                # serialized operation. Child closes the inherited state FD
                                # without unlocking the parent's shared open description.
                                run.update(state='running', started_at=time.time())
                                try:
                                    pid = os.fork()
                                except BaseException:
                                    os.close(slot_fd)
                                    os.close(key_fd)
                                    raise
                                if pid == 0:
                                    try:
                                        self.supervise(run, binary, args, env, cwd, rss_gb, key_fd, slot_fd)
                                    finally:
                                        os._exit(70)
                                run['supervisor_pid'] = pid
                                os.close(slot_fd)
                            if key_fd is not None:
                                os.close(key_fd)
                finally:
                    signal.pthread_sigmask(signal.SIG_UNBLOCK, (*CALLER_SIGNALS, signal.SIGINT))
                if completed is not None:
                    return self.replay(completed, stdout, stderr)
                # Reap only children of this client; cancelled clients leave a detached
                # supervisor whose output is on disk, not attached to their terminal.
                try:
                    while os.waitpid(-1, os.WNOHANG)[0]:
                        pass
                except ChildProcessError:
                    pass
                time.sleep(POLL_SECONDS)
        finally:
            if target is not None:
                self.leave(target, me)

    def supervise(self, run, binary, args, env, cwd, rss_gb, key_fd, slot_fd):
        os.setsid()
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        # The caller's exit handlers and blocked mask are not the supervisor's.
        for sig in CALLER_SIGNALS:
            signal.signal(sig, signal.SIG_DFL)
        signal.pthread_sigmask(signal.SIG_SETMASK, ())
        # Close caller pipes, state lock, test harness pipes, etc. Only these
        # locks survive, and they will also be inherited by the compiler.
        fd_dir = '/dev/fd' if Path('/dev/fd').exists() else '/proc/self/fd'
        for name in os.listdir(fd_dir):
            if name.isdigit() and int(name) > 2 and int(name) not in (key_fd, slot_fd):
                try: os.close(int(name))
                except OSError: pass
        with open(os.devnull, 'r+b') as null:
            for fd in (0, 1, 2): os.dup2(null.fileno(), fd)
        status = 70
        error = None
        child = None
        try:
            with self.state() as (data, _):
                data['runs'][run['id']]['supervisor_pid'] = os.getpid()
            env['NODE_OPTIONS'] = (env.get('NODE_OPTIONS', '') + f' --max-old-space-size={rss_gb * 1024}').strip()
            env['GOMEMLIMIT'] = f'{rss_gb}GiB'
            with open(run['stdout_path'], 'wb') as out, open(run['stderr_path'], 'wb') as err:
                guard_read, guard_write = os.pipe()
                try:
                    child = subprocess.Popen(
                        [sys.executable, str(Path(__file__).resolve()), '--guard',
                         str(guard_read), str(key_fd), str(slot_fd), str(binary), *args],
                        cwd=cwd, env=env, stdin=subprocess.DEVNULL, stdout=out, stderr=err,
                        start_new_session=True, pass_fds=(guard_read, key_fd, slot_fd))
                finally:
                    os.close(guard_read)

                with self.state() as (data, _):
                    data['runs'][run['id']].update(guard_pid=child.pid, process_group=child.pid)
                peak = 0
                next_waiter_check = 0.0
                orphaned_since = None
                while child.poll() is None:
                    rows = process_snapshot()
                    descendants = {child.pid}
                    for _ in rows:
                        before = len(descendants)
                        descendants.update(row['pid'] for row in rows if row['ppid'] in descendants)
                        if len(descendants) == before: break
                    # Real memory (macOS physical footprint), never bare RSS.
                    memory = sum(process_memory_bytes(row) for row in rows
                                 if row['pid'] in descendants or row['pgid'] == child.pid)
                    peak = max(peak, memory)
                    if memory > rss_gb * 1024 ** 3:
                        error = (f'KILLED: compiler exceeded its {rss_gb} GB memory ceiling '
                                 f'({memory / 1024 ** 3:.1f} GB physical footprint)')
                        kill_compiler_group(child.pid)
                        status = 137
                        break
                    now = time.monotonic()
                    if now >= next_waiter_check:
                        next_waiter_check = now + WAITER_CHECK_SECONDS
                        with self.state() as (data, _):
                            alive = prune_waiters(data['runs'][run['id']])
                        if alive:
                            orphaned_since = None
                        elif orphaned_since is None:
                            orphaned_since = now
                        if orphaned_since is not None and now - orphaned_since >= ABANDON_GRACE_SECONDS:
                            error = ('KILLED: abandoned: every caller exited before the check finished; '
                                     'the compiler was stopped to free the queue')
                            kill_compiler_group(child.pid)
                            status = 70
                            break
                    if out.tell() + err.tell() > MAX_LOG_BYTES:
                        error = 'KILLED: compiler output exceeded 128 MiB; result is incomplete'
                        kill_compiler_group(child.pid)
                        status = 70
                        break
                    time.sleep(POLL_SECONDS)
                code = child.wait()
                os.close(guard_write)
                # A killed guard may leave the compiler alive. The monitor
                # always clears its isolated group before releasing capacity.
                try: kill_compiler_group(child.pid)
                except ProcessLookupError: pass
                if error is None:
                    status = code if code >= 0 else 128 - code
                if env.get('MATRX_TSC_REPORT_PEAK'):
                    err.write(f'[tsc-capped] peak memory {peak / 1024 ** 3:.2f} GB (cap {rss_gb} GB)\n'.encode())
        except BaseException as failure:
            error = f'check execution failed: {failure}'
            if child is not None and child.poll() is None:
                try: kill_compiler_group(child.pid)
                except ProcessLookupError: pass
                child.wait()
        try:
            with self.state() as (data, _):
                data['runs'][run['id']].update(state='done', status=status,
                                             error=error, finished_at=time.time())
        finally:
            os.close(key_fd)
            os.close(slot_fd)
        os._exit(0)

    def replay(self, run, stdout, stderr):
        missing = False
        for field, destination in (('stdout_path', stdout), ('stderr_path', stderr)):
            try:
                with open(run[field], 'rb') as source:
                    shutil.copyfileobj(source, destination, 65536)
            except FileNotFoundError:
                missing = True
            destination.flush()
        if run.get('error') or missing:
            message = run.get('error') or 'compiler output is missing; rerun the check'
            stderr.write(f'[tsc-capped] ERROR: {message}\n'.encode())
            stderr.flush()
        return 70 if missing else run['status']


def guard(read_fd, key_fd, slot_fd, command):
    """Independent parent-death guard, inside the compiler's process group.

    The monitor alone holds the pipe's write end. EOF is an OS-owned death
    signal, with no PID reuse race. The compiler never inherits either end.
    If the guard itself dies, the monitor clears the group before releasing
    its locks. Either process alone may die without leaving an unsafe compiler.
    """
    def monitor_gone():
        return bool(select.select([read_fd], [], [], 0)[0]) and not os.read(read_fd, 1)

    if monitor_gone():
        return 70
    try:
        child = subprocess.Popen(command, pass_fds=(key_fd, slot_fd))
    except OSError as error:
        print(f'[tsc-capped] ERROR: could not start compiler: {error}', file=sys.stderr)
        return 70
    while True:
        if monitor_gone():
            os.killpg(os.getpgrp(), signal.SIGKILL)
        code = child.poll()
        if code is not None:
            return code if code >= 0 else 128 - code
        time.sleep(POLL_SECONDS)


def main(queue_factory=Queue):
    if len(sys.argv) >= 6 and sys.argv[1] == '--guard':
        return guard(int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), sys.argv[5:])
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True)
    parser.add_argument('--compiler', required=True)
    parser.add_argument('--bin', required=True)
    parser.add_argument('args', nargs=argparse.REMAINDER)
    options = parser.parse_args()
    args = options.args[1:] if options.args[:1] == ['--'] else options.args
    queue = queue_factory(Path(f'/tmp/matrx-tsc-queue-{os.getuid()}'),
                  Path.home() / '.config/matrx/tsc-queue.json', Path('/tmp/matrx-tsc-slots'))
    return queue.run(Path(options.root), Path(options.bin), options.compiler,
                     args, os.environ, Path.cwd(), sys.stdout.buffer, sys.stderr.buffer)


if __name__ == '__main__':
    sys.exit(main())
