-- tool_ui_db_renderer_examples_3.sql
--
-- Wave 3 of DB-LOADED tool renderers — the browser-activity family (the
-- highest-volume tools that still hit GenericRenderer). Same canonical path:
-- agent-authored code in `tool_ui`, runtime-compiled, `(entry, events)`
-- contract, contract_version 2, surface matrx-default/default. Idempotent.
--
-- navigate_active_tab (page nav), tabs (open-tab list), find (AI element
-- matches), click_element (terse action status).

insert into tool_ui (tool_name, display_name, results_label, inline_code, allowed_imports, keep_expanded_on_stream, language, is_active, semver, version, contract_version, surface_name, notes) values
('navigate_active_tab', 'Navigated', 'page',
$renderer$
import { Globe, CheckCircle2 } from "lucide-react";

export default function NavigateRenderer({ entry }) {
  function asObj(x) { if (x && typeof x === "object") return x; if (typeof x === "string") { try { return JSON.parse(x); } catch (e) { return {}; } } return {}; }
  function domainOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u || ""; } }
  const out = asObj(entry && entry.result);
  const args = asObj(entry && entry.arguments);
  const url = out.url || args.url || "";
  const title = out.title || "";
  const status = out.status || "";
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-border bg-card p-2.5">
      <Globe className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{title || domainOf(url)}</div>
        {url ? <div className="truncate text-xs text-muted-foreground">{url}</div> : null}
      </div>
      {status === "complete" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
    </div>
  );
}
$renderer$,
array['react','lucide-react'], false, 'tsx', true, '1.0.0', 1, 2, 'matrx-default/default', 'DB-renderer example (browser nav card).'),
('tabs', 'Tabs', 'tabs',
$renderer$
import { AppWindow, Globe } from "lucide-react";

export default function TabsRenderer({ entry }) {
  function asObj(x) { if (x && typeof x === "object") return x; if (typeof x === "string") { try { return JSON.parse(x); } catch (e) { return {}; } } return {}; }
  function domainOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u || ""; } }
  const out = asObj(entry && entry.result);
  const tabs = Array.isArray(out.tabs) ? out.tabs : [];
  const count = typeof out.count === "number" ? out.count : tabs.length;
  const shown = tabs.slice(0, 8);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><AppWindow className="h-3.5 w-3.5" /><span>{count} {count === 1 ? "tab" : "tabs"}</span></div>
      <div className="space-y-1">
        {shown.map((t, i) => (
          <div key={(t && t.id) || i} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm text-foreground">{t.title || domainOf(t.url)}</span>
            <span className="ml-auto max-w-[120px] shrink-0 truncate text-xs text-muted-foreground">{domainOf(t.url)}</span>
          </div>
        ))}
      </div>
      {count > shown.length ? <div className="text-[10px] text-muted-foreground">+{count - shown.length} more</div> : null}
    </div>
  );
}
$renderer$,
array['react','lucide-react'], false, 'tsx', true, '1.0.0', 1, 2, 'matrx-default/default', 'DB-renderer example (tab list).'),
('find', 'Find', 'matches',
$renderer$
import { Search, Target } from "lucide-react";

export default function FindRenderer({ entry }) {
  function asObj(x) { if (x && typeof x === "object") return x; if (typeof x === "string") { try { return JSON.parse(x); } catch (e) { return {}; } } return {}; }
  const out = asObj(entry && entry.result);
  const args = asObj(entry && entry.arguments);
  const matches = Array.isArray(out.matches) ? out.matches : [];
  const query = args.query || args.q || "";
  if (entry && entry.status !== "completed" && matches.length === 0) {
    return <div className="text-sm text-muted-foreground">Searching the page…</div>;
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Search className="h-3.5 w-3.5" />
        <span>{matches.length} {matches.length === 1 ? "match" : "matches"}{query ? ' for "' + query + '"' : ""}</span>
      </div>
      <div className="space-y-1">
        {matches.slice(0, 6).map((m, i) => (
          <div key={i} className="flex items-start gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
            <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="text-sm text-foreground">ref {String(m.ref)}{typeof m.score === "number" ? " · " + m.score : ""}</div>
              {m.reason ? <div className="truncate text-xs text-muted-foreground">{m.reason}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
$renderer$,
array['react','lucide-react'], false, 'tsx', true, '1.0.0', 1, 2, 'matrx-default/default', 'DB-renderer example (AI element matches).'),
('click_element', 'Click', 'click',
$renderer$
import { MousePointerClick, CheckCircle2, XCircle } from "lucide-react";

export default function ClickRenderer({ entry }) {
  function asObj(x) { if (x && typeof x === "object") return x; if (typeof x === "string") { try { return JSON.parse(x); } catch (e) { return {}; } } return {}; }
  const out = asObj(entry && entry.result);
  const ok = out.ok === true;
  const tag = out.tag || "";
  const text = out.text || "";
  const reason = out.reason || "";
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
      <MousePointerClick className="h-4 w-4 shrink-0 text-primary" />
      <span className="text-sm text-foreground">{ok ? "Clicked" : "Click failed"}</span>
      {tag ? <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{tag}</span> : null}
      {text ? <span className="truncate text-sm text-muted-foreground">{text}</span> : null}
      {ok
        ? <CheckCircle2 className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        : reason
          ? <span className="ml-auto max-w-[160px] truncate text-xs text-destructive">{reason}</span>
          : <XCircle className="ml-auto h-3.5 w-3.5 shrink-0 text-destructive" />}
    </div>
  );
}
$renderer$,
array['react','lucide-react'], false, 'tsx', true, '1.0.0', 1, 2, 'matrx-default/default', 'DB-renderer example (terse action status).')
on conflict (tool_name, surface_name) do update set
  inline_code = excluded.inline_code, allowed_imports = excluded.allowed_imports,
  display_name = excluded.display_name, results_label = excluded.results_label,
  contract_version = excluded.contract_version, is_active = true,
  notes = excluded.notes, updated_at = now();
