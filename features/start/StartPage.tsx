"use client";

// features/start/StartPage.tsx — /start: THIS PERSON'S OWN START PAGE (lane START-PAGE, plan:
// common-docs/systems/board/start/PLAN.md).
//
// A document of widgets (features/start/widgets): the normal app first (counts, tasks, today, recents,
// favorites, pinned agents) and the person's own data pages as one more widget. The doc is one
// person-scope typed-table row; every save is a record version, so History previews any version in
// place and "Set active" restores it as a new version — nothing is ever lost. Edit mode is one write.

import { useState } from "react";
import Link from "next/link";
import { Check, History, Pencil, Plus, X } from "lucide-react";
import { RecordsMount } from "@ai-matrx/records-ui";

import { RecordPageHeader, type RecordPageAction } from "@/features/shell/components/header/templates/RecordPageHeader";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { useAppRecordsConfig } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { toast } from "@/lib/toast";
import { useStartHistory, useStartLayout, versionAuthor, versionNote } from "./useStartLayout";
import { StartGrid } from "./widgets/StartGrid";
import { AddWidgetPanel, ConfigureWidgetPanel, HistoryPanel } from "./widgets/StartPanel";
import { getStartWidgetSpec } from "./widgets/catalog";
import { addWidget, configureWidget, nudgeWidget, removeWidget, resizeWidget, sameStartDoc } from "./widgets/doc";
import { defaultStartDoc } from "./widgets/defaultDoc";
import { summarizeStartEdit } from "./widgets/editNote";
import type { StartDoc } from "./widgets/types";
import { WidgetNotice } from "./widgets/frame";

export function StartPage() {
  const userId = useAppSelector(selectUserId);
  // org-filter: write-target — a new layout row is saved where new things are saved; reads walk every organization
  const active = useOrganizationRequired();
  const recordsConfig = useAppRecordsConfig(active.organizationId ?? null);
  return userId ? (
    // org-filter: write-target — the provider's organization is only where a first layout is written
    <RecordsMount letTheStoreDecideRights config={recordsConfig} host={{ Link, density: "condensed" }}>
      <StartBody />
    </RecordsMount>
  ) : (
    <RecordPageHeader backHref="/" record={{ name: "Start" }} />
  );
}

type Panel = { kind: "add" } | { kind: "configure"; id: string } | { kind: "history" } | null;

function StartBody() {
  const userId = useAppSelector(selectUserId);
  const layout = useStartLayout();
  const [draft, setDraft] = useState<StartDoc | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [preview, setPreview] = useState<{ version: number; doc: StartDoc; seenVersion: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const history = useStartHistory(layout.recordId, panel?.kind === "history");

  const editing = draft !== null;
  const shown: StartDoc | null = draft ?? preview?.doc ?? layout.doc;

  const startEdit = () => {
    if (!layout.doc) return;
    setPreview(null);
    setPanel(null);
    setDraft(layout.doc);
  };
  const cancelEdit = () => {
    setDraft(null);
    setPanel(null);
  };
  const finishEdit = async () => {
    if (!draft || !layout.doc) return;
    if (sameStartDoc(draft, layout.doc)) return cancelEdit();
    const result = await layout.save(draft, summarizeStartEdit(layout.doc, draft));
    if (!result.ok) return void toast.error(result.error);
    setDraft(null);
    setPanel(null);
  };

  const openPreview = async (version: number | null) => {
    if (version === null || !layout.doc) return setPreview(null);
    const answer = await history.preview(version, layout.doc);
    if (!answer.ok) return void toast.error(answer.error);
    setPreview({ version, doc: answer.doc, seenVersion: answer.seenVersion });
  };
  const setActive = async (version: number) => {
    setBusy(true);
    const result = await history.setActive(version, preview?.version === version ? preview.seenVersion : null);
    setBusy(false);
    if (!result.ok) return void toast.error(result.error);
    setPreview(null);
    layout.reload();
  };

  const actions: RecordPageAction[] = editing
    ? [
        { label: "Add", icon: Plus, showLabel: true, onPress: () => setPanel({ kind: "add" }) },
        { label: "Cancel", icon: X, showLabel: true, onPress: cancelEdit },
        { label: "Done", icon: Check, primary: true, disabled: layout.saving, onPress: () => void finishEdit() },
      ]
    : [
        { label: "History", icon: History, showLabel: true, disabled: !layout.recordId, onPress: () => setPanel(panel?.kind === "history" ? null : { kind: "history" }) },
        { label: "Edit", icon: Pencil, showLabel: true, disabled: !layout.doc || layout.loading, onPress: startEdit },
      ];

  const configuring = panel?.kind === "configure" && draft ? draft.widgets.find((w) => w.id === panel.id) : undefined;

  return (
    <>
      <RecordPageHeader
        backHref="/"
        record={{ name: "Start" }}
        status={preview ? { label: `Viewing v${preview.version}`, tone: "info" } : editing ? { label: "Editing", tone: "primary" } : undefined}
        actions={actions}
      />
      <div className="h-full overflow-y-auto px-3 pb-6 pt-[calc(var(--shell-header-h)+0.75rem)]">
        {layout.loading ? (
          <StartGrid doc={defaultStartDoc(null)} skeleton />
        ) : !shown ? (
          <WidgetNotice tone="error">{layout.error ?? "Your start page could not be read."}</WidgetNotice>
        ) : shown.widgets.length === 0 && !editing ? (
          <WidgetNotice>Press Edit to add widgets</WidgetNotice>
        ) : (
          <StartGrid
            doc={shown}
            previewing={Boolean(preview)}
            editing={
              draft
                ? {
                    selectedId: panel?.kind === "configure" ? panel.id : null,
                    onNudge: (id, by) => setDraft(nudgeWidget(draft, id, by)),
                    onRemove: (id) => {
                      setDraft(removeWidget(draft, id));
                      if (panel?.kind === "configure" && panel.id === id) setPanel(null);
                    },
                    onConfigure: (id) => setPanel({ kind: "configure", id }),
                  }
                : null
            }
          />
        )}
      </div>
      {panel?.kind === "add" && draft ? (
        <AddWidgetPanel
          onClose={() => setPanel(null)}
          onAdd={(spec) => {
            const next = addWidget(draft, { type: spec.key, size: spec.sizes.includes("m") ? "m" : spec.sizes[0]!, config: spec.defaultConfig });
            setDraft(next);
            const added = next.widgets[next.widgets.length - 1];
            if (added && spec.fields.length > 0) setPanel({ kind: "configure", id: added.id });
          }}
        />
      ) : null}
      {configuring && draft ? (
        <ConfigureWidgetPanel
          key={configuring.id}
          widget={configuring}
          spec={getStartWidgetSpec(configuring.type)}
          onClose={() => setPanel(null)}
          onResize={(size) => setDraft(resizeWidget(draft, configuring.id, size))}
          onConfigure={(key, value) => setDraft(configureWidget(draft, configuring.id, { [key]: value }))}
        />
      ) : null}
      {panel?.kind === "history" ? (
        <HistoryPanel
          entries={history.entries}
          error={history.error}
          author={(e) => versionAuthor(e, userId)}
          note={versionNote}
          previewVersion={preview?.version ?? null}
          busy={busy}
          onPreview={(v) => void openPreview(v)}
          onSetActive={(v) => void setActive(v)}
          onClose={() => {
            setPanel(null);
            setPreview(null);
          }}
        />
      ) : null}
    </>
  );
}
