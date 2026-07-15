---
status: active
updated: 2026-07-14
repos: [matrx-frontend, aidream]
vision: []
---

# AMA Guides 5th — spine consolidation

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
- `features/rag/api/stages.ts` — `POST …/clean`

**Verify spine intact:**

```sql
SELECT count(*) FROM rag.kg_chunks
WHERE source_id = 'e9868104-e276-4cdb-97a4-b948a13eb135';  -- expect 7768+
```

## Remaining work

### P2 — Complete derivations on spine (`f3cf55a1`)

Run in **Knowledge Asset Panel** while logged in (browser session — direct curl to production backend is Cloudflare-blocked).

| Op | Current | Target | How |
|---|---:|---:|---|
| `section_summary` | 144 chunks | ~473 sections | **Continue** (resume — skips done sections; do **not** Rebuild) |
| `synthetic_qa` | 575 chunks | ~473 sections | **Continue** first; Rebuild only if coverage is bad |
| `page_image_caption` | 65 / 231 figures | optional | Continue or skip |

Check cost first: panel loads `GET …/estimate` on open.

### P3 — Fix page clean quality on spine

Root doc page flags: **76 `clean_emptied`**, 13 `no_text`, 3 `clean_shrank`.

Run **Clean** stage on `f3cf55a1` (Library detail → Stages tab → Clean, or stage runner). Re-chunk only if clean output materially changes retrieval.

### P4 — Smoke test

- `/rag/search` scoped to AMA-G5 — ch.18 / impairment / table queries
- Citation opens `/files/f/e9868104…` at correct page

## Done

- P0 spine confirmed — all 7,768 chunks + AMA-G5 binding already on `e9868104` / `f3cf55a1`.
- P1 discard — excerpt `6f1b609c`: 352 chunks, 7 processed docs, 35 pages, 4 derive runs, file trashed. Dup archived doc `a7ad7818`: 618 orphan pages removed. Spine still **7,768** chunks.

## Decisions

- Excerpt: **discarded** (not merged) per Arman.
- P2 order: **section_summary resume → synthetic_qa resume** (inferred; cheaper than full rebuild).
