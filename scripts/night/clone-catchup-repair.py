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


def main() -> int:
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
