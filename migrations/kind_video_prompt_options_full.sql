-- ============================================================================
-- content-ir kind `video_prompt_options` (+ child `video_prompt_variation`)
-- — FULL package. The first ACTION-CARRYING kind: rendered cards carry a
-- Generate button that launches the declared generation agent through the
-- platform primitive KindAgentActionButton (click-only, chat overlay,
-- prompt pre-filled, aspect_ratio/clip_length mapped to llmOverrides).
--
-- Canonical `__kind` JSON shape:
--   { "__kind":"video_prompt_options", "concept_received"?,
--     "action"?: { agent_id, variable_name?, label? },
--     "prompts": [ { "__kind":"video_prompt_variation", variation?,
--       interpretation?, aspect_ratio?, clip_length?, prompt } ] }
--
-- Rows applied here:
--   * content_ir.kind_definition — video_prompt_options + video_prompt_variation.
--     data / emitted_block_schema / emitted_json_schema / emitted_fingerprint
--     are CONVERTER-EMITTED (kindSchemaToStorage / kindSchemaToJsonSchema /
--     fingerprintText over features/content-ir/kinds/video-prompt-options.ts;
--     emit script output 2026-07-22) — never hand-written. authoring_owner
--     'ts', platform org, visibility public, is_active FALSE until the dual
--     gate flips it (scripts/shape/activate-kinds.ts).
--   * content_ir.kind_edge — video_prompt_options.prompts → video_prompt_variation.
--   * content_ir.kind_example — 2 root examples (canonical full + simple) and
--     1 canonical variation example. validation_status 'passed' is REAL: each
--     passed validateStructuralLeg against the emitted schema, and the root
--     canonical example passed the FULL dual gate (structural + render legs)
--     in-process on 2026-07-22 before this migration was written.
--   * NO kind_surface row — `__kind` JSON is the only arrival form (no
--     tag/fence surface).
--   * content_ir.kind_component — web/output → component_key
--     'video_prompt_options' (the compiled bridge facade into
--     VideoPromptOptionsBlock via block-dispatch).
--   * skill.definition — `kind_video_prompt_options` (render_block).
--   * public.content_blocks — `kind-video-prompt-options-simple` / `-full`
--     under the Agent Skills content-block category; insert-only.
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
    'video_prompt_variation',
    'Video Prompt Variation',
    'ts',
    $J$[{"name":"variation","type":"number"},{"name":"interpretation","description":"One sentence explaining the creative angle this version resolves.","type":"string"},{"name":"aspect_ratio","type":"enum","values":["16:9","9:16"],"open":true},{"name":"clip_length","type":"enum","values":["4s","6s","8s"],"open":true},{"name":"prompt","required":true,"description":"The full, production-ready video generation prompt text.","type":"string"}]$J$::jsonb,
    $J${"__kind":"video_prompt_variation","variation":1,"interpretation":"Literal scientific macro view emphasizing accuracy and awe.","aspect_ratio":"16:9","clip_length":"8s","prompt":"Extreme macro cinematography of a living cell dividing: the nucleus stretches, chromosomes glowing faint blue align along the center, then pull apart toward opposite poles as the membrane pinches into two daughter cells. Soft volumetric light through cytoplasm, shallow depth of field, documentary microscopy realism, slow graceful motion, 8 seconds."}$J$::jsonb,
    $J${"type":"object","properties":{"variation":{"type":"number"},"interpretation":{"type":"string","description":"One sentence explaining the creative angle this version resolves."},"aspect_ratio":{"anyOf":[{"type":"string","enum":["16:9","9:16"]},{"type":"string"}]},"clip_length":{"anyOf":[{"type":"string","enum":["4s","6s","8s"]},{"type":"string"}]},"prompt":{"type":"string","description":"The full, production-ready video generation prompt text."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"video_prompt_variation"}},"required":["__kind","prompt"],"additionalProperties":false}$J$::jsonb,
    $J${"type":"object","properties":{"variation":{"type":"number"},"interpretation":{"type":"string","description":"One sentence explaining the creative angle this version resolves."},"aspect_ratio":{"anyOf":[{"type":"string","enum":["16:9","9:16"]},{"type":"string"}]},"clip_length":{"anyOf":[{"type":"string","enum":["4s","6s","8s"]},{"type":"string"}]},"prompt":{"type":"string","description":"The full, production-ready video generation prompt text."}},"required":["prompt"],"additionalProperties":false}$J$::jsonb,
    'hg-1g78p54v7kyha',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'video_prompt_options',
    'Video Prompt Options',
    'ts',
    $J$[{"name":"concept_received","description":"Echo of the user's raw concept the variations interpret.","type":"string"},{"name":"action","description":"Declares the generation agent the rendered Generate button launches. Platform-mediated, click-only.","type":"inline_object","fields":[{"name":"agent_id","required":true,"type":"string"},{"name":"variable_name","description":"Agent variable that receives the selected prompt text. Default: video_description.","type":"string"},{"name":"label","type":"string"}]},{"name":"prompts","required":true,"type":"array"},{"name":"additionalDetails","type":"inline_object","fields":[],"open":true}]$J$::jsonb,
    $J${"__kind":"video_prompt_options","concept_received":"A short cover video for a science podcast episode about cell division.","action":{"agent_id":"04b7c631-d675-4dca-8b52-0e3371aa87d3","variable_name":"video_description","label":"Generate video"},"prompts":[{"__kind":"video_prompt_variation","variation":1,"interpretation":"Literal scientific macro view emphasizing accuracy and awe.","aspect_ratio":"16:9","clip_length":"8s","prompt":"Extreme macro cinematography of a living cell dividing: the nucleus stretches, chromosomes glowing faint blue align along the center, then pull apart toward opposite poles as the membrane pinches into two daughter cells. Soft volumetric light through cytoplasm, shallow depth of field, documentary microscopy realism, slow graceful motion, 8 seconds."},{"__kind":"video_prompt_variation","variation":2,"interpretation":"Stylized abstract interpretation for a bold podcast-cover look.","aspect_ratio":"9:16","clip_length":"6s","prompt":"Abstract luminous orb of liquid glass splitting into two mirrored orbs, ribbons of light arcing between them like chromosomes, deep navy background with teal and magenta glow, elegant slow-motion split, minimal composition with centered symmetry, premium motion-design aesthetic, 6 seconds."},{"__kind":"video_prompt_variation","variation":3,"interpretation":"Narrative time-lapse framing life emerging from a single cell.","aspect_ratio":"16:9","clip_length":"8s","prompt":"Time-lapse journey beginning with a single glowing cell that divides again and again, the field of view pulling back as divisions accelerate into a shimmering cluster of thousands of cells forming a heart shape, warm golden light rising, hopeful cinematic score mood, photoreal with a dreamlike bloom, 8 seconds."}]}$J$::jsonb,
    $J${"type":"object","properties":{"concept_received":{"type":"string","description":"Echo of the user's raw concept the variations interpret."},"action":{"type":"object","properties":{"agent_id":{"type":"string"},"variable_name":{"type":"string","description":"Agent variable that receives the selected prompt text. Default: video_description."},"label":{"type":"string"}},"required":["agent_id"],"additionalProperties":false,"description":"Declares the generation agent the rendered Generate button launches. Platform-mediated, click-only."},"prompts":{"type":"array","items":{"$ref":"#/$defs/video_prompt_variation"}},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"video_prompt_options"}},"required":["__kind","prompts"],"additionalProperties":false,"$defs":{"video_prompt_variation":{"type":"object","properties":{"variation":{"type":"number"},"interpretation":{"type":"string","description":"One sentence explaining the creative angle this version resolves."},"aspect_ratio":{"anyOf":[{"type":"string","enum":["16:9","9:16"]},{"type":"string"}]},"clip_length":{"anyOf":[{"type":"string","enum":["4s","6s","8s"]},{"type":"string"}]},"prompt":{"type":"string","description":"The full, production-ready video generation prompt text."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"video_prompt_variation"}},"required":["__kind","prompt"],"additionalProperties":false}}}$J$::jsonb,
    $J${"type":"object","properties":{"concept_received":{"type":"string","description":"Echo of the user's raw concept the variations interpret."},"action":{"type":"object","properties":{"agent_id":{"type":"string"},"variable_name":{"type":"string","description":"Agent variable that receives the selected prompt text. Default: video_description."},"label":{"type":"string"}},"required":["agent_id"],"additionalProperties":false,"description":"Declares the generation agent the rendered Generate button launches. Platform-mediated, click-only."},"prompts":{"type":"array","items":{"$ref":"#/$defs/video_prompt_variation"}},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true}},"required":["prompts"],"additionalProperties":false,"$defs":{"video_prompt_variation":{"type":"object","properties":{"variation":{"type":"number"},"interpretation":{"type":"string","description":"One sentence explaining the creative angle this version resolves."},"aspect_ratio":{"anyOf":[{"type":"string","enum":["16:9","9:16"]},{"type":"string"}]},"clip_length":{"anyOf":[{"type":"string","enum":["4s","6s","8s"]},{"type":"string"}]},"prompt":{"type":"string","description":"The full, production-ready video generation prompt text."}},"required":["prompt"],"additionalProperties":false}}}$J$::jsonb,
    '176-1ut7b47c3g3bl',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  )
ON CONFLICT (organization_id, kind) DO UPDATE SET
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

-- ── 2. kind_edge: prompts → video_prompt_variation ──────────────────────────

INSERT INTO content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
SELECT p.id, 'prompts', c.id, 0, p.organization_id
FROM content_ir.kind_definition p
JOIN content_ir.kind_definition c
  ON c.kind = 'video_prompt_variation'
 AND c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND c.deleted_at IS NULL
WHERE p.kind = 'video_prompt_options'
  AND p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND p.deleted_at IS NULL
ON CONFLICT (parent_definition_id, field_name, child_definition_id) DO UPDATE SET
  position = EXCLUDED.position,
  updated_at = now();

-- ── 3. kind_example: REAL validation (structural leg + full dual gate ran
--      in-process 2026-07-22 before authoring; see header) ──────────────────

INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description,
   source, is_canonical, validation_status, validated_at, organization_id)
SELECT d.id, d.version, v.data::jsonb, v.label, v.description,
       'authored', v.is_canonical, 'passed', now(), d.organization_id
FROM (VALUES
  (
    'video_prompt_options', 'Podcast cover video prompts (canonical)', true,
    'Full shape: concept echo, declared generation action, three distinct variations with settings.',
    $J${"__kind":"video_prompt_options","concept_received":"A short cover video for a science podcast episode about cell division.","action":{"agent_id":"04b7c631-d675-4dca-8b52-0e3371aa87d3","variable_name":"video_description","label":"Generate video"},"prompts":[{"__kind":"video_prompt_variation","variation":1,"interpretation":"Literal scientific macro view emphasizing accuracy and awe.","aspect_ratio":"16:9","clip_length":"8s","prompt":"Extreme macro cinematography of a living cell dividing: the nucleus stretches, chromosomes glowing faint blue align along the center, then pull apart toward opposite poles as the membrane pinches into two daughter cells. Soft volumetric light through cytoplasm, shallow depth of field, documentary microscopy realism, slow graceful motion, 8 seconds."},{"__kind":"video_prompt_variation","variation":2,"interpretation":"Stylized abstract interpretation for a bold podcast-cover look.","aspect_ratio":"9:16","clip_length":"6s","prompt":"Abstract luminous orb of liquid glass splitting into two mirrored orbs, ribbons of light arcing between them like chromosomes, deep navy background with teal and magenta glow, elegant slow-motion split, minimal composition with centered symmetry, premium motion-design aesthetic, 6 seconds."},{"__kind":"video_prompt_variation","variation":3,"interpretation":"Narrative time-lapse framing life emerging from a single cell.","aspect_ratio":"16:9","clip_length":"8s","prompt":"Time-lapse journey beginning with a single glowing cell that divides again and again, the field of view pulling back as divisions accelerate into a shimmering cluster of thousands of cells forming a heart shape, warm golden light rising, hopeful cinematic score mood, photoreal with a dreamlike bloom, 8 seconds."}]}$J$
  ),
  (
    'video_prompt_options', 'Single variation, no action (minimal)', false,
    'Minimal form: one variation, no action block — cards render display-only.',
    $J${"__kind":"video_prompt_options","concept_received":"A calm ocean sunrise loop.","prompts":[{"__kind":"video_prompt_variation","variation":1,"interpretation":"Single static wide shot, meditative pacing.","aspect_ratio":"16:9","clip_length":"4s","prompt":"Static wide shot of a calm ocean at sunrise, gentle waves rolling toward the camera, warm orange sky with thin clouds, photorealistic, seamless loop, 4 seconds."}]}$J$
  ),
  (
    'video_prompt_variation', 'Macro cell-division variation (canonical)', true,
    'One production-ready variation with interpretation and settings.',
    $J${"__kind":"video_prompt_variation","variation":1,"interpretation":"Literal scientific macro view emphasizing accuracy and awe.","aspect_ratio":"16:9","clip_length":"8s","prompt":"Extreme macro cinematography of a living cell dividing: the nucleus stretches, chromosomes glowing faint blue align along the center, then pull apart toward opposite poles as the membrane pinches into two daughter cells. Soft volumetric light through cytoplasm, shallow depth of field, documentary microscopy realism, slow graceful motion, 8 seconds."}$J$
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
SELECT d.id, 'web', 'output', 'video_prompt_options', 'bundled',
       $J${"legacyBlockType": "video_prompt_options"}$J$::jsonb, true, true, 100, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'video_prompt_options'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.component_key = 'video_prompt_options'
      AND c.deleted_at IS NULL
  );

-- ── 5. Skill: kind_video_prompt_options ─────────────────────────────────────

INSERT INTO skill.definition
  (skill_id, label, description, skill_type, body, icon_name,
   is_active, is_system, visibility, category_id, sort_order,
   semver, platform_targets, organization_id, metadata)
SELECT
  'kind_video_prompt_options',
  'Video Prompt Options (structured)',
  'How and when to emit a video_prompt_options render block as structured "__kind" JSON: prompt variation cards with aspect ratio / clip length settings and a declared generation-agent action that renders as a click-to-generate button.',
  'render_block',
  $SB$# Video Prompt Options (structured JSON with a Generate action)

You can present video-generation prompt variations as a live, actionable card
set by emitting a single JSON object marked with
`"__kind": "video_prompt_options"`. Each variation renders as a card showing
its creative interpretation, aspect ratio, clip length, and the full prompt
text — with a Copy button and (when an `action` is declared) a
**Generate video** button that launches the generation agent in a chat window
with that variation's prompt pre-filled and its aspect ratio / duration
applied as settings. Reach for it whenever you produce candidate prompts for
a video model (Veo or similar) and the user should pick one and generate.

## How to emit it

Emit one JSON object. It may sit inside a ```json fence or stand bare in the
message — the pipeline recognizes `"__kind": "video_prompt_options"` either
way:

```json
{
  "__kind": "video_prompt_options",
  "concept_received": "<echo the user's raw concept>",
  "action": {
    "agent_id": "<uuid of the generation agent>",
    "variable_name": "video_description",
    "label": "Generate video"
  },
  "prompts": [
    {
      "__kind": "video_prompt_variation",
      "variation": 1,
      "interpretation": "<one sentence on the creative angle this version resolves>",
      "aspect_ratio": "16:9",
      "clip_length": "8s",
      "prompt": "<the full, production-ready video prompt text>"
    }
  ]
}
```

## The root shape

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Always the literal `"video_prompt_options"`. |
| `concept_received` | string | no | Echo of the user's raw concept. |
| `action` | object | no | Declares the generation agent the button launches (below). |
| `prompts` | array | yes | One or more `video_prompt_variation` objects. |

## The action shape (what makes the button work)

| Field | Type | Required | Notes |
|---|---|---|---|
| `agent_id` | string | yes | The generation agent's permanent id. Use the exact id you were given in your instructions — never invent one. |
| `variable_name` | string | no | The agent variable that receives the selected prompt text. Default: `video_description`. |
| `label` | string | no | Button text. Default: "Generate video". |

Omit `action` entirely if you were not given a generation agent id — the
cards then render display-only (still copyable), never a broken button. The
action only ever DECLARES the launch; nothing runs until the user clicks.

## The video_prompt_variation shape

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Always the literal `"video_prompt_variation"`. |
| `variation` | number | no | 1-based ordinal. |
| `interpretation` | string | no | ONE concise sentence: the creative angle or ambiguity this version resolves. |
| `aspect_ratio` | string | no | `"16:9"` or `"9:16"` (passed to the generator as a setting). |
| `clip_length` | string | no | `"4s"`, `"6s"`, or `"8s"` (passed as duration). |
| `prompt` | string | yes | The full, production-ready prompt text — self-contained, no placeholders. |

## Rules

1. ONE object per set; every variation carries its own
   `"__kind": "video_prompt_variation"`.
2. Each `prompt` must stand alone — the generator receives ONLY that text
   (plus aspect ratio / duration). Never reference "the concept above".
3. Offer genuinely distinct interpretations (typically 3): different creative
   angles, not wording shuffles. Say what each resolves in `interpretation`.
4. `aspect_ratio` / `clip_length` are real generation settings — choose them
   deliberately per variation (vertical `9:16` for covers/shorts, `16:9`
   for widescreen).
5. Valid JSON only — double-quoted keys/strings, no trailing commas, no
   comments.

## Editing an existing set

When asked to revise, return ONE complete `video_prompt_options` object with
the FULL updated set — never a fragment. Preserve untouched variations
verbatim, including the `action` block.
$SB$,
  'Clapperboard',
  true, true, 'public',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',  -- platform.categories: dimension 'skill', "Render Blocks"
  31, '1.0.0', '["web"]'::jsonb,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"kind": "video_prompt_options"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'kind_video_prompt_options'
    AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND project_id IS NULL AND task_id IS NULL
    AND deleted_at IS NULL
);

-- ── 6. Content blocks — Agent Skills category, paired to the skill.
--      Insert-only (coexist-not-clobber). ──────────────────────────────────

INSERT INTO public.content_blocks
  (block_id, label, description, icon_name, template,
   category_id, sort_order, is_active, organization_id, metadata)
SELECT v.block_id, v.label, v.description, v.icon_name, v.template,
       '2c324058-95e9-4b7e-a991-884f4443eb6e',
       v.sort_order, true,
       '39c38960-d30c-4840-b0c1-c9960de95582',
       '{"skill_id": "kind_video_prompt_options"}'::jsonb
FROM (VALUES
  (
    'kind-video-prompt-options-simple', 'Video Prompt Options',
    'Condensed instructions for emitting a video_prompt_options render block with a generation action.',
    'Clapperboard', 10,
    $CB$When you produce candidate prompts for video generation, emit them as an actionable card set — each variation renders with its settings, a Copy button, and a Generate button that launches the generation agent with the prompt pre-filled:

```json
{ "__kind": "video_prompt_options",
  "concept_received": "<the user's concept>",
  "action": { "agent_id": "<generation agent uuid>", "variable_name": "video_description" },
  "prompts": [
    { "__kind": "video_prompt_variation", "variation": 1,
      "interpretation": "<one sentence on this version's creative angle>",
      "aspect_ratio": "16:9", "clip_length": "8s",
      "prompt": "<full production-ready prompt>" }
  ] }
```

- Root `__kind` is `video_prompt_options`; `prompts` is required. Every variation carries `"__kind": "video_prompt_variation"` and a self-contained `prompt`.
- `action.agent_id` must be the exact agent id from your instructions; omit `action` entirely if you weren't given one.
- `aspect_ratio` (`"16:9"`/`"9:16"`) and `clip_length` (`"4s"`/`"6s"`/`"8s"`) are real generation settings — pick them per variation.
- Valid JSON only — no trailing commas.$CB$
  ),
  (
    'kind-video-prompt-options-full', 'Video Prompt Options (Variations)',
    'Video prompt options render block with multiple distinct creative variations.',
    'Film', 20,
    $CB$Offer genuinely distinct creative interpretations (typically 3) of the user's video concept, each resolving a different ambiguity:

```json
{ "__kind": "video_prompt_options",
  "concept_received": "A cover video about cell division.",
  "action": { "agent_id": "<generation agent uuid>", "variable_name": "video_description", "label": "Generate video" },
  "prompts": [
    { "__kind": "video_prompt_variation", "variation": 1,
      "interpretation": "Literal scientific macro view emphasizing accuracy.",
      "aspect_ratio": "16:9", "clip_length": "8s",
      "prompt": "Extreme macro cinematography of a living cell dividing..." },
    { "__kind": "video_prompt_variation", "variation": 2,
      "interpretation": "Stylized abstract look for a bold cover.",
      "aspect_ratio": "9:16", "clip_length": "6s",
      "prompt": "Abstract luminous orb of liquid glass splitting in two..." }
  ] }
```

- Variations are different creative angles, never wording shuffles; state what each resolves in `interpretation`.
- Every `prompt` stands alone — the generator receives only that text plus the aspect ratio / duration settings.
- The Generate button fires only on the user's click; the JSON just declares the target agent.$CB$
  )
) AS v(block_id, label, description, icon_name, sort_order, template)
WHERE NOT EXISTS (
  SELECT 1 FROM public.content_blocks b WHERE b.block_id = v.block_id
);

COMMIT;
