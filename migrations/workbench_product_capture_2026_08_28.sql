-- Product capture — warehouse-style rapid photo/video/audio capture of
-- physical products ahead of eBay-listing categorization.
--
-- WHY NEW TABLES (reuse-first requires the justification).
--   Considered and rejected:
--     * files.files alone (folder-path-as-item, the media-capture pattern) —
--       an item has fields no file row can carry (SKU/QR code, notes that
--       transcripts append into, downstream status), and org-wide readers
--       need a reliable list of ITEMS, not a per-user folder-tree walk.
--     * platform.flexible_data — machine staging rows in the user-authored
--       kind store is the shoehorn anti-pattern.
--     * platform.associations for item→file — this is 1:N composition
--       (each file row belongs to exactly ONE item and dies with it), not a
--       cross-entity M2M tag; a component child table is the canonical shape
--       (cf. esign envelope components).
--   Bytes are NOT stored here: every photo/video/audio goes through
--   `fileHandler.upload` into files.files (the one byte path). These tables
--   are the item identity + the file linkage only — deliberately minimal,
--   temporary staging before listings move downstream.
--
-- Visibility `internal`: capture is org work — anyone in the warehouse org
-- sees and continues any item (db-rules §6a-1). Not versioned: staging rows,
-- notes autosave continuously; a row_versions entry per keystroke is noise.
--
-- Applied live via Supabase MCP 2026-08-28 (project brsgrqvjdzwihsvnfqkf).

do $$
begin
  if to_regclass('workbench.product_capture_item') is null then
    perform platform.create_entity_table(
      p_schema => 'workbench', p_table => 'product_capture_item',
      p_token => 'product_capture_item', p_label => 'Product Capture Item',
      p_fields => array[
        -- Product number / SKU. From a QR scan or typed; null until assigned.
        'code text',
        $f$code_source text CHECK (code_source IN ('qr','manual'))$f$,
        -- The item's one text area. Audio transcripts append here too.
        $f$notes text NOT NULL DEFAULT ''$f$,
        -- Cloud folder the item's files are filed under (QR code when known
        -- at creation, else the item id). Set once at creation, never renamed.
        $f$folder_path text NOT NULL DEFAULT ''$f$,
        -- Downstream handoff marker: 'captured' until the listing pipeline
        -- consumes the item.
        $f$status text NOT NULL DEFAULT 'captured' CHECK (status IN ('captured','processed'))$f$
      ],
      p_variant => 'entity', p_versioned => false, p_soft_delete => true,
      p_visibility => 'internal', p_category => false, p_listed => false,
      -- Explicit organization_id on every write (no-db-assigned-org doctrine).
      p_org_default => false, p_gin_jsonb => false,
      p_parents => null);
  end if;
end $$;

-- The common reads: "this org's items, newest first" and "find by code".
create index if not exists product_capture_item_org_recent_idx
  on workbench.product_capture_item (organization_id, created_at desc)
  where deleted_at is null;
create index if not exists product_capture_item_code_idx
  on workbench.product_capture_item (organization_id, code)
  where deleted_at is null and code is not null;

do $$
begin
  if to_regclass('workbench.product_capture_file') is null then
    perform platform.create_entity_table(
      p_schema => 'workbench', p_table => 'product_capture_file',
      p_token => 'product_capture_file', p_label => 'Product Capture File',
      p_fields => array[
        'item_id uuid NOT NULL REFERENCES workbench.product_capture_item(id) ON DELETE CASCADE',
        -- The byte identity lives in files.files (uploaded via fileHandler);
        -- this row is only the item→file linkage. Cascade: if the file row
        -- goes, the linkage goes.
        'file_id uuid NOT NULL REFERENCES files.files(id) ON DELETE CASCADE',
        $f$kind text NOT NULL CHECK (kind IN ('photo','video','audio'))$f$
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false,
      p_visibility => 'none', p_category => false, p_listed => false,
      p_org_default => false, p_gin_jsonb => false,
      p_parents => array['product_capture_item:item_id']);
  end if;
end $$;

-- The one read: "files of this item, in capture order". Same file twice on
-- one item is always a double-insert bug.
create unique index if not exists product_capture_file_item_file_uk
  on workbench.product_capture_file (item_id, file_id);
create index if not exists product_capture_file_item_idx
  on workbench.product_capture_file (item_id, created_at);
