# Page-pass worker brief (test round)

You are a page-pass worker. Your job: take ONE page to done using the `page-pass` skill, and report honestly how the skill served you — we are testing the skill as much as the page.

## Read first, and nothing else up front
- /Users/armanisadeghi/code/matrx-frontend/.claude/skills/page-pass/SKILL.md
- /Users/armanisadeghi/code/matrx-frontend/.claude/skills/page-pass/page-types.md
Also read the repo's CLAUDE.md (/Users/armanisadeghi/code/matrx-frontend/CLAUDE.md) — it is the repo law. Open other skills only when the page-pass skill sends you there.

## Environment (this overrides the skill's lane table where they differ)
- Repo: /Users/armanisadeghi/code/matrx-frontend — ONE shared checkout on `main`, with dozens of other agents editing at the same time. Other files will be dirty; they are not yours.
- Commit ONLY your own files, by path: `git add -- <files> && git commit --only -m "page-pass(<route>): …" -- <files>`. NEVER `git add .`/`-A`, never commit a file you did not change, never push, pull, rebase, stash, reset, checkout, or create branches/worktrees. The coordinator pushes.
- Do NOT start a dev server (`preview:start`, `pnpm dev`, `next dev`) — the machine cannot afford several. Look and prove on the live site: `TMPDIR=/tmp/pl-<you> pnpm page:look --route <route> --out /tmp/pl-<you>/<name>` (before your change: no --commit). Read the PNGs it writes (use the Read tool on them).
- Your changes reach the live site only after the coordinator pushes and the hourly release deploys. So work in two phases:
  - PHASE A (now): skill steps 1-4 — look, name the type, run the core and type rules, make every fix, focused type check on your files, run the relevant checks and unit tests, sync any surface DB mirror you changed (`pnpm exec tsx scripts/sync-surface-manifests-direct.ts --surface <name>` then `--check --surface <name>`), commit. Then STOP and return your Phase A report.
  - PHASE B (you will be resumed with a message once your commits are live): step 5-6 — prove live with `page:look --commit <sha>` and `surface:probe --commit <sha>` (plus `--agent` for write targets), fix what the proof shows, then the final report.
- Type check: `tsconfig.focused.<you>.tmp.json` in the repo root as the skill says, with YOUR name in the filename; delete it after. Probe/look runs: always your own TMPDIR.
- Supabase: project_id `brsgrqvjdzwihsvnfqkf`, read-only SQL for evidence. Test data you create is named `PP test — …` and listed in your report. Never modify records you did not create.
- Questions for Arman: do NOT file them. Write `ARMAN-QUESTION: <question, background, your recommendation>` in your report and continue with your recommended default.
- Time box: Phase A about 60-90 minutes of work. Fix the biggest problems first. If the page is huge, finish the core areas properly rather than touching everything shallowly, and list what is left.

## Your Phase A report (return exactly this)
```
PAGE: <route> — type <x> — surface <name or "none → created X">
FIRST LOOK (before reading rules past step 1): every problem you saw, one line each
FIXED: <what, file, commit sha>
CORE 1-7 + TYPE ADDITIONS: <area> <verdict> — <one line>
NOT DONE: <what, why>
COMMITS: <sha list>
RULE GAPS: problems you saw that no rule in the skill covered
SKILL FRICTION: anything in the skill that was unclear, contradictory, wrong about the code, missing a command, too long, or sent you to a dead end — quote the line
SHARED: <shared-component defects seen here: file, symptom, evidence>
PERSON→AGENT MAP: <each create/edit control → its write target, or the gap>
ARMAN-QUESTIONS: <if any>
```
