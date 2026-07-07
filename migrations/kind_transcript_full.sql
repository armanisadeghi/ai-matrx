-- kind_transcript_full.sql
-- The TRANSCRIPT chat render block (fence language `transcript`) as a platform
-- kind: kind_definition rows (transcript + transcript_segment), kind_edge,
-- validated kind_example rows, the fence_lang surface, the web output
-- component binding, the kind_transcript render-block skill, and two paired
-- content blocks.
--
-- DISAMBIGUATION: this is the chat render block
-- (components/mardown-display/blocks/transcripts/), NOT the
-- features/transcripts audio-transcription domain.
--
-- All schemas are CONVERTER-EMITTED (features/content-ir/convert/
-- kind-to-json-schema.ts strict mode; data[]/edges via registry/
-- kind-storage-transform.ts kindSchemaToStorage) from the compiled
-- KindSchemas in features/content-ir/kinds/transcript.ts — never hand-written.
-- Examples were REALLY validated (ajv Draft-2020-12 via the dual gate's
-- validateStructuralLeg + the full runKindDualGate render leg) before
-- validation_status='passed' was recorded; the same fixtures are re-proven by
-- features/content-ir/__tests__/kind-transcript.test.ts.
--
-- is_active=false on both kind rows: render-trust flips ON in the central
-- integration pass (the fence-finalize host does not exist yet — XML only).
-- Idempotent + schema-qualified; business-key guarded so re-apply is safe.
--
-- Live-verified constants (2026-07-06):
--   system org "Matrx System"          : 39c38960-d30c-4840-b0c1-c9960de95582
--   skill category "Render Blocks"      : 49c845cb-9314-485c-88ed-a7ace4f286ca (dimension='skill')
--   content-block category "Agent Skills": 2c324058-95e9-4b7e-a991-884f4443eb6e (dimension='shortcut', placement_type='content-block')
--   skill.definition live columns: platform_targets jsonb / semver text /
--   is_system / visibility — NO is_public, NO user_id (older per-kind skill
--   migration files predate the reorg; this file matches the live table).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. kind_definition — child first, then root.
-- ---------------------------------------------------------------------------
insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, emitted_block_schema, is_active, visibility, organization_id, metadata)
select 'transcript_segment', 'Transcript Segment', 'ts',
  $mtx$[{"name":"text","required":true,"type":"string"},{"name":"speaker","type":"string"},{"name":"timecode","type":"string"},{"name":"seconds","type":"number"},{"name":"id","type":"string"},{"name":"isHighlighted","type":"boolean"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"text":{"type":"string"},"speaker":{"type":"string"},"timecode":{"type":"string"},"seconds":{"type":"number"},"id":{"type":"string"},"isHighlighted":{"type":"boolean"}},"required":["text"],"additionalProperties":false}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"text":{"type":"string"},"speaker":{"type":"string"},"timecode":{"type":"string"},"seconds":{"type":"number"},"id":{"type":"string"},"isHighlighted":{"type":"boolean"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"transcript_segment"}},"required":["__kind","text"],"additionalProperties":false}$mtx$::jsonb,
  false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{}'::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='transcript_segment' and deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, emitted_block_schema, is_active, visibility, organization_id, metadata)
select 'transcript', 'Transcript', 'ts',
  $mtx$[{"name":"title","nullable":true,"type":"string"},{"name":"subtitle","nullable":true,"type":"string"},{"name":"segments","required":true,"type":"array"},{"name":"additionalDetails","type":"inline_object","fields":[]}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":["string","null"]},"subtitle":{"type":["string","null"]},"segments":{"type":"array","items":{"$ref":"#/$defs/transcript_segment"}},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":false}},"required":["segments"],"additionalProperties":false,"$defs":{"transcript_segment":{"type":"object","properties":{"text":{"type":"string"},"speaker":{"type":"string"},"timecode":{"type":"string"},"seconds":{"type":"number"},"id":{"type":"string"},"isHighlighted":{"type":"boolean"}},"required":["text"],"additionalProperties":false}}}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":["string","null"]},"subtitle":{"type":["string","null"]},"segments":{"type":"array","items":{"$ref":"#/$defs/transcript_segment"}},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":false},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"transcript"}},"required":["__kind","segments"],"additionalProperties":false,"$defs":{"transcript_segment":{"type":"object","properties":{"text":{"type":"string"},"speaker":{"type":"string"},"timecode":{"type":"string"},"seconds":{"type":"number"},"id":{"type":"string"},"isHighlighted":{"type":"boolean"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"transcript_segment"}},"required":["__kind","text"],"additionalProperties":false}}}$mtx$::jsonb,
  false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{}'::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='transcript' and deleted_at is null);

-- ---------------------------------------------------------------------------
-- 2. kind_edge — transcript.segments -> transcript_segment (position 0).
-- ---------------------------------------------------------------------------
insert into content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
select p.id, 'segments', c.id, 0, p.organization_id
from content_ir.kind_definition p
join content_ir.kind_definition c
  on c.kind='transcript_segment' and c.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and c.deleted_at is null
where p.kind='transcript' and p.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and p.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_edge e
    where e.parent_definition_id=p.id and e.child_definition_id=c.id
      and e.field_name='segments' and e.deleted_at is null);

-- ---------------------------------------------------------------------------
-- 3. kind_example — canonical (speakers + annotation) + simple (narration).
--    Both REALLY validated (see header) before 'passed' was recorded.
-- ---------------------------------------------------------------------------
insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version,
  $mtx${"__kind":"transcript","title":"Quarterly Planning Meeting","subtitle":"Q3 Kickoff","segments":[{"__kind":"transcript_segment","id":"segment-0","timecode":"00:05","seconds":5,"speaker":"Speaker A","text":"Hello and welcome to the meeting."},{"__kind":"transcript_segment","id":"segment-1","timecode":"00:12","seconds":12,"speaker":"Speaker B","text":"Thanks for having me. Glad to be here."},{"__kind":"transcript_segment","id":"segment-2","timecode":"00:20","seconds":20,"text":"[Sound of paper shuffling]"},{"__kind":"transcript_segment","id":"segment-3","timecode":"00:26","seconds":26,"speaker":"Speaker A","text":"Let's start with the quarterly results.","isHighlighted":true}]}$mtx$::jsonb,
  'Meeting with speakers (canonical)', 'authored', true, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='transcript' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_example e where e.kind_definition_id=kd.id and e.is_canonical and e.deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version,
  $mtx${"__kind":"transcript","segments":[{"__kind":"transcript_segment","timecode":"00:00","seconds":0,"text":"Text for the first thirty seconds of the recording."},{"__kind":"transcript_segment","timecode":"00:30","seconds":30,"text":"Text for the next thirty seconds of the recording."}]}$mtx$::jsonb,
  'Simple timecoded narration', 'authored', false, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='transcript' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_example e where e.kind_definition_id=kd.id and e.label='Simple timecoded narration' and e.deleted_at is null);

-- ---------------------------------------------------------------------------
-- 4. kind_surface — the ```transcript fence converges to the transcript kind
--    via the named strategy 'transcript_legacy_text'
--    (features/content-ir/surfaces/transcript-legacy-text.ts — wraps the REAL
--    parseTranscript, never a second grammar). Host fence-finalize hook lands
--    in the central integration pass.
-- ---------------------------------------------------------------------------
insert into content_ir.kind_surface
  (kind_definition_id, surface_type, token, parser_strategy, parser_config, streaming, organization_id)
select kd.id, 'fence_lang', 'transcript', 'transcript_legacy_text', '{}'::jsonb, true, kd.organization_id
from content_ir.kind_definition kd
where kd.kind='transcript' and kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_surface s where s.surface_type='fence_lang' and s.token='transcript' and s.deleted_at is null);

-- ---------------------------------------------------------------------------
-- 5. kind_component — web/output -> the legacyBlockType contract key
--    'transcript' (TranscriptBlock via BlockComponentRegistry).
-- ---------------------------------------------------------------------------
insert into content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source, config, organization_id)
select kd.id, 'web', 'output', 'transcript', 'bundled', '{"legacyBlockType":"transcript"}'::jsonb, kd.organization_id
from content_ir.kind_definition kd
where kd.kind='transcript' and kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_component c where c.kind_definition_id=kd.id and c.platform='web' and c.role='output' and c.deleted_at is null);

-- ---------------------------------------------------------------------------
-- 6. The skill row — kind_transcript (JSON syntax; fills the transcript gap
--    flagged in the render-block skill campaign). Composite-unique guarded.
-- ---------------------------------------------------------------------------
INSERT INTO skill.definition
  (skill_id, label, description, skill_type, body, icon_name,
   platform_targets, semver, category_id, is_system, is_active,
   visibility, organization_id, project_id, task_id, sort_order, metadata)
SELECT
  'kind_transcript',
  'Transcript',
  'How and when to emit a transcript render block: the __kind JSON shape, transcript_segment children, the non-empty-text rule that prevents dropped segments, speakerless annotation segments, timecode/seconds consistency, sizing, and editing etiquette.',
  'render_block',
  $BODY$# Transcript

You can render a live, interactive transcript by emitting a single JSON object
carrying `"__kind": "transcript"`. It renders as a collapsible transcript card
with per-segment timecodes, speaker labels, copy actions, and click-to-seek
times, and it persists as a versioned artifact the user can edit, import into
the transcription system, or hand to another agent. Prefer it over prose
whenever the content IS a transcript: meeting notes with speakers, interview
dialogue, timecoded narration of a recording, or a cleaned-up dictation.

One kind covers BOTH classic variants:
- **Simple transcript** — timecoded narration, no speakers (omit `speaker`).
- **Transcript with speakers** — dialogue with speaker labels, plus bracketed
  sound/action annotations as speakerless segments.

## How to emit a transcript

Emit ONE JSON object with `"__kind": "transcript"`. The system recognizes it
live, fenced or unfenced; a ```json fence is fine for clarity:

```json
{
  "__kind": "transcript",
  "title": "Quarterly Planning Meeting",
  "subtitle": "Q3 Kickoff",
  "segments": [
    {
      "__kind": "transcript_segment",
      "timecode": "00:05",
      "seconds": 5,
      "speaker": "Speaker A",
      "text": "Hello and welcome to the meeting."
    },
    {
      "__kind": "transcript_segment",
      "timecode": "00:20",
      "seconds": 20,
      "text": "[Sound of paper shuffling]"
    }
  ]
}
```

One transcript per JSON object. Never wrap it in `<artifact>` tags — the JSON
object IS the artifact.

## When to use it

| User intent | Do this |
|---|---|
| "Transcribe this" / clean up a raw transcript | A transcript with timecodes (and speakers if identifiable) |
| Meeting or interview dialogue | A transcript with `speaker` on every spoken segment |
| Timecoded narration of one voice / a recording summary | A simple transcript — omit `speaker` entirely |
| Notes, summaries, or analysis ABOUT a recording | Plain prose or another block — a transcript is verbatim content |

## The `__kind` + field structure

**transcript** (the root object):

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Must be exactly `"transcript"`. |
| `segments` | array | yes | One or more `transcript_segment` objects, in chronological order. |
| `title` | string or null | no | Main heading of the transcript card. Skip generic labels like "Audio Transcription" — the card supplies its own default. |
| `subtitle` | string or null | no | Secondary header under the title. |

**transcript_segment** (each item in `segments`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Must be exactly `"transcript_segment"`. |
| `text` | string | yes | The spoken text — or a bracketed annotation like `"[Applause]"`. |
| `speaker` | string | no | Speaker label (`"Speaker A"`, `"Sarah"`). Omit for narration and annotations. |
| `timecode` | string | no | Display time: `"MM:SS"`, `"HH:MM:SS"`, or a range `"MM:SS - MM:SS"`. |
| `seconds` | number | no | Start offset in seconds — drives click-to-seek. Keep consistent with `timecode`. |
| `id` | string | no | Stable segment id. Auto-assigned (`"segment-0"`, …) when omitted. |
| `isHighlighted` | boolean | no | Marks a segment as highlighted. |

## Syntax rules that PREVENT render failures

These map to how the transcript renders — break them and segments silently
drop or the whole block falls back to raw text:

1. **Every segment needs non-empty `text`.** A segment with missing, empty,
   or whitespace-only `text` is DROPPED. A transcript whose segments all
   drop does not render as a transcript at all.
2. **`segments` must be a non-empty array.** An empty array fails the whole
   block.
3. **Sound and action cues are speakerless segments** — put the cue in
   brackets as the `text` (e.g. `"[Sound of paper shuffling]"`) and omit
   `speaker`. Do not invent a speaker like "SFX".
4. **Keep `timecode` and `seconds` consistent** — `seconds` is the same
   moment as `timecode`, expressed as a number (e.g. `"01:30"` -> `90`).
   Omit both if the source has no timing; never guess wildly.
5. **Chronological order** — emit segments in time order; the viewer renders
   them as given.
6. **Keep every `__kind` marker** — the root carries
   `"__kind":"transcript"` and EACH segment carries
   `"__kind":"transcript_segment"`.
7. **Valid JSON only** — double-quoted keys/strings, no trailing commas, no
   comments. Escape any quote inside a string.

## Sizing / limits

- Segment granularity: one segment per speaker turn (dialogue) or per
  20-60 seconds (narration). Very long monologues split at natural pauses.
- Dozens of segments render fine; past ~200, offer to split by section.
- Keep `speaker` labels short and CONSISTENT — "Speaker A" and "speaker a"
  render as two different people.

## Editing etiquette

When the user asks you to change a transcript, return ONE complete updated
`transcript` object — the full block, not a diff:
- Keep `"__kind":"transcript"` on the root and `"__kind":"transcript_segment"`
  on every segment.
- Preserve the `id`, `timecode`, and `seconds` of segments the user did not
  ask you to change, so timing and identity stay stable.
- After edits, re-check chronological order and speaker-label consistency.

## One correct minimal example

```json
{
  "__kind": "transcript",
  "segments": [
    {
      "__kind": "transcript_segment",
      "timecode": "00:00",
      "seconds": 0,
      "text": "Text for the first thirty seconds of the recording."
    },
    {
      "__kind": "transcript_segment",
      "timecode": "00:30",
      "seconds": 30,
      "text": "Text for the next thirty seconds of the recording."
    }
  ]
}
```
$BODY$,
  'AudioLines',
  '["web"]'::jsonb,
  '1.0.0',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',
  true,
  true,
  'public',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  NULL,
  NULL,
  30,
  '{"kind":"transcript","syntax":"json"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'kind_transcript'
    AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582' AND deleted_at IS NULL
);

-- ---------------------------------------------------------------------------
-- 7. Content blocks — one simple, one complex (R9), paired to the skill via
--    metadata.skill_id. NEVER clobber: insert-only (ON CONFLICT DO NOTHING);
--    the live legacy palette rows (skill.render_definition 'transcript' /
--    'simple-transcript') are a different system and stay untouched.
-- ---------------------------------------------------------------------------
INSERT INTO public.content_blocks
  (block_id, label, description, icon_name, template, sort_order, is_active,
   category_id, organization_id, version, metadata)
VALUES
  (
    'kind-transcript-simple',
    'Simple Transcript',
    'A timecoded transcript without speaker attribution',
    'FileText',
    $CB$When the user wants a timecoded transcript of a recording without speaker attribution, emit a single JSON object with "__kind":"transcript" (segments only, no speaker fields):

```json
{ "__kind": "transcript", "segments": [
  { "__kind": "transcript_segment", "timecode": "00:00", "seconds": 0, "text": "Text for the first thirty seconds of the recording." },
  { "__kind": "transcript_segment", "timecode": "00:30", "seconds": 30, "text": "Text for the next thirty seconds of the recording." }
] }
```

Rules: `segments` must be a non-empty array and every segment needs non-empty `text` (empty segments are dropped). Keep `timecode` ("MM:SS" or "HH:MM:SS") and `seconds` (same moment as a number) consistent, and emit segments in chronological order. Keep both `__kind` markers. Valid JSON, no trailing commas.$CB$,
    30,
    true,
    '2c324058-95e9-4b7e-a991-884f4443eb6e',
    '39c38960-d30c-4840-b0c1-c9960de95582',
    1,
    '{"skill_id":"kind_transcript"}'::jsonb
  ),
  (
    'kind-transcript-full',
    'Transcript With Speakers',
    'A speaker-attributed transcript with timecodes and sound annotations',
    'AudioLines',
    $CB$When the user wants a transcript of a meeting, interview, or any multi-speaker recording, emit a single JSON object with "__kind":"transcript" carrying speaker labels:

```json
{ "__kind": "transcript", "title": "Quarterly Planning Meeting", "segments": [
  { "__kind": "transcript_segment", "timecode": "00:05", "seconds": 5, "speaker": "Speaker A", "text": "Hello and welcome to the meeting." },
  { "__kind": "transcript_segment", "timecode": "00:20", "seconds": 20, "text": "[Sound of paper shuffling]" },
  { "__kind": "transcript_segment", "timecode": "00:26", "seconds": 26, "speaker": "Speaker B", "text": "Thanks. Let's start with the quarterly results." }
] }
```

Rules: every segment needs non-empty `text`; sound/action cues are bracketed `text` on a SPEAKERLESS segment (never a fake speaker). Keep speaker labels short and consistent ("Speaker A" vs "speaker a" renders as two people). `timecode` ("MM:SS"/"HH:MM:SS") and `seconds` describe the same moment; segments stay in chronological order. Keep every `__kind` marker. Valid JSON, no trailing commas.$CB$,
    31,
    true,
    '2c324058-95e9-4b7e-a991-884f4443eb6e',
    '39c38960-d30c-4840-b0c1-c9960de95582',
    1,
    '{"skill_id":"kind_transcript"}'::jsonb
  )
ON CONFLICT (block_id) DO NOTHING;

COMMIT;
