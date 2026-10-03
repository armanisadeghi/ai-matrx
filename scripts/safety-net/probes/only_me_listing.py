"""LANE 5 VISION-REACH (2026-10-02) — `only-me-listing`: a row its owner set to "Only me" is LISTED and
COUNTED for nobody else, through every door that lists, counts, exports, drills or keeps history.

THE DEFECT (independent verifier, production, 2026-10-02): "Only me" (custom.share_lane_set 'mine' →
visibility `personal`, no `shown_to`) hides a row from lists but never locks it — a member with the link may
still open it (chair ruling T-36). Only custom.query_visible_ids applied that list filter
(platform.shown_to_lists). Every door built from custom.visible_predicate_sql or custom.visible_set — the
"may OPEN" predicate — listed and counted it: read_records, read_records_page, read_records_matching,
query_by_coordinates, query_across_homes, field_history, io_export(_csv), drill, record_aggregate, REST
rows/aggregate, MCP list_rows. A member counted 4 of 3. It looked fine on a table with a `restricted`
field only by accident (that table took another path).

THE BREAK THIS CATCHES: any list/count/export door answering from the open-predicate without the list
filter. Red on the bodies production ran before visionreach_only_me_is_listed_for_nobody_else.sql.

THE SHAPE: admin@admin.com (owner) builds three Referral tables in Cedar Ridge Physical Therapy — a plain one,
one with a `confidential` field, one with a `restricted` field — four practices each, and sets ONE practice per
table to "Only me". test@test.com (a member) then asks every door; each must answer the three listed rows and
never the hidden one (by id and by name), and a count must be 3. Controls: the owner still lists 4 (the row
exists), and the member can still OPEN the hidden row by id (Only me hides, never locks). Tables archived and
the member's personal key revoked at the end.

    SN_TARGET=live uv run --project ../aidream python scripts/safety-net/probes/only_me_listing.py
    node scripts/safety-net/run.mjs --target live --only query.only-me-listing

SELF-TEST (in memory, nothing on disk changes): SN_OML_PLANT=skip_hide never sets the row to "Only me", which
is exactly a door that lists it — the probe must go RED on every door (only_me_listing_selftest.py).
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo

CODE = Path(__file__).resolve().parents[4]
TARGET = os.environ.get("SN_TARGET", "live")
OUT = Path(os.environ.get("SN_OUT", str(CODE / "common-docs/operations/for-arman/2026-10-02/only-me-listing/adhoc")))
OUT.mkdir(parents=True, exist_ok=True)
STAMP = os.environ.get("SN_STAMP") or datetime.now(ZoneInfo("America/Los_Angeles")).strftime("%b %-d %H%M")
PLANT = os.environ.get("SN_OML_PLANT", "")
ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04"  # Cedar Ridge Physical Therapy
FORBIDDEN = ("3e790542-fdaf-40b2-8bf3-658bf94fe67f", "c1aabdc0-4d94-42d4-9ddc-91b68ef9c0a7")
UA = {"user-agent": "matrx-safety-net-only-me-listing/1.0"}


def _env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                out.setdefault(k.strip().removeprefix("export ").strip(), v.strip().strip('"').strip("'"))
    return out


ENV = {**_env_file(CODE / "aidream/.env"), **_env_file(CODE / "matrx-frontend/.env.local"), **_env_file(CODE / "matrx-frontend/.env")}
if TARGET == "live":
    DB_URL, SERVER = "https://db.matrxserver.com", "https://server.app.matrxserver.com"
    ANON = ENV["SUPABASE_MATRIX_PUBLISHABLE_KEY"]
elif TARGET == "clone":
    import subprocess

    shell = subprocess.run(["uv", "run", "python", "scripts/clone/server_env.py", "--shell"], cwd=CODE / "aidream",
                           capture_output=True, text=True, timeout=240).stdout
    cenv = {m.group(1): m.group(2).strip("'\"") for m in re.finditer(r"^export (\w+)=(.*)$", shell, re.M)}
    if "SUPABASE_MATRIX_PUBLISHABLE_KEY" not in cenv:
        raise SystemExit("could not read the clone's keys (aidream: uv run python scripts/clone/server_env.py --check)")
    DB_URL = cenv["SUPABASE_MATRIX_URL"].rstrip("/")
    ANON = cenv["SUPABASE_MATRIX_PUBLISHABLE_KEY"]
    SERVER = os.environ.get("SN_CLONE_SERVER", "http://localhost:8200")
else:
    raise SystemExit("SN_TARGET must be live or clone")
SERVER = os.environ.get("SN_OML_SERVER", SERVER).rstrip("/")
NO_SERVER = os.environ.get("SN_OML_NO_SERVER") == "1"  # database doors only (say so: REST/MCP then SKIP)

results: list[dict] = []
SECRETS: list[str] = []
log: list[str] = []


def redact(text: str) -> str:
    for s in SECRETS:
        if s:
            text = text.replace(s, "<redacted>")
    return text


def step(items: list[str], name: str, ok: bool | None, detail: str) -> bool:
    status = "SKIP" if ok is None else "PASS" if ok else "FAIL"
    results.append({"walk": "only-me-listing", "items": items, "step": name, "status": status,
                    "detail": redact(detail)[:900], "ms": 0, "shot": None})
    print(f"{status} [{','.join(items)}] {name} — {redact(detail)[:500]}", flush=True)
    return bool(ok)


def http(method: str, url: str, body=None, headers: dict | None = None, timeout: int = 120) -> tuple[int, object, str]:
    if any(b in url or (body is not None and b in json.dumps(body)) for b in FORBIDDEN):
        raise SystemExit("refused: a call names Arman's organization or table")
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={"content-type": "application/json", **UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310
            raw, status = r.read().decode() or "null", r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read().decode() or "null", e.code
    except Exception as e:  # noqa: BLE001 — unreachable is an answer, said
        raw, status = json.dumps({"client_error": str(e)}), 0
    try:
        parsed = json.loads(raw)
    except ValueError:
        parsed = raw
    log.append(redact(f"{method} {url.replace(DB_URL, '{db}').replace(SERVER, '{server}')} {json.dumps(body)[:300] if body is not None else ''} -> {status} {raw[:700]}"))
    return status, parsed, raw


class Seat:
    def __init__(self, email_key: str, password_key: str, expected_email: str):
        self.email = ENV.get(email_key)
        if self.email != expected_email:
            raise SystemExit(f"refused: {email_key} is not {expected_email}")
        SECRETS.append(ENV[password_key])
        s, body, _ = http("POST", f"{DB_URL}/auth/v1/token?grant_type=password",
                          {"email": self.email, "password": ENV[password_key]}, {"apikey": ANON})
        if s != 200 or body["user"]["email"] != expected_email:
            raise SystemExit(f"sign-in failed for {expected_email}: {s}")
        self.jwt = body["access_token"]
        SECRETS.append(self.jwt)

    def rpc(self, fn: str, args: dict, schema: str = "custom", retry: int = 0) -> tuple[int, object, str]:
        """`retry` is for fixture writes only: a statement cancelled by the 8 s limit on a busy shared clone is
        retried (and each attempt logged); a door under test is never retried — its first answer is graded."""
        for attempt in range(retry + 1):
            out = http("POST", f"{DB_URL}/rest/v1/rpc/{fn}", args,
                       {"apikey": ANON, "authorization": f"Bearer {self.jwt}", "content-profile": schema, "accept-profile": schema})
            if not (out[0] == 500 and '"57014"' in out[2]) or attempt == retry:
                return out
            time.sleep(3)
        return out


# ── THE SEED — the practices that refer patients to Cedar Ridge. One per table is the owner's "Only me".
PRACTICES = ["Lakeside Orthopedics", "Summit Sports Medicine", "Harbor Family Practice", "Bayview Neurology"]
HIDDEN = 3  # Bayview Neurology: the owner keeps this referral to herself
LISTED = len(PRACTICES) - 1  # 3 — what a member must be told, every door
CASES = {  # case → (table name, extra field)
    "plain": ("Referral Sources", None),
    "confidential": ("Referral Billing", {"key": "tax_id", "label": "Tax ID", "type": "text", "sensitivity": "confidential"}),
    "restricted": ("Referral Payers", {"key": "write_off", "label": "Write-off", "type": "currency", "unit": "USD", "sensitivity": "restricted"}),
}


def make_tables(admin: Seat, fx: dict) -> None:
    s, kernel, raw = admin.rpc("person_kernel_id", {}, retry=4)
    assert s == 200, ("person_kernel_id", s, raw[:200])
    s, home, raw = admin.rpc("record_write", {"p_organization_id": ORG, "p_table_id": kernel, "p_data": {"name": f"Referral Review {STAMP}"}}, retry=4)
    assert s == 200, ("home", s, raw[:200])
    fx["home"] = str(home)
    fx["tables"] = []
    fx["cases"] = {}
    for case, (label, extra) in CASES.items():
        spec = {"name": f"{label} {STAMP}", "slug": f"oml_{case}_{int(time.time() * 1000)}", "type": "entity", "label_singular": "Practice",
                "label_plural": label, "display": "list", "weight": "light", "ordered": False, "row_order": "manual",
                "title_field": "name", "retention_days": 365, "agent_writable": True,
                "default_sort": [{"field": "name", "direction": "asc"}], "fields": [{"name": "name"}], "parent_id": home}
        s, table, raw = admin.rpc("table_declare", {"p_organization_id": ORG, "p_spec": spec}, retry=4)
        assert s == 200, ("table_declare", case, s, raw[:300])
        fx["tables"].append(str(table))
        if extra:
            s, _, raw = admin.rpc("field_declare", {"p_organization_id": ORG, "p_table_id": table, "p_spec": extra}, retry=4)
            assert s == 200, ("field_declare", case, s, raw[:300])
        ids = []
        for i, name in enumerate(PRACTICES):
            data = {"name": name}
            if extra and extra["key"] == "tax_id":
                data["tax_id"] = f"84-21{i}7{i}93"
            if extra and extra["key"] == "write_off":
                data["write_off"] = 40 + 15 * i
            s, rid, raw = admin.rpc("record_write", {"p_organization_id": ORG, "p_table_id": table, "p_data": data}, retry=4)
            assert s == 200, ("record_write", case, name, s, raw[:300])
            ids.append(str(rid))
        if PLANT != "skip_hide":
            s, _, raw = admin.rpc("share_lane_set", {"p_organization_id": ORG, "p_subject_id": ids[HIDDEN], "p_choice": "mine"}, retry=4)
            assert s == 200, ("share_lane_set mine", case, s, raw[:300])
        fx["cases"][case] = {"table": str(table), "ids": ids}


def _ids_in(raw: str, ids: list[str]) -> set[str]:
    return {i for i in ids if i in raw}


def _names_in(raw: str) -> set[str]:
    return {n for n in PRACTICES if n in raw}


def _count(body, path) -> int | None:
    try:
        v = path(body)
        return int(v) if v is not None else None
    except Exception:  # noqa: BLE001
        return None


def judge(case: str, door: str, status: int, body, raw: str, ids: list[str], count_of=None, by: str = "both") -> None:
    """Listed rows only: none of the hidden row's id or name; at least one listed row present (a refusal or an
    empty answer is not a pass); and, where the door answers a number, that number is 3."""
    hidden_id, hidden_name = ids[HIDDEN], PRACTICES[HIDDEN]
    listed_ids, listed_names = set(ids[:HIDDEN]), set(PRACTICES[:HIDDEN])
    leaks = []
    if hidden_id in raw:
        leaks.append("hidden id")
    if hidden_name in raw:
        leaks.append("hidden name")
    seen = (_ids_in(raw, list(listed_ids)) if by == "id" else _names_in(raw) & listed_names if by == "name"
            else _ids_in(raw, list(listed_ids)) | (_names_in(raw) & listed_names))
    n = _count(body, count_of) if count_of else None
    ok = status == 200 and not leaks and (bool(seen) if count_of is None else n == LISTED)
    step(["Q16"], f"{case}: {door}", ok,
         f"status {status} | leaks {leaks or 'none'} | listed seen {len(seen)}"
         + (f" | count {n} (truth {LISTED})" if count_of else "") + ("" if ok else f" | {raw[:300]}"))


def database_doors(member: Seat, case: str, fx: dict) -> None:
    c = fx["cases"][case]
    T, ids = c["table"], c["ids"]

    def M(fn, args, schema="custom"):
        return member.rpc(fn, {"p_organization_id": ORG, **args}, schema)

    s, b, raw = M("read_records", {"p_table_id": T, "p_limit": 50})
    judge(case, "read_records", s, b, raw, ids, lambda x: len(x))
    s, b, raw = M("read_records_page", {"p_table_id": T})
    judge(case, "read_records_page rows", s, b, raw, ids, lambda x: len(x["rows"]))
    judge(case, "read_records_page total", s, b, raw, ids, lambda x: x["total"])
    s, b, raw = M("read_records_matching", {"p_table_id": T, "p_filter": {}})
    judge(case, "read_records_matching", s, b, raw, ids, lambda x: len(x))
    s, b, raw = M("query_by_coordinates", {"p_table_id": T, "p_coordinates": []})
    judge(case, "query_by_coordinates", s, b, raw, ids, lambda x: len(x))
    s, b, raw = M("query_across_homes", {"p_table_id": T})
    judge(case, "query_across_homes", s, b, raw, ids, lambda x: len(x))
    s, b, raw = M("query_visible_ids", {"p_table_id": T})
    judge(case, "query_visible_ids", s, b, raw, ids, lambda x: len(x))
    s, b, raw = M("query_table_as_of", {"p_table_id": T, "p_limit": 50})
    judge(case, "query_table_as_of", s, b, raw, ids, lambda x: len(x))
    s, b, raw = M("table_row_counts", {"p_table_ids": [T]})
    judge(case, "table_row_counts", s, b, raw, [], lambda x: next(iter(x)).get("count") if isinstance(x, list) else x.get(T))
    s, b, raw = M("record_aggregate", {"p_table_id": T, "p_group_by": [], "p_measures": [{"op": "count"}]})
    judge(case, "record_aggregate count", s, b, raw, [], lambda x: x[0]["measures"]["count"])
    s, b, raw = M("record_aggregate", {"p_table_id": T, "p_group_by": ["name"], "p_measures": [{"op": "count"}]})
    judge(case, "record_aggregate group by name", s, b, raw, ids, lambda x: sum(g["measures"]["count"] for g in x))
    s, b, raw = M("record_aggregate_as_of", {"p_table_id": T, "p_recorded_at": datetime.now(timezone.utc).isoformat(), "p_measure": "count"})
    judge(case, "record_aggregate_as_of count", s, b, raw, [], lambda x: x[0]["result"])
    s, b, raw = M("field_history", {"p_table_id": T, "p_field_key": "name"})
    judge(case, "field_history (name)", s, b, raw, ids, by="name")
    s, b, raw = M("io_export", {"p_table_id": T})
    judge(case, "io_export", s, b, raw, ids, by="name")
    s, b, raw = M("io_export_csv", {"p_table_id": T})
    judge(case, "io_export_csv", s, b, raw, ids, by="name")
    s, b, raw = M("record_scope_context", {"p_record_id": ids[0]})
    judge(case, "record_scope_context siblings", s, b, json.dumps((b or {}).get("siblings") if isinstance(b, dict) else raw), ids,
          lambda x: len(x["siblings"]["shown"]) + 1)
    src = {"kind": "table", "id": T}
    s, b, raw = M("drill_rows", {"p_source": src, "p_question": {"limit": 100}}, "platform")
    judge(case, "drill_rows", s, b, raw, ids, by="name")
    s, b, raw = M("drill_ask", {"p_source": src, "p_question": {"by": ["name"], "show": ["count"]}}, "platform")
    judge(case, "drill_ask by name", s, b, raw, ids, by="name")
    # CONTROL: "Only me" hides, never locks — the member may still open it by id.
    if PLANT != "skip_hide":
        s, b, raw = M("read_record", {"p_record_id": ids[HIDDEN]})
        step(["Q16"], f"{case}: control — the member can still open the hidden row by id", s == 200 and PRACTICES[HIDDEN] in raw, f"status {s}")


def owner_control(admin: Seat, case: str, fx: dict) -> None:
    c = fx["cases"][case]
    s, b, raw = admin.rpc("read_records_page", {"p_organization_id": ORG, "p_table_id": c["table"]})
    n = _count(b, lambda x: x["total"])
    step(["Q16"], f"{case}: control — the owner still lists all {len(PRACTICES)}", s == 200 and n == len(PRACTICES), f"status {s} total {n}")


def make_key(member: Seat) -> tuple[str | None, str | None]:
    s, made, _ = member.rpc("personal_api_key_create", {"p_name": f"Referral listing check {STAMP}", "p_organization_id": ORG}, schema="iam")
    if s != 200 or not isinstance(made, dict):
        return None, None
    SECRETS.append(made["api_key"])
    return made["api_key"], made["id"]


def server_doors(key: str, fx: dict) -> None:
    H = {"authorization": f"Bearer {key}", "x-organization-id": ORG}
    for case, c in fx["cases"].items():
        T, ids = c["table"], c["ids"]
        s, b, raw = http("GET", f"{SERVER}/api/v1/tables/{T}/rows?limit=50", None, H)
        judge(case, "REST GET /v1/tables/<id>/rows", s, b, raw, ids, lambda x: len(x["rows"]))
        s, b, raw = http("POST", f"{SERVER}/api/v1/tables/{T}/aggregate", {"measure": "count"}, H)
        judge(case, "REST POST /v1/tables/<id>/aggregate count", s, b, raw, [],
              lambda x: x.get("value", x.get("result", (x.get("groups") or [{}])[0].get("value"))))
        s, b, raw = http("POST", f"{SERVER}/api/v1/tables/{T}/aggregate", {"measure": "count", "group_by": "name"}, H)
        judge(case, "REST POST /v1/tables/<id>/aggregate by name", s, b, raw, ids, by="name")

    async def mcp():
        from mcp import ClientSession
        from mcp.client.streamable_http import streamablehttp_client
        async with streamablehttp_client(f"{SERVER}/api/matrx-mcp", headers={"Authorization": f"Bearer {key}", **UA}) as (r_, w_, _):
            async with ClientSession(r_, w_) as sess:
                await sess.initialize()
                for case, c in fx["cases"].items():
                    r = await sess.call_tool("tables", {"action": "list_rows", "organization_id": ORG, "table": c["table"], "limit": 50})
                    raw = json.dumps(r.structuredContent) if r.structuredContent else (r.content[0].text if r.content else "")
                    try:
                        body = json.loads(raw)
                        body = body.get("result", body)
                    except ValueError:
                        body = None
                    judge(case, "MCP tables.list_rows", 500 if r.isError else 200, body, raw, c["ids"], lambda x: len(x["rows"]))

    try:
        asyncio.run(mcp())
    except Exception as e:  # noqa: BLE001 — an unreachable MCP is a red, said
        step(["Q16"], "MCP tables.list_rows", False, f"{type(e).__name__}: {str(e)[:300]}")


def archive(admin: Seat, table: str) -> tuple[bool, str]:
    for _ in range(20):
        s, body, raw = admin.rpc("table_archive", {"p_organization_id": ORG, "p_table_id": table}, retry=4)
        if s != 200:
            return False, f"{s} {raw[:200]}"
        if isinstance(body, dict) and body.get("table_archived"):
            return True, str(body.get("message"))[:160]
    return False, "archive did not finish in 20 chunks"


def main() -> int:
    admin = Seat("AI_ADMIN_USERNAME", "AI_ADMIN_PASSWORD", "admin@admin.com")
    member = Seat("AI_MEMBER_USERNAME", "AI_MEMBER_PASSWORD", "test@test.com")
    fx: dict = {}
    key_id = None
    try:
        try:
            make_tables(admin, fx)
            step(["Q16"], "fixture: three Referral tables (plain, confidential, restricted), one practice each 'Only me'"
                 + (" — PLANT skip_hide: nothing hidden" if PLANT == "skip_hide" else ""), True,
                 json.dumps({k: v["table"] for k, v in fx["cases"].items()}))
        except AssertionError as e:
            step(["Q16"], "fixture", False, f"refused: {e}")
            return 1
        for case in fx["cases"]:
            owner_control(admin, case, fx)
            database_doors(member, case, fx)
        if NO_SERVER:
            step(["Q16"], "REST v1 + MCP", None, "SN_OML_NO_SERVER=1: database doors only")
        else:
            key, key_id = make_key(member)
            if not key:
                step(["Q16"], "personal key for test@test.com", False, "iam.personal_api_key_create refused")
            else:
                server_doors(key, fx)
    finally:
        if key_id:
            s, _, _ = member.rpc("personal_api_key_revoke", {"p_id": key_id}, schema="iam")
            step([], "cleanup: revoke test@test.com's personal key", s == 200, f"{s}")
        for t in reversed(fx.get("tables", [])):
            ok, said = archive(admin, t)
            step([], f"cleanup: archive {t}", ok, said)
        if fx.get("home"):
            s, _, raw = admin.rpc("record_delete", {"p_organization_id": ORG, "p_record_id": fx["home"]})
            step([], "cleanup: archive the home", s == 200, f"{s} {raw[:120]}")
        (OUT / "only-me-listing.json").write_text(json.dumps({"walk": "only-me-listing", "target": TARGET, "plant": PLANT or None,
                                                              "results": results, "log": log}, indent=2, ensure_ascii=False))
    return 0 if all(r["status"] != "FAIL" for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
