"use client";

// features/settings/universal/KnobRungOverrides.tsx
//
// THE PER-RUNG OVERRIDE PICKER (DD-183) — the exceptions one key carries at
// the rungs that are keyed by a ROW: a table, an agent, a pay group, a site,
// a location, a brand, an employer profile.
//
// WHY IT EXISTS. `platform.feature_knob.overridable_by` is the one field that
// decides whether a person is shown a control. Eight `records.confirmation.*`
// keys say `{organization, table}` or `{organization, agent}`; the database
// honours them per table on every write (`platform._stamp_actor_tier` resolves
// `confirmation.table_allows_born_confirmed` with the row's own table id). The
// settings screen could reach exactly two rungs — the organization and the
// person — so "this table is different" was a promise the registry made and
// the screen could not keep. `check:settings-ladder-ui` calls that class
// UNADDRESSED, and it is the same defect as a control that saves a value
// nothing honours, seen from the other side.
//
// THE SHAPE, AND WHOSE IT IS. Salesforce's per-object override tables, Stripe's
// and Linear's settings exceptions: the setting states ONE value plainly, and
// the exceptions to it live in a quiet disclosure underneath — closed by
// default, counted when closed, one row per exception, each row removable, and
// an explicit "add one" that opens a SEARCHABLE list of real rows rather than a
// free-text box for an id. Nobody types a uuid.
//
// WHAT IT REUSES, AND WHAT IT DOES NOT RE-MAKE:
//   • the rows come from `fetchScopeRows` — the ONE scope-rows door
//     (`platform.knob_scope_rows`), which is driven by `knob_scope_kind`'s own
//     `scope_schema`/`scope_table`, so a NEW rung needs no code here;
//   • every editor is `KnobOverrideRow`, THE one editor row, mounted at the
//     picked scope with only the scope changing (settings-ladder rule 2);
//   • every write is `knob_override_set` through `setKnobOverride`, and a
//     removal is that same door with a NULL value, which DELETES the row;
//   • the list of standing overrides comes from the settings context, which
//     caches it per key (`loadRungOverrides`).
//
// HONEST STATES (law 4), each said in a sentence, never as an empty box:
//   • the rung has no rows at all → why, naming the rung and the organization;
//   • the door refused → the sentence the door carried, not "failed";
//   • a person who may not write here → the exceptions are listed read-only and
//     the add control is ABSENT, never a dead button;
//   • a picked row with no value yet → it says it is not saved and what to do.

import { useEffect, useState } from "react";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { KnobOverrideRow } from "@/lib/scoped-config/KnobOverrideRow";
import { resolveKnobLadder, rungName, type KnobLadder } from "@/lib/scoped-config/ladder";
import type { KnobRungOverrideRow } from "@/lib/scoped-config/service";
import type { KnobScopeKindName, ScopedKnob } from "@/lib/scoped-config/types";
import { extractErrorMessage } from "@/utils/errors";
import {
  fetchScopeRows,
  pickableRungsFor,
  scopeKindNoun,
  type ScopeRow,
  type SubOrgScopeKind,
} from "./scopeRows";
import { useUniversalSettings } from "./UniversalSettingsContext";

/** "Table" → "table"; used inside sentences, never as a heading. */
function nounWord(kind: SubOrgScopeKind): string {
  return scopeKindNoun(kind).toLowerCase();
}

function plural(kind: SubOrgScopeKind): string {
  const word = nounWord(kind);
  return word.endsWith("s") ? word : `${word}s`;
}

/**
 * The ladder for ONE picked scope row.
 *
 * `resolveKnobLadder` answers for a RUNG — the chain, the parent a clear falls
 * back to, and whether this caller may write there — and the server builds that
 * chain from `overridable_by`, so the rung is present even when this screen
 * addressed no particular row (`scope_id: null`). What the server cannot know
 * is WHICH row we mean, so the row's own standing value is substituted here,
 * read from the same override store `knob_resolve` reads. Everything else —
 * the parent, the inherited value, the write gate — is the server's answer,
 * unchanged.
 */
export function ladderForScopeRow(
  knob: ScopedKnob,
  kind: KnobScopeKindName,
  scopeId: string,
  override: { value: unknown } | null,
  context: { isOrgAdmin: boolean },
): KnobLadder {
  const base = resolveKnobLadder(knob, kind, { isOrgAdmin: context.isOrgAdmin });
  const here = base.here ?? {
    kind,
    precedence: 0,
    scope_id: null,
    value: null,
    is_set: false,
    locked: false,
    is_effective: false,
  };
  if (!override) {
    return { ...base, here: { ...here, scope_id: scopeId, is_set: false }, setHere: false };
  }
  return {
    ...base,
    here: { ...here, scope_id: scopeId, value: override.value, is_set: true },
    setHere: true,
    value: override.value,
    originLabel: "Set here",
  };
}

/** What a save at ONE picked row reaches — rule 9, with the row named. */
export function scopeBlastRadius(
  kind: SubOrgScopeKind,
  label: string,
  organizationName: string | null,
): string {
  const org = organizationName ?? "this organization";
  return `Applies to the ${nounWord(kind)} “${label}” in ${org}, and to nothing else — every other ${nounWord(kind)} keeps ${rungName("organization")}’s value.`;
}

/** One rung's searchable list of rows, minus the ones already overridden. */
function ScopeRowPicker({
  kind,
  organizationId,
  organizationName,
  taken,
  onPick,
}: {
  kind: SubOrgScopeKind;
  organizationId: string;
  organizationName: string | null;
  taken: ReadonlySet<string>;
  onPick: (row: ScopeRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ScopeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (rows !== null || busy) return;
    setBusy(true);
    setError(null);
    void fetchScopeRows(kind, organizationId)
      .then((result) => setRows(result))
      .catch((err: unknown) => setError(extractErrorMessage(err)))
      .finally(() => setBusy(false));
  };

  const available = (rows ?? []).filter((row) => !taken.has(row.id));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs">
          <Plus className="mr-1 h-3.5 w-3.5" />
          {`Add override for a ${nounWord(kind)}…`}
          <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        {busy ? (
          <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {`Reading the ${plural(kind)}…`}
          </p>
        ) : error ? (
          // The door's own sentence. An empty list here would say "there are
          // none", which is a different — and false — statement.
          <div className="space-y-2 p-3 text-xs">
            <p className="text-destructive">{error}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                setRows(null);
                setError(null);
                load();
              }}
            >
              Try again
            </Button>
          </div>
        ) : rows !== null && rows.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            {`No ${nounWord(kind)} is registered for ${organizationName ?? "this organization"} yet, so there is nothing to set an exception for.`}
          </p>
        ) : rows !== null && available.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            {`Every ${nounWord(kind)} already has its own value for this setting.`}
          </p>
        ) : (
          <Command>
            <CommandInput placeholder={`Search ${plural(kind)}…`} className="h-8 text-xs" />
            <CommandList className="max-h-72">
              <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                {`No matching ${nounWord(kind)}.`}
              </CommandEmpty>
              <CommandGroup heading={`${available.length} ${plural(kind)}`}>
                {available.map((row) => (
                  <CommandItem
                    key={row.id}
                    value={row.label}
                    onSelect={() => {
                      setOpen(false);
                      onPick(row);
                    }}
                    className="text-xs"
                  >
                    <span className="truncate">{row.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** A row a person picked but has not valued yet. It is not an override until saved. */
type Draft = { kind: SubOrgScopeKind; row: ScopeRow };

export function KnobRungOverrides({ knob }: { knob: ScopedKnob }) {
  const {
    organizationId,
    organizationName,
    canManageOrganization,
    rungOverrides,
    loadRungOverrides,
    reloadRungOverrides,
    refresh,
  } = useUniversalSettings();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [labels, setLabels] = useState<Record<string, ScopeRow[]>>({});

  const kinds = pickableRungsFor(knob.overridable_by);
  if (kinds.length === 0 || !organizationId) return null;

  const state = rungOverrides[knob.full_key];
  const rows = state?.status === "ready" ? state.rows : [];
  const heading = kinds.map((kind) => plural(kind)).join(", ");

  // Labels for the rows that ALREADY hold a value: a person must never be shown
  // a uuid. Loaded per rung the first time this panel opens.
  const ensureLabels = (kind: SubOrgScopeKind) => {
    if (labels[kind]) return;
    void fetchScopeRows(kind, organizationId)
      .then((result) => setLabels((prior) => ({ ...prior, [kind]: result })))
      .catch(() => {
        // A label read that fails leaves the row identified by its rung and id
        // below, with the reason stated there — never a blank name.
        setLabels((prior) => ({ ...prior, [kind]: [] }));
      });
  };

  const labelFor = (kind: SubOrgScopeKind, scopeId: string): string | null =>
    labels[kind]?.find((row) => row.id === scopeId)?.label ?? null;

  const open = () => {
    loadRungOverrides(knob);
    for (const kind of kinds) ensureLabels(kind);
  };

  const afterWrite = () => {
    reloadRungOverrides(knob);
    refresh();
  };

  const overrideRow = (
    kind: SubOrgScopeKind,
    scopeId: string,
    label: string,
    override: KnobRungOverrideRow | null,
  ) => (
    <KnobOverrideRow
      key={`${kind}:${scopeId}`}
      knob={knob}
      scopeKind={kind}
      scopeId={scopeId}
      scopeLabel={label}
      organizationId={organizationId}
      ladder={ladderForScopeRow(knob, kind, scopeId, override, {
        isOrgAdmin: canManageOrganization,
      })}
      blastRadius={scopeBlastRadius(kind, label, organizationName)}
      hideKey
      onChanged={() => {
        setDrafts((prior) =>
          prior.filter((draft) => !(draft.kind === kind && draft.row.id === scopeId)),
        );
        afterWrite();
      }}
    />
  );

  return (
    <SettingsSection
      title={`Exceptions by ${heading}`}
      description={
        state?.status === "ready"
          ? rows.length === 0
            ? `No ${heading} set their own value for this setting yet.`
            : `${rows.length} ${rows.length === 1 ? "exception" : "exceptions"} to the value above.`
          : undefined
      }
      emphasis="subtle"
      collapsible
      defaultOpen={false}
      action={
        canManageOrganization ? (
          <div className="flex flex-wrap gap-2">
            {kinds.map((kind) => (
              <ScopeRowPicker
                key={kind}
                kind={kind}
                organizationId={organizationId}
                organizationName={organizationName}
                taken={
                  new Set([
                    ...rows.filter((row) => row.scope_kind === kind).map((row) => row.scope_id),
                    ...drafts.filter((draft) => draft.kind === kind).map((draft) => draft.row.id),
                  ])
                }
                onPick={(row) => {
                  setLabels((prior) => ({
                    ...prior,
                    [kind]: [...(prior[kind] ?? []), row].filter(
                      (entry, index, all) => all.findIndex((x) => x.id === entry.id) === index,
                    ),
                  }));
                  setDrafts((prior) => [...prior, { kind, row }]);
                }}
              />
            ))}
          </div>
        ) : undefined
      }
    >
      <ExceptionsBody
        onMount={open}
        status={state?.status ?? "idle"}
        message={state?.status === "error" ? state.message : null}
        onRetry={() => reloadRungOverrides(knob)}
        canManageOrganization={canManageOrganization}
        heading={heading}
        empty={rows.length === 0 && drafts.length === 0}
      >
        {rows.map((row) => {
          const kind = row.scope_kind as SubOrgScopeKind;
          const label = labelFor(kind, row.scope_id);
          return overrideRow(
            kind,
            row.scope_id,
            label ?? `This ${nounWord(kind)} could not be named (${row.scope_id})`,
            row,
          );
        })}
        {drafts.map((draft) => (
          <div key={`draft:${draft.kind}:${draft.row.id}`}>
            {overrideRow(draft.kind, draft.row.id, draft.row.label, null)}
            <div className="flex items-center justify-between gap-2 px-4 pb-2 text-xs text-muted-foreground">
              <span>
                {`Not saved yet — choose a value above and it becomes this ${nounWord(draft.kind)}’s own.`}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={() =>
                  setDrafts((prior) =>
                    prior.filter(
                      (entry) => !(entry.kind === draft.kind && entry.row.id === draft.row.id),
                    ),
                  )
                }
              >
                Discard
              </Button>
            </div>
          </div>
        ))}
      </ExceptionsBody>
    </SettingsSection>
  );
}

/**
 * The disclosure's body. It exists as its own component so that OPENING the
 * section is what triggers the read: the section owns the open state, so the
 * body simply does not exist until it is open, and a mount is the signal.
 */
function ExceptionsBody({
  onMount,
  status,
  message,
  onRetry,
  canManageOrganization,
  heading,
  empty,
  children,
}: {
  onMount: () => void;
  status: "idle" | "loading" | "ready" | "error";
  message: string | null;
  onRetry: () => void;
  canManageOrganization: boolean;
  heading: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  // The read happens ON MOUNT, in an effect: the section only renders this body
  // when it is open, so a mount IS the "someone opened the exceptions" signal —
  // and a read started during render would be a state update in the settings
  // provider while this component is still rendering.
  useEffect(() => {
    onMount();
    // Intentionally once per open: `onMount` is recreated every render (it
    // closes over the knob), and re-running it on every render is the request
    // loop this cache exists to prevent. The context itself is idempotent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "error") {
    return (
      <SettingsCallout tone="error" title="The exceptions could not be read">
        <p>{message}</p>
        <div className="mt-3">
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </SettingsCallout>
    );
  }
  if (status !== "ready") {
    return (
      <p className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Reading the exceptions…
      </p>
    );
  }
  if (empty) {
    return (
      <p className="px-4 py-2 text-xs text-muted-foreground">
        {canManageOrganization
          ? `Nothing overrides the value above. Add one for a specific ${heading.replace(/s$/, "")} when it needs to differ.`
          : `Nothing overrides the value above. An owner or admin sets exceptions by ${heading}.`}
      </p>
    );
  }
  return <>{children}</>;
}
