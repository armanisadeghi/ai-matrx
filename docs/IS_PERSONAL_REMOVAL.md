# Hand-off: remove the `is_personal` flag (use the personal *org* instead)

> **Status:** partially complete. Owner decision (2026-06-06): `is_personal` should not exist on project-like rows — membership in the user's personal org already encodes "personal." 2026-06-26 update: the frontend Personal pseudo-org sentinel has been removed; project creation/navigation now uses the real personal organization id. Template cleanup and any remaining DB/RPC cleanup stay in scope for the broader ticket.

## The decision

There is a real **personal organization** per user (`organizations.is_personal = true`, created by the `ensure_personal_organization` RPC). The separate `is_personal` boolean on `ctx_projects` / `ctx_templates` is redundant with org membership and actively causes bugs. Remove the flag everywhere; derive "personal" from the org instead.

**Canonical rule after removal:** a project/task/template is "personal" iff its `organization_id` is the user's personal org. Do not use `NULL` organization ids for personal rows. The UI should show the owning org's name; reserve a "Personal" label for the personal org specifically (`organizations.is_personal`, which we are KEEPING on the `organizations` table as the source of truth).

> Keep `organizations.is_personal` (it identifies the one personal org). Remove `ctx_projects.is_personal` and `ctx_templates.is_personal`. This doc assumes that split; confirm before migrating.

## The root bug this fixes

`ctx_projects` rows can have **both** `organization_id` set AND `is_personal = true` simultaneously. Example: "All Green Region Pages" (`17bf8c1e-…`) has `organization_id = f9cb3e35` (Titanium) **and** `is_personal = true`. Any UI that keyed the "Personal" badge off `is_personal` mislabeled it as personal when it's a Titanium project. Root cause: `createProject` writes `is_personal: !organizationId` at creation, and the flag is never reconciled when an org is later assigned (and orgs now get auto-assigned via scope adoption — see `setEntityScopes` thunk — making the stale flag even more common).

## DB scope (verified against project `txzxabzwovsujtloxrus`)

**Columns named `is_personal` (3):**
- `ctx_projects.is_personal` (boolean) — **REMOVE**
- `ctx_templates.is_personal` (boolean) — **REMOVE** (template gallery "personal vs shared")
- `organizations.is_personal` (boolean) — **KEEP** (identifies the personal org)

**RPCs whose body references `is_personal` (11) — audit each:**
`agx_get_user_context_tree`, `ctx_seed_template`, `ensure_personal_organization`, `get_user_full_context`, `get_user_hierarchy`, `get_user_nav_tree`, `get_user_organizations`, `get_user_projects`, `get_user_scopes`, `get_user_scopes_with_projects`, `list_templates`.

Most originally read `ctx_projects.is_personal` to synthesize a fake Personal org grouping in the nav tree. 2026-06-26: the frontend sentinel is gone; grouping should use the real `organizations.is_personal` org row. `ensure_personal_organization` and the `organizations.is_personal` reads stay.

**Migration order:** (1) stop all writes (FE + RPCs) to `ctx_projects.is_personal` / `ctx_templates.is_personal`; (2) switch all reads to org-derived; (3) regenerate RPCs; (4) drop the two columns; (5) `pnpm db-types` + regenerate `types/database.types.ts`.

## Frontend scope (~68 files; see categories)

Mapped via Explore on 2026-06-06. Substantive work is **MEDIUM** (~4–10 files real logic, the rest pass-through/types):

- **Type defs:** `features/projects/types.ts` (`isPersonal`), `features/organizations/types.ts` (keep — org), `features/agent-context/redux/hierarchySlice.ts` (`NavProject.is_personal`, `NavOrganization.is_personal`), `types/database.types.ts` (regenerated).
- **DB write sites (stop writing the flag):** `features/projects/service.ts` (`is_personal: !organizationId` at create), `features/tasks/services/projectService.ts` (**already deleted this session** — verify), `features/organizations/service.ts` (org create — keep).
- **DB read / derive "Personal":** `features/projects/service.ts` (`getPersonalProjects`, transforms, sort), `features/projects/hooks.ts` (`projectsFromOrg`, `usePersonalProjects`), `features/projects/components/ProjectsHub.tsx` + `ProjectWorkspace.tsx` (**already switched to org-driven** — see below).
- **Personal pseudo-org machinery:** **DONE 2026-06-26.** Removed `PERSONAL_PSEUDO_ORG_ID` / `isPersonalPseudoOrgId` and updated consumers in project creation/hooks, research project pickers, RAG context, War Room org resolution, and `callApi` scope injection to use real org ids.
- **Sharing:** `features/sharing/components/tabs/ShareWithOrgTab.tsx` excludes `org.is_personal` orgs from share targets — re-point at `organizations.is_personal` (kept), not project flag.
- **Templates:** `features/scope-system/components/TemplateGalleryDrawer.tsx`, `features/scope-system/redux/templatesSlice.ts` (`is_personal` / `template_is_personal`).
- **Routing/invitations + pass-through props:** ~13 org/scope detail routes thread `orgIsPersonal`; invitation accept pages map `is_personal`.

## Already done this session (interim, safe)

- **Projects display switched to org-driven** in `ProjectsHub.tsx` + `ProjectWorkspace.tsx`: "Personal" = `!organizationId`; otherwise show the org name. This kills the visible mislabel without touching the column. (The full removal supersedes this; the conditionals are already in the right shape.)
- **Org auto-assign from scope** (`scopesService.adoptEntityOrgFromScopes` + `setEntityScopes` thunk): an org-less project/task adopts its first scope's org; never overwrites (DB `organization_id IS NULL` guard). This makes stale `is_personal=true` rows MORE likely until the flag is removed — another reason to prioritize this ticket.

## Other problems spotted (related)

1. **Stale-flag drift:** `is_personal=true` persists after an org is assigned (creation-time only write, never reconciled). The new scope→org adoption amplifies this.
2. **Two sources of truth** for "personal": `ctx_projects.is_personal` vs `organization_id == personal org`. They disagree in live data.
3. **Sharing leak risk:** if share-target filtering ever keys off the *project* flag instead of `organizations.is_personal`, personal content could appear shareable. Verify `ShareWithOrgTab` only uses the org flag.
4. **Personal-org grouping UX undecided:** projects under the user's personal org currently render under "Team projects" (org-driven). If they should group under "Personal," that needs the personal-org id at read time — fold that decision into this ticket.
