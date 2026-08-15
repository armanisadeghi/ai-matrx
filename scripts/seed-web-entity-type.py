#!/usr/bin/env python3
"""Seed the two-level `web_entity_type` taxonomy into platform.categories.

Derived from the 177 distinct free-text `headline` descriptors the SEO fold
wrote onto real discovered parties — NOT invented. Quality ("content farm",
"link farm") is deliberately absent: that axis already exists as
attributes.seo_domain.opinion_verdict/opinion_score. Relationship ("competitor")
is deliberately absent: that already exists as the `party_role` dimension.

Vocabulary lives in ROWS so revising it is a data edit, never a migration.
"""
import json
import os
import re
import subprocess
import sys

ENV = "/Users/armanisadeghi/code/matrx-frontend/.env.local"
SYSTEM_ORG = "39c38960-d30c-4840-b0c1-c9960de95582"
DIMENSION = "web_entity_type"

TAXONOMY = {
    "News & media": [
        "National news outlet", "Regional news outlet", "Local news outlet",
        "Broadcast outlet", "Trade publication", "Magazine",
        "Student newspaper", "Press release syndication",
    ],
    "Blog": [
        "Personal blog", "Company blog", "Niche or hobbyist blog",
        "Lifestyle blog", "Expert or professional blog",
    ],
    "Directory & aggregator": [
        "Business directory", "Local directory", "Content aggregator",
        "Data or price aggregator", "Tool directory", "General web directory",
    ],
    "Company site": [
        "Product or service site", "Ecommerce site", "Agency or consultancy",
    ],
    "Institution": [
        "Government or public agency", "Nonprofit", "University or school",
        "Trade association", "Labor union",
    ],
    "Podcast": ["Podcast show", "Podcast network", "Podcast database"],
    "Reference": ["Wiki or encyclopedia", "How-to or reference site"],
    "Community": ["Forum", "Community blog"],
}


def env(key):
    for line in open(ENV):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit(f"missing {key}")


URL, KEY = env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY")


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def rest(method, path, body=None, profile_header="Content-Profile"):
    cmd = [
        "curl", "-s", "-X", method, f"{URL}/rest/v1/{path}",
        "-H", f"apikey: {KEY}", "-H", f"Authorization: Bearer {KEY}",
        "-H", "Content-Type: application/json",
        "-H", "Accept-Profile: platform", "-H", "Content-Profile: platform",
        "-H", "Prefer: return=representation",
    ]
    if body is not None:
        cmd += ["-d", json.dumps(body)]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    try:
        return json.loads(out) if out.strip() else []
    except json.JSONDecodeError:
        raise SystemExit(f"non-JSON from {method} {path}: {out[:400]}")


def row(name, parent_id, position):
    return {
        "dimension": DIMENSION, "name": name, "slug": slugify(name),
        "organization_id": SYSTEM_ORG, "visibility": "public",
        "is_system": True, "parent_id": parent_id, "position": position,
    }


existing = rest("GET", f"categories?select=id,name,slug,parent_id&dimension=eq.{DIMENSION}")
if existing:
    print(f"already seeded: {len(existing)} rows — nothing to do")
    sys.exit(0)

parents = rest("POST", "categories",
               [row(n, None, i) for i, n in enumerate(TAXONOMY)])
if not isinstance(parents, list) or not parents:
    raise SystemExit(f"parent insert failed: {parents}")
by_name = {p["name"]: p["id"] for p in parents}
print(f"inserted {len(parents)} top-level categories")

children = []
for parent, kids in TAXONOMY.items():
    children += [row(k, by_name[parent], i) for i, k in enumerate(kids)]
made = rest("POST", "categories", children)
if not isinstance(made, list) or len(made) != len(children):
    raise SystemExit(f"child insert failed: {str(made)[:400]}")
print(f"inserted {len(made)} second-level categories")

check = rest("GET", f"categories?select=id,name,parent_id&dimension=eq.{DIMENSION}")
roots = [c for c in check if not c["parent_id"]]
print(f"verified live: {len(check)} rows, {len(roots)} roots, "
      f"{len(check) - len(roots)} children")
