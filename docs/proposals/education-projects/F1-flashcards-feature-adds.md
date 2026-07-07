# F1 — Flashcards Feature Adds *(addendum for the ACTIVE flashcards agent — not a new assignment)*

> **Status date:** 2026-07-07. The flashcards tool (~90% done) stays with its current agent, who
> already owns: view/edit gate + duplicate-to-edit (**now P7's — hand off, see P7 brief**),
> image/audio card attachments, enhance/expand UI, `microCoach` (**now P2's — hand off, see P2
> brief**), FastFire mid-session adaptation, and list pagination. The competitive research
> ([`../COMPETITIVE_INSIGHTS_AND_REPRIORITIZATION.md`](../COMPETITIVE_INSIGHTS_AND_REPRIORITIZATION.md))
> adds the items below to that same queue. Flashcards is the reference implementation for the
> whole hub — what lands here becomes the pattern every tool copies.

## Added items (priority order)

1. **Confidence-tap rating UX** — Brainscape's one-tap 1–5 confidence rating is its single most
   loved interaction, and ours feeds a *stronger* engine (FSRS vs their weaker CBR — 89% vs 82%
   retention in the research). Add the one-tap confidence rate to the classic/learn study flows,
   flowing into `recordAttempt` grades. The vision (§2) already promises confidence-based rating.
2. **"Make this deeper" per card** — the depth-on-demand consumer surface. The `enrichCard`
   (`9f8eab67-…`) and `expandCard` (`5f77de33-…`) agents already exist with live UUIDs; the
   "Enhance" button is currently a coming-soon toast (`SetDetailView.tsx:352-359`). Wire them,
   with depth-tier choice (rote → applied → exam-level) in the request. Coordinate tier
   vocabulary with P1 so cards and quiz items share it.
3. **Rich item types** — cloze deletions and matching pairs as card variants (MCQ stays P1's
   domain). Brainscape is dinged for basic-Q&A-only; Anki's cloze is beloved. Extend `fc_card`
   via its existing detail/metadata model — no parallel card table.
4. **Never-lose-work surfacing** — autosave indicators + a version-restore affordance in the set
   editor (platform versioning underneath; coordinate with P9's ownership/export work — Knowt's
   data-loss reputation is the wedge).
5. **Mastery visualization** — per-card/per-deck mastery states visible in the editor and set
   detail (Brainscape's mastery viz is its retention hook); read `item_mastery`, coordinate
   display language with P5's dashboards.
6. **TrustEnvelope adoption (P0)** — flashcards generation is P0's reference retrofit; expect
   that collaboration (citations on generated cards, verify-against-source in the editor).
7. **Integrity/positioning copy pass** — set-creation and study surfaces adopt the
   grounded-in-your-material framing (with P0/P8's brand voice).

## Hand-offs OUT of the flashcards queue (APPROVED by Arman 2026-07-07 — final, effective now)

- **View/edit gate + duplicate-to-edit → P7** (flashcards is P7's reference implementation — the
  work happens on your surface, P7 drives; stay in the loop).
- **`microCoach` authoring → P2** (the no-op wiring you built stays; P2 authors the agent and
  sets the id — coordinate so nothing double-lands).
- **Quizlet-import hardening / Anki import / deck export → P9** (also on your surface; same
  arrangement as P7).

## Still yours, unchanged

Image/audio card attachments (via `fileHandler` — Phase 1A fast-follow), FastFire mid-session
adaptation (the research's Quizlet-wedge "live session adaptation" differentiator — this is a
signature feature, keep priority high), server-side list pagination (search already done in
`flashcardPersistenceService`).
