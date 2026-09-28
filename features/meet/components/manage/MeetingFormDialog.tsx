"use client";

// features/meet/components/manage/MeetingFormDialog.tsx
//
// THE ONE MEETING FORM — create, edit, reschedule and duplicate (PARITY 1.5:
// "same form for create and edit"). Google Calendar's event editor is the bar:
// title, when (date, start, length, zone — defaulting to the browser's), repeat
// with a real editor, guests, agenda, and the meeting's settings; the defaults
// shown are the person's own knobs and only what they change is sent.
//
// A RECURRING meeting opened from one occurrence asks, when its timing changed,
// "This occurrence" (an exception row, the series untouched) or "All
// occurrences" (the series moves by the same amount). "Notify guests" is on by
// default and sends through `announce` — the update email with its `.ics`.

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useEffect, useState } from "react";
import {
  CalendarSearch,
  Clock,
  Globe,
  LayoutTemplate,
  Loader2,
  PenLine,
  Settings2,
  Users,
  Workflow,
} from "lucide-react";
import {
  type MeetingInvitee,
  type MeetingRecord,
  type RecordingPolicy,
} from "@ai-matrx/meet/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OptionCombobox } from "@/components/official/option-combobox/OptionCombobox";
import { toast } from "@/lib/toast";
import { RecurrenceEditor } from "@/features/meet/components/manage/RecurrenceEditor";
import { GuestPicker } from "@/features/meet/components/manage/GuestPicker";
import { useMeetDefaults } from "@/features/meet/hooks/useMeetDefaults";
import { useMeetPlanningKnobs } from "@/features/meet/hooks/useMeetPlanningKnobs";
import { useFindTime } from "@/features/meet/hooks/useFindTime";
import { useMeetTemplates } from "@/features/meet/hooks/useMeetTemplates";
import { useMeetPrepStream } from "@/features/meet/hooks/useMeetPrepStream";
import { applyTemplate } from "@/features/meet/lib/meeting-template";
import { FindTimePanel } from "@/features/meet/components/manage/FindTimePanel";
import {
  AfterMeetingWorkflows,
  afterWorkflowIds,
} from "@/features/meet/components/manage/AfterMeetingWorkflows";
import {
  errorSentence,
  useMeetingActions,
} from "@/features/meet/hooks/useMeetingActions";
import {
  DURATION_CHOICES,
  RECORDING_POLICY_LABELS,
  changedSettings,
  changesTiming,
  draftChanges,
  draftProblem,
  draftSchedule,
  duplicateDraft,
  durationLabel,
  emptyDraft,
  inviteeDiff,
  meetingToDraft,
  type MeetingDraft,
} from "@/features/meet/lib/meeting-draft";
import {
  browserTimeZone,
  timeZoneOptions,
  utcToZoned,
  zoneLabel,
  zonedToUtcIso,
} from "@/features/meet/lib/zoned-time";

export interface OccurrenceRef {
  /** The start the rule generates — the key of an exception. */
  readonly originalStart: string;
  /** When it actually happens (moved or not). */
  readonly occurrenceStart: string;
  readonly durationMinutes: number | null;
}

/** What a create form starts from besides the person's defaults: a template or a calendar event. */
export interface MeetingPrefill {
  readonly patch?: Partial<MeetingDraft>;
  readonly afterWorkflows?: readonly string[];
}

export type MeetingFormMode =
  | { readonly kind: "create"; readonly prefill?: MeetingPrefill }
  | {
      readonly kind: "edit";
      readonly meeting: MeetingRecord;
      readonly invitees: readonly MeetingInvitee[];
      readonly occurrence?: OccurrenceRef | null;
    }
  | {
      readonly kind: "duplicate";
      readonly meeting: MeetingRecord;
      readonly invitees: readonly MeetingInvitee[];
    };

function initialDraft(
  mode: MeetingFormMode,
  zone: string,
  defaults: ReturnType<typeof useMeetDefaults>,
): MeetingDraft {
  if (mode.kind === "create") {
    const base = emptyDraft(
      zone,
      new Date(),
      defaults.settings,
      defaults.durationMinutes,
    );
    return mode.prefill?.patch ? { ...base, ...mode.prefill.patch } : base;
  }
  const base = meetingToDraft(mode.meeting, mode.invitees, zone);
  if (mode.kind === "duplicate") return duplicateDraft(base);
  if (mode.occurrence) {
    const at = utcToZoned(mode.occurrence.occurrenceStart, base.timeZone);
    return {
      ...base,
      date: at.date,
      time: at.time,
      durationMinutes: mode.occurrence.durationMinutes ?? base.durationMinutes,
    };
  }
  return base;
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      {children}
    </div>
  );
}

export function MeetingFormDialog({
  open,
  onOpenChange,
  mode,
  onSaved,
  reschedule = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: MeetingFormMode;
  onSaved: (meeting: MeetingRecord) => void;
  /** Only the "when": date, time, length, zone and repeat. */
  reschedule?: boolean;
}) {
  const actions = useMeetingActions();
  const defaults = useMeetDefaults(actions.organizationId, actions.userId);
  const [zone] = useState(browserTimeZone);
  const [draft, setDraft] = useState<MeetingDraft>(() =>
    initialDraft(mode, zone, defaults),
  );
  const [customRepeat, setCustomRepeat] = useState(false);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scopeAsk, setScopeAsk] = useState(false);
  const [scope, setScope] = useState<"occurrence" | "series">("occurrence");
  const [touchedSettings, setTouchedSettings] = useState(false);
  const planning = useMeetPlanningKnobs(actions.organizationId, actions.userId);
  const findTime = useFindTime();
  const templates = useMeetTemplates(actions.organizationId, actions.userId);
  const agendaDraft = useMeetPrepStream(
    `meet-agenda:${mode.kind === "create" ? "new" : mode.meeting.id}`,
    "Drafting an agenda",
  );
  const [pendingAgenda, setPendingAgenda] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>("");
  const initialAfter =
    mode.kind === "create"
      ? [...(mode.prefill?.afterWorkflows ?? [])]
      : afterWorkflowIds(mode.meeting.metadata);
  const [afterWorkflows, setAfterWorkflows] = useState<string[]>(initialAfter);
  const [savedAfter] = useState<string[]>(initialAfter);

  // A create form shows the person's own defaults once they load, unless they
  // already changed a setting.
  useEffect(() => {
    if (mode.kind !== "create" || !defaults.loaded || touchedSettings) return;
    const patch = mode.prefill?.patch;
    setDraft((d) => ({
      ...d,
      settings: { ...defaults.settings, ...(patch?.settings ?? {}) },
      durationMinutes: patch?.durationMinutes ?? defaults.durationMinutes,
    }));
  }, [defaults, mode.kind, touchedSettings]);

  const set = (patch: Partial<MeetingDraft>) =>
    setDraft((d) => ({ ...d, ...patch }));
  const setSetting = (patch: Partial<MeetingDraft["settings"]>) => {
    setTouchedSettings(true);
    setDraft((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  };

  const problem = draftProblem(draft);
  let startParts = utcToZoned(new Date().toISOString(), draft.timeZone);
  try {
    startParts = utcToZoned(
      zonedToUtcIso(draft.date, draft.time, draft.timeZone),
      draft.timeZone,
    );
  } catch {
    /* the problem sentence covers an incomplete date */
  }

  const editing = mode.kind === "edit" ? mode : null;
  const isSeriesOccurrence =
    editing !== null &&
    !!editing.meeting.recurrenceRule &&
    !!editing.occurrence;
  const hasGuests =
    draft.invitees.length > 0 || (editing?.invitees.length ?? 0) > 0;

  const finish = (meeting: MeetingRecord, message: string) => {
    toast.success(message);
    onSaved(meeting);
    onOpenChange(false);
  };

  const saveEdit = async (chosenScope: "occurrence" | "series") => {
    if (!editing) return;
    const meeting = editing.meeting;
    let changes = draftChanges(meeting, draft);
    let updated = meeting;
    const occurrence = editing.occurrence ?? null;

    if (isSeriesOccurrence && occurrence && changesTiming(changes)) {
      const newStart = zonedToUtcIso(draft.date, draft.time, draft.timeZone);
      if (chosenScope === "occurrence") {
        await actions.setOccurrence({
          meetingId: meeting.id,
          originalStart: occurrence.originalStart,
          action: "move",
          newStart,
          newDurationMinutes: draft.durationMinutes,
        });
        const {
          scheduledFor: _s,
          scheduledDurationMinutes: _d,
          ...rest
        } = changes;
        void _s;
        void _d;
        changes = rest;
      } else if (meeting.scheduledFor !== null) {
        // The whole series moves by the same amount this occurrence moved.
        const shift =
          new Date(newStart).getTime() -
          new Date(occurrence.occurrenceStart).getTime();
        changes = {
          ...changes,
          scheduledFor: new Date(
            new Date(meeting.scheduledFor).getTime() + shift,
          ).toISOString(),
        };
        if (changes.recurrenceRule === undefined && shift !== 0) {
          // Keep the rule's weekday in step with the moved start.
          const series = {
            ...draft,
            ...{
              date: utcToZoned(changes.scheduledFor!, draft.timeZone).date,
              time: utcToZoned(changes.scheduledFor!, draft.timeZone).time,
            },
          };
          const rebuilt = draftSchedule(series).recurrenceRule;
          if (rebuilt !== (meeting.recurrenceRule ?? null))
            changes = { ...changes, recurrenceRule: rebuilt };
        }
      }
    }

    if (Object.keys(changes).length > 0)
      updated = await actions.update(meeting, changes);
    const diff = inviteeDiff(editing.invitees, draft.invitees);
    if (diff.add.length + diff.remove.length + diff.roleChanges.length > 0) {
      await actions.applyInvitees(meeting.id, diff);
    }
    if (afterWorkflows.join(",") !== savedAfter.join(",")) {
      await actions.setAfterWorkflows(meeting.id, afterWorkflows);
    }
    if (notify && hasGuests) await actions.announce(meeting.id);
    finish(
      updated,
      chosenScope === "occurrence" &&
        isSeriesOccurrence &&
        changesTiming(draftChanges(meeting, draft))
        ? "This occurrence was moved."
        : "Meeting saved.",
    );
  };

  const submit = async (chosenScope: "occurrence" | "series" = scope) => {
    if (problem !== null || saving) return;
    setSaving(true);
    try {
      if (editing) {
        await saveEdit(chosenScope);
      } else {
        const sent =
          mode.kind === "create"
            ? changedSettings(draft.settings, defaults.settings)
            : draft.settings;
        const meeting = await actions.create(
          draft,
          sent,
          notify,
          afterWorkflows,
        );
        finish(meeting, "Meeting scheduled.");
      }
    } catch (thrown) {
      toast.error(errorSentence(thrown));
    } finally {
      setSaving(false);
      setScopeAsk(false);
    }
  };

  const onSave = () => {
    if (
      isSeriesOccurrence &&
      editing &&
      changesTiming(draftChanges(editing.meeting, draft))
    ) {
      setScopeAsk(true);
      return;
    }
    void submit("series");
  };

  const guestName = (userId: string) =>
    userId === actions.userId
      ? "you"
      : (draft.invitees.find((i) => i.userId === userId)?.displayName ??
        draft.invitees.find((i) => i.userId === userId)?.email ??
        "A guest");

  const runFindTime = () => {
    const hostId = editing?.meeting.hostUserId ?? actions.userId;
    const ids = [
      ...(hostId ? [hostId] : []),
      ...draft.invitees.flatMap((i) => (i.userId ? [i.userId] : [])),
    ];
    void findTime.find({
      userIds: ids,
      zone: draft.timeZone,
      durationMinutes: draft.durationMinutes,
      knobs: planning,
    });
  };

  const runAgendaDraft = async () => {
    if (!actions.organizationId || draft.title.trim() === "") return;
    setPendingAgenda(null);
    let scheduledFor: string | null = null;
    try {
      scheduledFor = zonedToUtcIso(draft.date, draft.time, draft.timeZone);
    } catch {
      scheduledFor = null;
    }
    const text = await agendaDraft.start({
      kind: "agenda",
      body: {
        organization_id: actions.organizationId,
        meeting_id: editing?.meeting.id ?? null,
        title: draft.title.trim(),
        agenda: draft.agenda.trim() || null,
        scheduled_for: scheduledFor,
        time_zone: draft.timeZone,
        duration_minutes: draft.durationMinutes,
        recurrence_rule: draftSchedule(draft).recurrenceRule,
        guests: draft.invitees.map((i) => ({
          user_id: i.userId,
          email: i.email,
          name: i.displayName,
          cohost: i.cohost,
        })),
      },
    });
    if (text === null) return;
    if (draft.agenda.trim() === "") set({ agenda: text });
    else setPendingAgenda(text);
  };

  const chooseTemplate = (id: string) => {
    const template = templates.templates.find((t) => t.id === id);
    if (!template) return;
    setTemplateId(id);
    setTouchedSettings(true);
    setDraft((d) => applyTemplate(d, template));
    setAfterWorkflows([...template.afterWorkflows]);
  };

  const title = reschedule
    ? `Reschedule “${draft.title}”`
    : mode.kind === "create"
      ? "New meeting"
      : mode.kind === "duplicate"
        ? "Duplicate meeting"
        : "Edit meeting";

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => (!saving ? onOpenChange(next) : undefined)}
      >
        <DialogContent className="flex max-h-[92dvh] max-w-2xl flex-col gap-0 p-0">
          <DialogHeader className="flex-row items-center gap-2 space-y-0 border-b border-border px-5 py-3">
            <DialogTitle className="text-base">{title}</DialogTitle>
            {!editing && !reschedule && templates.templates.length > 0 ? (
              <Select value={templateId} onValueChange={chooseTemplate}>
                <SelectTrigger
                  className="ml-auto h-8 w-44 gap-1.5 text-xs"
                  aria-label="Start from a template"
                >
                  <LayoutTemplate
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <SelectValue placeholder="From a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.templates.map((t) => (
                    <SelectItem key={`${t.scope}:${t.id}`} value={t.id}>
                      {t.name}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {t.scope === "organization" ? "Organization" : "Mine"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <DialogDescription className="sr-only">
              Title, time, repeat, guests, agenda and settings for this meeting.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {reschedule ? null : (
              <Input
                value={draft.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Add title"
                aria-label="Title"
                className="h-11 text-lg font-medium"
                autoFocus={mode.kind === "create"}
              />
            )}

            <section className="space-y-3" aria-label="When">
              <div className="flex flex-wrap items-center gap-2">
                <Clock
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="date"
                  value={draft.date}
                  onChange={(e) => set({ date: e.target.value })}
                  className="h-9 w-40"
                  aria-label="Date"
                />
                <Input
                  type="time"
                  step={300}
                  value={draft.time}
                  onChange={(e) => set({ time: e.target.value })}
                  className="h-9 w-32"
                  aria-label="Start time"
                />
                <Select
                  value={String(draft.durationMinutes)}
                  onValueChange={(v) => set({ durationMinutes: Number(v) })}
                >
                  <SelectTrigger className="h-9 w-32" aria-label="Duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([...DURATION_CHOICES, draft.durationMinutes])]
                      .sort((a, b) => a - b)
                      .map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {durationLabel(m)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5"
                  onClick={runFindTime}
                  disabled={findTime.loading}
                >
                  {findTime.loading ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <CalendarSearch className="h-4 w-4" aria-hidden="true" />
                  )}
                  Find a time
                </Button>
              </div>
              {findTime.loading || findTime.failure || findTime.result ? (
                <FindTimePanel
                  loading={findTime.loading}
                  failure={findTime.failure}
                  result={findTime.result}
                  durationMinutes={draft.durationMinutes}
                  horizonDays={planning.horizonDays}
                  emailOnlyGuests={
                    draft.invitees.filter((i) => !i.userId).length
                  }
                  nameOf={guestName}
                  selected={`${draft.date} ${draft.time}`}
                  onPick={(slot) => set({ date: slot.date, time: slot.time })}
                  onClose={findTime.clear}
                />
              ) : null}
              <div className="flex items-center gap-2">
                <Globe
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="w-full sm:w-72">
                  <OptionCombobox
                    value={draft.timeZone}
                    onChange={(tz) => set({ timeZone: tz })}
                    options={timeZoneOptions(draft.timeZone)}
                    getLabel={(tz) => zoneLabel(tz)}
                    getHint={(tz) => (tz.includes("/") ? tz : null)}
                    searchable
                    searchPlaceholder="Search time zones"
                    ariaLabel="Time zone"
                  />
                </div>
              </div>
              <RecurrenceEditor
                value={draft.recurrence}
                onChange={(recurrence) => set({ recurrence })}
                start={startParts}
                custom={customRepeat}
                onCustomChange={setCustomRepeat}
              />
              {isSeriesOccurrence ? (
                <p className="pl-6 text-xs text-muted-foreground">
                  You opened one occurrence. Changing its time asks whether to
                  move just this one or every occurrence; title, agenda, guests
                  and settings apply to the whole series.
                </p>
              ) : null}
            </section>

            {reschedule ? null : (
              <>
                <section className="space-y-2" aria-label="Guests">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Users
                      className="h-4 w-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    Guests
                  </div>
                  <GuestPicker
                    guests={draft.invitees}
                    onChange={(invitees) => set({ invitees })}
                    organizationId={actions.organizationId}
                    hostUserId={editing?.meeting.hostUserId ?? actions.userId}
                  />
                </section>

                <section className="space-y-2" aria-label="Agenda">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="meeting-agenda"
                      className="text-sm font-medium"
                    >
                      Agenda
                    </Label>
                    {draft.title.trim() !== "" && actions.organizationId ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-7 gap-1.5 px-2 text-xs"
                        onClick={() => void runAgendaDraft()}
                        disabled={agendaDraft.run.status === "running"}
                      >
                        {agendaDraft.run.status === "running" ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Draft agenda
                      </Button>
                    ) : null}
                  </div>
                  <Textarea
                    id="meeting-agenda"
                    value={draft.agenda}
                    onChange={(e) => set({ agenda: e.target.value })}
                    placeholder="What this meeting is for, and what you want to leave with"
                    rows={4}
                  />
                  {agendaDraft.run.status === "error" &&
                  agendaDraft.run.error ? (
                    <p role="alert" className="text-xs text-destructive">
                      {agendaDraft.run.error}
                    </p>
                  ) : null}
                  {pendingAgenda !== null ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                      <span className="text-muted-foreground">
                        A drafted agenda is ready (shown in the run window).
                      </span>
                      <div className="ml-auto flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            set({ agenda: pendingAgenda });
                            setPendingAgenda(null);
                          }}
                        >
                          Replace
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            set({
                              agenda: `${draft.agenda.trim()}\n\n${pendingAgenda}`,
                            });
                            setPendingAgenda(null);
                          }}
                        >
                          Add below
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setPendingAgenda(null)}
                        >
                          Discard
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </section>

                <section aria-label="Settings">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Settings2
                      className="h-4 w-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    Settings
                  </div>
                  <div className="divide-y divide-border">
                    <SettingRow
                      label="Waiting room"
                      hint="Guests without an invitation wait until you let them in."
                    >
                      <Switch
                        checked={draft.settings.lobbyEnabled}
                        onCheckedChange={(v) => setSetting({ lobbyEnabled: v })}
                        aria-label="Waiting room"
                      />
                    </SettingRow>
                    <SettingRow
                      label="Join before host"
                      hint="Invited people can start talking before you arrive."
                    >
                      <Switch
                        checked={draft.settings.joinBeforeHost}
                        onCheckedChange={(v) =>
                          setSetting({ joinBeforeHost: v })
                        }
                        aria-label="Join before host"
                      />
                    </SettingRow>
                    <SettingRow
                      label="AI note-taker"
                      hint="Live notes, answers during the meeting, and a wrap-up after."
                    >
                      <Switch
                        checked={draft.settings.aiEnabled}
                        onCheckedChange={(v) => setSetting({ aiEnabled: v })}
                        aria-label="AI note-taker"
                      />
                    </SettingRow>
                    <SettingRow
                      label="Recording"
                      hint="Everyone is told when a recording starts."
                    >
                      <Select
                        value={draft.settings.recordingPolicy}
                        onValueChange={(v) =>
                          setSetting({ recordingPolicy: v as RecordingPolicy })
                        }
                      >
                        <SelectTrigger
                          className="h-8 w-48"
                          aria-label="Recording"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            Object.keys(
                              RECORDING_POLICY_LABELS,
                            ) as RecordingPolicy[]
                          ).map((p) => (
                            <SelectItem key={p} value={p}>
                              {RECORDING_POLICY_LABELS[p]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </SettingRow>
                    <div className="py-2">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Workflow
                          className="h-3.5 w-3.5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        After the meeting
                      </div>
                      <div className="mb-1.5 text-xs text-muted-foreground">
                        Workflows that run when it ends, with its summary,
                        decisions and action items.
                      </div>
                      <AfterMeetingWorkflows
                        value={afterWorkflows}
                        onChange={setAfterWorkflows}
                      />
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>

          <DialogFooter className="flex-row flex-wrap items-center gap-2 border-t border-border px-5 py-3 sm:justify-between mx-0 pb-3">
            {hasGuests ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={notify}
                  onCheckedChange={(v) => setNotify(v === true)}
                  aria-label="Email guests"
                />
                Email guests {editing ? "the update" : "an invitation"}
              </label>
            ) : (
              <span className="text-xs text-muted-foreground">
                {problem ?? ""}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {hasGuests && problem ? (
                <span className="text-xs text-muted-foreground">
                  {problem}
                  <ErrorAlchemyMenu error={problem} size="xs" />
                </span>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={onSave}
                disabled={problem !== null || saving}
              >
                {saving ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {editing ? "Save" : "Schedule"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={scopeAsk}
        onOpenChange={(v) => (!saving ? setScopeAsk(v) : undefined)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              Change a recurring meeting
            </DialogTitle>
            <DialogDescription>
              Which occurrences get the new time?
            </DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={scope}
            onValueChange={(v) => setScope(v as "occurrence" | "series")}
            className="space-y-2"
          >
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="occurrence" /> This occurrence
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="series" /> All occurrences
            </label>
          </RadioGroup>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setScopeAsk(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void submit(scope)} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
