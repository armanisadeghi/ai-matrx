# JUDGMENT — the ONE judgement both migration runners apply

**This file is normative.** Two runners execute migrations for this platform —
`pnpm db:apply` (`matrx-frontend/scripts/apply-migration.ts` + `scripts/lib/migration-target.ts`)
and `uv run python db/apply_migrations.py` (`aidream/db/apply_migrations.py` +
`db/migration_target.py`). They must return **the same verdict for the same bytes at the same
target, always**. Where this file and either implementation disagree, this file is the
specification and the implementation is the defect.

**It is enforced, not asserted.** `migrations/judgment-corpus/` holds fixture migrations, each
carrying the verdict it must receive at each target, and
`pnpm check:migration-judgment` / `uv run python scripts/check_migration_judgment.py` run the
whole corpus through **both** runners' `--judge-only` mode and fail on any disagreement — with
each other, or with the fixture. Both are in both repos' CI and in both `release.sh`: **a
release halts when the judges disagree.**

**Why it exists.** ATTACK-7 (2026-09-16) found the campaign had two sanctioned runners and they
did not enforce the same rules: `-- chair-step:` was a confirmed step in one and a `print`
statement in the other — the one both release trains execute; a header naming production was
judged by an allow-list in one and waived by a comment line in the other, so the abort
checklist's only production undo ran on one command and was refused by the other; and
`--source campaign` demanded its target in one and defaulted to PRODUCTION in the other. Every
"both runners" sentence in the build book was a coin flip decided by which command a tired lane
typed at 3 a.m.

---

## 1. The three layers, in order

A file passes **LOCATION**, then **SHAPE**, then **JUDGEMENT**. Only the third is what
`--judge-only` and the corpus cover; the first two are named here so nobody mistakes the
corpus for the whole runner.

| # | layer | what it decides | where |
|---|---|---|---|
| 1 | **LOCATION** | Which directory the file sits in, before a header is read: `migrations/rehearsal/` is refused at `--target production`; `migrations/campaign/` is reachable **only** by `--source campaign`; `migrations/judgment-corpus/` is refused at **every** target, on every apply path; `migrations/inverse/` is swept by nothing and named with `--only`. | both runners |
| 2 | **SHAPE** | Empty file, `-- retired:` (§1b), `-- migrate: skip`, a self-written `public._schema_migrations` row, its own `BEGIN`/`COMMIT`, a statement needing autocommit. | both runners |
| 3 | **JUDGEMENT** | The header, the flag and the body — this document. | `migration-target.ts` / `migration_target.py` |

**Every glob in both runners is non-recursive**, so none of `rehearsal/`, `inverse/`,
`campaign/` or `judgment-corpus/` is ever swept by a release, a CI job or a cron.

### 1a. The statement detectors read SQL, never prose

Layer 2 asks three questions of the bytes: does the file write the ledger itself, does it carry
its own transaction control, does it need an autocommit session. **Every one of those questions
is asked of the file with its comments, its single-quoted literals and its dollar-quoted bodies
removed** — one stripper per runner, used by all three. Words in a comment, in a string, in a
function body or in a `$tag$ … $tag$` body are prose: they are not statements the migration
executes, and a detector that refuses a file over them is wrong. A real top-level statement is
still seen, and that is what the refusal is for.

On 2026-09-17 this was measured the other way round: `CREATE INDEX CONCURRENTLY` inside a
function's own HINT text made `pnpm db:apply` refuse a file that needed no autocommit at all.
Both runners now print `autocommit`, `txn_control` and `self_ledger` on every `--judge-only`
line, so the corpus holds them to the same reading.

### 1b. `-- retired: <why>` — frozen history that may never execute again

An already-ledgered file is **never re-judged**: its bytes are frozen history, and that is
what makes `--reapply` (frontend) and `--rerun` (aidream) work at all. That cuts both ways.
A file that REPLACED a live function body which has since been replaced again still carries
the OLD body, so re-executing it reverts whatever replaced it — silently, with every check
green. It is the `billing.plan_status` class with the `-- based-on:` line removed from the
picture: not a stale declaration, but a *correct* file whose whole content is superseded.

Measured 2026-09-20: `migrations/cvx_list_scoped_audience.sql` still carried the
pre-`chat.conversation_lane` `public.cvx_audience`, which restated the classification rules
instead of deriving them. One `--reapply` would have reverted the live rule.

**The marker.** A first-column comment line in the file's first 25 lines:

```
-- retired: <why, one line — name what superseded this file>
```

There is no bare form: the reason is required, because the refusal hands the next lane the
file that is actually current.

**What both runners do with it.**

- `pnpm db:apply` refuses the file at **every** target, on **every** path, before anything
  else it does with the bytes. `--reapply` is not a key for it, `--dry-run` does not soften
  it, and it is read **before** the header checks, so a confirmed `-- chair-step:` never
  reaches it.
- `db/apply_migrations.py` refuses `--rerun`, `--only` and `--mark-applied` on one by name
  (marking would assert that superseded bytes are what is live), and refuses the whole run
  when an **unledgered** retired file turns up in a swept directory, rather than skipping it
  quietly.
- **The one thing still allowed is `--accept-drift`**, which executes nothing. Marking a file
  changes its bytes, so a retired file reports as `DRIFTED` — informational in both runners
  (`pnpm check:migrations` exits 0 on drift in every mode, `--strict` included), never a
  failure, and never a reason to re-stamp or re-run anything.

**The remedy is never "remove the marker".** If those changes genuinely must run again, that
is a NEW migration — a new file, judged and ledgered on its own bytes. Deleting the marker to
re-run the old bytes is the exact defect it exists to stop.

**Proven, not asserted.** `pnpm db:apply --self-test` carries the arm: a marked file is
refused unledgered, refused under `--reapply`, refused with a CONFIRMED chair step, and
refused again once ledgered — while the SAME bytes without the marker apply normally (remove
the refusal and six assertions go red). On the aidream side,
`db/tests/test_retired_migrations_never_re_execute.py` pins the same five properties with no
database (remove `_reject_if_retired` and four go red).

**Currently retired (2026-09-20), all ten superseded by
`cvx_audience_derives_from_the_lane_classifier.sql`:** `cvx_list_scoped_audience.sql`,
`cvx_list_facets_external_breaks_down_by_tool.sql`, `cvx_list_scoped.sql`,
`cvx_list_scoped_canonical_favorites.sql`, `public_list_scoped_invoker_dd137c2.sql`,
`cvx_provider_account_display_is_one_function.sql`,
`cvx_list_scoped_search_admits_every_scored_identity.sql`,
`cvx_list_scoped_deep_search_is_one_indexed_pass.sql`,
`cvx_deep_hits_is_a_definer_probe.sql`, `cvx_deep_hits_once_per_request.sql`. Each holds a
`public.cvx_audience`, `public.cvx_list_scoped` or `public.cvx_list_facets` body that the
live catalogue no longer holds (verified against `pg_get_functiondef`).

**This is a SHAPE rule, not a JUDGEMENT one**, so it carries no `TargetRefusal.code` and the
corpus in §9 does not cover it — exactly like `-- migrate: skip`. Its forcing functions are
the two named above.

## 2. The headers

| header | meaning | notes |
|---|---|---|
| `-- target: branch` | rehearsal only | `--target production` refuses it. |
| `-- target: production` | production only | `--target branch` refuses it. |
| `-- target: branch,production` | the campaign contract | Judged by the ALLOW-LIST **at both targets** — see §4. |
| *(no `-- target:` line)* | production-only by AMNESTY | Every migration written before `--target` existed. Judged by the DENY-LIST at production; reaches the branch only with `-- chair-step:`. |
| `-- additive: yes` | required by any header that names production | |
| `-- guard: <feature>/<key>` | required by any header that names production | `platform.feature_knob`'s key is two columns, so the form is `feature/key`. A line that is only an identifier (`-- guard: custom`) is still this directive and is refused as malformed. A sentence that happens to start with "Guard:" — a test path, a witness command — is prose, not a directive, and is ignored. |
| `-- seeds-guards: yes` | stands in for `-- guard:` for the ONE file that seeds the knob register | Bounded to `platform.feature_knob`, `platform.knob_override`, `platform.knob_rung_lock`; may not also carry `-- guard:`; may not create a trigger. |
| `-- allows: revoke <schema>` | the ONE bounded escape from "a REVOKE" | Schema may not be protected; EVERY `REVOKE` in the body must stay inside it; the file still needs `-- additive: yes` and `-- guard:`; an unused exemption is refused. |
| `-- chair-step: <why ≥ 12 chars>` | the HEADER-LESS route for anything non-additive by construction | Waives the deny-list on a header-less file; **waives nothing on a header that names production**, where carrying both is refused. See §5. |
| `-- based-on: <schema>.<fn>(<args>) <sha256>` | declares the live body a `CREATE OR REPLACE FUNCTION` was written against | DD-220. Required for a replacement; a new function needs none. |

## 3. What the flag decides, and what it does not

Only three rules depend on `--target`. **Everything else is a property of the FILE**, so a
branch rehearsal returns the verdict production will give — which is the entire point of
rehearsing.

1. **Header vs flag agreement** (`header-flag-disagree`, `branch-needs-target-header`).
2. **The header-less path**: at `--target production` the DENY-LIST judges an unledgered file;
   at `--target branch` a header-less file is refused unless it carries `-- chair-step:`.
3. **`INSERT INTO platform.entity_types`**: allowed at `--target branch` (a rehearsal fixture),
   refused at `--target production` (it mints a live entity token, reds
   `pnpm check:entity-types` — which halts the frontend release train for every unrelated
   lane — and `W1-REG`'s own `must not touch` forbids it).

An **already-ledgered** file is frozen history and is never re-judged on the header-less path.
`--judge-only` always judges as `already_ledgered: false`, because a fixture has never run.

## 4. The ALLOW-LIST — a file whose header NAMES production

Every statement must be one of these. Anything else is refused **with the statement quoted**
(`not-additive`). A shape nobody enumerated is refused rather than ignored: that is the only
direction a safety scan may fail in.

- `CREATE SCHEMA` / `TABLE` / `TYPE` / `INDEX` / `SEQUENCE` / `VIEW` (not `OR REPLACE`) /
  `TRIGGER` (not `OR REPLACE`) / `SEQUENCE`
- a **NEW** function or procedure, or a `CREATE OR REPLACE` that declares its `-- based-on:`
- `CREATE POLICY` whose predicate is **not** literally `true` (policies are OR'd)
- `ALTER TABLE … ADD COLUMN` (nullable or defaulted) / `ADD CONSTRAINT … NOT VALID` /
  `ENABLE ROW LEVEL SECURITY` / `FORCE ROW LEVEL SECURITY`
- `INSERT` into a registry table: `platform.feature_knob`, `platform.knob_override`,
  `platform.knob_rung_lock`, `platform.entity_types` *(branch only, §3.3)*,
  `platform.entity_relationships`, `platform.client_callable_door`,
  `campaign_watch.build_lock`, `campaign_watch.go_signal_capture`
- `INSERT INTO custom.<table>` — a data row in schema `custom`, under the four bounds in §4c
- `ALTER DEFAULT PRIVILEGES … REVOKE`
- `REVOKE`, only under a proven `-- allows: revoke <schema>`
- `COMMENT ON`
- `SET` of `lock_timeout`, `statement_timeout`, `idle_in_transaction_session_timeout`

**Refused by name, every time:** every `GRANT` (the OFF switch's boundary IS the absence of
these), every `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, `ALTER TYPE … ADD VALUE`,
`ALTER COLUMN … TYPE`, `SET NOT NULL` on an existing column, `DISABLE`/`NO FORCE ROW LEVEL
SECURITY`, `ALTER TABLE … DISABLE TRIGGER`, `ALTER POLICY`, `ALTER DEFAULT PRIVILEGES … GRANT`,
`ALTER FUNCTION … SECURITY DEFINER`, `CREATE OR REPLACE VIEW|TRIGGER`, and every `DO` block (it
builds DDL at run time, so the allow-list cannot read what it will execute).

### 4a. Two guard rules on top of the shapes

- **A guarded body must READ its guard** (`guard-unread`). A `CREATE OR REPLACE` of a live
  definition, or a `CREATE POLICY`, whose body never names the `-- guard:` feature **and** key
  is refused. Static: it cannot prove the read is on the right branch; it proves the body
  mentions the thing that is supposed to hold it OFF. **One exemption, the same one the
  trigger rule below already carries: a `CREATE OR REPLACE FUNCTION | PROCEDURE` whose name is
  qualified into schema `custom`.** Nothing reads that schema until the switch — it is revoked
  from every client role, absent from `pgrst.db_schemas` and absent from the ORM — so there is
  no live path whose body such a statement could replace, which is the whole defect this rule
  closes (`public._provision_new_user_personal_org()`, which every signup executes). An
  **unqualified** name is outside `custom`, because `search_path` settles it at execution time.
  **The exemption does NOT cover a FUNCTION whose RETURNS clause names `trigger` or
  `event_trigger`.** Postgres resolves a trigger's function by OID at fire time, not by schema
  privilege: once a `custom.*` function is bound with `CREATE TRIGGER … EXECUTE FUNCTION
  custom.fn()` on a live table (the trigger rule below's own exemption lets that binding
  exist), it is a live path regardless of what is revoked from schema `custom`, and a later
  `CREATE OR REPLACE FUNCTION custom.fn() RETURNS TRIGGER …` replaces the body that path
  executes — the exact shape this rule exists to catch. A return type that cannot be
  determined statically is treated as `trigger`: the exemption is never granted on an unproven
  negative. The exemption is deliberately NOT extended to `CREATE POLICY` (a policy decides row
  access the moment the switch flips) or to `CREATE OR REPLACE TRIGGER` (which binds behaviour
  rather than replacing a body), so no verdict already fixed by a fixture moves. `CREATE OR
  REPLACE VIEW` carries no arm here at all — it is refused by name in the allow-list below at
  every target, unconditionally, before a file's statements ever reach this rule. Fixtures:
  `a6-15-guard-unread-replace-in-custom.sql` (an ordinary custom function) and
  `a6-19-…-returns-trigger.sql` (a guarded trigger-returning one) accept;
  `a6-16-…-outside-custom.sql`, `a6-17-…-unqualified.sql`, and
  `a6-18-…-custom-returns-trigger.sql` (the same trigger-returning function, unguarded) refuse;
  `a6-13-guard-unread-by-policy.sql` still refuses a policy on a `custom` table.
- **A new trigger on a live table must name its guard** (`trigger-guard-unnamed`). A
  `CREATE TRIGGER` on a table **outside schema `custom`** — an unqualified table counts as
  outside, since `search_path` decides it at execution time — requires the guard's feature and
  key to appear in the file. Two allow-listed statements (a new function, a new trigger) are
  otherwise a changed production write path that fires on every INSERT or UPDATE the table
  takes while the additive scan, the guard header and `assert_guard_resolves_off` all read
  green. Schema `custom` is exempt: nothing reads it until the switch. A
  `-- seeds-guards: yes` file may not create such a trigger at all.

### 4b. The DENY-LIST — a header-LESS, unledgered file at `--target production`

An allow-list here would refuse every ordinary migration every other lane writes
(`GRANT EXECUTE ON FUNCTION … TO authenticated` is in hundreds of them), so the header-less
path keeps a deny-list: `DROP`, `REVOKE`, `ALTER TYPE … ADD VALUE`, `ALTER COLUMN … TYPE`,
`SET NOT NULL`, `TRUNCATE`, `DELETE FROM`, `CREATE POLICY … USING (true)`, `DISABLE ROW LEVEL
SECURITY`, `NO FORCE ROW LEVEL SECURITY`, `ALTER TABLE … DISABLE TRIGGER`, `ALTER POLICY`,
`ALTER DEFAULT PRIVILEGES … GRANT`, `ALTER FUNCTION … SECURITY DEFINER`. `GRANT` is
deliberately **not** on it. `-- additive: yes` and `-- guard:` are **not** required here: they
are the campaign's contract, and demanding them of every repo migration buys nothing.

### 4c. The CUSTOM-DATA INSERT

`INSERT INTO custom.<table>` is an enumerated additive shape at **both** targets, and is
accepted only when **all four** of these hold. Any one of them missing is `not-additive`,
with the statement quoted.

1. **The schema is exactly `custom`, written plainly.** No quoting anywhere in the
   reference, so `"custom.record"` (one identifier, in whatever schema `search_path`
   picks) and `"Custom".record` (a different schema — quoting keeps the capital) are
   refused; `customx.<table>` is refused; `custom` as a TABLE name in another schema
   (`platform.custom`) is refused. Never `platform`, `iam`, `public`, or any of the
   eighteen protected schemas.
2. **The file's guard is a `custom/…` knob** — `-- guard: custom/system_enabled` or
   another key of that feature — plus `-- additive: yes`, which any header naming
   production already requires. The claim that the row is unreachable IS that switch.
3. **The row's source is `VALUES`, constants, or a `SELECT` that reads only `custom.*`.**
   An `INSERT … SELECT` naming any relation outside `custom` is refused: it copies
   customer data into the table whose entire safety argument is that it holds nothing yet.
4. **`ON CONFLICT` may only be `DO NOTHING`.** `DO UPDATE` rewrites rows that are already
   there, which is an `UPDATE`.

`UPDATE` and `DELETE` on `custom.*` are **not** on the allow-list and stay refused at
production; an inverse is a chair step. Nothing else about `custom` is loosened —
`select platform.create_entity_table(…)` and `INSERT INTO platform.entity_types` at
production are refused exactly as before.

Why this shape is additive in the judgement's own sense: schema `custom` is created by
this campaign, revoked from `PUBLIC`, `anon`, `authenticated` and `service_role` (default
privileges included), absent from `pgrst.db_schemas`, and guarded by
`custom/system_enabled` — so a row written there is reachable by no client, and the file's
stored inverse removes it.

**It announces itself.** Both runners print the accepted statements, exactly as a used
`-- allows: revoke` exemption is printed, and `--judge-only` carries their count
(`custom_inserts`) so the two runners must agree on it too.

## 5. `-- chair-step:` — the header-less route, and the only unattended-proof escape

1. It is the route for anything **non-additive by construction**: an inverse, a `GRANT`, an
   enum value, a teardown.
2. **A file carrying both `-- chair-step:` and a `-- target:` header that names production is
   REFUSED** (`chair-step-names-production`), at both targets. The waiver is gone: one of the
   two lines would do nothing, and which one used to depend on the runner.
3. On a **header-less** file it suppresses the deny-list, and nothing else. The
   revoke-containment check is never suppressed.
4. **At `--target branch`** a header-less `-- chair-step:` file is ACCEPTED — that is how its
   inverse gets rehearsed (rule 27) and how switch-checklist step 3's `GRANT` gets a rehearsal
   at all, from the **same bytes** that later reach production.
5. **At `--target production`, in BOTH runners:** the reason and the file's **entire body** are
   printed, and the file runs **only when the command NAMES it** —
   `--confirm-chair-step <file.sql>`, exact basename. A sweep never passes that flag, so a sweep
   can never run one; nothing is interactive and no terminal is involved. The confirmed reason is
   written to `public._schema_migrations.chair_step` (the column is added idempotently by the
   path that writes it) so the record of who waived the additive rule, and why, outlives the
   command that named it.
   🚨 **WHO RUNS IT (Arman, 2026-09-18):** *"The block is not so that my top agent doesn't do
   it... the block is to ensure that the little agents (sonnet 5 or gpt luna) don't do it and they
   go to the bigger models... Opus, Fable / Sol, Astra -- never going to me! I don't do
   terminals."* The senior session that owns the work names and runs it. A smaller lane hands it
   UP to the session that dispatched it. **It is never handed to Arman.** Until 2026-09-18 this
   rule demanded a human at a TTY typing the filename (ATTACK-6 finding 4); agents have no
   terminal, so every drop became a command for the owner, and one unapplied chair step in the
   swept directory halted every unattended release.
   **In a sweep** (aidream's runner) an unnamed chair step is SKIPPED LOUDLY — unapplied,
   unledgered, exit code untouched — so it can never stop the files behind it. Named explicitly
   and still unconfirmed, it is an error.
6. A chair step is never reached by a SWEEP: it lives in `migrations/inverse/` (or is named with
   `--only`), and nothing scans that directory.

## 6. `--source campaign` — the command, not the file

`migrations/campaign/` is reachable only by the plan's own command, in **both** runners:

```
pnpm db:apply migrations/campaign/<file>.sql --source campaign --target branch|production --lane <lane>
uv run python db/apply_migrations.py --source campaign --only <file>.sql --target branch|production --lane <lane> --no-generate
```

- `--target` must be **NAMED**. `production` is the runner default for every migration written
  before `--target` existed; **a campaign file never inherits a default**, because the default is
  the database that must not be reached by accident.
- `--only` (aidream) / one named file (frontend), `--lane <id>`, and nothing else: no campaign
  sweep exists.
- The flag is an assertion about the file, checked both ways: a file in `campaign/` applied
  without `--source campaign` is refused by LOCATION, and `--source campaign` naming a file
  elsewhere is refused too.
- Refused with `--check`, `--rerun`, `--mark-applied`, `--accept-drift`, `--all` and both
  self-tests.
- At `--target production` the runner additionally reads the **rehearsal branch** and refuses
  unless that `--lane` holds its `campaign_watch.build_lock` row there. That is concurrency
  control between lanes (§4.14), not a rehearsal claim.

### 6a. 🚨 THE REHEARSAL COPY IS NOT A GATE (owner ruling, 2026-09-18)

**A file may be applied to the main database WITHOUT a prior rehearsal ledger row and WITHOUT a
matching rehearsal checksum.** Both runners used to refuse a campaign production apply unless the
branch carried a `public._schema_migrations` row for the same basename whose checksum was
byte-identical to the file about to run. That refusal is removed from both. The rehearsal row is
still read and printed — "not rehearsed on the copy", "rehearsed with DIFFERENT bytes", or
"rehearsed, byte-identical" — as **information on the apply line, never a verdict**.

The owner's words: *"we have no production. It's all just dev… All of your work should just go
live… Caution is dangerous right now."* The copy exists to catch a syntax error quickly. It is
not a precondition, and a lane that cannot rehearse on it — because the copy has drifted, because
`platform.provision` refuses there, because another lane moved a fingerprint it has not
re-recorded — is not blocked from landing on the main database.

**Nothing about the STATEMENTS moved.** Every judgement in §§2–5 still binds every file at every
target: the additive ALLOW-LIST for a header naming production, the deny-list for a header-less
file, `guard-unread` and `trigger-guard-unnamed`, the named-by-the-command `-- chair-step:` class
(`--confirm-chair-step`, still logged to the ledger), and the
`-- based-on:` hash check — which was never a branch check at all: it recomputes
`pg_get_functiondef` on **the database being applied to**, immediately before the file executes.
Removing the copy as a gate removes exactly one thing: the requirement that the copy saw these
bytes first.

This changes no `TargetRefusal.code`, so the corpus in §9 is unchanged by it: the rehearsal gate
was a runtime authorisation read against a live branch, never part of `--judge-only`, and both
checks still agree line for line.

## 7. Inverse files

- They live in `migrations/inverse/`, which nothing sweeps, so they carry no `-- migrate: skip`
  marker (a skip marker would make them unrunnable by every path, which is how the abort
  checklist lost its route once already).
- They are **header-less + `-- chair-step: <why>`** — never `-- target: …production` (§5.2).
- They are ledgered by BASENAME, like every file in `rehearsal/`, `inverse/` and `campaign/`.
- Rule 27's loop: apply the up on the branch twice with the same result, run the inverse on the
  branch, re-apply the up — all with `--target branch`, all from the bytes production will see.

## 8. The refusal vocabulary

Both runners carry these as stable codes (`TargetRefusal.code`), separately from their prose.
The corpus compares codes; the prose is for the human at 3 a.m. and may differ.

| code | when |
|---|---|
| `header-target-unknown` | `-- target:` names something that is not `branch`/`production` |
| `header-guard-malformed` | `-- guard:` is not `<feature>/<key>` |
| `header-allows-unknown` | an `-- allows:` clause that is not `revoke <schema>` |
| `header-allows-revoke-protected` | the exemption names a protected schema |
| `header-allows-revoke-two-schemas` | two `-- allows: revoke` lines |
| `header-chair-step-no-reason` | `-- chair-step:` shorter than a sentence |
| `branch-needs-target-header` | `--target branch` on a header-less file with no chair step |
| `header-flag-disagree` | the header and the flag name different databases |
| `headerless-non-additive` | the deny-list, on an unledgered header-less file at production |
| `chair-step-names-production` | `-- chair-step:` together with a header naming production |
| `production-not-declared-additive` | a header naming production without `-- additive: yes` |
| `production-no-guard` | …without `-- guard:` or `-- seeds-guards: yes` |
| `seeds-guards-with-guard` | both `-- seeds-guards: yes` and `-- guard:` |
| `seeds-guards-out-of-bounds` | a register file writing outside the knob register |
| `not-additive` | the allow-list, with the offending statement quoted |
| `guard-unread` | a replaced live definition or policy whose body never names its guard |
| `trigger-guard-unnamed` | a new trigger on a live table outside `custom` that never names its guard |
| `revoke-exemption-unused` | `-- allows: revoke` with no `REVOKE` in the body |
| `revoke-exemption-uncontained` | a `REVOKE` that leaves the named schema |

## 9. The corpus

`migrations/judgment-corpus/*.sql`. Every fixture's first line is

```
-- expect: branch=<accept|refuse:<code>> production=<accept|refuse:<code>> [autocommit=yes] [txn_control=BEGIN] [self_ledger=yes]
```

The two target words are required. The three statement-detector words (§1a) are optional and
default to the quiet answer — `autocommit=no`, `txn_control=-`, `self_ledger=no` — so a fixture
states one only when the file really carries that statement.

A fixture with no `-- expect:` line fails the check — a fixture with no expectation is a fixture
nobody reviewed. The corpus covers every shape ATTACK-6 ran through the old blacklist, every
ATTACK-7 case, the custom-data INSERT's accepted forms and every near miss §4c names
(`customx`, a quoted `"custom.record"`, `"Custom".record`, `platform.custom`, a SELECT out of a
live schema, an upsert, and `UPDATE`/`DELETE` on `custom.*`), both positive controls (an
ordinary migration, and a full campaign file using every enumerated additive shape), and the
command rules of §6 as flag cases the checkers invoke
for real. **These files are never applied to anything**: LOCATION refuses the directory at every
target in both runners.

**Changing a rule means changing this file, both runners and the corpus in the same commit.**
That is what the two checks enforce, and why they sit in both CI pipelines and both release
scripts.
