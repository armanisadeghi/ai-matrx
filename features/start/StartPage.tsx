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
import { Check, History, MessageCircle, Pencil, Plus, X } from "lucide-react";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { resolveMandate } from "@ai-matrx/chat/mandates/service";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
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
import { describeStartWidget } from "./widgets/catalog";
import { useStartAgentTools } from "./tools/useStartAgentTools";
import { START_PAGE_SURFACE_NAME } from "@/features/surfaces/manifests/start-page.manifest";
import { useOpenAgentRunWindow } from "@/features/overlays/openers/agentRunWindow";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
/** The Start page maintainer (declared in aidream services/start_page/mandates.py). */
const START_MAINTAINER_KEY = MANDATE_KEYS.start_page__maintainer;

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
  const history = useStartHistory(layout.recordId, panel?.kind === "history", (doc, note) => layout.save(doc, note));
  const openRun = useOpenAgentRunWindow();
  const editing = draft !== null;
  const agent = useStartAgentTools(START_PAGE_SURFACE_NAME, {
    doc: layout.doc,
    personEditing: editing,
    save: (doc, note, opts) => layout.save(doc, note, opts),
  });
  const shown: StartDoc | null = draft ?? preview?.doc ?? agent.agentDoc ?? layout.doc;

  // The Chat door opens the maintainer in place; it says the assistant is not set up ONLY when the
  // mandate truly fails to resolve here (no holder in reach), never as a silent stand-in.
  const openChat = async () => {
    try {
      const resolved = await resolveMandate(START_MAINTAINER_KEY, { optional: true });
      if (!resolved) return void toast.info("The Start page assistant is not set up yet");
      // The mandate door: the server resolves the holder; the id only paints the window. The window
      // adopts the mounted start_page surface so start_read_page / start_add_widget ... are offered.
      openRun({
        instanceId: `mandate:${START_MAINTAINER_KEY}`,
        initialAgentId: resolved.agentId,
        initialAgentName: "Start Page Maintainer",
        mandateKey: START_MAINTAINER_KEY,
        surfaceName: START_PAGE_SURFACE_NAME,
      });
    } catch (failure) {
      toast.error(`The Start page assistant could not open: ${failure instanceof Error ? failure.message : String(failure)}`);
    }
  };

  // An agent turn still pending is saved FIRST and the person edits on top of it — never two saves
  // racing, never one overwriting the other.
  const startEdit = async () => {
    const pendingAgentDoc = agent.agentDoc;
    if (pendingAgentDoc) await agent.flush();
    const base = pendingAgentDoc ?? layout.doc;
    if (!base) return;
    setPreview(null);
    setPanel(null);
    setDraft(base);
  };
  const cancelEdit = () => {
    setDraft(null);
    setPanel(null);
  };
  const finishEdit = async () => {
    const before = layout.doc;
    if (!draft || !before) return;
    if (sameStartDoc(draft, before)) return cancelEdit();
    const result = await layout.save(draft, summarizeStartEdit(before, draft));
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
    const result = await history.setActive(version, preview?.version === version ? preview.seenVersion : null, layout.doc);
    setBusy(false);
    if (!result.ok) return void toast.error(result.error);
    toast.success(`Version ${version} is active again`);
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
        { label: "Chat", icon: MessageCircle, onPress: () => void openChat() },
        { label: "History", icon: History, showLabel: true, disabled: !layout.recordId, onPress: () => setPanel(panel?.kind === "history" ? null : { kind: "history" }) },
        { label: "Edit", icon: Pencil, showLabel: true, disabled: !layout.doc || layout.loading, onPress: () => void startEdit() },
      ];

  const configuring = panel?.kind === "configure" && draft ? draft.widgets.find((w) => w.id === panel.id) : undefined;

  return (
    <SurfaceRuntimeProvider
      surfaceName={START_PAGE_SURFACE_NAME}
      getScope={() => ({
        start_widgets: (shown?.widgets ?? []).map((w, position) => ({ ...w, describe: describeStartWidget(w), position })),
        start_editing: editing,
      })}
    >
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
          <WidgetNotice tone="error">{layout.error ?? "Your start page could not be read."}<ErrorAlchemyMenu error={layout.error} /></WidgetNotice>
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
            // One rule for every widget: the new widget opens in Set up (size, and its fields if any).
            const added = next.widgets[next.widgets.length - 1];
            if (added) setPanel({ kind: "configure", id: added.id });
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
    </SurfaceRuntimeProvider>
  );
}
