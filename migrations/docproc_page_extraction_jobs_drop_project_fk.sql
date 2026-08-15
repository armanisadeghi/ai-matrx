-- Remove the forbidden project FK from docproc.page_extraction_jobs (D94).
--
-- CLAUDE.md § Forbidden relationship shortcuts: "A feature/domain table may not
-- depend on a project FK. Project membership is an optional platform.associations
-- edge between canonical entity tokens; the feature must create, load, run,
-- update, and delete correctly with no project at all." Fix-on-sight applies when
-- the table being worked on carries the violation.
--
-- Safe by measurement, not by assumption: 32 rows in the table, ZERO with a
-- non-null project_id, and the only writer (`run-from-draft.ts`) hard-coded
-- `project_id: null`. No reader consumed the value — `data.ts` selected and
-- mapped it into a `projectId` field that nothing rendered. Frontend references
-- removed in the same change; aidream's generated model/manager regenerate.

alter table docproc.page_extraction_jobs
  drop constraint if exists page_extraction_jobs_project_id_fkey;

alter table docproc.page_extraction_jobs
  drop column if exists project_id;
