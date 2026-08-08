---
status: active
updated: 2026-08-08
repos: [matrx-frontend, aidream]
vision: []   # Arman's vision for this system is captured verbatim below; no standalone doc of his exists
---

# Shared Knowledge Resources — access cascade, issuance, discovery

> **New here? Read [`shared-knowledge-and-permissive-access-HANDOFF.md`](./shared-knowledge-and-permissive-access-HANDOFF.md) first.**
> That is the self-contained newcomer package (vision + gap analysis + architecture + next steps
> + gotchas). THIS file is the terse status log and open-decision history it draws from.

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

*(inferred — not Arman's words)* The cascade law and the library model do not conflict:
whatever level you grant cascades. Library/industry grants only ever issue **viewer**
(`association_types.conveys_max='viewer'`), so they cascade read and never write; a War Room
share of `editor` cascades editor. Same law, different issued level. **A "grant reader cannot
edit" report is therefore correct behavior, not a bug.**

## Resources

- **Master plan + verified status + day-1 contracts:** `docs/proposals/shared-knowledge-projects/README.md` · **Feature docs:** [`features/rag/FEATURE.md`](../../features/rag/FEATURE.md) § Shared Knowledge Resources · [`features/industries/FEATURE.md`](../../features/industries/FEATURE.md)
- **Access system-of-record (outranks this doc on access mechanics):** `/Users/armanisadeghi/code/common-docs/systems/access-architecture/FEATURE.md`; sibling campaign handoff `docs/handoffs/access-scope-campaign.md`
- **Adjacent, do not absorb:** `docs/handoffs/db-direct-access-sweep.md` (Python-as-DB-proxy removal; owns the `rag.fn_*` conversions) · `docs/handoffs/ama-g5-spine-consolidation.md` (AMA *content* quality/derivations — different workstream, same document)
- **Skills:** `db-change` family (any DDL), `canonical-associations` (edges/registry), `supabase-realtime`, `type-safety`, `finalize-and-ship`
- **Live IDs (verified 2026-07-23):** AMA file `e9868104-e276-4cdb-97a4-b948a13eb135` · root processed doc `f3cf55a1-19b1-4d2e-a95c-fb7c449f9eb2` · AMA-G5 store `0158e878-1bab-4c91-9597-da4e8951c2a7` · industry `ca-workers-comp` `dfdff5a8-5b5d-40ef-92e3-b335e13c21c8` · Matrx Library org `5e44ec19-3965-4b12-91b2-b2bdb2712abc`
- **Test identities.** Use the right one or you will prove nothing:
  | Role | Who | Notes |
  |---|---|---|
  | **Clean entitled reader** (use for all DB/judge probes) | `elliesadeghijd@gmail.com` — `77c6af70-a35e-4724-a304-64a0dd789674` | **Not an admin.** Entitled *only* through Pearlman Brown → ca-workers-comp. This is the identity that actually proves the grant path. |
  | Browser/HTTP testing | `admin@admin.com` / `Password1234#` — `87a6e699-3622-4869-8843-d0867456c0dd` | Member of Castellano & Reyes, but **also super_admin** — it reports `can_curate=true`, which a real grant reader must NOT have. Every pass with this account must be paired with the control below. |
  | **True non-entitled control** | `asadeghi415@students.fairmontschools.com` — `929274b1-a889-41ee-8a7f-dbaec7b0ee54` | Not an admin, not entitled. Must be denied everything. |
  | ⚠️ NOT a valid control | `arman26@gmail.com` — `7604b9d9-…` | It is an admin (`developer`). Any negative test against an **ANY-admin** gate — `page_extraction.py:157`, the grants-list endpoint — passes falsely with this account. |

  ⚠️ The id `87a6e699-4e17-…` appearing in older notes is **wrong and does not exist** — every probe using it returns false, which reads exactly like a broken cascade.
- **Verify the spine in one shot** — expect `t,f,t,f` (viewer yes, editor no, read yes, curate no):
  ```sql
  select iam.has_access_as('77c6af70-a35e-4724-a304-64a0dd789674','file','e9868104-e276-4cdb-97a4-b948a13eb135','viewer'),
         iam.has_access_as('77c6af70-a35e-4724-a304-64a0dd789674','file','e9868104-e276-4cdb-97a4-b948a13eb135','editor'),
         public.can_read_processed_document('f3cf55a1-19b1-4d2e-a95c-fb7c449f9eb2','77c6af70-a35e-4724-a304-64a0dd789674'),
         public.can_curate_library_document('f3cf55a1-19b1-4d2e-a95c-fb7c449f9eb2','77c6af70-a35e-4724-a304-64a0dd789674');
  ```

## Remaining work

**P1–P4 all SHIPPED 2026-07-23** (one-day fleet execution; per-project detail + commit SHAs in
README §1). What remains:

1. **Deploy aidream to prod** — carries P1's real ingest endpoint + Decision-3 rehome, P2's
   HTTP grant-list gate, P4's spend gates (incl. the previously ungated cancel endpoint), and
   `/health/version`. All DB-side changes are already live and safe with old code. Also wire
   Coolify build-args `GIT_SHA`/`BUILD_TIME` or `/health/version` reports "unknown".
2. **Convergence A on prod** — the full clickable lifecycle (create industry → ingest via admin
   UI → publish → org opt-in → member discovers/reads/sees provenance → matrix green) needs the
   deploy above for the ingest hop; everything after ingest is already browser-verified.
3. **Follow-ons discovered during the build** (filed, unowned): D92 — 38 pre-existing dead RLS
   policies surfaced by the new dead-policy guard; D93 — `rag.kg_chunks` denial-by-timeout for
   non-entitled users (perf, 57014); D94 — `docproc.page_extraction_jobs.project_id` FK
   (forbidden pattern, tagging-only); `iam.industries` has no delete/deactivate RPC (console is
   create/update only); no non-discoverable store exists in prod to negative-test subscribe;
   first real notes/transcript library should get a native-viewer click-through (matrix covers
   it at RLS level).
4. **Product decision, low urgency:** `project`/`task` member kinds deliberately do NOT convey
   container access (P4 left them unregistered, documented in `features/rag/FEATURE.md`) —
   confirm or change.

## Session-2 (2026-07-23 PM) — landed + two open decisions

**Landed this session (all live + ledgered):** aidream confirmed deployed (prod container on the
commit carrying P1/P2/P4 server work; ingest + gated-grants endpoints respond). D-G closed the
clean way — `/health/version` reads Coolify's runtime `SOURCE_COMMIT` (no build-arg wiring
needed). **Admin gating lowered to ANY admin** across the shared-knowledge issuance + admin-read
surface per Arman's directive (`migrations/library_issuance_any_admin_gate.sql`, aidream
`179af9d6a`; verified developer-tier admin now lists grants, non-admin refused). **Industry
soft-delete** shipped (`industry_set_active` RPC + console Archive/Restore, browser+DB verified).
D89 fixed. Access doc-truth corrected (conveyance is not read-only). Final adversarial pass found
+ fixed a cross-user oracle and a service-role regression.

**Decision A — RESOLVED + DONE.** `/administration` was super-admin-only at the layout level.
Arman's ruling: back off — any Matrx admin may enter. `app/(admin)/layout.tsx` now gates on
`checkIsUserAdmin` (any admin); pages needing a higher bar self-gate, protected resources stay
DB-gated. Live.

**Decision B — RESOLVED + DONE (the philosophy: PERSONAL vs NON-PERSONAL).** Arman: not-personal
things (files, tasks, projects, documents, data stores, war rooms) must push access down to
container members at their level (read+edit) with no walls inside; personal things (a user's chat
with an agent) stay private and only convey when explicitly shared. Findings + change:
- The platform ALREADY conveyed project/task membership → agents, apps, tasks, conversations,
  skills, notes, research topics. The FK-containment path is gated on the item's
  `visibility >= internal`, so a **personal** chat attached to a project does NOT convey — that
  gate IS the personal-vs-non-personal valve, already working. Chats are out of scope, handled.
- Gap closed (`migrations/project_task_warroom_convey_contents.sql`, live + ledgered): registered
  `file / data_store / working_document / processed_document → project` and `→ task` as
  **editor**-conveying container edges, plus `task→project` (transitive project→task→contents) and
  the war-room tiles (`file/data_store/working_document/processed_document/note/task → war_room`).
  Conversations deliberately excluded. Forward-looking (zero pre-existing edges).
- Verified: a project editor-member gets **editor** on an attached file (viewer too), an
  unattached file stays denied (no over-grant); shared-knowledge spine still `t,f,t,f`, matrix
  42/42. Access doc corrected (conveyance is not read-only; edge inventory updated).
- Left as-is per Arman: `project→scope` stays viewer (deliberate 2026-07-16 tag=read-only-share
  ruling — scopes are a tagging/sharing surface, not project containment); chats stay personal.
- Noted, not changed: the association/reachability path does not itself re-check item visibility
  (the FK path does) — harmless today (files/notes default `internal`; zero personal items convey),
  but if you ever want personal-marked files to also be shielded when dropped into a shared
  container, that's a one-line kernel guard (`v_vis >= internal` on the reachability loop). Not
  done because it's a restrictive kernel change you didn't ask for and there's nothing to fix yet.

## Session-3 (2026-08-08) — project attach surface + review-feedback fixes

- **Project workspace attach surface shipped** (the #1 partial): FK-count resources section
  replaced with the canonical `PrimaryEntityProvider` + `AssociationCardGrid`; attaching now
  writes real `file/data_store/… → project` edges. Task + war-room surfaces were already
  canonical. Conveyance re-proven (rolled-back probe): editor-member → editor on attached file.
  Gotcha recorded: `system_immutable` crawl artifacts are viewer-ceiling by design
  (`files.has_access_for`) — probe with a non-crawl file.
- **Review feedback handled (both `agent.review_queue` rows claimed):** the "Not entitled" AMA
  chip Arman saw was per-caller truth (his reviewing account's orgs aren't in ca-workers-comp) —
  but admins can read every library, so the catalog now returns an `'admin'` entitlement fallback
  (`migrations/library_catalog_admin_entitlement.sql`, applied + ledgered) and the chip shows
  "Admin access". Console mobile fixes: taller tab/edit/archive touch targets, taxonomy text wraps
  (recoverable) on mobile. **Ingest 404 on prod = stale aidream deploy — the standing blocker**
  (paths match on both sides; cloud sandboxes can't reach prod to verify).

## Done

- Grant → reachability → judge cascade live and prod-proven — see `migrations/library_store_file_reachability_cascade.sql` + `migrations/library_reachability_cascade_hardening.sql`.
- Actor-spoofing hole in the industry RPC family closed — `migrations/industry_rpc_actor_spoof_fix.sql`.
- Extraction tables grant-readable — `migrations/page_extraction_library_grant_read.sql`.
- Data-store row + members visible to their own grant readers — `migrations/data_stores_grant_reader_select.sql`.
- One access kernel: `iam.has_access`/`has_access_as` are thin wrappers over `iam.has_access_for` — see `db/migrations/0159_iam_has_access_for.sql` (aidream); twin divergence resolved.
- Library surfaces converted to direct-Supabase `rag.fn_*` RPCs — aidream `0162`/`0163`.
- Wave A soft-delete/trash respects grant readers (read yes, delete/purge/restore no).
- Grants-list HTTP endpoint gated + deployed to prod — aidream `195ad916e`.
- **2026-07-23 fleet pass — P1+P2+P3+P4 all shipped** (README §1 has per-project detail):
  provenance RPCs + catalog entitlement + Decision-2 gate (both halves) · `/rag/library-catalog`
  + provenance chips everywhere + org-settings legibility · `/administration/shared-knowledge`
  console + `/rag/admin` map · registry-driven cascade for note/transcript/code_file + baby-table
  grant reads + spend gates + acceptance matrix (42/42 GREEN, `pnpm check:access-matrix`) + four
  drift guards · real streamed ingest + ownership rehome + AMA re-owned to system owner
  (contributor recorded) + `/health/version`. D89 fixed same day. All four decisions settled and
  recorded above. **aidream deploy pending** — the only gate left before Convergence A on prod.
- **Final adversarial pass (2 independent refuters) — two real findings, both fixed same day**
  (`migrations/library_grant_predicate_actor_guard_and_service_role.sql`, applied + ledgered):
  (1) pre-existing cross-user oracle — `user_can_read_data_store_via_grant` was
  authenticated-executable with arbitrary `p_user`; now actor-guarded (self / service /
  super-admin only), RLS callers unaffected (verified: ellie store 1 / chunks 2,733 / members 1);
  (2) my own service-role regression on `fn_list_data_store_grants` + `fn_data_store_members_rich`
  (missing the `auth.role()='service_role'` bypass their sibling has) — added, bare service calls
  verified working. Matrix re-run 42/42 GREEN, spine t,f,t,f after both.

## Decisions — ANSWERED by Arman 2026-07-23 (all four settled; reflected in README §2)

| # | Decision | Answer |
|---|---|---|
| 1 | Industry self-join | **(a) Keep self-serve** — any org admin can claim any industry. P3 makes the section *legible*, never read-only; no request-to-join flow. |
| 2 | Who lists a store's grants | **(a) Super-admin + store owner only** — ONE rule in both the `rag.fn_list_data_store_grants` RPC (drop "any member of owning org") and the aidream HTTP endpoint (drop ANY-admin + editor). |
| 3 | Ownership rehome | **(a) Move to Matrx Library org** on add-to-library: system owner, contributor kept as author. AMA data repaired the same way. |
| 4 | Paid actions | **Confirmed** — reads follow the cascade; anything that spends money stays owner/curator. Grant readers never trigger paid extractions. |

Original decision briefs kept below for context.

**1. Org-admin industry self-join — is today's self-serve behavior what you want?**
*Situation:* An organization's membership in an industry (e.g. "California Workers'
Compensation") is what entitles it to that industry's shared libraries — joining an industry is
how an org gets read access to that industry's content. **Today any org admin can already add
their own org to any industry, with no Matrx approval**, in both the database
(`industry_assign_org` allows super-admin *or* org-admin) and the UI (org settings → Industries).
This is live and in use: on 2026-07-11 a non-admin org owner self-assigned their firm to
California Workers' Compensation and thereby gained the AMA Guides.
*Decide:* (a) keep self-serve as is — anyone who runs an org can claim any industry
**[recommended if industry content is non-confidential; it is the lowest-friction path and
matches "the right people get in without blinking"]**, (b) restrict joining to Matrx
super-admins and give org admins a "request to join" instead, or (c) per-industry flag: some
industries self-serve, sensitive ones approval-only.

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
