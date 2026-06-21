-- tool_ui_db_renderer_examples_4.sql
--
-- Wave 4 of DB-LOADED tool renderers — the page-reading family. Same canonical
-- path (agent-authored-style code in tool_ui, runtime-compiled, (entry,events)
-- contract, contract_version 2, surface matrx-default/default). Idempotent.
--
-- get_active_tab (current tab card), find_text_on_page (text matches),
-- get_page_text (readable article extract).

insert into tool_ui (tool_name, display_name, results_label, inline_code, allowed_imports, keep_expanded_on_stream, language, is_active, semver, version, contract_version, surface_name, notes) values
('get_active_tab', 'Active Tab', 'tab',
$renderer$
import { Globe } from "lucide-react";

export default function ActiveTabRenderer({ entry }) {
  function asObj(x) { if (x && typeof x === "object") return x; if (typeof x === "string") { try { return JSON.parse(x); } catch (e) { return {}; } } return {}; }
  function domainOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u || ""; } }
  const out = asObj(entry && entry.result);
  const url = out.url || "";
  const title = out.title || "";
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-border bg-card p-2.5">
      <Globe className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{title || domainOf(url)}</div>
        {url ? <div className="truncate text-xs text-muted-foreground">{url}</div> : null}
      </div>
      <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">active</span>
    </div>
  );
}
$renderer$,
array['react','lucide-react'], false, 'tsx', true, '1.0.0', 1, 2, 'matrx-default/default', 'DB-renderer example (active-tab card).'),
('find_text_on_page', 'Find Text', 'matches',
$renderer$
import { TextSearch } from "lucide-react";

export default function FindTextRenderer({ entry }) {
  function asObj(x) { if (x && typeof x === "object") return x; if (typeof x === "string") { try { return JSON.parse(x); } catch (e) { return {}; } } return {}; }
  const out = asObj(entry && entry.result);
  const args = asObj(entry && entry.arguments);
  const matches = Array.isArray(out.matches) ? out.matches : [];
  const count = typeof out.count === "number" ? out.count : matches.length;
  const query = args.text || args.query || args.q || "";
  if (entry && entry.status !== "completed" && matches.length === 0) {
    return <div className="text-sm text-muted-foreground">Searching the page…</div>;
  }
  if (count === 0) return <div className="text-sm text-muted-foreground">No matches{query ? ' for "' + query + '"' : ""}.</div>;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <TextSearch className="h-3.5 w-3.5" />
        <span>{count} {count === 1 ? "match" : "matches"}{query ? ' for "' + query + '"' : ""}</span>
      </div>
      <div className="space-y-1">
        {matches.slice(0, 6).map((m, i) => (
          <div key={i} className="rounded-md border border-border bg-card px-2.5 py-1.5">
            <div className="truncate text-sm text-foreground">{m.text || m.context || "(match)"}</div>
            {m.context && m.context !== m.text ? <div className="truncate text-xs text-muted-foreground">{m.context}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
$renderer$,
array['react','lucide-react'], false, 'tsx', true, '1.0.0', 1, 2, 'matrx-default/default', 'DB-renderer example (in-page text matches).'),
('get_page_text', 'Page Text', 'text',
$renderer$
import { FileText, User } from "lucide-react";

export default function PageTextRenderer({ entry }) {
  function asObj(x) { if (x && typeof x === "object") return x; if (typeof x === "string") { try { return JSON.parse(x); } catch (e) { return {}; } } return {}; }
  function domainOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u || ""; } }
  const out = asObj(entry && entry.result);
  const title = out.title || "";
  const byline = out.byline || "";
  const url = out.url || "";
  const text = typeof out.text === "string" ? out.text : "";
  const chars = typeof out.char_count === "number" ? out.char_count : text.length;
  if (entry && entry.status !== "completed" && !text) {
    return <div className="text-sm text-muted-foreground">Reading the page…</div>;
  }
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-2.5 py-1.5">
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium text-foreground">{title || domainOf(url) || "Page"}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{chars.toLocaleString()} chars</span>
      </div>
      {byline ? (
        <div className="flex items-center gap-1.5 border-b border-border/40 px-2.5 py-1 text-xs text-muted-foreground">
          <User className="h-3 w-3" />{byline}
        </div>
      ) : null}
      {text ? (
        <div className="max-h-64 overflow-auto px-2.5 py-2 text-sm leading-relaxed text-foreground">{text.slice(0, 1200)}{text.length > 1200 ? "…" : ""}</div>
      ) : (
        <div className="px-2.5 py-2 text-xs text-muted-foreground">No readable text extracted.</div>
      )}
    </div>
  );
}
$renderer$,
array['react','lucide-react'], false, 'tsx', true, '1.0.0', 1, 2, 'matrx-default/default', 'DB-renderer example (readable page extract).')
on conflict (tool_name, surface_name) do update set
  inline_code = excluded.inline_code, allowed_imports = excluded.allowed_imports,
  display_name = excluded.display_name, results_label = excluded.results_label,
  contract_version = excluded.contract_version, is_active = true,
  notes = excluded.notes, updated_at = now();
