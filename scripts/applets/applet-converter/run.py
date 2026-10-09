import json, os, re, sys, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
import convert
S = os.environ.get("CONVERTER_WORKDIR") or sys.exit("set CONVERTER_WORKDIR to a scratch dir holding defs.json (a dump of app.definition)")
d = json.load(open(f"{S}/defs.json"))
live = [r for r in d if not r["deleted_at"] and r["slug"] != "holloway-content"]
ids = ",".join(sorted({r["agent_id"] for r in live if r["agent_id"]}))
req = urllib.request.Request(f"{os.environ['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/definition?select=id,variable_definitions&id=in.({ids})",
    headers={"apikey": os.environ["SUPABASE_SECRET_KEY"], "Authorization": "Bearer " + os.environ["SUPABASE_SECRET_KEY"], "Accept-Profile": "agent"})
agents = {a["id"]: a["variable_definitions"] for a in json.load(urllib.request.urlopen(req))}
manifest = []
for r in live:
    src = (r["files"] or {}).get(r["entry"] or "App.tsx") or ""
    if r["slug"] == "fearless-travel-advisor":
        # a stored edit artifact (">>> --- SEARCH: <<<" plus three hook lines at module scope) broke the row
        # in the old runtime too; drop exactly those lines (the component declares the same three states)
        lines = src.split("\n")
        assert lines[6] == ">>>" and lines[12] == "<<<", "fearless artifact moved"
        src = "\n".join(lines[:6] + lines[17:])
    legacy = "export default function" in src and "onExecute" in src and r["slug"] != "smart-destination-guide"
    entry = {"id": r["id"], "slug": r["slug"], "shell": r["shell_kind"], "public": r["published_to_web"], "status": r["status"]}
    try:
        if legacy:
            out, notes = convert.convert_legacy(src, r)
            entry.update(kind="legacy", notes=notes)
            if re.search(r"from ['\"]@/components/(?:MarkdownStream|Markdown|markdown|mardown)['\"]", out):
                out = re.sub(r"from (['\"])@/components/(?:Markdown|markdown|mardown)\1", 'from "@/components/MarkdownStream"', out)
                entry["scope_add"] = ["@/components/MarkdownStream"]
        else:
            defs = agents.get(r["agent_id"]) or []
            if not defs and r["variable_schema"]:
                defs = [{"name": v["name"], "label": v.get("label"), "defaultValue": v.get("default", ""), "required": v.get("required")} for v in r["variable_schema"]]
            out = convert.stock(r, defs, r["shell_kind"] == "chat")
            entry.update(kind="stock", notes=[f"{len(defs)} fields"])
        os.makedirs(f"{S}/conv", exist_ok=True)
        open(f"{S}/conv/{r['slug']}.tsx", "w").write(out)
    except Exception as e:
        entry.update(kind="FAILED", notes=[repr(e)])
    manifest.append(entry)
json.dump(manifest, open(f"{S}/manifest.json", "w"), indent=1)
import collections
print(collections.Counter(m["kind"] for m in manifest))
for m in manifest:
    if m["notes"] and m["kind"] != "stock": print(m["slug"], m["notes"])
