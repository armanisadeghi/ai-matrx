-- ============================================================================
-- Forms (questionnaire) render block pack — skill + render registry + content
-- blocks + teaches the EXACT <questionnaire> format the parser expects.
--
-- The questionnaire block renders an interactive form; the user's answers
-- round-trip back into the message content (generic persistence strategy), so
-- the agent SEES them on the next turn. This pack teaches agents to emit it.
--
-- Idempotent (WHERE NOT EXISTS / ON CONFLICT). Reuses the 'render-blocks'
-- skl_categories row.
-- ============================================================================

BEGIN;

INSERT INTO public.skl_categories
  (category_key, label, description, icon_name, sort_order, is_active)
VALUES ('render-blocks', 'Render Blocks',
        'Teaching skills for first-class streamed render blocks: when and how to emit each block type.',
        'Blocks', 50, true)
ON CONFLICT (category_key) DO NOTHING;

-- ── System skill: interactive-forms ─────────────────────────────────────────
INSERT INTO public.skl_definitions
  (skill_id, label, description, skill_type, body, icon_name,
   is_active, is_system, is_public, category_id, sort_order, version, platform_targets)
SELECT
  'interactive-forms',
  'Interactive Forms',
  'How and when to emit a <questionnaire> render block: an interactive form (text, choices, sliders, toggles) whose answers come BACK to you on the next turn. The exact section-per-question format the parser expects.',
  'render_block',
  $SKILL_BODY$# Interactive Forms

You can ask the user structured questions by emitting a `<questionnaire>` block. It
renders as a real interactive form — text fields, checkboxes, radio buttons, dropdowns,
sliders, toggles — and, crucially, **the user's answers round-trip back into the
conversation, so you SEE what they filled in on your next turn.** Use it whenever you
need several pieces of information at once (intake, preferences, a survey, a quiz) — far
better than asking one question at a time in prose.

## How to emit one

Wrap the questions in a `<questionnaire>` tag. Each question is a `##` heading followed
by a `Type:` line; choices are a bullet list under the question:

```
<questionnaire>
## Q1: What's your name?
Type: Input

## Q2: Which features do you use? (with Other)
Type: Checkbox
- Dashboards
- Reports
- Automations

## Q3: Preferred plan
Type: Radio
- Starter
- Pro
- Enterprise

## Q4: How satisfied are you?
Type: Slider
Range: 1-5

## Q5: Send me product updates?
Type: Toggle

## Q6: Anything else you'd like us to know?
Type: Text
</questionnaire>
```

## The question types

| `Type:` | Renders as | Add choices? |
|---|---|---|
| `Input` | single-line text box | no |
| `Text` | multi-line text area | no |
| `Radio` | pick exactly one | yes (bullet list) |
| `Checkbox` | pick any number | yes (bullet list) |
| `Dropdown` | pick one from a menu | yes (bullet list) |
| `Slider` | a numeric slider | no — add `Range: min-max` |
| `Toggle` | on/off switch | no |

## Rules

- **Wrap the whole form in one `<questionnaire>` … `</questionnaire>`.**
- **Each question is a `##` heading.** Number them `## Q1:`, `## Q2:` … (or just write the
  question — it's auto-numbered).
- **The line right after the heading is `Type: <one of the types above>`.**
- **Choices** (Radio / Checkbox / Dropdown) are a `-` bullet list under the question.
- **Slider** needs a `Range: min-max` line (e.g. `Range: 0-100`).
- An **"Other" free-text option** is added automatically for Checkbox/Dropdown; to add it
  to Radio too, put `(with Other)` in the question heading.
- Keep it focused — a handful of questions per form. Don't nest questionnaires.
- **After the user submits**, their answers are in the conversation — read them and
  continue (confirm, act, or branch). Don't re-ask what they already answered.

## When to use a form vs. just asking

Use a `<questionnaire>` when you need **multiple** answers, **structured** choices, or a
**rating/scale** — onboarding, preferences, a quiz, a feedback survey, a triage intake.
For a single quick question, plain prose is fine.
$SKILL_BODY$,
  'ClipboardList',
  true, true, true,
  (SELECT id FROM public.skl_categories WHERE category_key = 'render-blocks'),
  40, '1.0.0', '["web"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.skl_definitions
  WHERE skill_id = 'interactive-forms'
    AND user_id IS NULL AND organization_id IS NULL AND project_id IS NULL
);

-- ── Render definition + components ──────────────────────────────────────────
INSERT INTO public.skl_render_definitions
  (block_id, label, description, icon_name, template, skill_id, is_active, is_public, sort_order)
SELECT
  'questionnaire',
  'Interactive Form',
  'A <questionnaire> render block — an interactive form (text/choice/slider/toggle) whose answers round-trip back to the agent on the next turn.',
  'ClipboardList',
  E'<questionnaire>\n## Q1: What should we call you?\nType: Input\n\n## Q2: Pick your interests\nType: Checkbox\n- Design\n- Engineering\n- Marketing\n</questionnaire>',
  (SELECT id FROM public.skl_definitions WHERE skill_id = 'interactive-forms'),
  true, true, 40
WHERE NOT EXISTS (
  SELECT 1 FROM public.skl_render_definitions WHERE block_id = 'questionnaire'
);

WITH rd AS (
  SELECT id FROM public.skl_render_definitions WHERE block_id = 'questionnaire' LIMIT 1
)
INSERT INTO public.skl_render_components
  (render_definition_id, component_key, platform, import_path, is_active, sort_order)
SELECT rd.id, v.component_key, v.platform, v.import_path, v.is_active, v.sort_order
FROM rd,
  (VALUES
    ('QuestionnaireRenderer', 'web',              '@/components/mardown-display/blocks/questionnaire/QuestionnaireRenderer', true,  10),
    ('QuestionnaireRenderer', 'chrome-extension', NULL,                                                                       false, 20),
    ('QuestionnaireRenderer', 'desktop',          NULL,                                                                       false, 30),
    ('QuestionnaireRenderer', 'mobile',           NULL,                                                                       false, 40)
  ) AS v(component_key, platform, import_path, is_active, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.skl_render_components c
  WHERE c.render_definition_id = rd.id AND c.platform = v.platform
);

-- ── Content blocks ──────────────────────────────────────────────────────────
INSERT INTO public.shortcut_categories
  (placement_type, label, description, icon_name, sort_order, is_active)
SELECT
  'content-block', 'Forms',
  'Inject instructions that teach an agent to ask structured questions with an interactive <questionnaire> form (answers come back to the agent).',
  'ClipboardList', 44, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.shortcut_categories
  WHERE placement_type = 'content-block' AND label = 'Forms'
    AND user_id IS NULL AND organization_id IS NULL
    AND project_id IS NULL AND task_id IS NULL
);

INSERT INTO public.content_blocks (block_id, label, description, icon_name, template, category_id, sort_order, is_active)
SELECT v.block_id, v.label, v.description, 'ClipboardList', v.template,
       (SELECT id FROM public.shortcut_categories
         WHERE placement_type = 'content-block' AND label = 'Forms'
           AND user_id IS NULL AND organization_id IS NULL AND project_id IS NULL AND task_id IS NULL LIMIT 1),
       v.sort_order, true
FROM (VALUES
  ('form-questionnaire', 'Interactive Form', 'Ask several structured questions at once; answers come back to you', 10,
   $CB$When you need MULTIPLE pieces of info or structured choices from the user, ask with an interactive form instead of one prose question at a time — and the user's answers come back to you on the next turn:

<questionnaire>
## Q1: What should we call you?
Type: Input

## Q2: Which features do you use?
Type: Checkbox
- Dashboards
- Reports
- Automations

## Q3: How satisfied are you?
Type: Slider
Range: 1-5
</questionnaire>

Each question = a ## heading + a `Type:` line (Input, Text, Radio, Checkbox, Dropdown, Slider, Toggle). Choices for Radio/Checkbox/Dropdown go in a `-` bullet list; Slider needs `Range: min-max`. Wrap the whole form in one <questionnaire>…</questionnaire>. After they submit, read their answers and continue — don't re-ask.$CB$),

  ('form-survey', 'Feedback Survey', 'A short rating + comments survey', 20,
   $CB$To gather feedback, emit a short survey as an interactive form:

<questionnaire>
## Q1: How would you rate your experience?
Type: Slider
Range: 1-5

## Q2: What worked well?
Type: Checkbox
- Ease of use
- Speed
- Support
- Pricing

## Q3: What could we improve?
Type: Text
</questionnaire>

Types: Slider needs `Range: min-max`; Checkbox/Radio/Dropdown take a `-` bullet list; Text = multi-line. The answers return to you next turn — summarize them back.$CB$),

  ('form-intake', 'Intake Form', 'Collect onboarding/intake details', 30,
   $CB$To collect onboarding or intake details, emit an interactive form:

<questionnaire>
## Q1: Full name
Type: Input

## Q2: Role
Type: Dropdown
- Founder
- Engineer
- Designer
- Other

## Q3: What are you hoping to achieve?
Type: Text

## Q4: Email me updates?
Type: Toggle
</questionnaire>

Each question is a ## heading + `Type:` line (Input/Text/Radio/Checkbox/Dropdown/Slider/Toggle). The user's answers round-trip back into the conversation — act on them, don't re-ask.$CB$)
) AS v(block_id, label, description, sort_order, template)
ON CONFLICT (block_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  template = EXCLUDED.template,
  category_id = EXCLUDED.category_id,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

COMMIT;
