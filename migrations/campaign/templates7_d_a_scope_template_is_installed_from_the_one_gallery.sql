-- chair-step: it DROPS three functions — custom.context_template_apply(uuid, uuid), the scope-template apply door, and its two server-only wrappers public.apply_template(uuid, uuid) and public.apply_template_by_key(text, uuid) — and deletes their three platform.client_callable_door rows. Scope templates are published platform templates now (catalogue rows T0001–T0034, source scope-template:*), read through custom.templates and installed through custom.template_install; no app, server or scheduled job calls any of the three (grep of matrx-frontend, aidream, matrx-local, matrx-extend; pg_proc bodies; cron.job). custom.context_template_define, context.templates and every other scope door are untouched. No table, column, policy or grant on anything else changes.
-- lane: TEMPLATES
-- lock: custom
--
-- Inverse: migrations/inverse/templates7_d_a_scope_template_is_installed_from_the_one_gallery_down.sql
--
-- v7 TEMPLATES RETIRE-1. THE USE CASE. Harbor Dental's office manager opens her organization page and presses
-- "Templates": she lands on the one gallery, where "Dental practice" is a published template she previews and installs.
-- The old drawer applied a scope template's types and fields straight into the organization through
-- custom.context_template_apply — a second mechanism that disagreed with the gallery about what a template is. Its
-- screens were removed in the same change; this removes the door, and the two server-only wrappers whose only work was
-- to call it (left in place they would fail at call time, silently, the day anything reached them).

set local statement_timeout = '60s';

drop function public.apply_template_by_key(text, uuid);
drop function public.apply_template(uuid, uuid);
drop function custom.context_template_apply(uuid, uuid);

delete from platform.client_callable_door
 where (schema_name, function_name) in (('custom', 'context_template_apply'), ('public', 'apply_template'), ('public', 'apply_template_by_key'));
