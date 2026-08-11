-- ============================================================================
-- content-ir kind `episode_title_options` (+ child `episode_title_option`)
-- — FULL package. The second ACTION-CARRYING kind, and the first whose action
-- is a WRITE rather than an agent launch: each rendered card carries a "Use
-- this title" button that persists the pick through the platform's surface
-- writeback seam (`episode_title` write target on `matrx-user/podcast-run`
-- → podcastService.updateEpisode). Produced by the `podcast.title_optimizer`
-- agent slot (aidream `podcast_slots.py`, FLOATING) and consumed by
-- matrx-frontend's studio run page.
--
-- Canonical `__kind` JSON shape:
--   { "__kind":"episode_title_options", "working_title"?,
--     "options": [ { "__kind":"episode_title_option", title,
--       subtitle?, rationale? } ] }
--
-- The write target is deliberately NOT declared in the payload (unlike
-- video_prompt_options' `action.agent_id`): the component names it as a
-- constant, so generated content can never aim a write at an arbitrary target
-- the mounted surface happens to declare. See the module header of
-- features/content-ir/kinds/episode-title-options.ts.
--
-- Rows applied here:
--   * content_ir.kind_definition — episode_title_options +
--     episode_title_option. data / emitted_block_schema / emitted_json_schema
--     / emitted_fingerprint are CONVERTER-EMITTED (kindSchemaToStorage /
--     kindSchemaToJsonSchema / fingerprintText over
--     features/content-ir/kinds/episode-title-options.ts, via
--     `pnpm shape:emit`) — never hand-written. authoring_owner 'ts', platform
--     org, visibility public, is_active FALSE until the dual gate flips it
--     (content_ir.set_kind_activation).
--   * content_ir.kind_edge — episode_title_options.options →
--     episode_title_option.
--   * content_ir.kind_example — 2 root examples (canonical full + minimal)
--     and 1 canonical child example. `validation_status` is NOT written here:
--     the kind_example_recompute_validation trigger derives it on write. All
--     three passed the structural leg in-process on 2026-08-11 before this
--     migration was written (scripts/shape/emit-kind-rows.ts +
--     validateStructuralLeg), and the bridge produced the exact serverData
--     EpisodeTitleOptionsBlock consumes.
--   * NO kind_surface row — `__kind` JSON is the only arrival form.
--   * content_ir.kind_component — web/output → component_key
--     'episode_title_options' (the compiled bridge facade into
--     EpisodeTitleOptionsBlock via block-dispatch).
--   * skill.definition — `kind_episode_title_options` (render_block).
--   * skill.render_definition — `kind-episode-title-options-simple` / `-full`
--     under the Agent Skills category, block_type 'render_kind', linked to
--     the skill by id; insert-only. (public.content_blocks was graveyarded.)
--
-- Idempotent on business keys; re-apply is safe. is_active on existing
-- kind_definition rows is deliberately NOT touched on re-apply.
-- ============================================================================

BEGIN;

-- ── 1. kind_definition: child first (root's edge resolves to it) ────────────

INSERT INTO content_ir.kind_definition
  (kind, label, authoring_owner, data, sample_data,
   emitted_block_schema, emitted_json_schema, emitted_fingerprint,
   is_active, organization_id, visibility)
VALUES
  (
    'episode_title_option',
    'Episode Title Option',
    'ts',
    $J$[{"name":"title","required":true,"description":"The full replacement episode title, exactly as it should be saved. One line, no surrounding quotes.","type":"string"},{"name":"subtitle","description":"Optional supporting line shown beside the title (a tagline or clarifier). Never part of the saved title.","type":"string"},{"name":"rationale","description":"One sentence on why this title works — the angle, search intent, or curiosity gap it serves.","type":"string"}]$J$::jsonb,
    $J${"__kind":"episode_title_option","title":"Why You Wake Up At 3 AM (And How To Stop)","subtitle":"The cortisol cycle nobody explains","rationale":"Names the exact symptom listeners search for, then promises the fix — high click-through without overpromising a cure."}$J$::jsonb,
    $J${"type":"object","properties":{"title":{"type":"string","description":"The full replacement episode title, exactly as it should be saved. One line, no surrounding quotes."},"subtitle":{"type":"string","description":"Optional supporting line shown beside the title (a tagline or clarifier). Never part of the saved title."},"rationale":{"type":"string","description":"One sentence on why this title works — the angle, search intent, or curiosity gap it serves."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"episode_title_option"}},"required":["__kind","title"],"additionalProperties":false}$J$::jsonb,
    $J${"type":"object","properties":{"title":{"type":"string","description":"The full replacement episode title, exactly as it should be saved. One line, no surrounding quotes."},"subtitle":{"type":"string","description":"Optional supporting line shown beside the title (a tagline or clarifier). Never part of the saved title."},"rationale":{"type":"string","description":"One sentence on why this title works — the angle, search intent, or curiosity gap it serves."}},"required":["title"],"additionalProperties":false}$J$::jsonb,
    'hp-jjwe30ghs6om',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'episode_title_options',
    'Episode Title Options',
    'ts',
    $J$[{"name":"working_title","description":"The episode's current title, echoed so the alternatives can be judged against it.","type":"string"},{"name":"options","required":true,"type":"array"},{"name":"additionalDetails","type":"inline_object","fields":[],"open":true}]$J$::jsonb,
    $J${"__kind":"episode_title_options","working_title":"Episode 12 - Sleep","options":[{"__kind":"episode_title_option","title":"Why You Wake Up At 3 AM (And How To Stop)","subtitle":"The cortisol cycle nobody explains","rationale":"Names the exact symptom listeners search for, then promises the fix — high click-through without overpromising a cure."},{"__kind":"episode_title_option","title":"The Sleep Advice That Finally Worked","subtitle":"After twenty years of bad nights","rationale":"Curiosity gap plus credibility: it implies a tested answer rather than another listicle."},{"__kind":"episode_title_option","title":"Sleep Debt Is Real. Here's How To Pay It Back.","rationale":"Leads with the term the episode actually explains, so it ranks for the concept as well as the symptom."}]}$J$::jsonb,
    $J${"type":"object","properties":{"working_title":{"type":"string","description":"The episode's current title, echoed so the alternatives can be judged against it."},"options":{"type":"array","items":{"$ref":"#/$defs/episode_title_option"}},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"episode_title_options"}},"required":["__kind","options"],"additionalProperties":false,"$defs":{"episode_title_option":{"type":"object","properties":{"title":{"type":"string","description":"The full replacement episode title, exactly as it should be saved. One line, no surrounding quotes."},"subtitle":{"type":"string","description":"Optional supporting line shown beside the title (a tagline or clarifier). Never part of the saved title."},"rationale":{"type":"string","description":"One sentence on why this title works — the angle, search intent, or curiosity gap it serves."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"episode_title_option"}},"required":["__kind","title"],"additionalProperties":false}}}$J$::jsonb,
    $J${"type":"object","properties":{"working_title":{"type":"string","description":"The episode's current title, echoed so the alternatives can be judged against it."},"options":{"type":"array","items":{"$ref":"#/$defs/episode_title_option"}},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true}},"required":["options"],"additionalProperties":false,"$defs":{"episode_title_option":{"type":"object","properties":{"title":{"type":"string","description":"The full replacement episode title, exactly as it should be saved. One line, no surrounding quotes."},"subtitle":{"type":"string","description":"Optional supporting line shown beside the title (a tagline or clarifier). Never part of the saved title."},"rationale":{"type":"string","description":"One sentence on why this title works — the angle, search intent, or curiosity gap it serves."}},"required":["title"],"additionalProperties":false}}}$J$::jsonb,
    'wv-9h3qzd5xezuf',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  )
-- Slug uniqueness is GLOBAL and partial (`kind_definition_global_slug_unique`
-- on (kind) WHERE deleted_at IS NULL), so the conflict target must repeat the
-- index predicate — `(organization_id, kind)` no longer exists.
ON CONFLICT (kind) WHERE deleted_at IS NULL DO UPDATE SET
  label = EXCLUDED.label,
  authoring_owner = EXCLUDED.authoring_owner,
  data = EXCLUDED.data,
  sample_data = EXCLUDED.sample_data,
  emitted_block_schema = EXCLUDED.emitted_block_schema,
  emitted_json_schema = EXCLUDED.emitted_json_schema,
  emitted_fingerprint = EXCLUDED.emitted_fingerprint,
  visibility = EXCLUDED.visibility,
  updated_at = now();
  -- is_active deliberately NOT updated: activation belongs to the dual gate.

-- ── 2. kind_edge: options → episode_title_option ────────────────────────────

INSERT INTO content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
SELECT p.id, 'options', c.id, 0, p.organization_id
FROM content_ir.kind_definition p
JOIN content_ir.kind_definition c
  ON c.kind = 'episode_title_option'
 AND c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND c.deleted_at IS NULL
WHERE p.kind = 'episode_title_options'
  AND p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND p.deleted_at IS NULL
ON CONFLICT (parent_definition_id, field_name, child_definition_id) DO UPDATE SET
  position = EXCLUDED.position,
  updated_at = now();

-- ── 3. kind_example — validation_status is DERIVED by the
--      kind_example_recompute_validation trigger, never written here. ───────

INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description,
   source, is_canonical, organization_id)
SELECT d.id, d.version, v.data::jsonb, v.label, v.description,
       'authored', v.is_canonical, d.organization_id
FROM (VALUES
  (
    'episode_title_options', 'Sleep episode title options (canonical)', true,
    'Full shape: the working title plus three ranked alternatives, each with a subtitle and a rationale.',
    $J${"__kind":"episode_title_options","working_title":"Episode 12 - Sleep","options":[{"__kind":"episode_title_option","title":"Why You Wake Up At 3 AM (And How To Stop)","subtitle":"The cortisol cycle nobody explains","rationale":"Names the exact symptom listeners search for, then promises the fix — high click-through without overpromising a cure."},{"__kind":"episode_title_option","title":"The Sleep Advice That Finally Worked","subtitle":"After twenty years of bad nights","rationale":"Curiosity gap plus credibility: it implies a tested answer rather than another listicle."},{"__kind":"episode_title_option","title":"Sleep Debt Is Real. Here's How To Pay It Back.","rationale":"Leads with the term the episode actually explains, so it ranks for the concept as well as the symptom."}]}$J$
  ),
  (
    'episode_title_options', 'Single option, no working title (minimal)', false,
    'Minimal form: one option carrying only a title — cards still render and still apply.',
    $J${"__kind":"episode_title_options","options":[{"__kind":"episode_title_option","title":"The Quiet Case For Doing Less"}]}$J$
  ),
  (
    'episode_title_option', 'Sleep title option (canonical)', true,
    'One candidate title with its supporting line and the reasoning behind it.',
    $J${"__kind":"episode_title_option","title":"Why You Wake Up At 3 AM (And How To Stop)","subtitle":"The cortisol cycle nobody explains","rationale":"Names the exact symptom listeners search for, then promises the fix — high click-through without overpromising a cure."}$J$
  )
) AS v(kind, label, is_canonical, description, data)
JOIN content_ir.kind_definition d
  ON d.kind = v.kind
 AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND d.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM content_ir.kind_example x
  WHERE x.kind_definition_id = d.id AND x.label = v.label AND x.deleted_at IS NULL
);

-- ── 4. kind_component: web output → the bundled renderer ────────────────────

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', 'episode_title_options', 'bundled',
       $J${"legacyBlockType": "episode_title_options"}$J$::jsonb, true, true, 100, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'episode_title_options'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.component_key = 'episode_title_options'
      AND c.deleted_at IS NULL
  );

-- ── 5. Skill: kind_episode_title_options ────────────────────────────────────

INSERT INTO skill.definition
  (skill_id, label, description, skill_type, body, icon_name,
   is_active, is_system, visibility, category_id, sort_order,
   semver, platform_targets, organization_id, metadata)
SELECT
  'kind_episode_title_options',
  'Episode Title Options (structured)',
  'How and when to emit an episode_title_options render block as structured "__kind" JSON: ranked title candidates that render as cards the user can copy or apply to the episode with one click.',
  'render_block',
  $SB$# Episode Title Options (structured JSON with a one-click apply)

When you produce candidate titles for a podcast episode, emit them as a
single JSON object marked with `"__kind": "episode_title_options"`. Each
option renders as a card showing the title, its supporting line, and your
reasoning — with a Copy button and, on any page that owns the episode, a
**Use this title** button that saves it to the episode immediately. Reach for
it whenever the user should PICK one of several titles.

## How to emit it

Emit exactly one JSON object. It may sit inside a ```json fence or stand bare
in the message — the pipeline recognizes `"__kind": "episode_title_options"`
either way:

```json
{
  "__kind": "episode_title_options",
  "working_title": "<the episode's current title>",
  "options": [
    {
      "__kind": "episode_title_option",
      "title": "<the full replacement title, exactly as it should be saved>",
      "subtitle": "<optional supporting line>",
      "rationale": "<one sentence on why this title works>"
    }
  ]
}
```

## The root shape

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Always the literal `"episode_title_options"`. |
| `working_title` | string | no | Echo of the episode's current title, so the alternatives can be judged against it. |
| `options` | array | yes | One or more `episode_title_option` objects, best first. |

## The episode_title_option shape

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Always the literal `"episode_title_option"`. |
| `title` | string | yes | The FULL replacement title, saved verbatim. One line, no surrounding quotes, no numbering, no "Option 1:" prefix. |
| `subtitle` | string | no | A supporting line shown beside the title. It is NEVER part of the saved title. |
| `rationale` | string | no | ONE sentence: the angle, search intent, or curiosity gap this title serves. |

## Rules

1. ONE object per set; every option carries its own
   `"__kind": "episode_title_option"`.
2. `title` is what gets SAVED. Write it exactly as it should appear — no
   quotes around it, no trailing period unless the title genuinely ends in
   one, no ranking prefix.
3. Rank them: put the strongest option first.
4. Offer genuinely different angles (typically 3–5), not wording shuffles.
   Say what each one is doing in `rationale`.
5. Keep titles realistic for a podcast listing — clickable without being
   clickbait, and honest about what the episode actually contains.
6. Valid JSON only — double-quoted keys/strings, no trailing commas, no
   comments.

## What you do NOT control

The apply button is platform-owned: it writes to whichever episode the page
owns, and it only ever fires on the user's click. Do not include ids, write
targets, or instructions about applying — just the options.

## Editing an existing set

When asked to revise, return ONE complete `episode_title_options` object with
the FULL updated set — never a fragment. Preserve untouched options verbatim.
$SB$,
  'Type',
  true, true, 'public',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',  -- platform.categories: dimension 'skill', "Render Blocks"
  63, '1.0.0', '["web"]'::jsonb,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"kind": "episode_title_options"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'kind_episode_title_options'
    AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND project_id IS NULL AND task_id IS NULL
    AND deleted_at IS NULL
);

-- ── 6. Render blocks — Agent Skills category, paired to the skill, linked to
--      it by id. `skill.render_definition` is the canonical home
--      (public.content_blocks was graveyarded in the 2026-08
--      canonicalization). Insert-only (coexist-not-clobber). ───────────────

INSERT INTO skill.render_definition
  (block_id, label, description, icon_name, template, block_type,
   category_id, sort_order, is_active, organization_id, skill_id, metadata)
SELECT v.block_id, v.label, v.description, v.icon_name, v.template,
       'render_kind',
       '2c324058-95e9-4b7e-a991-884f4443eb6e',
       v.sort_order, true,
       '39c38960-d30c-4840-b0c1-c9960de95582',
       (SELECT s.id FROM skill.definition s
         WHERE s.skill_id = 'kind_episode_title_options'
           AND s.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
           AND s.deleted_at IS NULL
         LIMIT 1),
       '{"skill_id": "kind_episode_title_options"}'::jsonb
FROM (VALUES
  (
    'kind-episode-title-options-simple', 'Episode Title Options',
    'Condensed instructions for emitting an episode_title_options render block.',
    'Type', 10,
    $CB$When you propose titles for an episode, emit them as a pick-one card set — each option renders with a Copy button and a one-click "Use this title" button that saves it to the episode:

```json
{ "__kind": "episode_title_options",
  "working_title": "<the episode's current title>",
  "options": [
    { "__kind": "episode_title_option",
      "title": "<the full replacement title, saved verbatim>",
      "subtitle": "<optional supporting line>",
      "rationale": "<one sentence on why this title works>" }
  ] }
```

- Root `__kind` is `episode_title_options`; `options` is required and every option carries `"__kind": "episode_title_option"`.
- `title` is SAVED verbatim: one line, no surrounding quotes, no "Option 1:" prefix. `subtitle` is never part of the saved title.
- Rank them — strongest first — and make each a genuinely different angle.
- Valid JSON only — no trailing commas.$CB$
  ),
  (
    'kind-episode-title-options-full', 'Episode Title Options (Ranked)',
    'Episode title options render block with several distinct ranked angles.',
    'ListOrdered', 20,
    $CB$Offer 3–5 genuinely different title angles for the episode, strongest first, each with the reasoning behind it:

```json
{ "__kind": "episode_title_options",
  "working_title": "Episode 12 - Sleep",
  "options": [
    { "__kind": "episode_title_option",
      "title": "Why You Wake Up At 3 AM (And How To Stop)",
      "subtitle": "The cortisol cycle nobody explains",
      "rationale": "Names the exact symptom listeners search for, then promises the fix." },
    { "__kind": "episode_title_option",
      "title": "Sleep Debt Is Real. Here's How To Pay It Back.",
      "rationale": "Leads with the concept the episode explains, so it ranks for it too." }
  ] }
```

- Different angles, not wording shuffles: symptom-first, concept-first, story-first, contrarian.
- Titles must be clickable without being clickbait, and honest about the episode's actual content.
- The apply button is platform-owned and fires only on the user's click — never include ids or write instructions.$CB$
  )
) AS v(block_id, label, description, icon_name, sort_order, template)
WHERE NOT EXISTS (
  SELECT 1 FROM skill.render_definition b
  WHERE b.block_id = v.block_id AND b.deleted_at IS NULL
);

COMMIT;
