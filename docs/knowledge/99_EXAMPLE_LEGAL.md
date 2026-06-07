# WC Law as Stress Test

## Why this scenario is the perfect stress test

In CA WC defense, that one sentence is actually two well-defined legal moves:

1. **"didn't follow AMA guidelines"** → impeach Dr. Smith's permanent-impairment rating against the *AMA Guides to the Evaluation of Permanent Impairment, 5th Edition* (the rating standard CA WC adopted under SB 899). Wrong table, misapplied range-of-motion method, no proper rationale, sloppy Almaraz/Guzman analysis — these are the deviations.
2. **"prior injuries / preexisting conditions"** → build **apportionment** (Labor Code §4663/§4664). Every percentage of disability you can pin to a non-industrial or prior cause comes off the employer's liability. That's the settlement lever.

So "hit the Dr hard + get them to settle + facts must be exact" = *impeach the rating + establish apportionment, with every assertion cite-perfect to a primary source.* If the system produces that, it works.

## Step 1 — Lock the scope architecture

Your three scope types are right. One refinement and one optional power-up:

| Scope Type (dimension) | Scope (instance) | Items defined on the *type* | Tagged entities (M2M → `ctx_scope_assignments`) |
|---|---|---|---|
| **Practice Areas** | `CA Workers' Comp` | jurisdiction, rating_standard (=AMA Guides 5th Ed), key_statutes | AMA Guides 5th Ed (Source), MTUS/ACOEM, LC §4663/§4664 text, **deposition Skills** ("Depose an AME on apportionment," "Cross on Guides methodology"), apportionment checklist, objection templates |
| **Clients** | `CSV Pharmacy` (employer/carrier) | carrier, adjuster, settlement_authority | carrier guidelines, correspondence |
| **Cases** | `Case #123456` | case_number, applicant_name (=**John Doe**), employer→Client, date_of_injury, claimed_body_parts, AME (=**Dr. Smith**), status | the AME report, all PTP/prior-treater reports, prior medical records, imaging, depo transcripts, sub rosa video, WCAB pleadings, **and the derived analyses (below)** |

**The wiring that makes it work — cross-scope association:** `Case #123456` is M2M-associated to **both** `CSV Pharmacy` (Client) and `CA Workers' Comp` (Practice Area). That's how the case "inherits" the AMA Guides and the deposition Skills without copying them. The agent's bounded search starts at the Case and expands outward to the scopes it's linked to.

Two things to get exactly right (they're your STOP-rule traps in the wild):

- **John Doe is *not* a Client.** He's the opposing applicant. He lives as a *value* on the Case (`applicant_name`, an attribute) and as an extracted *entity* — never as a Client scope. This is your "attribute vs. M2M" distinction doing real work.
- **`prior_injuries` is an item on the *Cases type*, not on Case #123456.** Every case gets that cell; the background agent fills *this* case's value as a suggestion.

**Optional power-up — a `Physicians` scope type.** Scope = `Dr. Smith`, tagged with *every report and depo transcript he's authored across all the firm's cases*. This is what turns "hit the Dr hard tomorrow" from one-case prep into cross-case intelligence — his rating tendencies, prior inconsistent testimony, pet tables he always misuses. For a WC defense shop deposing the same AMEs repeatedly, this is the highest-leverage scope you can add. I'd build it.

## Step 2 — What the cheap background agents already did (the cheat sheet)

Every time medical records hit the Case, Phase 6 NER ran plus three custom specialist agents on a small/cheap model:

- **"Find Pre-existing Conditions"** → flagged 2019 lumbar treatment, proposed the `prior_injuries` value (a *suggestion*), tagged findings to the Case. Derived artifact, lineage → the source PDFs, `can_be_seeded = false`.
- **"Verify Dr. vs AMA Guides"** → compared Dr. Smith's WPI figure + method against the Guides (pulled from the Practice Area scope), flagged candidate deviations.
- **"Find Dr. Visits"** → built the treatment timeline.

All of it persisted as enriched chunks: *text + embedding + resolved entities + scope links + quality vector + lineage.* These derived findings are **navigation aids, not evidence** — exactly why the quality model refuses to auto-seed them.

## Step 3 — Opus 4.8 at query time (the real deal)

It decomposes the attorney's sentence into structured intents and — crucially — **does not redo the cheap work; it uses it as an index, then verifies.**

1. **Structural bound:** filter everything to `Case #123456`, traverse to its Client + Practice Area.
2. **AMA non-compliance:** jump straight to the "Verify Dr. vs AMA" flags → for each, walk lineage to the **provenance root** (the exact AME-report page) *and* pull the controlling Guides 5th-Ed section from the Practice Area → confirm it's real, cite both. **Any flag that doesn't verify gets dropped** — that's the "get the facts right" guarantee.
3. **Apportionment:** jump to the preexisting-condition findings → verify each against the *original* prior-treatment records → assemble the §4663 argument.
4. **Skills:** load "Depose an AME" → shape output as a deposition outline (foundation → lock testimony → impeach with Guides → establish apportionment).
5. **Goal conditioning:** "settle/hit hard" orders the questions for maximum pressure; "facts exact" means every line carries a pinpoint cite to a primary source — a derived summary never stands alone.

The single move that justifies the entire architecture: **retrieval prefers the clean canonical copy to find candidates fast; verification walks lineage back to the retained provenance root to confirm and cite.** That's only possible because raw was retained by default and lineage was carried end to end. The three score types each pull their weight here — high *NER extraction confidence* on "L4-L5" doesn't make the *source* trustworthy; the *quality vector* says the AME report is primary so its page can be cited directly, while the cheap agent's finding must be backed by one.

Here's the whole flow:Now the full picture — sources at the top, down through processing into the Knowledge Hub, then the attorney's request pulling it back out. Watch the amber box and the dashed arrow: that's the whole differentiator.## Why this example proves the whole thesis

Map it back to your four planes and the example is airtight — every plane does load-bearing work, none collapses into another:

- **Plane 1 (entities):** John Doe, Dr. Smith, L4-L5, ICD codes, dates — extracted, resolved across reports ("lumbar strain" = "low back injury").
- **Plane 2 (pipeline):** all 7 phases fire; the cheap specialist agents are the Agent Fabric attached at Phase 6.
- **Plane 3 (scopes):** Case #123456 is the giant knowledge bucket; cross-scope association reaches the AMA Guides and deposition Skills without copying them.
- **Plane 4 (provenance):** the closing move. Retrieval *prefers* the clean canonical copy to find candidates fast; verification *walks lineage to the provenance root* (the exact AME report page) because the attorney demanded accuracy. Derived findings are an index, never a citation — that's `can_be_seeded = false` in action.

The one sentence that sells it: **the cheap agents built the index; the boss model navigates by it but earns trust by verifying against retained primary sources** — only possible because raw was retained by default and lineage rode along the whole way. Without retention + lineage, "get the facts right" is impossible. That's the architecture justifying itself.

Two things I'd lock before you write this up as the canonical demo:

1. **Add the `Physicians` scope type.** "Hit the Dr hard tomorrow" is exactly where cross-case intelligence about Dr. Smith (rating tendencies, prior inconsistent testimony) turns a good answer into a devastating one. It's the strongest single addition and it showcases the per-org scope flexibility better than Clients/Cases alone.
2. **Pick your reading of "AMA guidelines."** I built the example on the AMA Guides 5th Ed impairment-rating impeachment + §4663 apportionment, which is the dominant CA WC interpretation. If you'd rather the demo attack *treatment* compliance (MTUS/ACOEM) instead, the flow is identical but the Practice Area reference doc and the "Verify Dr." agent change targets.

Want me to write this up as a clean `05_WORKED_EXAMPLE.md` for `docs/knowledge/` — the scope-setup tables, the setup-time agent pre-computation, and the query-time decomposition trace, with explicit STOP-rule callouts where each step could go wrong? It'd slot in right next to the architecture docs as the "this is what it all adds up to" piece.