-- tool_ui_db_renderer_examples_2.sql
--
-- Wave 2 of DB-LOADED tool renderers (see tool_ui_db_renderer_examples.sql for
-- the first set + the full rationale). Same canonical path: agent-authored
-- code in `tool_ui`, compiled at runtime via `compileSlotComponent`, the
-- `(entry, events)` contract. contract_version 2, surface matrx-default/default.
--
-- Adds: a file/code viewer (fs_read, pairs with fs_list), a SHAPE-TOLERANT
-- data card (data — renders a table for `{rows}` or a record card for
-- `{record, resource_type}`), and two list cards that complete the travel
-- family alongside the weather renderer (restaurants, events).
--
-- Idempotent: ON CONFLICT (tool_name, surface_name) DO UPDATE.

-- ── fs_read — file / code viewer ────────────────────────────────────────────
insert into tool_ui (
  tool_name, display_name, results_label, inline_code, allowed_imports,
  keep_expanded_on_stream, language, is_active, semver, version,
  contract_version, surface_name, notes
) values (
  'fs_read', 'File', 'content',
  $renderer$
import { FileText, AlertTriangle } from "lucide-react";

export default function FsReadRenderer({ entry }) {
  function asObj(x) {
    if (x && typeof x === "object") return x;
    if (typeof x === "string") { try { return JSON.parse(x); } catch (e) { return {}; } }
    return {};
  }
  function fmtSize(n) {
    if (typeof n !== "number") return "";
    if (n < 1024) return n + " B";
    if (n < 1048576) return Math.round(n / 1024) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }
  const out = asObj(entry && entry.result);
  const args = asObj(entry && entry.arguments);
  const path = out.path || args.path || "";
  const content = typeof out.content === "string" ? out.content : "";
  const size = typeof out.size === "number" ? out.size : null;
  const truncated = out.truncated === true;
  const name = path ? path.split("/").pop() : "file";
  const lines = content ? content.split("\n").length : 0;
  const running = entry && entry.status !== "completed" && entry.status !== "error";

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-2.5 py-1.5">
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-xs text-foreground">{name}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{size !== null ? fmtSize(size) : ""}{lines ? " · " + lines + " lines" : ""}</span>
      </div>
      {running ? (
        <div className="px-2.5 py-2 text-xs text-muted-foreground">Reading…</div>
      ) : content ? (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words px-2.5 py-2 font-mono text-xs leading-relaxed text-foreground">{content}</pre>
      ) : (
        <div className="px-2.5 py-2 text-xs text-muted-foreground">Empty file.</div>
      )}
      {truncated ? (
        <div className="flex items-center gap-1 border-t border-border/60 px-2.5 py-1 text-[10px] text-muted-foreground"><AlertTriangle className="h-3 w-3" />truncated</div>
      ) : path ? (
        <div className="truncate border-t border-border/60 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">{path}</div>
      ) : null}
    </div>
  );
}
$renderer$,
  array['react','lucide-react'], false, 'tsx', true, '1.0.0', 1, 2,
  'matrx-default/default', 'DB-renderer example (file/code viewer).'
)
on conflict (tool_name, surface_name) do update set
  inline_code = excluded.inline_code, allowed_imports = excluded.allowed_imports,
  display_name = excluded.display_name, results_label = excluded.results_label,
  contract_version = excluded.contract_version, is_active = true,
  notes = excluded.notes, updated_at = now();

-- ── data — SHAPE-TOLERANT (table for {rows}, record card for {record}) ──────
insert into tool_ui (
  tool_name, display_name, results_label, inline_code, allowed_imports,
  keep_expanded_on_stream, language, is_active, semver, version,
  contract_version, surface_name, notes
) values (
  'data', 'Data', 'data',
  $renderer$
import { Database, Rows3, FileBox } from "lucide-react";

export default function DataRenderer({ entry }) {
  function asObj(x) {
    if (x && typeof x === "object") return x;
    if (typeof x === "string") { try { return JSON.parse(x); } catch (e) { return {}; } }
    return {};
  }
  const out = asObj(entry && entry.result);
  const rows = Array.isArray(out.rows) ? out.rows : null;
  const record = out.record && typeof out.record === "object" ? out.record : null;
  const resourceType = out.resource_type || null;

  if (rows) {
    const cols = rows.length ? Object.keys(rows[0]).slice(0, 4) : [];
    const shown = rows.slice(0, 6);
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Rows3 className="h-3.5 w-3.5" /><span>{rows.length} rows</span></div>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border bg-muted/40">{cols.map((c) => (<th key={c} className="px-2 py-1 text-left font-medium text-muted-foreground">{c}</th>))}</tr></thead>
            <tbody>{shown.map((r, i) => (<tr key={i} className="border-b border-border/40 last:border-b-0">{cols.map((c) => (<td key={c} className="px-2 py-1 text-foreground"><span className="block max-w-[180px] truncate">{String(r[c])}</span></td>))}</tr>))}</tbody>
          </table>
        </div>
        {rows.length > shown.length ? <div className="text-[10px] text-muted-foreground">+{rows.length - shown.length} more</div> : null}
      </div>
    );
  }

  if (record) {
    const skip = { settings: 1, __matrx_apply_key: 1 };
    const fields = Object.keys(record).filter((k) => !skip[k] && typeof record[k] !== "object").slice(0, 8);
    const title = record.name || record.title || record.slug || (resourceType || "Record");
    return (
      <div className="space-y-2 rounded-md border border-border bg-card p-2.5">
        <div className="flex items-center gap-2">
          <FileBox className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium text-foreground">{title}</span>
          {resourceType ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{resourceType}</span> : null}
        </div>
        <div className="space-y-0.5 text-xs">
          {fields.map((k) => (
            <div key={k} className="flex gap-2">
              <span className="w-28 shrink-0 truncate font-mono text-muted-foreground">{k}</span>
              <span className="truncate text-foreground">{String(record[k])}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><Database className="h-4 w-4" />No data.</div>;
}
$renderer$,
  array['react','lucide-react'], false, 'tsx', true, '1.0.0', 1, 2,
  'matrx-default/default', 'DB-renderer example (shape-tolerant: table or record).'
)
on conflict (tool_name, surface_name) do update set
  inline_code = excluded.inline_code, allowed_imports = excluded.allowed_imports,
  display_name = excluded.display_name, results_label = excluded.results_label,
  contract_version = excluded.contract_version, is_active = true,
  notes = excluded.notes, updated_at = now();

-- ── travel_get_restaurants — list card (completes the travel family) ────────
insert into tool_ui (
  tool_name, display_name, results_label, inline_code, allowed_imports,
  keep_expanded_on_stream, language, is_active, semver, version,
  contract_version, surface_name, notes
) values (
  'travel_get_restaurants', 'Restaurants', 'restaurants',
  $renderer$
import { UtensilsCrossed, MapPin } from "lucide-react";

export default function RestaurantsRenderer({ entry }) {
  function asObj(x) {
    if (x && typeof x === "object") return x;
    if (typeof x === "string") { try { return JSON.parse(x); } catch (e) { return {}; } }
    return {};
  }
  const out = asObj(entry && entry.result);
  const city = out.city || "";
  const list = Array.isArray(out.restaurants) ? out.restaurants : [];
  const seen = {};
  const uniq = [];
  for (const r of list) { const k = String(r); if (!seen[k]) { seen[k] = 1; uniq.push(r); } }

  if (entry && entry.status !== "completed" && uniq.length === 0) {
    return <div className="text-sm text-muted-foreground">Finding restaurants…</div>;
  }
  return (
    <div className="space-y-1.5">
      {city ? <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /><span>{city}</span></div> : null}
      <div className="space-y-1">
        {uniq.map((r, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
            <UtensilsCrossed className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-sm text-foreground">{String(r)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
$renderer$,
  array['react','lucide-react'], false, 'tsx', true, '1.0.0', 1, 2,
  'matrx-default/default', 'DB-renderer example (travel family — list card).'
)
on conflict (tool_name, surface_name) do update set
  inline_code = excluded.inline_code, allowed_imports = excluded.allowed_imports,
  display_name = excluded.display_name, results_label = excluded.results_label,
  contract_version = excluded.contract_version, is_active = true,
  notes = excluded.notes, updated_at = now();

-- ── travel_get_events — list card (travel family) ───────────────────────────
insert into tool_ui (
  tool_name, display_name, results_label, inline_code, allowed_imports,
  keep_expanded_on_stream, language, is_active, semver, version,
  contract_version, surface_name, notes
) values (
  'travel_get_events', 'Events', 'events',
  $renderer$
import { CalendarDays, MapPin } from "lucide-react";

export default function EventsRenderer({ entry }) {
  function asObj(x) {
    if (x && typeof x === "object") return x;
    if (typeof x === "string") { try { return JSON.parse(x); } catch (e) { return {}; } }
    return {};
  }
  const out = asObj(entry && entry.result);
  const city = out.city || "";
  const list = Array.isArray(out.events) ? out.events : [];

  if (entry && entry.status !== "completed" && list.length === 0) {
    return <div className="text-sm text-muted-foreground">Finding events…</div>;
  }
  return (
    <div className="space-y-1.5">
      {city ? <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /><span>{city}</span></div> : null}
      <div className="space-y-1">
        {list.map((ev, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
            <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-sm text-foreground">{String(ev)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
$renderer$,
  array['react','lucide-react'], false, 'tsx', true, '1.0.0', 1, 2,
  'matrx-default/default', 'DB-renderer example (travel family — list card).'
)
on conflict (tool_name, surface_name) do update set
  inline_code = excluded.inline_code, allowed_imports = excluded.allowed_imports,
  display_name = excluded.display_name, results_label = excluded.results_label,
  contract_version = excluded.contract_version, is_active = true,
  notes = excluded.notes, updated_at = now();
