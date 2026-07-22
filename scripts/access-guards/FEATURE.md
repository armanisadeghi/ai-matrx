# Access Guards — FEATURE.md

Enforcement piece of THE SECURITY PHILOSOPHY and THE VIEW LAW
(`CLAUDE.md` §Supabase, `common-docs/systems/db-rules/FEATURE.md` §6).

Script: `scripts/check-access-guards.ts` · Command: `pnpm check:access-guards`
(`:strict` variant exits 1 on FAIL findings). Wired into `pnpm check:release-gates`.
Advisory only — nothing runs it at commit time; a human or agent runs it.

## What it catches, and why

1. **LOWEST-TIER DEFAULT** — new code/migrations defaulting a row to
   `'personal'` visibility without a `personal-justified:` comment within 3
   lines. `'personal'` means "belongs to an individual person" (chats/DMs);
   defaulting other data to it silently locks out legitimate org users — the
   opposite of the security goal. Migrations filed before 2026-07-21 (the
   `visibility` rename/policy date) are auto-exempt by filename date.

2. **ACTIVE-ORG ACCESS** — access decisions must key on the user, never the
   currently-selected organization. Heuristic (a): an active-org selector
   (`selectEffectiveOrganizationId`, `selectActiveOrganizationId`,
   `selectOrganizationId`, `selectHasExplicitOrganization`,
   `selectActiveOrganizationName` — from `lib/redux/slices/appContextSlice.ts`
   and `features/scopes/redux/selectors/active-context.ts`) referenced inside
   `utils/permissions/**`, `utils/auth/**`, or any file whose basename matches
   `/access|permission|guard/i`. Heuristic (b, WARN-tier, conservative): an
   `.eq("organization_id"`-scoped query within ~25 lines after such a selector
   read in the same file — a rough proxy for "same function"; it will miss
   cases and can false-positive on legitimate org-scoped *list* filters that
   aren't access decisions. Read the surrounding function before trusting a
   WARN.

3. **HAND-ROLLED LADDER** — the permission ladder lives in one place,
   `utils/permissions/**`. Anything else defining a `LEVEL_RANK`-style map or
   comparing `permission_level` with `>=`/`<=`/`.includes(...)`, or containing
   a `'viewer'`/`'editor'`/`'admin'` triad shape, is a second competing
   authority — the exact bug class `platform._mirror_fk_to_assoc` is banned
   for on the DB side, mirrored in application code.

4. **BARE-RLS LIST** — THE VIEW LAW: every list-shaped Supabase read
   (`.from(` + `.select(` + one of `.order(`/`.limit(`/`.range(`) inside
   `features/**/{service,services,redux}/**` must carry a visible owner/org/
   container scope in the same chain (`.eq("created_by"|"user_id"|
   "organization_id"|"<fk>_id"...)`, `.in("id", ...)`, an `.rpc(` call, or a
   wrapping `applyListScope(...)`), or an explicit `// VIEW LAW: <reason>`
   comment within 5 lines. RLS alone is not defense in depth — a policy bug
   or a future RLS relaxation must not turn every naive list query into an
   information leak. Single-record reads (`.eq("id", ...)` / `.single()`) are
   exempt — they aren't "list" reads. **This detector has known false
   positives** — it's a heuristic over a 12-line text window, not a real
   query-chain parser. The goal, once the concurrent 14-surface bare-RLS fix
   wave lands, is zero findings on the live tree; new findings after that
   point are real regressions.

## Allowlisting

`scripts/access-guards/allowlist.json` — one array per detector
(`lowestTierDefault`, `activeOrgAccess`, `handRolledLadder`, `bareRlsList`).
Each entry: `{ file, line?, justification, addedBy, date }`. `line` omitted =
file-level allow; otherwise matches within ±2 lines of the finding. Adding an
entry without a real `justification` defeats the point — this file is
reviewed like code, and an unjustified entry should be rejected in review.

## Known current findings (informational, tracked here so a re-run isn't a surprise)

As of 2026-07-22, a full-tree run reports **0 FAIL / 63 WARN**, no
LOWEST-TIER DEFAULT or ACTIVE-ORG ACCESS findings on the live tree. The WARNs
split: ~30 HAND-ROLLED LADDER (mostly `"viewer"|"editor"|"admin"` type unions
and `<SelectItem>` labels — genuinely ambiguous between "cosmetic" and "should
route through the canonical ladder", hence WARN not FAIL) and ~33 BARE-RLS
LIST hits across `features/agents`, `features/scopes`, `features/surfaces`,
`features/transcripts`, `features/transcript-studio`, `features/scheduling`,
`features/code-files`, and `features/memory` — these correspond to the known
concurrent bare-RLS fix wave (adds `applyListScope(...)` calls or
`// VIEW LAW:` comments). Do not hardcode this count as a target — re-run the
script for the live, exact list; the goal is 0 findings once that wave lands,
and any *new* finding after that point is a real regression, not noise.
