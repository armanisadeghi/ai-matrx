#!/usr/bin/env python3
# matrx-agent-traffic: exempt its only requests go to Supabase GoTrue; the browser step is pw.mjs, which marks itself
"""Sign a real-test run's private Chrome in as admin@admin.com on the deployed site, no password.

Mints a one-time magic-link token for admin@admin.com with the live project's secret key (read from
matrx-frontend/.env.local, never printed) and opens it through the app's own /auth/confirm route
in that run's private browser (pw.mjs). Usage: signin.py <run> [route=/dashboard] [origin=https://www.aimatrx.com]
Localhost works: `signin.py <run> /dashboard http://localhost:3000` (that origin's own /auth/confirm sets the cookie; same live Supabase). Then `pw.mjs <run> chat` opens the test agent there.
"""
import json, subprocess, sys, urllib.request
from pathlib import Path

run = sys.argv[1]
route = sys.argv[2] if len(sys.argv) > 2 else "/dashboard"
origin = sys.argv[3] if len(sys.argv) > 3 else "https://www.aimatrx.com"
env = {}
for line in (Path.home() / "code/matrx-frontend/.env.local").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"')
url, key = env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SECRET_KEY"]
req = urllib.request.Request(
    url + "/auth/v1/admin/generate_link",
    data=json.dumps({"type": "magiclink", "email": "admin@admin.com"}).encode(),
    headers={"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json"},
)
d = json.load(urllib.request.urlopen(req))
h = d.get("hashed_token") or d.get("properties", {}).get("hashed_token")
link = f"{origin}/auth/confirm?token_hash={h}&type=magiclink&redirectTo={route}"
pw = str(Path(__file__).with_name("pw.mjs"))
subprocess.run(["node", pw, run, "start"], check=True)
subprocess.run(["node", pw, run, "goto", link], check=True, stdout=subprocess.DEVNULL)
who = subprocess.run(["node", pw, run, "eval",
    "[...document.querySelectorAll('body *')].map(e=>e.innerText||'').find(t=>/@/.test(t) && t.length<60) || location.pathname"],
    check=True, capture_output=True, text=True).stdout.strip()
print(f"signed in; page shows: {who}")
