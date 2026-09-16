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
did not enforce the same rules: `-- chair-step:` was an owner-awake step in one and a `print`
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
| 2 | **SHAPE** | Empty file, `-- migrate: skip`, a self-written `public._schema_migrations` row, its own `BEGIN`/`COMMIT`, a statement needing autocommit. | both runners |
| 3 | **JUDGEMENT** | The header, the flag and the body — this document. | `migration-target.ts` / `migration_target.py` |

**Every glob in both runners is non-recursive**, so none of `rehearsal/`, `inverse/`,
`campaign/` or `judgment-corpus/` is ever swept by a release, a CI job or a cron.

## 2. The headers

| header | meaning | notes |
|---|---|---|
| `-- target: branch` | rehearsal only | `--target production` refuses it. |
| `-- target: production` | production only | `--target branch` refuses it. |
| `-- target: branch,production` | the campaign contract | Judged by the ALLOW-LIST **at both targets** — see §4. |
| *(no `-- target:` line)* | production-only by AMNESTY | Every migration written before `--target` existed. Judged by the DENY-LIST at production; reaches the branch only with `-- chair-step:`. |
| `-- additive: yes` | required by any header that names production | |
| `-- guard: <feature>/<key>` | required by any header that names production | `platform.feature_knob`'s key is two columns, so the form is `feature/key`. |
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
  mentions the thing that is supposed to hold it OFF.
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
   printed; a **non-TTY stdin is refused outright** (both release trains run exactly like that,
   on a 30-minute cron); a terminal must **type the filename back**; and the confirmed reason is
   written to `public._schema_migrations.chair_step` (the column is added idempotently by the
   path that writes it) so the record of who waived the additive rule, and why, outlives the
   terminal it was typed into.
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
  unless the SAME bytes carry a rehearsal ledger row there **and** that `--lane` holds its
  `campaign_watch.build_lock` row.

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
-- expect: branch=<accept|refuse:<code>> production=<accept|refuse:<code>>
```

A fixture with no `-- expect:` line fails the check — a fixture with no expectation is a fixture
nobody reviewed. The corpus covers every shape ATTACK-6 ran through the old blacklist, every
ATTACK-7 case, both positive controls (an ordinary migration, and a full campaign file using
every enumerated additive shape), and the command rules of §6 as flag cases the checkers invoke
for real. **These files are never applied to anything**: LOCATION refuses the directory at every
target in both runners.

**Changing a rule means changing this file, both runners and the corpus in the same commit.**
That is what the two checks enforce, and why they sit in both CI pipelines and both release
scripts.
