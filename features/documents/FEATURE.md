# FEATURE.md — `documents` (Univer documents, "Cloud document")

Domain tree: content > documents. Split out of `features/data-tables` on 2026-10-07; routes
`/documents` and `/documents/[id]` are unchanged (`components/DocumentRecord.tsx` renders the record
page). Holds the document editor, model (`document-model/`), service (`document-service.ts`),
Markdown <-> Univer converters, the page/canvas theme, history views and the agent-context builders.
Shared Univer runtime: `lib/univer/`; collab: `lib/collab/`. The data-model and history notes for
documents and workbooks live together in `features/workbooks/FEATURE.md`.
