"use client";

/**
 * CONTEXT PREVIEW WINDOW — the full-size answer to "what will the agent
 * actually receive?"
 *
 * The first version of this was a set of collapsible strips in a 22rem sidebar
 * rendering the payload as `<pre>` text. That is unusable for the thing it
 * exists to show: the payload is markdown, it runs to hundreds of thousands of
 * characters, and a human needs to READ it before spending a run on it.
 *
 * So: a real window panel, full size, with
 *   * an "Everything" view — the whole payload as one document, in the order the
 *     agent receives it — alongside the per-variable views. Reviewing one
 *     variable at a time cannot answer "is this the right context?".
 *   * Rendered / Raw / Split. Rendered is the default because the content is
 *     markdown; Raw is there because when you are debugging what an agent got,
 *     the literal characters are the truth.
 *   * the standard ContentActionBar, so the preview can go to Notes, a task, a
 *     download or the full-screen editor like any other content in the app.
 *
 * Only the bundle DESCRIPTOR crosses the overlay boundary (a few KB of
 * selectors). The window resolves it here — pushing a resolved 300k-character
 * payload through Redux would be the wrong trade.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Columns2,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Scissors,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import MarkdownStream from "@/components/MarkdownStream";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import { formatChars, formatTokens } from "@/lib/tokens/estimate";
import { getResourceManifest } from "@/features/research/service/resources";
import { resolveBundle } from "@/features/research/resources/resolve";
import { kindDef } from "@/features/research/resources/catalog";
import type {
  ContextBundle,
  ResolutionReport,
} from "@/features/research/resources/types";

/** Joins every variable into one document, in the order the agent receives it. */
const EVERYTHING = "__everything__";

type ViewMode = "rendered" | "raw" | "split";

interface ResearchContextPreviewWindowProps {
  isOpen: boolean;
  onClose: () => void;
  topicId: string | null;
  bundle: ContextBundle | null;
  title?: string;
}

export default function ResearchContextPreviewWindow({
  isOpen,
  onClose,
  topicId,
  bundle,
  title,
}: ResearchContextPreviewWindowProps) {
  if (!isOpen) return null;
  return (
    <ResearchContextPreviewWindowInner
      onClose={onClose}
      topicId={topicId}
      bundle={bundle}
      title={title}
    />
  );
}

function ResearchContextPreviewWindowInner({
  onClose,
  topicId,
  bundle,
  title,
}: Omit<ResearchContextPreviewWindowProps, "isOpen">) {
  /**
   * One result object, stamped with the request it answers.
   *
   * `loading` and "nothing was handed to me" are DERIVED from that stamp rather
   * than set in the effect body: a synchronous setState inside an effect is a
   * cascading render (react-hooks/set-state-in-effect). The effect only writes
   * state from its async callbacks, which is exactly what the rule allows.
   */
  interface Resolved {
    key: string;
    variables: Record<string, string>;
    report: ResolutionReport | null;
    error: string | null;
  }
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [active, setActive] = useState<string>(EVERYTHING);
  const [view, setView] = useState<ViewMode>("rendered");

  const hasInput = Boolean(topicId && bundle);
  const requestKey = `${topicId ?? ""}:${reloadKey}`;
  const loading = hasInput && resolved?.key !== requestKey;
  const variables = resolved?.key === requestKey ? resolved.variables : null;
  const report = resolved?.key === requestKey ? resolved.report : null;
  const error = resolved?.key === requestKey ? resolved.error : null;

  useEffect(() => {
    if (!topicId || !bundle) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const manifest = await getResourceManifest(topicId);
        const out = await resolveBundle(manifest, bundle);
        if (cancelled) return;
        setResolved({
          key: requestKey,
          variables: out.variables,
          report: out.report,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        setResolved({
          key: requestKey,
          variables: {},
          report: null,
          error:
            e instanceof Error ? e.message : "Could not build the preview",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicId, bundle, requestKey]);

  const names = useMemo(() => Object.keys(variables ?? {}), [variables]);

  /**
   * Variable → the human labels the PICKER shows for the kinds feeding it.
   *
   * The rail used to lead with the wire name (`scraped_pages`), which is not
   * what the page calls that resource ("Content"). Two names for one thing in
   * two panes of the same feature is exactly the confusion this avoids: the
   * label leads, the variable name stays visible underneath because it is what
   * the agent actually receives.
   */
  const labelsByVariable = useMemo(() => {
    const map = new Map<string, string>();
    for (const k of report?.perKind ?? []) {
      if (k.included <= 0) continue;
      const label = kindDef(k.kind)?.label ?? k.kind;
      const prev = map.get(k.variable);
      map.set(k.variable, prev ? `${prev}, ${label}` : label);
    }
    return map;
  }, [report]);

  /** The whole payload, each variable headed by its name. */
  const everything = useMemo(() => {
    if (!variables) return "";
    return names
      .map((n) => {
        const label = labelsByVariable.get(n);
        const heading = label ? `# ${label}` : `# ${n}`;
        return `${heading}\n\n_variable:_ \`${n}\`\n\n${variables[n]}`;
      })
      .join("\n\n---\n\n");
  }, [variables, names, labelsByVariable]);

  const shownContent =
    active === EVERYTHING ? everything : (variables?.[active] ?? "");
  const shownTitle =
    active === EVERYTHING
      ? `${title ?? "Research context"} — full context`
      : `${title ?? "Research context"} — ${labelsByVariable.get(active) ?? active}`;

  const collectData = useCallback(
    (): Record<string, unknown> => ({ topicId, bundle, title }),
    [topicId, bundle, title],
  );

  return (
    <WindowPanel
      title="Context Preview"
      id="research-context-preview-window"
      minWidth={520}
      minHeight={360}
      width={1100}
      height={760}
      position="center"
      onClose={onClose}
      overlayId="researchContextPreviewWindow"
      onCollectData={collectData}
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* ── Toolbar ───────────────────────────────────────────────────── */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-2 py-1.5">
          <div className="flex items-center rounded-md border border-border/60">
            {(
              [
                ["rendered", Eye, "Rendered"],
                ["raw", FileText, "Raw"],
                ["split", Columns2, "Split"],
              ] as const
            ).map(([mode, Icon, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 text-[11px] transition-colors",
                  view === mode
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {report && (
            <span className="text-[11px] text-muted-foreground">
              {names.length} variable{names.length === 1 ? "" : "s"} ·{" "}
              {formatChars(report.totalChars)} chars · ~
              {formatTokens(report.totalTokens)} tokens
            </span>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Rebuild
            </Button>
            {shownContent && (
              <ContentActionBar
                content={shownContent}
                title={shownTitle}
                instanceKey={`research-context-preview:${active}`}
                metadata={{
                  topicId,
                  bundle: bundle?.name ?? null,
                  variable: active === EVERYTHING ? null : active,
                }}
              />
            )}
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1">
          {/* Variable rail */}
          <div className="flex w-56 shrink-0 flex-col border-r border-border/60">
            <div className="shrink-0 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Variables
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1 space-y-0.5">
              <RailItem
                label="Everything"
                sublabel="one document, in order"
                chars={everything.length}
                active={active === EVERYTHING}
                onClick={() => setActive(EVERYTHING)}
              />
              {names.map((n) => (
                <RailItem
                  key={n}
                  label={labelsByVariable.get(n) ?? n}
                  sublabel={n}
                  sublabelIsCode
                  chars={(variables?.[n] ?? "").length}
                  active={active === n}
                  onClick={() => setActive(n)}
                />
              ))}
            </div>

            {report && (report.truncated || report.exceedsBudget) && (
              <div className="shrink-0 border-t border-amber-500/30 bg-amber-500/[0.07] p-2">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  <Scissors className="h-3.5 w-3.5" />
                  Not everything got in
                </div>
                <ul className="mt-1 space-y-0.5 pl-4 text-[10px] text-amber-700/90 dark:text-amber-400/90">
                  {report.notes.map((note, i) => (
                    <li key={i} className="list-disc">
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            {hasInput && loading && (
              <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Building the context…
              </div>
            )}

            {!hasInput && (
              <div className="m-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/[0.07] p-3 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
                No selection was handed to this preview.
              </div>
            )}

            {hasInput && !loading && error && (
              <div className="m-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/[0.06] p-3 text-xs text-destructive">
                <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {hasInput && !loading && !error && !shownContent && (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                This variable is empty.
              </div>
            )}

            {hasInput && !loading && !error && shownContent && (
              <div className="flex h-full min-h-0">
                {(view === "rendered" || view === "split") && (
                  <div
                    className={cn(
                      "min-w-0 overflow-y-auto p-3",
                      view === "split"
                        ? "w-1/2 border-r border-border/60"
                        : "w-full",
                    )}
                  >
                    <MarkdownStream content={shownContent} />
                  </div>
                )}
                {(view === "raw" || view === "split") && (
                  <div
                    className={cn(
                      "min-w-0 overflow-auto bg-muted/30 p-3",
                      view === "split" ? "w-1/2" : "w-full",
                    )}
                  >
                    <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/85">
                      {shownContent}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </WindowPanel>
  );
}

function RailItem({
  label,
  sublabel,
  sublabelIsCode,
  chars,
  active,
  onClick,
}: {
  label: string;
  sublabel?: string;
  /** Render the sublabel as code — it is a wire name, not prose. */
  sublabelIsCode?: boolean;
  chars: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-0.5 rounded px-2 py-1 text-left transition-colors",
        active ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
          {label}
        </span>
        <Badge
          variant="secondary"
          className="h-4 shrink-0 px-1 text-[9px] tabular-nums"
        >
          {formatChars(chars)}
        </Badge>
      </div>
      {sublabel && (
        <span
          className={cn(
            "truncate text-[10px] text-muted-foreground",
            sublabelIsCode && "font-mono",
          )}
        >
          {sublabel}
        </span>
      )}
    </button>
  );
}
