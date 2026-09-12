# FEATURE.md — SEO Operations

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-09-12`

---

## Purpose

SEO Operations is the administrator console for manually running SEO
automations, inspecting their mandates, and judging the Evidence Workbench
against the exact evidence supplied to its bound agent.

---

## Entry points

**Routes**

- `app/(admin)/administration/marketing/seo-operations/page.tsx` — admin route
  that renders the console.

**Components**

- `features/admin/seo-operations/SeoOperationsClient.tsx` — Automations,
  Mandates, and Evidence Workbench panels.

**Services**

- `features/admin/seo-operations/service.ts` — direct Supabase reads for the
  SEO task, site, mandate, provision, and evidence-value inventories.
- `features/scheduling/service/schedulerClient.ts:runSystemTaskNow` —
  admin-gated manual run path for system tasks.

**API endpoints**

- `POST /scheduling/run-now/{task_id}` — queues one system task run.
- `POST /seo/evidence-workbench` — durable streamed Evidence Workbench
  command; request body is `{ site_id, question, values }`.

---

## Data model

**Database tables** (Supabase)

- `scheduler.sch_task` — recurring task metadata displayed in Automations.
- `web.site` — active sites available to the workbench.
- `mandate.mandate_definition` and `mandate.mandate_provision` — SEO mandate
  and offered evidence-value declarations.
- `seo.collection_run` — server-owned durable command receipt rejoined by the
  shared SEO durable-run primitive.

**Key types**

- `SeoTaskRow`, `SeoSiteOption`, and `EvidenceValueSpec` in `service.ts` —
  console read models.
- `EvidenceWorkbenchResult` in `SeoOperationsClient.tsx` — completed command
  result with the answer and recorded evidence.

---

## Key flows

### Run an SEO automation

1. `AutomationsPanel` loads SEO/web scheduler rows through `fetchSeoTasks`.
2. The operator selects Run now for one row.
3. `runSystemTaskNow(task.id)` calls the admin-gated
   `/scheduling/run-now/{task_id}` route; it never calls the user-owned
   `/scheduler/tasks/{task_id}/run-now` route.
4. The resulting receipt links the operator to Scheduling Runs.

### Run and judge Evidence Workbench

1. `WorkbenchPanel` loads active sites and the declared `seo.site_evidence`
   value menu; the operator picks the site and writes the question.
2. The operator chooses evidence and asks a typed question; identity and
   coverage are included by the server declaration.
3. `useSeoCommandRun` posts `{ site_id, question, values }` to
   `/seo/evidence-workbench`, narrates its real materializing/ready stages,
   adopts the live output into the floating
   `LiveRunWindow`, and retains/rejoins the `seo.collection_run` receipt.
4. On `seo.workbench_completed`, the console renders the answer through
   `MarkdownStream` and displays Question, Values used, Evidence sizes,
   whitespace-preserved Evidence, and Run details from the persisted result.

---

## Invariants & gotchas

- System-task Run now **must use `runSystemTaskNow`**. `runNow` targets the
  user-owned scheduler route and is rejected for the admin system task class.
- Evidence Workbench **must use `useSeoCommandRun({ live })`**. Never parse,
  render, or reconnect the stream locally; the shared hook owns durable
  receipt, rejoin, retry, and canonical floating output.
- Render the final answer through **`MarkdownStream`** and show the
  server-recorded evidence sections below it. Do not replace those sections
  with a raw JSON dump or collapse their line breaks.
- A workbench error must remain honest and retryable when the durable hook has
  a repeatable local launch; it must never claim that the API is unavailable.

---

## Related features

- Depends on: `features/scheduling/` for the canonical admin system-task path.
- Depends on: `features/marketing/seo/durable-run/` and `lib/durable-run/` for
  streaming, durable rejoin, and retry.
- Depends on: `features/mandates/` for provision shapes and mandate metadata.
- Cross-links: `features/marketing/FEATURE.md` for SEO durable-run policy.

---

## Doctrine compliance

**Primitives reused**

- Components: `MatrxDataTable`, `ProTextarea`, shadcn `Button`, `Select`,
  `Checkbox`, and `Badge`.
- Hooks: `useSeoCommandRun` for durable command transport and `useScheduledTaskMenuSection` for the shared task menu.
- Services: `runSystemTaskNow` and the existing direct-read `service.ts`
  facade.

**Primitives introduced**

- None. The workbench composes the existing durable command primitive instead
  of adding stream or receipt handling.

---

## Current work / migration state

The Evidence Workbench consumes the deployed durable endpoint. There is no
local execution stub or alternate scheduler path.

---

## Change log

- `2026-09-12` — Codex: moved system-task Run now to the admin scheduler path
  and wired the durable Evidence Workbench result and evidence review.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this
> feature, update this file's status, flows, and Change log in the same change.
