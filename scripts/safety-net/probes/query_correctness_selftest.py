"""SELF-TEST for `query-correctness` (LANE 5 VISION-REACH, wave 2, 2026-10-02): the guard goes RED on the
two breaks it exists for, and GREEN when the code is sound — each proven by running the REAL probe end to end
(real fixtures in Cedar Ridge, real doors, the real `records` tool in-process), with the break planted IN
MEMORY for that run only. Nothing on disk is edited, so nothing half-broken can ever be swept into a commit.

The three runs (each its own disposable fixture, archived at the end like every probe run):

  1. SOUND, SMALL PAGES — the store's page ceiling is forced to 5, so the as-of answer (9 visits) and the
     relation match (6 patients) MUST walk more than one page. Every question must PASS.
  2. PLANTED: ONE PAGE ONLY — every paged door answers nothing past the first page (`offset > 0` -> no
     rows), which is exactly a tool that adds up one page and calls it the total (the $640 answer).
     Q04 (as of T0) must FAIL.
  3. PLANTED: THE FILTER IS DROPPED — the tool's aggregate reaches the door with no filter, which is exactly
     the executor stripping `match` and returning the whole table's number (the other half of the $640
     answer). Q03, Q05 and Q06 must FAIL.

Exit 0 only when all three verdicts hold. Run from matrx-frontend:

    SN_TARGET=live uv run --project ../aidream python scripts/safety-net/probes/query_correctness_selftest.py
"""

from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
os.environ.setdefault("SN_OUT", tempfile.mkdtemp(prefix="qc-selftest-"))


def _load_probe():
    spec = importlib.util.spec_from_file_location("query_correctness_probe", HERE / "query_correctness.py")
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod


probe = _load_probe()
from matrx_records.store.client import RecordStore  # noqa: E402  (after the probe set the target's env)

PAGE = 5


async def _small_pages(self):  # every paged read walks pages of 5
    return PAGE, PAGE


def _run(name: str, patches: list[tuple[object, str, object]]) -> dict[str, str]:
    """Run the whole probe once with these attributes replaced; ALWAYS put them back."""
    saved = [(obj, attr, getattr(obj, attr)) for obj, attr, _ in patches]
    probe.results.clear()
    probe.log.clear()
    try:
        for obj, attr, new in patches:
            setattr(obj, attr, new)
        probe.STAMP = f"{probe.STAMP.split(' st')[0]} st{name}"
        probe.main()
    finally:
        for obj, attr, old in saved:
            setattr(obj, attr, old)
    out: dict[str, str] = {}
    for r in probe.results:
        if len(r["items"]) == 1:
            out[r["items"][0]] = r["status"]
        elif r["items"] and r["status"] == "FAIL":
            out["fixture"] = "FAIL"
    return out


def main() -> int:
    real_call = RecordStore._call
    real_aggregate = RecordStore.record_aggregate

    async def one_page_only(self, function, *args, **kw):
        # The break: a paged door answers nothing past its first page. read_records takes
        # (org, table, by_id, limit, offset); query_table_as_of (org, table, at, on, limit, offset, required).
        offset = {"read_records": 4, "query_table_as_of": 5}.get(function)
        if offset is not None and len(args) > offset and int(args[offset] or 0) > 0:
            return []
        return await real_call(self, function, *args, **kw)

    async def filter_dropped(self, **kw):
        kw.pop("filter", None)
        return await real_aggregate(self, **kw)

    verdicts: list[tuple[str, bool, str]] = []

    sound = _run("1", [(RecordStore, "_read_limits", _small_pages)])
    ok = sound.get("fixture") != "FAIL" and all(sound.get(i) == "PASS" for i in probe.ITEM_IDS)
    verdicts.append(("sound code, pages of 5: all ten PASS", ok, str(sound)))

    paged = _run("2", [(RecordStore, "_read_limits", _small_pages), (RecordStore, "_call", one_page_only)])
    ok = paged.get("fixture") != "FAIL" and paged.get("Q04") == "FAIL"
    verdicts.append(("planted one-page total: Q04 goes RED", ok, str(paged)))

    dropped = _run("3", [(RecordStore, "record_aggregate", filter_dropped)])
    ok = dropped.get("fixture") != "FAIL" and all(dropped.get(i) == "FAIL" for i in ("Q03", "Q05", "Q06"))
    verdicts.append(("planted dropped filter: Q03, Q05, Q06 go RED", ok, str(dropped)))

    for what, good, detail in verdicts:
        print(f"{'PASS' if good else 'FAIL'} self-test — {what} — {detail}", flush=True)
    return 0 if all(v[1] for v in verdicts) else 1


if __name__ == "__main__":
    sys.exit(main())
