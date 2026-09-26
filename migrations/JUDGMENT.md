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

**The one closed door through the self-ledger refusal (lane LEDGER-LANE, 2026-09-23).** A file may
change the ledger's SHAPE in exactly one way: `alter table public._schema_migrations add column if
not exists <col> <type>` (and, in an inverse, `… drop column if exists <col>`), ONE column per
statement, for the seven attribution columns the runners themselves write — `applied_by_lane`,
`applied_by_os_user`, `applied_by_host`, `applied_by_session`, `applied_by_process`,
`applied_from_git_head` (all `text`) and `applied_in_window` (`boolean`). Those statements are
removed before `self_ledger` is read (`stripLedgerShapeStatements` in
`scripts/lib/ledger-attribution.ts`, `strip_ledger_shape_statements` in
`aidream/db/ledger_attribution.py`); every other ledger statement — another column, another type,
a row write riding beside the shape — still reads `self_ledger: yes` and is refused.
Fixtures `lg-01` … `lg-04`. Adding a name to that list is a runner change, made in both runners
and this file in the same commit.

### 1c. `-- draft: <owner> <reason>` — work in progress never reaches production (D351, 2026-09-26)

**Write every new migration with this line FIRST, and remove it only when the file is done**
(applied on the clone, inverse written, ready to ship). A lane committed an unfinished migration
into `migrations/` and the 30-minute release sweep shipped it to production; `migrations/` is the
swept directory, so a commit there IS a release request unless the file says otherwise.

- `--target production`, **sweep** (aidream runner, what both release trains run): the file is
  skipped and announced `held: draft by <owner>`; any later file that names an object the draft
  creates waits for it. Not a failure — work in progress is normal.
- `--target production`, **named** apply (`pnpm db:apply <file>`, aidream `--only`/`--rerun`):
  refused, exit 1, `--dry-run` included, with the one remedy: *remove the -- draft: line when
  it's ready*.
- `--target clone`: allowed — rehearsing work in progress is what the clone is for.
- 🚨 **A draft is never LEDGERED either, by any path** — `--mark-applied`, `--accept-drift`,
  aidream `db/detect_applied.py` (which runs before every aidream release sweep), and both
  runners' `--ledger-rebase` / `--amend-idempotent`. A row holding draft bytes makes the finished
  file look already applied, so its fix silently never runs (rca5d_j, 2026-09-26 22:44 PT: the
  scanner saw its function NAMES live and ledgered the draft). Likewise `detect_applied` no longer
  calls an untracked `CREATE OR REPLACE FUNCTION` file applied because the name exists: every body
  it writes must be the live body, or it stays pending for the applier.
- A ledger row that holds a DRAFT of the file, or was written by a ledger-only path
  (`duration_ms = 0`), makes `pnpm db:apply` say so and give the one action —
  `--reapply`, because those finished bytes never ran.
- A bare `-- draft:` (no owner) is still a draft. Read in the same 25-line header window as
  `-- retired:`; a later line is body text.

This is **not** a rehearsal gate: §6a stands (Arman, 2026-09-18 — the rehearsal copy drifts and
is never a precondition). The draft line is the author's own statement that the file is not
finished. Proof: `pnpm db:apply --draft-self-test` (spawns the real runner, RED then GREEN) and
aidream `uv run pytest db/tests/test_migration_draft_marker.py`.

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
| `-- target: branch` | rehearsal branch only | `--target production` AND `--target clone` both refuse it — it names one rehearsal database on purpose. |
| `-- target: clone` | dev-clone rehearsal only | `--target branch` and `--target production` refuse it. Rarely needed: a file naming production already rehearses on the clone. |
| `-- target: production` | production only | `--target branch` refuses it; `--target clone` ACCEPTS it, because the clone is production's own data (see §3a). |
| `-- target: branch,production` | the campaign contract | Judged by the ALLOW-LIST **at both targets** — see §4. |
| *(no `-- target:` line)* | production-only by AMNESTY | Every migration written before `--target` existed. Judged by the DENY-LIST at production **and at `--target clone`**; reaches the branch only with `-- chair-step:`. |
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

### 3a. `--target clone` — the third target, and why its rules are production's

The nightly dev clone (`common-docs/operations/clone/CLONE-REF`) is a Supabase DATA branch:
a **physical restore of production's cluster**, quarantined and refreshed nightly. So it is
judged as production is — allow-list, deny-list, guard-resolves-OFF, the inverse ground gate,
the campaign directory rules — with exactly three differences, each of which exists because the
clone is a *rehearsal* database and not because it is a *weaker* one:

1. **Header agreement.** A file rehearses here when it NAMES `production` or `clone`, or when it
   carries no `-- target:` line at all (production-only by definition). A `-- target: branch`
   file is refused by name.
2. **`-- chair-step:`** is ANNOUNCED here (reason + the whole body) but does not require
   `--confirm-chair-step`; that confirmation stays production-only.
3. **The ledger row is MARKED** `rehearsal_on`. The clone carries a physical copy of
   production's `public._schema_migrations`, so an unmarked rehearsal row is indistinguishable
   from a production apply — and the next nightly refresh restores production over it, which
   the mark says out loud.

🚨 **The identity is `(system_identifier, project ref)` TOGETHER.** A physical restore reports
its PARENT's `pg_control_system().system_identifier`, so the check that separates `branch` from
`production` cannot separate the clone from production in either direction. The runner therefore
refuses on the CONNECTION's project ref (pooler user `postgres.<ref>`, direct host
`db.<ref>.supabase.co`) before a socket opens, **and** on the server's own quarantine facts —
`pg_net` absent and no active `pg_cron` job, in conjunction, which is never true of production.
Proof: `pnpm db:apply --clone-self-test` (four REDs then a GREEN), also chained from
`--target-self-test`.

🚨 **BOTH RUNNERS HAVE IT** (lane RUNNER-CLONE-PY, 2026-09-22). The Python runner takes
`--target clone` with the same identity rule, the same refusals in both directions, the same
judgement and the same `rehearsal_on` mark:

```
uv run python db/apply_migrations.py --only <file> --target clone --no-generate
uv run python db/apply_migrations.py --clone-self-test     # the same four REDs, then GREEN
```

`pnpm check:migration-judgment` and `uv run python scripts/check_migration_judgment.py` now
compare every fixture at **three** targets, so a clone rule that moves in one runner and not the
other is a red test rather than a coin flip. A fixture states `branch=` and `production=`; its
`clone=` is DERIVED from its production verdict by this section's rule and is written out only
where the two genuinely differ (today: exactly one fixture,
`a7-05-insert-entity-types.sql` — minting a live entity token is about PRODUCTION's release
train, and a token minted in a copy the next refresh throws away does nothing to it).

One difference that is the Python runner's alone, because production's rule is unchanged:
`--source campaign` refuses `--rerun` at `branch` and `production` and ALLOWS it at
`--target clone`, because rule 27's third leg is exactly "apply these same bytes again over the
state the inverse left" and leg 1 has already ledgered them.

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
- At `--target production` the authorisation is (lane DB-TOOLS-NO-BRANCH, 2026-09-25): an explicit
  `--lane`; the `-- based-on:` hashes recomputed against production immediately before the file
  runs; and the PAIR (the file + its `migrations/inverse/<name>_down.sql`) read from the **dev
  clone's** ledger and printed — "ledgered on the clone, byte-identical", "DIFFERENT bytes", or "not
  ledgered" — as information only (§6a). `pnpm db:apply` prints it on `--dry-run` too. Until that
  date the runner read the **rehearsal branch** for a `campaign_watch.build_lock` row held by the
  lane; the branch was deleted 2026-09-26 00:30Z, so every campaign file was refused at production
  and lanes applied by hand. Proof: `pnpm check:campaign-auth:self-test`.
  *(Note, DB-TOOLS-NO-BRANCH 2026-09-25, closed same day by lane AIDREAM-RUNNER-NO-BRANCH:
  aidream's `db/apply_migrations.py` no longer reads the branch either. The old
  `_refuse_unauthorised_campaign_production` (its `branch_dsn` call was ~line 3559) is removed;
  `_report_campaign_clone_pair` reads the dev clone's ledger for the file + inverse pair and
  prints it — on `--dry-run` too — exactly as this runner does, and never refuses. Proof:
  `db/tests/test_campaign_production_authorisation_no_branch.py`, incl. a real `--target
  production --dry-run` run of the actual CLI.)*

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
- 🚨 **In aidream they live in `db/migrations/inverse/` and are named `inv_<up-name>.sql`, and
  the name is the slot guard's doing, not taste.** `public.migration_slot()` reads
  `0475_x_down.sql` as slot ` #0475` — the slot the UP already holds — so
  `public._schema_migrations_slot_guard` (and `_refuse_occupied_slot`, which mirrors it before a
  byte runs) refuses the very pairing that IS a down-migration; measured on the clone,
  2026-09-22: `MIGRATION SLOT COLLISION`, nothing executed. `inv_0475_...sql` resolves to
  `inv #0475` — the same number in its OWN series — so an inverse collides only with another
  inverse of the same file. Neither guard is weakened. The frontend's `<name>_down.sql` form is
  unchanged: those migrations carry no number series.
- 🚨 **The Python runner reaches them through `--source inverse`, and through nothing else.**
  Every glob in `db/apply_migrations.py` is non-recursive, so until 2026-09-22 `--only <name>`
  answered *"no migration matches"* for anything in `migrations/inverse/` and the only route to
  an aidream down-migration was `psql` by hand — no judgement, no refusals, no ledger row. The
  selector is shaped exactly like `--source campaign`: one named file at a time, `--target`
  must be NAMED, scanned by no sweep, check, `detect_applied.py` run or release.
  `uv run python db/apply_migrations.py --source inverse --only <file>.sql --target clone`.
- **On the dev clone the loop is ONE command, in either runner:**
  `pnpm db:rehearse <file> --target clone` (`scripts/rehearse-migration.ts`) or
  `uv run python db/rehearse_migration.py <file> --target clone` (`db/rehearse_migration.py`). It runs up → inverse → up, timing each leg, and before each
  of the first two it runs a MEASURE PASS — the statements one at a time inside one explicit
  transaction, `pg_locks` sampled from a second connection after each, then rolled back — so it
  prints the per-statement lock modes and flags every ACCESS EXCLUSIVE on a relation the file
  does not name. Every apply still goes through `pnpm db:apply --target clone`; the harness
  never writes outside its rolled-back measure pass. (`SET LOCAL application_name` goes INSIDE
  the transaction: the pooler runs in transaction mode and a name set outside can land on
  somebody else's backend — that mistake cost W1-ORG-PREP a whole measurement.)
  The Python harness asks the clone's ledger which flag names each leg: an EXISTING migration
  arrives already ledgered (the clone carries production's ledger), so its up runs through
  `--rerun`; a brand-new one runs through `--only`. Leg 3 is always `--rerun`.
  Proven end to end on `db/migrations/0475_files_owner_change_feed_index.sql` +
  `db/migrations/inverse/inv_0475_files_owner_change_feed_index.sql`, 2026-09-22: up 7 128 ms →
  inverse 5 652 ms → up again 6 906 ms, the index dropped and rebuilt, both ledger rows carrying
  `rehearsal_on`, and the `DROP INDEX` measured taking ACCESS EXCLUSIVE on `files.files` (282 775
  rows) — which is the number that belongs in the chair step's notes.

## 8. The refusal vocabulary

Both runners carry these as stable codes (`TargetRefusal.code`), separately from their prose.
The corpus compares codes; the prose is for the human at 3 a.m. and may differ.

| code | when |
|---|---|
| `header-target-unknown` | `-- target:` names something that is not `branch`/`clone`/`production` |
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
| `clone-ref-missing` / `clone-ref-unreadable` / `clone-ref-incomplete` | `--target clone` with no readable `CLONE-REF` — a connection that cannot be PROVEN to be the clone is never treated as the clone |
| `clone-configured-not-the-clone` | `--target clone` against a connection whose project ref is not the clone's (caught before a socket opens) |
| `production-is-the-clone` | `--target production` against the clone's own connection — the server-side check cannot catch this one |
| `clone-server-not-quarantined` | `--target clone` and the server has `pg_net` or an active `pg_cron` job, so it is production |
| `production-server-is-quarantined` | `--target production` and the server is a quarantined copy |
| `clone-dsn-not-the-clone` / `clone-dsn-malformed` / `clone-password-missing` | the clone's own connection variables (`CLONE_DATABASE_URL`, or `CLONE-REF` + its password file); there is no fallback to `SUPABASE_MATRIX_*` |

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
