-- ============================================================================
-- content-ir kind `media_chapters` (+ child `media_chapter`) — FULL package.
--
-- A timestamped chapter index for timed media. Produced by the
-- `podcast.chapter_marker` agent slot and persisted to
-- `pc_episodes.metadata.chapters`, where it drives the podcast player's
-- seek UI. Named generically because the same index serves video and any
-- other timed media — nothing in the shape is podcast-specific.
--
-- REUSE CHECKED FIRST: `timeline` does NOT fit. It is a two-level roadmap
-- (periods → events) with per-event completion status, rendered as a progress
-- visualization. A chapter index is flat, strictly increasing, gapless, and
-- exists to seek a player. Mapping one onto the other needs a fake period
-- level and `date` overloaded as a playback offset. See the header of
-- features/content-ir/kinds/media-chapters.ts.
--
-- Canonical `__kind` JSON shape:
--   { "__kind":"media_chapters", "chapters": [
--       { "__kind":"media_chapter", "start_hint":"00:00",
--         "title":"…", "summary":"…" } ] }
--
-- Rows applied here:
--   * content_ir.kind_definition — media_chapters + media_chapter.
--     data / emitted_block_schema / emitted_json_schema / emitted_fingerprint
--     are CONVERTER-EMITTED (kindSchemaToStorage / kindSchemaToJsonSchema /
--     fingerprintText over features/content-ir/kinds/media-chapters.ts; emit
--     script output 2026-08-11) — never hand-written. authoring_owner 'ts',
--     platform org, visibility public, is_active FALSE until the dual gate
--     flips it (`pnpm shape:activate media_chapters --apply`).
--   * content_ir.kind_edge — media_chapters.chapters → media_chapter.
--   * content_ir.kind_example — 2 root examples (canonical full + minimal)
--     and 1 canonical child example. `validation_status` is deliberately NOT
--     written: content_ir.kind_example's `_recompute_validation` trigger
--     DERIVES it on every write, so a hand-written verdict is both impossible
--     and a defect.
--   * NO kind_surface row — `__kind` JSON is the only arrival form.
--   * content_ir.kind_component — web/output → component_key 'media_chapters'
--     (the compiled bridge facade into MediaChaptersBlock via block-dispatch).
--   * skill.definition — `kind_media_chapters` (render_block).
--   * skill.render_definition — `kind-media-chapters-simple` / `-full`
--     (the canonical home since public.content_blocks was graveyarded);
--     insert-only, coexist-not-clobber.
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
    'media_chapter',
    'Media Chapter',
    'ts',
    $J$[{"name":"start_hint","required":true,"description":"Start offset as MM:SS or HH:MM:SS. The first chapter is always 00:00; offsets strictly increase and never reach the media's total duration.","type":"string"},{"name":"title","required":true,"description":"Short player-chip chapter title, no trailing punctuation.","type":"string"},{"name":"summary","description":"One sentence describing what this chapter covers.","type":"string"}]$J$::jsonb,
    $J${"__kind":"media_chapter","start_hint":"04:12","title":"Why retrieval beats rereading","summary":"The hosts walk through the testing-effect research and what it means for a study session."}$J$::jsonb,
    $J${"type":"object","properties":{"start_hint":{"type":"string","description":"Start offset as MM:SS or HH:MM:SS. The first chapter is always 00:00; offsets strictly increase and never reach the media's total duration."},"title":{"type":"string","description":"Short player-chip chapter title, no trailing punctuation."},"summary":{"type":"string","description":"One sentence describing what this chapter covers."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"media_chapter"}},"required":["__kind","start_hint","title"],"additionalProperties":false}$J$::jsonb,
    $J${"type":"object","properties":{"start_hint":{"type":"string","description":"Start offset as MM:SS or HH:MM:SS. The first chapter is always 00:00; offsets strictly increase and never reach the media's total duration."},"title":{"type":"string","description":"Short player-chip chapter title, no trailing punctuation."},"summary":{"type":"string","description":"One sentence describing what this chapter covers."}},"required":["start_hint","title"],"additionalProperties":false}$J$::jsonb,
    'gh-wnmdjz60i81',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'media_chapters',
    'Media Chapters',
    'ts',
    $J$[{"name":"chapters","required":true,"description":"The chapters, in playback order — contiguous, gapless, strictly increasing.","type":"array"},{"name":"additionalDetails","type":"inline_object","fields":[],"open":true}]$J$::jsonb,
    $J${"__kind":"media_chapters","chapters":[{"__kind":"media_chapter","start_hint":"00:00","title":"Cold open and introductions","summary":"The hosts set up the episode's question: why does studying feel productive when it isn't?"},{"__kind":"media_chapter","start_hint":"04:12","title":"Why retrieval beats rereading","summary":"The hosts walk through the testing-effect research and what it means for a study session."},{"__kind":"media_chapter","start_hint":"11:48","title":"Spacing without a spreadsheet","summary":"A practical schedule for spaced review that does not require tracking software."},{"__kind":"media_chapter","start_hint":"19:05","title":"Where the research is thin","summary":"Honest limits: what the evidence does not yet settle about long-horizon retention."},{"__kind":"media_chapter","start_hint":"26:30","title":"Listener questions","summary":"Three listener questions on note-taking apps, cramming, and studying with a partner."},{"__kind":"media_chapter","start_hint":"31:40","title":"Takeaways and close","summary":"The hosts recap the three habits worth changing this week."}]}$J$::jsonb,
    $J${"type":"object","properties":{"chapters":{"type":"array","items":{"$ref":"#/$defs/media_chapter"},"description":"The chapters, in playback order — contiguous, gapless, strictly increasing."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"media_chapters"}},"required":["__kind","chapters"],"additionalProperties":false,"$defs":{"media_chapter":{"type":"object","properties":{"start_hint":{"type":"string","description":"Start offset as MM:SS or HH:MM:SS. The first chapter is always 00:00; offsets strictly increase and never reach the media's total duration."},"title":{"type":"string","description":"Short player-chip chapter title, no trailing punctuation."},"summary":{"type":"string","description":"One sentence describing what this chapter covers."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"media_chapter"}},"required":["__kind","start_hint","title"],"additionalProperties":false}}}$J$::jsonb,
    $J${"type":"object","properties":{"chapters":{"type":"array","items":{"$ref":"#/$defs/media_chapter"},"description":"The chapters, in playback order — contiguous, gapless, strictly increasing."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true}},"required":["chapters"],"additionalProperties":false,"$defs":{"media_chapter":{"type":"object","properties":{"start_hint":{"type":"string","description":"Start offset as MM:SS or HH:MM:SS. The first chapter is always 00:00; offsets strictly increase and never reach the media's total duration."},"title":{"type":"string","description":"Short player-chip chapter title, no trailing punctuation."},"summary":{"type":"string","description":"One sentence describing what this chapter covers."}},"required":["start_hint","title"],"additionalProperties":false}}}$J$::jsonb,
    'u0-1jlaxtwqhpiye',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  )
-- Arbiter is `kind_definition_global_slug_unique` — a PARTIAL unique index on
-- (kind) WHERE deleted_at IS NULL, so the predicate must be restated here.
-- (The older per-org key this feature's earlier migrations used is gone.)
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

-- ── 2. kind_edge: chapters → media_chapter ──────────────────────────────────

INSERT INTO content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
SELECT p.id, 'chapters', c.id, 0, p.organization_id
FROM content_ir.kind_definition p
JOIN content_ir.kind_definition c
  ON c.kind = 'media_chapter'
 AND c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND c.deleted_at IS NULL
WHERE p.kind = 'media_chapters'
  AND p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND p.deleted_at IS NULL
ON CONFLICT (parent_definition_id, field_name, child_definition_id) DO UPDATE SET
  position = EXCLUDED.position,
  updated_at = now();

-- ── 3. kind_example — validation_status is TRIGGER-DERIVED, never written ───

INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description,
   source, is_canonical, organization_id)
SELECT d.id, d.version, v.data::jsonb, v.label, v.description,
       'authored', v.is_canonical, d.organization_id
FROM (VALUES
  (
    'media_chapters', 'Study-habits episode chapters (canonical)', true,
    'Six chapters across a ~34 minute episode: first offset 00:00, strictly increasing, every chapter carrying a one-sentence summary.',
    $J${"__kind":"media_chapters","chapters":[{"__kind":"media_chapter","start_hint":"00:00","title":"Cold open and introductions","summary":"The hosts set up the episode's question: why does studying feel productive when it isn't?"},{"__kind":"media_chapter","start_hint":"04:12","title":"Why retrieval beats rereading","summary":"The hosts walk through the testing-effect research and what it means for a study session."},{"__kind":"media_chapter","start_hint":"11:48","title":"Spacing without a spreadsheet","summary":"A practical schedule for spaced review that does not require tracking software."},{"__kind":"media_chapter","start_hint":"19:05","title":"Where the research is thin","summary":"Honest limits: what the evidence does not yet settle about long-horizon retention."},{"__kind":"media_chapter","start_hint":"26:30","title":"Listener questions","summary":"Three listener questions on note-taking apps, cramming, and studying with a partner."},{"__kind":"media_chapter","start_hint":"31:40","title":"Takeaways and close","summary":"The hosts recap the three habits worth changing this week."}]}$J$
  ),
  (
    'media_chapters', 'Short clip, three chapters (minimal)', false,
    'Minimal legal form: three chapters, no summaries — the summary field is optional and the rows still render.',
    $J${"__kind":"media_chapters","chapters":[{"__kind":"media_chapter","start_hint":"00:00","title":"Setup"},{"__kind":"media_chapter","start_hint":"01:20","title":"The demo"},{"__kind":"media_chapter","start_hint":"03:05","title":"What to try next"}]}$J$
  ),
  (
    'media_chapter', 'Mid-episode chapter (canonical)', true,
    'One chapter with an offset, a player-chip title, and a one-sentence summary.',
    $J${"__kind":"media_chapter","start_hint":"04:12","title":"Why retrieval beats rereading","summary":"The hosts walk through the testing-effect research and what it means for a study session."}$J$
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
SELECT d.id, 'web', 'output', 'media_chapters', 'bundled',
       $J${"legacyBlockType": "media_chapters"}$J$::jsonb, true, true, 100, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'media_chapters'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.component_key = 'media_chapters'
      AND c.deleted_at IS NULL
  );

-- ── 5. Skill: kind_media_chapters ───────────────────────────────────────────

INSERT INTO skill.definition
  (skill_id, label, description, skill_type, body, icon_name,
   is_active, is_system, visibility, category_id, sort_order,
   semver, platform_targets, organization_id, metadata)
SELECT
  'kind_media_chapters',
  'Media Chapters (structured)',
  'How and when to emit a media_chapters render block as structured "__kind" JSON: an ordered, timestamped chapter index for a podcast, video, or any other timed media — the shape a player chapter UI and an RSS chapter feed consume.',
  'render_block',
  $SB$# Media Chapters (structured JSON)

When you segment a podcast, video, or any other timed recording into chapters,
emit a single JSON object marked with `"__kind": "media_chapters"`. Each
chapter renders as a row with its timestamp, title, and summary — and on a
surface that owns a player, the row becomes a button that seeks to that
offset. Reach for it whenever you produce a chapter list, a table of
contents for a recording, or timestamps a listener would jump to.

## How to emit it

Emit one JSON object. It may sit inside a ```json fence or stand bare in the
message — the pipeline recognizes `"__kind": "media_chapters"` either way:

```json
{
  "__kind": "media_chapters",
  "chapters": [
    {
      "__kind": "media_chapter",
      "start_hint": "00:00",
      "title": "Cold open and introductions",
      "summary": "The hosts set up the episode's central question."
    }
  ]
}
```

## The root shape

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Always the literal `"media_chapters"`. |
| `chapters` | array | yes | One or more `media_chapter` objects, in playback order. |

## The media_chapter shape

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Always the literal `"media_chapter"`. |
| `start_hint` | string | yes | Start offset, `MM:SS` or `HH:MM:SS`. |
| `title` | string | yes | Short player-chip title, no trailing punctuation. |
| `summary` | string | no | Exactly one sentence describing the chapter. |

## Rules

1. **The first `start_hint` is always `00:00`.** No exceptions.
2. **Offsets strictly increase** and never reach the media's total duration —
   the last chapter starts before the end, never at it.
3. **Chapters are contiguous and gapless** — together they partition the whole
   recording. No overlaps, no holes.
4. Use `MM:SS` under an hour and `HH:MM:SS` at or over one. Never seconds,
   never a bare number — the player parses this string.
5. Scale the count to the material: a 90-second clip is not ten chapters, and
   a two-hour episode is not two. Three to twelve is the normal range.
6. When you are given a total duration, distribute offsets **proportionally**
   to each chapter's share of the transcript, not by dividing the runtime
   evenly. A long opening segment pushes the next start later.
7. Never invent content — titles and summaries describe only what the
   recording actually covers.
8. Valid JSON only — double-quoted keys and strings, no trailing commas, no
   comments, and nothing outside the object.

## Editing an existing set

When asked to revise, return ONE complete `media_chapters` object with the
FULL updated list — never a fragment. Preserve untouched chapters verbatim,
including their offsets.
$SB$,
  'Bookmark',
  true, true, 'public',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',  -- platform.categories: dimension 'skill', "Render Blocks"
  63, '1.0.0', '["web"]'::jsonb,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"kind": "media_chapters"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'kind_media_chapters'
    AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND project_id IS NULL AND task_id IS NULL
    AND deleted_at IS NULL
);

-- ── 6. Render/content blocks — paired to the skill. Insert-only. ────────────

INSERT INTO skill.render_definition
  (block_id, label, description, icon_name, template, block_type,
   category_id, sort_order, is_active, visibility, skill_id,
   organization_id, metadata)
SELECT v.block_id, v.label, v.description, v.icon_name, v.template, 'render_kind',
       '2c324058-95e9-4b7e-a991-884f4443eb6e',
       v.sort_order, true, 'public', s.id,
       '39c38960-d30c-4840-b0c1-c9960de95582',
       '{"skill_id": "kind_media_chapters"}'::jsonb
FROM (VALUES
  (
    'kind-media-chapters-simple', 'Media Chapters',
    'Condensed instructions for emitting a media_chapters render block.',
    'Bookmark', 10,
    $CB$When you segment a recording into chapters, emit them as a structured chapter index — each row renders with its timestamp and, on a surface with a player, seeks to that offset:

```json
{ "__kind": "media_chapters",
  "chapters": [
    { "__kind": "media_chapter", "start_hint": "00:00", "title": "Cold open", "summary": "One sentence on what this chapter covers." }
  ] }
```

- Root `__kind` is `media_chapters`; `chapters` is required. Every chapter carries `"__kind": "media_chapter"`, a `start_hint`, and a `title`.
- The first `start_hint` is always `00:00`; offsets strictly increase and never reach the total duration.
- Format offsets `MM:SS` (under an hour) or `HH:MM:SS` — never a bare number of seconds.
- Chapters are contiguous and gapless; three to twelve is the normal range.
- Valid JSON only — no trailing commas.$CB$
  ),
  (
    'kind-media-chapters-full', 'Media Chapters (Proportional Timing)',
    'Chapter index with offsets distributed proportionally across a known runtime.',
    'ListOrdered', 20,
    $CB$Segment the recording into chapters that follow its real topic shifts, and place each offset by that chapter's actual share of the transcript — not by dividing the runtime evenly:

```json
{ "__kind": "media_chapters",
  "chapters": [
    { "__kind": "media_chapter", "start_hint": "00:00", "title": "Cold open and introductions", "summary": "The hosts set up the episode's central question." },
    { "__kind": "media_chapter", "start_hint": "04:12", "title": "Why retrieval beats rereading", "summary": "A walk through the testing-effect research." },
    { "__kind": "media_chapter", "start_hint": "11:48", "title": "Spacing without a spreadsheet", "summary": "A practical review schedule that needs no software." }
  ] }
```

- A long opening segment pushes the next start later than an even split would; the final chapter starts before the end, never at it.
- Titles are short and player-chip length with no trailing punctuation; each `summary` is exactly one sentence.
- Never invent content — describe only what the recording actually covers.$CB$
  )
) AS v(block_id, label, description, icon_name, sort_order, template)
JOIN skill.definition s
  ON s.skill_id = 'kind_media_chapters'
 AND s.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND s.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM skill.render_definition b
  WHERE b.block_id = v.block_id AND b.deleted_at IS NULL
);

COMMIT;
