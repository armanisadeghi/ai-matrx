"""SELF-TEST for `only-me-listing` (LANE 5 VISION-REACH, 2026-10-02): the guard goes RED when a door lists the
owner's "Only me" row, and GREEN when the store is sound — each proven by running the REAL probe end to end (real
fixtures in Cedar Ridge, real doors), the break planted IN MEMORY for that run only (an environment value the probe
reads at start). Nothing on disk is edited, so nothing half-broken can ever be swept into a commit.

  1. SOUND — every door step PASSES (exit 0).
  2. PLANTED: NOTHING IS HIDDEN (SN_OML_PLANT=skip_hide) — the owner never sets the row to "Only me", which is
     exactly what a member sees from a door that lists it. Every list / count door on every table must FAIL.

The third proof is not a plant: run against production BEFORE visionreach_only_me_is_listed_for_nobody_else.sql,
the probe was RED on the plain and confidential tables (the live leak), GREEN on the restricted one.

    SN_TARGET=live uv run --project ../aidream python scripts/safety-net/probes/only_me_listing_selftest.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROBE = HERE / "only_me_listing.py"
DOOR_STEPS = ("read_records", "read_records_page rows", "record_aggregate count", "io_export", "drill_rows", "table_row_counts")


def run(plant: str) -> tuple[int, list[dict]]:
    out = tempfile.mkdtemp(prefix=f"oml-selftest-{plant or 'sound'}-")
    env = {**os.environ, "SN_OUT": out, "SN_OML_PLANT": plant}
    r = subprocess.run([sys.executable, str(PROBE)], env=env, capture_output=True, text=True, timeout=900)
    try:
        results = json.loads((Path(out) / "only-me-listing.json").read_text())["results"]
    except (OSError, ValueError, KeyError):
        print(r.stdout[-2000:], r.stderr[-2000:])
        results = []
    return r.returncode, results


def main() -> int:
    ok = True
    code, res = run("")
    fails = [x["step"] for x in res if x["status"] == "FAIL"]
    sound = code == 0 and res and not fails
    print(f"{'PASS' if sound else 'FAIL'} sound run: exit {code}, {len(res)} steps, failing {fails[:8]}")
    ok &= bool(sound)

    code, res = run("skip_hide")
    by = {x["step"]: x["status"] for x in res}
    want_red = [f"{case}: {door}" for case in ("plain", "confidential", "restricted") for door in DOOR_STEPS]
    missed = [s for s in want_red if by.get(s) != "FAIL"]
    planted = code != 0 and not missed
    print(f"{'PASS' if planted else 'FAIL'} planted skip_hide: exit {code}, every list/count door RED: {not missed}"
          + (f" — still green: {missed}" if missed else ""))
    ok &= planted
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
