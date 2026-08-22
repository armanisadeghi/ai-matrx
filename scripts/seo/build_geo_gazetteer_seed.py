#!/usr/bin/env python3
"""
Build the seed migration for `seo.geo_place` (I3 — the geo gazetteer).

WHY A GENERATOR AND NOT A HAND-WRITTEN LIST: the gazetteer is DATA, and data
this size is only trustworthy if the file that produced it is in the repo next
to it. Re-run this to rebuild the seed from a newer vintage of the source; the
emitted SQL is idempotent (ON CONFLICT on the slug), so replaying it updates
populations and coordinates without disturbing anything a human edited that the
source does not describe (ambiguity flags are only set on INSERT).

SOURCE: `us-cities-top-1k.csv` — the 1,000 most populous US cities, US Census
Bureau population estimates, published in the plotly/datasets corpus:
https://raw.githubusercontent.com/plotly/datasets/master/us-cities-top-1k.csv
Provenance travels with every row in `metadata.provenance`.

  python3 scripts/seo/build_geo_gazetteer_seed.py <path-to-csv> > migrations/seo_geo_gazetteer_seed.sql

THE AMBIGUITY RULE (documented once, stored per row):
  A city is `requires_qualifier` — it never matches on its own name alone —
  when ANY of:
    1. its lowercase name is an ordinary English word (checked against the
       system dictionary's lowercase-only entries, so "Boston" is not caught by
       a proper-noun entry but "Mobile", "Orange", "Normal" and "Surprise" are);
    2. its name is shorter than 4 characters ("Roy", "Ames" — a three-letter
       token collides with far too much);
    3. it is on CURATED_AMBIGUOUS below — names the dictionary misses that
       collide with ordinary commercial vocabulary.
  Minus CURATED_UNAMBIGUOUS: names the dictionary catches that are, in a search
  box, only ever the city. Erring toward `requires_qualifier` is the SAFE
  direction: the cost is a missed detection, not a wrong one, and every flag is
  an editable row rather than a line of code.

STATE ABBREVIATIONS ARE NEVER STANDALONE TOKENS. "in", "or", "me", "hi", "ok",
"la", "de", "id", "pa", "ma" are ordinary words; a token list containing them
would flag half the corpus as local. An abbreviation lives in `state_code` and
is used by the detector ONLY as the qualifier next to a city name
("dallas tx"), where it cannot fire on its own.
"""

import csv
import re
import sys
from datetime import date

SYSTEM_ORG = "39c38960-d30c-4840-b0c1-c9960de95582"
SOURCE_URL = "https://raw.githubusercontent.com/plotly/datasets/master/us-cities-top-1k.csv"
SOURCE_NAME = "US Census Bureau population estimates (us-cities-top-1k, plotly/datasets)"
RETRIEVED = "2026-08-22"

STATES = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
    "District of Columbia": "DC", "Florida": "FL", "Georgia": "GA", "Hawaii": "HI",
    "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI",
    "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX",
    "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
    "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
}

# The 50 states + DC. DC is a state-level place here because a search says
# "washington dc", never "washington district of columbia".
STATE_EXTRA_TOKENS = {
    "DC": ["washington dc", "washington d.c.", "d.c."],
}

# Names the dictionary misses but that collide with ordinary search vocabulary.
CURATED_AMBIGUOUS = {
    "Washington",   # the state, the city, and a surname
    "Jupiter", "Industry", "Victoria", "Union City", "College Station",
    "Federal Way", "National City", "University Place", "Springfield",
    "Jackson", "Franklin", "Madison", "Monroe", "Clinton", "Milton",
}

# Names the dictionary catches that are, in a search box, only the city.
CURATED_UNAMBIGUOUS = {
    "Boston", "Phoenix", "Anchorage", "Amarillo", "Fresno", "Alameda",
    "Burbank", "Roanoke", "Flagstaff", "Worcester", "Oceanside", "Lakeland",
    "Napa", "Pueblo", "Minot", "Moline", "Salina", "Tulare", "Vineland",
    "Parma", "Palatine", "Kenner", "Killeen", "Chico", "Chino", "Davenport",
    "Dearborn", "Hayward", "Champaign", "Cypress", "Centennial", "Chesterfield",
}

# The local grammar. Multi-word phrases are matched whole-word like any other
# token; "local" is deliberately absent — it modifies a service ("local movers")
# far less reliably than it names a place.
GRAMMAR = [
    ("near me", []),
    ("nearby", []),
    ("near my location", []),
    ("close to me", ["close by"]),
    ("in my area", ["in my town", "in my city"]),
    ("around me", []),
    ("closest", ["nearest"]),
    ("in my neighborhood", ["in my neighbourhood"]),
]


def dictionary_words():
    try:
        with open("/usr/share/dict/words", encoding="utf-8", errors="ignore") as fh:
            return {w.strip() for w in fh if w.strip().islower()}
    except OSError:
        print("-- WARNING: no system dictionary; ambiguity falls back to the curated lists.",
              file=sys.stderr)
        return set()


def slugify(text):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")


def q(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def jsonb(values):
    inner = ", ".join('"' + v.replace('"', '\\"') + '"' for v in values)
    return q("[" + inner + "]") + "::jsonb"


def split_parenthetical(name):
    """"San Buenaventura (Ventura)" is one place with two names, and the "(" would
    be refused by THE REGEX WALL (seo.assert_safe_match_token) — correctly, since
    every token here is interpolated into a regex. The parenthetical becomes an
    alias instead of being dropped or escaped."""
    match = re.match(r"^(.*?)\s*\((.+)\)\s*$", name)
    if not match:
        return name, []
    return match.group(1).strip(), [match.group(2).strip().lower()]


def city_aliases(name):
    """Spelling variants a person really types. Never a guess about meaning."""
    out = []
    lower = name.lower()
    if lower.startswith("st. ") or " st. " in lower:
        out.append(lower.replace("st.", "saint"))
        out.append(lower.replace("st. ", "st "))
    if lower.startswith("ft. "):
        out.append(lower.replace("ft.", "fort"))
    return [a for a in dict.fromkeys(out) if a != lower]


def main(csv_path):
    words = dictionary_words()
    rows = list(csv.DictReader(open(csv_path, encoding="utf-8")))
    rows.sort(key=lambda r: -int(r["Population"]))

    prov = (
        '{"provenance": {"source": %s, "url": %s, "retrieved": %s, "seed": "build_geo_gazetteer_seed.py"}}'
        % ('"' + SOURCE_NAME + '"', '"' + SOURCE_URL + '"', '"' + RETRIEVED + '"')
    )

    out = []
    w = out.append
    w("-- GENERATED by scripts/seo/build_geo_gazetteer_seed.py — re-run, do not hand-edit.")
    w(f"-- Source: {SOURCE_NAME}")
    w(f"-- {SOURCE_URL} (retrieved {RETRIEVED}; generated {date.today().isoformat()})")
    w("-- Idempotent: ON CONFLICT (slug) refreshes what the source describes and")
    w("-- leaves ambiguity flags alone, because a human may have corrected one.")
    w("")
    w("-- ── The 50 states + DC ────────────────────────────────────────────────")
    w("insert into seo.geo_place")
    w("  (place_kind, name, normalized_name, slug, country_code, state_code,")
    w("   match_tokens, aliases, ambiguity, ambiguity_reason, organization_id)")
    w("values")
    values = []
    for name, code in sorted(STATES.items()):
        tokens = [name.lower()] + STATE_EXTRA_TOKENS.get(code, [])
        values.append(
            "  ('state', %s, %s, %s, 'US', %s, %s, '[]'::jsonb, 'safe', NULL, %s)"
            % (q(name), q(name.lower()), q("us-" + code.lower()), q(code),
               jsonb(tokens), q(SYSTEM_ORG))
        )
    w(",\n".join(values))
    w("on conflict (slug) where deleted_at is null do update set")
    w("  match_tokens = excluded.match_tokens, updated_at = now();")
    w("")

    w("-- ── The local grammar ─────────────────────────────────────────────────")
    w("insert into seo.geo_place")
    w("  (place_kind, name, normalized_name, slug, country_code,")
    w("   match_tokens, aliases, ambiguity, organization_id)")
    w("values")
    values = []
    for phrase, aliases in GRAMMAR:
        values.append(
            "  ('grammar', %s, %s, %s, 'US', %s, %s, 'safe', %s)"
            % (q(phrase), q(phrase), q("grammar-" + slugify(phrase)),
               jsonb([phrase] + aliases), jsonb(aliases), q(SYSTEM_ORG))
        )
    w(",\n".join(values))
    w("on conflict (slug) where deleted_at is null do update set")
    w("  match_tokens = excluded.match_tokens, updated_at = now();")
    w("")

    w("-- ── The top 1,000 cities by population ────────────────────────────────")
    w("insert into seo.geo_place")
    w("  (place_kind, name, normalized_name, slug, country_code, state_code,")
    w("   parent_place_id, population, latitude, longitude,")
    w("   match_tokens, aliases, ambiguity, ambiguity_reason, organization_id)")
    w("values")
    values = []
    for row in rows:
        name, paren_aliases = split_parenthetical(row["City"])
        state = row["State"]
        code = STATES[state]
        lower = name.lower()
        reasons = []
        if name in CURATED_UNAMBIGUOUS:
            pass
        else:
            if lower in words:
                reasons.append("the name is also an ordinary English word")
            if len(name) < 4:
                reasons.append("the name is shorter than four characters")
            if name in CURATED_AMBIGUOUS:
                reasons.append("the name collides with ordinary commercial vocabulary")
        ambiguity = "requires_qualifier" if reasons else "safe"
        reason = (
            "Only matches with its state or a local-grammar phrase: "
            + "; ".join(reasons) + "."
        ) if reasons else None
        aliases = list(dict.fromkeys(city_aliases(name) + paren_aliases))
        values.append(
            "  ('city', %s, %s, %s, 'US', %s,"
            " (select id from seo.geo_place s where s.slug = %s),"
            " %s, %s, %s, %s, %s, %s, %s, %s)"
            % (q(name), q(lower), q("us-" + code.lower() + "-" + slugify(name)), q(code),
               q("us-" + code.lower()),
               row["Population"], row["lat"], row["lon"],
               jsonb([lower] + aliases), jsonb(aliases),
               q(ambiguity), q(reason), q(SYSTEM_ORG))
        )
    w(",\n".join(values))
    w("on conflict (slug) where deleted_at is null do update set")
    w("  population = excluded.population,")
    w("  latitude = excluded.latitude,")
    w("  longitude = excluded.longitude,")
    w("  match_tokens = excluded.match_tokens,")
    w("  updated_at = now();")
    w("")
    w("-- Provenance travels with every row, stamped once rather than repeated 1,059 times.")
    w("update seo.geo_place set metadata = metadata || %s::jsonb" % q(prov))
    w("  where deleted_at is null and metadata->'provenance' is distinct from %s::jsonb->'provenance';" % q(prov))
    w("")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "us-cities-top-1k.csv")
