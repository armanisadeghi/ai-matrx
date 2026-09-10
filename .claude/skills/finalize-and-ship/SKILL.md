---
name: finalize-and-ship
description: "End-of-task routine: health checks, fixes, then commit and push. Use when finishing a unit of work, or when the user says 'commit and push', 'ship it', 'get it ready', 'wrap up', or just 'do this' with no push instruction."
---

# finalize-and-ship

Before handing work back, prove it's healthy, then deliver it. Migrations and types are two line items among several — run the whole sweep, not just the part that bit you last time.

## The commit/push contract (read first)

The user task and repository instructions determine commit authorization; invoking a skill grants no additional authority. Two independent decisions — **scope** (what to stage) and **delivery** (commit vs push vs hold). Read both from the user's words.

**Scope — what to stage:**

| User said | Stage |
|---|---|
| "commit **your** work" / "commit what **you** did" / "your changes" | **Only the files you created or modified this session.** Leave everything else in the working tree untouched. |
| "commit **everything**" / "commit **all**" | The explicitly authorized batch, after checking concurrent ownership. |
| A general "commit & push" / **nothing specific** | Only this task's files; shared-checkout work from other agents stays theirs. |

When scope = your-own and the tree also holds files you didn't touch, never sweep them in — stage your paths explicitly (never blind `git add -A`).

**Delivery — what to do with it:**

| User said | Do |
|---|---|
| "commit & push" / "ship it" / "push to main" / **nothing about pushing** / just "do this" | All checks → fix → **commit → push to `main`** |
| "get it ready, but don't push" / "don't push" | All checks → fix → **commit → STOP** (no push) |
| "don't commit" / "just stage" / "leave it for review" | All checks → fix → **stop before committing** |

Defaults: scope = **this task's files**, delivery = **commit and push**. Follow explicit holds. Concurrent edits are normal: stage scoped paths and coordinate overlapping files; do not turn unrelated dirty files into an approval request.

## Checklist

```
- [ ] 1. Matrx packages + types current   → pnpm sync-types
- [ ] 2. No unapplied/drifted migrations   → pnpm check:migrations
- [ ] 3. Touch-based checks (table below)
- [ ] 4. Fix everything the checks surfaced
- [ ] 5. Commit (+ push) per the contract above
```

### 1. Types — `pnpm sync-types`

Refreshes every `@ai-matrx/*` dependency from npm `latest`, regenerates Supabase DB types + Python API types, then type-checks. Commit `package.json` + `pnpm-lock.yaml` when package resolution changes. Must print **"Type-check passed."** Errors → fix per the **`type-safety`** skill (DB types are canonical; never `as any` / `as unknown` / `@ts-ignore` / `@ts-expect-error`; escalate what you can't fix properly). Re-run until green.

### 2. Migrations — `pnpm check:migrations`

Must come back **silent** (clean). If it flags `[UNAPPLIED]` or `[DRIFTED]`: discover the configured database capability for `https://db.matrxserver.com`, recover authentication or the established local admin path if needed, then apply and record the ledger row. Never assume a named MCP tool is always available or target a database by project ref. Full procedure: **CLAUDE.md → "Database migrations"** (idempotency, SHA-256 ledger write, verify-live).

### 3. Touch-based checks — only the rows your change hit

| If your change touched… | Do this before committing |
|---|---|
| A **Tier 1/2 feature** (logic, flows, entry points, invariants) | Update its `FEATURE.md` + add a dated Change Log line |
| A **route / window panel / overlay / official component** | Add it to that feature's `/[feature]/admin` map config |
| A **new type / component / hook / slice** | Confirm no existing primitive could extend instead (PRINCIPLES.md); `pnpm check:doctrine` flags new ones |
| **Scope/context** code | Respect the global-vs-local invariant (CLAUDE.md → Scopes) |
| Any **user-facing surface** | No `window.confirm/alert/prompt`; no new barrel `index.ts`; Lucide icons only, no emojis |
| A **completed plan / handoff / campaign** | Invoke `handoffs` for handoffs: completed handoffs are deleted, not archived. Archive completed plans/history under their owning documentation policy and repair inbound pointers. |

Fuller sweep when unsure (surface-drift + doctrine + types): `pnpm validate --no-lint`. (`lint` is advisory and slow — skip unless asked.)

### 5. Commit & push

Plain git, per the global commit rules: review `git status` + `git diff` first, stage the **specific** files (never blind `git add -A`), write a conventional commit (`feat(...)`/`fix(...)`) via a HEREDOC, then `git push origin main`. Quality gates (`check:doctrine`, UI primitives, migrations, dead-relations) run at **release time** via `./scripts/release.sh` / `pnpm check:release-gates` — not on every commit.

> `pnpm ship "msg"` is the **versioned-release** path. Use the release-freshness rule below after every push; do not leave runtime-bearing `main` changes behind an ignored Vercel commit.

### 6. If it must reach USERS, release it — `git push` alone deploys nothing

**Vercel skips every commit whose first line is not release-prefixed** (`vercel.json` → `scripts/vercel-ignore-build.sh`). A plain `git push origin main` reaches GitHub and **no user, ever**: no build starts, the deployment reads `CANCELED`, and production stays on the last release. Polling the live URL will never turn green — there is nothing running to wait for.

Before ending the turn, close the release gap:

| Situation | Do |
|---|---|
| Latest applicable `origin/main` code is already contained in every affected target's latest `Ready` deployment | No release; record the verified target SHAs. |
| Any affected target is missing applicable `origin/main` code | Coordinate with the existing frontend release-watch task and follow the repair through its next authorized release. Run `./scripts/release.sh` yourself only when the user requested an immediate release, per `CLAUDE.md`. Shared runtime changes affect all three targets. |
| A release for the exact applicable SHA is already queued or building | Do not duplicate it; monitor it to `Ready`, repair failure, and re-verify freshness. |

Verify a release actually landed: a `READY` production deployment whose commit is yours or a descendant (Vercel MCP `list_deployments`), then assert on a string that exists **only** in the new build — a marker the old build also contained reports a false success.

**Never edit `scripts/release.sh` to skip a check so a build goes out.** A `TEMP_SKIP_RELEASE_CHECKS` flag added during one emergency silently disabled migrations, protocol sync, source attribution, and every gate for *all* subsequent releases. Per-invocation `--no-migrate` / `--no-gates` exist for that; use those, and never commit a default-on skip.

## Recover before escalating

Read `protected-resources` before changing admins, RLS, or SECURITY DEFINER code; a skill name
alone does not require approval. Fix non-idempotent migrations, type-contract mismatches, and
failed checks at their source. Never use forbidden casts/suppressions to force a pass.
Escalate only when safe discovery and repair are exhausted and a missing credential,
human-only authentication gate, destructive action outside authorization, or consequential
unresolved product decision actually requires the user. Record exact unfinished evidence;
a status report does not replace an available repair.

Verified 2026-09-09 during Agent Review First Pass: reconciled shared-checkout scope, database capability recovery, release ownership, and handoff cleanup with repository instructions.

## Reference

| Thing | Where |
|---|---|
| All-checks runner | `pnpm validate` (`scripts/validate.mjs`) |
| Type sync | `pnpm sync-types` (`scripts/sync-types.mjs`) |
| Migration verify + apply/record | `pnpm check:migrations`; CLAUDE.md → "Database migrations" |
| Type-fix rules | `type-safety` skill (`.claude/skills/type-safety/`) |
| Doctrine (new primitives) | `pnpm check:doctrine`; `PRINCIPLES.md` |
| Pre-release gates | `pnpm check:release-gates` or `./scripts/release.sh` (each gate announces itself; advisory by default) |
| Versioned release | `pnpm ship "msg"` |
