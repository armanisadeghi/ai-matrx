#!/usr/bin/env python3
"""clone-catchup-plan.py — the DELTA between production's migration ledger and the clone's.

🚨 THE CLASS THIS CLOSES (VERIFIER-13 item 4, 2026-09-22).

The nightly dev clone is a PHYSICAL RESTORE taken once a day. Every migration ledgered on
production AFTER that snapshot is simply absent from the clone — no error, no warning, no
drift report, because the clone's `public._schema_migrations` is production's own table as
it stood at the restore point. On 2026-09-22 that made lane STORE-TXN's whole suite PASS on
the clone and FAIL on main: `custom._relation_halves_agree`, a DEFERRED trigger OLD-TABLES-1
applied to production at 15:15:46Z, did not exist on a clone promoted at 06:20Z. Both lanes
were correct on their own bytes; the pair did not work.

So the clone is caught up, every night, right after it is refreshed — and the catch-up is
computed from the two LEDGERS, never from a timestamp:

  · a (source, filename) production has and the clone does not          -> ABSENT
  · a (source, filename) both have with DIFFERENT checksums             -> CHECKSUM DIFFERS
  · a (source, filename) both have with the SAME checksum, where the
    clone ALSO carries that file's INVERSE applied LATER               -> UNDONE ON THE CLONE

The third one is not a nicety, it is the case that bit us. Rule 27 is `up -> inverse -> up`,
and a rehearsal interrupted after its inverse leaves the ledger row saying "applied" while the
object is gone. `oldtables_w0_the_two_halves_of_a_relation_can_never_disagree.sql` sat on the
clone in exactly that state — up at 15:04:31Z, inverse at 15:09:18Z — which is the other half
of why the guard was missing. A ledger row is a claim; an inverse applied after it withdraws
the claim.

THE BYTES ARE CHECKED AGAINST `origin/main`, NOT THE WORKING TREE. These are shared checkouts
carrying other lanes' uncommitted work. A file whose committed bytes do not hash to what
production ledgered is REFUSED BY NAME and nothing is applied for it — the catch-up's whole
value is that the clone ends up carrying what production carries, and a file nobody can prove
is the file that ran on production cannot deliver that.

Reads two TSV dumps on disk, writes the plan on stdout, one row per line, fields separated by
ASCII US (0x1f). NOT tab: zsh's `read` treats tab as IFS whitespace and COLLAPSES a run of them,
so an empty field (a file with no selector) silently shifted every later field left and the log
printed the reapply flag where the reason belongs. Connects to nothing.
"""

from __future__ import annotations

import hashlib
import os
import subprocess
import sys
from pathlib import Path

SEP = "\x1f"

FRONTEND = Path("/Users/armanisadeghi/code/matrx-frontend")
AIDREAM = Path("/Users/armanisadeghi/code/aidream")

#: Where a (ledger source, basename) pair can live, in the order it is searched, and which
#: runner owns it. Mirrors `MIGRATION_SOURCES` / `CAMPAIGN_SOURCES` / `INVERSE_SOURCES` in
#: aidream/db/apply_migrations.py and `MIGRATIONS_DIR` in matrx-frontend/scripts/apply-migration.ts.
#: The ledger label is always the OWNING REPO's; `campaign` and `inverse` are selectors, not
#: labels, so a campaign file is ledgered under `matrx-frontend` or `aidream` like any other.
SOURCE_DIRS: dict[str, list[tuple[Path, Path, str, str]]] = {
    # label: [(repo root, directory, runner, selector)]
    "matrx-frontend": [
        (FRONTEND, FRONTEND / "migrations", "frontend", ""),
        (FRONTEND, FRONTEND / "migrations" / "campaign", "frontend", "campaign"),
        (FRONTEND, FRONTEND / "migrations" / "inverse", "frontend", "inverse"),
        (FRONTEND, FRONTEND / "migrations" / "rehearsal", "frontend", "rehearsal"),
    ],
    "aidream": [
        (AIDREAM, AIDREAM / "db" / "migrations", "aidream", ""),
        (AIDREAM, AIDREAM / "db" / "migrations" / "campaign", "aidream", "campaign"),
        (AIDREAM, AIDREAM / "db" / "migrations" / "inverse", "aidream", "inverse"),
        (AIDREAM, AIDREAM / "db" / "migrations" / "rehearsal", "aidream", "rehearsal"),
    ],
    # 🚨 DIRECT APPLIES (lane BRANCH-REFRESH-4, 2026-09-24). Since the owner's ruling of
    # 2026-09-24 ~17:30 PT ("all db stuff applied directly") lanes apply a campaign file to
    # production through the Supabase MCP / psql and ledger it by hand under source `campaign`.
    # No runner wrote that row, so no runner can replay it: the catch-up carries it the same way
    # (runner `direct` — the file in ONE transaction, lock_timeout 30s, then the same ledger row),
    # or only RECORDS the row when the clone's ledger already holds these exact bytes under the
    # runner's label (the lane rehearsed it here through `pnpm db:apply --target clone`).
    "campaign": [
        (FRONTEND, FRONTEND / "migrations" / "campaign", "direct", "campaign"),
        (AIDREAM, AIDREAM / "db" / "migrations" / "campaign", "direct", "campaign"),
    ],
    "matrx-graph": [
        (AIDREAM, AIDREAM / "packages" / "matrx-graph" / "matrx_graph" / "db" / "migrations",
         "aidream", ""),
    ],
    "matrx-ai": [
        (AIDREAM, AIDREAM / "packages" / "matrx-ai" / "matrx_ai" / "db" / "migrations",
         "aidream", ""),
    ],
    "matrx-seo": [
        (AIDREAM, AIDREAM / "packages" / "matrx-seo" / "matrx_seo" / "migrations", "aidream", ""),
    ],
    "matrx-utils": [
        (AIDREAM, AIDREAM / "packages" / "matrx-files" / "matrx_files" / "cloud_sync" / "sql",
         "aidream", ""),
    ],
}


def read_tsv(path: str) -> list[dict[str, str]]:
    rows = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) < 4:
                continue
            rows.append(
                {
                    "source": parts[0],
                    "filename": parts[1],
                    "checksum": parts[2],
                    "applied_at": parts[3],
                    # Optional (lane CLONE-LEDGER-VERDICTS): duration_ms, whether a runner wrote the
                    # row (applied_by_process present), and the lane that did. A 4-column dump still
                    # reads, and then no row is judged hand-ledgered.
                    "duration_ms": parts[4] if len(parts) > 4 else "",
                    "by_runner": parts[5] if len(parts) > 5 else "t",
                    "lane": parts[6] if len(parts) > 6 else "",
                }
            )
    return rows


# ── THE RULES IN FORCE WHEN PRODUCTION RAN A FILE (lane CLONE-LEDGER-VERDICTS, 2026-09-26) ──
# 🚨 CHAIR RULING, rule 2. A file production ran is judged by the rules in force at ITS production
# applied_at, not today's (grandfathering). The runners' own dated rules live beside the rules
# (scripts/lib/migration-rule-dates.ts for db:apply). This table holds the one this job owns:
# how a file reached production at all. From the owner's direct-apply ruling on, lanes ran files
# through the Supabase MCP / psql and wrote the ledger row BY HAND (duration 0, no runner
# provenance), so no runner judged those bytes on production — aidream/1040, 1043, 1044 and 1067
# on 2026-09-25/26 were refused on the clone by DD-224 and the `-- target:` header rule, rules
# production never applied to them. Such a row is carried the way production took it: runner
# `direct` (the committed bytes in one transaction, lock_timeout 30s, then the same ledger row).
RULES_INTRODUCED: list[tuple[str, str, str]] = [
    ("direct-apply regime", "2026-09-25 00:30:00+00",
     "owner ruling 2026-09-24 ~17:30 PT: all database changes applied directly via the Supabase MCP, "
     "the ledger row written by hand"),
]
DIRECT_REGIME_AT = RULES_INTRODUCED[0][1]


def hand_ledgered(r: dict[str, str]) -> bool:
    """A production row no runner wrote: duration 0, no process provenance, after the ruling."""
    return (r.get("duration_ms") == "0" and r.get("by_runner") in ("f", "false")
            and r["applied_at"] >= DIRECT_REGIME_AT)


_OWNER: dict[tuple[str, str], str] = {}
_OWNER_LOADED: set[str] = set()
OWNER_HISTORY_SINCE = "2026-09-01"


def owner_of(repo: Path | None, relpath: str, prod_row: dict[str, str]) -> str:
    """Who to ask about a file: the lane production's row names, else the last commit on
    origin/main that touched the path (its subject carries the lane), else the name itself."""
    if prod_row.get("lane"):
        return f"lane {prod_row['lane']} (production's ledger row)"
    if repo is None or not relpath:
        return "no lane on production's row and no committed file — ask whoever holds " + prod_row["filename"]
    if str(repo) not in _OWNER_LOADED:
        # ONE history read per repo, newest first: a `git log -- <path>` per file walks the whole
        # history for an old file (the first self-test run took minutes on four of them).
        _OWNER_LOADED.add(str(repo))
        out = subprocess.run(
            ["git", "-C", str(repo), "log", "origin/main", f"--since={OWNER_HISTORY_SINCE}",
             "--name-only", "--format=%x1e%h %s"],
            capture_output=True, check=False,
        )
        for block in out.stdout.decode("utf-8", "replace").split("\x1e"):
            head, _, names = block.partition("\n")
            for name in names.splitlines():
                if name.strip():
                    _OWNER.setdefault((str(repo), name.strip()), head.strip())
    line = _OWNER.get((str(repo), relpath))
    return f"last commit {line[:110]}" if line else f"no commit on origin/main since {OWNER_HISTORY_SINCE} touches it"


def inverse_of(repo: Path, relpath: str) -> str:
    """The committed inverse of an up-file, as a repo-relative path, or `MISSING: <why>`."""
    up = Path(relpath)
    base = up.name[: -len(".sql")] if up.name.endswith(".sql") else up.name
    parent = up.parent if up.parent.name != "campaign" else up.parent.parent
    for cand in (parent / "inverse" / f"{base}_down.sql", parent / "inverse" / f"{base}.inverse.sql"):
        committed = git_bytes(repo, str(cand))
        if committed is None:
            continue
        disk = repo / cand
        if not disk.is_file() or disk.read_bytes() != committed:
            return f"MISSING: {cand} differs on disk from origin/main (another lane's uncommitted edit)"
        return str(cand)
    return f"MISSING: no {parent}/inverse/{base}_down.sql (or .inverse.sql) is committed on origin/main"


def inverse_base(filename: str) -> str | None:
    """The `up` file an inverse undoes, by the two spellings both repos use."""
    if filename.endswith("_down.sql"):
        return filename[: -len("_down.sql")] + ".sql"
    if filename.endswith(".inverse.sql"):
        return filename[: -len(".inverse.sql")] + ".sql"
    if filename.startswith("inv_"):
        return filename[len("inv_") :]
    return None


_TREE: dict[Path, set[str]] = {}


def _tree(repo: Path) -> set[str]:
    """Every path committed on origin/main, read ONCE per repo.

    A `git show` per candidate path is a process per path: the first live repair run spent
    ~100 seconds per function looking for the file that owns it, almost all of it in git.
    """
    if repo not in _TREE:
        out = subprocess.run(
            ["git", "-C", str(repo), "ls-tree", "-r", "--name-only", "origin/main"],
            capture_output=True,
            check=False,
        )
        _TREE[repo] = set(out.stdout.decode("utf-8", "replace").splitlines()) if out.returncode == 0 else set()
    return _TREE[repo]


def git_bytes(repo: Path, relpath: str) -> bytes | None:
    if relpath not in _tree(repo):
        return None
    try:
        out = subprocess.run(
            ["git", "-C", str(repo), "show", f"origin/main:{relpath}"],
            capture_output=True,
            check=False,
        )
    except OSError:
        return None
    return out.stdout if out.returncode == 0 else None


def hashes(data: bytes) -> set[str]:
    """Both spellings a ledger row can carry.

    matrx-frontend hashes the raw bytes; aidream hashes with the EOF whitespace run
    stripped (and keeps the raw form for rows written before 2026-09-15).
    """
    return {
        hashlib.sha256(data).hexdigest(),
        hashlib.sha256(data.decode("utf-8", "surrogateescape").rstrip().encode("utf-8")).hexdigest(),
    }


SELFTEST = """\
THE THREE RULES, ON FIXTURES, WITH NO DATABASE. Each pair is the same ledger with ONE fact
changed, so a rule that stopped working shows up as a row that no longer moves.
"""


def self_test() -> int:
    import tempfile

    def run(prod_rows, clone_rows):
        d = tempfile.mkdtemp()
        pp, cp = os.path.join(d, "p.tsv"), os.path.join(d, "c.tsv")
        for path, rows in ((pp, prod_rows), (cp, clone_rows)):
            with open(path, "w", encoding="utf-8") as fh:
                for r in rows:
                    fh.write("\t".join(r) + "\n")
        argv = sys.argv
        sys.argv = ["x", pp, cp]
        import io, contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            main()
        sys.argv = argv
        return [l.split(SEP) for l in buf.getvalue().splitlines() if l]

    up = ("matrx-frontend", "zzselftest_up.sql", "aa" * 32, "2026-09-22 10:00:00+00")
    dn_late = ("matrx-frontend", "zzselftest_up_down.sql", "bb" * 32, "2026-09-22 11:00:00+00")
    dn_early = ("matrx-frontend", "zzselftest_up_down.sql", "bb" * 32, "2026-09-22 09:00:00+00")
    other = ("matrx-frontend", "zzselftest_up.sql", "cc" * 32, "2026-09-22 10:00:00+00")
    fails = 0

    cases = [
        ("GREEN-1 present on both, same bytes, no inverse -> NOT in the delta",
         [up], [up], 0),
        ("RED-1 absent from the clone -> in the delta",
         [up], [], 1),
        ("RED-2 different bytes on the clone -> in the delta",
         [up], [other], 1),
        ("RED-3 the clone ran its INVERSE after it -> in the delta (VERIFIER-13 item 4)",
         [up], [up, dn_late], 1),
        ("GREEN-2 the inverse ran BEFORE the up (rule 27 finished) -> NOT in the delta",
         [up], [up, dn_early], 0),
    ]
    # GREEN-3: production's own churn is dropped. It ran the inverse and then the up again;
    # the clone has neither, so the delta is the UP ALONE and never the inverse.
    rows = run([dn_early, up], [])
    names = [r[2] for r in rows]
    ok = names == ["zzselftest_up.sql"]
    print(("  ok   " if ok else "  FAIL ") + "GREEN-3 a production inverse its own base superseded is dropped")
    if not ok:
        fails += 1
        print(f"        expected only the up, got {names}")
    # DIRECT-APPLY rows: source `campaign` resolves to migrations/campaign; a file the clone already
    # ran under the runner's label is RECORDED, never executed again.
    import subprocess as _sp
    camp = sorted((FRONTEND / "migrations" / "campaign").glob("*.sql"))
    # The FIRST committed, unedited file is all the fixture needs (a `git show` per file over
    # the whole directory cost this self-test over a minute).
    tracked = next(([p] for p in camp if git_bytes(FRONTEND, os.path.relpath(p, FRONTEND)) == p.read_bytes()), [])
    if tracked:
        f = tracked[0]
        ck = hashlib.sha256(f.read_bytes()).hexdigest()
        prow = ("campaign", f.name, ck, "2026-09-24 10:00:00+00")
        got = run([prow], [])
        ok = len(got) == 1 and got[0][0] == "APPLY" and got[0][6] == "direct"
        print(("  ok   " if ok else "  FAIL ") + "RED-4 a `campaign` direct-apply row absent from the clone -> APPLY via runner direct")
        fails += 0 if ok else 1
        got = run([prow], [("matrx-frontend", f.name, ck, "2026-09-24 09:00:00+00")])
        ok = len(got) == 1 and got[0][6] == "record"
        print(("  ok   " if ok else "  FAIL ") + "GREEN-4 the clone already ran those bytes under matrx-frontend -> RECORD only")
        fails += 0 if ok else 1
    fails += verdict_self_test(run)
    for label, prod_rows, clone_rows, want in cases:
        got = [r for r in run(list(prod_rows), list(clone_rows)) if r[2] == "zzselftest_up.sql"]
        ok = len(got) == want
        print(("  ok   " if ok else "  FAIL ") + label)
        if not ok:
            fails += 1
            print(f"        expected {want} row(s), got {len(got)}: {got}")
    print("clone-catchup-plan self-test: " + ("PASS" if not fails else f"{fails} FAILED"))
    return 0 if not fails else 1


def _first_committed(repo: Path, directory: Path, pred=lambda p: True) -> Path | None:
    for p in sorted(directory.glob("*.sql"), reverse=True):
        if pred(p) and git_bytes(repo, os.path.relpath(p, repo)) == p.read_bytes():
            return p
    return None


def verdict_self_test(run) -> int:
    """lane CLONE-LEDGER-VERDICTS, 2026-09-26: the parity verdict, the direct-apply regime, the
    rule-4 inverse and the owner — each a pair that differs in ONE fact."""
    fails = 0

    def check(label: str, ok: bool, detail: object = "") -> None:
        nonlocal fails
        print(("  ok   " if ok else "  FAIL ") + label)
        if not ok:
            fails += 1
            print(f"        {detail}")

    camp = _first_committed(FRONTEND, FRONTEND / "migrations" / "campaign")
    if camp is not None:
        ck = hashlib.sha256(camp.read_bytes()).hexdigest()
        prow = ("campaign", camp.name, ck, "2026-09-25 10:00:00+00")
        got = run([prow], [("parity", camp.name, ck, "2026-09-26 06:00:00+00")])
        check("RED-5 a parity verdict about THESE bytes -> PARITY, not in the delta",
              [g[0] for g in got] == ["PARITY"], got)
        got = run([prow], [("parity", camp.name, "ee" * 32, "2026-09-26 06:00:00+00")])
        check("GREEN-5 a parity verdict about OTHER bytes holds nothing -> APPLY",
              [g[0] for g in got] == ["APPLY"], got)

    aid = _first_committed(AIDREAM, AIDREAM / "db" / "migrations", lambda p: p.name[:4].isdigit())
    if aid is not None:
        ck = hashlib.sha256(aid.read_bytes()).hexdigest()
        hand = ("aidream", aid.name, ck, "2026-09-25 13:46:41+00", "0", "f", "")
        got = run([hand], [])
        check("RED-6 a row production ledgered BY HAND after the direct-apply ruling -> runner direct, 'ran under older rules'",
              len(got) == 1 and got[0][6] == "direct" and "ran under older rules" in got[0][9], got)
        got = run([hand[:5] + ("t", "")], [])
        check("GREEN-6 the same row written by a runner -> its own runner judges it",
              len(got) == 1 and got[0][6] == "aidream", got)
        got = run([("aidream", aid.name, ck, "2026-09-20 13:46:41+00", "0", "f", "")], [])
        check("GREEN-6b a hand-written row from BEFORE the ruling -> its own runner (the rule is dated)",
              len(got) == 1 and got[0][6] == "aidream", got)

    def has_inverse(p: Path) -> bool:
        return (FRONTEND / "migrations" / "inverse" / f"{p.stem}_down.sql").is_file()

    up = _first_committed(FRONTEND, FRONTEND / "migrations", has_inverse)
    if up is not None:
        ck = hashlib.sha256(up.read_bytes()).hexdigest()
        prow = ("matrx-frontend", up.name, ck, "2026-09-25 10:00:00+00", "900", "t", "SOME-LANE")
        got = run([prow], [("matrx-frontend", up.name, "dd" * 32, "2026-09-24 10:00:00+00")])
        check("RED-7 the clone holds an EARLIER checksum of this file -> its committed inverse runs first",
              len(got) == 1 and got[0][11] == f"migrations/inverse/{up.stem}_down.sql", got)
        got = run([prow], [])
        check("GREEN-7 absent from the clone -> no inverse leg", len(got) == 1 and got[0][11] == "", got)
        check("GREEN-8 every row names who to ask (production's lane first)",
              len(got) == 1 and got[0][12] == "lane SOME-LANE (production's ledger row)", got)
    noinv = _first_committed(FRONTEND, FRONTEND / "migrations", lambda p: not has_inverse(p))
    if noinv is not None:
        ck = hashlib.sha256(noinv.read_bytes()).hexdigest()
        got = run([("matrx-frontend", noinv.name, ck, "2026-09-25 10:00:00+00")],
                  [("matrx-frontend", noinv.name, "dd" * 32, "2026-09-24 10:00:00+00")])
        check("RED-7b an earlier checksum and NO committed inverse -> the inverse is named MISSING",
              len(got) == 1 and got[0][11].startswith("MISSING:"), got)
    got = run([("matrx-frontend", "zzselftest_not_committed_anywhere.sql", "aa" * 32, "2026-09-25 10:00:00+00", "5", "t", "ORDERFIX")], [])
    check("GREEN-9 a named refusal carries its owner", len(got) == 1 and got[0][0] == "REFUSE" and "ORDERFIX" in got[0][12], got)
    return fails


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        return self_test()
    if len(sys.argv) < 3:
        print("usage: clone-catchup-plan.py <production.tsv> <clone.tsv>", file=sys.stderr)
        return 2
    prod = read_tsv(sys.argv[1])
    clone = read_tsv(sys.argv[2])

    clone_by_key = {(r["source"], r["filename"]): r for r in clone}
    # 🚨 A PARITY VERDICT (chair ruling 2026-09-26, rule 1). The catch-up writes a clone row with
    # source `parity` when it COMPARED every object a file writes and found the clone identical to
    # production — a verdict that the file need not run here, never a claim that it ran. It holds
    # only while production's ledger still carries the same bytes the verdict was about.
    parity = {r["filename"]: r["checksum"] for r in clone if r["source"] == "parity"}

    # An inverse applied on the clone AFTER its up row withdraws that row's claim.
    undone: dict[tuple[str, str], str] = {}
    for r in clone:
        base = inverse_base(r["filename"])
        if base is None:
            continue
        up = clone_by_key.get((r["source"], base))
        if up is not None and up["applied_at"] < r["applied_at"]:
            undone[(r["source"], base)] = r["filename"]

    # 🚨 A PRODUCTION INVERSE ROW THAT PRODUCTION ITSELF SUPERSEDED IS HISTORY, NOT STATE.
    # Rule 27 is `up -> inverse -> up`, and both legs are ledgered, so production's ledger
    # carries the churn as well as the outcome. Replaying the churn onto the clone is not just
    # wasted work — it is WRONG, and the runner says so: an inverse's `-- based-on:` hash
    # describes the body that was live on PRODUCTION at that moment, which was never live on
    # the clone, so it refuses with the DD-220 message (measured on the first real run,
    # 2026-09-22: `writeperf3b_a_standard_tables_fields_are_read_once_per_statement_down.sql`
    # declared 0de1d32bc2f6 and the clone's body was 38aad156881b). The catch-up carries
    # production's CURRENT state, so an inverse whose own base was applied again AFTER it is
    # dropped from the delta.
    prod_by_key = {(r["source"], r["filename"]): r for r in prod}
    superseded: set[tuple[str, str]] = set()
    for r in prod:
        base = inverse_base(r["filename"])
        if base is None:
            continue
        up = prod_by_key.get((r["source"], base))
        if up is not None and up["applied_at"] > r["applied_at"]:
            superseded.add((r["source"], r["filename"]))

    lines: list[str] = []
    for r in sorted(prod, key=lambda x: x["applied_at"]):
        key = (r["source"], r["filename"])
        if key in superseded:
            continue
        here = clone_by_key.get(key)
        reapply = "no"
        if (here is None or here["checksum"] != r["checksum"] or key in undone) and parity.get(r["filename"]) == r["checksum"]:
            lines.append(SEP.join(["PARITY", r["source"], r["filename"], r["checksum"], "", "", "", "", "",
                                   "held by a parity verdict on the clone (level by inspection; not run here)",
                                   r["applied_at"], "", ""]))
            continue
        if here is None:
            reason = "absent from the clone"
        elif here["checksum"] != r["checksum"]:
            reason = (
                f"the clone holds different bytes ({here['checksum'][:12]}, "
                f"production {r['checksum'][:12]})"
            )
            reapply = "yes"
        elif key in undone:
            reason = (
                f"the clone applied its inverse {undone[key]} AFTER this row "
                f"(up {here['applied_at']}) — the ledger row stands but the objects are gone"
            )
            reapply = "yes"
        else:
            continue

        # Resolve the file, and prove its committed bytes are what production ran.
        entries = SOURCE_DIRS.get(r["source"])
        if not entries:
            lines.append(
                SEP.join(
                    [
                        "REFUSE", r["source"], r["filename"], r["checksum"], "", "", "", "", "",
                        f"ledger source {r['source']!r} is not a source this step knows how to "
                        f"resolve to a file; add it to SOURCE_DIRS beside the two runners' maps",
                        r["applied_at"], "", owner_of(None, "", r),
                    ]
                )
            )
            continue

        hit = None
        for repo, directory, runner, selector in entries:
            cand = directory / r["filename"]
            relpath = os.path.relpath(cand, repo)
            committed = git_bytes(repo, relpath)
            if committed is None:
                continue
            hit = (repo, cand, relpath, runner, selector, committed)
            break

        if hit is None:
            lines.append(
                SEP.join(
                    [
                        "REFUSE", r["source"], r["filename"], r["checksum"], "", "", "", "", "",
                        "no file with this name is committed on origin/main in any directory "
                        f"source {r['source']!r} uses ("
                        + ", ".join(str(d) for _, d, _, _ in entries)
                        + ")",
                        r["applied_at"], "", owner_of(None, "", r),
                    ]
                )
            )
            continue

        repo, cand, relpath, runner, selector, committed = hit
        if runner == "direct" and here is None:
            rehearsed = [
                c for c in clone
                if c["filename"] == r["filename"] and c["checksum"] == r["checksum"]
            ]
            if rehearsed:
                runner = "record"
                reason = (
                    f"direct apply on production; the clone already ran these exact bytes as "
                    f"{rehearsed[0]['source']}/{r['filename']} — the `campaign` row is recorded, nothing executes"
                )
        if r["checksum"] not in hashes(committed):
            lines.append(
                SEP.join(
                    [
                        "REFUSE", r["source"], r["filename"], r["checksum"], str(repo), relpath,
                        runner, selector, "",
                        f"the bytes on origin/main hash to "
                        f"{hashlib.sha256(committed).hexdigest()[:12]} and production ledgered "
                        f"{r['checksum'][:12]} — this is not the file that ran on production",
                        r["applied_at"], "", owner_of(repo, relpath, r),
                    ]
                )
            )
            continue

        if not cand.exists():
            lines.append(
                SEP.join(
                    [
                        "REFUSE", r["source"], r["filename"], r["checksum"], str(repo), relpath,
                        runner, selector, "",
                        "the file is committed on origin/main but missing from the working "
                        "checkout, and the runners apply a path on disk",
                        r["applied_at"], "", owner_of(repo, relpath, r),
                    ]
                )
            )
            continue

        on_disk = cand.read_bytes()
        if on_disk != committed:
            lines.append(
                SEP.join(
                    [
                        "REFUSE", r["source"], r["filename"], r["checksum"], str(repo), relpath,
                        runner, selector, "",
                        "the working checkout's copy differs from origin/main (another lane's "
                        "uncommitted edit) and the runners apply the path on disk — refusing "
                        "rather than applying bytes production never ran",
                        r["applied_at"], "", owner_of(repo, relpath, r),
                    ]
                )
            )
            continue

        if runner in ("aidream", "frontend") and hand_ledgered(r) and not relpath.startswith("migrations/inverse"):
            runner = "direct"
            reason += (
                f" — ran under older rules: production ledgered it by hand at {r['applied_at']} under the "
                f"{RULES_INTRODUCED[0][0]} (from {DIRECT_REGIME_AT}); no runner judged these bytes there, so "
                f"none judges them here — carried direct, as production took it"
            )
        # 🚨 RULE 4 (chair ruling 2026-09-26). The clone holds an EARLIER version of this same file
        # (a peer rehearsed it before the bytes production ran), and a re-run over that state is not
        # idempotent (42710 already exists, a policy that exists, an anchor already patched). So the
        # file's inverse runs first, then the up. An inverse that is missing is named, never guessed.
        inverse = ""
        if here is not None and here["checksum"] != r["checksum"] and key not in undone:
            inverse = inverse_of(repo, relpath)
        lines.append(
            SEP.join(
                ["APPLY", r["source"], r["filename"], r["checksum"], str(repo), relpath,
                 runner, selector, reapply, reason, r["applied_at"], inverse, owner_of(repo, relpath, r)]
            )
        )

    sys.stdout.write("\n".join(lines) + ("\n" if lines else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
