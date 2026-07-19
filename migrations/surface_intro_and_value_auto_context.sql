-- Surface manifest additions (2026-07-19, knowledge-consolidation initiative):
--
-- 1. ui.ui_surface.intro — the surface's self-introduction context block
--    (XML-ish <surface_intro>), authored code-first in SurfaceManifest.intro
--    and mirrored here so aidream can inject it into agent context.
-- 2. ui.ui_surface_value.auto_context — whether an emitted value is
--    automatically added to agent context (true, default = current behavior)
--    or only available for explicit variable/context-slot mapping (false).
--    Mirrors SurfaceValue.autoContext.
--
-- Idempotent.

alter table ui.ui_surface
  add column if not exists intro text;

comment on column ui.ui_surface.intro is
  'Surface self-introduction context block (XML-ish), mirrored from code-first SurfaceManifest.intro. Injected as the first surface-context item the agent sees.';

alter table ui.ui_surface_value
  add column if not exists auto_context boolean not null default true;

comment on column ui.ui_surface_value.auto_context is
  'True: value is automatically added to agent context when the surface emits it. False: bindable-only (available for explicit variable/slot mapping, never auto-injected). Mirrored from SurfaceValue.autoContext.';
