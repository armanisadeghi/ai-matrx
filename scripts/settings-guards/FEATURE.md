# Settings guards — the five `check:settings-*` checks

**What they kill:** one defect class, documented with live cases in
`common-docs/projects/unified-settings-platform/REGISTER.md` § "THE DEFECT CLASS THIS CAMPAIGN
EXISTS TO KILL" — **a settings screen that accepts a value the system does not honor.**

**Shared floor:** `scripts/settings-guards/lib.ts` — the live-registry reader (credential-gated),
the ONE knob-reader vocabulary (`scanKnobReads`), the in-database consumer scan (`dbReaders`),
and `unmeasured()`. Exit codes everywhere: `0` clean · `1` findings · `2` UNMEASURED (could not
reach the registry / the catalog / aidream / the UI — **never a warn that reads as a pass**).

**Run:** `pnpm check:settings` (all five, exits with the worst code) or any one by name. All five
are in `scripts/run-release-gates.sh` (advisory in both lanes, by standing ruling). Two run in
per-PR CI (`.github/workflows/ci.yml` job `settings-guards`): `check:settings-env-toggles` and
`check:settings-unregistered`, gated on the Supabase secret + the aidream checkout and SKIPPED
with an UNMEASURED warning without them.

**Credentials:** `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` (registry and catalog through
`public.execute_admin_query`, the same door `check:db-guards` uses; the publishable key is the
PostgREST fallback for the registry only). `AIDREAM_DIR` overrides the `../aidream` default.

## The ratchet rule (hardcoded, env-toggles, ladder-ui allowlists)

A baseline records what existed on the day the guard was written. **It only shrinks.** `--write`
removes entries that no longer exist and can never add one; a NEW finding is a defect, and
adding it to the baseline is the defect this family exists to catch. `--write` refuses to run
without the aidream checkout (it would otherwise drop every aidream entry and the next full run
would flag them all as NEW).

| Guard | Catches | Baseline | Today (2026-09-11) |
|---|---|---|---|
| `check:settings-orphans` | a `platform.feature_knob` row no code reads — frontend, aidream, the packages, or a database function/view | none (report, never guess) | **161 orphans** of 474 rows: `esign.outsider` 28, `hr.time_and_attendance` 25, `hr.domain_wide` 14, `infrastructure.sandbox` 13 (Lane D rows seeded, reads not repointed yet), `hr.employees` 12, `hr.scheduling` 12, … |
| `check:settings-unregistered` | a resolvable knob read whose (feature, key) has no registry row — it RAISES at run time by design | none | **0** unregistered · 146 resolved read sites · 14 dynamic (listed, never hidden) |
| `check:settings-hardcoded` | a NEW module-level `const NAME = <number\|boolean>` whose name starts `MAX_`/`MIN_` or ends `_LIMIT/_TIMEOUT/_MS/_THRESHOLD/_INTERVAL/_SIZE/_TTL/_RETRIES` | `scripts/settings-hardcoded-allowlist.json` — 1,763 (715 matrx-frontend + 1,048 aidream) | **0 new** |
| `check:settings-env-toggles` | a behavioural env var read in a boolean shape (compared to "1"/"true", `Boolean(...)`, `if (process.env.X)`, `in {truthy}`) that is not a SECRET / ENDPOINT / IDENTITY | `scripts/settings-env-toggles-allowlist.json` — 15 names / 20 sites | **0 new**; 20 baselined |
| `check:settings-ladder-ui` | a customer-tunable knob (`overridable_by` non-empty) the universal settings UI cannot honour: UNFILED (`taxonomy_node_id` null), UNREGISTERED_RUNG (not in `knob_scope_kind`), UNNAMED_RUNG (not in the UI vocabulary), UNADDRESSED_RUNG (the UI never passes the rung to `knob_index`) | `scripts/settings-ladder-ui-allowlist.json` — the 10 `commerce.*` namespaces 0631 deliberately left unfiled | **196 keys / 584 findings**: `platform.spend_popover` (2) unfiled since 0631; 194 hr.* keys name `employer_profile`/`pay_group`/`location` and `features/settings/universal` addresses only organization, user, device |

### Which register cases each guard would have caught

- Photo-editing / image-generation preferences (built, synced, **never read**) → orphans.
- `max_share_links_per_resource` / `max_versions_per_file` (nothing checks them) → orphans.
- Org auto-RAG daily budget (displayed, editable, not enforced) → orphans, once it is a registry
  row and the enforcement read is the only reader that counts.
- Quiz question count (8 in `kindConfig.ts`, 10 in `quizGenerator.ts`) and `respect_robots`
  (hardcoded `False` at three probe sites) → hardcoded.
- `NEXT_PUBLIC_HR_MOCK`, `MATRX_ALLOW_ARCHIVED_REGENERATOR`, `UNWIRED_DEBUG` → env-toggles
  (the other three of the census's six were already gone from the tree at seed time).
- `force_ocr` wired through an API contract no UI ever passes; theme stored seven ways →
  ladder-ui (a rung the registry promises and the surface never offers).

### What the env-toggle census missed

The register named six toggles. The guard found **twenty sites / fifteen names** in the tree,
mostly in aidream packages and one-off scripts (`MATRX_DEBUG/INFO/VERBOSE`, `MATRX_PARITY_*`,
`P6_*`, `APPLY`, `SSR_TIMING`, …). All are baselined with a reason each; Lane D drains the list.

## Red then green — planted known-bad cases (2026-09-11)

One scratch file, `lib/__settings_guard_probe.ts`, carried all three plants; it was deleted after
the red runs and the green runs below are from the clean tree.

### unregistered — plant `knobInt("probe_feature", "probe_key_not_in_registry")`

```
UNREGISTERED SETTING READS (check:settings-unregistered)
474 live platform.feature_knob rows · 147 resolved read site(s) · 14 dynamic

[LOUD] 1 read site(s) name a key that is NOT in the registry

  matrx-frontend/lib/__settings_guard_probe.ts:6  probe_feature probe_key_not_in_registry (knobInt)

  Fix: seed the row in platform.feature_knob (value, default_value, value_type,
exit=1
```

removed →

```
UNREGISTERED SETTING READS (check:settings-unregistered)
474 live platform.feature_knob rows · 146 resolved read site(s) · 14 dynamic

✓ Every resolvable knob read names a live registry row.
exit=0
```

### hardcoded — plant `export const MAX_PROBE_WIDGETS = 7;`

```
HARDCODED SETTINGS (check:settings-hardcoded)
1764 knob-shaped constant(s) across 20493 files · 1763 baselined · 0 declared KNOB MIRROR

[LOUD] 1 NEW knob-shaped constant(s) — not in the baseline
An opinion frozen into a deploy. Organizations decide, not constants.

  matrx-frontend/lib/__settings_guard_probe.ts:3  MAX_PROBE_WIDGETS = 7
exit=1
```

removed →

```
HARDCODED SETTINGS (check:settings-hardcoded)
1763 knob-shaped constant(s) across 20493 files · 1763 baselined · 0 declared KNOB MIRROR

✓ No NEW hardcoded settings.
exit=0
```

### env-toggles — plant `if (process.env.PROBE_ENABLE_THING === "1")`

```
BEHAVIOURAL ENV TOGGLES (check:settings-env-toggles)
54 boolean-shaped env read(s) across 21156 files — 21 BEHAVIOUR (illegal), 11 SECRET, 15 ENDPOINT, 7 IDENTITY (all three legitimate)

[LOUD] 1 NEW behavioural env toggle(s) — not in the allowlist
Identical code, different behaviour per machine, invisible to the organization.

  matrx-frontend/lib/__settings_guard_probe.ts:5  PROBE_ENABLE_THING (compared to "1"/"true") → classified BEHAVIOUR
exit=1
```

removed →

```
BEHAVIOURAL ENV TOGGLES (check:settings-env-toggles)
53 boolean-shaped env read(s) across 21156 files — 20 BEHAVIOUR (illegal), 11 SECRET, 15 ENDPOINT, 7 IDENTITY (all three legitimate)
[BASELINED] 20 KNOWN behavioural env toggle(s) still in the tree — allowlisted 2026-09-11 …
exit=0
```

### orphans — red is the real tree; the plant proves the guard moves in BOTH directions

The clean tree is red today (161 orphans; `esign.outsider` 28 — verified: no source file and only
`esign.resolve_config_snapshot` in the database mention the feature, and it reads two keys).
Planting one consumer, `knobInt("esign.outsider", "code.length")`, in the probe file:

```
ORPHANED SETTINGS (check:settings-orphans)
474 live platform.feature_knob rows · 132 read directly · 67 forwarded through a wrapper · 116 read inside the database · scanned 20493 source files across matrx-frontend + aidream

[LOUD] 160 registered setting(s) that NO code reads
  esign.outsider (27)
exit=1
```

removed → `161` orphans, `esign.outsider (28)`. `--self-test` adds a fake registry row
(`self_test a_knob_no_code_reads`) and reports it. True negatives checked by hand:
`tables.pagination mode` (read through `useScopedKnobs` + `.key === "mode"`) and
`hr.time_and_attendance grace_minutes` (read only by `hr._clock_knob` in the database) are NOT
reported — before the in-database tier existed the guard reported 268 orphans, 50 of them
`hr.time_and_attendance` keys that the punch write path reads every day.

### ladder-ui — red is the real tree; the plant shows what green needs

Clean tree:

```
SETTINGS LADDER UI REACHABILITY (check:settings-ladder-ui)
302 customer-tunable knobs (overridable_by non-empty) of 474 · rungs registered: organization, employer_profile, brand, pay_group, site, location, user, device · named by the UI: organization, employer_profile, brand, pay_group, site, location, user, device · addressed by features/settings/universal: organization, user, device

[LOUD] 196 knob(s) the universal settings UI cannot honour — 584 finding(s)

  UNFILED (2) — taxonomy_node_id is null, so the left nav has nowhere to put it
    platform.spend_popover scare_threshold_usd
    platform.spend_popover times_per_day
    Fix: add the feature to the m(feature, dom, feat) mapping table in aidream/db/migrations/0631_feature_knob_taxonomy_mapping.sql and apply it live

  UNADDRESSED_RUNG (582) — the universal UI never passes this rung to knob_index — nobody can edit at it
    employer_profile (194 key(s)) … pay_group (194 key(s)) … location (194 key(s))
exit=1
```

Planting `features/settings/universal/__probe_addresses_rungs.ts` with
`[{ kind: "employer_profile" }, { kind: "pay_group" }, { kind: "location" }]` (the shape Lane B
passes as `scopes`):

```
addressed by features/settings/universal: organization, user, device, employer_profile, pay_group, location

[LOUD] 2 knob(s) the universal settings UI cannot honour — 2 finding(s)
  UNFILED (2) … platform.spend_popover
exit=1
```

removed → 196 / 584 again. `--self-test` adds a row with `overridable_by: [organization, brand,
a_rung_that_does_not_exist]` and `taxonomy_node_id: null` and reports all three classes
(`UNFILED`, `UNREGISTERED_RUNG a_rung_that_does_not_exist`, `UNADDRESSED_RUNG brand`).

## Where the counts come from (so nobody re-derives them wrong)

- Registry: live `platform.feature_knob` (474 rows at the time of writing; it grows as Lanes D and
  F seed rows — the guards re-read it every run, and the register's census rule applies: read the
  database, never the migrations).
- Readers: `scanKnobReads` in `lib.ts` — `knobNumber/knobInt/knobBool/knobString/knobInts`,
  `useScopedKnobs({featurePrefix}) + .key === "…"`, `knob_int/knob_str/knob_bool/knob_decimal`,
  `scoped_knob_*`, and the package family `usd_knob/int_knob/str_knob/float_knob/bool_knob`
  (`matrx_seo.knobs`, `matrx_batch.knobs`). A reader missing here is invisible to orphans AND
  unregistered at once — add it here, once.
- In-database readers: `dbReaders` — candidate `pg_proc` bodies and `pg_views` definitions that
  mention `knob` or a feature name (~770, fetched once), matched client-side on `'key'` beside its
  feature or on the qualified `feature.key` (`esign.config_resolve`'s address form).
