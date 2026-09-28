-- Delete means archive (Arman, 2026-09-27). The last two client deletes the
-- census found on tables without a Trash column: a person's file webhook
-- (Settings -> Webhooks) and a captured photo's link to its product item
-- (retake / remove). Positive add (db-rules §8): no existing row or read changes.
alter table files.webhooks                 add column if not exists deleted_at timestamptz;
alter table workbench.product_capture_file add column if not exists deleted_at timestamptz;

select platform.declare_soft_delete_edge('workbench','product_capture_item','workbench','product_capture_file','item_id','cascade',
  'A captured photo or video link is part of its product item', 'delete-is-archive 2026-09-28', 'product');

update platform.entity_types
   set has_soft_delete = true
 where table_ref in ('files.webhooks', 'workbench.product_capture_file')
   and has_soft_delete = false;
