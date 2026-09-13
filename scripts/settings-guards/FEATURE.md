# Settings guards — the five `check:settings-*` checks

**What they kill:** one defect class, documented with live cases in
`common-docs/projects/unified-settings-platform/REGISTER.md` § "THE DEFECT CLASS THIS CAMPAIGN
EXISTS TO KILL" — **a settings screen that accepts a value the system does not honor.**

**Shared floor:** `scripts/settings-guards/lib.ts` — the live-registry reader (credential-gated),
the ONE knob-reader vocabulary (`scanKnobReads`), the in-database consumer scan (`dbReaders`),
and `unmeasured()`. Exit codes everywhere: `0` clean · `1` findings · `2` UNMEASURED (could not
reach the registry / the catalog / aidream / the UI — **never a warn that reads as a pass**).

**Run:** `pnpm check:settings` (all five, exits with the worst code) or any one by name. All five
are in `scripts/run-release-gates.sh` (advisory in both lanes, by standing ruling). All five run in
per-PR CI (`.github/workflows/ci.yml` job `settings-guards`), gated on the Supabase secret + the
aidream checkout and SKIPPED with an UNMEASURED warning without them: `check:settings-env-toggles`
and `check:settings-unregistered` fail the job; `check:settings-hardcoded`, `check:settings-orphans`
and `check:settings-ladder-ui` are **signals** (`continue-on-error`, never required checks —
Arman's ruling: CI is a signal, never a gate). The job also checks out `matrx-sandbox`
(`orchestrator/orchestrator`, the only reader of `infrastructure.sandbox`) for the orphan scan;
`MATRX_SANDBOX_DIR` overrides the `../matrx-sandbox` default, and its absence is a loud `[WARN]`
followed by 13 NEW orphans — never a silent pass.

**Credentials:** `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` (registry and catalog through
`public.execute_admin_query`, the same door `check:db-guards` uses; the publishable key is the
PostgREST fallback for the registry only). `AIDREAM_DIR` overrides the `../aidream` default.

## The ratchet rule (hardcoded, env-toggles, ladder-ui allowlists — and, since 2026-09-13, orphans)

A baseline records what existed on the day the guard was written. **It only shrinks.** `--write`
removes entries that no longer exist and can never add one; a NEW finding is a defect, and
adding it to the baseline is the defect this family exists to catch. `--write` refuses to run
without the aidream checkout (it would otherwise drop every aidream entry and the next full run
would flag them all as NEW).

The orphans baseline (`scripts/settings-orphans-baseline.json`) is keyed by NAMESPACE and carries
the registry domain that owns each one (`owner`, from the live taxonomy — an unfiled `hr.*`
namespace is attributed `human-resources/(unfiled)` so the debt has a name AND the filing gap
shows) plus the program that owes the consumer. A baselined orphan is printed on EVERY run under
`[KNOWN DEBT]`, with its owner — it is reported debt, never a pass. `--write` without a baseline
seeds today's orphans; with one it only removes keys that gained a reader or left the registry.

| Guard | Catches | Baseline | Today (2026-09-13) |
|---|---|---|---|
| `check:settings-orphans` | a `platform.feature_knob` row no code reads — frontend, aidream, the packages, matrx-sandbox, or a database function/view | `scripts/settings-orphans-baseline.json` — **169** known orphans in 33 namespaces (seeded 2026-09-13; only shrinks) | **0 NEW / GREEN**. 601 rows · 250 direct · 62 forwarded · 121 in-DB. The 169 by owner: human-resources 106 (`hr-time-and-attendance` 25, `(unfiled)` 17 = `hr.domain_wide`/`hr.access`/`hr.relations`, `hr-employees` 12, `hr-scheduling` 12, `hr-documents-and-forms` 10, `hr-workflow-inbox` 9, `hr-hiring` 7, `hr-leave` 5, `hr-onboarding` 5, `hr-compliance` 3, `hr-training` 1) · platform/esign 33 · workflows/workflow-runtime 10 (`workflow.recovery` 6 + `workflow.checkpoint_write` 4 — rows seeded 2026-09-12 whose readers exist in NO checkout) · platform/custom-data 7 (`records.confirmation.*` 5, `extensibility` 2) · marketing/commerce 4 · masterwork/distillation 4 (`unfolding` 3, `masterwork.rulebook_read_page_size`) · platform/orm-persistence 3 (`orm.write_retry`) · mandates 1 · data-lifecycle 1. Before the scanner fix (same tree): **186** — the 17 that left were `infrastructure.sandbox` 13 (matrx-sandbox was never scanned), `vault.import` 2 + `seo.dimension_coverage` 1 (feature-map family; the latter also hidden by a `coverage/` directory skip), `persistent_cloud_browser` 1 (f-string template family). |
| `check:settings-unregistered` | a resolvable knob read whose (feature, key) has no registry row — it RAISES at run time by design | none | **0** unregistered · 262 resolved read sites · 21 dynamic (listed, never hidden). The full-key family (`useEffectiveKnob`) was invisible until 2026-09-13; the moment it was graded it found ONE committed read of a row that never existed — `shape_system.structured_document optional_fields`, seeded by aidream migration 0665. |
| `check:settings-hardcoded` | a NEW module-level `const NAME = <number\|boolean>` whose name starts `MAX_`/`MIN_` or ends `_LIMIT/_TIMEOUT/_MS/_THRESHOLD/_INTERVAL/_SIZE/_TTL/_RETRIES` | `scripts/settings-hardcoded-allowlist.json` — 1,760 after the 2026-09-13 ratchet (was 1,763) | **0 new** in committed code · 41 declared KNOB MIRROR. 2026-09-13: 47 NEW (17 matrx-frontend + 30 aidream) became registry rows (aidream 0663), then 10 more (0664: 8 in `aidream/services/coverage/` the guard had never SEEN — its directory skip hid every folder named `coverage`; 2 frontend timers other lanes committed that morning). One remaining NEW is another lane's uncommitted `matrx_scheduler/lease.py` (`MIN_HEARTBEAT_INTERVAL_SECONDS`), left to that lane. |
| `check:settings-env-toggles` | a behavioural env var read in a boolean shape (compared to "1"/"true", `Boolean(...)`, `if (process.env.X)`, `in {truthy}`) that is not a SECRET / ENDPOINT / IDENTITY | `scripts/settings-env-toggles-allowlist.json` — **EMPTY** (seeded 2026-09-11 with 15 names / 20 sites, drained the same day by lane D) | **0 BEHAVIOUR reads anywhere.** Every future finding is NEW and exits 1 |
| `check:settings-ladder-ui` | a customer-tunable knob (`overridable_by` non-empty) the universal settings UI cannot honour: UNFILED (`taxonomy_node_id` null), UNREGISTERED_RUNG (not in `knob_scope_kind`), UNNAMED_RUNG (not in the UI vocabulary), UNADDRESSED_RUNG (the UI never passes the rung to `knob_index`) | `scripts/settings-ladder-ui-allowlist.json` — the `commerce.*` namespaces 0631 deliberately left unfiled; **7** after the 2026-09-12 shrink (market, quota, research removed: their rows are platform-engineering-only, so the guard never grades them) | **0 / GREEN (2026-09-12)**, from 196 keys / 584 findings. `platform.spend_popover` filed by aidream migration 0638 (platform › observability); the 194 hr.* keys' `employer_profile`/`pay_group`/`location` rungs are addressed by `features/settings/universal/scopeRows.ts` + the "Standing inside" picker — and the picker was proven to LIST and WRITE at a rung on the live surface, not merely to name one (aidream migration 0639 gave it the door it needed). `--self-test` still goes red. |

### Which register cases each guard would have caught

- Photo-editing / image-generation preferences (built, synced, **never read**) → orphans.
- `max_share_links_per_resource` / `max_versions_per_file` (nothing checks them) → orphans.
- Org auto-RAG daily budget (displayed, editable, not enforced) → orphans, once it is a registry
  row and the enforcement read is the only reader that counts.
- Quiz question count (8 in `kindConfig.ts`, 10 in `quizGenerator.ts`) and `respect_robots`
  (hardcoded `False` at three probe sites) → hardcoded.
- `NEXT_PUBLIC_HR_MOCK`, `MATRX_ALLOW_ARCHIVED_REGENERATOR`, `UNWIRED_DEBUG` → env-toggles.
  (The seed note claimed the other three of the census's six were already gone; two of them —
  `NEXT_PUBLIC_USE_DATABASE_CONTENT_BLOCKS`, `NEXT_PUBLIC_ENABLE_CONTENT_BLOCKS_ADMIN` — plus
  `TWILIO_SKIP_VALIDATION` were still in the tree and surfaced as NEW on the very next run.
  All three are gone now; see the drain below.)
- `force_ocr` wired through an API contract no UI ever passes; theme stored seven ways →
  ladder-ui (a rung the registry promises and the surface never offers).

### What the env-toggle census missed, and how the list was drained (2026-09-11)

The register named six toggles. The guard found **twenty sites / fifteen names** in the tree,
mostly in aidream packages and one-off scripts (`MATRX_DEBUG/INFO/VERBOSE`, `MATRX_PARITY_*`,
`P6_*`, `APPLY`, `SSR_TIMING`, …), plus three more that surfaced as NEW on the next run. Lane D
drained all of them the same day. **The split is the judgement, not the count:**

| Disposition | Count | Which, and why |
|---|---|---|
| Became a `platform.feature_knob` row | 1 | `MATRX_PARITY_SHADOW` → `platform.debug.config_parity_shadow` (aidream migration 0638, `overridable_by` `{}`, default `false` = what production ran). The only one that was *product runtime behaviour*. matrx-ai takes `configure_parity_shadow` and never reads the environment. |
| Became a real CLI flag | 14 | `APPLY`→`--apply`, `UNWIRED_DEBUG`→`--debug`, `MATRX_ALLOW_ARCHIVED_REGENERATOR`→`--allow-archived` (the banner now STATES the consequence), `PODCAST_E2E_FULL`→`--full`, `MATRX_PARITY_REQUIRE_FRONTEND`→`--require-frontend`, `P6_BENCHMARK_MODE`→`--benchmark`, `P6_IMAGE_BENCHMARK_CONTRACT`→`--image-benchmark-contract`, `MATRX_INFO/DEBUG/VERBOSE`→`run_schema_generation()` arguments. **A one-off script's dry-run switch is a CLI flag wearing an env var**; seeding a knob for it would put a developer's keystroke in an organization's settings registry — worse than leaving it. |
| Deleted outright | 6 | `SSR_TIMING` and the two `NEXT_PUBLIC_*CONTENT_BLOCKS*` went with the modules that carried them — `utils/performance/serverTiming.ts` and `config/content-blocks.ts` had **zero importers** (policy remediation step 2: a flag for behaviour that does not exist is scenery). `MATRX_BROWSER_PROOF_SERVER` was a second gate beside the proof harness's own signing-key requirement, which is a genuine secret. `TWILIO_SKIP_VALIDATION` turned off webhook SIGNATURE VALIDATION — no organization may choose to accept unsigned webhooks, so there was no honest setting to move it to; the check is now unconditional. |
| Upheld as a legitimate env var | 1 | `MATRX_SEO_LOCAL_DEV` names which database role a process may run as — host identity, by the standing written ruling of 2026-08-25 in `env-vars-are-values-not-toggles.md`. `classify()` was corrected to say IDENTITY, per this guard's own instruction to fix the classifier rather than the list. |

## 2026-09-13 — 57 hardcoded constants became rows (aidream 0663 + 0664)

**The split is the judgement, not the count.** Every one of the 57 is a `platform.feature_knob`
row (default = the value the code shipped with, filed, `review_due` 2026-10-13, `basis` naming
the constant it replaces). How the READ moved:

| Disposition | Count | Which |
|---|---|---|
| Constant deleted, read live through the resolution API (`knobInt` / `knob_int`) | 20 | frontend `organizations.workspace action_wait_ms`, `infrastructure.sandbox list_page_size`; aidream `agent_impact` ×2, `masterwork.recovery max_recovery_attempts` + `max_resumes_per_pass`, `masterwork.audition` ×5, `masterwork.rulebooks cas_retries`, `press.coverage` ×6 (0664) |
| Constant stays as a **KNOB MIRROR** (the guard's own documented posture) | 26 | synchronous render paths and pure functions with unit-test contracts (`AUTO_COLLAPSE_THRESHOLD`, `HR_FAILURE_INITIAL_LIMIT`, `MAX_RULES_PER_SECTION`, `MIN_TRIAGE_BATCH`, …); three function DEFAULTS whose caller (the Masterwork sweeper) reads the row live and passes it; `PERSISTENCE_READ_TIMEOUT_MS`, which runs in a Next API route where this repo has NO server-side knob reader; matrx-orm's `CONTENTION_RETRIES`, because the database manager cannot read the database to configure itself |
| Package value, read through a **`configure_*` seam** aidream binds at startup | 11 | matrx-scraper parser thresholds ×5 (`knowledge.scraper`), matrx-files extraction bounds ×3 (`media.file_service`), matrx-graph `predicate_preview_row_limit`, matrx-ai `authoring_successor_hop_limit`. The package's constant is its standalone mirror; `package_integration` binds `knob_raw_sync` and the feature is in `SYNC_READ_FEATURES`, primed by the ASGI lifespan AND the worker bootstrap (a queued scrape must never hit `KnobNotPrimedError`). A bound reader that fails announces once per key and keeps the mirror — loud, never a crashed parse |

`overridable_by`: 11 rows `{organization}` (or `{organization,user}`) — list density, undo windows,
distillation sizing; 46 rows `{}` — sweep pages, retries, parser thresholds, timeouts. Every row
was read live after seeding (`knob_int` / `_raw` over the aidream resolver, 57/57).

Refused: nothing among the 57. Not converted: `matrx_scheduler/lease.py MIN_HEARTBEAT_INTERVAL_SECONDS`
(another lane's uncommitted file at the time; the guard reports it as NEW until that lane converts
it — that is the guard working).

### The scanner learned four reader families it could not see (lib.ts)

| Family | Shape | What it un-orphaned |
|---|---|---|
| key-first (matrx-sandbox) | `knob_int("warm_pool_size")`, feature = `orchestrator/knobs.py`'s `FEATURE` (read from the file, never typed into the scanner); also the 0663 seams `parser_knob("key", MIRROR)` | `infrastructure.sandbox` 13 |
| feature map | `fetchFeatureKnobValues("X")` / `fetchKnobIndex({featurePrefix:"X"})` then `values.key` / `data?.key` — one feature per file, every registry key of it that appears as a property is read | `vault.import` 2, `seo.dimension_coverage` 1 |
| template | `f"max_live_{x}_runs"` / `` `max_live_${x}_runs` `` — every registry key of that feature matching the shape is read; listed as dynamic when none does | `persistent_cloud_browser max_live_browser_fleet_runs` |
| full key | `useEffectiveKnob(org, user, "feature.key")`, `useSessionKnob("feature.key")` | (unregistered found its first real finding) |
| KNOB MIRROR | `KNOB MIRROR of platform.feature_knob "feature" "key"` beside a synchronous constant | the 41 mirrors above are graded as reads — and as UNREGISTERED reads when the row does not exist |

Also fixed the same day: `SKIP_DIR_RE` skipped ANY directory named `coverage` (meant for jest/pytest
output) and hid `features/marketing/seo/value-system/coverage/` and `aidream/services/coverage/`
from every guard; it now skips `coverage` only at a repo root. And `dbReaders()` matches feature
names with ONE regex per body instead of one `LIKE` per feature per body — at 591 rows the old form
crossed `execute_admin_query`'s ~8.2 s ceiling and the guard went UNMEASURED (3.3 s now).

## Red then green — the orphan ratchet and the sandbox scan (2026-09-13)

Clean tree (exit 0):

```
ORPHANED SETTINGS (check:settings-orphans)
601 live platform.feature_knob rows · 250 read directly · 62 forwarded through a wrapper · 121 read inside the database · scanned 20749 source files across matrx-frontend + aidream + matrx-sandbox · 169 baselined

✓ No NEW orphaned settings.

[KNOWN DEBT] 169 baselined orphan(s) still have no reader — seeded ahead of their consumers; each leaves this list when its screen ships
  esign.outsider (28) → platform/esign · HR program (spec-first seed; consumers unbuilt)
  hr.time_and_attendance (25) → human-resources/hr-time-and-attendance · HR program (spec-first seed; consumers unbuilt)
  …
exit=0
```

`--self-test` (a fake row in no namespace) → `[LOUD] 1 NEW registered setting(s) that NO code
reads — not in the baseline · self_test (1) a_knob_no_code_reads` → exit=1.

Plant a consumer for a BASELINED orphan (`lib/__settings_guard_probe.ts`:
`knobInt("esign.outsider", "code.length")`) → still green, and the ratchet moves:

```
✓ No NEW orphaned settings.
1 baseline entry no longer orphaned — the ratchet moved. Run --write to lock it in.
  esign.outsider code.length
exit=0
```

`--write` with the plant → `Ratcheted scripts/settings-orphans-baseline.json: 168 known orphan(s)
in 33 namespace(s) (removed 1).` Then delete the plant and run again — the key is now a NEW orphan
because the baseline can never grow back:

```
[LOUD] 1 NEW registered setting(s) that NO code reads — not in the baseline
  esign.outsider (1) → platform/esign · HR program (spec-first seed; consumers unbuilt)
    code.length
exit=1
```

(The baseline was restored to 169 afterwards.) The sandbox scan is loud when it cannot run —
`MATRX_SANDBOX_DIR=/nonexistent pnpm check:settings-orphans`:

```
[WARN] matrx-sandbox NOT scanned — /nonexistent does not exist (clone matrx-sandbox beside this repo or set MATRX_SANDBOX_DIR). Every infrastructure.sandbox row will read as an orphan this run.
[LOUD] 13 NEW registered setting(s) that NO code reads — not in the baseline
  infrastructure.sandbox (13)
exit=1
```

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
- Readers: `scanKnobReads(files, registry)` in `lib.ts` — `knobNumber/knobInt/knobBool/knobString/knobInts`,
  `useScopedKnobs({featurePrefix}) + .key === "…"`, `knob_int/knob_str/knob_bool/knob_decimal`
  (+ `*_sync`, `knob_raw_sync`), `scoped_knob_*`, the package family
  `usd_knob/int_knob/str_knob/float_knob/bool_knob` (`matrx_seo.knobs`, `matrx_batch.knobs`), and
  since 2026-09-13 the key-first (matrx-sandbox + the 0663 seams), feature-map, template, full-key
  and KNOB MIRROR families above. A reader missing here is invisible to orphans AND unregistered at
  once — add it here, once.
- matrx-sandbox: `collectSandbox()` — `orchestrator/orchestrator/*.py`, `implicitFeature` read from
  the helper's own `FEATURE = "…"` line; `{ files: null, why }` when absent, which the orphans guard
  prints as `[WARN]`.
- In-database readers: `dbReaders` — candidate `pg_proc` bodies and `pg_views` definitions that
  mention `knob` or a feature name (~770, fetched once), matched client-side on `'key'` beside its
  feature or on the qualified `feature.key` (`esign.config_resolve`'s address form).
