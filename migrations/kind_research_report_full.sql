-- kind_research_report_full.sql
-- The research_report kind family (Shape System): 6 kind_definition rows
-- (research_report, research_section, research_finding, research_theme,
-- research_challenge, research_recommendation), their kind_edge graph, two
-- validated kind_example rows, the <research> xml_tag kind_surface (named
-- strategy 'research_legacy_text', implemented in
-- features/content-ir/surfaces/research-legacy-text.ts), the web output
-- kind_component (component_key 'research' = the legacyBlockType contract
-- key), the kind_research_report render-block skill, and two paired content
-- blocks.
--
-- The kind is derived from the FULL renderable surface of ResearchBlock
-- (components/mardown-display/blocks/research/ResearchBlock.tsx), including
-- the Analysis/Recommendations tab fields today's <research> XML parser
-- initializes but never fills (convergentThemes, conflictingEvidence,
-- short/medium/long-term outlooks, challenges, recommendations, limitations,
-- sourceQuality, metadata, per-finding sources/urls/confidence). The
-- canonical kind_example populates them — the JSON path exceeds the XML path
-- by construction.
--
-- data / emitted_block_schema / emitted_json_schema / emitted_fingerprint are
-- CONVERTER-EMITTED (planKindMigration -> kindSchemaToStorage +
-- kindSchemaToJsonSchema + fingerprintText), never hand-written. Examples
-- were validated for real (ajv Draft 2020-12 structural leg + render-bridge
-- dual gate) before being marked 'passed' — see
-- features/content-ir/__tests__/kind-research-report.test.ts.
--
-- is_active stays FALSE on every kind_definition row: the parser strategy and
-- registry facets ship in this change but are not yet registered
-- (system-kinds.ts / xml-finalize.ts are integration-owned). Inactive kinds
-- render through the generic viewer (R6) — expected, not a failure.
--
-- Idempotent + schema-qualified; business-key guarded so re-apply is safe.
-- Never clobbers: all inserts are WHERE NOT EXISTS (no ON CONFLICT UPDATE).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. kind_definition rows (authoring_owner 'ts', public, INACTIVE until
--    integration registers the facets).
-- ---------------------------------------------------------------------------
insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_block_schema, emitted_json_schema, emitted_fingerprint, is_active, visibility, organization_id, metadata)
select 'research_report', 'Research Report', 'ts',
  $mtx$[{"name":"title","required":true,"type":"string"},{"name":"overview","type":"string"},{"name":"researchScope","type":"string"},{"name":"keyFocusAreas","type":"string"},{"name":"analysisPeriod","type":"string"},{"name":"executiveSummary","type":"string"},{"name":"introduction","type":"string"},{"name":"researchQuestions","type":"string[]"},{"name":"sections","required":true,"type":"array"},{"name":"convergentThemes","type":"array"},{"name":"conflictingEvidence","type":"inline_object","fields":[{"name":"disagreement","type":"string"},{"name":"perspectives","type":"string"},{"name":"resolution","type":"string"}]},{"name":"shortTermOutlook","type":"string[]"},{"name":"mediumTermOutlook","type":"string[]"},{"name":"longTermVision","type":"string[]"},{"name":"challenges","type":"array"},{"name":"recommendations","type":"array"},{"name":"limitations","type":"string[]"},{"name":"conclusion","type":"string"},{"name":"keyTakeaways","type":"string[]"},{"name":"methodology","type":"inline_object","fields":[{"name":"searchStrategy","type":"string"},{"name":"selectionCriteria","type":"string"},{"name":"analysisFramework","type":"string"}]},{"name":"sourceQuality","type":"inline_object","fields":[{"name":"peerReviewed","type":"number"},{"name":"industryReports","type":"number"},{"name":"expertInterviews","type":"number"},{"name":"governmentPubs","type":"number"}]},{"name":"metadata","type":"inline_object","fields":[{"name":"researchDate","type":"string"},{"name":"lastUpdated","type":"string"},{"name":"confidenceRating","type":"string"},{"name":"biasAssessment","type":"string"}]},{"name":"additionalDetails","type":"inline_object","fields":[]}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"overview":{"type":"string"},"researchScope":{"type":"string"},"keyFocusAreas":{"type":"string"},"analysisPeriod":{"type":"string"},"executiveSummary":{"type":"string"},"introduction":{"type":"string"},"researchQuestions":{"type":"array","items":{"type":"string"}},"sections":{"type":"array","items":{"$ref":"#/$defs/research_section"}},"convergentThemes":{"type":"array","items":{"$ref":"#/$defs/research_theme"}},"conflictingEvidence":{"type":"object","properties":{"disagreement":{"type":"string"},"perspectives":{"type":"string"},"resolution":{"type":"string"}},"required":[],"additionalProperties":false},"shortTermOutlook":{"type":"array","items":{"type":"string"}},"mediumTermOutlook":{"type":"array","items":{"type":"string"}},"longTermVision":{"type":"array","items":{"type":"string"}},"challenges":{"type":"array","items":{"$ref":"#/$defs/research_challenge"}},"recommendations":{"type":"array","items":{"$ref":"#/$defs/research_recommendation"}},"limitations":{"type":"array","items":{"type":"string"}},"conclusion":{"type":"string"},"keyTakeaways":{"type":"array","items":{"type":"string"}},"methodology":{"type":"object","properties":{"searchStrategy":{"type":"string"},"selectionCriteria":{"type":"string"},"analysisFramework":{"type":"string"}},"required":[],"additionalProperties":false},"sourceQuality":{"type":"object","properties":{"peerReviewed":{"type":"number"},"industryReports":{"type":"number"},"expertInterviews":{"type":"number"},"governmentPubs":{"type":"number"}},"required":[],"additionalProperties":false},"metadata":{"type":"object","properties":{"researchDate":{"type":"string"},"lastUpdated":{"type":"string"},"confidenceRating":{"type":"string"},"biasAssessment":{"type":"string"}},"required":[],"additionalProperties":false},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":false},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"research_report"}},"required":["__kind","title","sections"],"additionalProperties":false,"$defs":{"research_section":{"type":"object","properties":{"title":{"type":"string"},"subtitle":{"type":"string"},"findings":{"type":"array","items":{"$ref":"#/$defs/research_finding"}},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"research_section"}},"required":["__kind","title","findings"],"additionalProperties":false},"research_theme":{"type":"object","properties":{"theme":{"type":"string"},"description":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"research_theme"}},"required":["__kind","theme","description"],"additionalProperties":false},"research_challenge":{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"currentSolutions":{"type":"string"},"researchGaps":{"type":"string"},"category":{"type":"string","enum":["technical","ethical","regulatory","other"]},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"research_challenge"}},"required":["__kind","title","description"],"additionalProperties":false},"research_recommendation":{"type":"object","properties":{"recommendation":{"type":"string"},"target":{"type":"string","enum":["researchers","industry","policymakers","general"]},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"research_recommendation"}},"required":["__kind","recommendation"],"additionalProperties":false},"research_finding":{"type":"object","properties":{"title":{"type":"string"},"keyDetails":{"type":"string"},"primarySource":{"type":"string"},"additionalSources":{"type":"array","items":{"type":"string"}},"urls":{"type":"array","items":{"type":"string"}},"significance":{"type":"string"},"futureImplications":{"type":"string"},"confidenceLevel":{"type":"string","enum":["HIGH","MEDIUM","LOW"]},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"research_finding"}},"required":["__kind","title","keyDetails"],"additionalProperties":false}}}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"overview":{"type":"string"},"researchScope":{"type":"string"},"keyFocusAreas":{"type":"string"},"analysisPeriod":{"type":"string"},"executiveSummary":{"type":"string"},"introduction":{"type":"string"},"researchQuestions":{"type":"array","items":{"type":"string"}},"sections":{"type":"array","items":{"$ref":"#/$defs/research_section"}},"convergentThemes":{"type":"array","items":{"$ref":"#/$defs/research_theme"}},"conflictingEvidence":{"type":"object","properties":{"disagreement":{"type":"string"},"perspectives":{"type":"string"},"resolution":{"type":"string"}},"required":[],"additionalProperties":false},"shortTermOutlook":{"type":"array","items":{"type":"string"}},"mediumTermOutlook":{"type":"array","items":{"type":"string"}},"longTermVision":{"type":"array","items":{"type":"string"}},"challenges":{"type":"array","items":{"$ref":"#/$defs/research_challenge"}},"recommendations":{"type":"array","items":{"$ref":"#/$defs/research_recommendation"}},"limitations":{"type":"array","items":{"type":"string"}},"conclusion":{"type":"string"},"keyTakeaways":{"type":"array","items":{"type":"string"}},"methodology":{"type":"object","properties":{"searchStrategy":{"type":"string"},"selectionCriteria":{"type":"string"},"analysisFramework":{"type":"string"}},"required":[],"additionalProperties":false},"sourceQuality":{"type":"object","properties":{"peerReviewed":{"type":"number"},"industryReports":{"type":"number"},"expertInterviews":{"type":"number"},"governmentPubs":{"type":"number"}},"required":[],"additionalProperties":false},"metadata":{"type":"object","properties":{"researchDate":{"type":"string"},"lastUpdated":{"type":"string"},"confidenceRating":{"type":"string"},"biasAssessment":{"type":"string"}},"required":[],"additionalProperties":false},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":false}},"required":["title","sections"],"additionalProperties":false,"$defs":{"research_section":{"type":"object","properties":{"title":{"type":"string"},"subtitle":{"type":"string"},"findings":{"type":"array","items":{"$ref":"#/$defs/research_finding"}}},"required":["title","findings"],"additionalProperties":false},"research_theme":{"type":"object","properties":{"theme":{"type":"string"},"description":{"type":"string"}},"required":["theme","description"],"additionalProperties":false},"research_challenge":{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"currentSolutions":{"type":"string"},"researchGaps":{"type":"string"},"category":{"type":"string","enum":["technical","ethical","regulatory","other"]}},"required":["title","description"],"additionalProperties":false},"research_recommendation":{"type":"object","properties":{"recommendation":{"type":"string"},"target":{"type":"string","enum":["researchers","industry","policymakers","general"]}},"required":["recommendation"],"additionalProperties":false},"research_finding":{"type":"object","properties":{"title":{"type":"string"},"keyDetails":{"type":"string"},"primarySource":{"type":"string"},"additionalSources":{"type":"array","items":{"type":"string"}},"urls":{"type":"array","items":{"type":"string"}},"significance":{"type":"string"},"futureImplications":{"type":"string"},"confidenceLevel":{"type":"string","enum":["HIGH","MEDIUM","LOW"]}},"required":["title","keyDetails"],"additionalProperties":false}}}$mtx$::jsonb,
  '379-4wnk4crt5pvy', false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', $mtx${"family":"research_report","category":"pure","legacyBlockType":"research"}$mtx$::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='research_report' and deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_block_schema, emitted_json_schema, emitted_fingerprint, is_active, visibility, organization_id, metadata)
select 'research_section', 'Research Section', 'ts',
  $mtx$[{"name":"title","required":true,"type":"string"},{"name":"subtitle","type":"string"},{"name":"findings","required":true,"type":"array"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"subtitle":{"type":"string"},"findings":{"type":"array","items":{"$ref":"#/$defs/research_finding"}},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"research_section"}},"required":["__kind","title","findings"],"additionalProperties":false,"$defs":{"research_finding":{"type":"object","properties":{"title":{"type":"string"},"keyDetails":{"type":"string"},"primarySource":{"type":"string"},"additionalSources":{"type":"array","items":{"type":"string"}},"urls":{"type":"array","items":{"type":"string"}},"significance":{"type":"string"},"futureImplications":{"type":"string"},"confidenceLevel":{"type":"string","enum":["HIGH","MEDIUM","LOW"]},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"research_finding"}},"required":["__kind","title","keyDetails"],"additionalProperties":false}}}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"subtitle":{"type":"string"},"findings":{"type":"array","items":{"$ref":"#/$defs/research_finding"}}},"required":["title","findings"],"additionalProperties":false,"$defs":{"research_finding":{"type":"object","properties":{"title":{"type":"string"},"keyDetails":{"type":"string"},"primarySource":{"type":"string"},"additionalSources":{"type":"array","items":{"type":"string"}},"urls":{"type":"array","items":{"type":"string"}},"significance":{"type":"string"},"futureImplications":{"type":"string"},"confidenceLevel":{"type":"string","enum":["HIGH","MEDIUM","LOW"]}},"required":["title","keyDetails"],"additionalProperties":false}}}$mtx$::jsonb,
  'ps-iw12gq1ggadk8', false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', $mtx${"family":"research_report","category":"pure"}$mtx$::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='research_section' and deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_block_schema, emitted_json_schema, emitted_fingerprint, is_active, visibility, organization_id, metadata)
select 'research_finding', 'Research Finding', 'ts',
  $mtx$[{"name":"title","required":true,"type":"string"},{"name":"keyDetails","required":true,"type":"string"},{"name":"primarySource","type":"string"},{"name":"additionalSources","type":"string[]"},{"name":"urls","type":"string[]"},{"name":"significance","type":"string"},{"name":"futureImplications","type":"string"},{"name":"confidenceLevel","type":"enum","values":["HIGH","MEDIUM","LOW"]}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"keyDetails":{"type":"string"},"primarySource":{"type":"string"},"additionalSources":{"type":"array","items":{"type":"string"}},"urls":{"type":"array","items":{"type":"string"}},"significance":{"type":"string"},"futureImplications":{"type":"string"},"confidenceLevel":{"type":"string","enum":["HIGH","MEDIUM","LOW"]},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"research_finding"}},"required":["__kind","title","keyDetails"],"additionalProperties":false}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"keyDetails":{"type":"string"},"primarySource":{"type":"string"},"additionalSources":{"type":"array","items":{"type":"string"}},"urls":{"type":"array","items":{"type":"string"}},"significance":{"type":"string"},"futureImplications":{"type":"string"},"confidenceLevel":{"type":"string","enum":["HIGH","MEDIUM","LOW"]}},"required":["title","keyDetails"],"additionalProperties":false}$mtx$::jsonb,
  'fi-15ugkaynywu70', false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', $mtx${"family":"research_report","category":"pure"}$mtx$::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='research_finding' and deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_block_schema, emitted_json_schema, emitted_fingerprint, is_active, visibility, organization_id, metadata)
select 'research_theme', 'Research Theme', 'ts',
  $mtx$[{"name":"theme","required":true,"type":"string"},{"name":"description","required":true,"type":"string"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"theme":{"type":"string"},"description":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"research_theme"}},"required":["__kind","theme","description"],"additionalProperties":false}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"theme":{"type":"string"},"description":{"type":"string"}},"required":["theme","description"],"additionalProperties":false}$mtx$::jsonb,
  '7k-1kduiqkwnni9e', false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', $mtx${"family":"research_report","category":"pure"}$mtx$::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='research_theme' and deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_block_schema, emitted_json_schema, emitted_fingerprint, is_active, visibility, organization_id, metadata)
select 'research_challenge', 'Research Challenge', 'ts',
  $mtx$[{"name":"title","required":true,"type":"string"},{"name":"description","required":true,"type":"string"},{"name":"currentSolutions","type":"string"},{"name":"researchGaps","type":"string"},{"name":"category","type":"enum","values":["technical","ethical","regulatory","other"]}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"currentSolutions":{"type":"string"},"researchGaps":{"type":"string"},"category":{"type":"string","enum":["technical","ethical","regulatory","other"]},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"research_challenge"}},"required":["__kind","title","description"],"additionalProperties":false}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"currentSolutions":{"type":"string"},"researchGaps":{"type":"string"},"category":{"type":"string","enum":["technical","ethical","regulatory","other"]}},"required":["title","description"],"additionalProperties":false}$mtx$::jsonb,
  'bv-ohe6zkt43k22', false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', $mtx${"family":"research_report","category":"pure"}$mtx$::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='research_challenge' and deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_block_schema, emitted_json_schema, emitted_fingerprint, is_active, visibility, organization_id, metadata)
select 'research_recommendation', 'Research Recommendation', 'ts',
  $mtx$[{"name":"recommendation","required":true,"type":"string"},{"name":"target","type":"enum","values":["researchers","industry","policymakers","general"]}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"recommendation":{"type":"string"},"target":{"type":"string","enum":["researchers","industry","policymakers","general"]},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"research_recommendation"}},"required":["__kind","recommendation"],"additionalProperties":false}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"recommendation":{"type":"string"},"target":{"type":"string","enum":["researchers","industry","policymakers","general"]}},"required":["recommendation"],"additionalProperties":false}$mtx$::jsonb,
  '9f-12skqvsvbwen6', false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', $mtx${"family":"research_report","category":"pure"}$mtx$::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='research_recommendation' and deleted_at is null);

-- ---------------------------------------------------------------------------
-- 2. kind_edge graph (field path -> child kind; the single source of truth
--    for kind->kind refs).
-- ---------------------------------------------------------------------------
insert into content_ir.kind_edge (parent_definition_id, field_name, child_definition_id, position, organization_id)
select p.id, 'sections', c.id, 0, p.organization_id
from content_ir.kind_definition p
join content_ir.kind_definition c
  on c.kind='research_section' and c.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and c.deleted_at is null
where p.kind='research_report' and p.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and p.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_edge e
    where e.parent_definition_id=p.id and e.field_name='sections'
      and e.child_definition_id=c.id and e.deleted_at is null);

insert into content_ir.kind_edge (parent_definition_id, field_name, child_definition_id, position, organization_id)
select p.id, 'convergentThemes', c.id, 0, p.organization_id
from content_ir.kind_definition p
join content_ir.kind_definition c
  on c.kind='research_theme' and c.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and c.deleted_at is null
where p.kind='research_report' and p.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and p.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_edge e
    where e.parent_definition_id=p.id and e.field_name='convergentThemes'
      and e.child_definition_id=c.id and e.deleted_at is null);

insert into content_ir.kind_edge (parent_definition_id, field_name, child_definition_id, position, organization_id)
select p.id, 'challenges', c.id, 0, p.organization_id
from content_ir.kind_definition p
join content_ir.kind_definition c
  on c.kind='research_challenge' and c.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and c.deleted_at is null
where p.kind='research_report' and p.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and p.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_edge e
    where e.parent_definition_id=p.id and e.field_name='challenges'
      and e.child_definition_id=c.id and e.deleted_at is null);

insert into content_ir.kind_edge (parent_definition_id, field_name, child_definition_id, position, organization_id)
select p.id, 'recommendations', c.id, 0, p.organization_id
from content_ir.kind_definition p
join content_ir.kind_definition c
  on c.kind='research_recommendation' and c.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and c.deleted_at is null
where p.kind='research_report' and p.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and p.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_edge e
    where e.parent_definition_id=p.id and e.field_name='recommendations'
      and e.child_definition_id=c.id and e.deleted_at is null);

insert into content_ir.kind_edge (parent_definition_id, field_name, child_definition_id, position, organization_id)
select p.id, 'findings', c.id, 0, p.organization_id
from content_ir.kind_definition p
join content_ir.kind_definition c
  on c.kind='research_finding' and c.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and c.deleted_at is null
where p.kind='research_section' and p.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and p.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_edge e
    where e.parent_definition_id=p.id and e.field_name='findings'
      and e.child_definition_id=c.id and e.deleted_at is null);

-- ---------------------------------------------------------------------------
-- 3. kind_example rows — the FULL canonical example populates the
--    Analysis/Recommendations tab fields the XML parser can never produce.
--    Both validated for real before 'passed' was written here.
-- ---------------------------------------------------------------------------
insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version,
  $mtx${"__kind":"research_report","title":"Grid-Scale Energy Storage: State of the Field 2026","overview":"A synthesis of recent research on grid-scale energy storage technologies, spanning lithium-ion alternatives, flow batteries, and long-duration storage economics.","researchScope":"Grid-scale stationary storage, 2023-2026 literature","keyFocusAreas":"Battery chemistry, storage economics, grid integration","analysisPeriod":"2023-2026","executiveSummary":"Storage costs continue to fall while duration requirements rise. Iron-air and sodium-ion chemistries moved from lab to pilot deployment, and long-duration economics now hinge on capacity-market reform more than on cell cost.","introduction":"As renewable penetration passes 40 percent in leading grids, storage shifts from arbitrage asset to reliability backbone. This report reviews what the recent literature establishes, where evidence conflicts, and what remains open.","researchQuestions":["Which post-lithium chemistries are closest to bankable grid deployment?","How do long-duration storage economics change under high renewable penetration?","What regulatory changes most affect storage revenue stacking?"],"sections":[{"__kind":"research_section","title":"Key Research and Discoveries","subtitle":"Chemistry and deployment findings","findings":[{"__kind":"research_finding","title":"Iron-air pilots reached grid interconnection","primarySource":"Journal of Power Sources (2025)","additionalSources":["DOE Storage Futures Study","BNEF 2026 outlook"],"urls":["https://example.com/iron-air-pilot"],"keyDetails":"Three iron-air installations totaling 45 MW cleared interconnection and delivered 100-hour discharge in field conditions, at a reported cost of 20 USD per kWh of capacity.","significance":"First field evidence that multi-day storage can undercut gas peakers on capacity cost.","futureImplications":"If round-trip efficiency improves past 50 percent, iron-air becomes the default multi-day asset in high-wind grids.","confidenceLevel":"HIGH"},{"__kind":"research_finding","title":"Sodium-ion supply chains localized faster than forecast","primarySource":"Nature Energy (2026)","additionalSources":[],"urls":[],"keyDetails":"Sodium-ion cell production outside China tripled year over year, driven by cathode plants co-located with soda-ash production.","significance":"Reduces geopolitical concentration risk that constrained lithium-ion procurement.","futureImplications":"Expect sodium-ion to take the 2-6 hour duration segment on cost by 2028.","confidenceLevel":"MEDIUM"}]}],"convergentThemes":[{"__kind":"research_theme","theme":"Duration is the new cost axis","description":"Across chemistries, papers converge on duration-adjusted cost (USD per kWh-cycle) replacing raw capex as the deciding metric."},{"__kind":"research_theme","theme":"Market design lags technology","description":"Multiple studies find capacity markets undervalue storage longer than 4 hours, independent of chemistry."}],"conflictingEvidence":{"disagreement":"Whether lithium-ion cost declines will outpace alternative chemistries through 2030.","perspectives":"Techno-economic models project continued 8 percent annual declines; supply-chain analyses argue raw-material floors arrive by 2028.","resolution":"Most recent reviews treat the 4-hour segment as lithium-locked while conceding everything longer to alternatives."},"shortTermOutlook":["Sodium-ion enters commercial 2-6 hour deployments","First bankable 100-hour iron-air contracts signed"],"mediumTermOutlook":["Capacity-market reforms price duration explicitly","Hybrid plants pairing storage chemistries become standard"],"longTermVision":["Seasonal storage economics close for high-latitude grids"],"challenges":[{"__kind":"research_challenge","title":"Round-trip efficiency of metal-air systems","description":"Iron-air round-trip efficiency remains below 45 percent, limiting use to low-cycle applications.","currentSolutions":"Electrolyte additives and electrode texturing pilots.","researchGaps":"No published pathway past 55 percent at system scale.","category":"technical"},{"__kind":"research_challenge","title":"Interconnection queue backlogs","description":"Storage projects wait a median of 3.5 years for interconnection studies in US markets.","category":"regulatory"}],"recommendations":[{"__kind":"research_recommendation","recommendation":"Prioritize round-trip efficiency research for metal-air chemistries over further capex reduction.","target":"researchers"},{"__kind":"research_recommendation","recommendation":"Contract multi-chemistry portfolios rather than betting a single storage duration segment.","target":"industry"},{"__kind":"research_recommendation","recommendation":"Reform capacity accreditation to value duration beyond 4 hours explicitly.","target":"policymakers"},{"__kind":"research_recommendation","recommendation":"Expect grid electricity reliability economics to shift visibly by 2028.","target":"general"}],"conclusion":"The storage field has moved from a single-chemistry cost race to a duration-segmented market. Research attention is shifting accordingly, from cell chemistry to system economics and market design.","keyTakeaways":["Duration-adjusted cost is the deciding metric, not raw capex.","Iron-air and sodium-ion are field-proven, not speculative.","Market design is now the binding constraint, not technology."],"methodology":{"searchStrategy":"Systematic search of peer-reviewed energy journals plus grid-operator technical reports, 2023-2026.","selectionCriteria":"Field data or validated techno-economic models; lab-only results excluded.","analysisFramework":"Duration-segmented comparison with confidence grading per finding."},"sourceQuality":{"peerReviewed":24,"industryReports":11,"expertInterviews":4,"governmentPubs":7},"limitations":["Chinese-language deployment data underrepresented.","Cost figures self-reported by vendors for pilot projects."],"metadata":{"researchDate":"2026-06-30","lastUpdated":"2026-07-06","confidenceRating":"Medium-high overall","biasAssessment":"Vendor-reported costs may skew optimistic"}}$mtx$::jsonb,
  'Canonical example — full report',
  'Populates convergentThemes, conflictingEvidence, outlooks, challenges, recommendations, limitations, sourceQuality, and metadata — the Analysis/Recommendations tab fields the legacy <research> XML parser never fills.',
  'authored', true, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.kind='research_report' and kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_example e where e.kind_definition_id=kd.id and e.is_canonical and e.deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version,
  $mtx${"__kind":"research_report","title":"TypeScript Adoption in Enterprise Frontends","overview":"A short review of published migration case studies from JavaScript to TypeScript in large codebases.","introduction":"This mini-report summarizes what published case studies establish about enterprise TypeScript migrations.","researchQuestions":["What defect-rate changes do enterprise TypeScript migrations report?"],"sections":[{"__kind":"research_section","title":"Key Research Findings","findings":[{"__kind":"research_finding","title":"Migrations report double-digit defect reduction","primarySource":"ICSE industry track (2024)","keyDetails":"Across six published case studies, teams reported 15-38 percent fewer production type errors within a year of completing migration.","significance":"Consistent direction of effect across independent organizations.","confidenceLevel":"MEDIUM"}]}],"conclusion":"Published evidence, while self-selected, consistently associates TypeScript adoption with fewer production type errors.","keyTakeaways":["Effect direction is consistent; effect size varies widely."]}$mtx$::jsonb,
  'Minimal example',
  'Overview + one findings section — the floor an agent may emit; Analysis/Recommendations tabs legitimately empty.',
  'authored', false, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.kind='research_report' and kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_example e where e.kind_definition_id=kd.id and e.label='Minimal example' and e.deleted_at is null);

-- ---------------------------------------------------------------------------
-- 4. kind_surface: <research> xml_tag -> research_report via the named
--    strategy 'research_legacy_text' (features/content-ir/surfaces/).
--    INACTIVE until integration registers the strategy in xml-finalize.ts —
--    an active row naming an unimplemented strategy would console.error on
--    every live <research> region (loud fail-open). Activation is one UPDATE
--    in the integration change.
-- ---------------------------------------------------------------------------
insert into content_ir.kind_surface (kind_definition_id, surface_type, token, parser_strategy, parser_config, streaming, is_active, organization_id)
select kd.id, 'xml_tag', 'research', 'research_legacy_text', '{}'::jsonb, true, false, kd.organization_id
from content_ir.kind_definition kd
where kd.kind='research_report' and kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_surface s where s.surface_type='xml_tag' and s.token='research' and s.deleted_at is null);

-- ---------------------------------------------------------------------------
-- 5. kind_component: research_report / web / output -> component_key
--    'research' (the legacyBlockType contract key; config carries the hint).
-- ---------------------------------------------------------------------------
insert into content_ir.kind_component (kind_definition_id, platform, role, component_key, source, config, organization_id)
select kd.id, 'web', 'output', 'research', 'bundled', '{"legacyBlockType":"research"}'::jsonb, kd.organization_id
from content_ir.kind_definition kd
where kd.kind='research_report' and kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_component c where c.kind_definition_id=kd.id and c.platform='web' and c.role='output' and c.deleted_at is null);

-- ---------------------------------------------------------------------------
-- 6. The render-block skill (JSON syntax; R9 naming kind_<slug>). Teaches the
--    fields the XML surface can't reach. Columns verified against the LIVE
--    skill.definition (post-reorg: no is_public / user_id; semver carries the
--    version string). Business-key guarded on skill_id.
-- ---------------------------------------------------------------------------
insert into skill.definition
  (skill_id, label, description, skill_type, body, icon_name,
   platform_targets, semver, category_id, is_system, is_active,
   visibility, organization_id, project_id, task_id, sort_order, metadata)
select
  'kind_research_report',
  'Research Report',
  'How and when to emit a research_report render block: the __kind JSON shape, nested section/finding/theme/challenge/recommendation children, the enum rules (confidenceLevel, recommendation.target) that prevent silently dropped content, and the Analysis/Recommendations tab fields only JSON (never the legacy <research> markdown) can populate.',
  'render_block',
  $BODY$# Research Report

You can present research as a live, interactive research report by emitting a
single JSON object carrying `"__kind": "research_report"`. It renders
immediately as a tabbed research block — Overview, Findings (with per-finding
confidence badges, a confidence filter, and source links), Analysis
(convergent themes, conflicting evidence, short/medium/long-term outlook),
and Recommendations (grouped by audience, with challenges and study
limitations) — and persists as a versioned artifact the user can open on
canvas, print, edit, or hand to another agent.

Prefer this block whenever you synthesize multiple sources into findings —
literature reviews, market research, competitive analysis, technology
assessments, due-diligence summaries. It is far more useful than the same
material as prose.

## JSON is the only syntax that fills every tab

This block also has a legacy `<research>` XML/markdown surface. That surface
can only carry the Overview and Findings material — the markdown parser has
no grammar for convergent themes, outlooks, challenges, recommendations,
limitations, source-quality counts, or per-finding confidence and URLs, so on
the XML path the Analysis and Recommendations tabs render empty. Emitting
`__kind` JSON is what lights up the whole component. If you have analysis or
recommendations to share, JSON is not optional.

## How to emit it

Emit ONE JSON object with `"__kind": "research_report"`. The system
recognizes it live, fenced or unfenced; a ```json fence is fine for clarity.
One report per JSON object. Never wrap it in `<artifact>` tags — the JSON
object IS the artifact.

## When to use it

| User intent | Do this |
|---|---|
| "Research X" / "what does the literature say about X" | A research_report with findings + analysis |
| Compare evidence across sources, flag agreement/conflict | Populate `convergentThemes` and `conflictingEvidence` |
| "What should we do about X" after research | Populate `recommendations` per audience |
| Quick single-question lookup with one source | Plain prose — this block is for multi-source synthesis |

## The `__kind` + field structure

**research_report** (the root object):

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Must be exactly `"research_report"`. |
| `title` | string | yes | Report title. |
| `sections` | array | yes | One or more `research_section` objects (may not be omitted). |
| `overview` | string | no | Lead paragraph under the title. |
| `researchScope` | string | no | Header chip: what was covered. |
| `keyFocusAreas` | string | no | Header chip: focus areas. |
| `analysisPeriod` | string | no | Header chip: time window analyzed. |
| `executiveSummary` | string | no | Overview tab card. |
| `introduction` | string | no | Overview tab card. |
| `researchQuestions` | string[] | no | Numbered list in the Overview tab. |
| `convergentThemes` | array | no | `research_theme` objects — Analysis tab. |
| `conflictingEvidence` | object | no | `{ "disagreement", "perspectives", "resolution" }` (strings) — Analysis tab. |
| `shortTermOutlook` | string[] | no | Analysis tab, 1-2 year outlook. |
| `mediumTermOutlook` | string[] | no | Analysis tab, 3-5 year outlook. |
| `longTermVision` | string[] | no | Analysis tab, 5+ year outlook. |
| `challenges` | array | no | `research_challenge` objects — Recommendations tab. |
| `recommendations` | array | no | `research_recommendation` objects — Recommendations tab. |
| `limitations` | string[] | no | Study limitations — Recommendations tab. |
| `conclusion` | string | no | Analysis tab closing card. |
| `keyTakeaways` | string[] | no | Numbered takeaways under the conclusion. |
| `methodology` | object | no | `{ "searchStrategy", "selectionCriteria", "analysisFramework" }` (strings). |
| `sourceQuality` | object | no | `{ "peerReviewed", "industryReports", "expertInterviews", "governmentPubs" }` (numbers). |
| `metadata` | object | no | `{ "researchDate", "lastUpdated", "confidenceRating", "biasAssessment" }` (strings). |

**research_section** (each item in `sections`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Must be exactly `"research_section"`. |
| `title` | string | yes | Section heading in the Findings tab. |
| `findings` | array | yes | One or more `research_finding` objects. |
| `subtitle` | string | no | Small line under the section heading. |

**research_finding** (each item in `findings`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Must be exactly `"research_finding"`. |
| `title` | string | yes | Finding headline. |
| `keyDetails` | string | yes | The substance — what was found. |
| `primarySource` | string | no | Citation text shown next to the confidence badge. |
| `additionalSources` | string[] | no | Further citation texts. |
| `urls` | string[] | no | Rendered as clickable "Source N" links. |
| `significance` | string | no | Why it matters. |
| `futureImplications` | string | no | Where it leads. |
| `confidenceLevel` | string | no | Exactly `"HIGH"`, `"MEDIUM"`, or `"LOW"` (uppercase). Drives the badge and the confidence filter. |

**research_theme** (each item in `convergentThemes`):

| Field | Type | Required |
|---|---|---|
| `__kind` | string | yes — `"research_theme"` |
| `theme` | string | yes |
| `description` | string | yes |

**research_challenge** (each item in `challenges`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | `"research_challenge"` |
| `title` | string | yes | |
| `description` | string | yes | |
| `currentSolutions` | string | no | |
| `researchGaps` | string | no | |
| `category` | string | no | One of `"technical"`, `"ethical"`, `"regulatory"`, `"other"` (lowercase). |

**research_recommendation** (each item in `recommendations`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | `"research_recommendation"` |
| `recommendation` | string | yes | The action to take. |
| `target` | string | no | Exactly one of `"researchers"`, `"industry"`, `"policymakers"`, `"general"` (lowercase). The component GROUPS recommendations by these four audiences. |

## Syntax rules that PREVENT render failures

1. **`recommendation.target` must be one of the four audience strings,
   lowercase.** The component renders recommendations by iterating exactly
   those four groups — any other value is folded to `"general"` (and on the
   legacy path would silently never render). Do not invent audiences.
2. **`confidenceLevel` must be exactly `HIGH`, `MEDIUM`, or `LOW`,
   uppercase.** Anything else is folded to `MEDIUM`, which corrupts the
   user's confidence filter. Omit it rather than guessing.
3. **`title` and `sections` are required on the root; `title` + `findings`
   on every section; `title` + `keyDetails` on every finding.** A findings
   array may be small, but it must exist.
4. **Keep `__kind` on every nested object** — sections, findings, themes,
   challenges, and recommendations each carry their own `__kind`.
5. **Put links in `urls`, citation text in `primarySource` /
   `additionalSources`.** Only `urls` entries become clickable links.
6. **Valid JSON only** — double-quoted keys/strings, no trailing commas, no
   comments, escape quotes inside strings.
7. **Do not emit empty placeholder strings** for optional fields — omit the
   field instead. Empty strings render as blank cards.

## Fill the Analysis and Recommendations tabs

The block's value over prose IS the synthesis. Whenever the material
supports it, populate:

- `convergentThemes` — where independent sources agree (2-4 themes).
- `conflictingEvidence` — the one disagreement worth surfacing, with both
  perspectives and how you resolve them.
- `shortTermOutlook` / `mediumTermOutlook` / `longTermVision` — 2-4 bullets
  each.
- `recommendations` — 3-8 items spread across the four audiences.
- `limitations` — 2-4 honest caveats about the research itself.

A research_report with empty Analysis and Recommendations tabs is a signal
you should have used prose instead.

## Sizing / limits

- 1-4 sections, each with 2-6 findings, is the sweet spot.
- Keep `keyDetails` to 1-3 sentences; depth goes in `significance` and
  `futureImplications`.
- 3-5 items per outlook list; more gets skimmed, not read.

## Editing etiquette

When the user asks you to change a report, return ONE complete updated
`research_report` object — the full block, not a diff:

- Keep `"__kind"` markers on the root and every nested object.
- Preserve findings the user did not ask you to change verbatim, so the
  artifact's identity and their reading position stay stable.
- After editing recommendations, re-check every `target` is one of the four
  audience strings.

## One correct minimal example

```json
{
  "__kind": "research_report",
  "title": "Edge Caching Strategies: Evidence Review",
  "overview": "What published benchmarks establish about CDN edge-caching strategies for dynamic content.",
  "researchQuestions": ["Which invalidation strategy minimizes stale reads?"],
  "sections": [
    {
      "__kind": "research_section",
      "title": "Key Research Findings",
      "findings": [
        {
          "__kind": "research_finding",
          "title": "Event-driven invalidation beats TTL tuning",
          "primarySource": "ACM SoCC 2025 benchmark study",
          "urls": ["https://example.com/socc-2025"],
          "keyDetails": "Across three production traces, event-driven invalidation cut stale reads by 90 percent versus tuned TTLs, at under 2 percent added origin load.",
          "significance": "Removes the staleness/hit-rate trade-off that TTL tuning cannot escape.",
          "confidenceLevel": "HIGH"
        }
      ]
    }
  ],
  "convergentThemes": [
    {
      "__kind": "research_theme",
      "theme": "Invalidation beats expiry",
      "description": "Every benchmark reviewed favors explicit invalidation over TTL expiry for dynamic content."
    }
  ],
  "shortTermOutlook": ["CDN vendors ship native event-driven invalidation APIs"],
  "recommendations": [
    {
      "__kind": "research_recommendation",
      "recommendation": "Adopt event-driven invalidation for dynamic routes before further TTL tuning.",
      "target": "industry"
    }
  ],
  "conclusion": "Evidence consistently favors event-driven invalidation for dynamic content.",
  "keyTakeaways": ["Invalidate on write; reserve TTLs for static assets."]
}
```$BODY$,
  'BookOpen',
  '["web"]'::jsonb,
  '1.0.0',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',
  true, true,
  'public',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  null, null,
  0,
  '{"kind":"research_report","syntax":"json"}'::jsonb
where not exists (
  select 1 from skill.definition
  where skill_id = 'kind_research_report' and deleted_at is null);

-- ---------------------------------------------------------------------------
-- 7. Content blocks (Agent Skills category) — simple + full. WHERE NOT EXISTS
--    only: never clobbers an existing block.
-- ---------------------------------------------------------------------------
insert into public.content_blocks
  (block_id, label, description, icon_name, template, sort_order, is_active,
   category_id, organization_id, version, metadata)
select
  'kind-research-report-simple',
  'Research Report',
  'An interactive, tabbed research report with findings and sources',
  'BookOpen',
  $CB$When you synthesize research from multiple sources, emit an interactive research report as a single JSON object with "__kind":"research_report":

```json
{ "__kind": "research_report", "title": "Edge Caching: Evidence Review", "overview": "What benchmarks establish about edge caching.", "sections": [
  { "__kind": "research_section", "title": "Key Research Findings", "findings": [
    { "__kind": "research_finding", "title": "Event-driven invalidation beats TTL tuning", "primarySource": "ACM SoCC 2025", "urls": ["https://example.com/study"], "keyDetails": "Stale reads dropped 90 percent versus tuned TTLs.", "confidenceLevel": "HIGH" }
  ] }
] }
```

Rules: root needs `title` + `sections`; each section needs `title` + `findings`; each finding needs `title` + `keyDetails`; every nested object keeps its own `__kind`. `confidenceLevel` is exactly HIGH, MEDIUM, or LOW (uppercase). Links go in `urls` (they render as clickable sources); citation text goes in `primarySource`. Valid JSON, no trailing commas.$CB$,
  30, true,
  '2c324058-95e9-4b7e-a991-884f4443eb6e',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  1,
  '{"skill_id":"kind_research_report"}'::jsonb
where not exists (select 1 from public.content_blocks where block_id = 'kind-research-report-simple');

insert into public.content_blocks
  (block_id, label, description, icon_name, template, sort_order, is_active,
   category_id, organization_id, version, metadata)
select
  'kind-research-report-full',
  'Research Report (Full Analysis)',
  'A research report with themes, outlooks, recommendations, and limitations',
  'BookOpen',
  $CB$For full research syntheses, emit a research_report JSON block and FILL THE ANALYSIS AND RECOMMENDATIONS TABS — they are the block's value over prose, and only JSON (never the legacy `<research>` markdown) can populate them:

```json
{ "__kind": "research_report", "title": "Grid Storage: State of the Field", "sections": [
  { "__kind": "research_section", "title": "Key Findings", "findings": [
    { "__kind": "research_finding", "title": "Iron-air reached grid pilots", "primarySource": "J. Power Sources 2025", "urls": ["https://example.com/pilot"], "keyDetails": "45 MW delivered 100-hour discharge in the field.", "significance": "First field proof of multi-day storage economics.", "futureImplications": "Default multi-day asset if efficiency passes 50 percent.", "confidenceLevel": "HIGH" }
  ] }
],
"convergentThemes": [ { "__kind": "research_theme", "theme": "Duration is the new cost axis", "description": "Sources converge on duration-adjusted cost as the deciding metric." } ],
"shortTermOutlook": ["Sodium-ion enters 2-6 hour deployments"],
"mediumTermOutlook": ["Capacity markets price duration explicitly"],
"recommendations": [ { "__kind": "research_recommendation", "recommendation": "Contract multi-chemistry portfolios.", "target": "industry" } ],
"limitations": ["Vendor-reported pilot costs may skew optimistic"],
"conclusion": "The field moved from a cost race to a duration-segmented market.",
"keyTakeaways": ["Market design, not technology, is the binding constraint."] }
```

Rules: `recommendation.target` is exactly one of "researchers", "industry", "policymakers", "general" (lowercase) — the component groups by these four audiences. `confidenceLevel` is exactly HIGH/MEDIUM/LOW. Root requires `title` + `sections`; keep `__kind` on every nested object. Populate `convergentThemes`, outlooks, `recommendations`, and `limitations` whenever the material supports them; omit optional fields entirely rather than emitting empty strings.$CB$,
  31, true,
  '2c324058-95e9-4b7e-a991-884f4443eb6e',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  1,
  '{"skill_id":"kind_research_report"}'::jsonb
where not exists (select 1 from public.content_blocks where block_id = 'kind-research-report-full');

COMMIT;
