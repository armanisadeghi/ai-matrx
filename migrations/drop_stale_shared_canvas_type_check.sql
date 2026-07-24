-- Published canvas snapshots use the same open-ended type tokens as
-- canvas.canvas_items. A closed CHECK list drifted behind the canonical
-- artifact registry and rejected valid types such as mermaid and math_problem.
ALTER TABLE canvas.shared_canvas_items
  DROP CONSTRAINT IF EXISTS shared_canvas_items_canvas_type_check;
