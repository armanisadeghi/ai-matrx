"""LANE SAFETY-NET-B (2026-10-01) — C11: is the rolling release actually stopped during the hour? READ-ONLY.

    cd matrx-frontend
    SN_OUT=<dir> python3 scripts/safety-net/probes/b_release_stopped.py                    # snapshot (BEFORE / freeze start)
    SN_OUT=<dir> SN_B_FREEZE_FROM=<snapshot dir>/b-release-state.json python3 scripts/safety-net/probes/b_release_stopped.py

There is no release lock (census 2026-10-01: no file, knob or workflow freezes releases; release scripts never
refuse). So "stopped" is proven by what would have to move if anything shipped:
  1. the schedulers that ship are PAUSED: Codex `ship-all-codex` (:43) and `ship-all-repos` (every 90 min) in
     ~/.codex/automations/*/automation.toml; the Claude task `ship-all-claude` / `hourly-ship-all-sweep` is
     disabled in the desktop scheduler (named here; its enabled bit is not in a file this script can read);
  2. no ship-all ran since the freeze (~/.matrx/ship-all/latest.json `stamp`);
  3. GitHub main did not move for aidream and matrx-frontend (`git ls-remote origin refs/heads/main`, no fetch);
  4. the live web build did not change (https://www.aimatrx.com/api/version `commit`);
  5. the live server's build did not change (`/cutover/final-switch/capabilities` git_sha as admin@admin.com, sampled
     three times because several server tasks answer behind the balancer; uptime is reported, never judged).
Snapshot mode records all five (FAIL only when it cannot read one). Freeze mode FAILs on any movement.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

CODE = Path(__file__).resolve().parents[4]
HOME = Path.home()
OUT = Path(os.environ.get("SN_OUT", str("/tmp/matrx-evidence/2026-10-01/safety-net/adhoc")))
OUT.mkdir(parents=True, exist_ok=True)
FREEZE = os.environ.get("SN_B_FREEZE_FROM")
SHIPPERS = ["ship-all-codex", "ship-all-repos"]
REPOS = ["aidream", "matrx-frontend"]
UA = {"user-agent": "matrx-safety-net-b/1.0", "X-Matrx-Agent-Traffic": "safety-net-b"}  # marker mirrors lib/agent-traffic/marker.ts
results: list[dict] = []


def step(items, name, ok, detail):
    status = "SKIP" if ok is None else "PASS" if ok else "FAIL"
    results.append({"step": name, "items": items, "status": status, "detail": detail[:600]})
    print(f"[{status}] {name}: {detail[:300]}", flush=True)


def get_json(url: str):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:  # noqa: S310
        return json.loads(r.read() or b"null")


def snapshot() -> dict:
    s: dict = {"at": datetime.now(timezone.utc).isoformat(), "shippers": {}, "main": {}}
    for name in SHIPPERS:
        f = HOME / ".codex/automations" / name / "automation.toml"
        m = re.search(r'^status\s*=\s*"(\w+)"', f.read_text(), re.M) if f.exists() else None
        s["shippers"][name] = m.group(1) if m else "absent"
    latest = HOME / ".matrx/ship-all/latest.json"
    s["ship_all_stamp"] = json.loads(latest.read_text()).get("stamp") if latest.exists() else None
    for repo in REPOS:
        r = subprocess.run(["git", "-C", str(CODE / repo), "ls-remote", "origin", "refs/heads/main"], capture_output=True, text=True, timeout=60)
        s["main"][repo] = (r.stdout.split() or [None])[0]
    s["web_commit"] = get_json("https://www.aimatrx.com/api/version").get("commit")
    h = get_json("https://server.app.matrxserver.com/health")
    s["server_uptime_s"] = h.get("uptime_seconds")
    s["server_checked_at"] = h.get("timestamp")
    s["server_shas"] = server_shas()
    return s


def _env(path: Path) -> dict:
    out = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                out.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    return out


def server_shas() -> list:
    """The build the live server runs, as the Final switch page asks it (admin seat; the token never printed)."""
    env = {**_env(CODE / "aidream/.env"), **_env(CODE / "matrx-frontend/.env.local")}
    if env.get("AI_ADMIN_USERNAME") != "admin@admin.com":
        return ["unread: the admin seat is not admin@admin.com"]
    body = json.dumps({"email": env["AI_ADMIN_USERNAME"], "password": env["AI_ADMIN_PASSWORD"]}).encode()
    req = urllib.request.Request("https://db.matrxserver.com/auth/v1/token?grant_type=password", data=body, method="POST",
                                 headers={**UA, "content-type": "application/json", "apikey": env["SUPABASE_MATRIX_PUBLISHABLE_KEY"]})
    with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310
        jwt = json.loads(r.read())["access_token"]
    shas = set()
    for _ in range(3):
        req = urllib.request.Request("https://server.app.matrxserver.com/cutover/final-switch/capabilities",
                                     headers={**UA, "authorization": f"Bearer {jwt}", "origin": "https://manage.aimatrx.com"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310
                shas.add(json.loads(r.read()).get("git_sha") or "none")
        except urllib.error.HTTPError as e:
            shas.add(f"http {e.code}")
    return sorted(shas)


def main() -> int:
    now = snapshot()
    if not FREEZE:
        active = [k for k, v in now["shippers"].items() if v != "PAUSED"]
        step(["C11"], "release.snapshot", all(now["main"].values()) and now["web_commit"] and now["server_uptime_s"] is not None,
             f"shippers {now['shippers']} (ACTIVE = still shipping: {active or 'none'}); last ship-all {now['ship_all_stamp']}; "
             f"main {json.dumps({k: (v or '')[:10] for k, v in now['main'].items()})}; web {str(now['web_commit'])[:10]}; server build {[x[:10] for x in now['server_shas']]} (up {now['server_uptime_s']} s)")
        step(["C11"], "release.claude_ship_task", None, "ship-all-claude / hourly-ship-all-sweep: confirm disabled in the desktop scheduler (no file holds its enabled bit)")
    else:
        was = json.loads(Path(FREEZE).read_text())["snapshot"]
        active = [k for k, v in now["shippers"].items() if v != "PAUSED"]
        step(["C11"], "release.shippers_paused", not active, f"still ACTIVE: {active or 'none'} ({now['shippers']})")
        step(["C11"], "release.no_ship_all_since_freeze", now["ship_all_stamp"] == was["ship_all_stamp"],
             f"last ship-all {was['ship_all_stamp']} at the freeze → {now['ship_all_stamp']} now")
        moved = {k: (was["main"].get(k), v) for k, v in now["main"].items() if v != was["main"].get(k)}
        step(["C11"], "release.main_did_not_move", not moved, f"moved: {moved or 'none'}")
        step(["C11"], "release.web_build_unchanged", now["web_commit"] == was["web_commit"], f"{str(was['web_commit'])[:10]} → {str(now['web_commit'])[:10]}")
        step(["C11"], "release.server_build_unchanged", now["server_shas"] == was.get("server_shas"),
             f"server build {was.get('server_shas')} at the freeze → {now['server_shas']} now (uptime {now['server_uptime_s']} s, not judged)")
    (OUT / "b-release-state.json").write_text(json.dumps({"results": results, "snapshot": now}, indent=2))
    fails = [x for x in results if x["status"] == "FAIL"]
    print(f"\nb_release_stopped: {sum(x['status'] == 'PASS' for x in results)} pass · {len(fails)} fail → {OUT / 'b-release-state.json'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
