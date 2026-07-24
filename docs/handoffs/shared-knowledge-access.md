---
status: active
updated: 2026-07-23
repos: [matrx-frontend, aidream]
vision: [docs/proposals/shared-knowledge-projects/README.md]
---

# Shared Knowledge Resources — access cascade, issuance, discovery

**Entry point for this work.** The per-project specs live in
`docs/proposals/shared-knowledge-projects/` (README = master plan + contracts + status;
`P1`–`P4` = one blind-executable brief each; `ASSIGN.md` = paste-ready prompts).
**Read the README before any brief.**

## Vision — Arman's words

> "Our system has a system for creating a set of industry knowledge and allowing organizations
> to opt into it. Everything was working fine, but now that we're on the new auth and access
> system, one part completely fell apart."

> "The bottom line is that you can't actually do what you need, even though we sort of gave you
> access."

**The cascade law, verbatim** (the War Room thread is his reference implementation):

> "If I give you access to my war room thread, then you need to get instant access to all this
> stuff inside unless I specifically mark something as not accessible. and beyond there, you
> have access to everything. And if I give you read access and you get read access to
> everything, if I give you write access, then I'm giving you write access to everything.
> Simple."

> "if we don't properly have the hierarchy set up and the access doesn't cascade down, then the
> whole thing falls apart."

On hierarchy (a decision he has since accepted — do not relitigate):

> "it felt a little backwards, that a file wasn't the thing that sat at the top. But I've kind
> of grown to be okay with that and allow the data store to be above the file."

On what is still missing:

> "We need better management of the industry data we assign: FE administration interface that
> quickly and easily allows access to anything we have and can issue."
> "easy ways for users and orgs to find and opt into these resources."

**Note the asymmetry the cascade law does NOT contradict:** *whatever level you grant*
cascades down. Library/industry grants only ever issue **viewer**
(`association_types.conveys_max='viewer'`), so they cascade read and never write. A War Room
share of `editor` cascades editor. Same law, different issued level.

## Resources

- **Master plan + verified status + day-1 contracts:** `docs/proposals/shared-knowledge-projects/README.md`
- **Feature docs:** [`features/rag/FEATURE.md`](../../features/rag/FEATURE.md) § Shared Knowledge Resources · [`features/industries/FEATURE.md`](../../features/industries/FEATURE.md)
- **Access system-of-record (outranks this doc on access mechanics):** `/Users/armanisadeghi/code/common-docs/systems/access-architecture/FEATURE.md`; sibling campaign handoff `docs/handoffs/access-scope-campaign.md`
- **Adjacent, do not absorb:** `docs/handoffs/db-direct-access-sweep.md` (Python-as-DB-proxy removal; owns the `rag.fn_*` conversions) · `docs/handoffs/ama-g5-spine-consolidation.md` (AMA *content* quality/derivations — different workstream, same document)
- **Skills:** `db-change` family (any DDL), `canonical-associations` (edges/registry), `supabase-realtime`, `type-safety`, `finalize-and-ship`
- **Live IDs (verified 2026-07-23):** AMA file `e9868104-e276-4cdb-97a4-b948a13eb135` · root processed doc `f3cf55a1-19b1-4d2e-a95c-fb7c449f9eb2` · AMA-G5 store `0158e878-1bab-4c91-9597-da4e8951c2a7` · industry `ca-workers-comp` `dfdff5a8-5b5d-40ef-92e3-b335e13c21c8` · Matrx Library org `5e44ec19-3965-4b12-91b2-b2bdb2712abc`
- **Test identities:** entitled reader `admin@admin.com` / `Password1234#` (id `87a6e699-3622-4869-8843-d0867456c0dd`, member of Castellano & Reyes — **also a super_admin, so always pair any pass with a non-admin control**); non-entitled control `arman26@gmail.com` (id `7604b9d9-…`). ⚠️ The id `87a6e699-4e17-…` in older notes is **wrong** and does not exist — it will make every probe return false.
- **Verify the spine in one shot** (expect `true,false,false`):
  ```sql
  select iam.has_access_as('87a6e699-3622-4869-8843-d0867456c0dd','file','e9868104-e276-4cdb-97a4-b948a13eb135','viewer'),
         iam.has_access_as('87a6e699-3622-4869-8843-d0867456c0dd','file','e9868104-e276-4cdb-97a4-b948a13eb135','editor'),
         iam.has_access_as('7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf','file','e9868104-e276-4cdb-97a4-b948a13eb135','viewer');
  ```

## Remaining work

Ordered by impact. Each is a full brief — read it before starting.

1. **P3 — Discovery & opt-in** (`P3-discovery-and-optin.md`). **Now the highest priority.**
   `files_listing_owner_grant_only.sql` (07-20) deliberately bars reachability-conveyed rows
   from every file tree, search, and picker, and `list_library_documents` scopes to
   owner/curator — so a grant reader's *only* route to entitled content is one unlabeled pane
   near the bottom of `/rag`. Ships the catalog route, org-level opt-in, provenance
   ("via California Workers' Compensation"), and the `library_grant_provenance` contract.
2. **P2 — Admin issuance console** (`P2-admin-issuance-console.md`). Arman's explicit ask.
   No UI exists to create an organization-audience grant, manage the industry taxonomy
   (`upsertIndustry` is exported with **zero callers**), or answer "why does org X see doc Y?".
   Also owns resolving the two-gate fork in Decisions §2.
3. **P4 — Cascade generalization + guardrails** (`P4-cascade-generalization-guardrails.md`).
   Non-`cld_file` store members still get no association edge (`source_kind='cld_file'` is
   hard-coded in every trigger/backfill), so a library of notes/transcripts conveys nothing.
   Also owns the acceptance-matrix script + drift guards, the `page_extraction.py:157`
   hand-rolled owner gate, and the `archived_at` read asymmetry.
4. **P1 — Library publish pipeline** (`P1-library-publish-pipeline.md`). Lowest urgency
   (nothing is broken for users) but it is the reason the library cannot grow: there is no
   admin ingest surface, the AMA source file still sits in Arman's personal org, and all 2,733
   AMA chunks are still `owner_id = Arman`. The system-owner path exists
   (`packages/matrx-rag/matrx_rag/library.py`) and is reachable only from a workflow node and a
   one-off script.

## Done

- Grant → reachability → judge cascade live and prod-proven — see `migrations/library_store_file_reachability_cascade.sql` + `..._hardening.sql`.
- Extraction tables grant-readable — `migrations/page_extraction_library_grant_read.sql`.
- Data-store row + members visible to their own grant readers — `migrations/data_stores_grant_reader_select.sql`.
- One access kernel: `iam.has_access`/`has_access_as` are thin wrappers over `iam.has_access_for` — see `db/migrations/0159_iam_has_access_for.sql` (aidream); twin divergence resolved.
- Library surfaces converted to direct-Supabase `rag.fn_*` RPCs — aidream `0162`/`0163`.
- Wave A soft-delete/trash respects grant readers (read yes, delete/purge/restore no).
- Grants-list HTTP endpoint gated + deployed to prod — aidream `195ad916e`.

## Decisions needed

**1. Org-admin industry self-join.**
*Situation:* An organization's membership in an industry (e.g. "California Workers'
Compensation") is what entitles it to that industry's shared libraries. Today only a
super-admin can add an org to an industry; an org admin sees their industries read-only and has
no way to act.
*Decide:* (a) keep it super-admin-issued only and add a "request to join" that notifies
super-admins **[recommended — industry membership is an access-control input, not a
preference]**, or (b) let org admins join/leave industries freely, or (c) let them join only
industries flagged self-serve.

**2. Who may see a library store's grant list.**
*Situation:* Two different gates now answer this. The HTTP endpoint allows any admin tier plus
the store's owner/editor. The RPC the frontend actually uses allows super-admins plus **any
member of the store's organization at any role**. For the Matrx Library org that currently means
one person (Arman), but anyone added to that org would immediately be able to enumerate which
industries and organizations every library is published to.
*Decide:* the one rule for both — (a) super-admin + store owner only **[recommended; simplest,
matches "issuance is an admin act"]**, (b) the above plus any member of the owning org (today's
RPC behavior), or (c) add an explicit "library curator" role as the gate (the
`industry_curator_grant` RPC already exists and is unused).

**3. Ownership rehome on publish.**
*Situation:* When a file is added to a shared library, the file row still belongs to the
contributor's personal organization. The AMA Guides PDF sits in Arman's personal workspace and
its 2,733 chunks are owned by Arman, so "the industry owns this resource" is true in intent but
not in data. Access does not depend on this (grants drive it), but contributor deletion,
personal-space listings, and quota all key off ownership.
*Decide:* (a) on add-to-library, move the file to the Matrx Library org and set a system owner,
keeping the contributor recorded as author **[recommended]**, (b) leave ownership with the
contributor permanently, or (c) copy the file into the library and leave the original alone.

**4. Paid actions for grant readers.**
*Situation:* Page-extraction endpoints that spend money on embeddings currently allow "the
owner, or any admin". A grant reader can read a document's existing extractions but cannot
trigger new ones. When that gate is rewritten onto the access kernel, reads and spend actions
need different rules.
*Decide:* confirm — reads follow the access cascade (anyone who can view the document sees its
extractions), while **anything that spends money stays owner/curator only** [recommended], or
name a different line.
