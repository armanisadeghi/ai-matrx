"use client";

/**
 * TEXT SECTIONS WINDOW — the generic "read a lot of text properly" primitive.
 *
 * Any surface holding named sections of text content renders them here: a real
 * window panel with a section rail, an "Everything" view (all sections as one
 * document, in order), Rendered / Raw / Split views, and the standard
 * ContentActionBar so the content can go to Notes, a task, a download or the
 * editor like anything else in the app.
 *
 * This was lifted out of the research Context Preview window because the shape
 * is universal — "here are labeled chunks of text; let me actually read them"
 * — and hand-rolling a `<pre>` in a sidebar is the anti-pattern it replaces.
 * The window resolves NOTHING itself: the consumer owns loading/erroring and
 * passes finished sections, which is what keeps this generic.
 *
 * Consumers so far: research context preview
 * (`features/window-panels/windows/research/ResearchContextPreviewWindow.tsx`).
 * New consumers reuse this component inside their own registered window/overlay
 * — this file deliberately owns no overlay id of its own.
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Columns2,
  Eye,
  FileText,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import MarkdownStream from "@/components/MarkdownStream";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import { formatChars } from "@/lib/tokens/estimate";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";

/** Synthetic rail key for the all-sections view. */
const EVERYTHING = "__everything__";

type ViewMode = "rendered" | "raw" | "split";

export interface TextSection {
  /** Stable key — used for rail selection and the action bar instance key. */
  key: string;
  /** Human label, shown first in the rail. */
  label: string;
  /** Secondary line under the label (a wire name, a source, a count…). */
  sublabel?: string;
  /** Render the sublabel as code — it is a wire name, not prose. */
  sublabelIsCode?: boolean;
  /** The text itself. Markdown renders; anything renders raw. */
  text: string;
  /** Small badge next to the label (e.g. "on demand"). */
  badge?: string;
}

export interface TextSectionsWindowProps {
  onClose: () => void;
  /** Window chrome title. */
  windowTitle: string;
  /** Base title for the action bar / exports ("Research context"). */
  contentTitle: string;
  sections: TextSection[];
  /** Rail heading over the section list. Defaults to "Sections". */
  railLabel?: string;
  loading?: boolean;
  /** Loading line under the spinner. */
  loadingLabel?: string;
  error?: string | null;
  /** Shown when there is nothing at all to display (no sections, no error). */
  emptyNotice?: string;
  /** Extra toolbar content (stats line, rebuild button…). */
  toolbarExtras?: ReactNode;
  /** Pinned under the rail (truncation warnings and the like). */
  railFooter?: ReactNode;
  /** Namespaces the ContentActionBar instance key. */
  instanceKeyPrefix: string;
  /** Extra metadata handed to the action bar. */
  metadata?: Record<string, unknown>;
  /** WindowPanel identity — the CONSUMER's registered ids, never this file's. */
  windowId: string;
  overlayId?: OverlayId;
  onCollectData?: () => Record<string, unknown>;
  width?: number;
  height?: number;
}

export function TextSectionsWindow({
  onClose,
  windowTitle,
  contentTitle,
  sections,
  railLabel = "Sections",
  loading = false,
  loadingLabel = "Loading…",
  error = null,
  emptyNotice = "Nothing to show.",
  toolbarExtras,
  railFooter,
  instanceKeyPrefix,
  metadata,
  windowId,
  overlayId,
  onCollectData,
  width = 1100,
  height = 760,
}: TextSectionsWindowProps) {
  const [active, setActive] = useState<string>(EVERYTHING);
  const [view, setView] = useState<ViewMode>("rendered");

  /** All sections as one document, each headed by its label, in order. */
  const everything = useMemo(
    () =>
      sections
        .map((s) => {
          const sub = s.sublabel ? `\n\n_${s.sublabelIsCode ? "variable" : "section"}:_ \`${s.sublabel}\`` : "";
          return `# ${s.label}${sub}\n\n${s.text}`;
        })
        .join("\n\n---\n\n"),
    [sections],
  );

  const activeSection = sections.find((s) => s.key === active);
  const shownContent = active === EVERYTHING ? everything : (activeSection?.text ?? "");
  const shownTitle =
    active === EVERYTHING
      ? `${contentTitle} — everything`
      : `${contentTitle} — ${activeSection?.label ?? active}`;

  const hasContent = sections.length > 0;

  // WindowPanel's close binding is a discriminated union (overlay-managed vs
  // inline) — build the matching variant instead of passing both loosely.
  const closeBinding = overlayId ? { overlayId, onClose } : { onClose };

  return (
    <WindowPanel
      title={windowTitle}
      id={windowId}
      minWidth={520}
      minHeight={360}
      width={width}
      height={height}
      position="center"
      {...closeBinding}
      onCollectData={onCollectData}
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

          <div className="ml-auto flex items-center gap-1.5">
            {toolbarExtras}
            {shownContent && (
              <ContentActionBar
                content={shownContent}
                title={shownTitle}
                instanceKey={`${instanceKeyPrefix}:${active}`}
                metadata={{
                  ...metadata,
                  section: active === EVERYTHING ? null : active,
                }}
              />
            )}
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1">
          {/* Section rail */}
          <div className="flex w-56 shrink-0 flex-col border-r border-border/60">
            <div className="shrink-0 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {railLabel}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1 space-y-0.5">
              <RailItem
                label="Everything"
                sublabel="one document, in order"
                chars={everything.length}
                active={active === EVERYTHING}
                onClick={() => setActive(EVERYTHING)}
              />
              {sections.map((s) => (
                <RailItem
                  key={s.key}
                  label={s.label}
                  sublabel={s.sublabel}
                  sublabelIsCode={s.sublabelIsCode}
                  badge={s.badge}
                  chars={s.text.length}
                  active={active === s.key}
                  onClick={() => setActive(s.key)}
                />
              ))}
            </div>
            {railFooter}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            {loading && (
              <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {loadingLabel}
              </div>
            )}

            {!loading && error && (
              <div className="m-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/[0.06] p-3 text-xs text-destructive">
                <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {!loading && !error && !hasContent && (
              <div className="m-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/[0.07] p-3 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
                {emptyNotice}
              </div>
            )}

            {!loading && !error && hasContent && !shownContent && (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                This section is empty.
              </div>
            )}

            {!loading && !error && shownContent && (
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
  badge,
  chars,
  active,
  onClick,
}: {
  label: string;
  sublabel?: string;
  sublabelIsCode?: boolean;
  badge?: string;
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
        {badge && (
          <Badge
            variant="outline"
            className="h-4 shrink-0 px-1 text-[9px] text-muted-foreground"
          >
            {badge}
          </Badge>
        )}
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
