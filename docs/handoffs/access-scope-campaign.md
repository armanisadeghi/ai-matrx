# Handoff — Access, Scope-Context & Security-Philosophy Campaign

**Owner:** Arman. **State: 2026-07-21, all work committed + pushed to main in ai-matrx, aidream, matrx-common-docs.** Read the three source-of-truth docs before touching anything access- or scope-related: `common-docs/systems/db-rules/FEATURE.md` §6 (rules + THE SECURITY PHILOSOPHY), `common-docs/systems/access-architecture/FEATURE.md` (live-verified mechanics), `common-docs/systems/scope-context-system/FEATURE.md` (the scope/context model, in the owner's own words).

## Rules of engagement (unchanged, non-negotiable)

1. **Source of truth = Arman's words or the live DB** — in-repo prose is mostly agent-generated and often wrong.
2. **THE SECURITY PHILOSOPHY:** right people in without blinking; wrong people out no matter what. Over-tightening is a defect. Never add a security layer on your own authority.
3. **Agents act as their user** — what the user sees is what their agent sees. One kernel: `iam.has_access_for` / `acting_as_user`+RLS.
4. **Access never keys on the active organization** — user-based only.
5. A migration counts only when applied live + verified + ledgered + types regenerated.

## What was done (short)

- **Access system-of-record built and live-verified**; two diverged rulebooks merged into one; gap list G1–G16 with resolution log.
- **One share-link system** (`platform.share_links` + `/s/[token]`); legacy files lane removed.
- **One access resolver** (`iam.has_access_for`); duplicate resolvers/predicates dropped; a studio-sharing bug and drifted copy killed in the process.
- **Registries reconciled** (22 entity registrations, 9 token renames, defaults fixed).
- **Scope → agent context shipped** (Brief 2): durable chat↔scope edges, per-round lazy seeding + resolver, ask-on-mismatch dialog; tagging = read-only sharing for notes/files; chats stay their owner's.
- **One Python enforcement kernel** (Brief 5): notes adapter, rag, scraper, and the agent note tool (which had NO check) all ride the resolver.
- **Marketing access hell diagnosed**: `private` defaults + silent 0-row writes + one broken resolver call; residue = zero after cleanup.
- **`private` renamed to `personal`** live (enum + 8 DB functions + both codebases, ~250 files, verifier passes, wire-compat shim for old clients); **80 wrong visibility defaults reclassified** (personal = individual artifacts only; org work → internal; scraped/derived → public); tier definitions rewritten; doctrine placed in both CLAUDE.md files + db-rules §6.

## Watch out for / still open

1. **Deploy order:** aidream FIRST (carries the `"private"→"personal"` coercion), then FE. Until both deploy, production writes of the old value fail loudly.
2. **Regen follow-ups after deploy:** aidream `db/generate.py` (4 package model files were hand-patched), `docs/TOOLS.generated.md`, FE `pnpm sync-types` (api-types unions were hand-patched).
3. **Existing ROWS still carry `personal`** on org-work tables (defaults were fixed; data was not). Backfilling rows to `internal` changes real visibility — **Arman's call, not an agent's.** Until then, old rows stay locked to their creators.
4. **`link` tier is inert** (behaves as `internal`; nothing tests it). Either activate or retire it deliberately — don't build on it.
5. **Open briefs** (`common-docs/systems/access-architecture/DECISION_BRIEFS.md`): Brief 1 (Module Settings as the one org-admin knob + the agent/skill `moduleKey` collision), Brief 3 (shared-with-me + mine-first list contract; `is_discoverable` unused by list surfaces — G14), Brief 4 (`/p/e` allowlist → registry flag).
6. **Arman to confirm** the agent read-only contract is honored server-side (builder UI done), and whether tasks/threads/war-rooms also get tagging-is-sharing (one `association_types` row each).
7. **Recurring failure modes to police in reviews:** new tables defaulting to the lowest visibility without a personal-artifact justification; any access check reading the active org; hand-rolled owner/permission ladders instead of the kernel; silent 0-row RLS-filtered writes (use the `assertMutated` pattern); "security theater" guards that block legitimate owners.
