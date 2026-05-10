-- migrations/aga_apps_shell_kind.sql
--
-- Phase 1a of the layout/execution architecture in
-- ~/.claude/plans/we-are-going-to-synchronous-ritchie.md.
--
-- The agent-apps system pivots from "every app is custom-coded" to a
-- shell + slots + escape-hatch model:
--
--   - Tier 0/1: pick a shell, configure it via shell_config.
--   - Tier 2: same shell, swap one or more slots for custom code stored in slot_code (jsonb keyed by slot name).
--   - Tier 3: shell_kind = 'fully_custom', whole-app component_code (existing text column, unchanged).
--
-- We keep `component_code text` as-is rather than converting it to jsonb —
-- it's referenced as a string across the renderer, the code-editor adapter,
-- API routes, services, etc. The cleanest split is: text column for
-- whole-app code (Tier 3), new slot_code jsonb column for per-slot
-- overrides (Tier 2).
--
-- Existing rows with non-empty component_code are migrated to
-- shell_kind = 'fully_custom' so their behaviour is preserved verbatim.
-- Everything else defaults to shell_kind = 'chat'.

BEGIN;

-- 1. New columns ─────────────────────────────────────────────────────────

ALTER TABLE public.aga_apps
  ADD COLUMN IF NOT EXISTS shell_kind text NOT NULL DEFAULT 'chat'
    CHECK (shell_kind IN (
      'chat',
      'form_to_result',
      'widget',
      'compact_modal',
      'full_modal',
      'sidebar_overlay',
      'floating_bubble',
      'inline_overlay',
      'panel_overlay',
      'toast_overlay',
      'card_stack',
      'fully_custom'
    )),
  ADD COLUMN IF NOT EXISTS shell_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS slot_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS slot_code jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Backfill ───────────────────────────────────────────────────────────
-- Any row with non-empty component_code is a legacy/Tier-3 custom app.
-- Mark it as such so the renderer's shell-kind switch routes to the
-- existing Babel path verbatim.

UPDATE public.aga_apps
SET shell_kind = 'fully_custom'
WHERE shell_kind = 'chat'
  AND component_code IS NOT NULL
  AND length(trim(component_code)) > 0;

-- 3. Comments for future readers ────────────────────────────────────────

COMMENT ON COLUMN public.aga_apps.shell_kind IS
  'Top-level layout/widget pattern. Drives which shell component renders the app. ''fully_custom'' = whole UI lives in component_code (legacy/escape-hatch).';

COMMENT ON COLUMN public.aga_apps.shell_config IS
  'Per-shell settings (colors, autoRun, allow-chat, variable input style, history view, etc). Untyped on the DB side; typed in TS per shell_kind.';

COMMENT ON COLUMN public.aga_apps.slot_overrides IS
  'Which slots within the chosen shell are replaced with custom code. Shape: { variableInput?: ''custom'', resultRenderer?: ''custom'', messageDisplay?: ''custom'', preExecutionGate?: ''custom'', ... }. When a slot is ''custom'', the actual component code lives in slot_code under the same key.';

COMMENT ON COLUMN public.aga_apps.slot_code IS
  'Per-slot custom component code (Tier-2). Keyed by slot name, e.g. { "resultRenderer": "<jsx string>", "variableInput": "<jsx string>" }. Babel-compiled at runtime in the same sandbox as component_code. component_code (text) remains the home of whole-app code for shell_kind = ''fully_custom''.';

COMMIT;
