---
status: active
updated: 2026-08-15
repos: [matrx-frontend, aidream]
vision: [features/content-ir/FEATURE.md, features/content-ir/docs/SHAPE_SYSTEM.md]
---

# Kind authoring access + shape identity — who may edit a shape, and what makes two shapes "the same"

**The kind registry trusted its writers and had no backstop.** Agent-authored kinds were born
editable by exactly one account; a user could mint a kind whose slug already belonged to a
platform kind (which crashed the whole registry); and an agent could mint two kinds with the
same *schema* under different names and nothing objected. The first two are fixed and guarded
at the DB. The third is now understood and chipped.

## Vision — Arman's words

On the trigger, when the admin kind-registry refused his own edit:

> "I'm trying to update a kind from the admin system and the agent is saying I don't
> have access."

> "Find out what's going on and how we can address this right now so it doesn't
> happen again."

Read literally, that is the whole spec: **diagnose the real cause, fix it now, and make the
class impossible** — not "grant Arman access to this row." A fork (`seo_meta_tags_v2`) and
"ask an owner to apply it by hand" were both implicitly rejected by that instruction.

On the duplicate-slug incident, which sets the bar for the area:

> "an agent was asked to create a new kind, and it named it the same as an existing
> one, and no one complained. The agent did it without saying anything. The system
> saved it. And even the database didn't reject duplicates. But then, of course, it
> crashed the system and caused all kinds of problems."

> "when I did this, I was doing it as a user. and that's a problem because that means
> that a user can create a kind that has the same name as a system one, and that will
> crash the system... So that can't be."

Note what he counted as failures: the agent didn't warn, **the system saved it**, and **the
database didn't reject it** — three layers, each of which should independently have stopped
it. "A user can break the system" is the unacceptable part, not the agent's mistake, which
will always recur.

On duplicates generally (2026-08-14, ruling on D164):

> Things like this are rarely a simple accidental duplication — in almost every case two
> things were meant to have two different intents and someone collapsed them. Deleting one
> deepens the destruction. Only documentation proving they were the same from the beginning
> justifies removing one.

## Done

- **New kinds are `internal`, not `personal`** — source fix in aidream `kind_authoring.py`
  (v0.1.614, live), 5 stranded kinds backfilled, enforced by
  `migrations/kind_definition_bans_personal_visibility.sql`. `ShapeOwnerEditor` no longer
  offers "Personal".
- **Duplicate slugs are impossible** — `migrations/kind_definition_global_slug_unique.sql`
  (slugs are global; the per-org constraint was dropped as incoherent with how the slug is
  consumed). `kind_create` checks globally and names the conflicting owner.
- **The registry survives a duplicate** — both tiers of
  `features/content-ir/registry/schema-source-kind-tables.ts` degrade per-row and scream
  instead of throwing (a throw there is an outage: the warm load backs every render).
- **`tasks` tool FK crash** — aidream `agent_tasks_tool.py`, v0.1.647.
- **D164 — the duplicate SHAPE** (`keyword_set` ≡ `keyword_variant_set`, byte-identical,
  minted 32ms apart by `kind_create`): investigated under Arman's ruling above, proven
  identical from birth via `history.row_versions`, and resolved 2026-08-15 by deactivating
  `keyword_set` through `content_ir.set_kind_activation` (reversible; `keyword_variant_set`
  held the only component and the only bound agent). **0** fingerprint collisions now remain
  between active `user_authored` kinds. Evidence: `features/content-ir/FEATURE.md` Change Log.

## Remaining work

1. **Refuse a duplicate SHAPE at mint time** (chipped 2026-08-15). The slug guard closed
   duplicate *names*; D164 was two identical *schemas* under different names, which nothing
   caught for three weeks. Rule: `kind_create` must refuse a slug whose `emitted_fingerprint`
   already belongs to an **active `user_authored`** kind — scoped exactly that way, because
   collisions among the ~665 machine-minted `is_contract_artifact` snapshots are endemic and
   legitimate. Enforce at the DB (match the `set_kind_activation` / `guard_kind_is_active_write`
   convention) so every writer inherits it, and name the existing kind in the refusal.
2. **Verify the `tasks` fix in production.** Fresh conversation with a tasklist-using agent,
   then `select tool_name, status, left(error_message,120) from chat.tool_call where
   conversation_id = '<id>' and tool_name = 'tasks';` — expect zero `status='error'`. Prod SHA
   must be ≥ v0.1.647.
3. **Re-run the `kind_architect` build that failed** (`marketing_seo_keyword_list`,
   `seo_meta_suggestions`, `content_expansion_options`, `seo_keyword_research`) — it failed
   only on the constraint, with the old code; all four slugs are still free.
4. **Apply the change Arman originally wanted:** optional `website_url`
   (`{"type":"string","format":"uri"}`) on `seo_meta_tags`, not in `required`. Use
   `kind_update_schema` — never hand-edit `emitted_json_schema` (the fingerprint and example
   revalidation hang off that write path).
5. **Inspect the two remaining `personal` rows** (1 `agent.definition`, 1 `tool.bundle`).
   A personal agent may be correct; a personal tool bundle is suspect.
6. **Decide whether owners may set `public` at all** — today a shape owner publishes to the
   shared library with no review step.
7. **Audit the other slug-shaped global identifiers for the same per-org hole.**
   `kind_surface.token` is already globally unique; `skill.definition`, `tool.definition`, and
   content-block `block_id` were never checked and are consumed by name the same way.

## Architecture / orientation

| Concern | Where |
|---|---|
| Access decision (the ONE source of truth) | `iam.has_access_for_base(user, type, id, level)` |
| Entry point used by tools | `iam.has_access_for` → `file` dispatches to `files.has_access_for` |
| Tool-side gate | aidream `matrx_ai/tools/implementations/kind_shared.py` |
| Kind creation | `.../kind_authoring.py::kind_create` |
| Entity token / table | `content_ir_kind` → `content_ir.kind_definition` |
| Activation gate | `content_ir.set_kind_activation` + `guard_kind_is_active_write` |
| FE owner authoring | `features/content-ir/studio/components/ShapeOwnerEditor.tsx` + `studio/shape-authoring-service.ts` |
| FE admin surface | `app/(admin)/administration/utilities/kind-registry/` |
| Schema→kind reverse lookup | `features/agents/components/settings-management/output-schema/` (`matchKindForSchema`) — the ONLY consumer; render routing reads `__kind` off the payload |

**How access resolves, in order:** owner → org-admin (viewer only) → `public` (viewer only) →
system-org global-readable (viewer; editor for super admins) → explicit `iam.permissions` grant
→ `iam.memberships` role grant → `platform.reachability` containers → **`internal` + org access
(any level)**. `personal` reaches none of these except owner. That single fact is the whole
first incident.

## Gotchas

- **`personal` means one human being's own row — not "private to my team".** Anything a team,
  an org, or the platform maintains must be `internal` or `public`, or it dies with its
  author's account.
- **A super admin is NOT a global editor.** The override fires only for rows in an
  `iam.system_orgs` org with `global_readable`. Never assume — call `iam.has_access_for`.
- **Deploy every writer BEFORE applying a constraint that narrows allowed values.** Reversed,
  you break live runs — that is exactly what the `kind_architect` failure was.
- **A kind slug is a global name, not a per-tenant one.** Never re-scope a slug check to an org.
- **Never let a registry-load path throw on one bad row** — that is an outage, not strictness.
- **Viewer denials are content-free on purpose** (`ensure_can_view_kind` returns the `not_found`
  shape so probes learn nothing). Do not "improve" that message.
- **`kind_create` slug resolution is org- and user-scoped** — "kind not found" from an agent can
  mean "exists, but not yours".
- **aidream's release script blocks on the SHARED migration ledger** — an unapplied
  matrx-frontend migration fails an aidream release with an unrelated-looking error.
- **Fingerprint collisions are mostly legitimate** — 100+ groups across ~1158 kinds, almost all
  machine-minted contract artifacts. Only active `user_authored` collisions are defects.

## Decisions needed

**Can two organizations own a shape with the same name?**

A kind's slug (`flashcard_set`, `seo_meta_tags`) is now unique across the entire platform — if
one org takes a name, no other org can use it. This was forced: the slug appears in agent output
(`__kind`), in fence languages, and in the render registry, none of which carry an organization,
so two rows with one slug made rendering ambiguous and crashed the registry.

The cost is real: a second customer can never create their own "product_card" shape, and the good
short names go to whoever asks first.

**Decide:** keep globally-unique slugs (nothing more to build), or commit to namespaced slugs —
every consumer resolving `org-slug/kind-slug`, the wire format carrying the namespace, and a rule
for what a bare token means. That is a substantial change across both repos and the stream
format; do not start it without explicit direction.
