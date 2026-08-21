---
name: cross-repo-docs
type: Skill
title: cross-repo-docs — the one-truth/pointers/zero-mirrors system
description: The system for documentation that spans multiple AI Matrx repos — one canonical doc in the common-docs repo, pointer lines everywhere else, zero mirrors. Use whenever (1) you're documenting, auditing, or building a feature that touches 2+ repos (aidream, matrx-frontend, my-matrx, matrx-extend, matrx-local, ...), (2) you're about to create or edit anything under /Users/armanisadeghi/code/common-docs/, (3) you find the same feature documented in more than one repo (drift/duplication — this skill is the fix), or (4) you're deciding WHERE a new doc should live. NOT for single-repo docs — those follow that repo's own FEATURE.md/context-docs system.
tags: [meta, docs-system, okf]
timestamp: 2026-07-10T00:00:00Z
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/cross-repo-docs/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# Cross-repo docs — one truth, pointers everywhere, zero mirrors

## Why this exists (the failure modes it kills)

1. **Duplicates rot independently.** A feature touching three repos, documented three times, is
   three docs drifting apart — every future agent inherits whichever wrong copy it opened first.
2. **Single-repo docs teach single-repo thinking.** An agent that finds its repo's copy stops
   looking, and ships the aidream half of a feature while the matrx-frontend and my-matrx halves
   silently stay broken. The pointer forces the agent to see the WHOLE feature — every repo it
   touches — before working on any piece of it.

## The home

`/Users/armanisadeghi/code/common-docs/` — its own git repo, remote
`https://github.com/AI-Matrix-Engine/matrx-common-docs` (private). **Bootstrap on a machine that
lacks it:** `git clone https://github.com/AI-Matrix-Engine/matrx-common-docs.git ~/code/common-docs`
(clone it as a SIBLING of the other repos — the skill sync resolves them that way). Push after
committing — other machines and cloud sessions read from the remote.

**A one-repo sandbox does not need this bundle to follow the shared skills.** Every cross-repo
skill is distributed as a real committed file in each repo (see § Shared skills), so it works
offline; only editing/syncing them needs the bundle.

**Subjects are governed by the Feature Registry** (`policies/feature-registry.md` +
`meta/registry.yaml`, ruled 2026-08-20): every capability is a node — Domain → Feature →
Sub-feature — anchored to real code, no orphans, ONE doc home per node. Find (or propose)
the node BEFORE deciding where a doc goes.

**Layout — seven fixed root branches** (the enumerated vocabulary lives in
`policies/document-types.md` § The bundle's root branches, and every repo's docs guard enforces
that exact set — a pointer into anything else fails the gate):
- `systems/` — registry-node homes (target shape `systems/<domain>/<feature>/`), each holding
  the node doc kit: `VISION.md` (Arman's words), `STATE.md` (the ONE verified truth + pending
  list — absorbs the old SOR FEATURE.md), `DECISIONS.md` (rulings ledger), `HANDOFF.md` (the
  work order — cross-repo work orders live HERE, ruled 2026-08-20), plus satellites.
- `projects/<project>/` — time-bounded CROSS-FEATURE campaigns declaring `touches:` (registry
  slugs); every project doc carries a `Status:` line; finished → `projects/archive/`.
- `policies/` — platform doctrine, including the **Feature Registry policy** and the
  **document-types taxonomy and authority ladder** (`policies/document-types.md` — VISION >
  POLICY > STATE > repo local-mechanics docs > guides; plans/handoffs/history have no
  authority). Read both before creating any doc.
- `operations/` — live shared **registers**: the lists, boards, and rosters that agents in more
  than one repo write to (the unassigned-handoff list, the attention board, the doc-migration
  board). A register cannot live in a repo — see rule 2 below.
- `inbox/` — Arman's protected dump lane: lint-exempt, **agent deletion forbidden**, triaged
  daily by the docs-steward per `inbox/README.md`. Agents never file their own material here.
- `meta/` — the bundle's machinery (OKF spec, `registry.yaml`, lint + sync scripts). `skills/`
  stays at root (symlink-stable). Adding another branch means editing the policy AND every
  repo's guard in the same change. No loose root `.md` besides README/index/log.

**Filing test:** node truth → the node's home in `systems/`. Cross-feature work →
`projects/`. Doctrine → `policies/`. Shared register → `operations/`. Raw Arman input →
`inbox/` (his lane, not yours). Finished → archive now, same session. Genuinely repo-local
mechanics → that repo; **everything with meaning is centralized here** (Arman's
centralization ruling, 2026-08-20 — repo FEATURE.md files hold local mechanics only).

This skill's canonical copy lives at
`skills/cross-repo-docs/SKILL.md` inside that repo; `~/.claude/skills/cross-repo-docs` is a
symlink to it — edit the repo copy, never a detached copy.

## The rules

1. **One doc, zero mirrors.** Cross-repo truth is written exactly once, here. Repos link to it;
   they NEVER paste sections. Caught yourself copying a paragraph into a repo doc? Replace the
   paragraph with a pointer line.
2. **Placement test — "who has to read this?"**
   - Everything about it lives in one repo → that repo, beside the code, per its own
     FEATURE.md/context-docs system. NOT here.
   - Two or more repos must agree on it (a shared DB, a wire protocol, a security model, a
     rendering contract) → here, one doc, with a **"Repositories" section up top naming every
     repo it touches and what each one's role is** (see `systems/cms-system/STATE.md` — that section is
     mandatory, it IS the cure for single-repo thinking).
   - Execution plans / project briefs for work inside ONE repo → that repo, linking here for
     the system-of-record. Briefs are temporary; the doc here is durable. **This is not a
     general escape hatch:** a plan whose work spans repos goes in `/projects/`, and "most of
     the work is in repo X" never moves cross-repo TRUTH into repo X. (Misused exactly this way
     on 2026-08-14 to justify filing a cross-repo register into matrx-frontend.)
   - A shared **register** — a list, board, index, queue, or roster that agents in more than one
     repo write to → always here (`/operations/`), never a repo. The test: *if an agent working
     in another repo would need to edit this file, it cannot live in this one.*
3. **Pointer lines, not summaries.** In each touched repo, the pointer goes where an agent working
   on that feature will trip over it — the feature's own FEATURE.md if the repo has one, else the
   repo CLAUDE.md. Format (one line, no content restated):
   `Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/<dir>/<doc>.md — read it before touching this feature in ANY repo.`
   Creating a new doc here without planting its pointers in every touched repo is an unfinished
   job — the doc nobody is routed to doesn't exist.
4. **Same truth discipline as everywhere else.** A doc here is a promise it is currently true:
   verify claims against live code and live DBs before trusting OR editing; stamp the
   verification date at the top; changelog substantive edits; a superseded doc gets a loud
   pointer to its replacement, never silent deletion.
5. **Full-document review on every edit.** Editing one section means re-reading the whole doc for
   anything your change invalidates — same standard as the repos' context-docs skill.
6. **Commit in the common-docs repo itself.** Small commits, imperative subject, and if repo
   pointers changed too, commit those in their own repos in the same session. `git status` before
   committing — other sessions work here too.
7. **Found a duplicate?** You own it (find-it-own-it): pick the most complete/current copy, merge
   any unique truth from the others into the common-docs doc, replace every other copy with a
   pointer line, and note the merge in the doc's changelog. Never leave two copies "for safety."

## Shared skills — the ONE exception to "zero mirrors", and why

Docs get a pointer. **Skills cannot** — an agent's harness only sees skills physically present at
`<repo>/.claude/skills/<name>/SKILL.md`, and agents routinely run in a sandbox that has checked
out exactly ONE repo. There, a symlink into this bundle dangles and the skill silently
disappears; a pointer stub points at a path that does not exist. Both failure modes are silent,
which is the worst kind. (Both were live here until 2026-08-14: `cross-repo-docs` was a
user-level symlink, and aidream's `handoffs`/`handoff-cleanup` were stubs saying "read the
canonical at /Users/…" plus a hedge for when it is "unreachable".)

**So a cross-repo skill is deliberately mirrored, mechanically:**

- **Canonical body:** `skills/<name>/SKILL.md` here. This is the only file a human or agent edits.
- **Distribution:** `skills/distribution.json` declares which repos consume each skill;
  `python3 meta/scripts/sync_skills.py` writes a **byte-identical, committed copy** into each
  repo. Every copy (and the canonical) carries a `SYNCED COPY — do not edit here` banner
  immediately after the frontmatter, so an agent that opens the copy is told where truth lives.
- **Drift guard:** `python3 meta/scripts/sync_skills.py --check` fails when any copy differs or
  is missing. Repos run it as a loud, non-blocking gate (`pnpm check:shared-skills` in
  matrx-frontend; `python scripts/check_shared_skills.py` in aidream) and skip with a scream when
  the bundle is not checked out.
- **A repo that is not checked out is reported SKIPPED, never silently passed** — a skipped repo
  means an un-synced skill.

**Adding one:** write/move the body here → add it to `distribution.json` → run the sync → commit
all touched repos in the same session. **Never** hand-copy a skill between repos, and never
"fix" a copy in place: the next sync overwrites it and your edit is gone.

**A skill belongs here only when its subject is cross-repo** (the handoff system, this doc
system). A skill about one repo's own code stays in that repo, unmirrored — mirroring
repo-specific skills is how you get 70 files to keep in sync for no benefit.

## This bundle is OKF v0.1 — the format rules (non-negotiable)

The repo is a conformant **Open Knowledge Format** bundle — the vendored spec at
[/okf/SPEC.md](/meta/okf/SPEC.md) is the normative reference (Arman adopted it as a platform-wide
standard; the same setup is planned for every user sandbox). Every edit here keeps it conformant:

1. **Every non-reserved `.md` gets YAML frontmatter with a non-empty `type`** (§9). House `type`
   vocabulary — reuse before inventing: `State`, `Vision`, `Policy`, `Plan`, `Handoff`,
   `Register`, `Guide`, `Reference`, `Skill`, `Specification` (legacy docs may still carry
   `System of Record` until migrated). Recommended fields in priority order: `title`,
   `description` (one sentence — index entries reuse it verbatim), `resource` (URI of the
   underlying asset: Supabase dashboard URL, GitHub repo/tree, route), `tags`, `timestamp`
   (ISO 8601, last MEANINGFUL change — not every touch).
2. **Reserved files:** `index.md` (directory listing) and `log.md` (history) — never concepts.
   Index bodies are ONLY `# Section` headings + `* [Title](url) - description` bullets; no
   frontmatter except the bundle-root index, which carries exactly `okf_version: "0.1"`. Log
   entries group under `## YYYY-MM-DD` headings, newest first, `**Update**`/`**Creation**`/
   `**Deprecation**` bold-keyword convention.
3. **Links between concepts are bundle-relative** (`/systems/cms-system/STATE.md`) — stable under moves.
   Broken links are tolerated by consumers (§5.3) but the linter warns; fix or justify.
4. **After ANY .md create/move/edit:** update the affected `index.md` entries, add a `log.md`
   line under today's date, and run `python3 meta/scripts/okf_lint.py` — it must print CONFORMANT
   (exit 0) before you commit. The linter hard-fails only on the three §9 conformance rules and
   warns on everything else, exactly as the spec's permissive-consumption model requires.
5. **Body style** (§4.2): favor structural markdown; use the conventional headings `# Schema`,
   `# Examples`, `# Citations` when applicable.

The pointer-lines planted in OTHER repos are outside the bundle and are NOT OKF-governed — they
keep using plain absolute filesystem paths.

## Recipes

**New cross-repo doc:** confirm it fails the placement test's single-repo branch → find (or
propose) the subject's registry node → node truth goes INTO the node's `STATE.md` (create the
kit file if the node home lacks it; a brand-new node gets `status: proposed` in the registry)
— never a new parallel doc beside an existing STATE; cross-feature work → `projects/<project>/`
with a `touches:` list. Every truth doc carries: verification-date line, Repositories table
(repo | role), the truth, changelog → commit → plant pointer lines in every touched repo →
commit those. (Unmigrated node homes still carry a legacy `FEATURE.md` — edit THAT in place
rather than creating a competing STATE.md; the doc-migration board owns the rename.)

**Editing an existing doc:** read it whole → verify the claims you're building on against live
code/DB → edit in place (merge, don't append addenda) → bump the verification date + changelog →
commit → check the pointers still resolve (a renamed doc orphans its pointers).

**Working a cross-repo feature (not editing docs):** read the common-docs doc FIRST, note every
repo in its Repositories table, and treat the feature's full surface — not your current repo — as
your scope. A change that alters cross-repo truth (a schema, a route, a security posture) updates
the doc here in the same session, same weight as code.

## Current contents

The root [/index.md](/index.md) is the always-current listing — never duplicate it here.
