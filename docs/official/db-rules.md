# Canonical Data Model — Rules & Conformance

**This doc moved.** The canonical-data-model rulebook (entities, associations, access, versioning,
conformance) for Supabase project `brsgrqvjdzwihsvnfqkf` is now maintained in one place, shared
with `aidream`: [`/Users/armanisadeghi/code/common-docs/systems/platform/db-rules/FEATURE.md`](/Users/armanisadeghi/code/common-docs/systems/platform/db-rules/FEATURE.md)
(also reachable as `common-docs/systems/platform/db-rules/FEATURE.md`). Read it before touching any table's
structure, RLS, versioning, or associations.

For how access actually resolves (permissions, sharing, memberships, admin levels — the live
resolution ladder), see [`common-docs/systems/platform/access/FEATURE.md`](/Users/armanisadeghi/code/common-docs/systems/platform/access/FEATURE.md).

Every scheduled job that runs INSIDE the database (pg_cron) is registered in one place, with the
post-restore checklist that catches the two restore-fragile classes (event triggers AND cron jobs):
Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/operations/db-scheduled-jobs.md — read it before touching this feature in ANY repo.
