#!/usr/bin/env python3
"""clone-catchup-repair.py — which production file owns a function body the clone has moved.

🚨 CHAIR RULING 2026-09-22 (lane CLONE-CATCHUP). The clone is the MIRROR. Lanes may rehearse on
it only because rule 27's third leg returns it to production parity, so a rehearsal that leaves a
body moved is the defect — and when the nightly catch-up then hits the runner's DD-220
`-- based-on:` refusal it does NOT skip and does NOT bypass the check. It RE-ESTABLISHES PARITY
first, by re-applying production's own ledgered bytes of the file that owns the drifted body, and
only then applies the delta file normally.

This script answers the one question the shell cannot: given a function name and the moment the
delta file was applied on production, which production-ledgered files write that function's body,
newest first? The caller re-applies them at `--target clone --reapply`/`--rerun` in that order and
stops as soon as the body hashes to what the delta file declares. If none of them reproduces it,
the catch-up refuses BY NAME — a body nobody's ledgered bytes can rebuild is not something this
job may paper over.

Resolution and byte-proof are the planner's, reused: same source map, same `origin/main` reading,
same checksum verification, so a candidate is never a file production did not run.

    clone-catchup-repair.py <production.tsv> <schema.function> <cutoff applied_at> [exclude]
"""

from __future__ import annotations

import re
import sys

from importlib import util as _import_util
from pathlib import Path

_spec = _import_util.spec_from_file_location(
    "clone_catchup_plan", Path(__file__).with_name("clone-catchup-plan.py")
)
assert _spec and _spec.loader
_plan = _import_util.module_from_spec(_spec)
_spec.loader.exec_module(_plan)


def writes_function(sql: bytes, qualified: str) -> bool:
    """Does this file write that function's body?

    `create function` and `create or replace function` (the OR REPLACE half is optional — the
    file that FIRST created `custom.read_records_archived` says plain `create function`, and
    leaving it out cost the first live repair run its only candidate), procedures too, in any
    spacing, and the same thing assembled at run time inside a `DO $$ … EXECUTE format(…) … $$`,
    because the runner judges those identically.
    """
    text = sql.decode("utf-8", "replace")
    schema, _, name = qualified.rpartition(".")
    pat = (
        r"create\s+(?:or\s+replace\s+)?(?:function|procedure)\s+"
        + (rf"{re.escape(schema)}\s*\.\s*" if schema else r"(?:[\w\"]+\s*\.\s*)?")
        + re.escape(name)
        + r"\s*\("
    )
    return re.search(pat, text, re.IGNORECASE) is not None


FN_RE = re.compile(
    r"create\s+(?:or\s+replace\s+)?(?:function|procedure)\s+([\w\".]+)\s*\(",
    re.IGNORECASE,
)


def functions_written(path: Path) -> list[str]:
    """Every function this FILE writes, by qualified name.

    Used when a file fails for a reason that is not a `-- based-on:` refusal — a plain
    `create function` replayed onto a clone that already carries it answers 42723, and the
    question is then the same one: are the clone and production already level on these bodies?
    """
    text = path.read_bytes().decode("utf-8", "replace")
    return sorted({m.group(1).replace('"', "") for m in FN_RE.finditer(text)})


def resolve_any(source: str, filename: str) -> bytes | None:
    """The bytes of a ledgered file, for NAMING its owner only (never replayed from here):
    the working tree first (a peer's rehearsal may be uncommitted, and a disk read is what keeps
    a scan of thousands of ledger rows under a second), origin/main second."""
    if filename in _BYTES:
        return _BYTES[filename]
    found = None
    labels = (source, "matrx-frontend", "aidream", "campaign")
    for label in labels:
        for _repo, directory, _runner, _sel in _plan.SOURCE_DIRS.get(label, []):
            cand = directory / filename
            if cand.is_file():
                found = cand.read_bytes()
                break
        if found is not None:
            break
    if found is None:
        for label in labels:
            for repo, directory, _runner, _sel in _plan.SOURCE_DIRS.get(label, []):
                found = _plan.git_bytes(repo, str((directory / filename).relative_to(repo)))
                if found is not None:
                    break
            if found is not None:
                break
    _BYTES[filename] = found
    return found


_BYTES: dict[str, bytes | None] = {}


def later_owners(prod_tsv: str, clone_tsv: str, qualified: str, after: str, exclude: str) -> list[str]:
    """Files that ran ON THE CLONE after `after` (the file's own place in production's history)
    and write `qualified` — the owners of the body the clone holds now.

    🚨 lane CLONE-LEDGER-VERDICTS, 2026-09-26 (coordinator's class). At 05:42:56Z the catch-up
    replayed copywritable_people_test_the_copy_until_the_switch.sql on the clone and put
    platform._cutover_seam_readiness back to its pre-CUTOVER-READINESS body, undoing
    cutoverready_the_switch_waits_until_each_copy_matches_its_older_table.sql, which the clone had
    run seven minutes earlier. A replay of an older file must never overwrite a body a later
    ledgered file replaced. A clone row's place in history is PRODUCTION's applied_at when
    production ledgered it (a catch-up carries old files late), and the clone's own applied_at
    only for a row production does not hold (a peer's rehearsal ahead of production).
    """
    prod = {(r["source"], r["filename"]): r for r in _plan.read_tsv(prod_tsv)}
    clone = _plan.read_tsv(clone_tsv)
    base = exclude[:-len(".sql")] if exclude.endswith(".sql") else exclude
    skip = {exclude, f"{base}_down.sql", f"{base}.inverse.sql", f"inv_{exclude}"}
    seen: set[str] = set()
    out: list[str] = []
    for r in clone:
        if r["filename"] in skip or r["source"] == "parity" or _plan.inverse_base(r["filename"]):
            continue
        p = prod.get((r["source"], r["filename"]))
        when = p["applied_at"] if p else r["applied_at"]
        if when <= after or r["filename"] in seen:
            continue
        b = resolve_any(r["source"], r["filename"])
        if b is None or not writes_function(b, qualified):
            continue
        seen.add(r["filename"])
        out.append(_plan.SEP.join(["OWNER", r["source"], r["filename"], when,
                                   "production" if p else "clone only (a rehearsal ahead of production)"]))
    return sorted(out, key=lambda l: l.split(_plan.SEP)[3])


def main() -> int:
    if len(sys.argv) == 7 and sys.argv[1] == "--later-owners":
        out = later_owners(*sys.argv[2:7])
        sys.stdout.write("\n".join(out) + ("\n" if out else ""))
        return 0
    if len(sys.argv) == 3 and sys.argv[1] == "--functions-written":
        for n in functions_written(Path(sys.argv[2])):
            print(n)
        return 0

    if len(sys.argv) < 4:
        print(
            "usage: clone-catchup-repair.py <production.tsv> <schema.function> <cutoff applied_at>",
            file=sys.stderr,
        )
        return 2
    prod = _plan.read_tsv(sys.argv[1])
    qualified = sys.argv[2]
    cutoff = sys.argv[3]
    # The file that is being APPLIED is never its own repair: it is the thing that cannot land.
    exclude = sys.argv[4] if len(sys.argv) > 4 else ""

    out: list[str] = []
    for r in sorted(prod, key=lambda x: x["applied_at"], reverse=True):
        if r["applied_at"] > cutoff or r["filename"] == exclude:
            continue
        entries = _plan.SOURCE_DIRS.get(r["source"])
        if not entries:
            continue
        for repo, directory, runner, selector in entries:
            cand = directory / r["filename"]
            relpath = str(cand.relative_to(repo))
            committed = _plan.git_bytes(repo, relpath)
            if committed is None:
                continue
            # Only a file whose committed bytes ARE the bytes production ran may be replayed.
            if r["checksum"] not in _plan.hashes(committed):
                break
            if not cand.exists() or cand.read_bytes() != committed:
                break
            if not writes_function(committed, qualified):
                break
            out.append(
                _plan.SEP.join(
                    [
                        "CANDIDATE", r["source"], r["filename"], r["checksum"], str(repo),
                        relpath, runner, selector, "yes",
                        f"it writes {qualified} and production ran it at {r['applied_at']}",
                    ]
                )
            )
            break

    sys.stdout.write("\n".join(out) + ("\n" if out else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
