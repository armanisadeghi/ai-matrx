# Server-Side Requests — Cross-Cutting Index & Architecture Audit

> **Direction:** OUTBOUND (frontend → Python/DB team). This is the **app-wide
> master** for one architectural rule and the audit that enforces it. Detailed,
> per-feature asks live in each feature's `for_python/REQUESTS.md` — this doc is
> the rule, the cross-feature audit table, and the index. It does **not**
> duplicate the per-feature asks.
>
> Inbound contracts (changes the backend ships to us) live in
> `docs/PYTHON_UPDATES.md` and `features/*/from_python/`.

---

## The rule: Python is the brain, not a database proxy

The client talks to **Supabase directly for all data reads/writes** — RLS is the
authorization boundary. The Python backend is **compute / file-bytes /
cross-service orchestration**. It must never be a pass-through proxy for a row
the browser can already read under RLS: that adds latency, a second failure
mode, and a second auth surface for data Supabase returns directly.

**A read should go to Python only if at least one is true:**
- the result is *computed*, not a stored row (AI, aggregation, ranking);
- it needs a schema **not exposed to PostgREST** (e.g. the `rag` schema);
- it needs a cross-service join the DB can't express;
- it needs to bypass RLS for a legitimately privileged reason (and even then,
  prefer a `SECURITY DEFINER` RPC the browser can call).

Everything else is a direct supabase-js read.

**Precedent (twice now):**
1. PDF workspace — `extracted_documents` list/detail moved off Python to direct
   Supabase after Python reads made the window take 2+ min to open
   (`lib/api/endpoints.ts`, `ENDPOINTS.pdf.documents` is `@deprecated`).
2. Cloud Files `GET /files/{id}/document` — moved to a direct
   `processed_documents` read on 2026-05-20 (the trigger for this audit).

---

## App-wide audit — Python calls that are really DB reads

Status: 🔴 violation (proxying an RLS-readable table) · 🟢 legitimate (compute /
file / non-public schema) · 🟡 needs review.

| Feature | Surface | Verdict | Notes |
|---|---|---|---|
| Cloud Files | `GET /files/{id}/document` | 🟢 fixed | Now a direct `processed_documents` read. |
| Cloud Files | `GET /files`, `/files/{id}`, `/files/trash`, `/files/folders`, `/files/groups`, `/files/{id}/share-links`, `/folders/{id}/share-links` | 🔴 | RLS-readable `cld_*` tables. Migrate to direct reads; tree already uses `cld_get_user_file_tree` + `.from('cld_files')`. See files `for_python/REQUESTS.md`. |
| Cloud Files | `GET /files/usage` | 🟡 | `cld_user_storage_usage` has RLS **disabled** — needs a policy or RPC before direct read. |
| Cloud Files | `GET /files/{id}/asset`, `/assets/*` | 🟢 | Renders variants + signs S3 URLs. |
| Cloud Files | `GET /files/{id}/analysis`, `/files/{id}/entities` | 🟡 | Likely AI/derived — confirm before assuming proxy. |
| RAG | `GET /rag/library/{id}`, `/rag/library/{id}/page/{n}`, `/rag/repositories` | 🟡 | Document/page content may need the `rag` schema or be large; audit per-call. |
| RAG | `/rag/ingest`, `/rag/search`, `/rag/cross-doc` | 🟢 | Vector store + embeddings (`rag` schema) + compute. |
| PDF / Images | `studioPresets`, `redactPatterns`, `/images/ops`, `label-catalog` | 🟢 | Server-defined static catalogs, not user tables. |

> The Cloud Files row is the only feature audited in depth so far. RAG and the
> `analysis`/`entities` rows are **🟡 pending** a closer pass. Other features
> have not been swept yet — extend this table as we go.

---

## Per-feature request docs (where the detailed asks live)

- **Cloud Files** → [`features/files/for_python/REQUESTS.md`](../features/files/for_python/REQUESTS.md)
  — canonical; contains the concrete asks from this audit (chunk-count
  exposure, shared-file RLS on `processed_documents`, retiring the read
  proxies, storage-usage RLS).

_Add a row here when another feature opens server asks from this audit._
