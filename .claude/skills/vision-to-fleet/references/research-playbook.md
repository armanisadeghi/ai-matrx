# Vision → Fleet: competitive research playbook

How to run Phase 3 so it produces the education-grade insights doc PLUS the two capture steps
that run missed (screenshots, design). Worked example output:
`docs/proposals/COMPETITIVE_INSIGHTS_AND_REPRIORITIZATION.md`.

## Step 1 — Pick the right competitors (this decides everything)

**Benchmark against the best in the world at the FUNCTION, never against AI-engine peers.**
We are an AI-application company, so our features span functions other companies have spent a
decade perfecting. Building a file system → Google Drive/Dropbox, not a RAG product's file
handling. Notes → Notion/Obsidian/Apple Notes. Billing → Stripe's checkout + the FTC record.
Scheduling → Calendly/Linear cycles. Study tools → Quizlet/Anki/NotebookLM (the education run).

Assemble 8–10 entries across four buckets:
1. **The incumbent giants** (whose scale proves the demand and whose reviews reveal the rage).
2. **The niche masters** (small players who are the best at one narrow slice — often the
   richest steal-list; find them via "best X for Y" listicles, Reddit recommendations, G2
   categories).
3. **The AI-native challengers** in the space (what the wave proved/failed to prove).
4. **The adjacent giant** whose pattern transfers (NotebookLM for grounding, Duolingo for
   engagement mechanics — include one even if not a direct competitor).

Sanity check with Arman if the function framing is ambiguous — one question, early, cheap.

## Step 2 — Fan out the research passes

One deep-research agent per competitor/cluster, all in parallel (deep-research skill or
WebSearch-equipped general agents). Each pass mines **real user sentiment, 2024–present**:
Trustpilot, both app stores, Reddit (often via secondary coverage — Reddit blocks crawlers;
flag secondhand sourcing), G2/Capterra, feature-request boards, news, academic papers,
regulatory/legal records (an FTC settlement is a gift: it's a competitor weakness that is
*public record*, safe to market against).

Each pass returns a structured brief:
- What they NAIL (the steal list) — features, flows, mechanics, network effects
- What users HATE them for (the wedge list) — with the receipts (star ratings, quotes, records)
- Pricing + free-tier shape, and how users feel about it
- Trajectory (growth, layoffs, pivots, acquisitions)
- **The one thing to take** — forced single answer; this populates the §2 table

Rules: cited claims only; self-reported marketing numbers ("3M switched!") flagged as
directionally-credible-not-verified; distinguish teacher/enterprise sentiment from
individual-user sentiment when they diverge (Quizlet: 4.5★ teachers vs 1.4★ consumers — the
split WAS the insight).

## Step 3 — Visual capture (missed on the education run — mandatory now)

In parallel with Step 2, browser-capable agents (claude-in-chrome tools / Playwright-style)
walk each competitor's product and capture screenshots of: onboarding + empty states, the hero
feature in use, the paywall/upgrade moment, pricing page, the signature interaction, mobile
web if it matters. Public marketing pages and free tiers only — no credentialed scraping of
gated content beyond a normal trial account Arman approves.

Store under `docs/proposals/research-assets/<competitor>/` with descriptive filenames and one
`INDEX.md` per competitor (screenshot → what it shows → why it matters). Reference the index
from the insights doc. Download marketing/product images the same way when they carry design
information screenshots can't.

## Step 4 — Design pass (also previously missed)

After visuals exist: for each major surface the plan will build, produce a short design
direction — which competitor's treatment of this surface is best-in-function, what we adopt,
what we deliberately reject (with the sentiment evidence: "public leaderboard shame → private/
team-scoped"), and any distinctive-look notes. Use the web-design / ui-* skills for vocabulary.
Output: a `## Design direction` section in the insights doc (or a sibling doc if large),
per-surface, terse. Build-phase briefs then cite it in Build guidance — agents inherit
direction instead of each inventing an aesthetic.

## Step 5 — Synthesize

Write the insights doc per the template (templates.md §2). The discipline that made the
education one work:

- **Thesis first**: one paragraph that explains the market moment and ends in the positioning
  sentence. If you can't write it, the research isn't done.
- **Signal counts**: every ranked want cites how many of the N passes surfaced it ("9/9" is an
  order; "2/9" is a hunch).
- **Wedge = their hatred × our existing pieces.** The highest-leverage findings are where users
  are furious at everyone AND we already own the missing piece (education: fake SRS everywhere
  vs our live FSRS spine). Call these out explicitly.
- **Proposed vision changes are FOR APPROVAL** — split "elevate" (already in the vision,
  research says promote it) from "add" (genuinely new). Phase 4 takes them to Arman directly.
- Map every insight onto the existing plan: NEW project / ELEVATE existing / feature-add to an
  owner. An insight that maps to nothing is either a deferral doc or gets dropped consciously.
