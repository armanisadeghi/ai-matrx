#!/usr/bin/env python3
"""body-drift-inverses.py — an inverse whose `-- based-on:` names a body that never stands live.

WHY (lane BRANCH-REFRESH-4, 2026-09-25, on the chair's finding): the inverse of
`uichamp_s1_a_view_keeps_every_setting_it_is_given.sql` declares `custom.view_declare` at
b6665956…, but that up-file's own bytes produce e3cbe21f… (measured on the clone), which is what
production and the clone hold. DD-220 judges an unledgered file against the LIVE body, so the
inverse would be refused the one time it is needed — at 3 a.m., mid-rollback. Nothing reads an
inverse until then. This does, for every inverse whose up-file production has ledgered.

For each inverse (matrx-frontend migrations/inverse, aidream db/migrations/inverse):
  · its up-file is `<name>_down.sql` -> `<name>.sql` (or the up of the inverse a
    `-- supersedes-inverse: <file>` header names; the named inverse is then RETIRED and skipped);
  · skipped when production has not ledgered the up-file, or ran the inverse after it;
  · every `-- based-on: <sig> <hash>` line is compared with production's live body hash:
      equal                                   -> fine
      differs, and a LATER production-ledgered file declares `-- based-on: <sig>`
                                              -> SUPERSEDED (production moved on; informational)
      differs (or absent) with no later file  -> STALE: the inverse names a body that never stood
                                                 live. Counted; exit 1.

  body-drift-inverses.py sigs  <production-ledger.tsv>              the signatures to hash
  body-drift-inverses.py judge <production-ledger.tsv> <live.tsv>   STALE/SUPERSEDED lines
  body-drift-inverses.py --self-test                                fixtures, RED first
Ledger TSV: source, filename, checksum, applied_at. live.tsv: sig, hash (empty = absent).
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

FRONTEND = Path("/Users/armanisadeghi/code/matrx-frontend")
AIDREAM = Path("/Users/armanisadeghi/code/aidream")
INVERSE_DIRS = [FRONTEND / "migrations" / "inverse", AIDREAM / "db" / "migrations" / "inverse"]
FILE_DIRS = [
    FRONTEND / "migrations", FRONTEND / "migrations" / "campaign",
    AIDREAM / "db" / "migrations", AIDREAM / "db" / "migrations" / "campaign",
] + INVERSE_DIRS

BASED_ON = re.compile(r"^--\s*based-on:\s*(\S.*\))\s+([0-9a-f]{64})\s*$", re.M)
SUPERSEDES = re.compile(r"^--\s*supersedes-inverse:\s*(\S+\.sql)\s*$", re.M)


def norm(sig: str) -> str:
    return re.sub(r"\s+", "", sig)


def up_of(name: str) -> str | None:
    if name.endswith("_down.sql"):
        return name[: -len("_down.sql")] + ".sql"
    if name.endswith(".inverse.sql"):
        return name[: -len(".inverse.sql")] + ".sql"
    return None


def read_ledger(path: str) -> dict[str, str]:
    """filename -> latest applied_at on production (any source)."""
    out: dict[str, str] = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            p = line.rstrip("\n").split("\t")
            if len(p) >= 4 and (p[1] not in out or p[3] > out[p[1]]):
                out[p[1]] = p[3]
    return out


def inventory(inverse_dirs, file_dirs):
    inverses: dict[str, str] = {}
    for d in inverse_dirs:
        if d.is_dir():
            for f in sorted(d.glob("*.sql")):
                inverses.setdefault(f.name, f.read_text(encoding="utf-8", errors="replace"))
    texts: dict[str, str] = {}
    for d in file_dirs:
        if d.is_dir():
            for f in d.glob("*.sql"):
                texts.setdefault(f.name, f.read_text(encoding="utf-8", errors="replace"))
    return inverses, texts


def plan(ledger, inverses):
    """-> list of (inverse, up, up_at, sig, declared_hash) to judge."""
    retired = set()
    for name, text in inverses.items():
        for m in SUPERSEDES.finditer(text):
            retired.add(m.group(1))
    rows = []
    for name, text in sorted(inverses.items()):
        if name in retired:
            continue
        sup = SUPERSEDES.search(text)
        up = up_of(sup.group(1)) if sup else up_of(name)
        if not up or up not in ledger:
            continue
        if name in ledger and ledger[name] > ledger[up]:
            continue  # production ran the inverse after its up: production's state IS the down's
        for m in BASED_ON.finditer(text):
            rows.append((name, up, ledger[up], m.group(1).strip(), m.group(2)))
    return rows


def judge(ledger, inverses, texts, live):
    later_decl: dict[str, list[tuple[str, str]]] = {}
    for fname, at in ledger.items():
        t = texts.get(fname)
        if not t:
            continue
        for m in BASED_ON.finditer(t):
            later_decl.setdefault(norm(m.group(1)), []).append((at, fname))
    stale, superseded = [], []
    for inv, up, up_at, sig, want in plan(ledger, inverses):
        have = live.get(norm(sig), "")
        if have == want:
            continue
        later = [f for at, f in later_decl.get(norm(sig), []) if at > up_at and f not in (up, inv)]
        (superseded if later else stale).append((inv, sig, want, have, later[:1]))
    return stale, superseded


def self_test() -> int:
    import tempfile
    ok = True

    def check(label, cond):
        nonlocal ok
        print(("PASS " if cond else "FAIL ") + label)
        ok = ok and cond

    d = Path(tempfile.mkdtemp())
    (d / "inv").mkdir(); (d / "mig").mkdir()
    sig = "custom.view_declare(uuid, uuid, jsonb)"
    (d / "mig" / "up.sql").write_text(f"-- based-on: {sig} {'1'*64}\n")
    (d / "inv" / "up_down.sql").write_text(f"-- based-on: {sig} {'b'*64}\n")
    ledger = {"up.sql": "2026-09-25 01:10:00+00"}
    live = {norm(sig): "e" * 64}
    inv, texts = inventory([d / "inv"], [d / "mig", d / "inv"])
    st, su = judge(ledger, inv, texts, live)
    check("RED  an inverse naming a body that is not live, nothing later -> STALE", len(st) == 1 and not su)
    (d / "mig" / "later.sql").write_text(f"-- based-on: {sig} {'2'*64}\n")
    ledger2 = dict(ledger, **{"later.sql": "2026-09-25 02:00:00+00"})
    inv, texts = inventory([d / "inv"], [d / "mig", d / "inv"])
    st, su = judge(ledger2, inv, texts, live)
    check("GREEN a later ledgered file re-based that body -> SUPERSEDED, not stale", not st and len(su) == 1)
    (d / "inv" / "up_rebased_down.sql").write_text(
        f"-- supersedes-inverse: up_down.sql\n-- based-on: {sig} {'e'*64}\n")
    inv, texts = inventory([d / "inv"], [d / "mig", d / "inv"])
    st, su = judge(ledger, inv, texts, live)
    check("GREEN a corrected inverse retires the stale one and matches live", not st and not su)
    (d / "inv" / "up_rebased_down.sql").write_text(
        f"-- supersedes-inverse: up_down.sql\n-- based-on: {sig} {'f'*64}\n")
    inv, texts = inventory([d / "inv"], [d / "mig", d / "inv"])
    st, su = judge(ledger, inv, texts, live)
    check("RED  a corrected inverse that is itself wrong is still STALE", len(st) == 1 and st[0][0] == "up_rebased_down.sql")
    check("GREEN an inverse of an up production never ledgered is not judged", plan({}, inv) == [])
    print("self-test:", "GREEN" if ok else "RED")
    return 0 if ok else 1


def main(argv) -> int:
    if argv[1:2] == ["--self-test"]:
        return self_test()
    if len(argv) == 3 and argv[1] == "sigs":
        ledger = read_ledger(argv[2]); inverses, _ = inventory(INVERSE_DIRS, FILE_DIRS)
        for s in sorted({r[3] for r in plan(ledger, inverses)}):
            print(s)
        return 0
    if len(argv) == 4 and argv[1] == "judge":
        ledger = read_ledger(argv[2]); inverses, texts = inventory(INVERSE_DIRS, FILE_DIRS)
        live = {}
        with open(argv[3], encoding="utf-8") as fh:
            for line in fh:
                p = line.rstrip("\n").split("\t")
                if p and p[0]:
                    live[norm(p[0])] = p[1] if len(p) > 1 else ""
        st, su = judge(ledger, inverses, texts, live)
        for inv, sig, want, have, _ in st:
            print(f"STALE\t{inv}\t{sig}\tdeclares {want[:12]}, production holds {have[:12] or '(absent)'}")
        for inv, sig, want, have, later in su:
            print(f"SUPERSEDED\t{inv}\t{sig}\tre-based later by {later[0]}")
        print(f"JUDGED\t{len(plan(ledger, inverses))}")
        return 1 if st else 0
    print(__doc__)
    return 64


if __name__ == "__main__":
    sys.exit(main(sys.argv))
