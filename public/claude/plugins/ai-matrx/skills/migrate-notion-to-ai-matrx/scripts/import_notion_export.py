#!/usr/bin/env python3
"""Move a Notion "Markdown & CSV" export into AI Matrx — every database, row, link, file and page body.

Two steps, both safe to run again at any time (nothing is ever duplicated; a stopped run resumes):

  python3 import_notion_export.py plan <export folder or .zip>      -> writes notion-plan.json beside it
  python3 import_notion_export.py run  <export folder or .zip> --organization <org id>

`plan` reads the export and proposes, per database, an AI Matrx table and a type for every column.
Read it to the person in plain words, change anything they want in notion-plan.json, then `run`.
`run` makes the tables, writes the rows (matched on a "Notion ID" column), links rows across tables,
attaches files, keeps each page's body in a "Page content" column, saves the views, and prints a
Notion-vs-AI-Matrx count for every database. Progress is kept in notion-progress.json beside the
export; rerunning skips finished work.

Needs only Python 3.9+ and your AI Matrx personal API key in the AI_MATRX_API_KEY environment
variable (AI Matrx: Settings, API keys). Talks to the AI Matrx MCP as you, with exactly your access.
"""

from __future__ import annotations

import argparse
import base64
import csv
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path

MCP_URL = os.environ.get("AI_MATRX_MCP_URL", "https://server.app.matrxserver.com/api/matrx-mcp")
BATCH = 100
KEY_COLUMN = "Notion ID"
BODY_COLUMN = "Page content"
_ID = re.compile(r"\s([0-9a-f]{32})(?:_all)?\.(?:csv|md)$")
_LINK = re.compile(r"([^,(]+?)\s\(([^)]*?%20([0-9a-f]{32})\.md|https://www\.notion\.so/[^)]*?([0-9a-f]{32}))\)")
_DATE = "%B %d, %Y"


# ── the MCP, as the person ─────────────────────────────────────────────────────────────────


def call(tool: str, **arguments) -> dict:
    key = os.environ.get("AI_MATRX_API_KEY", "").strip()
    if not key:
        sys.exit("Set AI_MATRX_API_KEY to your AI Matrx personal API key (Settings, API keys).")
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                       "params": {"name": tool, "arguments": {k: v for k, v in arguments.items() if v is not None}}})
    payload: dict = {}
    for attempt in range(5):
        request = urllib.request.Request(MCP_URL, data=body.encode(), method="POST", headers={
            "Authorization": f"Bearer {key}", "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"})
        try:
            with urllib.request.urlopen(request, timeout=600) as answer:
                payload = json.loads(answer.read())
            break
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt == 4:
                raise
            print(f"  … the server did not answer ({exc}); trying again", flush=True)
            time.sleep(3 * (attempt + 1))
    if "error" in payload:
        raise RuntimeError(payload["error"].get("message"))
    result = payload["result"]
    data = result.get("structuredContent")
    if data is None:
        data = json.loads(result["content"][0]["text"])
    return data.get("result", data) if isinstance(data, dict) and set(data) == {"result"} else data


def must(answer: dict, what: str) -> dict:
    if not answer.get("ok", True) or answer.get("done") is False:
        raise SystemExit(f"{what}: {json.dumps(answer, indent=1)[:1500]}")
    return answer


# ── reading the export ─────────────────────────────────────────────────────────────────────


def open_export(path: Path) -> Path:
    if path.is_dir():
        return path
    if zipfile.is_zipfile(path):
        out = Path(tempfile.mkdtemp(prefix="notion-export-"))
        with zipfile.ZipFile(path) as z:
            z.extractall(out)
        for inner in list(out.rglob("*.zip")):  # Notion nests a zip per part
            with zipfile.ZipFile(inner) as z:
                z.extractall(inner.parent)
        return out
    sys.exit(f"{path} is neither a folder nor a .zip")


def read_databases(root: Path) -> list[dict]:
    """Every database in the export: its name, Notion id, columns, rows (id, title, values, body, files)."""
    csvs: dict[str, Path] = {}
    for p in root.rglob("*.csv"):
        m = _ID.search(p.name)
        if not m:
            continue
        # _all.csv holds every row (the plain one only the first view's); prefer it
        if m.group(1) not in csvs or p.name.endswith("_all.csv"):
            csvs[m.group(1)] = p
    out = []
    for db_id, path in sorted(csvs.items(), key=lambda kv: kv[1].name):
        name = _ID.sub("", path.name).replace("_all", "").strip()
        with open(path, encoding="utf-8-sig", newline="") as fh:
            reader = csv.reader(fh)
            header = next(reader, [])
            raw = [r for r in reader if any(c.strip() for c in r)]
        folder = path.parent / name
        pages: dict[str, tuple[str, Path]] = {}  # title -> (page id, md path)
        if folder.is_dir():
            for md in folder.glob("*.md"):
                m = _ID.search(md.name)
                if m:
                    pages.setdefault(_ID.sub("", md.name).strip(), (m.group(1), md))
        rows = []
        for r in raw:
            title = r[0].strip()
            page_id, md = pages.get(title, (None, None))
            body = _body(md, header) if md else ""
            files = {}
            values = {}
            for col, cell in zip(header[1:], r[1:]):
                values[col] = cell.strip()
            rows.append({"id": page_id or f"{db_id}:{title}", "title": title, "values": values, "body": body,
                         "folder": md.parent if md else folder, "files": files})
        out.append({"id": db_id, "name": name, "title_column": header[0] if header else "Name",
                    "columns": header[1:], "rows": rows})
    return out


def _body(md: Path, header: list[str]) -> str:
    lines = md.read_text(encoding="utf-8").splitlines()
    i = 1 if lines and lines[0].startswith("# ") else 0
    props = set(header)
    while i < len(lines) and (not lines[i].strip() or lines[i].split(":", 1)[0] in props):
        i += 1
    return "\n".join(lines[i:]).strip()


# ── proposing the types ────────────────────────────────────────────────────────────────────


def _is_date(v: str) -> bool:
    try:
        datetime.strptime(v.split(" → ")[0].split(" (")[0].strip(), _DATE)
        return True
    except ValueError:
        return False


def _number(v: str) -> float | None:
    t = v.replace("$", "").replace(",", "").replace("%", "").strip()
    try:
        return float(t)
    except ValueError:
        return None


def propose(db: dict, by_id: dict[str, dict], root: Path) -> dict:
    cols = []
    for col in db["columns"]:
        vals = [r["values"].get(col, "") for r in db["rows"]]
        filled = [v for v in vals if v]
        spec: dict = {"notion": col, "name": col}
        if not filled:
            spec["type"] = "text"
        elif all(_LINK.search(v) for v in filled):
            targets = {m.group(3) or m.group(4) for v in filled for m in _LINK.finditer(v)}
            dbs = {d["name"] for d in by_id.values() for r in d["rows"] if r["id"] in targets}
            spec.update(type="relation", to=sorted(dbs)[0] if dbs else None, many=True)
        elif all(v in ("Yes", "No") for v in filled):
            spec["type"] = "checkbox"
        elif all(_is_date(v) for v in filled):
            spec["type"] = "date"
            if any(" → " in v for v in filled):
                spec["end"] = f"{col} end"
        elif all(_number(v) is not None for v in filled):
            spec["type"] = "currency" if any("$" in v for v in filled) else ("percent" if any("%" in v for v in filled) else "number")
        elif all(re.match(r"^https?://", v) for v in filled):
            spec["type"] = "url"
        elif all(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v) for v in filled):
            spec["type"] = "email"
        elif all(re.match(r"^[+()0-9 .-]{7,}$", v) for v in filled):
            spec["type"] = "phone"
        elif all("/" in v and _file_under(root, v) for v in filled):
            spec.update(type="file", many=True)
        else:
            words = [w.strip() for v in filled for w in v.split(",")]
            distinct = set(words)
            multi = any("," in v for v in filled)
            short = sum(len(w) for w in words) / max(1, len(words)) <= 30
            small = short and len(distinct) <= max(12, len(filled) // 3) and len(distinct) < len(filled)
            if small or col.lower() == "status":
                spec["type"] = "status" if col.lower() == "status" else ("choices" if multi else "choice")
                spec["choices"] = sorted(distinct)
            else:
                spec["type"] = "long_text" if any(len(v) > 120 for v in filled) else "text"
        cols.append(spec)
    return {"notion_id": db["id"], "notion_name": db["name"], "table": db["name"], "title_column": db["title_column"],
            "rows": len(db["rows"]), "columns": cols, "views": _views(cols)}


def _file_under(root: Path, value: str) -> bool:
    for part in value.split(","):
        rel = [urllib.parse.unquote(p) for p in part.strip().split("/")]
        if not any(root.rglob(rel[-1])):
            return False
    return True


def _views(cols: list[dict]) -> list[dict]:
    views = [{"name": "All", "layout": "grid", "is_default": True}]
    status = next((c for c in cols if c["type"] in ("status", "choice")), None)
    if status:
        views.append({"name": f"By {status['name'].lower()}", "layout": "board", "group_by": status["name"]})
    date = next((c for c in cols if c["type"] == "date"), None)
    if date:
        v = {"name": "Calendar", "layout": "calendar", "date_column": date["name"]}
        if date.get("end"):
            v["end_date_column"] = date["end"]
        views.append(v)
    f = next((c for c in cols if c["type"] == "file"), None)
    if f:
        views.append({"name": "Gallery", "layout": "gallery", "cover_column": f["name"]})
    return views


# ── writing ────────────────────────────────────────────────────────────────────────────────


def _value(spec: dict, raw: str):
    if raw == "":
        return None
    t = spec["type"]
    if t == "checkbox":
        return raw == "Yes"
    if t in ("number", "currency", "percent"):
        return _number(raw)
    if t == "date":
        return datetime.strptime(raw.split(" → ")[0].split(" (")[0].strip(), _DATE).date().isoformat()
    if t == "choices":
        return [w.strip() for w in raw.split(",") if w.strip()]
    if t in ("relation", "file", "rollup", "lookup", "formula"):
        return None
    return raw


def _end(raw: str):
    if " → " not in raw:
        return None
    return datetime.strptime(raw.split(" → ")[1].split(" (")[0].strip(), _DATE).date().isoformat()


def run(root: Path, plan: dict, organization: str, progress_path: Path) -> None:
    progress = json.loads(progress_path.read_text()) if progress_path.exists() else {}

    def save():
        progress_path.write_text(json.dumps(progress, indent=1))

    dbs = {d["id"]: d for d in read_databases(root)}
    tables = progress.setdefault("tables", {})
    # 1 — every table with its plain columns (relations wait until every table exists)
    for p in plan["databases"]:
        if p["notion_id"] in tables:
            continue
        columns = [{"name": p["title_column"], "type": "text"},
                   {"name": KEY_COLUMN, "type": "text", "unique": True},
                   {"name": BODY_COLUMN, "type": "rich_text"}]
        for c in p["columns"]:
            if c["type"] in ("relation", "rollup", "lookup", "formula"):
                continue
            col = {k: c[k] for k in ("name", "type", "choices", "many") if c.get(k) is not None}
            columns.append(col)
            if c.get("end"):
                columns.append({"name": c["end"], "type": "date"})
        made = must(call("tables", action="create_table", organization_id=organization, name=p["table"], columns=columns),
                    f"make {p['table']}")
        tables[p["notion_id"]] = made["id"]
        print(f"table  {p['table']:<22} {'made' if made.get('created') else 'found'}", flush=True)
        save()
    name_to_id = {p["table"]: tables[p["notion_id"]] for p in plan["databases"]}
    # 2 — relation columns, then rollups / lookups / formulas that read through them
    for kinds in (("relation",), ("rollup", "lookup", "formula")):
        for p in plan["databases"]:
            have = {c["name"] for c in must(call("tables", action="columns", table=tables[p["notion_id"]]), "columns")["columns"]}
            for c in p["columns"]:
                if c["type"] not in kinds or c["name"] in have:
                    continue
                col = {k: c[k] for k in ("name", "type", "many", "via", "of", "agg", "formula") if c.get(k) is not None}
                if c["type"] == "relation":
                    col["to"] = name_to_id[c["to"]]
                answer = call("tables", action="add_column", table=tables[p["notion_id"]], columns=[col])
                if not answer.get("ok", True):
                    print(f"  ! {p['table']}.{c['name']}: {answer.get('message')}", flush=True)
                    continue
                print(f"column {p['table']}.{c['name']} ({c['type']})", flush=True)
    # 3 — rows, then 4 — links, then 5 — files
    for phase in ("rows", "links", "files"):
        for p in plan["databases"]:
            mark = f"{phase}:{p['notion_id']}"
            done_rows = progress.setdefault("done", {}).get(mark, 0)
            db = dbs[p["notion_id"]]
            batch_rows = []
            for r in db["rows"]:
                out = {KEY_COLUMN: r["id"]}
                for c in p["columns"]:
                    raw = r["values"].get(c["notion"], "")
                    if phase == "rows":
                        v = _value(c, raw)
                        if v is not None:
                            out[c["name"]] = v
                        if c.get("end") and _end(raw):
                            out[c["end"]] = _end(raw)
                    elif phase == "links" and c["type"] == "relation" and raw:
                        out[c["name"]] = {"match": KEY_COLUMN, "keys": [m.group(3) or m.group(4) for m in _LINK.finditer(raw)]}
                    elif phase == "files" and c["type"] == "file" and raw:
                        items = []
                        for part in raw.split(","):
                            rel = [urllib.parse.unquote(x) for x in part.strip().split("/")]
                            hits = [f for f in r["folder"].rglob(rel[-1])] or list(root.rglob(rel[-1]))
                            if hits:
                                items.append({"name": hits[0].name, "base64": base64.b64encode(hits[0].read_bytes()).decode()})
                        if items:
                            out[c["name"]] = items
                if phase == "rows":
                    out[p["title_column"]] = r["title"]
                    if r["body"]:
                        out[BODY_COLUMN] = r["body"]
                if len(out) > 1:
                    batch_rows.append(out)
            for start in range(done_rows, len(batch_rows), BATCH):
                chunk = batch_rows[start:start + BATCH]
                answer = must(call("tables", action="upsert_rows", table=tables[p["notion_id"]], key_column=KEY_COLUMN,
                                   rows=chunk, add_choices=True), f"{phase} {p['table']}")
                for n in answer.get("notices") or []:
                    print(f"  note: {n}", flush=True)
                progress["done"][mark] = start + len(chunk)
                save()
                print(f"{phase:<6} {p['table']:<22} {start + len(chunk)}/{len(batch_rows)} "
                      f"(new {answer.get('created', 0)}, changed {answer.get('updated', 0)}, same {answer.get('unchanged', 0)})", flush=True)
    # 6 — views
    for p in plan["databases"]:
        for v in p.get("views") or []:
            answer = call("tables", action="create_view", table=tables[p["notion_id"]], **v)
            print(f"view   {p['table']}: {v['name']} ({v['layout']}){'' if answer.get('ok', True) else ' — ' + str(answer.get('message'))}", flush=True)
    # 7 — the count, Notion against AI Matrx
    print("\n  database               Notion  AI Matrx")
    for p in plan["databases"]:
        got = call("tables", action="aggregate", table=tables[p["notion_id"]], measure="count")
        n = got.get("value", (got.get("groups") or [{}])[0].get("value"))
        print(f"  {p['table']:<22} {p['rows']:>6}  {n!s:>8}  {'✓' if n == p['rows'] else '✗'}")
    progress["finished"] = datetime.now().isoformat(timespec="seconds")
    save()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", choices=("plan", "run"))
    ap.add_argument("export")
    ap.add_argument("--organization", help="the AI Matrx organization id to move into (run)")
    ap.add_argument("--plan", help="the plan file (default: notion-plan.json beside the export)")
    a = ap.parse_args()
    src = Path(a.export).expanduser().resolve()
    root = open_export(src)
    plan_path = Path(a.plan) if a.plan else src.parent / "notion-plan.json"
    if a.step == "plan":
        dbs = read_databases(root)
        by_id = {d["id"]: d for d in dbs}
        plan = {"source": str(src), "databases": [propose(d, by_id, root) for d in dbs]}
        plan_path.write_text(json.dumps(plan, indent=1))
        for p in plan["databases"]:
            print(f"{p['notion_name']} ({p['rows']} rows) -> table \"{p['table']}\"")
            for c in p["columns"]:
                extra = f" -> {c['to']}" if c.get("to") else (f" [{', '.join(c['choices'][:6])}{'…' if len(c.get('choices', [])) > 6 else ''}]" if c.get("choices") else "")
                print(f"    {c['notion']:<22} {c['type']}{extra}{' + ' + c['end'] if c.get('end') else ''}")
        print(f"\nplan written to {plan_path}")
        return
    if not a.organization:
        sys.exit("run needs --organization <your AI Matrx organization id>")
    run(root, json.loads(plan_path.read_text()), a.organization, src.parent / "notion-progress.json")


if __name__ == "__main__":
    main()
