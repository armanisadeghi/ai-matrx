# Post-Reorg Security & Hardening Backlog

> **Status:** deferred, tracked. Generated **2026-07-04** from the live Supabase security advisors
> (project `txzxabzwovsujtloxrus`) after the 2026 schema reorg. **The app is up and serving; none of
> the items below are outages.** This is a hardening list, not a break/fix list.

**Triage rule (owner decision, 2026-07-04):** a table with **RLS disabled is treated as low-value /
non-sensitive by definition** — it is the *last* priority. Do **not** spend effort enabling RLS on
these unless one is later found to hold sensitive data. The items worth a second look are the
**SECURITY DEFINER views** (Section B) and the **always-true write policies** (Section C), because
those can leak or allow writes to data *regardless* of the RLS-disabled framing — a different failure
mode than "table has no RLS."

Advisor totals: **1,935** notices — 37 ERROR · 1,853 WARN · 45 INFO. ~92% are the four high-volume WARN
classes that are largely *expected* consequences of the canonical `SECURITY DEFINER` RPC + generated-RLS
architecture (Section F). The genuinely actionable set is ~59 items.

---

## A. RLS disabled in API-exposed schemas — 15 (ERROR) · **LOWEST PRIORITY per triage rule**

Any table with RLS off in a PostgREST-exposed schema is readable/writable by any anon/authenticated
client hitting REST. Per the triage rule these are deprioritized; listed for the record. Sensitivity
read is a first-pass guess — **verify before dismissing the two starred rows.**

| Table | Likely content | Note |
|---|---|---|
| `public.schema_templates` | schema templates | low-sensitivity app structure |
| `public.site_metadata` | site/SEO metadata | low-sensitivity |
| `public.full_spectrum_positions` | app data | verify |
| `public._schema_migrations` | migration ledger | internal; exposure is informational only |
| `ui.ui_client` | UI client registry | low-sensitivity config |
| `ui.ui_surface` | UI surface registry | low-sensitivity config |
| `files.structure` ⭐ | file-tree structure | **verify** — may describe user file layouts |
| `files.webhook_dispatch_state` | webhook dispatch bookkeeping | internal ops |
| `api.html_extractions` ⭐ | scraped HTML/extractions | **verify** — may hold user-scraped content |
| `scraper.scrape_retry_queue` | scraper ops | internal ops |
| `scraper.scrape_domain_settings` | scraper config | internal ops |
| `scraper.scrape_failure_log` | scraper logs | internal ops |
| `scraper.scrape_path_override` | scraper config | internal ops |

Fix pattern (when/if actioned): `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` + a canonical policy via the
`iam.apply_rls` generator (never hand-write policies — see the canonical-RLS memory), **or** move the
table out of an exposed schema. Remediation: <https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public>

---

## B. SECURITY DEFINER views — 22 (ERROR) · **REVIEW THESE (real bypass surface)**

A `SECURITY DEFINER` view runs as its owner, so it returns rows the querying user's RLS would otherwise
hide. This leaks data even when the underlying tables *do* have RLS. Convert to `security_invoker=on`
(or add an explicit row filter) — prioritizing the identity/tenant-bearing ones.

**Priority (identity / cross-tenant):**
- `iam.organization_member` — org membership across tenants
- `public.current_user_is_admin` — admin status (confirm it's self-scoped, not global)
- `agent.card`, `agent.menu_surface`, `agent.context_menu_view`
- `public.context_menu_unified_view`

**Remaining (verify each returns only caller-visible rows):**
`public.v_scope_suggestion_stats`, `public.v_scope_suggestions`, `public.v_scope_suggestions_new`,
`public.v_kg_value_matches`, `public.v_context_item_suggestions`, `public.v_kg_alerts`,
`public.v_kg_sweep_effectiveness`, `public.v_ner_canonicalizer_shadow`, `public.ai_runs_summary`,
`public.category_items_view`, `public.prompt_builtins_with_source_view`, `public.prompt_app_analytics`,
`public.pdf_unified_pages`, `public.shortcuts_by_placement_view`, `ai.model_offering`,
`research.rs_source_keywords`.

Remediation: <https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view>

---

## C. Always-true RLS policies that allow ALL / UPDATE — 6 live tables · **REVIEW (write holes)**

RLS is *on*, but the policy predicate is literally `true`, so **any signed-in user can fully manage
these**. Low data-sensitivity, but genuine privilege issues (any authenticated user can edit site
content / announcements / course content).

- `public.content_blocks` — policy "Allow authenticated users to manage content blocks" — **ALL** / authenticated
- `public.system_announcements` — "Authenticated users can manage announcements" — **ALL** / authenticated
- `public.ops_issue_class` — `ops_issue_class_service_all` — **ALL**
- `public.ops_issue_event` — `ops_issue_event_service_all` — **ALL**
- `education.math_course_structure` — "Authenticated users can manage course structure" — **ALL** / authenticated
- `education.math_problems` — "Authenticated users can manage math problems" — **ALL** / authenticated

Likely-intentional INSERT-only form/guest policies (probably fine, confirm): `communication.emails`
(form_insert), `public.contact_submissions`, `users.invitation_requests`.

Remediation: <https://supabase.com/docs/guides/database/database-linter?lint=0024_permissive_rls_policy>

---

## D. Auth config toggles — 2 (WARN) · **30-SECOND QUICK WINS (Supabase dashboard)**

- **Leaked-password protection is OFF** → enable HaveIBeenPwned check.
  <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>
- **Email OTP expiry > 1 hour** → set below 1h.
  <https://supabase.com/docs/guides/platform/going-into-prod#security>

---

## F. High-volume WARN classes — context, mostly *expected by architecture* (backlog only)

| Count | Class | Assessment |
|---|---|---|
| 570 | `function_search_path_mutable` | pin `search_path` per function; defense-in-depth, not exploitable alone |
| 441 | `authenticated_security_definer_function_executable` | **expected** — canonical pattern is SD RPCs gated internally by `auth.uid()`/`is_super_admin()` |
| 414 | `anon_security_definer_function_executable` | **expected** — same; triage only the sensitive RPC families |
| 383 | `auth_allow_anonymous_sign_ins` | mostly lint artifact of generated policies applied `TO authenticated, anon` with a blocking predicate |
| 45 | `rls_enabled_no_policy` (INFO) | **fail-closed, not a hole** — RLS on + no policy = deny-all; reached via SD RPC / service role |
| 3 | `extension_in_public` | `pg_trgm`, `vector`, `plpgsql_check` — relocate to `extensions` schema when convenient |

**Watch item (verify, likely artifact):** `admin.admins` / `admin.admin_audit_log` appear under
`auth_allow_anonymous_sign_ins` — their protection relies on the `is_super_admin()` predicate *inside*
the policy. Confirm that predicate is present and not always-true; if it were, that'd be critical. (Per
the protected-resources design it should be fine — this is a lint artifact of the `TO … anon` role list.)

---

## G. Non-security minor follow-ups (deferred, NOT broken)

- **Stale migration files** still contain pre-move `public.shared_canvas_items` text (e.g.
  `migrations/canvas_canonicalize_and_move_to_canvas_schema.sql`, `migrations/mtx_public_media_url_guard_rollout.sql`).
  The **live** functions are already correct (fixed 2026-07-04); the files are only a re-application
  hazard. Scrub opportunistically.
- **`public.flexible_data` schema-check false positive** — `check:schema` reports it as an orphan type,
  but the table exists in `public` and content-IR reads it fine. Root cause: `schema_truth_snapshot()`
  RPC does not return it (likely a snapshot-coverage gap). Not user-facing; refresh/patch the snapshot
  logic when touching the schema guard.
- **aidream backend hits dead `GET /rest/v1/tools`** (seen in API logs, python-httpx UA). Cross-repo:
  the tool table is now `tool.definition`. Fix in the **aidream** repo, not here.
- **Stale-bundle `GET /rest/v1/tool_def` 404 from a browser** — current frontend source has *zero*
  references to the dead path (verified 2026-07-04); this self-heals on cache/service-worker clear.

---

## Fixed on 2026-07-04 (for reference — not backlog)

- `public.update_all_trending_scores()` + `public.get_user_feed()` repointed to `canvas.shared_canvas_items`
  / `users.user_follows` (migration `fix_canvas_functions_schema_qualify_after_move.sql`, applied + ledgered).
- `scripts/check-tool-db-drift.ts` repointed from `/rest/v1/tool_def` (public) to `/rest/v1/definition` (tool profile).
- `features/flashcards/components/CanvasFlashcardsView.tsx:275` — fixed build-blocking `onReview` signature mismatch.
