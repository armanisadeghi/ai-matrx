---
status: blocked
updated: 2026-07-28
repos: [matrx-frontend, aidream]
vision: []
---

# AMA Guides 5th — spine consolidation

**Blocked:** the spine lost ~5,035 chunks and every derived chunk between 2026-07-14 and
2026-07-24. Do not run Continue/Rebuild until that is explained — see Decisions.

## Vision — Arman's words

> "All I we need to do is to determine which file is our spine, then attach the best of the best to it until we have everything together. But it's got to be accurate."

> "Trying to save the excerpt is not worth it. We'll waste too much time."

**(inferred)** Consolidate on one canonical file + processed-doc tree only. No excerpt merge.

## Spine registry (canonical — do not change)

| Role | ID |
|---|---|
| **File** | `e9868104-e276-4cdb-97a4-b948a13eb135` |
| **Root processed doc** | `f3cf55a1-19b1-4d2e-a95c-fb7c449f9eb2` |
| **AMA-G5 store** | `0158e878-1bab-4c91-9597-da4e8951c2a7` → member `e9868104` |

**UI entry points:**
- `/files/f/e9868104-e276-4cdb-97a4-b948a13eb135` → Document / Knowledge Assets
- `/rag/library/f3cf55a1-19b1-4d2e-a95c-fb7c449f9eb2/preview`

## Resources

- `features/rag/components/library/KnowledgeAssetPanel.tsx`
- `features/rag/api/derivations.ts` — resume default; `?reset=true` for full rebuild
- `features/rag/api/stages.ts` — `POST /rag/library/{id}/clean`
- DB (project `txzxabzwovsujtloxrus`): `rag.kg_chunks` (`derivation_kind`), `docproc.derive_runs`,
  `docproc.processed_document_pages` (`verification_flags`), `rag.data_stores` /
  `rag.data_store_members`, `files.files` (canonical name; `public.cld_files` is legacy).

## Remaining work

### P0 — Explain the chunk loss before touching anything

Verified 2026-07-28 against the live DB:

| Metric | 2026-07-14 doc | Now |
|---|---:|---:|
| `rag.kg_chunks` on `e9868104` | 7,768 | **2,733** |
| `derivation_kind = section_summary` | 144 | **0** |
| `derivation_kind = synthetic_qa` | 575 | **0** |
| `derivation_kind = page_image_caption` | 65 | **0** |

All 2,733 survivors are `initial_extract`, one batch, `created_at = 2026-06-23 01:50:49`, all
bound to `f3cf55a1`. Zero soft-deleted rows exist anywhere in `rag.kg_chunks`, so the missing rows
were **hard-deleted**; nothing migrated to a sibling doc. `files.files` row `updated_at` is
2026-07-24. Find what deleted them (a reset/re-chunk? a cleanup script?) and whether the same
mechanism can fire on other sources — that matters more than this one library.

**Resume is now unsafe:** `docproc.derive_runs` still holds progress bookkeeping (section_summary
156/473, synthetic_qa 131/473, page_image_caption 231/231 completed with 65 written) for chunks
that no longer exist, so "Continue" may skip sections and write nothing.

### P1 — Re-baseline and re-run derivations on `f3cf55a1`

Run in the **Knowledge Asset Panel** while logged in (direct curl to the production backend is
Cloudflare-blocked). Check cost first — the panel loads `GET …/estimate` on open.

| Op | Target | Note |
|---|---:|---|
| `section_summary` | ~473 sections | last 2 runs **failed** (last 2026-06-25); needs Rebuild, not Continue |
| `synthetic_qa` | ~473 sections | last 2 runs **failed** (last 2026-07-07); needs Rebuild |
| `page_image_caption` | 231 figures | run shows completed/65 written but 0 chunks survive; optional |

### P2 — Fix page clean quality on spine

Root doc page flags (re-verified 2026-07-28, 618 pages total): **76 `clean_emptied`**,
13 `no_text`, 3 `clean_shrank`. Run the **Clean** stage on `f3cf55a1` (Library detail → Stages tab).
Re-chunk only if clean output materially changes retrieval.

### P3 — Smoke test

- `/rag/search` scoped to AMA-G5 — ch.18 / impairment / table queries
- Citation opens `/files/f/e9868104…` at the correct page

## Done

- P0 spine confirmed and still bound — `files.files.canonical_processed_document_id = f3cf55a1`;
  store `0158e878` (AMA-G5, active) has exactly one member, `e9868104`.
- Excerpt `6f1b609c` discarded per Arman (352 chunks, 7 processed docs, 35 pages, 4 derive runs,
  file trashed); dup archived doc `a7ad7818` — 618 orphan pages removed.

## Decisions needed

1. **~5,000 chunks vanished from the AMA Guides library.** The AMA Guides 5th Edition document had
   7,768 searchable chunks on July 14; today it has 2,733, and every AI-generated summary,
   question-answer pair, and image caption derived from it is gone. They were permanently deleted,
   not archived, sometime before July 24. Decide: should someone trace what deleted them (and
   whether other libraries are exposed to the same thing) before we spend money regenerating —
   or just regenerate now and accept the risk of it happening again?

2. **Regenerate from scratch vs resume.** The system still thinks partial derivation work is done,
   but the results are gone, so "continue" would silently skip work. Full rebuild costs real money
   per section (~473 sections × 2 operations). Decide: full rebuild both operations, or rebuild
   only summaries and leave the Q&A pairs off until search quality shows they're needed?
