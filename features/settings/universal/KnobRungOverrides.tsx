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
 * "a table" / "an employer profile". DD-203 is what made this visible: until HR
 * mounted this panel every rung on screen began with a consonant, so the
 * hard-coded "a" was invisibly wrong and became "a employer profile" on the
 * first HR key.
 */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function withArticle(word: string): string {
  return `${article(word)} ${word}`;
}

/**
 * The rungs of one panel as a SINGULAR list a sentence can use — "employer
 * profile, pay group or location".
 *
 * The previous spelling was `heading.replace(/s$/, "")`, which un-pluralises the
 * LAST word of a joined plural heading and leaves the rest: with HR's three
 * rungs "employer profiles, pay groups, locations" became "employer profiles,
 * pay groups, location". One rung reads the same as before.
 */
function singularList(kinds: readonly SubOrgScopeKind[]): string {
  const words = kinds.map((kind) => nounWord(kind));
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
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

/**
 * One rung's searchable list of rows, minus the ones already overridden.
 *
 * THE SEARCH IS OURS, THE ENGINE IS `cmdk`'s. `shouldFilter={false}` with a
 * controlled query, because two things were dishonest when cmdk filtered:
 *   • the group heading said "803 tables" while two were on screen — it was
 *     counting the list it was handed, not the list a person could see;
 *   • `value={row.label}` is cmdk's identity for an item, and
 *     `platform.entity_types` has a genuine duplicate active label
 *     (`iam_access_audit` and `hr_access_audit` both read "Access audit"), so
 *     the two rows shared ONE value and highlighted together — a person could
 *     not tell which table they were about to except, and DOM order decided.
 * cmdk keeps what it is for (keyboard, roving focus, accessible names); the
 * match and the count are computed here, over the same array that renders.
 */
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
  const [query, setQuery] = useState("");

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
  const needle = query.trim().toLowerCase();
  const matching = needle === ""
    ? available
    : available.filter((row) => row.label.toLowerCase().includes(needle));
  const ambiguous = ambiguousLabels(available);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs">
          <Plus className="mr-1 h-3.5 w-3.5" />
          {`Add override for ${withArticle(nounWord(kind))}…`}
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
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={`Search ${plural(kind)}…`}
              className="h-8 text-xs"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-72">
              <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                {`No matching ${nounWord(kind)}.`}
              </CommandEmpty>
              <CommandGroup heading={`${matching.length} ${plural(kind)}`}>
                {matching.map((row) => (
                  <CommandItem
                    key={row.id}
                    value={row.id}
                    onSelect={() => {
                      setOpen(false);
                      setQuery("");
                      onPick(row);
                    }}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="truncate">{row.label}</span>
                    {ambiguous.has(row.label.toLowerCase()) && (
                      // Two registered rows really are called this. The
                      // shortest thing that tells them apart is their own id;
                      // showing it here beats letting DOM order decide which
                      // one a person just excepted.
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                        {row.id.slice(0, 8)}
                      </span>
                    )}
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

/** Lower-cased labels that more than one row in this list carries. */
export function ambiguousLabels(rows: readonly ScopeRow[]): Set<string> {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const key = row.label.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([label]) => label));
}

/** A row a person picked but has not valued yet. It is not an override until saved. */
type Draft = { kind: SubOrgScopeKind; row: ScopeRow };

/**
 * Where a DRAFT row's displayed value comes from — the nearest rung above it
 * that holds a live value, named by the resolver, never guessed.
 */
export function draftInheritedFrom(
  knob: ScopedKnob,
  kind: SubOrgScopeKind,
  isOrgAdmin: boolean,
): string {
  return resolveKnobLadder(knob, kind, { isOrgAdmin }).inheritedFrom;
}

export function KnobRungOverrides({
  knob,
  stateOnly,
}: {
  knob: ScopedKnob;
  /**
   * 🚨 F1 (V-57). The SAME disposition the knob's own row was given. A key with
   * no runtime consumer renders "This preference is not available yet" at the
   * organization rung — and used to render, one line below, a working
   * "Add override for a table…" button over all 803 registered tables. One
   * knob, one viewport, two contradictory statements: the org rung disabled
   * because nothing reads the key, and the table rung cheerfully writing a row
   * that the same nothing reads. That is the exact class this build's own
   * commit message describes, reintroduced one rung down.
   *
   * When it is set: no picker, no drafts, and the standing exceptions render
   * read-only so a person can still SEE (and, when a consumer arrives, manage)
   * what is already stored — with the reason said out loud.
   */
  stateOnly?: { reason: string; consumerEvidence: string } | null;
}) {
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
  const [labelErrors, setLabelErrors] = useState<Record<string, string>>({});

  // Labels for the rows that ALREADY hold a value: a person must never be shown
  // a uuid. Read once per rung, when the panel mounts.
  const ensureLabels = (kind: SubOrgScopeKind) => {
    if (labels[kind] || !organizationId) return;
    void fetchScopeRows(kind, organizationId)
      .then((result) => setLabels((prior) => ({ ...prior, [kind]: result })))
      .catch((err: unknown) => {
        // A failed label read leaves the row identified by its id below WITH
        // the reason beside it. The previous version swallowed the error into
        // an empty list while its own comment claimed the reason was stated.
        setLabelErrors((prior) => ({ ...prior, [kind]: extractErrorMessage(err) }));
        setLabels((prior) => ({ ...prior, [kind]: [] }));
      });
  };

  const kinds = pickableRungsFor(knob.overridable_by, knob.full_key);

  // 🚨 F5 (V-57). The list is read when this panel MOUNTS, not when it is
  // opened. The header's whole job while collapsed is to say whether anything
  // differs; reading only on open made "2 exceptions" invisible until you
  // opened the thing that was supposed to tell you. Only knobs that actually
  // HAVE a row-keyed rung mount a panel (11 keys today), so this is a handful
  // of small reads per page, not the per-knob catalogue read the cache exists
  // to prevent. The context itself is idempotent per key.
  useEffect(() => {
    if (kinds.length === 0 || !organizationId) return;
    loadRungOverrides(knob);
    for (const kind of kinds) ensureLabels(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knob.full_key, organizationId]);

  if (kinds.length === 0 || !organizationId) return null;

  const state = rungOverrides[knob.full_key];
  const rows = state?.status === "ready" ? state.rows : [];
  const heading = kinds.map((kind) => plural(kind)).join(", ");

  const labelFor = (kind: SubOrgScopeKind, scopeId: string): string | null =>
    labels[kind]?.find((row) => row.id === scopeId)?.label ?? null;

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
      stateOnly={stateOnly ?? undefined}
      hideKey
      onChanged={() => {
        setDrafts((prior) =>
          prior.filter((draft) => !(draft.kind === kind && draft.row.id === scopeId)),
        );
        afterWrite();
      }}
    />
  );

  // 🚨 F1: a key nothing reads gets no NEW exceptions, at any rung.
  const canAdd = canManageOrganization && !stateOnly;
  const count = state?.status === "ready" ? rows.length : null;

  return (
    <SettingsSection
      // The count lives in the TITLE because a SettingsSection only renders its
      // description while OPEN — and "something here differs" is precisely what
      // the collapsed header exists to say.
      title={`Exceptions by ${heading}${count ? ` · ${count}` : ""}`}
      description={
        stateOnly
          ? `${stateOnly.reason} Until it has one, no ${heading} can be given their own value either.`
          : state?.status === "ready"
            ? rows.length === 0
              ? `No ${heading} set their own value for this setting yet.`
              : `${rows.length} ${rows.length === 1 ? "exception" : "exceptions"} to the value above.`
            : undefined
      }
      emphasis="subtle"
      collapsible
      defaultOpen={false}
      action={
        canAdd ? (
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
        status={state?.status ?? "idle"}
        message={state?.status === "error" ? state.message : null}
        onRetry={() => reloadRungOverrides(knob)}
        canAdd={canAdd}
        stateOnlyReason={stateOnly?.reason ?? null}
        heading={heading}
        singular={singularList(kinds)}
        empty={rows.length === 0 && drafts.length === 0}
      >
        {rows.map((row) => {
          const kind = row.scope_kind as SubOrgScopeKind;
          const label = labelFor(kind, row.scope_id);
          return overrideRow(
            kind,
            row.scope_id,
            label ??
              `This ${nounWord(kind)} could not be named — ${labelErrors[kind] ?? "its name was not read"} (${row.scope_id})`,
            row,
          );
        })}
        {drafts.map((draft) => (
          <div key={`draft:${draft.kind}:${draft.row.id}`}>
            {overrideRow(draft.kind, draft.row.id, draft.row.label, null)}
            <div className="flex items-center justify-between gap-2 px-4 pb-2 text-xs text-muted-foreground">
              <span>
                {/*
                  🚨 F3 (V-57). The control above shows the value this row
                  INHERITS, because a draft has no value of its own yet — and a
                  switch has no third position to say so with. So the caption
                  says exactly what is on screen and where it came from, rather
                  than only that nothing is saved.
                */}
                {`Showing ${draftInheritedFrom(knob, draft.kind, canManageOrganization)}’s value — nothing is saved for this ${nounWord(draft.kind)} yet. Change it and it becomes this ${nounWord(draft.kind)}’s own.`}
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

/** The disclosure's body: the honest state, or the rows. */
function ExceptionsBody({
  status,
  message,
  onRetry,
  canAdd,
  stateOnlyReason,
  heading,
  singular,
  empty,
  children,
}: {
  status: "idle" | "loading" | "ready" | "error";
  message: string | null;
  onRetry: () => void;
  canAdd: boolean;
  stateOnlyReason: string | null;
  heading: string;
  /** The panel's rungs in the singular — "employer profile, pay group or location". */
  singular: string;
  empty: boolean;
  children: React.ReactNode;
}) {
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
        {stateOnlyReason
          ? `${stateOnlyReason} Nothing reads this setting yet, so there is nothing for ${withArticle(singular)} to differ from.`
          : canAdd
            ? `Nothing overrides the value above. Add one for a specific ${singular} when it needs to differ.`
            : `Nothing overrides the value above. An owner or admin sets exceptions by ${heading}.`}
      </p>
    );
  }
  return <>{children}</>;
}
