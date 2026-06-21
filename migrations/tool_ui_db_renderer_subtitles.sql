-- tool_ui_db_renderer_subtitles.sql
--
-- Demonstrates the author-declared collapsed-line SUBTITLE for DB renderers:
-- `header_subtitle_code` compiles to `(entry, events) => string` and is shown
-- after the label on the collapsed shell line. The shell falls back to the most
-- informative argument when a tool declares none, so this is only needed when a
-- RESULT-derived subtitle beats the arg (e.g. an item/row count).
--
-- Idempotent UPDATE (re-runnable). Scoped to our surface.

update tool_ui set
  header_subtitle_code = $sub$
export default function fsListSubtitle(entry) {
  const r = entry && entry.result;
  const o = r && typeof r === "object" ? r : (typeof r === "string" ? (() => { try { return JSON.parse(r); } catch (e) { return {}; } })() : {});
  const n = Array.isArray(o.entries) ? o.entries.length : 0;
  return n ? n + (n === 1 ? " item" : " items") : "";
}
$sub$,
  updated_at = now()
where tool_name = 'fs_list' and surface_name = 'matrx-default/default';

update tool_ui set
  header_subtitle_code = $sub$
export default function dataSubtitle(entry) {
  const r = entry && entry.result;
  const o = r && typeof r === "object" ? r : (typeof r === "string" ? (() => { try { return JSON.parse(r); } catch (e) { return {}; } })() : {});
  if (Array.isArray(o.rows)) return o.rows.length + (o.rows.length === 1 ? " row" : " rows");
  if (o.record) return o.resource_type || "record";
  return "";
}
$sub$,
  updated_at = now()
where tool_name = 'data' and surface_name = 'matrx-default/default';
