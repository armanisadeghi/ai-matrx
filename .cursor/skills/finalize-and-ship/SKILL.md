---
name: finalize-and-ship
description: The end-of-task routine — run every health check, fix what's broken, then commit and push. Use whenever you finish a unit of work and the user says to commit/push it, "ship it", "get it ready", "do this" (with no push instruction), or asks you to wrap up and hand work back. Covers type sync, migrations, doctrine/docs checks, the commit/push contract, and stop-and-ask triggers.
---

# finalize-and-ship

Before handing work back, prove it's healthy, then deliver it. Migrations and types are two line items among several — run the whole sweep, not just the part that bit you last time.

## The commit/push contract (read first)

Invoking this skill **is** the authorization to commit. Two independent decisions — **scope** (what to stage) and **delivery** (commit vs push vs hold). Read both from the user's words.

**Scope — what to stage:**

| User said | Stage |
|---|---|
| "commit **your** work" / "commit what **you** did" / "your changes" | **Only the files you created or modified this session.** Leave everything else in the working tree untouched. |
| "commit **everything**" / "commit **all**" / a general "commit & push" / **nothing specific** | The **entire** working tree. |

When scope = your-own and the tree also holds files you didn't touch, never sweep them in — stage your paths explicitly (never blind `git add -A`).

**Delivery — what to do with it:**

| User said | Do |
|---|---|
| "commit & push" / "ship it" / "push to main" / **nothing about pushing** / just "do this" | All checks → fix → **commit → push to `main`** |
| "get it ready, but don't push" / "don't push" | All checks → fix → **commit → STOP** (no push) |
| "don't commit" / "just stage" / "leave it for review" | All checks → fix → **stop before committing** |

Defaults: scope = **everything**, delivery = **commit and push**. Narrow scope or hold delivery only when the user says so. If the tree contains a large batch of changes you didn't make and scope is ambiguous, **stop and ask** rather than guessing.

## Checklist

```
- [ ] 1. Types synced & no type errors    → pnpm sync-types
- [ ] 2. No unapplied/drifted migrations   → pnpm check:migrations
- [ ] 3. Touch-based checks (table below)
- [ ] 4. Fix everything the checks surfaced
- [ ] 5. Commit (+ push) per the contract above
```

### 1. Types — `pnpm sync-types`

Regenerates Supabase DB types + Python API types, then type-checks. Must print **"Type-check passed."** Errors → fix per the **`type-fixing-agent`** skill (DB types are canonical; never `as any` / `as unknown` / `@ts-ignore` / `@ts-expect-error`). Re-run until green.

### 2. Migrations — `pnpm check:migrations`

Must come back **silent** (clean). If it flags `[UNAPPLIED]` or `[DRIFTED]`: apply via the Supabase MCP `apply_migration` (always available, `project_id: "txzxabzwovsujtloxrus"`), then record the ledger row so the check goes green. Full procedure: **CLAUDE.md → "Database migrations"** (idempotency, SHA-256 ledger write, verify-live).

### 3. Touch-based checks — only the rows your change hit

| If your change touched… | Do this before committing |
|---|---|
| A **Tier 1/2 feature** (logic, flows, entry points, invariants) | Update its `FEATURE.md` + add a dated Change Log line |
| A **route / window panel / overlay / official component** | Add it to that feature's `/[feature]/admin` map config |
| A **new type / component / hook / slice** | Confirm no existing primitive could extend instead (PRINCIPLES.md); `pnpm check:doctrine` flags new ones |
| **Scope/context** code | Respect the global-vs-local invariant (CLAUDE.md → Scopes) |
| Any **user-facing surface** | No `window.confirm/alert/prompt`; no new barrel `index.ts`; Lucide icons only, no emojis |

Fuller sweep when unsure (surface-drift + doctrine + types): `pnpm validate --no-lint`. (`lint` is advisory and slow — skip unless asked.)

### 5. Commit & push

Plain git, per the global commit rules: review `git status` + `git diff` first, stage the **specific** files (never blind `git add -A`), write a conventional commit (`feat(...)`/`fix(...)`) via a HEREDOC, then `git push origin main`. Quality gates (`check:doctrine`, UI primitives, migrations, dead-relations) run at **release time** via `./scripts/release.sh` / `pnpm check:release-gates` — not on every commit.

> `pnpm ship "msg"` is the **versioned-release** path (bumps version, notifies the ship API). Use it only when the user asks to cut a release — not for routine work.

## Stop-and-ask triggers

Halt and ask the user instead of pushing through when:
- A migration is **not idempotent** or would alter/drop data destructively.
- A check contradicts the code in a way whose fix is **ambiguous** or needs logic/architecture changes.
- The change touches **protected resources** (`admins`, RLS, `SECURITY DEFINER`) — invoke `protected-resources` first.
- A fix would only pass by using a **forbidden escape hatch** (`as any`, `@ts-ignore`, …) — leave it and report.

## Reference

| Thing | Where |
|---|---|
| All-checks runner | `pnpm validate` (`scripts/validate.mjs`) |
| Type sync | `pnpm sync-types` (`scripts/sync-types.mjs`) |
| Migration verify + apply/record | `pnpm check:migrations`; CLAUDE.md → "Database migrations" |
| Type-fix rules | `type-fixing-agent` skill (+ `supabase-type-safety`) |
| Doctrine (new primitives) | `pnpm check:doctrine`; `PRINCIPLES.md` |
| Pre-release gates | `pnpm check:release-gates` or `./scripts/release.sh` (strict; spinner + step labels) |
| Versioned release | `pnpm ship "msg"` |
