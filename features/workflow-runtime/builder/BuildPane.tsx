"use client";

/**
 * BuildPane — the left half: everything a person decides, as sentences.
 *
 * Reading order matches the run's own order: the screens someone moves
 * through, what sits on the screen they are editing, what counts as the
 * finished result, and only then the housekeeping. Nothing here names a
 * readout, a trigger point, a grid column, or a spec type.
 */

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ListChecks,
  MousePointerClick,
  Plus,
  Settings2,
  StickyNote,
  Trash2,
  Workflow,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import type {
  MultiRunMode,
  Readout,
  ReadoutSource,
  RunSurfaceConfig,
  SurfacePage,
} from "../surface/config";
import type { SurfaceAudience, SurfaceProfile } from "../surface/service";
import {
  HEIGHT_CHOICES,
  HEIGHT_ROWS,
  WIDTH_CHOICES,
  WIDTH_COLUMNS,
  freshPanelId,
  heightOf,
  movePanel,
  panelsOfScreen,
  repack,
  screenIdOf,
  widthOf,
  type PanelHeight,
  type PanelWidth,
  type ScreenId,
} from "./layout-model";
import { ChoiceCard, FieldLabel, Section, Segmented, SelectField, TextField } from "./parts";
import {
  MOMENT_KINDS,
  describeMoment,
  describePanel,
  momentFromTrigger,
  triggerFromMoment,
  type MomentChoice,
  type MomentKind,
  type StepInfo,
} from "./vocabulary";

export interface SurfaceMeta {
  name: string;
  audience: SurfaceAudience;
  profile: SurfaceProfile;
}

interface BuildPaneProps {
  config: RunSurfaceConfig;
  onChange: (next: RunSurfaceConfig) => void;
  steps: StepInfo[];
  meta: SurfaceMeta;
  onMetaChange: (patch: Partial<SurfaceMeta>) => void;
  screenId: ScreenId;
  onScreenChange: (id: ScreenId) => void;
}

export function BuildPane({
  config,
  onChange,
  steps,
  meta,
  onMetaChange,
  screenId,
  onScreenChange,
}: BuildPaneProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Readout | null>(null);
  const [removeScreen, setRemoveScreen] = useState<SurfacePage | null>(null);

  const panels = panelsOfScreen(config, screenId);
  const screenLabel =
    config.pages.find((p) => p.id === screenId)?.title ?? "the run page";

  // ── Panel edits — always a spread, so config keys this builder has never
  // heard of survive every change (forward compatibility is not optional). ──

  const updatePanel = (id: string, patch: Partial<Readout>) =>
    onChange(
      repack({
        ...config,
        readouts: config.readouts.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      }),
    );

  const setVisibility = (panel: Readout, patch: Partial<Readout["visibility"]>) => {
    const next = { ...panel.visibility, ...patch };
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      if (next[key] === undefined) delete next[key];
    }
    updatePanel(panel.id, {
      visibility: Object.keys(next).length > 0 ? next : undefined,
    });
  };

  const addPanel = (source: ReadoutSource, base: string, width: PanelWidth) => {
    const id = freshPanelId(config, base);
    const panel: Readout = {
      id,
      source,
      pos: { x: 0, y: 0, w: WIDTH_COLUMNS[width], h: HEIGHT_ROWS.medium },
      ...(screenId ? { pageId: screenId } : {}),
    };
    onChange(repack({ ...config, readouts: [...config.readouts, panel] }));
    setAdding(false);
    setExpanded(id);
  };

  // ── Screens ───────────────────────────────────────────────────────────────

  const addScreen = () => {
    const used = new Set(config.pages.map((p) => p.id));
    let n = config.pages.length + 1;
    while (used.has(`screen-${n}`)) n += 1;
    const first: SurfacePage[] =
      config.pages.length === 0
        ? [{ id: "screen-1", title: "While it works" }]
        : config.pages;
    const created: SurfacePage = { id: `screen-${n}`, title: "The result" };
    onChange(repack({ ...config, pages: [...first, created] }));
    onScreenChange(created.id);
  };

  const renameScreen = (id: string, title: string) =>
    onChange({
      ...config,
      pages: config.pages.map((p) => (p.id === id ? { ...p, title } : p)),
    });

  const setScreenMoment = (id: string, moment: MomentChoice) =>
    onChange({
      ...config,
      pages: config.pages.map((p) => {
        if (p.id !== id) return p;
        const activateOn = triggerFromMoment(moment);
        const next = { ...p };
        if (activateOn) next.activateOn = activateOn;
        else delete next.activateOn;
        return next;
      }),
    });

  const deleteScreen = (page: SurfacePage) => {
    const remaining = config.pages.filter((p) => p.id !== page.id);
    const fallback = remaining[0]?.id;
    onChange(
      repack({
        ...config,
        pages: remaining,
        // Its panels move to the first remaining screen rather than vanishing.
        readouts: config.readouts.map((r) =>
          screenIdOf(r, config) === page.id
            ? { ...r, ...(fallback ? { pageId: fallback } : { pageId: undefined }) }
            : r,
        ),
      }),
    );
    onScreenChange(fallback ?? null);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* 1 — Screens ------------------------------------------------------ */}
      <Section
        number={1}
        title="Screens"
        hint="A long job is easier to watch in chapters. Each screen takes over on its own cue."
        action={
          <button
            type="button"
            onClick={addScreen}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-foreground hover:border-primary/40"
          >
            <Plus className="h-3.5 w-3.5" /> Add a screen
          </button>
        }
      >
        {config.pages.length === 0 ? (
          <ChoiceCard
            title="Everything on one screen"
            detail="People see the whole page from start to finish. Add a screen to split it into chapters."
            selected
            onClick={() => onScreenChange(null)}
          />
        ) : (
          config.pages.map((page, index) => {
            const active = page.id === screenId;
            const moment = momentFromTrigger(page.activateOn);
            const count = panelsOfScreen(config, page.id).length;
            return (
              <div
                key={page.id}
                className={cn(
                  "rounded-lg border transition-colors",
                  active ? "border-primary bg-primary/5" : "border-border bg-card",
                )}
              >
                <div className="flex items-center gap-2 p-2.5">
                  <button
                    type="button"
                    onClick={() => onScreenChange(page.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-medium text-foreground">
                      {page.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {index === 0
                        ? "Shown first"
                        : describeMoment(moment, steps)}
                      {" · "}
                      {count === 1 ? "1 thing to watch" : `${count} things to watch`}
                    </span>
                  </button>
                  {config.pages.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setRemoveScreen(page)}
                      aria-label={`Remove the screen "${page.title}"`}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                {active ? (
                  <div className="space-y-2 border-t border-border/70 p-2.5">
                    <label className="block space-y-1">
                      <FieldLabel>Call it</FieldLabel>
                      <TextField
                        value={page.title}
                        onChange={(v) => renameScreen(page.id, v)}
                        ariaLabel="Screen name"
                      />
                    </label>
                    {index > 0 ? (
                      <div className="space-y-1">
                        <FieldLabel>Take over</FieldLabel>
                        <MomentPicker
                          moment={moment}
                          steps={steps}
                          onChange={(m) => setScreenMoment(page.id, m)}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </Section>

      {/* 2 — What people watch -------------------------------------------- */}
      <Section
        number={2}
        title={config.pages.length > 0 ? `On "${screenLabel}"` : "What people watch"}
        hint="Pick the moments worth showing. Everything else keeps running quietly in the background."
        action={
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-foreground hover:border-primary/40"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        }
      >
        {adding ? (
          <AddPanelPicker steps={steps} onPick={addPanel} onCancel={() => setAdding(false)} />
        ) : null}

        {panels.length === 0 && !adding ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Nothing on this screen yet.
          </p>
        ) : null}

        {panels.map((panel, index) => {
          const described = describePanel(panel.source, steps);
          const open = expanded === panel.id;
          const moment = momentFromTrigger(panel.visibility?.appearOn);
          return (
            <div
              key={panel.id}
              className="rounded-lg border border-border bg-card"
            >
              <div className="flex items-start gap-2 p-2.5">
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => onChange(movePanel(config, panel.id, -1))}
                    aria-label={`Move "${described.title}" up`}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={index === panels.length - 1}
                    onClick={() => onChange(movePanel(config, panel.id, 1))}
                    aria-label={`Move "${described.title}" down`}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <TextField
                    value={panel.title ?? ""}
                    placeholder={described.title}
                    ariaLabel="What to call this box"
                    onChange={(v) => updatePanel(panel.id, { title: v || undefined })}
                  />
                  <p className="text-xs leading-snug text-muted-foreground">
                    {described.detail}
                  </p>
                  <Segmented<PanelWidth>
                    ariaLabel="How wide"
                    value={widthOf(panel.pos.w)}
                    options={WIDTH_CHOICES}
                    onChange={(w) =>
                      updatePanel(panel.id, {
                        pos: { ...panel.pos, w: WIDTH_COLUMNS[w] },
                      })
                    }
                  />
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : panel.id)}
                    aria-label={`More options for "${described.title}"`}
                    className={cn(
                      "rounded-md p-1.5 hover:bg-muted",
                      open ? "text-primary" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(panel)}
                    aria-label={`Remove "${described.title}"`}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {open ? (
                <div className="space-y-3 border-t border-border/70 p-2.5">
                  <div className="space-y-1">
                    <FieldLabel>How tall</FieldLabel>
                    <Segmented<PanelHeight>
                      ariaLabel="How tall"
                      value={heightOf(panel.pos.h)}
                      options={HEIGHT_CHOICES}
                      onChange={(h) =>
                        updatePanel(panel.id, {
                          pos: { ...panel.pos, h: HEIGHT_ROWS[h] },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <FieldLabel>Appears</FieldLabel>
                    <MomentPicker
                      moment={moment}
                      steps={steps}
                      onChange={(m) =>
                        setVisibility(panel, { appearOn: triggerFromMoment(m) })
                      }
                    />
                  </div>
                  {moment.kind !== "always" ? (
                    <div className="space-y-1">
                      <FieldLabel>Until then</FieldLabel>
                      <Segmented
                        ariaLabel="Until then"
                        value={panel.visibility?.empty === "hidden" ? "hidden" : "hold"}
                        options={[
                          { value: "hold", label: "Hold its place" },
                          { value: "hidden", label: "Show nothing" },
                        ]}
                        onChange={(v) =>
                          setVisibility(panel, {
                            empty: v === "hidden" ? "hidden" : undefined,
                          })
                        }
                      />
                    </div>
                  ) : null}
                  {panel.source.kind === "node" ? (
                    <div className="space-y-1">
                      <FieldLabel>Show</FieldLabel>
                      <Segmented
                        ariaLabel="What to show"
                        value={panel.prefer === "persisted" ? "persisted" : "live"}
                        options={[
                          { value: "live", label: "The writing, live" },
                          { value: "persisted", label: "The finished version" },
                        ]}
                        onChange={(v) =>
                          updatePanel(panel.id, {
                            prefer: v === "persisted" ? "persisted" : "live",
                          })
                        }
                      />
                    </div>
                  ) : null}
                  {panel.source.kind === "node" || panel.source.kind === "group" ? (
                    <div className="space-y-1">
                      <FieldLabel>If this step repeats</FieldLabel>
                      <Segmented<MultiRunMode>
                        ariaLabel="If this step repeats"
                        value={panel.multiRun ?? "stack"}
                        options={[
                          { value: "stack", label: "Show them all" },
                          { value: "latest", label: "Only the newest" },
                          { value: "table", label: "As a table" },
                        ]}
                        onChange={(v) => updatePanel(panel.id, { multiRun: v })}
                      />
                    </div>
                  ) : null}
                  {panel.source.kind === "static" ? (
                    <label className="block space-y-1">
                      <FieldLabel>Your words</FieldLabel>
                      <textarea
                        value={panel.source.markdown}
                        onChange={(e) =>
                          updatePanel(panel.id, {
                            source: { kind: "static", markdown: e.target.value },
                          })
                        }
                        rows={3}
                        aria-label="Your words"
                        className="w-full resize-y rounded-lg border border-border bg-background p-2 text-[16px] text-foreground focus:border-primary focus:outline-none sm:text-sm"
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </Section>

      {/* 3 — The finish line ---------------------------------------------- */}
      <Section
        number={3}
        title="The finish line"
        hint="The step that produces the thing people are waiting for. Screens and boxes can wait for this moment."
      >
        <SelectField
          ariaLabel="The step that produces the result"
          value={config.deliverableNodeId ?? ""}
          options={[
            { value: "", label: "Not set — wait for the whole run instead" },
            ...steps.map((s) => ({ value: s.id, label: s.label })),
          ]}
          onChange={(v) => {
            const next = { ...config };
            if (v) next.deliverableNodeId = v;
            else delete next.deliverableNodeId;
            onChange(next);
          }}
        />
      </Section>

      {/* 4 — Details ------------------------------------------------------ */}
      <Section number={4} title="Details">
        <label className="block space-y-1">
          <FieldLabel>Name this view</FieldLabel>
          <TextField
            value={meta.name}
            ariaLabel="Name this view"
            onChange={(v) => onMetaChange({ name: v })}
          />
        </label>
        <div className="space-y-1">
          <FieldLabel>Who is it for</FieldLabel>
          <Segmented<SurfaceAudience>
            ariaLabel="Who is it for"
            value={meta.audience}
            options={[
              { value: "consumer", label: "The person running it" },
              { value: "creator", label: "Me, while I build" },
            ]}
            onChange={(v) => onMetaChange({ audience: v })}
          />
        </div>
        <div className="space-y-1">
          <FieldLabel>How much room does it get</FieldLabel>
          <Segmented<SurfaceProfile>
            ariaLabel="How much room does it get"
            value={meta.profile}
            options={[
              { value: "full", label: "A whole page" },
              { value: "compact", label: "A panel" },
              { value: "summary", label: "A single line" },
            ]}
            onChange={(v) => onMetaChange({ profile: v })}
          />
        </div>
      </Section>

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title="Take this off the page?"
        description={
          removeTarget
            ? `"${removeTarget.title ?? describePanel(removeTarget.source, steps).title}" will no longer be shown while the workflow runs. The step itself keeps running. Nothing changes until you save.`
            : undefined
        }
        confirmLabel="Take it off"
        variant="destructive"
        onConfirm={() => {
          if (removeTarget) {
            onChange(
              repack({
                ...config,
                readouts: config.readouts.filter((r) => r.id !== removeTarget.id),
              }),
            );
          }
          setRemoveTarget(null);
        }}
      />

      <ConfirmDialog
        open={removeScreen !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveScreen(null);
        }}
        title="Remove this screen?"
        description={
          removeScreen
            ? `Anything on "${removeScreen.title}" moves to the first screen instead of disappearing. Nothing changes until you save.`
            : undefined
        }
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => {
          if (removeScreen) deleteScreen(removeScreen);
          setRemoveScreen(null);
        }}
      />
    </div>
  );
}

// ── The "when does this happen" question ───────────────────────────────────

function MomentPicker({
  moment,
  steps,
  onChange,
}: {
  moment: MomentChoice;
  steps: readonly StepInfo[];
  onChange: (moment: MomentChoice) => void;
}) {
  const needsStep = moment.kind === "stepStarts" || moment.kind === "stepFinishes";
  const nodeId = needsStep && "nodeId" in moment ? moment.nodeId : steps[0]?.id ?? "";
  return (
    <div className="space-y-1.5">
      <SelectField<MomentKind | "custom">
        ariaLabel="When"
        value={moment.kind}
        options={[
          ...MOMENT_KINDS.map((m) => ({ value: m.kind, label: m.label })),
          ...(moment.kind === "custom"
            ? [{ value: "custom" as const, label: "A moment set up elsewhere" }]
            : []),
        ]}
        onChange={(kind) => {
          if (kind === "custom") return;
          if (kind === "stepStarts" || kind === "stepFinishes") {
            onChange({ kind, nodeId: nodeId || steps[0]?.id || "" });
          } else if (kind === "always" || kind === "runFinishes" || kind === "deliverable") {
            onChange({ kind });
          }
        }}
      />
      {needsStep ? (
        <SelectField
          ariaLabel="Which step"
          value={nodeId}
          options={steps.map((s) => ({ value: s.id, label: s.label }))}
          onChange={(id) =>
            onChange({ kind: moment.kind as "stepStarts" | "stepFinishes", nodeId: id })
          }
        />
      ) : null}
    </div>
  );
}

// ── The "add something" picker ─────────────────────────────────────────────

function AddPanelPicker({
  steps,
  onPick,
  onCancel,
}: {
  steps: readonly StepInfo[];
  onPick: (source: ReadoutSource, base: string, width: PanelWidth) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matching = steps.filter(
    (s) => !needle || s.label.toLowerCase().includes(needle) || s.role.toLowerCase().includes(needle),
  );
  const ranked = [...matching].sort(
    (a, b) => Number(b.worthWatching) - Number(a.worthWatching),
  );

  return (
    <div className="space-y-2 rounded-lg border border-primary/40 bg-card p-2.5">
      {!needle ? (
        <div className="space-y-2">
          <ChoiceCard
            icon={<ListChecks className="h-4 w-4" />}
            title="A progress checklist"
            detail="Every step, ticking off as it finishes. The calmest way to show a long wait."
            onClick={() => onPick({ kind: "progressRail" }, "progress", "full")}
          />
          <ChoiceCard
            icon={<StickyNote className="h-4 w-4" />}
            title="A note for the reader"
            detail="Your own words, in place on the page."
            onClick={() =>
              onPick(
                { kind: "static", markdown: "Hang tight — this takes a few minutes." },
                "note",
                "full",
              )
            }
          />
        </div>
      ) : null}

      <div className="space-y-1.5 pt-1">
        <FieldLabel>A step of this workflow</FieldLabel>
        <TextField
          value={query}
          onChange={setQuery}
          placeholder="Search the steps…"
          ariaLabel="Search the steps"
        />
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {ranked.map((step) => (
            <ChoiceCard
              key={step.id}
              icon={
                step.isSubWorkflow ? (
                  <Workflow className="h-4 w-4" />
                ) : step.asksThePerson ? (
                  <MousePointerClick className="h-4 w-4" />
                ) : undefined
              }
              title={step.label}
              detail={step.role}
              onClick={() =>
                onPick(
                  step.isSubWorkflow
                    ? { kind: "childRun", nodeId: step.id }
                    : { kind: "node", nodeId: step.id },
                  step.label,
                  "half",
                )
              }
            />
          ))}
          {ranked.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">
              No step matches “{query}”.
            </p>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="w-full rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}
