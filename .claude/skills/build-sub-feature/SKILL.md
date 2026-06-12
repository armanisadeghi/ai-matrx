---
name: build-sub-feature
description: "Implement a sub-feature — a new capability added INTO a live, existing feature — to a world-class bar. Use whenever the user asks to add, extend, or wire a capability into something that already exists: 'add X to Y', 'extend Y to support X', 'build a new option / button / setting / endpoint / tool for Y', or hands over a sub-feature spec to implement. Runs a fast interview first (basics before code; the user can walk away during exploration), then builds to non-negotiable acceptance criteria: reuse canonical code instead of forking variants, bring the whole stack along (a needed backend contract is part of the work, not a follow-up ticket), propagate shared logic to every surface (web, desktop, Chrome extension, mobile, admin), annihilate anything replaced (no shims, fallbacks, or dead code), and emulate the best systems that already solve this. NOT for whole-feature audits or overhauls (use feature-deep-dive), greenfield standalone features, pure bug fixes, or trivial copy/style tweaks."
---

# Build a Sub-Feature

You're implementing a new sub-feature — an addition to something that already exists in the platform. The spec comes from the user (interview below); the standards are non-negotiable acceptance criteria. Implement to them, and loop until the result actually satisfies them. You're done when it's real, complete, verified, and indistinguishable from work shipped by the best engineering organization on earth — not before.

This isn't greenfield. It's an addition to something live, so the surrounding system is your first concern, not an afterthought. Build so the whole ecosystem is better for this — not just the one spot it lands in.

## Step 1 — Interview: nail the spec before touching code

If the invocation already includes a description, treat it as the overview and interview only for the gaps. Ask in plain chat text — never a structured question picker; it blocks free-form replies.

- Open with ONE quick round of basic questions BEFORE going into the codebase. The user is actively waiting during this step — ask everything together, keep it fast.
- Attach your recommendation or the known best practice to every question that has one, stated plainly, so the user can confirm with a single word.
- End every round with a genuinely open-ended question ("what else should I know that I didn't ask?") — strict questions limit what the user can contribute; the open one is where the unanticipated context arrives.
- The moment you have enough to explore, SAY SO explicitly — "I have what I need; exploring the codebase now — you can step away" — then go. The user plans their time around this signal.
- Exploration surfaces new questions. Bring them back in batches, not one at a time, and keep the interview alive until you have explored all you need and have all the answers you need.

## Step 2 — Explore: know the ground

Before designing or writing anything, establish from the actual code: what this lands inside, what consumes it, what it depends on, what already exists to reuse, and which of the world's best systems already solve this problem well. The standards below tell you what to look for; exploration is where you look.

## The standards — non-negotiable acceptance criteria

**Reuse before you write.** Assume what you need already exists — a component, hook, utility, service, type, or pattern — and go find it. If it almost exists, extend the canonical one rather than forking a variant. Write something new only when nothing reusable fits, and when you do, write it so the next person consumes it instead of rebuilding it.

**Build into the ecosystem, not beside it.** Know the blast radius before you start: what consumes this, what it depends on, and whether the server, database, or shared packages need to change for it to be done *right*. If the backend needs a new contract to support this properly, that contract is part of the work — not a follow-up ticket. A sub-feature that works in isolation while ignoring everything around it is unfinished.

**Propagate across surfaces.** We ship on web, desktop, Chrome extension, mobile, and admin surfaces. Web usually goes first, but "done on web" is not "done." Put shared logic in shared code so every surface inherits it at once, then carry the change to each surface that needs it — or explicitly state why one is excluded. Never reimplement per surface what belongs in one place.

**No legacy. Ever.** If this replaces something, annihilate the old thing: delete it, repoint every caller at the new implementation, and leave nothing behind — no shims, no compatibility layers, no fallback paths, no dead code. We owe our own past nothing, and that freedom is one of the few structural advantages we hold over companies a thousand times our size — so we spend it on purpose. The single exception: two approaches that genuinely coexist because we don't yet know which one wins. Name that explicitly. Everything else gets erased.

**Quality is the baseline, not the target.** Do it correctly and completely the first time — no half-wired states, no "good enough for now," no TODOs left as landmines. Compiling isn't working; it works when it's verified, handles the real edges, and reads like someone competent maintains it tomorrow.

**Mimic what works.** Before you design or implement, explicitly consider the best systems in the world that already do something similar — their principles, layouts, patterns, and concepts. Don't invent from scratch — reuse as much as possible from what has proven to work at scale. Agents produce significantly better results when they emulate excellence rather than reinvent mediocrity. Look at the industry leaders for this type of feature, absorb what makes them successful, and apply those patterns here. Stand on the shoulders of giants.

## Done means

The sub-feature fully delivers what was specified, the next person could reuse what you built, every surface that needs it has it, everything it touches across the stack has been brought along, and not a single trace of the old way is still alive. Verified by exercising it — not by it compiling. If any of that is untrue, you're not finished — keep going.

Build something incredible.
