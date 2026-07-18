-- content_ir_db_source_demo_components.sql
--
-- K1 proof seed (2026-07-17): the FIRST two `source='db'` kind_component
-- rows — user-authored component bodies rendered by the new
-- `db_kind_component` route (features/content-ir/react/db-component/):
--
--   1. `stats`  → REACT flavor: TSX compiled in-page by the shared allowlist
--      compiler, with a props_transform demonstrating the transform seam.
--   2. `diff`   → HTML flavor (`config.flavor='html'`): a full HTML document
--      rendered in a sandboxed iframe (allow-scripts, NO allow-same-origin),
--      reading the kind value from the injected #matrx-kind-data JSON slot.
--
-- Safety: both kinds are 2026-07-17 candidate registrations with NO
-- kind_surface rows and NO aidream BLOCK_KIND_MAP membership — nothing in
-- production emits `__ir` envelopes for them, so no existing rendering is
-- demoted. A bare `__kind:"stats"|"diff"` JSON arrival (previously the R6
-- generic viewer) now renders through the registered component — the
-- resolver working as designed, strictly additive. is_default=false.
--
-- Data-only; idempotent (keyed on component_key per kind).

do $$
declare
  v_org uuid := '39c38960-d30c-4840-b0c1-c9960de95582'; -- system org
  v_stats uuid;
  v_diff uuid;
begin
  select id into v_stats from content_ir.kind_definition
    where kind = 'stats' and deleted_at is null;
  select id into v_diff from content_ir.kind_definition
    where kind = 'diff' and deleted_at is null;

  if v_stats is null or v_diff is null then
    raise exception 'content_ir_db_source_demo_components: stats/diff kind_definition missing — candidate registration must run first';
  end if;

  -- 1. stats → react flavor -------------------------------------------------
  if not exists (
    select 1 from content_ir.kind_component
    where kind_definition_id = v_stats and component_key = 'stats_db_demo'
      and deleted_at is null
  ) then
    insert into content_ir.kind_component
      (kind_definition_id, organization_id, platform, role, component_key,
       source, is_active, is_default, sort_order, config,
       component_source, props_transform, metadata)
    values
      (v_stats, v_org, 'web', 'output', 'stats_db_demo',
       'db', true, false, 100, '{}'::jsonb,
$src$export default function StatsDbDemo({ data, kind, config }) {
  const stats = Array.isArray(data.stats) ? data.stats : [];
  const trendTone = (t) =>
    t === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : t === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";
  return (
    <Card className="my-3" data-db-kind-demo={kind}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-primary" />
          {data.title || "Stats"}
          <Badge variant="outline" className="ml-auto">DB component</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {stats.map((s, i) => (
            <div key={i} className="rounded-md border border-border bg-muted/40 p-2.5">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-lg font-semibold text-foreground">{s.value}</div>
              {s.change ? (
                <div className={cn("text-xs font-medium", trendTone(s.trend))}>
                  {s.change}
                </div>
              ) : null}
              {s.hint ? (
                <div className="text-[10px] text-muted-foreground">{s.hint}</div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          {String(data.statCount)} metrics
        </div>
      </CardContent>
    </Card>
  );
}$src$,
$tf$export default function transform(data) {
  const stats = Array.isArray(data && data.stats) ? data.stats : [];
  return { ...data, statCount: stats.length };
}$tf$,
       '{"note": "K1 demo — first source=db react-flavor kind component"}'::jsonb);
  end if;

  -- 2. diff → html flavor ---------------------------------------------------
  if not exists (
    select 1 from content_ir.kind_component
    where kind_definition_id = v_diff and component_key = 'diff_db_demo'
      and deleted_at is null
  ) then
    insert into content_ir.kind_component
      (kind_definition_id, organization_id, platform, role, component_key,
       source, is_active, is_default, sort_order, config,
       component_source, metadata)
    values
      (v_diff, v_org, 'web', 'output', 'diff_db_demo',
       'db', true, false, 100, '{"flavor": "html"}'::jsonb,
$html$<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 12px; background: transparent; color: #111; }
  @media (prefers-color-scheme: dark) { body { color: #eee; } .panel { background: #1c1c1e !important; border-color: #333 !important; } }
  h3 { margin: 0 0 8px; font-size: 14px; }
  .cols { display: flex; gap: 8px; }
  .panel { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 8px; font-size: 13px; background: #fafafa; }
  .old { text-decoration: line-through; opacity: 0.7; }
  .new { font-weight: 600; }
  .tag { display: inline-block; font-size: 10px; border: 1px solid currentColor; border-radius: 4px; padding: 0 4px; margin-left: 6px; opacity: 0.7; }
</style>
</head>
<body>
  <h3 id="title">Diff<span class="tag">DB html component</span></h3>
  <div class="cols">
    <div class="panel"><div style="font-size:10px;opacity:.6">BEFORE</div><div id="old" class="old"></div></div>
    <div class="panel"><div style="font-size:10px;opacity:.6">AFTER</div><div id="new" class="new"></div></div>
  </div>
  <script>
    function renderKindData(payload) {
      var d = (payload && payload.data) || {};
      document.getElementById("title").firstChild.nodeValue = d.title || "Diff";
      document.getElementById("old").textContent = d.old || "";
      document.getElementById("new").textContent = d["new"] || "";
    }
    // Channel 1: injected JSON slot (appended after the document, so read it
    // once parsing completes).
    function readSlot() {
      var slot = document.getElementById("matrx-kind-data");
      if (slot) { try { renderKindData(JSON.parse(slot.textContent)); } catch (e) {} }
    }
    readSlot();
    window.addEventListener("load", readSlot);
    // Channel 2: postMessage from the parent on load.
    window.addEventListener("message", function (ev) {
      if (ev && ev.data && ev.data.type === "matrx:kind-data") renderKindData(ev.data);
    });
  </script>
</body>
</html>$html$,
       '{"note": "K1 demo — first source=db html-flavor kind component"}'::jsonb);
  end if;
end $$;
