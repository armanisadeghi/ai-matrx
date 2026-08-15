---
status: active
updated: 2026-08-14
repos: [matrx-frontend, aidream]
vision:
  - /Users/armanisadeghi/code/common-docs/systems/db-rules/FEATURE.md
  - /Users/armanisadeghi/code/common-docs/policies/unfinished-work-alarm.md
  - /Users/armanisadeghi/code/common-docs/policies/database-changeover-doctrine.md
---

# Component Ownership Law + base-contract enforcement

Canonical RLS is now correct **by generator**. It is not yet correct **by guard** — nothing
fails when someone re-drifts it. That gap is this handoff.

## Vision — Arman's words

On why `created_by` on a component was the bug (2026-08-14):

> "`created_by` is doing two different jobs, and they only safely coincide on an entity.
> On an **entity**, the creator *is* the owner, so one column legitimately serves as both
> audit stamp and access key. On a **component**, the actor and the owner come apart — the
> actor is whoever acted, the owner is the parent — so the same column can't serve both,
> and if it's used for access you get exactly this bug."

> "the 'who made this row' audit question is *already answered* for every row by
> `history.row_versions` via `_stamp_actor`/`_version_capture`. So a component doesn't need
> `created_by` for provenance either — the ledger has it."

> "**So there is no legitimate reason for a component to have an access-bearing `created_by`.
> Ever.** The moment a sub-row needs its own owner with independent access, it isn't a
> component — it's an entity in a containment relationship, and you should have chosen that
> variant."

> "**Neutralize the column, don't force auth.uid().** ... a component's `created_by` is always
> set from its parent's `created_by`, re-derived if it's ever reparented. ... Do **not** stamp
> `auth.uid()` (that's the entity fix)."

> "Where a component's `created_by` carries no domain meaning, drop it — the history ledger
> already records the real actor, so nothing is lost. Where 'who acted' is genuinely
> meaningful (message sender), rename it to an explicit author column that never appears in
> a policy."

> "**Codify the rule so this can't recur** ... 'component ⇒ no owner column, no own visibility,
> access = parent' becomes written canon with a conformance check that fails any component
> policy referencing `created_by`."

> "The most important thing is to DOCUMENT THE SHIT out of this so this question and problems
> like this NEVER come up again!"

On GRANTs (2026-08-14):

> "GRANTs are not where openness is decided — RLS is. Make the GRANTs uniform-by-variant from
> the canonical generator so the policies you already wrote can actually run; the only thing
> to verify first is that no table has been quietly relying on a missing GRANT instead of a
> real policy."

> "Any table that's currently protected only by a missing GRANT — RLS off, or no policy — must
> not have GRANTs widened until its policy exists. Fix those as genuine holes; they're not
> 'closed,' they're one migration away from wide open."

> "`files.file_versions` isn't a special case, it's the first table the fixed generator repairs.
> ... Don't hand-patch it; let the generator that's now correct do it, and it validates the
> whole approach."

> "a conformance check fails any active table whose GRANTs don't match its variant. Same
> discipline as the created_by corollary: write the boring rule down so the next agent can't
> re-drift it."

On the newer findings (2026-08-14), verbatim:

> "organization_id nullable is back on 32 tables. These even include new tables, which should
> NEVER break our rules!!!!! ... New tables are being created without the invariant. This is
> the clearest regression signal in the whole audit. How did the system even allow for this?
> How did ANYONE get by without 5,000 alarms going off?"

> "122 unregistered base tables across canonical schemas. The registry is no longer complete,
> which undermines rule #1 — nothing is real unless registered."

> "2 components carry their own visibility column, which by definition they shouldn't have.
> We need to determine if they need to become entities or If the columns are to be removed or
> if there is something else wrong and then fix all of the related code."

## Resources

- **Canon (read first):** `common-docs/systems/db-rules/FEATURE.md` §2 (base entity),
  §6a/6a-1 (visibility), §6d (RLS variants), **§6d-1 THE COMPONENT OWNERSHIP LAW**,
  **§6d-2 variant-keyed GRANTs + THE SAFETY RAIL**.
- **Generator (live):** `iam.apply_rls(schema, table, token, variant)` and
  `iam.apply_table_grants(schema, table, variant)`. Source of both:
  `migrations/iam_apply_rls_v3_component_no_created_by_and_variant_grants.sql`.
- **Provisioner:** `platform.create_entity_table` — does NOT yet call `apply_table_grants`.
- **Trigger functions:** `platform._stamp_actor` (⚠️ writes `NEW.updated_by`
  *unconditionally*), `platform._touch_row`, `platform.inherit_org_from_parent`.
- **Guards that exist:** `ddl_guard` event trigger + `platform.ddl_guard_log`;
  `iam.verify_canonical` / `verify_canonical_ok` / `canonical_certify_ok`.
- **Defects:** `FOUND_DEFECTS.md` D182 (component RLS remainder), **D184** (6 RLS holes),
  D183 (accessible_entity_ids materialization class).
- **DB access without the Supabase MCP** (it is often unauthenticated in agent sessions):
  aidream's `.env` has `SUPABASE_MATRIX_*`; connect via the pooler and use
  `aidream/db/pooler_session.py` — `guarded(conn)` for your own work (it pins one
  transaction, runs `RESET ROLE`, and PROVES `current_user = session_user` before
  anything else; a bare `reset role;` on its own repairs only whichever server
  connection happened to receive it, because routing is per-transaction).
- 🚨 **Checking RLS as another role? Use `impersonate(conn, "authenticated")`, NEVER a bare
  `SET ROLE`.** `SET ROLE` is unscoped: on the transaction pooler the server connection goes
  back to the pool still wearing that role, and the next client — a scheduled job, a release,
  another agent — runs as `authenticated` and dies on `permission denied`, or silently reads a
  privilege-filtered `information_schema` and writes the shortfall down as fact. This is not
  hypothetical: it is the *entire* source of the contamination defect (aidream `FOUND_DEFECTS`),
  traced to ad-hoc verification SQL exactly like the kind this handoff asks you to run.
  `impersonate()` uses `SET LOCAL ROLE` inside a transaction, which cannot outlive it.
- **Deciding whether something EXISTS? Read `pg_catalog`, never `information_schema`** — the
  latter is privilege-filtered, so it reports real objects as absent under an unexpected role.
  See `aidream/packages/matrx-orm/matrx_orm/catalog_sql.py`.

## Remaining work

1. **Conformance checks — the whole point of this handoff.** The law is enforced only by the
   generator; nothing fails if someone hand-writes a policy or a table drifts. Add checks that
   FAIL (loud, per repo doctrine: scream, don't block builds) on:
   - any `rls_variant='component'` policy whose expression references `created_by`;
   - any active registered table whose `authenticated` GRANTs don't match its variant
     (§6d-2 table);
   - any active registered table with `organization_id` NULLABLE (base contract);
   - any base table in a canonical schema with no `platform.entity_types` row;
   - any table with RLS off or zero policies (the D184 class).
   Home: extend `iam.verify_canonical` (DB-side, so aidream + frontend share it) and surface it
   in the frontend via a `pnpm check:*` + an admin scoreboard route, matching how
   `check:dead-ends` / `check:unwired` already work.

2. **`platform.create_entity_table` must call `iam.apply_table_grants`** so the create path and
   the repair path cannot disagree. One line + a migration.

3. **Neutralize surviving component `created_by` values** with a parent-derived trigger (derive
   from the parent's `created_by`, re-derive on reparent). **Not** `auth.uid()`. Low urgency —
   no policy reads the column any more — but do it before step 4.

4. **Then drop/rename.** Drop component `created_by` where it carries no domain meaning; where
   "who acted" is real (message sender), rename to `sender_id`/`author_role` that never appears
   in a policy. Touches generated types (`pnpm db-types`) and aidream models
   (`python db/generate.py`) — do them in the same change.

5. **D184 — 6 tables protected only by a missing GRANT.** `ui.ui_surface` (RLS DISABLED with
   full `SIUD` granted — live hole), `agent.card` (RLS disabled, SELECT granted),
   `batch.cost_event`, `public.system_error`, `public.system_write_failure`,
   `runtime.global_origin` (RLS on, zero policies). Each needs a deliberate openness decision
   → **Decisions needed** below. Never fix these by granting.

6. **22 component tables have `created_by` but no `updated_by`.** ⚠️ **Do NOT attach the
   trigger trio** — `_stamp_actor` writes `NEW.updated_by` unconditionally, so it raises
   **42703 on every insert/update** and would break the service_role pipelines that are those
   tables' only writers (verified empirically). Under step 4 most of these should *lose*
   `created_by` rather than gain a stamp. Re-scope this item after step 4.

7. **`rag.kg_sweep_state` fails the base contract** (entity variant, no `created_by`) — the 1
   table of 290 the v3 backfill could not regenerate.

8. **Drop `visibility` from the 2 components that carry it** — `plan.node_artifact`,
   `plan.node_step` (both genuine components; the column is copy-paste from the base-entity
   block, 100% default value, zero consumers, no policy references it). Two `DROP COLUMN`s,
   clear `default_visibility` on the 2 registry rows, regenerate types in both repos, fix the
   fixture at `features/marketing/content-plan/lib/pipeline-progress.test.ts:31`, and drop
   `'visibility'` from `filter_fields` in `aidream/db/helpers/auto_config_plan.py:17,20`.
   Also correct `aidream/db/migrations/0344_plan_node_artifact_step.sql` (its header still says
   "entity variant"; it is `create table if not exists`, so a FRESH install would re-add the
   column). **Adjacent:** ~40 component registry rows carry a non-NULL `default_visibility`
   for a `visibility` column that does not exist — harmless now, a trap for any future
   generator that trusts that field.

9. **`organization_id` nullable on 31 tables + 1 view; 27 more lack the column.** 5,595 NULL
   rows, concentrated in `public.system_error` (4,820), `users.profiles` (145),
   `docproc.processed_documents` (124). **The bleed has STOPPED** — all 4 tables created after
   `ddl_guard` shipped (2026-08-12) have `organization_id NOT NULL`. This is a bounded
   historical backlog. Making columns NOT NULL requires deciding what org the orphan rows
   belong to **per table** — that is product input, not a migration (`users.profiles` with 145
   of 221 NULL is a question about whether a profile belongs to an org at all). Ship the guard
   with a baseline first, then work tables down in small batches. Never one sweep.

10. **Fix the two guard INVERSIONS — this is the root cause of #9 and it is cheap.** Both
    guards that name `organization_id` use NOT NULL as their **precondition** instead of their
    **assertion**, so they are structurally blind to the failure mode:
    - `ddl_guard` requires `a.attnotnull` before evaluating → nullable columns invisible. It
      has fired 321 times, exclusively on tables that got it RIGHT.
    - `aidream/packages/matrx-orm/matrx_orm/catalog.py:431` filters `is_nullable='NO'` → the
      data source for `scripts/validate_org_backstop_coverage.py`, the cited release gate,
      which therefore **prints a clean bill of health it has not earned** (and `return 0 # NEVER block`).
    The same `is_nullable='NO'` filter is in `db/migrations/0135`, so the org-coverage backfill
    skipped these tables too.

11. **Registry completeness: 191 unregistered real tables** (219 relations minus 28
    `history.row_versions` partition children, which must never be counted —
    `audit.unregistered_candidates` inflates by exactly those 28). Buckets: ~72 infrastructure,
    ~34 entity-shaped registration work, ~85 unclear. **None are trash — decisively live**
    (`platform.entity_types` itself 6.2M index scans, `iam.system_orgs` 6.6M,
    `iam.permissions` 4.4M).
    - **Highest priority — access machinery that is invisible to the access system:**
      `iam.permissions` (the direct-grant ledger `has_access` reads) is unregistered while
      `iam.memberships` IS registered as `audit_class='machinery'`. Same for `iam.system_orgs`,
      `iam.org_industries`, `platform.shareable_resource_registry`, `platform.share_links`.
      The registry has a machinery lane; these belong in it.
    - **Functional ceiling, not cosmetics:** unregistered ⇒ `iam.has_access`/`is_discoverable`
      return **false**, so the row cannot be shared, cannot be a permission target, and cannot
      be an endpoint of a `platform.associations` edge. The **entire Credential Vault**
      (`users.user_secrets`, `credential_items`, `credential_attachments`,
      `user_secret_grants`, `integration_connections`, `integration_connection_resources`),
      the **RAG knowledge graph** (`rag.kg_chunks`, `kg_entities`, `kg_clusters`,
      `library_docs`), and **`platform.share_links`** are all in this state.
    - **UNFINISHED WORK — never recommend deletion** (`unfinished-work-alarm.md`):
      `extend.wbx_demo` carries the complete base contract, 0 rows, 0 scans, no consumer —
      ⚠️ **`matrx-extend` was NOT searched**, so that hunt is incomplete. Also
      `extend.wbx_recipe`, `workbench.udt_dataset_templates(+_fields)`,
      `education.study_structured_section`, `education.math_course_structure`,
      `context.scope_dataset_instances`, `seo.location`, `files.structure`.

12. **Add the missing DB→registry detector.** Every existing check runs registry→DB only
    (`scripts/schema-check/checks/entity-registry-drift.ts`,
    `scripts/generate-entity-types.ts`, `aidream/scripts/check_entity_drift.py` — the last
    invoked with `|| true`). The DB→registry direction exists in exactly one place,
    `audit.unregistered_candidates` via `audit.refresh_static()`, which is **pull-only**: no
    cron, no gate, runs only when a human clicks the admin page. Last run 2026-08-12.

13. **Nobody clears `platform.ddl_guard_log.acknowledged_at`** — NULL on all 341 rows, so the
    log reads as unattended even where the work was done, and the 321 `org_not_null_no_backstop`
    warnings are genuinely unreviewed. Either wire acknowledgement or drop the column.

## Done

- Component RLS no longer emits `created_by`; 0 of 147 component policies reference it — see
  `migrations/iam_apply_rls_v3_component_no_created_by_and_variant_grants.sql`.
- Table GRANTs folded into the generator, variant-keyed, with the RLS-off/no-policy safety rail
  — `iam.apply_table_grants`.
- Backfilled 289/290 generator-managed tables; `files.file_versions` repaired `----D` → `SIUD`
  by the fixed generator.
- 10 self-referential component `std_select` policies re-generated to parent-FK form; 2 missing
  `_stamp_actor` triggers attached — `migrations/iam_component_d182_parent_select_and_stamp_actor.sql`.
- Canon written: db-rules §6d-1 / §6d-2, plus §2 and the variants table corrected;
  `matrx-frontend/CLAUDE.md` § Supabase carries the short form.

## Decisions needed

**1. `ui.ui_surface` is writable by every logged-in user, right now.**
It has RLS *disabled* and full `SELECT, INSERT, UPDATE, DELETE` granted to `authenticated`, so
any signed-in user can add, edit, or delete rows in the surface registry. It is a registry that
probably should be readable by everyone but writable only by admins/the server.
**Decide:** should `ui.ui_surface` become (a) readable by all authenticated, writes
super-admin-only, (b) fully server-written (`service_role` only, no client writes), or
(c) something else?

**2. `agent.card` has RLS disabled and SELECT granted to everyone.**
Every agent card is readable by any signed-in user regardless of the card's visibility setting.
db-rules describes it as a deliberate public sharing surface, so this may be intended — but it
is currently unfiltered rather than deliberately open, and it is registered as a *component*
while also carrying 2 direct permission grants.
**Decide:** is "every authenticated user can read every agent card" the intended product
behavior? If not, what should gate it — the card's own visibility, or its agent's access?

**4. Should the access machinery be in the registry?**
`iam.memberships` is registered as `audit_class='machinery'` (gate-exempt, with a written
reason). `iam.permissions` — the direct-grant ledger that `has_access` reads on every check,
4.4M index scans — is not registered at all. Nor are `iam.system_orgs`,
`platform.shareable_resource_registry`, or `platform.share_links`. They are the same *kind* of
thing and are treated oppositely.
**Decide:** register the access machinery as `machinery` for consistency (so the registry is
complete and the completeness check can be trusted), or declare that these tables are
deliberately outside the registry and remove `iam.memberships` from it instead.

**5. Can the Credential Vault and RAG knowledge-graph tables be shared or permissioned?**
Because they are unregistered, `iam.has_access` returns false for them, so today they can never
be a share target or an association endpoint. That may be exactly right for secrets.
**Decide:** is "a credential/secret can never be shared through the normal permission system"
the intended product rule (leave unregistered, document why), or is the vault meant to support
sharing/grants (register them)? Same question separately for the RAG knowledge graph.

**3. Four tables have RLS on with zero policies** (`batch.cost_event`, `public.system_error`,
`public.system_write_failure`, `runtime.global_origin`). They are closed today, but they carry
broad grants, so the first policy anyone adds opens them wide. They look like server-written
telemetry/error stores.
**Decide:** confirm these are server-written only (so the fix is `service_role`-only policies
and no client grants), or name which ones users are meant to read.
