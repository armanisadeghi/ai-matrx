"use client";

// Users & Access › Limits & Knobs › Feature knobs — EVERY LEVEL OF ONE KEY.
//
// The row above this panel edits the platform default (what everyone gets).
// This panel is the rest of the ladder for the same key, in one place:
//   • every override any organization or person holds — level, who, value,
//     who set it, when — each changeable and removable;
//   • add an override for an organization or a person, picked by NAME from
//     searchable lists (nobody types an id);
//   • what one person in one organization ACTUALLY gets, and which layer
//     decided it — `knob_index`'s own answer, never recomputed.
//
// Arman 2026-09-26: defaults for everyone in the admin dashboard, then
// overridden per-org and per-user as needed. Before this panel the admin screen
// set only the default; overrides were reachable only one organization at a
// time from that organization's own Configuration page. Writes go through the
// door the key declares (`writeAdminKnobOverride`), the same door that page's
// exceptions use. Admin scope only: no "Mine", no "My org" — platform scopes.

import { useEffect, useState } from "react";
import { Check, ChevronDown, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input, Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";
import { formatRelativeTime } from "@/utils/datetime";
import { knobChoices, knobIsClosedChoice } from "@/lib/scoped-config/choices";
import { fetchPlatformKnobOverrides } from "@/lib/scoped-config/service";
import type { KnobScopeKindName, ScopedKnob } from "@/lib/scoped-config/types";
import {
  effectiveAnswer,
  knobValueWords,
  loadAdminKnobDirectory,
  overrideCountWords,
  overrideTableRows,
  parseAdminDraft,
  personName,
  resolveKnobFor,
  writeAdminKnobOverride,
  type AdminKnobDirectory,
  type AdminOrganization,
  type AdminPerson,
  type EffectiveAnswer,
  type OverrideTableRow,
} from "../knobOverrides";

type PickOption = { id: string; label: string; hint?: string };

/** One searchable name picker (organizations or people). */
function NamePicker({
  placeholder,
  options,
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  placeholder: string;
  options: PickOption[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const picked = value ? options.find((option) => option.id === value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={ariaLabel}
          className="h-7 w-full min-w-0 justify-between px-2 text-xs font-normal"
        >
          <span className={cn("truncate", !picked && "text-muted-foreground")}>
            {picked ? picked.label : placeholder}
          </span>
          <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent sizing="content" className="p-0" align="start">
        <Command>
          <CommandInput autoFocus placeholder="Search by name…" className="h-8 text-xs" />
          <CommandList className="max-h-64">
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">Nothing matches.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  // cmdk's identity must be unique: two organizations can share a name.
                  value={`${option.label} ${option.hint ?? ""} ${option.id}`}
                  onSelect={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 text-xs"
                >
                  <Check className={cn("h-3 w-3 shrink-0", option.id === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{option.label}</span>
                  {option.hint && <span className="truncate text-muted-foreground">{option.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function orgOptions(orgs: AdminOrganization[]): PickOption[] {
  return orgs.map((org) => ({ id: org.id, label: org.name, hint: org.slug }));
}

function peopleOptions(people: AdminPerson[]): PickOption[] {
  return people.map((person) => ({
    id: person.id,
    label: personName(person),
    hint: person.email && person.email !== personName(person) ? person.email : undefined,
  }));
}

function membersOf(directory: AdminKnobDirectory, organizationId: string | null): AdminPerson[] {
  if (!organizationId) return [];
  return directory.people.filter((person) => person.organizations.some((org) => org.id === organizationId));
}

/**
 * The value control: a closed choice is picked (and commits on pick); anything
 * else is typed and committed with Set.
 */
function ValueEditor({
  knob,
  value,
  onCommit,
  busy,
  commitOnPick,
  ariaLabel,
}: {
  knob: ScopedKnob;
  value: unknown;
  onCommit: (value: unknown) => void;
  busy: boolean;
  commitOnPick: boolean;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(value === undefined || value === null ? "" : typeof value === "string" ? value : JSON.stringify(value));
  if (knobIsClosedChoice(knob)) {
    const choices = knobChoices(knob);
    const current = value === undefined || value === null ? undefined : String(value);
    return (
      <Select
        value={current}
        disabled={busy}
        onValueChange={(next) => {
          const choice = choices.find((item) => item.value === next);
          if (choice) onCommit(choice.raw);
        }}
      >
        <SelectTrigger aria-label={ariaLabel} className="h-7 w-full min-w-[6rem] text-xs">
          <SelectValue placeholder={commitOnPick ? "Pick" : "Pick a value"} />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value} description={choice.help}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  const parsed = parseAdminDraft(knob, draft);
  return (
    <div className="flex items-center gap-1">
      <Input
        aria-label={ariaLabel}
        className="h-7 min-w-[6rem] text-xs"
        value={draft}
        disabled={busy}
        onChange={(event) => setDraft(event.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs"
        disabled={busy || parsed.error !== undefined || JSON.stringify(parsed.value) === JSON.stringify(value)}
        title={parsed.error}
        onClick={() => onCommit(parsed.value)}
      >
        Set
      </Button>
    </div>
  );
}

const ADDABLE: Array<{ kind: KnobScopeKindName; label: string }> = [
  { kind: "organization", label: "Organization" },
  { kind: "user", label: "Person" },
];

export function KnobOverridesAdmin({
  knob,
  onChanged,
}: {
  knob: ScopedKnob;
  /** Called after any write so the register's counts and rows refresh. */
  onChanged: () => void;
}) {
  const [directory, setDirectory] = useState<AdminKnobDirectory | null>(null);
  const [rows, setRows] = useState<OverrideTableRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  // Add-an-override draft.
  const addable = ADDABLE.filter((level) => (knob.overridable_by ?? []).includes(level.kind));
  const [addKind, setAddKind] = useState<KnobScopeKindName>(addable[0]?.kind ?? "organization");
  const [addOrg, setAddOrg] = useState<string | null>(null);
  const [addPerson, setAddPerson] = useState<string | null>(null);
  const [addValue, setAddValue] = useState<unknown>(undefined);
  const [addKey, setAddKey] = useState(0);
  const [adding, setAdding] = useState(false);

  // Effective-value probe.
  const [probeOrg, setProbeOrg] = useState<string | null>(null);
  const [probePerson, setProbePerson] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ answer: EffectiveAnswer | null; error: string | null; loading: boolean }>({ answer: null, error: null, loading: false });

  useEffect(() => {
    let current = true;
    void Promise.all([loadAdminKnobDirectory(), fetchPlatformKnobOverrides({ feature: knob.feature, key: knob.key })]).then(
      ([dir, raw]) => {
        if (!current) return;
        setDirectory(dir);
        setRows(overrideTableRows(knob, raw, dir));
        setError(null);
      },
      (cause: unknown) => {
        if (current) setError(extractErrorMessage(cause));
      },
    );
    return () => {
      current = false;
    };
  }, [knob, reload]);

  useEffect(() => {
    if (!probeOrg || !directory) return;
    let current = true;
    setProbe({ answer: null, error: null, loading: true });
    void resolveKnobFor({ knob, organizationId: probeOrg, userId: probePerson }).then(
      (resolved) => {
        if (!current) return;
        const org = directory.organizations.find((item) => item.id === probeOrg);
        const person = probePerson ? directory.people.find((item) => item.id === probePerson) ?? null : null;
        setProbe({ answer: effectiveAnswer(resolved, { organizationName: org?.name ?? "this organization", person }), error: null, loading: false });
      },
      (cause: unknown) => {
        if (current) setProbe({ answer: null, error: extractErrorMessage(cause), loading: false });
      },
    );
    return () => {
      current = false;
    };
  }, [knob, probeOrg, probePerson, directory, reload]);

  const afterWrite = () => {
    setReload((value) => value + 1);
    onChanged();
  };

  const write = async (options: { kind: KnobScopeKindName; organizationId: string; scopeId: string; value: unknown; rowId: string; success: string }) => {
    setBusyRow(options.rowId);
    try {
      const refusal = await writeAdminKnobOverride({ knob, ...options });
      if (refusal) {
        toast.error(refusal);
        return false;
      }
      toast.success(options.success);
      afterWrite();
      return true;
    } catch (cause: unknown) {
      toast.error(extractErrorMessage(cause));
      return false;
    } finally {
      setBusyRow(null);
    }
  };

  const remove = async (row: OverrideTableRow) => {
    const confirmed = await confirm({
      title: `Remove ${row.who}'s override${row.kind === "organization" ? "" : ` in ${row.organizationName}`}?`,
      description: `${row.who} goes back to what the level above gives it for “${knob.label}”. Today that override is ${row.valueWords}.`,
      confirmLabel: "Remove override",
    });
    if (!confirmed) return;
    await write({ kind: row.kind, organizationId: row.organizationId, scopeId: row.scopeId, value: null, rowId: row.id, success: `Removed ${row.who}'s override` });
  };

  const add = async () => {
    if (!directory || !addOrg || addValue === undefined) return;
    if (addKind === "user" && !addPerson) return;
    const scopeId = addKind === "user" ? addPerson! : addOrg;
    const who =
      addKind === "user"
        ? personName(directory.people.find((person) => person.id === addPerson))
        : directory.organizations.find((org) => org.id === addOrg)?.name ?? "the organization";
    setAdding(true);
    const ok = await write({ kind: addKind, organizationId: addOrg, scopeId, value: addValue, rowId: "add", success: `${who} now gets ${knobValueWords(knob, addValue)}` });
    setAdding(false);
    if (ok) {
      setAddValue(undefined);
      setAddPerson(null);
      setAddKey((value) => value + 1);
    }
  };

  if (error) {
    return (
      <p className="text-xs text-destructive">
        The overrides for this setting could not be read: {error} <ErrorAlchemyMenu error={error} />
      </p>
    );
  }
  if (!rows || !directory) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Reading every override for {knob.full_key}…
      </p>
    );
  }

  const orgChoices = orgOptions(directory.organizations);
  const platformLocked = (knob.overridable_by ?? []).length === 0;
  const addTaken = rows.some((row) => row.kind === addKind && row.organizationId === addOrg && row.scopeId === (addKind === "user" ? addPerson : addOrg));

  return (
    <div className="space-y-2 text-xs" data-testid={`knob-overrides-${knob.full_key}`}>
      <p className="text-muted-foreground">
        Platform default <span className="font-medium text-foreground">{knobValueWords(knob, knob.platform_default)}</span>
        {" · "}
        {overrideCountWords(rows)}
        {platformLocked && " · this setting is platform-only, so no organization or person can hold its own value"}
      </p>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-left">
            <thead className="bg-muted/50 text-[11px] text-muted-foreground">
              <tr>
                <th className="px-2 py-1 font-medium">Level</th>
                <th className="px-2 py-1 font-medium">For</th>
                <th className="px-2 py-1 font-medium">In organization</th>
                <th className="px-2 py-1 font-medium">Value</th>
                <th className="px-2 py-1 font-medium">Set by</th>
                <th className="px-2 py-1 font-medium">When</th>
                <th className="w-8 px-1 py-1" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const editable = row.kind === "organization" || row.kind === "user";
                return (
                  <tr key={row.id} className="border-t border-border align-middle">
                    <td className="px-2 py-1 text-muted-foreground">{row.levelLabel}</td>
                    <td className="max-w-[14rem] truncate px-2 py-1 font-medium" title={row.who}>{row.who}</td>
                    <td className="max-w-[14rem] truncate px-2 py-1 text-muted-foreground" title={row.organizationName}>{row.kind === "organization" ? "—" : row.organizationName}</td>
                    <td className="w-40 px-2 py-1">
                      {editable ? (
                        <ValueEditor
                          key={`${row.id}:${JSON.stringify(row.value)}`}
                          knob={knob}
                          value={row.value}
                          busy={busyRow === row.id}
                          commitOnPick
                          ariaLabel={`Value for ${row.who}`}
                          onCommit={(value) => void write({ kind: row.kind, organizationId: row.organizationId, scopeId: row.scopeId, value, rowId: row.id, success: `${row.who} now gets ${knobValueWords(knob, value)}` })}
                        />
                      ) : (
                        <span title="Change this one on the organization's Configuration page">{row.valueWords}</span>
                      )}
                    </td>
                    <td className="max-w-[10rem] truncate px-2 py-1 text-muted-foreground" title={row.note ?? undefined}>{row.setBy ?? "Not recorded"}</td>
                    <td className="whitespace-nowrap px-2 py-1 text-muted-foreground" title={row.setAt ?? undefined}>{row.setAt ? formatRelativeTime(row.setAt) : "Not recorded"}</td>
                    <td className="px-1 py-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        aria-label={`Remove ${row.who}'s override${row.kind === "organization" ? "" : ` in ${row.organizationName}`}`}
                        disabled={busyRow === row.id}
                        onClick={() => void remove(row)}
                      >
                        {busyRow === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {addable.length > 0 && (
        <div className="grid grid-cols-1 items-center gap-1.5 sm:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,1fr)_10rem_auto]">
          <Select value={addKind} onValueChange={(next) => { setAddKind(next as KnobScopeKindName); setAddPerson(null); }}>
            <SelectTrigger aria-label="Override level" className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {addable.map((level) => <SelectItem key={level.kind} value={level.kind}>{level.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <NamePicker
            ariaLabel="Organization for the new override"
            placeholder={`Organization (${orgChoices.length})…`}
            options={orgChoices}
            value={addOrg}
            onChange={(id) => { setAddOrg(id); setAddPerson(null); }}
          />
          {addKind === "user" ? (
            <NamePicker
              ariaLabel="Person for the new override"
              placeholder={addOrg ? `Person in it (${membersOf(directory, addOrg).length})…` : "Pick the organization first"}
              options={peopleOptions(membersOf(directory, addOrg))}
              value={addPerson}
              disabled={!addOrg}
              onChange={setAddPerson}
            />
          ) : (
            <span className="text-muted-foreground">Everyone in it who has no personal value</span>
          )}
          <ValueEditor key={`add:${addKey}`} knob={knob} value={addValue} busy={adding} commitOnPick={false} ariaLabel="Value for the new override" onCommit={setAddValue} />
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={adding || !addOrg || addValue === undefined || (addKind === "user" && !addPerson) || addTaken}
            title={addTaken ? "That override already exists — change it in the table above" : undefined}
            onClick={() => void add()}
          >
            {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add override"}
          </Button>
        </div>
      )}
      {addable.length > 0 && !knobIsClosedChoice(knob) && addValue !== undefined && (
        <p className="text-muted-foreground">New value ready: {knobValueWords(knob, addValue)} — press Add override to save it.</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
        <span className="text-muted-foreground">What does someone get?</span>
        <div className="w-56"><NamePicker ariaLabel="Organization to check" placeholder="Organization…" options={orgChoices} value={probeOrg} onChange={(id) => { setProbeOrg(id); setProbePerson(null); }} /></div>
        <div className="w-56"><NamePicker ariaLabel="Person to check" placeholder={probeOrg ? "Any person in it (optional)…" : "Pick the organization first"} options={peopleOptions(membersOf(directory, probeOrg))} value={probePerson} disabled={!probeOrg} onChange={setProbePerson} /></div>
        {probe.loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {probe.answer && (
          <span data-testid="knob-effective-answer">
            <span className="font-medium">{knobValueWords(knob, probe.answer.value)}</span>
            <span className="text-muted-foreground"> — decided by {probe.answer.decidedBy}</span>
          </span>
        )}
        {probe.error && <span className="text-destructive">Could not resolve: {probe.error}</span>}
      </div>
    </div>
  );
}
