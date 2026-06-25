# DB Changeover — Handoff / How to Resume

> If you're picking this up (a fresh agent, a teammate, or future-me): **read `CHANGEOVER_PROGRESS.md` first** — it's the live status. This doc is the orientation + "how to resume" layer on top of it.

**As of 2026-06-24:** multi-agent rebuild on `main`, production in changeover. No fixed deadline ("a day or a month").

## What's done
- **Waves 0–2** (entity_types, scaffolding/RLS engine, associations + categories + user_entity_state): complete.
- **Wave 3 base retrofit: 28 tables** retrofitted (cx ×10, agx ×4, prompt ×5, note ×5, canvas ×2, ctx-warroom ×2). Live count = `select count(*) from pg_trigger where tgname='_touch_row' and not tgisinternal`.
- **Wave 4 renames done (non-breaking, compat views):** `file_*`→`cld_*` (7), `ctx_war_room_*`→`wr_*` (6).
- **Generic shared tables built** (by the user's ctx agent): `iam.invitations`, `iam.memberships`, `platform.comments`, `platform.activity_log`.

## Tools (use these, don't reinvent)
- **`db-table-retrofit` skill** (`.claude/skills/db-table-retrofit/SKILL.md`) — the per-table recipe.
- **`platform.retrofit_entity(table, token, strategy, owner_col, parent_table, parent_fk, legacy_trigger)`** — the one audited additive routine. strategy = `personal` | `parent` | `keep`. Self-verifies 0-null-org.
- **Rename pattern — 3 MANDATORY steps (a rename is NOT done after step 1):**
  1. DB: `ALTER TABLE RENAME` + `CREATE VIEW old WITH (security_invoker=true) AS SELECT * FROM new` + repoint `entity_types`.
  2. **⚠️ IMMEDIATELY regenerate aidream's DB layer (via subagent) — skipping this caused a server outage 2026-06-24.** In `/Users/armanisadeghi/code/aidream`: `uv run db/generate.py`, then fix broken model/manager **imports** (the generated code does `import db.managers.<table>` and references class names by table → a rename breaks the import and the backend won't start; **compat views do NOT save this** — they only cover runtime SQL, not Python import graphs), then verify `uv run python -c "import db.models"` exits 0 **and** grep for old **class-name strings** — registries resolve models by name (`getattr(db.models, '<Name>')`), which a clean import never trips but breaks at **runtime** (the 2026-06-24 outage left `services/references/resources.py` pointing at the deleted `CtxWarRoomSessions` until a subagent caught it). See [compat-view-drop-repoint-list.md](./compat-view-drop-repoint-list.md).
  3. FE types: `pnpm db-types`.

## The gates (do NOT cross without the user)
- **PITR unconfirmed** → no column drops, no `NOT NULL`, no table-drops. Everything to date is additive/reversible.
- Drops also need: consumer audit (FE + **both** Next.js admin dashboards + the Python admin), then **move-to-graveyard** (never `DROP TABLE`).

## In flight / who owns what
- **Lead (this agent):** the retrofit sweep + Wave-4 renames + merging branches + the tracker.
- **War Room agent** (`claude/inspiring-ride`): owns `wr_*` (just renamed; they migrate their FE off the `ctx_war_room_*` compat views).
- **ctx-planning agent + the user:** own the `ctx` Group-B transition — now unblockable (`ctx_project_invitations`→`iam.invitations`, `ctx_task_comments`→`platform.comments`, `ctx_project_members`→`iam.memberships`). **Don't start ctx autonomously.**
- **rs_ (Research):** delegated, in flight.

## How to resume (the cadence)
1. `git fetch --all --prune`; **merge any `claude/*` branch ahead of `main`** (resolve tracker conflicts by combining to the live count); push.
2. Integrate any finished delegated retrofit → set the tracker's Retrofitted count to the live `_touch_row` count.
3. Delegate the next clean group (file-read brief: "READ `.claude/skills/db-table-retrofit/SKILL.md` as a file", never "invoke the skill"). Candidates: aga, udt, skl, studio, flashcard, dict, ui, kg.
4. **Read `KNOWN_DEFECTS.md`** — multiple developers now log cross-cutting findings there; check its updates each session.

## Open follow-ups
- Version double-bump: agx/prompt/notes have bespoke `version`-snapshot triggers that double-bump with `_touch_row` — reconcile in the Base-3 `*_versions` pass.
- `cx_agent_task.created_by` is an enum → needs an FE consumer audit before the `created_by_kind` rename.
- Compat views (`file_*`, `ctx_war_room_*`) drop only after consumers migrate to the new names.
