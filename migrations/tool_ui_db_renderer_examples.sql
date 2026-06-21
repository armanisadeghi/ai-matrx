-- tool_ui_db_renderer_examples.sql
--
-- Seeds the FIRST set of canonical DB-LOADED tool renderers — agent-written
-- component code stored in `tool_ui`, compiled at runtime through the proven
-- Agent Apps Babel sandbox (`db-renderer/` → `compileSlotComponent`), the
-- `(entry, events)` contract. These are the reference examples for the
-- code-first dynamic path: long-term, most tool renderers live in the DB, not
-- the codebase. Each consumes `entry.result` / `entry.arguments` defensively
-- (string-or-object), uses semantic tokens + Lucide icons (no emoji), and
-- handles the streaming (not-yet-complete) state.
--
-- Idempotent: ON CONFLICT (tool_name, surface_name) DO UPDATE. Re-applying
-- refreshes the code. contract_version 2 = the canonical ToolRendererProps
-- contract (matches the verified `agent_call` row). Surface is the default
-- web surface `matrx-default/default`.
--
-- Range demonstrated: a collection (fs_list), a text/terminal output
-- (shell_execute), a sparse status (memory), and a rich custom visual
-- (travel_get_weather — the "ceiling" of what a DB component can be).

-- ── fs_list — directory listing (folders first, sizes) ──────────────────────
insert into tool_ui (
  tool_name, display_name, results_label, inline_code, allowed_imports,
  keep_expanded_on_stream, language, is_active, semver, version,
  contract_version, surface_name, notes
) values (
  'fs_list', 'Directory', 'entries',
  $renderer$
import { Folder, FileText, ChevronRight, HardDrive } from "lucide-react";

export default function FsListRenderer({ entry }) {
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
  const entries = Array.isArray(out.entries) ? out.entries : [];
  const dirPath = out.path || args.path || "";
  const dirs = entries.filter((e) => e && e.is_dir);
  const files = entries.filter((e) => e && !e.is_dir);
  const sorted = dirs.concat(files);

  if (entry && entry.status !== "completed" && entries.length === 0) {
    return <div className="text-sm text-muted-foreground">Listing {dirPath || "directory"}…</div>;
  }
  if (entries.length === 0) {
    return <div className="text-sm text-muted-foreground">Empty directory.</div>;
  }
  return (
    <div className="space-y-1.5">
      {dirPath ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <HardDrive className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-mono">{dirPath}</span>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-md border border-border">
        {sorted.map((e, i) => (
          <div key={(e && e.path) || i} className="flex items-center gap-2 border-b border-border/40 px-2.5 py-1.5 last:border-b-0 hover:bg-muted/40">
            {e.is_dir
              ? <Folder className="h-4 w-4 shrink-0 text-primary" />
              : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="truncate text-sm text-foreground">{e.name}</span>
            {e.is_dir ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" /> : null}
            <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">{e.is_dir ? "—" : fmtSize(e.size)}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground">{dirs.length} folders · {files.length} files</div>
    </div>
  );
}
$renderer$,
  array['react','lucide-react'], false, 'tsx', true, '1.0.0', 1, 2,
  'matrx-default/default', 'DB-renderer example (collection list).'
)
on conflict (tool_name, surface_name) do update set
  inline_code = excluded.inline_code,
  allowed_imports = excluded.allowed_imports,
  display_name = excluded.display_name,
  results_label = excluded.results_label,
  contract_version = excluded.contract_version,
  is_active = true,
  notes = excluded.notes,
  updated_at = now();

-- ── shell_execute — terminal output (command · stdout · exit) ───────────────
insert into tool_ui (
  tool_name, display_name, results_label, inline_code, allowed_imports,
  keep_expanded_on_stream, language, is_active, semver, version,
  contract_version, surface_name, notes
) values (
  'shell_execute', 'Shell', 'output',
  $renderer$
import { Terminal, CheckCircle2, XCircle } from "lucide-react";

export default function ShellRenderer({ entry }) {
  function asObj(x) {
    if (x && typeof x === "object") return x;
    if (typeof x === "string") { try { return JSON.parse(x); } catch (e) { return {}; } }
    return {};
  }
  const out = asObj(entry && entry.result);
  const args = asObj(entry && entry.arguments);
  const command = args.command || "";
  const stdout = typeof out.stdout === "string" ? out.stdout : "";
  const stderr = typeof out.stderr === "string" ? out.stderr : "";
  const exit = typeof out.exit_code === "number" ? out.exit_code : null;
  const cwd = out.cwd || "";
  const ok = exit === 0 || (exit === null && !stderr);
  const running = entry && entry.status !== "completed" && entry.status !== "error";

  return (
    <div className="overflow-hidden rounded-md border border-border bg-muted/40">
      <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
        <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-xs text-foreground">{command || "shell"}</span>
        {!running && exit !== null ? (
          ok
            ? <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" />exit {exit}</span>
            : <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-destructive"><XCircle className="h-3.5 w-3.5" />exit {exit}</span>
        ) : null}
      </div>
      {running ? (
        <div className="px-2.5 py-2 text-xs text-muted-foreground">Running…</div>
      ) : (
        <div className="max-h-72 overflow-auto px-2.5 py-2">
          {stdout ? <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">{stdout}</pre> : null}
          {stderr ? <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-destructive">{stderr}</pre> : null}
          {!stdout && !stderr ? <span className="text-xs text-muted-foreground">No output.</span> : null}
        </div>
      )}
      {cwd ? <div className="border-t border-border/60 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">{cwd}</div> : null}
    </div>
  );
}
$renderer$,
  array['react','lucide-react'], false, 'tsx', true, '1.0.0', 1, 2,
  'matrx-default/default', 'DB-renderer example (terminal output).'
)
on conflict (tool_name, surface_name) do update set
  inline_code = excluded.inline_code,
  allowed_imports = excluded.allowed_imports,
  display_name = excluded.display_name,
  results_label = excluded.results_label,
  contract_version = excluded.contract_version,
  is_active = true,
  notes = excluded.notes,
  updated_at = now();

-- ── memory — sparse write/recall status ─────────────────────────────────────
insert into tool_ui (
  tool_name, display_name, results_label, inline_code, allowed_imports,
  keep_expanded_on_stream, language, is_active, semver, version,
  contract_version, surface_name, notes
) values (
  'memory', 'Memory', 'memory',
  $renderer$
import { Brain, KeyRound } from "lucide-react";

export default function MemoryRenderer({ entry }) {
  function asObj(x) {
    if (x && typeof x === "object") return x;
    if (typeof x === "string") { try { return JSON.parse(x); } catch (e) { return {}; } }
    return {};
  }
  function clamp01(n) { return Math.max(0, Math.min(1, n)); }
  const out = asObj(entry && entry.result);
  const args = asObj(entry && entry.arguments);
  const key = out.key || args.key || "memory";
  const type = out.type || null;
  const action = args.action || (out.stored ? "store" : null);
  const content = typeof args.content === "string" ? args.content : null;
  const importance = typeof args.importance === "number" ? args.importance : null;
  const verb = action === "store" ? "Stored" : action === "retrieve" ? "Recalled" : action === "delete" ? "Deleted" : "Memory";

  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Brain className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-sm font-medium text-foreground">{verb}</span>
        <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"><KeyRound className="h-3 w-3" />{key}</span>
        {type ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{type === "long" ? "long-term" : type === "short" ? "short-term" : type}</span> : null}
      </div>
      {content ? <div className="rounded bg-muted/50 p-2 text-sm text-foreground">{content}</div> : null}
      {importance !== null ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">importance</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: Math.round(clamp01(importance) * 100) + "%" }} />
          </div>
          <span className="font-mono text-xs text-muted-foreground">{importance.toFixed(2)}</span>
        </div>
      ) : null}
    </div>
  );
}
$renderer$,
  array['react','lucide-react'], false, 'tsx', true, '1.0.0', 1, 2,
  'matrx-default/default', 'DB-renderer example (sparse status card).'
)
on conflict (tool_name, surface_name) do update set
  inline_code = excluded.inline_code,
  allowed_imports = excluded.allowed_imports,
  display_name = excluded.display_name,
  results_label = excluded.results_label,
  contract_version = excluded.contract_version,
  is_active = true,
  notes = excluded.notes,
  updated_at = now();

-- ── travel_get_weather — rich custom visual (the "ceiling" demo) ────────────
insert into tool_ui (
  tool_name, display_name, results_label, inline_code, allowed_imports,
  keep_expanded_on_stream, language, is_active, semver, version,
  contract_version, surface_name, notes
) values (
  'travel_get_weather', 'Weather', 'weather',
  $renderer$
import { Wind, Sun, Cloud, CloudRain, CloudSnow } from "lucide-react";

export default function WeatherRenderer({ entry }) {
  function asObj(x) {
    if (x && typeof x === "object") return x;
    if (typeof x === "string") { try { return JSON.parse(x); } catch (e) { return {}; } }
    return {};
  }
  const out = asObj(entry && entry.result);
  const city = out.city || "";
  const condition = String(out.condition || "").toLowerCase();
  const temp = typeof out.temperature === "number" ? out.temperature : null;
  const unit = out.unit === "celsius" ? "°C" : "°F";

  let Icon = Sun;
  if (condition.indexOf("rain") >= 0) Icon = CloudRain;
  else if (condition.indexOf("snow") >= 0) Icon = CloudSnow;
  else if (condition.indexOf("wind") >= 0) Icon = Wind;
  else if (condition.indexOf("cloud") >= 0 || condition.indexOf("overcast") >= 0) Icon = Cloud;

  if (entry && entry.status !== "completed" && temp === null) {
    return <div className="text-sm text-muted-foreground">Checking the weather…</div>;
  }
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-gradient-to-br from-primary/5 to-transparent p-3">
      <Icon className="h-10 w-10 shrink-0 text-primary" />
      <div className="min-w-0">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-semibold tabular-nums text-foreground">{temp !== null ? temp : "—"}</span>
          <span className="text-lg text-muted-foreground">{unit}</span>
        </div>
        <div className="truncate text-sm text-foreground">{city}</div>
        {condition ? <div className="truncate text-xs capitalize text-muted-foreground">{condition}</div> : null}
      </div>
    </div>
  );
}
$renderer$,
  array['react','lucide-react'], false, 'tsx', true, '1.0.0', 1, 2,
  'matrx-default/default', 'DB-renderer example (rich custom visual).'
)
on conflict (tool_name, surface_name) do update set
  inline_code = excluded.inline_code,
  allowed_imports = excluded.allowed_imports,
  display_name = excluded.display_name,
  results_label = excluded.results_label,
  contract_version = excluded.contract_version,
  is_active = true,
  notes = excluded.notes,
  updated_at = now();
