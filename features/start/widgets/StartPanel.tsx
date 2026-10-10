"use client";

// features/start/widgets/StartPanel.tsx — the Start page's side panel (floats over the right edge; it never
// pushes the grid): Add (the catalog grouped by Board section), Set up (one widget's size and fields),
// and History (every saved version; click = preview in place, Set active = restore as a new version).
import { useState } from "react";
import { X } from "lucide-react";
import { Button, Field, Select } from "@ai-matrx/design-system/controls";
import { cn } from "@ai-matrx/design-system";
import type { RecordHistoryEntry } from "@ai-matrx/records/react";
import { BOARD_SECTIONS } from "@/features/board/items/types";
import { START_WIDGET_CATALOG } from "./catalog";
import { START_WIDGET_SIZE_LABEL, type StartWidget, type StartWidgetSize, type StartWidgetSpec } from "./types";

function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <aside
      aria-label={title}
      className="fixed bottom-3 right-3 top-[calc(var(--shell-header-h)+0.75rem)] z-30 flex w-80 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <h2 className="text-sm font-medium">{title}</h2>
        <Button variant="quiet" className="ml-auto" icon={<X />} aria-label="Close" onClick={onClose} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{children}</div>
    </aside>
  );
}

export function AddWidgetPanel({
  onAdd,
  onClose,
}: {
  onAdd: (spec: StartWidgetSpec) => void;
  onClose: () => void;
}) {
  return (
    <PanelShell title="Add a widget" onClose={onClose}>
      {BOARD_SECTIONS.map((section) => {
        const specs = START_WIDGET_CATALOG.filter((s) => s.section === section.key);
        if (specs.length === 0) return null;
        return (
          <div key={section.key} className="mb-3">
            <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">{section.label}</h3>
            <ul>
              {specs.map((spec) => {
                const Icon = spec.icon;
                return (
                  <li key={spec.key}>
                    <button
                      type="button"
                      data-clickable
                      onClick={() => onAdd(spec)}
                      className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-muted"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">{spec.label}</span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">{spec.describe(spec.defaultConfig)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </PanelShell>
  );
}

export function ConfigureWidgetPanel({
  widget,
  spec,
  onResize,
  onConfigure,
  onClose,
}: {
  widget: StartWidget;
  spec: StartWidgetSpec | undefined;
  onResize: (size: StartWidgetSize) => void;
  onConfigure: (key: string, value: string) => void;
  onClose: () => void;
}) {
  return (
    <PanelShell title={spec ? spec.describe(widget.config) : "Unavailable widget"} onClose={onClose}>
      <div className="flex flex-col gap-3 p-1">
        {spec ? (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Size
            <Select
              aria-label="Size"
              value={widget.size}
              options={spec.sizes.map((s) => ({ value: s, label: START_WIDGET_SIZE_LABEL[s] }))}
              onValueChange={(v) => onResize(v)}
            />
          </label>
        ) : null}
        {spec?.fields.map((field) => (
          <label key={field.key} className="flex flex-col gap-1 text-xs text-muted-foreground">
            {field.label}
            {field.options ? (
              <Select
                aria-label={field.label}
                value={widget.config[field.key] ?? ""}
                options={field.options}
                onValueChange={(v) => onConfigure(field.key, v)}
              />
            ) : (
              // ui-exception: a raw id value, not prose a person writes
              <Field
                aria-label={field.label}
                defaultValue={widget.config[field.key] ?? ""}
                onBlur={(e) => onConfigure(field.key, e.currentTarget.value.trim())}
              />
            )}
          </label>
        ))}
      </div>
    </PanelShell>
  );
}

export function HistoryPanel({
  entries,
  error,
  author,
  note,
  previewVersion,
  busy,
  onPreview,
  onSetActive,
  onClose,
}: {
  entries: RecordHistoryEntry[] | null;
  error: string | null;
  author: (e: RecordHistoryEntry) => string;
  note: (e: RecordHistoryEntry) => string;
  previewVersion: number | null;
  busy: boolean;
  onPreview: (version: number | null) => void;
  onSetActive: (version: number) => void;
  onClose: () => void;
}) {
  const [now] = useState(() => Date.now());
  const newest = entries?.[0]?.version ?? null;
  return (
    <PanelShell title="History" onClose={onClose}>
      {error ? <p className="p-2 text-xs text-destructive">{error}</p> : null}
      {!entries && !error ? (
        <ul aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="h-12 px-2 py-2">
              <span className="block h-3 w-2/3 animate-pulse rounded bg-muted" />
            </li>
          ))}
        </ul>
      ) : null}
      <ul>
        {entries?.map((e) => {
          const active = e.version === newest;
          const selected = e.version === previewVersion;
          return (
            <li key={e.version}>
              <div
                role="button"
                tabIndex={0}
                data-clickable
                aria-pressed={selected}
                onClick={() => onPreview(active ? null : e.version)}
                onKeyDown={(k) => {
                  if (k.key === "Enter" || k.key === " ") onPreview(active ? null : e.version);
                }}
                className={cn("flex h-12 items-center gap-2 rounded px-2 hover:bg-muted", selected && "bg-muted")}
              >
                <span className="w-8 shrink-0 text-xs tabular-nums text-muted-foreground">{`v${e.version}`}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{note(e)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {`${author(e)} · ${relative(e.occurred_at, now)}`}
                  </span>
                </span>
                {active ? (
                  <span className="shrink-0 text-xs text-muted-foreground">Active</span>
                ) : selected ? (
                  <Button
                    variant="primary"
                    disabled={busy}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onSetActive(e.version);
                    }}
                  >
                    Set active
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </PanelShell>
  );
}

function relative(iso: string, now: number): string {
  const m = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
