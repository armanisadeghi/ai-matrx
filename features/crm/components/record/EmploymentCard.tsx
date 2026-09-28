"use client";

// features/crm/components/record/EmploymentCard.tsx
//
// Employment = crm.affiliation, a REAL table with dates and history — never
// an association edge (an edge can hold only one works_at per pair, ever, and
// unlinking erases that it happened; see features/crm/FEATURE.md).
//
// Person view: current + past employers, add a stint, end a stint.
// Company view: everyone who works / worked here (read-only rows that link
// to the person).

import { PlusTapButton, XTapButton } from "@ai-matrx/tap-target/buttons";
import { TapTargetButtonTransparent } from "@ai-matrx/tap-target";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  Briefcase,
  Building2,
  Check,
  User,
  LogOut,
  Plus,
  Users,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  SelectChevron,
} from "@ai-matrx/design-system";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { extractErrorMessage } from "@/utils/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Checkbox } from "@/components/ui/checkbox";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { CRM_RECORD_SURFACE_NAME } from "@/features/surfaces/manifests/crm-record.manifest";
import {
  addAffiliation,
  endAffiliation,
  fetchPartiesByIds,
  searchEmployerCandidates,
  resolveParty,
} from "../../service";
import { parseEmployment } from "../../agent-context/crmRecordSurfaceWrite";
import type {
  AffiliationWithEmployer,
  AffiliationWithPerson,
  PartyRef,
} from "../../types";
import { SectionCard, SectionEmpty } from "./SectionCard";
import { CrmRecordCopyButtons } from "./CrmRecordCopyButtons";
import {
  buildEmploymentCopyViews,
  employmentAgentPayload,
  formatEmploymentCopy,
  stintDates,
  type CrmRecordCopyParent,
} from "./record-copy";

// ── Person side ─────────────────────────────────────────────────────────────

interface PersonProps {
  mode: "person";
  partyId: string;
  partyLabel: string;
  orgId: string;
  affiliations: AffiliationWithEmployer[];
  onChanged: () => Promise<void>;
}

// ── Company side ────────────────────────────────────────────────────────────

interface CompanyProps {
  mode: "company";
  partyId: string;
  partyLabel: string;
  orgId: string;
  members: AffiliationWithPerson[];
  onChanged: () => Promise<void>;
}

type Props = PersonProps | CompanyProps;

/**
 * The employer choice — the standard searchable picker (Popover + Command, the
 * parts OptionCombobox is built from), searching this organization's companies
 * on the server. A company that is not in the CRM yet is one click away:
 * `Create "what you typed"` resolves it through the governed find-or-create
 * door, so a name that already exists is matched instead of duplicated.
 */
function EmployerPicker({
  orgId,
  excludeId,
  selected,
  onSelect,
  kind = "organization",
}: {
  orgId: string;
  excludeId: string;
  selected: PartyRef | null;
  onSelect: (party: PartyRef | null) => void;
  /** `organization` picks an employer; `person` picks someone who works here. */
  kind?: "organization" | "person";
}) {
  const isPeople = kind === "person";
  const KindIcon = isPeople ? User : Building2;
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<PartyRef[]>([]);
  // A failed search is said under the box — never a silent "no matches"
  // (RC-B12 r13).
  const [searchError, setSearchError] = useState<unknown>(null);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const generationRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const gen = ++generationRef.current;
    setSearching(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const rows = await searchEmployerCandidates({
            orgId,
            search,
            excludeId,
            kind,
          });
          if (generationRef.current === gen) {
            setOptions(rows);
            setSearchError(null);
          }
        } catch (e) {
          console.error("[crm] employer search failed:", e);
          if (generationRef.current === gen)
            setSearchError(e ?? new Error("The company search failed"));
        } finally {
          if (generationRef.current === gen) setSearching(false);
        }
      })();
    }, 200);
    return () => clearTimeout(timer);
  }, [open, search, orgId, excludeId, searchAttempt, kind]);

  const typed = search.trim();
  const exact = options.some(
    (option) => option.display_name.toLowerCase() === typed.toLowerCase(),
  );

  const create = async () => {
    if (!typed) return;
    setCreating(true);
    try {
      const resolved = await resolveParty({
        kind,
        displayName: typed,
        orgId,
        source: "manual",
        sourceDetail: isPeople ? "people card" : "employment card",
      });
      if (!resolved.created) {
        toast.success(
          `Matched the existing ${isPeople ? "person" : "company"} ${resolved.displayName}`,
        );
      }
      onSelect({
        id: resolved.partyId,
        display_name: resolved.displayName,
        party_kind: kind,
      });
      setOpen(false);
      setSearch("");
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="h-11 min-w-[11rem] flex-1 justify-between gap-1.5 px-2 text-sm font-normal sm:h-7 sm:text-xs"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <KindIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span
              className={
                selected ? "truncate" : "truncate text-muted-foreground"
              }
            >
              {selected
                ? selected.display_name
                : isPeople
                  ? "Person"
                  : "Employer company"}
            </span>
          </span>
          <SelectChevron size="sm" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        /* sizing: fixed — a searchable list; a content-sized box would reflow on every keystroke */
        className="w-72 p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={isPeople ? "Search people…" : "Search companies…"}
          />
          <CommandList>
            {searchError != null ? (
              <ReadFailure
                error={searchError}
                what={isPeople ? "matching people" : "matching companies"}
                onRetry={() => setSearchAttempt((n) => n + 1)}
                className="m-2"
              />
            ) : null}
            {!searching && searchError == null && options.length === 0 && !typed ? (
              <CommandEmpty>
                {isPeople ? "No people yet" : "No companies yet"} — type a name
                to add one.
              </CommandEmpty>
            ) : null}
            {options.length > 0 && (
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.id}
                    onSelect={() => {
                      onSelect(option);
                      setOpen(false);
                    }}
                  >
                    <KindIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{option.display_name}</span>
                    {selected?.id === option.id && (
                      <Check className="ml-auto h-3.5 w-3.5" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {typed && !exact && searchError == null && (
              <CommandGroup>
                <CommandItem
                  value={`create:${typed}`}
                  disabled={creating}
                  onSelect={() => void create()}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Create &ldquo;{typed}&rdquo;</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function EmploymentCard(props: Props) {
  const [adding, setAdding] = useState(false);
  const [employer, setEmployer] = useState<PartyRef | null>(null);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [isCurrent, setIsCurrent] = useState(true);
  const [saving, setSaving] = useState(false);

  const isPerson = props.mode === "person";
  const rows = isPerson ? props.affiliations : props.members;
  const copyParent: CrmRecordCopyParent = {
    type: "party",
    id: props.partyId,
    label: props.partyLabel,
  };
  const employmentCopyViews = buildEmploymentCopyViews(
    isPerson
      ? { mode: "person", rows: props.affiliations }
      : { mode: "company", rows: props.members },
  );

  const submit = async () => {
    if (!employer) {
      toast.error(isPerson ? "Pick an employer company" : "Pick a person");
      return;
    }
    setSaving(true);
    try {
      // On a company record the picked party is the PERSON and this record is
      // the employer — the same crm.affiliation row, seen from the other side.
      const hasCurrentPrimary = isPerson
        ? props.affiliations.some((a) => a.is_current && a.is_primary)
        : false;
      await addAffiliation({
        partyId: isPerson ? props.partyId : employer.id,
        employerPartyId: isPerson ? employer.id : props.partyId,
        orgId: props.orgId,
        title: title || undefined,
        startDate: startDate || null,
        isCurrent,
        // First current stint becomes the primary employer (grids/sort read
        // party.primary_employer_party_id, maintained by crm._affiliation_edge).
        // A company-side add never steals the person's primary employer.
        isPrimary: isPerson && isCurrent && !hasCurrentPrimary,
      });
      setEmployer(null);
      setTitle("");
      setStartDate("");
      setIsCurrent(true);
      setAdding(false);
      await props.onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add employment");
    } finally {
      setSaving(false);
    }
  };

  const end = async (id: string, name: string) => {
    const ok = await confirm({
      title: isPerson ? `End the stint at ${name}?` : `End ${name}'s stint here?`,
      description: "The history stays — nothing is erased.",
      confirmLabel: "End stint",
    });
    if (!ok) return;
    try {
      await endAffiliation(id);
      await props.onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to end stint");
    }
  };

  // BOTH SIDES OF ONE ROW. A person record adds an employer; a company record
  // adds a person who works here. Same crm.affiliation write, same targets.
  useSurfaceWriteHandlers(CRM_RECORD_SURFACE_NAME, {
    add_employment: async (raw: unknown) => {
      const parsed = parseEmployment(raw);
      const otherId = isPerson ? parsed.employerPartyId : parsed.personPartyId;
      if (!otherId) {
        throw new Error(
          isPerson
            ? "add_employment on a person record expects employer_party_id."
            : "add_employment on a company record expects person_party_id.",
        );
      }
      const [candidate] = await fetchPartiesByIds([otherId]);
      const wantedKind = isPerson ? "organization" : "person";
      if (
        !candidate ||
        candidate.party_kind !== wantedKind ||
        candidate.organization_id !== props.orgId
      ) {
        throw new Error(
          isPerson
            ? "add_employment.employer_party_id must name a visible company in this record's organization."
            : "add_employment.person_party_id must name a visible person in this record's organization.",
        );
      }
      await addAffiliation({
        partyId: isPerson ? props.partyId : otherId,
        employerPartyId: isPerson ? otherId : props.partyId,
        orgId: props.orgId,
        title: parsed.title,
        department: parsed.department,
        startDate: parsed.startDate,
        isCurrent: parsed.isCurrent,
        isPrimary: isPerson ? parsed.isPrimary : false,
      });
      await props.onChanged();
    },
    end_employment: async (raw: unknown) => {
      const current = (isPerson ? props.affiliations : props.members).find(
        (candidate) => candidate.id === raw && candidate.is_current,
      );
      if (typeof raw !== "string" || !current) {
        throw new Error(
          `end_employment expects a current stint id from ${isPerson ? "affiliations" : "members"} on this record.`,
        );
      }
      await endAffiliation(current.id);
      await props.onChanged();
    },
  });

  return (
    <SectionCard
      empty={rows.length === 0 && !adding}
      title={isPerson ? "Employment" : "People"}
      Icon={isPerson ? Briefcase : Users}
      count={rows.length}
      compactAction
      action={
        <div className="flex items-center gap-0.5">
          {rows.length > 0 && (
            <CrmRecordCopyButtons
              label={`${props.partyLabel} ${isPerson ? "employment" : "people"}`}
              human={() =>
                formatEmploymentCopy(
                  copyParent,
                  props.mode,
                  employmentCopyViews,
                )
              }
              agent={() =>
                employmentAgentPayload(
                  copyParent,
                  props.mode,
                  employmentCopyViews,
                )
              }
              json={() => employmentCopyViews}
            />
          )}
          {adding ? (
            <XTapButton ariaLabel="Cancel add" onClick={() => setAdding(false)} />
          ) : (
            <PlusTapButton
              ariaLabel={isPerson ? "Add employment" : "Add a person"}
              onClick={() => setAdding(true)}
            />
          )}
        </div>
      }
    >
      {adding && (
        <div
          className={cn(
            "space-y-1.5",
            rows.length > 0 && "mb-2 border-b border-border pb-2",
          )}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <EmployerPicker
              orgId={props.orgId}
              excludeId={props.partyId}
              selected={employer}
              onSelect={setEmployer}
              kind={isPerson ? "organization" : "person"}
            />
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="h-11 w-36 text-base sm:h-7 sm:w-32 sm:text-xs"
            />
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-11 w-36 text-base sm:h-7 sm:w-32 sm:text-xs"
              aria-label="Start date"
            />
            <label className="flex min-h-11 items-center gap-1.5 text-sm text-foreground sm:min-h-7 sm:text-xs">
              <Checkbox
                checked={isCurrent}
                onCheckedChange={(v) => setIsCurrent(v === true)}
              />
              Current
            </label>
            <Button
              size="sm"
              className="h-11 px-3 text-sm sm:h-7 sm:px-2 sm:text-xs"
              onClick={submit}
              disabled={saving || !employer}
            >
              Add
            </Button>
          </div>
        </div>
      )}

      {rows.length === 0 && !adding ? (
        <SectionEmpty>
          {isPerson ? "No employment on record" : "No people on record"}
        </SectionEmpty>
      ) : (
        <ul className="space-y-0.5">
          {isPerson
            ? props.affiliations.map((a) => (
                <li
                  key={a.id}
                  className="group flex items-center gap-2 rounded px-1.5 py-1 hover:bg-accent/50"
                >
                  <Building2
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      a.is_current
                        ? "text-foreground"
                        : "text-muted-foreground/50",
                    )}
                  />
                  {a.employer ? (
                    <EntityRef
                      token="party"
                      id={a.employer.id}
                      name={a.employer.display_name}
                      showIcon={false}
                      labelClassName={cn(
                        "min-w-0 truncate text-sm",
                        a.is_current
                          ? "font-medium text-foreground"
                          : "text-muted-foreground",
                      )}
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Unknown company
                    </span>
                  )}
                  {a.title && (
                    <span className="shrink-0 truncate text-xs text-muted-foreground">
                      {a.title}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                    {stintDates(a.start_date, a.end_date)}
                  </span>
                  {a.is_current ? (
                    <span className="inline-flex shrink-0 opacity-100 sm:pointer-fine:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100"><TapTargetButtonTransparent
                      ariaLabel="End this stint"
                      onClick={() =>
                        void end(
                          a.id,
                          a.employer?.display_name ?? "this company",
                        )
                      }
                      className="text-muted-foreground/60 hover:text-destructive"
                      icon={<LogOut className="h-3.5 w-3.5" />}
                    />
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-xs leading-none text-muted-foreground">
                      Past
                    </span>
                  )}
                </li>
              ))
            : props.members.map((a) => (
                <li
                  key={a.id}
                  className="group flex items-center gap-2 rounded px-1.5 py-1 hover:bg-accent/50"
                >
                  {a.person ? (
                    <EntityRef
                      token="party"
                      id={a.person.id}
                      name={a.person.display_name}
                      showIcon={false}
                      labelClassName={cn(
                        "min-w-0 truncate text-sm",
                        a.is_current
                          ? "font-medium text-foreground"
                          : "text-muted-foreground",
                      )}
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Unknown person
                    </span>
                  )}
                  {a.title && (
                    <span className="shrink-0 truncate text-xs text-muted-foreground">
                      {a.title}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                    {stintDates(a.start_date, a.end_date)}
                  </span>
                  {a.is_current ? (
                    <span className="inline-flex shrink-0 opacity-100 sm:pointer-fine:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                      <TapTargetButtonTransparent
                        ariaLabel="End this stint"
                        onClick={() =>
                          void end(a.id, a.person?.display_name ?? "this person")
                        }
                        className="text-muted-foreground/60 hover:text-destructive"
                        icon={<LogOut className="h-3.5 w-3.5" />}
                      />
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-xs leading-none text-muted-foreground">
                      Past
                    </span>
                  )}
                </li>
              ))}
        </ul>
      )}
    </SectionCard>
  );
}
