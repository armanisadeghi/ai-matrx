import json, os, sys, urllib.request, urllib.error
S = os.environ.get("CONVERTER_WORKDIR") or sys.exit("set CONVERTER_WORKDIR to a scratch dir holding defs.json (a dump of app.definition)")
URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]; KEY = os.environ["SUPABASE_SECRET_KEY"]
H = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Accept-Profile": "app", "Content-Profile": "app", "Content-Type": "application/json", "Prefer": "return=representation"}
defs = {r["id"]: r for r in json.load(open(f"{S}/defs.json"))}
manifest = json.load(open(f"{S}/manifest.json"))
only = set(sys.argv[1:])
ok = fail = 0
for m in manifest:
    if only and m["slug"] not in only: continue
    r = defs[m["id"]]
    src = open(f"{S}/conv/{m['slug']}.tsx").read()
    allowed = list(r["allowed_imports"] or [])
    for a in m.get("scope_add", []):
        if a not in allowed: allowed.append(a)
    body = {"files": {"App.tsx": src}, "entry": "App.tsx", "component_code": src, "slot_code": {},
            "allowed_imports": allowed}
    body["pages"] = [{"path": "/", "title": r["name"], "file": "App.tsx"}]
    if m["kind"] == "stock": body["shell_kind"] = "fully_custom"
    q = f"{URL}/rest/v1/definition?id=eq.{m['id']}&version=eq.{r['version']}"
    req = urllib.request.Request(q, data=json.dumps(body).encode(), headers=H, method="PATCH")
    try:
        res = json.load(urllib.request.urlopen(req))
        if len(res) != 1: raise RuntimeError(f"guard: version moved from {r['version']} (0 rows updated)")
        ok += 1; print("ok", m["slug"], r["version"], "->", res[0]["version"])
    except urllib.error.HTTPError as e:
        fail += 1; print("FAIL", m["slug"], e.code, e.read().decode()[:300])
    except Exception as e:
        fail += 1; print("FAIL", m["slug"], e)
print("written", ok, "failed", fail)
