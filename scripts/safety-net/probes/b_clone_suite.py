"""LANE SAFETY-NET-B (2026-10-01) — run one of half B's rolled-back press suites on the CLONE, after the REAL Step 1.

    cd matrx-frontend
    SN_OUT=<dir> python3 scripts/safety-net/probes/b_clone_suite.py scripts/safety-net/probes/b_switch_chain.sql
    SN_B_PLANT_SQL='<sql>' … (a plant, spliced right after the suite's first `begin`, rolled back with it)

Why: the shared clone is never quiet (peers make older-side tables and lists all night; PRESS-AT-SIZE presses and
undoes it). A suite that presses needs a Ready clone, so first, when readiness says Step 1 is needed, this runs
Step 1 exactly as the Final switch page does — `POST /cutover/final-switch/copy-again` on the clone-paired server
(:8200) as admin@admin.com — and waits for it. Step 1 writes only copies (the same ids). Then the suite runs in one
transaction and is rolled back. A clone that is mid-press by a peer ("Everything is on the new system") is waited
for up to 10 minutes, said in the log; still pressed → INCONCLUSIVE, never a pass.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

CODE = Path(__file__).resolve().parents[4]
FE = CODE / "matrx-frontend"
SUITE = Path(sys.argv[1]) if len(sys.argv) > 1 else None
OUT = Path(os.environ.get("SN_OUT", "/tmp"))
PSQL = next((p for p in ("/opt/homebrew/opt/libpq/bin/psql", "/opt/homebrew/opt/postgresql@17/bin/psql") if Path(p).exists()), "psql")
SERVER = os.environ.get("SN_CLONE_SERVER", "http://localhost:8200")
UA = {"user-agent": "matrx-safety-net-b/1.0"}


def env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                out.setdefault(k.strip().removeprefix("export ").strip(), v.strip().strip('"').strip("'"))
    return out


sys.path.insert(0, str(Path(__file__).resolve().parent))
import b_db  # noqa: E402 — session pooler, client-side rollback (chair 2026-10-01: never leave a pooled backend in a transaction)

# The suites run through psql on the clone's SESSION pooler (5432): if psql stops mid-transaction on an error, the
# session — not a shared transaction-pool backend the clone's server also draws from — is what ends.
DSN = b_db.clone_dsn()


def q(sql: str) -> str:
    rows = b_db.read(sql, "clone", timeout_s=180)
    v = rows[-1][0] if rows else None
    return json.dumps(v, default=str) if isinstance(v, (dict, list)) else ("" if v is None else str(v))


def readiness() -> dict:
    return json.loads(q("select jsonb_build_object('state', r->>'state', 'ready', r->'ready', 'says', r->>'says', 'copy_again_needed', r->'copy_again_needed') from (select platform._final_switch_readiness() r) x"))


def step1() -> str:
    shell = subprocess.run(["uv", "run", "python", "scripts/clone/server_env.py", "--shell"], cwd=CODE / "aidream",
                           capture_output=True, text=True, timeout=180).stdout
    ce = {m.group(1): m.group(2).strip("'\"") for m in re.finditer(r"^export (\w+)=(.*)$", shell, re.M)}
    seat = {**env_file(CODE / "aidream/.env"), **env_file(FE / ".env.local")}
    if seat.get("AI_ADMIN_USERNAME") != "admin@admin.com":
        raise SystemExit("refused: the admin seat is not admin@admin.com")
    body = json.dumps({"email": seat["AI_ADMIN_USERNAME"], "password": seat["AI_ADMIN_PASSWORD"]}).encode()
    req = urllib.request.Request(f"{ce['SUPABASE_MATRIX_URL'].rstrip('/')}/auth/v1/token?grant_type=password", data=body, method="POST",
                                 headers={**UA, "content-type": "application/json", "apikey": ce["SUPABASE_MATRIX_PUBLISHABLE_KEY"]})
    with urllib.request.urlopen(req, timeout=60) as r:  # noqa: S310
        jwt = json.loads(r.read())["access_token"]
    req = urllib.request.Request(f"{SERVER}/cutover/final-switch/copy-again", data=b"{}", method="POST",
                                 headers={**UA, "content-type": "application/json", "authorization": f"Bearer {jwt}",
                                          "origin": "http://safety-net-b.localhost:3001",
                                          # what the Final switch page sends: the organization the admin works in, the admin lane
                                          "x-organization-id": "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f", "x-matrx-admin-lane": "1"})
    t0 = time.time()
    last = ""
    try:
        with urllib.request.urlopen(req, timeout=3600) as r:  # noqa: S310 — streams until Step 1 finishes
            for raw in r:
                line = raw.decode(errors="replace").strip()
                if line:
                    last = line
    except urllib.error.HTTPError as e:
        return f"Step 1 on the clone was REFUSED: {e.code} {e.read().decode(errors='replace')[:400]}"
    return f"Step 1 on the clone finished in {round(time.time() - t0)} s; last event: {last[:400]}"


def attempt(n: int) -> tuple[int, str, list]:
    notes = [f"attempt {n}"]
    for _ in range(20):  # a peer's press window: wait, said
        r = readiness()
        if r["state"] != "new":
            break
        notes.append("the clone is pressed by a peer (state new); waiting 30 s")
        time.sleep(30)
    else:
        return 1, f"INCONCLUSIVE: the clone stayed pressed by a peer for 10 minutes ({r['says']})", notes
    if not r["ready"] and r["copy_again_needed"]:
        notes.append(f"readiness before: {r['says']}")
        notes.append(step1())
        r = readiness()
        notes.append(f"readiness after Step 1: {r['says']}")
    text = SUITE.read_text()
    plant = os.environ.get("SN_B_PLANT_SQL")
    if plant:
        lines = text.split("\n")
        at = next(i for i, ln in enumerate(lines) if re.match(r"^\s*begin\b", ln, re.I))
        lines[at + 1:at + 1] = ["-- ── SAFETY-NET-B PLANT (rolled back with the suite) ──", plant, "-- ── end of plant ──"]
        text = "\n".join(lines)
        notes.append("PLANTED: " + plant.splitlines()[0][:200])
    composed = OUT / f"{SUITE.stem}.composed.sql"
    composed.write_text(text)
    p = subprocess.run([PSQL, DSN, "-X", "-v", "ON_ERROR_STOP=1", "-f", str(composed)], capture_output=True, text=True, timeout=3600, cwd=FE)
    return p.returncode, p.stdout + p.stderr, notes


def main() -> int:
    # The shared clone is written by peers all the time: a run that lost a race (a serialization failure, a peer's
    # press between readiness and the press, a peer's birth after Step 1) is not a verdict. Up to three attempts,
    # each one said; a planted break's RED is never retried away (only those three race signatures are).
    log = OUT / f"b-clone-suite-{SUITE.stem}.log"
    race = re.compile(r"could not serialize access|INCONCLUSIVE|PRECONDITION: the clone is not Ready")
    all_out = []
    for n in (1, 2, 3):
        code, out, notes = attempt(n)
        for x in notes:
            print(f"[b-clone-suite] {x}", flush=True)
        all_out.append("\n".join(notes) + "\n" + out)
        if not (code and race.search(out)):
            break
        print(f"[b-clone-suite] attempt {n} lost a race with a peer on the shared clone: {race.search(out).group(0)} — trying again", flush=True)
    log.write_text("\n\n".join(all_out))
    print(out[-6000:])
    return code


if __name__ == "__main__":
    if not SUITE or not SUITE.exists():
        raise SystemExit("usage: b_clone_suite.py <suite.sql>")
    sys.exit(main())
