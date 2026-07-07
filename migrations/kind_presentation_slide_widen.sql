-- kind_presentation_slide_widen.sql
-- Widen presentation_slide (+ imageUrl, + free-form `extra`) and
-- presentation_deck.theme (+ `preset` enum) to match the REAL Slideshow /
-- SlideView renderer, regenerate the emitted schemas via the TS converters,
-- and activate the deck with a canonical RICH example (preset + extra).
-- Engineered from component reality; emitted blobs are converter output, never
-- hand-edited. Idempotent (CREATE-safe UPDATEs + NOT EXISTS insert).
-- migrate: source matrx-frontend

begin;

-- presentation_slide (child kind — stays is_active=false; no component) --------
update content_ir.kind_definition set
  data = $json$[{"name":"type","type":"string"},{"name":"layout","type":"string"},{"name":"title","type":"string"},{"name":"subtitle","type":"string"},{"name":"description","type":"string"},{"name":"bullets","type":"string[]"},{"name":"quote","type":"string"},{"name":"author","type":"string"},{"name":"image_url","type":"string"},{"name":"imageUrl","type":"string"},{"name":"notes","type":"string"},{"name":"extra","type":"record","values":"string"}]$json$::jsonb,
  emitted_block_schema = $json${"type":"object","properties":{"type":{"type":"string"},"layout":{"type":"string"},"title":{"type":"string"},"subtitle":{"type":"string"},"description":{"type":"string"},"bullets":{"type":"array","items":{"type":"string"}},"quote":{"type":"string"},"author":{"type":"string"},"image_url":{"type":"string"},"imageUrl":{"type":"string"},"notes":{"type":"string"},"extra":{"type":"object","additionalProperties":{"type":"string"}},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"presentation_slide"}},"required":["__kind"],"additionalProperties":false}$json$::jsonb,
  emitted_json_schema = $json${"type":"object","properties":{"type":{"type":"string"},"layout":{"type":"string"},"title":{"type":"string"},"subtitle":{"type":"string"},"description":{"type":"string"},"bullets":{"type":"array","items":{"type":"string"}},"quote":{"type":"string"},"author":{"type":"string"},"image_url":{"type":"string"},"imageUrl":{"type":"string"},"notes":{"type":"string"},"extra":{"type":"object","additionalProperties":{"type":"string"}}},"required":[],"additionalProperties":false}$json$::jsonb,
  emitted_fingerprint = $fp$gh-1ih93d118wpbsj$fp$,
  updated_at = now()
where kind = 'presentation_slide' and deleted_at is null;

-- presentation_deck (parent — becomes is_active=true via the dual gate) --------
update content_ir.kind_definition set
  data = $json$[{"name":"title","type":"string"},{"name":"slides","required":true,"type":"array"},{"name":"theme","type":"inline_object","fields":[{"name":"primaryColor","type":"string"},{"name":"secondaryColor","type":"string"},{"name":"accentColor","type":"string"},{"name":"backgroundColor","type":"string"},{"name":"textColor","type":"string"},{"name":"variant","type":"string"},{"name":"font","type":"string"},{"name":"preset","type":"enum","values":["classic","corporate","editorial","bold","minimal","midnight","ocean","sunset","forest","mono"]}]},{"name":"additionalDetails","type":"inline_object","fields":[]}]$json$::jsonb,
  emitted_block_schema = $json${"type":"object","properties":{"title":{"type":"string"},"slides":{"type":"array","items":{"$ref":"#/$defs/presentation_slide"}},"theme":{"type":"object","properties":{"primaryColor":{"type":"string"},"secondaryColor":{"type":"string"},"accentColor":{"type":"string"},"backgroundColor":{"type":"string"},"textColor":{"type":"string"},"variant":{"type":"string"},"font":{"type":"string"},"preset":{"type":"string","enum":["classic","corporate","editorial","bold","minimal","midnight","ocean","sunset","forest","mono"]}},"required":[],"additionalProperties":false},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":false},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"presentation_deck"}},"required":["__kind","slides"],"additionalProperties":false,"$defs":{"presentation_slide":{"type":"object","properties":{"type":{"type":"string"},"layout":{"type":"string"},"title":{"type":"string"},"subtitle":{"type":"string"},"description":{"type":"string"},"bullets":{"type":"array","items":{"type":"string"}},"quote":{"type":"string"},"author":{"type":"string"},"image_url":{"type":"string"},"imageUrl":{"type":"string"},"notes":{"type":"string"},"extra":{"type":"object","additionalProperties":{"type":"string"}},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"presentation_slide"}},"required":["__kind"],"additionalProperties":false}}}$json$::jsonb,
  emitted_json_schema = $json${"type":"object","properties":{"title":{"type":"string"},"slides":{"type":"array","items":{"$ref":"#/$defs/presentation_slide"}},"theme":{"type":"object","properties":{"primaryColor":{"type":"string"},"secondaryColor":{"type":"string"},"accentColor":{"type":"string"},"backgroundColor":{"type":"string"},"textColor":{"type":"string"},"variant":{"type":"string"},"font":{"type":"string"},"preset":{"type":"string","enum":["classic","corporate","editorial","bold","minimal","midnight","ocean","sunset","forest","mono"]}},"required":[],"additionalProperties":false},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":false}},"required":["slides"],"additionalProperties":false,"$defs":{"presentation_slide":{"type":"object","properties":{"type":{"type":"string"},"layout":{"type":"string"},"title":{"type":"string"},"subtitle":{"type":"string"},"description":{"type":"string"},"bullets":{"type":"array","items":{"type":"string"}},"quote":{"type":"string"},"author":{"type":"string"},"image_url":{"type":"string"},"imageUrl":{"type":"string"},"notes":{"type":"string"},"extra":{"type":"object","additionalProperties":{"type":"string"}}},"required":[],"additionalProperties":false}}}$json$::jsonb,
  emitted_fingerprint = $fp$14i-6npmcb1ggv761$fp$,
  is_active = true,
  updated_at = now()
where kind = 'presentation_deck' and deleted_at is null;

-- Canonical rich example (exercises preset + extra). Structural + render both
-- pass the dual gate (verified in TS before this migration was written).
insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description, source, is_canonical, validation_status, validated_at, organization_id)
select
  d.id, d.version, $json${"__kind":"presentation_deck","title":"Q4 Business Review","slides":[{"__kind":"presentation_slide","type":"title","layout":"title","title":"Q4 Business Review","subtitle":"Performance, wins, and the road into next year","extra":{"eyebrow":"FY2026"}},{"__kind":"presentation_slide","layout":"bullets","title":"Where we landed","bullets":["Revenue up 32% year over year","Net retention held at 118%","Two new enterprise segments opened"],"extra":{"eyebrow":"Overview"}},{"__kind":"presentation_slide","layout":"image-split","title":"Product momentum","description":"Shipping faster with a smaller, sharper team.","bullets":["47 releases","P95 latency down 40%"],"extra":{"imagePrompt":"modern software team collaborating in a bright office"}},{"__kind":"presentation_slide","layout":"quote","quote":"The best quarter we have ever had — and the setup for an even better one.","author":"Head of Revenue"},{"__kind":"presentation_slide","type":"closing","layout":"closing","title":"Thank you","subtitle":"Questions?"}],"theme":{"preset":"editorial","variant":"fancy"}}$json$::jsonb,
  'Q4 Business Review — rich deck',
  'Rich presentation_deck example exercising theme.preset (editorial) and slide.extra (eyebrow / imagePrompt) across title, bullets, image-split, quote, and closing layouts.',
  'authored', true, 'passed', now(), d.organization_id
from content_ir.kind_definition d
where d.kind = 'presentation_deck' and d.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id = d.id and e.label = 'Q4 Business Review — rich deck' and e.deleted_at is null
  );

commit;
