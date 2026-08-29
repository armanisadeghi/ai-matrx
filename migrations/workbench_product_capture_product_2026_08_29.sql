-- Product capture — the DETECTED PRODUCT record: one row per product the
-- Electronics Intake Analyzer finds in an item's photos, carrying the intake
-- analysis and (later) the reconciled resale intelligence report. Written by
-- the intake/research workflows through aidream's data.record.upsert node
-- (RLS-scoped, the run user's access), read by the org's manage/detail
-- surfaces.
--
-- WHY A NEW TABLE (reuse-first): an item is the CAPTURE unit (one physical
-- pass with the camera); a product is the RESALE unit — usually 1:1, but a
-- pallet photo set can hold several distinct products, and every downstream
-- decision (price, verify, list) hangs off the product, not the item.
-- files.files/metadata cannot carry it; platform.flexible_data is the
-- shoehorn anti-pattern; associations are M2M, this is 1:N composition —
-- a component child of product_capture_item, exactly like
-- product_capture_file.
--
-- Applied live via Supabase MCP 2026-08-29 (project brsgrqvjdzwihsvnfqkf);
-- iam.canonical_certify_ok('workbench','product_capture_product',
-- 'product_capture_product') = true at apply time.

do $$
begin
  if to_regclass('workbench.product_capture_product') is null then
    perform platform.create_entity_table(
      p_schema => 'workbench', p_table => 'product_capture_product',
      p_token => 'product_capture_product', p_label => 'Product Capture Product',
      p_fields => array[
        'item_id uuid NOT NULL REFERENCES workbench.product_capture_item(id) ON DELETE CASCADE',
        -- The analyzer's 1-based product_index within the item.
        'product_index integer NOT NULL',
        $f$name text NOT NULL DEFAULT ''$f$,
        $f$category text NOT NULL DEFAULT ''$f$,
        -- analyzed: intake analysis saved; researched: the arbiter's report landed.
        $f$status text NOT NULL DEFAULT 'analyzed' CHECK (status IN ('analyzed','researched'))$f$,
        -- The analyzer's product_entry JSON for THIS product (identifiers with
        -- confidence, condition flags, accessories).
        $f$intake jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        -- The arbiter's resale_intelligence_report JSON; null until researched.
        'research jsonb',
        -- Browsable projections of the report (columns so tables sort/filter).
        'verdict text',
        'realistic_used_range text',
        -- The Product Research child run that produced `research` (when known).
        'research_run_id uuid'
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false,
      p_visibility => 'none', p_category => false, p_listed => false,
      p_org_default => false, p_gin_jsonb => false,
      p_parents => array['product_capture_item:item_id']);
  end if;
end $$;

-- One record per (item, analyzer product index) — the workflow's upsert
-- identity; re-running research updates in place, never duplicates.
create unique index if not exists product_capture_product_item_index_uk
  on workbench.product_capture_product (item_id, product_index);
create index if not exists product_capture_product_item_idx
  on workbench.product_capture_product (item_id, product_index);
-- The org browse: products by status (e.g. everything researched, newest first).
create index if not exists product_capture_product_org_status_idx
  on workbench.product_capture_product (organization_id, status, created_at desc);
