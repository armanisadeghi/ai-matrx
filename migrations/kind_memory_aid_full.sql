-- ============================================================================
-- content-ir kinds `memory_aid` (+ children `mnemonic`, `analogy`,
-- `memory_palace`, `locus`) and `memory_hint` — FULL package.
--
-- The Education Memory Tools shapes (VISION §11). Both shipped 2026-07-13
-- UNREGISTERED: the education feature hand-rolled their renderers
-- (`MemoryAidView`, inline JSX in `MemoryAidButton`) and the LiveRunWindow
-- streamed them as raw JSON — the exact defect the registry exists to kill
-- (logged in docs/handoffs/canonical-component-sweep.md). This migration is
-- the registration; the compiled bridge is
-- features/content-ir/kinds/memory-aid.ts and the canonical components are
-- MemoryAidBlock / MemoryHintBlock.
--
-- TWO ROOTS ON PURPOSE. `memory_aid` is the full persisted artifact
-- (`education.study_media.ir_envelope`, media_kind='memory_aid');
-- `memory_hint` is the one-glance per-flashcard aid (persisted as an
-- `fc_detail` layer). Different agents, different cost profiles, different
-- consumers.
--
-- Canonical `__kind` JSON shapes:
--   { "__kind":"memory_aid", "title":"…", "strategy_note":"…",
--     "mnemonics":[{ "__kind":"mnemonic", "technique":"acronym",
--                    "target":"…", "device":"…", "explanation":"…" }],
--     "analogies":[{ "__kind":"analogy", "concept":"…", "analogy":"…",
--                    "mapping":"…" }],
--     "memory_palace": { "__kind":"memory_palace", "applicable":true,
--        "theme":"…", "loci":[{ "__kind":"locus", "place":"…",
--                               "item":"…", "image":"…" }] } }
--   { "__kind":"memory_hint", "technique":"association", "aid":"…",
--     "explanation":"…" }
--
-- Rows applied here (mirrors kind_media_chapters_full.sql):
--   * content_ir.kind_definition — all six kinds.
--     data / emitted_block_schema / emitted_json_schema / emitted_fingerprint
--     are CONVERTER-EMITTED (kindSchemaToStorage / kindSchemaToJsonSchema /
--     fingerprintText over features/content-ir/kinds/memory-aid.ts; emit
--     script output 2026-08-17) — never hand-written. authoring_owner 'ts',
--     platform org, visibility public, is_active FALSE until the dual gate
--     flips the two ROOTS (children stay inactive — nested_only_child).
--   * content_ir.kind_edge — memory_aid.mnemonics → mnemonic,
--     memory_aid.analogies → analogy, memory_aid.memory_palace →
--     memory_palace, memory_palace.loci → locus.
--   * content_ir.kind_example — canonical + minimal roots, canonical
--     children. `validation_status` is deliberately NOT written: the
--     `_recompute_validation` trigger DERIVES it on every write.
--   * NO kind_surface rows — `__kind` JSON is the only arrival form.
--   * content_ir.kind_component — web/output → 'memory_aid' /
--     'memory_hint' (the compiled bridge facades via block-dispatch).
--   * skill.definition — `kind_memory_aid` / `kind_memory_hint`
--     (render_block) + paired skill.render_definition rows (insert-only,
--     coexist-not-clobber).
--
-- Idempotent on business keys; re-apply is safe. is_active on existing
-- kind_definition rows is deliberately NOT touched on re-apply.
-- ============================================================================

BEGIN;

-- ── 1. kind_definition: children first (roots' edges resolve to them) ───────

INSERT INTO content_ir.kind_definition
  (kind, label, authoring_owner, data, sample_data,
   emitted_block_schema, emitted_json_schema, emitted_fingerprint,
   is_active, organization_id, visibility)
VALUES
  (
    'mnemonic',
    'Mnemonic',
    'ts',
    $J$[{"name":"technique","required":true,"description":"Which mnemonic device family this is. Pick the one that genuinely fits the material — never force an acronym onto prose.","type":"enum","values":["acronym","acrostic","rhyme","sentence","keyword","chunking"]},{"name":"target","required":true,"description":"The exact list, term, or sequence this device helps memorize, quoted from the source material.","type":"string"},{"name":"device","required":true,"description":"The mnemonic itself — the acronym, sentence, rhyme, keyword image, or chunking scheme.","type":"string"},{"name":"explanation","description":"How each part of the device maps back to the material, so the learner can decode it later.","type":"string"}]$J$::jsonb,
    $J${"__kind":"mnemonic","technique":"acronym","target":"The Great Lakes: Huron, Ontario, Michigan, Erie, Superior","device":"HOMES","explanation":"H-O-M-E-S — one letter per lake: Huron, Ontario, Michigan, Erie, Superior."}$J$::jsonb,
    $J${"type":"object","properties":{"technique":{"type":"string","enum":["acronym","acrostic","rhyme","sentence","keyword","chunking"],"description":"Which mnemonic device family this is. Pick the one that genuinely fits the material — never force an acronym onto prose."},"target":{"type":"string","description":"The exact list, term, or sequence this device helps memorize, quoted from the source material."},"device":{"type":"string","description":"The mnemonic itself — the acronym, sentence, rhyme, keyword image, or chunking scheme."},"explanation":{"type":"string","description":"How each part of the device maps back to the material, so the learner can decode it later."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"mnemonic"}},"required":["__kind","technique","target","device"],"additionalProperties":false}$J$::jsonb,
    $J${"type":"object","properties":{"technique":{"type":"string","enum":["acronym","acrostic","rhyme","sentence","keyword","chunking"],"description":"Which mnemonic device family this is. Pick the one that genuinely fits the material — never force an acronym onto prose."},"target":{"type":"string","description":"The exact list, term, or sequence this device helps memorize, quoted from the source material."},"device":{"type":"string","description":"The mnemonic itself — the acronym, sentence, rhyme, keyword image, or chunking scheme."},"explanation":{"type":"string","description":"How each part of the device maps back to the material, so the learner can decode it later."}},"required":["technique","target","device"],"additionalProperties":false}$J$::jsonb,
    'nw-14a7yfg3lguq6',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'analogy',
    'Analogy',
    'ts',
    $J$[{"name":"concept","required":true,"description":"The abstract concept being bridged.","type":"string"},{"name":"analogy","required":true,"description":"The relatable everyday thing the concept is like — one sentence.","type":"string"},{"name":"mapping","description":"The correspondence spelled out: which part of the analogy stands for which part of the concept.","type":"string"}]$J$::jsonb,
    $J${"__kind":"analogy","concept":"Enzyme active sites","analogy":"a lock and its key","mapping":"The lock is the active site, the key is the substrate — only the matching shape fits and turns."}$J$::jsonb,
    $J${"type":"object","properties":{"concept":{"type":"string","description":"The abstract concept being bridged."},"analogy":{"type":"string","description":"The relatable everyday thing the concept is like — one sentence."},"mapping":{"type":"string","description":"The correspondence spelled out: which part of the analogy stands for which part of the concept."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"analogy"}},"required":["__kind","concept","analogy"],"additionalProperties":false}$J$::jsonb,
    $J${"type":"object","properties":{"concept":{"type":"string","description":"The abstract concept being bridged."},"analogy":{"type":"string","description":"The relatable everyday thing the concept is like — one sentence."},"mapping":{"type":"string","description":"The correspondence spelled out: which part of the analogy stands for which part of the concept."}},"required":["concept","analogy"],"additionalProperties":false}$J$::jsonb,
    'eu-k91jg4f70ebi',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'locus',
    'Palace Locus',
    'ts',
    $J$[{"name":"place","required":true,"description":"One stop on the journey — a concrete location in the palace theme.","type":"string"},{"name":"item","required":true,"description":"The material placed at this stop.","type":"string"},{"name":"image","description":"The vivid, exaggerated mental image binding the item to the place.","type":"string"}]$J$::jsonb,
    $J${"__kind":"locus","place":"The front door","item":"Mercury","image":"A giant thermometer wedged in the doorframe, dripping silver."}$J$::jsonb,
    $J${"type":"object","properties":{"place":{"type":"string","description":"One stop on the journey — a concrete location in the palace theme."},"item":{"type":"string","description":"The material placed at this stop."},"image":{"type":"string","description":"The vivid, exaggerated mental image binding the item to the place."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"locus"}},"required":["__kind","place","item"],"additionalProperties":false}$J$::jsonb,
    $J${"type":"object","properties":{"place":{"type":"string","description":"One stop on the journey — a concrete location in the palace theme."},"item":{"type":"string","description":"The material placed at this stop."},"image":{"type":"string","description":"The vivid, exaggerated mental image binding the item to the place."}},"required":["place","item"],"additionalProperties":false}$J$::jsonb,
    'dn-6717qh6p8mmj',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'memory_palace',
    'Memory Palace',
    'ts',
    $J$[{"name":"applicable","required":true,"description":"False when the material does not warrant a palace (small or unordered sets) — then theme is empty and loci is []. Never force a palace.","type":"boolean"},{"name":"theme","description":"The journey's setting (a house, a walk to school) — empty when not applicable.","type":"string"},{"name":"loci","required":true,"description":"The ordered stops of the journey — [] when not applicable.","type":"array"}]$J$::jsonb,
    $J${"__kind":"memory_palace","applicable":true,"theme":"Walking through your house, front door to back garden","loci":[{"__kind":"locus","place":"The front door","item":"Mercury","image":"A giant thermometer wedged in the doorframe, dripping silver."},{"__kind":"locus","place":"The hallway mirror","item":"Venus","image":"The mirror fogged over with thick yellow clouds."}]}$J$::jsonb,
    $J${"type":"object","properties":{"applicable":{"type":"boolean","description":"False when the material does not warrant a palace (small or unordered sets) — then theme is empty and loci is []. Never force a palace."},"theme":{"type":"string","description":"The journey's setting (a house, a walk to school) — empty when not applicable."},"loci":{"type":"array","items":{"$ref":"#/$defs/locus"},"description":"The ordered stops of the journey — [] when not applicable."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"memory_palace"}},"required":["__kind","applicable","loci"],"additionalProperties":false,"$defs":{"locus":{"type":"object","properties":{"place":{"type":"string","description":"One stop on the journey — a concrete location in the palace theme."},"item":{"type":"string","description":"The material placed at this stop."},"image":{"type":"string","description":"The vivid, exaggerated mental image binding the item to the place."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"locus"}},"required":["__kind","place","item"],"additionalProperties":false}}}$J$::jsonb,
    $J${"type":"object","properties":{"applicable":{"type":"boolean","description":"False when the material does not warrant a palace (small or unordered sets) — then theme is empty and loci is []. Never force a palace."},"theme":{"type":"string","description":"The journey's setting (a house, a walk to school) — empty when not applicable."},"loci":{"type":"array","items":{"$ref":"#/$defs/locus"},"description":"The ordered stops of the journey — [] when not applicable."}},"required":["applicable","loci"],"additionalProperties":false,"$defs":{"locus":{"type":"object","properties":{"place":{"type":"string","description":"One stop on the journey — a concrete location in the palace theme."},"item":{"type":"string","description":"The material placed at this stop."},"image":{"type":"string","description":"The vivid, exaggerated mental image binding the item to the place."}},"required":["place","item"],"additionalProperties":false}}}$J$::jsonb,
    'w6-3hcnd8ckejx2',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'memory_aid',
    'Memory Aid',
    'ts',
    $J$[{"name":"title","required":true,"description":"Short human title for this set of aids.","type":"string"},{"name":"strategy_note","description":"One or two sentences on how to use these aids together while studying.","type":"string"},{"name":"mnemonics","required":true,"description":"Mnemonic devices for the hard lists, sequences, and terms — [] when none fit.","type":"array"},{"name":"analogies","required":true,"description":"Analogies / memory bridges for the abstract concepts — [] when none fit.","type":"array"},{"name":"memory_palace","required":true,"description":"Method-of-loci scaffold for a large ordered set, or applicable:false when the material doesn't warrant one.","type":"object"}]$J$::jsonb,
    $J${"__kind":"memory_aid","title":"Cranial nerves — memory aids","strategy_note":"Lead with the acronym for order, then use the analogies for the functions you keep mixing up.","mnemonics":[{"__kind":"mnemonic","technique":"acronym","target":"The Great Lakes: Huron, Ontario, Michigan, Erie, Superior","device":"HOMES","explanation":"One letter per lake."}],"analogies":[{"__kind":"analogy","concept":"Enzyme active sites","analogy":"a lock and its key","mapping":"The lock is the active site, the key is the substrate."}],"memory_palace":{"__kind":"memory_palace","applicable":false,"theme":"","loci":[]}}$J$::jsonb,
    $J${"type":"object","properties":{"title":{"type":"string","description":"Short human title for this set of aids."},"strategy_note":{"type":"string","description":"One or two sentences on how to use these aids together while studying."},"mnemonics":{"type":"array","items":{"$ref":"#/$defs/mnemonic"},"description":"Mnemonic devices for the hard lists, sequences, and terms — [] when none fit."},"analogies":{"type":"array","items":{"$ref":"#/$defs/analogy"},"description":"Analogies / memory bridges for the abstract concepts — [] when none fit."},"memory_palace":{"$ref":"#/$defs/memory_palace","description":"Method-of-loci scaffold for a large ordered set, or applicable:false when the material doesn't warrant one."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"memory_aid"}},"required":["__kind","title","mnemonics","analogies","memory_palace"],"additionalProperties":false,"$defs":{"mnemonic":{"type":"object","properties":{"technique":{"type":"string","enum":["acronym","acrostic","rhyme","sentence","keyword","chunking"],"description":"Which mnemonic device family this is. Pick the one that genuinely fits the material — never force an acronym onto prose."},"target":{"type":"string","description":"The exact list, term, or sequence this device helps memorize, quoted from the source material."},"device":{"type":"string","description":"The mnemonic itself — the acronym, sentence, rhyme, keyword image, or chunking scheme."},"explanation":{"type":"string","description":"How each part of the device maps back to the material, so the learner can decode it later."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"mnemonic"}},"required":["__kind","technique","target","device"],"additionalProperties":false},"analogy":{"type":"object","properties":{"concept":{"type":"string","description":"The abstract concept being bridged."},"analogy":{"type":"string","description":"The relatable everyday thing the concept is like — one sentence."},"mapping":{"type":"string","description":"The correspondence spelled out: which part of the analogy stands for which part of the concept."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"analogy"}},"required":["__kind","concept","analogy"],"additionalProperties":false},"memory_palace":{"type":"object","properties":{"applicable":{"type":"boolean","description":"False when the material does not warrant a palace (small or unordered sets) — then theme is empty and loci is []. Never force a palace."},"theme":{"type":"string","description":"The journey's setting (a house, a walk to school) — empty when not applicable."},"loci":{"type":"array","items":{"$ref":"#/$defs/locus"},"description":"The ordered stops of the journey — [] when not applicable."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"memory_palace"}},"required":["__kind","applicable","loci"],"additionalProperties":false},"locus":{"type":"object","properties":{"place":{"type":"string","description":"One stop on the journey — a concrete location in the palace theme."},"item":{"type":"string","description":"The material placed at this stop."},"image":{"type":"string","description":"The vivid, exaggerated mental image binding the item to the place."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"locus"}},"required":["__kind","place","item"],"additionalProperties":false}}}$J$::jsonb,
    $J${"type":"object","properties":{"title":{"type":"string","description":"Short human title for this set of aids."},"strategy_note":{"type":"string","description":"One or two sentences on how to use these aids together while studying."},"mnemonics":{"type":"array","items":{"$ref":"#/$defs/mnemonic"},"description":"Mnemonic devices for the hard lists, sequences, and terms — [] when none fit."},"analogies":{"type":"array","items":{"$ref":"#/$defs/analogy"},"description":"Analogies / memory bridges for the abstract concepts — [] when none fit."},"memory_palace":{"$ref":"#/$defs/memory_palace","description":"Method-of-loci scaffold for a large ordered set, or applicable:false when the material doesn't warrant one."}},"required":["title","mnemonics","analogies","memory_palace"],"additionalProperties":false,"$defs":{"mnemonic":{"type":"object","properties":{"technique":{"type":"string","enum":["acronym","acrostic","rhyme","sentence","keyword","chunking"],"description":"Which mnemonic device family this is. Pick the one that genuinely fits the material — never force an acronym onto prose."},"target":{"type":"string","description":"The exact list, term, or sequence this device helps memorize, quoted from the source material."},"device":{"type":"string","description":"The mnemonic itself — the acronym, sentence, rhyme, keyword image, or chunking scheme."},"explanation":{"type":"string","description":"How each part of the device maps back to the material, so the learner can decode it later."}},"required":["technique","target","device"],"additionalProperties":false},"analogy":{"type":"object","properties":{"concept":{"type":"string","description":"The abstract concept being bridged."},"analogy":{"type":"string","description":"The relatable everyday thing the concept is like — one sentence."},"mapping":{"type":"string","description":"The correspondence spelled out: which part of the analogy stands for which part of the concept."}},"required":["concept","analogy"],"additionalProperties":false},"memory_palace":{"type":"object","properties":{"applicable":{"type":"boolean","description":"False when the material does not warrant a palace (small or unordered sets) — then theme is empty and loci is []. Never force a palace."},"theme":{"type":"string","description":"The journey's setting (a house, a walk to school) — empty when not applicable."},"loci":{"type":"array","items":{"$ref":"#/$defs/locus"},"description":"The ordered stops of the journey — [] when not applicable."}},"required":["applicable","loci"],"additionalProperties":false},"locus":{"type":"object","properties":{"place":{"type":"string","description":"One stop on the journey — a concrete location in the palace theme."},"item":{"type":"string","description":"The material placed at this stop."},"image":{"type":"string","description":"The vivid, exaggerated mental image binding the item to the place."}},"required":["place","item"],"additionalProperties":false}}}$J$::jsonb,
    '2po-ab18s8esbnbu',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'memory_hint',
    'Memory Hint',
    'ts',
    $J$[{"name":"technique","required":true,"description":"The aid family used for this one hint.","type":"enum","values":["acronym","acrostic","rhyme","sentence","keyword","chunking","analogy","association"]},{"name":"aid","required":true,"description":"The one glanceable memory aid itself — short enough to absorb without leaving the card.","type":"string"},{"name":"explanation","description":"One sentence on how the aid maps to the card.","type":"string"}]$J$::jsonb,
    $J${"__kind":"memory_hint","technique":"keyword","aid":"Mitochondria → 'mighty chondria' — the mighty one carries the power.","explanation":"Sound-alike keyword: 'mighty' anchors 'powerhouse of the cell'."}$J$::jsonb,
    $J${"type":"object","properties":{"technique":{"type":"string","enum":["acronym","acrostic","rhyme","sentence","keyword","chunking","analogy","association"],"description":"The aid family used for this one hint."},"aid":{"type":"string","description":"The one glanceable memory aid itself — short enough to absorb without leaving the card."},"explanation":{"type":"string","description":"One sentence on how the aid maps to the card."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"memory_hint"}},"required":["__kind","technique","aid"],"additionalProperties":false}$J$::jsonb,
    $J${"type":"object","properties":{"technique":{"type":"string","enum":["acronym","acrostic","rhyme","sentence","keyword","chunking","analogy","association"],"description":"The aid family used for this one hint."},"aid":{"type":"string","description":"The one glanceable memory aid itself — short enough to absorb without leaving the card."},"explanation":{"type":"string","description":"One sentence on how the aid maps to the card."}},"required":["technique","aid"],"additionalProperties":false}$J$::jsonb,
    'gw-1m1beyk6e0a6u',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  )
-- Arbiter is `kind_definition_global_slug_unique` — a PARTIAL unique index on
-- (kind) WHERE deleted_at IS NULL, so the predicate must be restated here.
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

-- ── 2. kind_edge: the parent→child field wiring ─────────────────────────────

INSERT INTO content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
SELECT p.id, v.field_name, c.id, v.position, p.organization_id
FROM (VALUES
  ('memory_aid',    'mnemonics',     'mnemonic',      0),
  ('memory_aid',    'analogies',     'analogy',       0),
  ('memory_aid',    'memory_palace', 'memory_palace', 0),
  ('memory_palace', 'loci',          'locus',         0)
) AS v(parent_kind, field_name, child_kind, position)
JOIN content_ir.kind_definition p
  ON p.kind = v.parent_kind
 AND p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND p.deleted_at IS NULL
JOIN content_ir.kind_definition c
  ON c.kind = v.child_kind
 AND c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND c.deleted_at IS NULL
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
    'memory_aid', 'Solar-system deck aids (canonical)', true,
    'All three families live at once: two mnemonics, one analogy, and an applicable memory palace with three loci.',
    $J${"__kind":"memory_aid","title":"The planets in order — memory aids","strategy_note":"Use the sentence mnemonic for the order first; the palace walk is for locking it in before a test.","mnemonics":[{"__kind":"mnemonic","technique":"sentence","target":"Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune","device":"My Very Educated Mother Just Served Us Noodles","explanation":"First letters match the planets in order from the Sun."},{"__kind":"mnemonic","technique":"chunking","target":"The eight planets","device":"Rocky four (Mercury–Mars) + giant four (Jupiter–Neptune)","explanation":"Two chunks of four beat one list of eight."}],"analogies":[{"__kind":"analogy","concept":"The asteroid belt","analogy":"a gravel driveway between the house and the barn","mapping":"The house is the rocky inner planets, the barn is the gas giants, and the gravel is the belt between them."}],"memory_palace":{"__kind":"memory_palace","applicable":true,"theme":"Walking through your house, front door to back garden","loci":[{"__kind":"locus","place":"The front door","item":"Mercury","image":"A giant thermometer wedged in the doorframe, dripping silver."},{"__kind":"locus","place":"The hallway mirror","item":"Venus","image":"The mirror fogged over with thick yellow clouds."},{"__kind":"locus","place":"The kitchen table","item":"Earth","image":"A blue marble spinning on the table where your plate should be."}]}}$J$
  ),
  (
    'memory_aid', 'Mnemonics only, no palace (minimal)', false,
    'Minimal legal form: one mnemonic, no analogies, palace not applicable — small unordered material never gets a forced palace.',
    $J${"__kind":"memory_aid","title":"Great Lakes — memory aids","mnemonics":[{"__kind":"mnemonic","technique":"acronym","target":"Huron, Ontario, Michigan, Erie, Superior","device":"HOMES","explanation":"One letter per lake."}],"analogies":[],"memory_palace":{"__kind":"memory_palace","applicable":false,"theme":"","loci":[]}}$J$
  ),
  (
    'mnemonic', 'Acronym mnemonic (canonical)', true,
    'One device with its target list and the decode explanation.',
    $J${"__kind":"mnemonic","technique":"acronym","target":"The Great Lakes: Huron, Ontario, Michigan, Erie, Superior","device":"HOMES","explanation":"H-O-M-E-S — one letter per lake: Huron, Ontario, Michigan, Erie, Superior."}$J$
  ),
  (
    'analogy', 'Lock-and-key analogy (canonical)', true,
    'An abstract concept bridged to an everyday object, with the mapping spelled out.',
    $J${"__kind":"analogy","concept":"Enzyme active sites","analogy":"a lock and its key","mapping":"The lock is the active site, the key is the substrate — only the matching shape fits and turns."}$J$
  ),
  (
    'memory_palace', 'House-walk palace (canonical)', true,
    'An applicable palace: a theme and two ordered loci with vivid images.',
    $J${"__kind":"memory_palace","applicable":true,"theme":"Walking through your house, front door to back garden","loci":[{"__kind":"locus","place":"The front door","item":"Mercury","image":"A giant thermometer wedged in the doorframe, dripping silver."},{"__kind":"locus","place":"The hallway mirror","item":"Venus","image":"The mirror fogged over with thick yellow clouds."}]}$J$
  ),
  (
    'locus', 'Front-door locus (canonical)', true,
    'One stop: a place, the item placed there, and the vivid binding image.',
    $J${"__kind":"locus","place":"The front door","item":"Mercury","image":"A giant thermometer wedged in the doorframe, dripping silver."}$J$
  ),
  (
    'memory_hint', 'Keyword hint (canonical)', true,
    'One glanceable per-flashcard aid: technique, the aid, one-line explanation.',
    $J${"__kind":"memory_hint","technique":"keyword","aid":"Mitochondria → 'mighty chondria' — the mighty one carries the power.","explanation":"Sound-alike keyword: 'mighty' anchors 'powerhouse of the cell'."}$J$
  ),
  (
    'memory_hint', 'Association hint, no explanation (minimal)', false,
    'Minimal legal form: technique + aid only — explanation is optional.',
    $J${"__kind":"memory_hint","technique":"association","aid":"Stalactites hold TIGHT to the ceiling; stalagMITES MIGHT reach it."}$J$
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

-- ── 4. kind_component: web output → the bundled renderers ───────────────────

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', d.kind, 'bundled',
       jsonb_build_object('legacyBlockType', d.kind), true, true, 100,
       d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind IN ('memory_aid', 'memory_hint')
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.component_key = d.kind
      AND c.deleted_at IS NULL
  );

-- ── 5. Skills: kind_memory_aid / kind_memory_hint ───────────────────────────

INSERT INTO skill.definition
  (skill_id, label, description, skill_type, body, icon_name,
   is_active, is_system, visibility, category_id, sort_order,
   semver, platform_targets, organization_id, metadata)
SELECT
  'kind_memory_aid',
  'Memory Aid (structured)',
  'How and when to emit a memory_aid render block as structured "__kind" JSON: mnemonics, analogies/memory bridges, and an optional memory-palace scaffold for hard-to-retain study material.',
  'render_block',
  $SB$# Memory Aid (structured JSON)

When you produce memory aids for study material — mnemonics for hard lists,
analogies for abstract concepts, a method-of-loci journey for a large ordered
set — emit ONE JSON object marked with `"__kind": "memory_aid"`. It renders as
grouped aid cards the learner studies from directly.

## How to emit it

Emit one JSON object. It may sit inside a ```json fence or stand bare in the
message — the pipeline recognizes `"__kind": "memory_aid"` either way:

```json
{
  "__kind": "memory_aid",
  "title": "The planets in order — memory aids",
  "strategy_note": "Use the sentence mnemonic for order; the palace is for locking it in.",
  "mnemonics": [
    { "__kind": "mnemonic", "technique": "sentence",
      "target": "Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune",
      "device": "My Very Educated Mother Just Served Us Noodles",
      "explanation": "First letters match the planets in order from the Sun." }
  ],
  "analogies": [
    { "__kind": "analogy", "concept": "The asteroid belt",
      "analogy": "a gravel driveway between the house and the barn",
      "mapping": "House = rocky planets, barn = gas giants, gravel = the belt." }
  ],
  "memory_palace": { "__kind": "memory_palace", "applicable": false, "theme": "", "loci": [] }
}
```

## The root shape

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Always the literal `"memory_aid"`. |
| `title` | string | yes | Short human title for the set. |
| `strategy_note` | string | no | One or two sentences on how to use the aids together. |
| `mnemonics` | array | yes | `mnemonic` objects — `[]` when none fit. |
| `analogies` | array | yes | `analogy` objects — `[]` when none fit. |
| `memory_palace` | object | yes | A `memory_palace` object; `applicable:false` when the material doesn't warrant one. |

## The child shapes

`mnemonic`: `__kind`, `technique` (one of `acronym`, `acrostic`, `rhyme`,
`sentence`, `keyword`, `chunking`), `target` (the exact material), `device`
(the mnemonic itself), optional `explanation` (the decode).

`analogy`: `__kind`, `concept`, `analogy` (the everyday thing), optional
`mapping` (the spelled-out correspondence).

`memory_palace`: `__kind`, `applicable` (boolean), `theme`, `loci` (array of
`locus`). `locus`: `__kind`, `place`, `item`, optional `image` (the vivid
binding image).

## Rules

1. **Ground every aid in the supplied material** — never invent facts to make
   a device work; the aid must decode back to the real content.
2. **Pick the technique that fits.** Never force an acronym onto prose or a
   palace onto a small/unordered set — set `applicable: false` instead.
3. `target` quotes the exact list/term the device covers, so the learner
   knows what it unlocks.
4. Keep devices SHORT and vivid; the explanation carries the decode, not the
   device.
5. Empty sections are legal (`[]`) — two great mnemonics beat six forced ones.
6. Valid JSON only — double-quoted keys and strings, no trailing commas, no
   comments, and nothing outside the object.

## Editing an existing set

When asked to revise, return ONE complete `memory_aid` object with the FULL
updated content — never a fragment. Preserve untouched aids verbatim.
$SB$,
  'Brain',
  true, true, 'public',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',  -- platform.categories: dimension 'skill', "Render Blocks"
  64, '1.0.0', '["web"]'::jsonb,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"kind": "memory_aid"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'kind_memory_aid'
    AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND project_id IS NULL AND task_id IS NULL
    AND deleted_at IS NULL
);

INSERT INTO skill.definition
  (skill_id, label, description, skill_type, body, icon_name,
   is_active, is_system, visibility, category_id, sort_order,
   semver, platform_targets, organization_id, metadata)
SELECT
  'kind_memory_hint',
  'Memory Hint (structured)',
  'How and when to emit a memory_hint render block as structured "__kind" JSON: one glanceable memory aid for a single flashcard or fact.',
  'render_block',
  $SB$# Memory Hint (structured JSON)

When you produce ONE quick memory aid for a single flashcard or fact — a
sound-alike, a rhyme, an association the learner can absorb at a glance —
emit one JSON object marked with `"__kind": "memory_hint"`:

```json
{
  "__kind": "memory_hint",
  "technique": "keyword",
  "aid": "Mitochondria → 'mighty chondria' — the mighty one carries the power.",
  "explanation": "Sound-alike keyword: 'mighty' anchors 'powerhouse of the cell'."
}
```

## The shape

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Always the literal `"memory_hint"`. |
| `technique` | string | yes | One of `acronym`, `acrostic`, `rhyme`, `sentence`, `keyword`, `chunking`, `analogy`, `association`. |
| `aid` | string | yes | The aid itself — short enough to absorb without leaving the card. |
| `explanation` | string | no | One sentence on how the aid maps to the card. |

## Rules

1. ONE hint per response — this shape is a glance, not a study guide. A full
   multi-aid set is the `memory_aid` shape instead.
2. Ground the aid in the card's actual front/back — it must decode back to
   the real content, never to an invented fact.
3. Keep `aid` to one or two lines; the explanation carries the decode.
4. Valid JSON only — double-quoted keys and strings, no trailing commas,
   nothing outside the object.
$SB$,
  'Brain',
  true, true, 'public',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',
  65, '1.0.0', '["web"]'::jsonb,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"kind": "memory_hint"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'kind_memory_hint'
    AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND project_id IS NULL AND task_id IS NULL
    AND deleted_at IS NULL
);

-- ── 6. Render/content blocks — paired to the skills. Insert-only. ───────────

INSERT INTO skill.render_definition
  (block_id, label, description, icon_name, template, block_type,
   category_id, sort_order, is_active, visibility, skill_id,
   organization_id, metadata)
SELECT v.block_id, v.label, v.description, v.icon_name, v.template, 'render_kind',
       '2c324058-95e9-4b7e-a991-884f4443eb6e',
       v.sort_order, true, 'public', s.id,
       '39c38960-d30c-4840-b0c1-c9960de95582',
       jsonb_build_object('skill_id', v.skill_ref)
FROM (VALUES
  (
    'kind-memory-aid-simple', 'Memory Aid', 'kind_memory_aid',
    'Condensed instructions for emitting a memory_aid render block.',
    'Brain', 10,
    $CB$When you produce memory aids for study material, emit them as ONE structured object — it renders as grouped aid cards the learner studies from:

```json
{ "__kind": "memory_aid", "title": "…",
  "mnemonics": [ { "__kind": "mnemonic", "technique": "acronym", "target": "the exact list", "device": "HOMES", "explanation": "one letter per lake" } ],
  "analogies": [ { "__kind": "analogy", "concept": "…", "analogy": "…", "mapping": "…" } ],
  "memory_palace": { "__kind": "memory_palace", "applicable": false, "theme": "", "loci": [] } }
```

- `title`, `mnemonics`, `analogies`, `memory_palace` are required; empty arrays are legal — never force a device that doesn't fit.
- `technique` is one of acronym, acrostic, rhyme, sentence, keyword, chunking.
- A palace only for large ORDERED sets; otherwise `applicable: false` with empty theme/loci.
- Ground every aid in the supplied material — it must decode back to real content.
- Valid JSON only — no trailing commas.$CB$
  ),
  (
    'kind-memory-aid-full', 'Memory Aid (Palace Journey)', 'kind_memory_aid',
    'Memory-aid set with an applicable method-of-loci palace for a large ordered set.',
    'Landmark', 20,
    $CB$For a large ORDERED set, include a memory-palace journey: a familiar theme and one vivid locus per item, in order:

```json
{ "__kind": "memory_aid", "title": "The planets in order — memory aids",
  "strategy_note": "Use the sentence mnemonic for order; walk the palace before a test.",
  "mnemonics": [ { "__kind": "mnemonic", "technique": "sentence", "target": "Mercury…Neptune", "device": "My Very Educated Mother Just Served Us Noodles", "explanation": "First letters match the planets in order." } ],
  "analogies": [],
  "memory_palace": { "__kind": "memory_palace", "applicable": true,
    "theme": "Walking through your house, front door to back garden",
    "loci": [ { "__kind": "locus", "place": "The front door", "item": "Mercury", "image": "A giant thermometer wedged in the doorframe." } ] } }
```

- Loci follow the journey's natural walking order and each image is vivid and exaggerated — bland images don't stick.
- One item per locus; the place is concrete and familiar.
- Never force a palace onto small or unordered material — set `applicable: false` instead.$CB$
  ),
  (
    'kind-memory-hint-simple', 'Memory Hint', 'kind_memory_hint',
    'Condensed instructions for emitting a memory_hint render block.',
    'Brain', 10,
    $CB$When you produce ONE quick memory aid for a single flashcard or fact, emit it as a structured hint — it renders as a glanceable aid card:

```json
{ "__kind": "memory_hint", "technique": "keyword",
  "aid": "Mitochondria → 'mighty chondria' — the mighty one carries the power.",
  "explanation": "Sound-alike keyword anchors 'powerhouse of the cell'." }
```

- `technique` is one of acronym, acrostic, rhyme, sentence, keyword, chunking, analogy, association.
- ONE hint only, one or two lines — a full multi-aid set is the memory_aid shape instead.
- Ground the aid in the card's actual content; the explanation carries the decode.
- Valid JSON only — no trailing commas.$CB$
  )
) AS v(block_id, label, skill_ref, description, icon_name, sort_order, template)
JOIN skill.definition s
  ON s.skill_id = v.skill_ref
 AND s.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND s.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM skill.render_definition b
  WHERE b.block_id = v.block_id AND b.deleted_at IS NULL
);

COMMIT;
