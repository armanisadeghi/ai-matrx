---
status: active
updated: 2026-07-27
repos: [matrx-frontend, aidream]
vision: [features/content-ir/FEATURE.md, features/content-ir/docs/SHAPE_SYSTEM.md]
---

# Kind authoring access + slug identity — who may edit a shape, and who owns its name

Two incidents, one root theme: **the kind registry trusted its writers and had no
backstop.** Agent-authored kinds were born editable by exactly one account, and any user
could mint a kind whose slug already belonged to a platform kind — which crashed the
whole registry. Both are fixed and guarded at the DB. This doc covers the vision they
violated, what is verified, and what remains.

## Vision — Arman's words

On the trigger, when the admin kind-registry refused his own edit:

> "I'm trying to update a kind from the admin system and the agent is saying I don't
> have access."

> "Find out what's going on and how we can address this right now so it doesn't
> happen again."

Read literally, and it is the whole spec: **diagnose the real cause, fix it now, and
make the class impossible** — not "grant Arman access to this row."

### Refinements, in the order they arrived

1. **Started as a permissions complaint.** The prior agent's read was that
   `seo_meta_tags` belonged to another user and offered two workarounds: have an owner
   apply the change, or fork a `seo_meta_tags_v2` under Arman's ownership.
2. **Both workarounds were rejected implicitly** by the instruction above. A fork
   creates a second authority for one concept — the duplicate-implementation defect
   PRINCIPLES.md forbids. Asking a human to hand-apply a one-line change is not a fix.
3. **"So it doesn't happen again" outranks the immediate unblock.** The one-row
   backfill was the cheap part; the durable deliverables are the source fix and the DB
   constraint.
4. **Then, mid-work, a second failure was handed over** (a `kind_architect` run where
   nine tool calls failed) with: *"confirm if your fix addresses this as well."* It
   surfaced an unrelated defect in the `tasks` tool, which was then explicitly promoted:
   *"Yes. Please fix that bug. it's critical."*
5. **Then the duplicate-slug incident**, which sets the bar for the whole area:

   > "an agent was asked to create a new kind, and it named it the same as an existing
   > one, and no one complained. The agent did it without saying anything. The system
   > saved it. And even the database didn't reject duplicates. But then, of course, it
   > crashed the system and caused all kinds of problems."

   > "when I did this, I was doing it as a user. and that's a problem because that means
   > that a user can create a kind that has the same name as a system one, and that will
   > crash the system... So that can't be."

   Note what he counted as failures: the agent didn't warn, **the system saved it**, and
   **the database didn't reject it**. Three layers, each of which should independently
   have stopped it. "A user can break the system" is the unacceptable part — not the
   agent's mistake, which will always recur.

### The why behind the decisions

- **`internal`, not `public`, for new kinds** — `docs/official/db-rules.md` §6: org work
  defaults `internal`. Materially, `internal` is what confers **editor** to org members
  in `iam.has_access_for_base`; `public` alone confers only viewer.
- **A DB CHECK, not a code convention** — three repos write this table. A rule enforced
  in one writer is a rule that the next writer breaks. This is a data-integrity
  constraint, not a new security layer (the CLAUDE.md prohibition targets new
  authorization tiers; the existing tiers are untouched).
- **No new admin override was added.** Super admins already win on system-org rows via
  `has_access_for_base`. Widening that branch to all orgs would have been a new security
  policy — Arman's call, not an agent's. Fixing the *data* removed the need.
- **Slugs went GLOBAL rather than being namespaced per org.** The slug is *already* a
  global token everywhere it is consumed: `__kind` on the wire, fence languages and XML
  tags in `kind_surface` (whose token index is globally unique), and the slug-keyed
  render registry. Per-org slugs were never coherent with that — the "tenancy" the old
  index implied did not exist anywhere downstream. Zero live duplicates existed, so the
  global index applied with no cleanup.
- **The registry stopped throwing on bad data.** A duplicate is a data defect, but taking
  down every kind for every user is a far worse outcome than rendering the first row and
  screaming. This matches the per-kind resilience the same function already applied to
  malformed kinds.

## Current state

### Done and verified

- **Source fix** — `kind_create` writes `visibility="internal"`.
  `/Users/armanisadeghi/code/aidream/packages/matrx-ai/matrx_ai/tools/implementations/kind_authoring.py`
  (~line 225). Deployed: aidream v0.1.614, `/health/version` confirmed live.
- **Backfill** — the 5 stranded kinds (`seo_meta_tags`, `gsc_opportunities`,
  `reviewer_result_card`, `visual_qc_result`, `image_metadata`) moved to `internal`.
  Verified by calling `iam.has_access_for(<arman>, 'content_ir_kind', <id>, 'editor')`
  live: `true` on all five (was `false`).
- **Guard** — `migrations/kind_definition_bans_personal_visibility.sql`, applied +
  ledgered in `public._schema_migrations`, and proven by an in-transaction write attempt
  that raised `check_violation`.
- **UI corrected** — `features/content-ir/studio/components/ShapeOwnerEditor.tsx` no
  longer offers "Personal" (it would now hard-fail at the CHECK) and its fallback
  default is `internal`.
- **Duplicate kind slugs are impossible** — `migrations/kind_definition_global_slug_unique.sql`
  (applied + ledgered; the per-org `kind_definition_org_kind_key` constraint dropped as
  subsumed). Verified by attempting the exact user-vs-platform collision — a second live
  `flashcard_set` in another org — and catching `unique_violation`, with the platform row
  intact afterwards.
- **The registry survives a duplicate** — `features/content-ir/registry/schema-source-kind-tables.ts`.
  The warm tier's `throw` (which sat outside the per-kind try/catch and killed the entire
  load) is now keep-oldest + `captureError`; the cold tier's `.maybeSingle()` (PGRST116 on
  two rows) is `.order("created_at").limit(2)` with the same scream.
- **`kind_create` checks globally** — the collision filter no longer narrows to "my org or
  my rows", and its error names whether the owner is you or another org. Shipped in the
  aidream release cut immediately after `786131b46`.
- **`tasks` tool FK crash** — `/Users/armanisadeghi/code/aidream/aidream/tools/agent_tasks_tool.py`.
  Write actions now await the idempotent `ensure_conversation_exists` first; ephemeral
  runs (`store=False`) get a plain sentence instead of a DB write; a surviving FK
  violation is translated to one actionable line. Shipped in aidream v0.1.647.

### Partial

- **The `tasks` fix is verified unevenly.** The ephemeral-guard branch was executed
  locally against the real module (returns the "cannot be saved in an ephemeral run"
  result, no DB call). The race fix and the FK-message translation are **not** yet
  exercised in production — a local run of the persisted path needs full app wiring
  (`matrx_ai.configure()`), which was not stood up. Confirm by re-running an agent that
  calls `tasks` on a fresh conversation and checking `chat.tool_call` for a `tasks` row
  with `status='error'`.

### Not started

- **The `personal`-lockout sweep across other entity types.** A survey of every
  `visibility` column in `content_ir / skill / agent / workflow / tool / app / plan /
  research / podcast` found the class nearly clean: exactly **1** `agent.definition` row
  and **1** `tool.bundle` row are `personal`. Neither was inspected. A personal agent may
  well be correct (an agent can genuinely belong to one person); a personal tool bundle
  is more suspect.

### Known issues / risks

- **The constraint shipped before the code did**, and that gap cost a real run: between
  applying the CHECK and deploying aidream v0.1.614, every `kind_create` hard-failed with
  `CheckViolationError`, which is exactly the failure in the `kind_architect` transcript.
  Ship the writer first, then the constraint.
- **The DB column default is `public`, while `kind_create` writes `internal`.** Both are
  valid and neither is wrong, but a reader comparing them will suspect drift. Frontend
  inserts (`features/agents/components/schema-proposal/create-shape.ts`) deliberately ride
  the default.
- **`viewer` and `editor` diverge on different branches** of
  `iam.has_access_for_base`. Org **admin** status confers viewer only (that branch is
  gated on `p_required = 'viewer'`); the `internal` + `has_org_access_for` branch is what
  confers editor and is not level-gated. Do not reason about one from the other — call
  the function.
- **`agent-review-queue` was not written for this work.** Nothing new is browsable, but a
  successor who wants Arman's eyes on a surface must register it there.

## Architecture / orientation

| Concern | Where |
|---|---|
| Access decision (the ONE source of truth) | `iam.has_access_for_base(user, type, id, level)` — SECURITY DEFINER, same body behind RLS |
| Entry point used by tools | `iam.has_access_for` → dispatches `file` to `files.has_access_for`, else base |
| Tool-side gate | `aidream/packages/matrx-ai/matrx_ai/tools/implementations/kind_shared.py` — `can_access_kind` / `ensure_can_edit_kind` / `ensure_can_view_kind` |
| Kind creation | `.../kind_authoring.py::kind_create` (also the schema/example/skill/block writers) |
| Entity token | `content_ir_kind`, resolved through `platform.entity_types` |
| The table | `content_ir.kind_definition` (`visibility`, `organization_id`, `created_by`, `authoring_owner`) |
| The guard | `migrations/kind_definition_bans_personal_visibility.sql` |
| FE owner authoring | `features/content-ir/studio/components/ShapeOwnerEditor.tsx` + `studio/shape-authoring-service.ts` (the ONE browser mutation path; `ShapeAuthMode` = `owner` \| `admin`) |
| FE admin surface | `app/(admin)/administration/utilities/kind-registry/` (`/build` is where Arman hit this) |
| Feature doctrine | `features/content-ir/FEATURE.md`, `features/content-ir/docs/SHAPE_SYSTEM.md` |
| Tasklist tool | `/Users/armanisadeghi/code/aidream/aidream/tools/agent_tasks_tool.py` → `chat.agent_task` (hard FK to `chat.conversation`) |
| Ephemeral-run contract | `/Users/armanisadeghi/code/aidream/docs/handoffs/conversation-start-contract.md` — read before touching anything conversation-lifecycle |

**How access resolves, in order** (abridged from `has_access_for_base`): owner →
org-admin (viewer only) → `public` (viewer only) → system-org global-readable (viewer;
and **editor for super admins**) → explicit `iam.permissions` grant → `iam.memberships`
role grant → `platform.reachability` containers → **`internal` + org access (any level)**.
`personal` reaches none of these except owner. That single fact is the whole incident.

## Remaining work

1. **Verify the `tasks` fix in production.** Start a fresh conversation with an agent that
   uses the tasklist, then:
   `select tool_name, status, left(error_message,120) from chat.tool_call where conversation_id = '<id>' and tool_name = 'tasks';`
   Expect zero `status='error'` rows. Prod SHA must be ≥ v0.1.647 (`/health/version`).
2. **Re-run the `kind_architect` build that failed** (the PRP-injections keyword request,
   four kinds: `marketing_seo_keyword_list`, `seo_meta_suggestions`,
   `content_expansion_options`, `seo_keyword_research`). It failed only on the constraint,
   with the old code; all four slugs are still free. This doubles as the end-to-end proof
   of the kind fix.
3. **Apply the change Arman originally wanted:** add optional `website_url`
   (`{"type":"string","format":"uri"}`) to `seo_meta_tags`, left out of `required`. Use
   `kind_update_schema` — it bumps the version and re-validates every example. Do not
   hand-edit `emitted_json_schema`; the fingerprint and the example revalidation trigger
   both hang off that write path.
4. **Inspect the two remaining `personal` rows** (1 in `agent.definition`, 1 in
   `tool.bundle`). Decide per row whether it is genuinely one person's; leave it if so.
   Re-run the survey with the visibility-column sweep in this doc's history if you want
   the full list.
5. **Decide whether kind writers should be able to set `public` at all** from the owner
   editor. Today a shape owner can publish to the shared library with no review step.
6. **Audit the other slug-shaped global identifiers for the same per-org hole.**
   `kind_surface.token` is already globally unique; `skill.definition`, `tool.definition`,
   and content-block `block_id` were NOT checked and are consumed by name the same way.
   The query pattern is `select <name>, count(*) ... group by 1 having count(*) > 1`
   against each, plus reading its unique indexes for an `organization_id` prefix.

## Gotchas

- **`personal` means one human being's own row — not "private to my team".** Anything a
  team, an org, or the platform is expected to maintain must be `internal` or `public`,
  or it dies with its author's account.
- **A super admin is NOT a global editor.** The override fires only when the row's org is
  in `iam.system_orgs` with `global_readable`. On a normal org's row a super admin gets
  whatever the ordinary branches give — often viewer. Never assume; call
  `iam.has_access_for`.
- **Order of operations for any constraint that narrows allowed values:** deploy every
  writer first, verify the new value in prod, *then* apply the CHECK. Reversed, you break
  live runs — as happened here.
- **`kind_create` slug resolution is org- and user-scoped.** `resolve_kind_ref` prefers a
  row in your active org, then one you created, then a lone live row, and errors loudly on
  ambiguity. A "kind not found" from an agent can mean "exists, but not yours".
- **Viewer denials are content-free on purpose.** `ensure_can_view_kind` returns the same
  `not_found` shape as a missing id so probes learn nothing. Do not "improve" that message.
- **`chat.agent_task` inherits the conversation's persistence.** If the conversation is
  ephemeral there is no parent row and there never will be — a tasklist write is
  impossible, not delayed. The tool now says so instead of retrying.
- **A kind slug is a global name, not a per-tenant one.** Never re-scope a slug check to
  an org — that is precisely the bug that let a user shadow a platform kind.
- **Never let a registry-load path throw on one bad row.** Both tiers of
  `schema-source-kind-tables.ts` degrade per-row and scream. A throw there is not
  "strict", it is an outage: the warm load backs every render in the app.
- **aidream's release script blocks on the SHARED migration ledger.** An unapplied
  matrx-frontend migration fails an aidream release with an unrelated-looking error at
  `scripts/release.sh:217`. Apply + ledger your FE migration first. It also rewrites the
  derived `db/MIGRATIONS_STATUS.md`; a stale copy of that report can name a live object
  as MISSING — re-run `python db/detect_applied.py --check` before believing it, then
  `git checkout --` the file so the tree is clean for the version commit.
- **aidream is on a fast-moving `main` with parallel agent sessions.** `origin/main` moved
  ~30 releases during this work. Always `git log origin/main` and compare `/health/version`
  to the SHA you expect before concluding your change is (or is not) live.

## Decisions needed

**Can two organizations own a shape with the same name?**

A kind's slug (`flashcard_set`, `seo_meta_tags`) is now unique across the entire
platform — if one org takes a name, no other org can use it. This was forced: the slug is
the token that appears in agent output (`__kind`), in fence languages, and in the render
registry, none of which carry an organization, so two rows with one slug made rendering
ambiguous and crashed the registry. Global uniqueness is the only shape that matches how
the name is actually consumed today.

The cost is real: a second customer can never create their own "product_card" shape,
they must call it something else, and the good short names go to whoever asks first.

**Decide:** keep globally-unique slugs (nothing more to build), or commit to namespaced
slugs — every consumer resolving `org-slug/kind-slug`, the wire format carrying the
namespace, and a rule for which namespace an ambiguous bare token means. That is a
substantial change across both repos and the stream format, and it should not be started
without your explicit direction.
