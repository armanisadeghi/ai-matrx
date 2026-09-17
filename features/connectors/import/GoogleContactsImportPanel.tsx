"use client";

/**
 * features/connectors/import/GoogleContactsImportPanel.tsx
 *
 * "Import from Google Contacts" — the body the window wraps. Google-native
 * PLAN §4.5: a searchable list of the person's Google contacts, exactly which
 * fields land in which Person fields, the mapping fixable before saving, the
 * save through the existing dedupe resolver, an already-imported badge with
 * "Update from Google", and a diff that never silently overwrites a value
 * somebody edited here.
 *
 * Two steps, one call shape: pick → review (the server's dry run IS the
 * preview and the diff) → import. Read-only toward Google.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Loader2,
  RefreshCw,
  Search,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { getUserMessage } from "@/lib/api/errors";
import Link from "next/link";
import {
  importGoogleContacts,
  searchGoogleContacts,
} from "./service";
import {
  IMPORT_PROVENANCE_UNRECORDED,
  importDateText,
  importFieldLabel,
  importMatchKeyWords,
  importProvenanceSentence,
} from "./field-labels";
import {
  UNKNOWN_ACTION_SENTENCE,
  decideContactField,
  narrowContactMatchState,
} from "./contract";
import type {
  ContactCandidatePending,
  ContactFieldActionPending,
  ContactFieldPlanPending,
  ContactImportOutcomePending,
  ContactSearchResultPending,
} from "./types";

export interface GoogleContactsImportPanelProps {
  organizationId: string | null;
  /** Opens with this contact already selected (the "Update from Google" door). */
  initialExternalId?: string | null;
  onImported?: (personIds: string[]) => void;
}

type Step = "pick" | "review";

interface FieldEdit {
  include: boolean;
  value: string | null;
}

/** Per contact, per field key. */
type EditMap = Record<string, Record<string, FieldEdit>>;

/**
 * One label per action the server can emit — EXHAUSTIVE by type (a `Record` over
 * the union) and checked against the server's own literal by
 * `./field-labels.test.ts`, plus an honest word for an action a newer server
 * invents. A missing key rendered `undefined` at a person.
 */
const ACTION_COPY: Record<ContactFieldActionPending | "unknown", string> = {
  unknown: "outcome not recognised",
  create: "will be written",
  fill: "fills an empty field",
  unchanged: "already the same",
  kept_manual: "kept — yours wins",
  unrecorded: "kept — source unknown",
  choice_required: "waiting on you",
  added: "linked to the Person",
  present: "already linked",
  excluded: "not imported",
};

const ACTION_TONE: Record<ContactFieldActionPending | "unknown", string> = {
  unknown: "text-amber-600 dark:text-amber-400",
  create: "text-foreground",
  fill: "text-foreground",
  unchanged: "text-muted-foreground",
  kept_manual: "text-amber-600 dark:text-amber-400",
  unrecorded: "text-amber-600 dark:text-amber-400",
  choice_required: "text-amber-600 dark:text-amber-400",
  added: "text-foreground",
  present: "text-muted-foreground",
  excluded: "text-muted-foreground",
};

function valueText(value: string | string[] | null): string {
  if (value === null) return "";
  return Array.isArray(value) ? value.join(", ") : value;
}

export function GoogleContactsImportPanel({
  organizationId,
  initialExternalId = null,
  onImported,
}: GoogleContactsImportPanelProps) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<ContactSearchResultPending | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(
    initialExternalId ? [initialExternalId] : [],
  );
  const [step, setStep] = useState<Step>("pick");
  const [plans, setPlans] = useState<ContactImportOutcomePending[]>([]);
  const [edits, setEdits] = useState<EditMap>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ContactImportOutcomePending[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (text: string) => {
      if (!organizationId) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const result = await searchGoogleContacts({
          organizationId,
          query: text,
          signal: controller.signal,
        });
        setSearch(result);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(getUserMessage(cause));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [organizationId],
  );

  // ONE read on mount, debounced only on later keystrokes. Two effects both
  // firing for the empty query meant the debounced one ABORTED the first — a
  // wasted Google Contacts request and a slower first paint.
  const typedRef = useRef(false);
  useEffect(() => {
    if (!typedRef.current) {
      void load("");
      return () => abortRef.current?.abort();
    }
    const handle = window.setTimeout(() => void load(query), 250);
    return () => window.clearTimeout(handle);
    // `load` is stable per organization; re-running per keystroke is the point.
  }, [query, load]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const contacts = search?.contacts ?? [];
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (externalId: string) => {
    setSelected((current) =>
      current.includes(externalId)
        ? current.filter((value) => value !== externalId)
        : [...current, externalId],
    );
  };

  const review = async (ids: string[] = selected) => {
    if (!organizationId || ids.length === 0) return;
    setSelected(ids);
    setBusy(true);
    setError(null);
    try {
      const result = await importGoogleContacts({
        organizationId,
        contacts: ids.map((externalId) => ({ externalId })),
        dryRun: true,
      });
      setPlans(result.results);
      setEdits({});
      setStep("review");
      result.warnings.forEach((warning) => toast.warning(warning));
    } catch (cause) {
      setError(getUserMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!organizationId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await importGoogleContacts({
        organizationId,
        dryRun: false,
        contacts: plans.map((plan) => ({
          externalId: plan.external_id,
          fields: Object.entries(edits[plan.external_id] ?? {}).map(
            ([key, edit]) => ({
              key,
              include: edit.include,
              value: edit.value,
            }),
          ),
        })),
      });
      setDone(result.results);
      result.warnings.forEach((warning) => toast.warning(warning));
      const people = result.results
        .map((outcome) => outcome.person_id)
        .filter((value): value is string => Boolean(value));
      onImported?.(people);
      toast.success(
        `${result.results.length} contact${result.results.length === 1 ? "" : "s"} saved. Google Contacts was not changed.`,
      );
      void load(query);
    } catch (cause) {
      setError(getUserMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const editFor = (externalId: string, plan: ContactFieldPlanPending): FieldEdit => {
    const stored = edits[externalId]?.[plan.key];
    if (stored) return stored;
    // LOCAL WINS BY DEFAULT, decided in ONE place (`./contract.ts`): a value
    // somebody edited here starts unticked, so doing nothing keeps it, and the
    // person can tick it to take Google's instead. That is the difference
    // between a default and the lock this panel used to be.
    return { include: decideContactField(plan).includeByDefault, value: null };
  };

  const setEdit = (externalId: string, key: string, patch: Partial<FieldEdit>) => {
    setEdits((current) => {
      const forContact = { ...(current[externalId] ?? {}) };
      const existing = forContact[key] ?? { include: true, value: null };
      forContact[key] = { ...existing, ...patch };
      return { ...current, [externalId]: forContact };
    });
  };

  if (!organizationId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          Choose the organization these people belong to first — the import
          writes them into it, and nothing here picks one for you.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          Saved. Google Contacts was not changed.
        </div>
        <ul className="flex flex-col gap-2">
          {done.map((outcome) => (
            <li
              key={outcome.external_id}
              className="rounded-md border border-border bg-card p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                {/* THE DOOR LAW: the Person this import named opens. The
                    window keeps its state, so the record opens in a new tab —
                    the same rule the CRM list's own out-of-route links use. */}
                {outcome.person_id ? (
                  <Link
                    href={`/crm/${outcome.person_id}`}
                    target="_blank"
                    className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {outcome.person_name ?? outcome.display_name}
                  </Link>
                ) : (
                  <span className="text-sm font-medium text-foreground">
                    {outcome.person_name ?? outcome.display_name}
                  </span>
                )}
                <Badge variant="secondary" className="text-[11px]">
                  {outcome.created ? "Created" : "Enriched"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{outcome.note}</p>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDone(null);
              setPlans([]);
              setSelected([]);
              setStep("pick");
            }}
          >
            Import more
          </Button>
        </div>
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setStep("pick")}
            disabled={busy}
          >
            Back
          </Button>
          <span className="text-xs text-muted-foreground">
            {plans.length} contact{plans.length === 1 ? "" : "s"} — check where each
            value lands, then save.
          </span>
          <Button size="sm" className="ml-auto" onClick={apply} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserPlus className="mr-1 h-3.5 w-3.5" />
            )}
            Save {plans.length} to People
          </Button>
        </div>
        {error ? (
          <p className="flex items-start gap-2 border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ul className="flex flex-col gap-4">
            {plans.map((plan) => (
              <li
                key={plan.external_id}
                className="rounded-md border border-border bg-card"
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                  <span className="text-sm font-medium text-foreground">
                    {plan.display_name}
                  </span>
                  {/* THE DOOR LAW: the Person this plan would write to opens
                      before anything is written, not only afterwards. */}
                  {plan.person_id ? (
                    <Link
                      href={`/crm/${plan.person_id}`}
                      target="_blank"
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      Open the Person
                    </Link>
                  ) : null}
                  {plan.choice_required ? (
                    /* 🚨 SEVERAL PEOPLE MATCH, SO NOTHING IS WRITTEN — in the
                       preview AND in the apply. There is deliberately no pick
                       control: the one governed create/enrich path is the
                       server's resolver, and a panel that pinned a chosen Person
                       would be a second write path. The remedy is on the
                       records: merge the duplicate, or take the shared address
                       off the wrong one. */
                    <Badge
                      variant="outline"
                      className="text-[11px] text-amber-600 dark:text-amber-400"
                    >
                      More than one Person matches — nothing will be written
                    </Badge>
                  ) : plan.person_id ? (
                    <Badge variant="secondary" className="text-[11px]">
                      {/* NEVER "New Person" when the server says it will merge —
                          the preview names the Person it enriches, and how it
                          recognised them (D4). */}
                      Will update{" "}
                      {plan.person_name ?? "the Person already here"}
                      {/* HOW it was recognised, in words: the key used to reach a
                          person raw — `matched by external_id:google_contacts`
                          (R2 D9). `importMatchKeyWords` is the client twin of the
                          server's own `_match_key_words`. */}
                      {plan.matched_by
                        ? ` (recognised by ${importMatchKeyWords(plan.matched_by)})`
                        : ""}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[11px]">
                      New Person
                    </Badge>
                  )}
                </div>
                <ul className="flex flex-col divide-y divide-border">
                  {plan.fields.map((field) => {
                    const edit = editFor(plan.external_id, field);
                    const decision = decideContactField(field);
                    const localWins = decision.localWins;
                    const provenance = importProvenanceSentence({
                      sourceRef: field.source_ref,
                      importedAt: field.imported_at,
                      source: "Google Contacts",
                    });
                    return (
                      <li
                        key={field.key}
                        className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <Checkbox
                            checked={edit.include}
                            disabled={!decision.choosable}
                            onCheckedChange={(checked) =>
                              setEdit(plan.external_id, field.key, {
                                include: checked === true,
                              })
                            }
                            aria-label={
                              localWins
                                ? `Take Google's ${importFieldLabel(field.key)} instead of the value here`
                                : `Import ${field.label}`
                            }
                          />
                          <span className="w-24 shrink-0 text-xs text-muted-foreground">
                            {field.label}
                          </span>
                          <Input
                            value={edit.value ?? valueText(field.value)}
                            disabled={!edit.include || !decision.choosable}
                            onChange={(event) =>
                              setEdit(plan.external_id, field.key, {
                                value: event.target.value,
                              })
                            }
                            className="h-8 min-w-0 flex-1 text-sm"
                          />
                        </div>
                        <div className="flex min-w-0 items-center gap-2 sm:w-64">
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate text-xs text-foreground">
                            {field.person_label}
                          </span>
                          <span
                            className={`ml-auto shrink-0 text-[11px] ${ACTION_TONE[decision.action]}`}
                          >
                            {edit.include
                              ? localWins
                                ? "will replace yours"
                                : ACTION_COPY[decision.action]
                              : localWins
                                ? ACTION_COPY.kept_manual
                                : ACTION_COPY.excluded}
                          </span>
                        </div>
                        {/* THE SENTENCE IS THE SERVER'S when it sent one — the
                            same rule the Tasks count line runs on, so the panel,
                            the agent tool and any future client all say the same
                            true thing. The client adds only the ACTION the
                            person can take, which is local knowledge. */}
                        {decision.explanation ? (
                          <p className="text-[11px] text-muted-foreground sm:basis-full">
                            {decision.explanation}
                            {localWins
                              ? " Tick the box to take Google's value instead."
                              : ""}
                            {decision.action === "unknown"
                              ? ` ${UNKNOWN_ACTION_SENTENCE}`
                              : ""}
                          </p>
                        ) : localWins ? (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 sm:basis-full">
                            This Person already says &ldquo;
                            {valueText(field.current_value)}&rdquo; and it was
                            edited here, so the import leaves it alone. Tick the
                            box to take Google&apos;s value instead.
                          </p>
                        ) : decision.action === "unknown" ? (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 sm:basis-full">
                            {UNKNOWN_ACTION_SENTENCE}
                          </p>
                        ) : null}
                        {/* WHERE THE VALUE ON THE RECORD CAME FROM — the
                            sentence this import exists to be able to say. When
                            the server recorded no provenance it says exactly
                            that; it never invents a source or a date. */}
                        <p className="text-[11px] text-muted-foreground sm:basis-full">
                          {provenance
                            ? `This Person's ${importFieldLabel(field.key)} is ${provenance}.`
                            : IMPORT_PROVENANCE_UNRECORDED}
                        </p>
                      </li>
                    );
                  })}
                </ul>
                {plan.candidates && plan.candidates.length > 0 ? (
                  <p className="flex flex-wrap items-center gap-2 px-3 pt-2 text-[11px] text-muted-foreground">
                    <span>
                      This Google contact could be either of these People, so
                      nothing is written. Merge the duplicate, or take the shared
                      address off the wrong one, and import again. It could be
                    </span>
                    {/* THE DOOR LAW: every Person named here opens. */}
                    {plan.candidates.map((candidate) => (
                      <Link
                        key={candidate.person_id}
                        href={`/crm/${candidate.person_id}`}
                        target="_blank"
                        className="text-foreground underline-offset-2 hover:underline"
                      >
                        {candidate.person_name} ({candidate.matched_by})
                      </Link>
                    ))}
                  </p>
                ) : null}
                <p className="px-3 py-2 text-[11px] text-muted-foreground">
                  {plan.note}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => {
              typedRef.current = true;
              setQuery(event.target.value);
            }}
            placeholder="Search your Google contacts"
            className="h-9 pl-7 text-base sm:text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {loading ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Reading Google Contacts…
            </span>
          ) : search ? (
            <span>
              {search.count} shown of {search.total_read} read from{" "}
              {search.google_account ?? "your Google account"}
              {search.already_imported > 0
                ? `, ${search.already_imported} already here`
                : ""}
              .
            </span>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 gap-1 px-2 text-xs"
            onClick={() => void load(query)}
            disabled={loading}
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>
      </div>
      {error ? (
        <p className="flex items-start gap-2 border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
      {search?.warnings.map((warning) => (
        <p
          key={warning}
          className="border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground"
        >
          {warning}
        </p>
      ))}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!loading && contacts.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {query
              ? `No Google contact matches “${query}”.`
              : "This Google account has no contacts we can read."}
          </p>
        ) : null}
        <ul className="flex flex-col divide-y divide-border">
          {contacts.map((contact: ContactCandidatePending) => (
            <li key={contact.external_id} className="flex items-center gap-3 px-4 py-2">
              <Checkbox
                checked={selectedSet.has(contact.external_id)}
                onCheckedChange={() => toggle(contact.external_id)}
                aria-label={`Select ${contact.display_name}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm text-foreground">
                    {contact.display_name}
                  </span>
                  {/* WHAT THE IMPORT WOULD DO, as the ONE resolver answered it
                      — never "new" for a contact the apply would merge into an
                      existing Person (VERIFY-B1-B2 D4), and never a silent pick
                      between two People (D5). */}
                  {contact.already_imported ? (
                    <Badge variant="secondary" className="text-[11px]">
                      {/* The badge NAMES the date when the server sent one, and
                          says nothing more than it knows when it did not (B3). */}
                      {importDateText(contact.imported_at)
                        ? `Imported ${importDateText(contact.imported_at)}`
                        : "Imported (date not recorded)"}
                    </Badge>
                  ) : narrowContactMatchState(contact.match_state) ===
                    "choice_required" ? (
                    <Badge
                      variant="outline"
                      className="text-[11px] text-amber-600 dark:text-amber-400"
                    >
                      More than one Person matches — nothing will be written
                    </Badge>
                  ) : narrowContactMatchState(contact.match_state) ===
                    "matched" ? (
                    <Badge variant="secondary" className="text-[11px]">
                      Will update {contact.person_name ?? "an existing Person"}
                      {contact.matched_by
                        ? ` (recognised by ${importMatchKeyWords(contact.matched_by)})`
                        : ""}
                    </Badge>
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {[contact.job_title, contact.company, contact.emails[0]]
                    .filter(Boolean)
                    .join(" · ") || "No details in Google"}
                </p>
                {/* THE DOOR LAW: when the resolver named several People, each one
                    opens, and the remedy is said. */}
                {contact.candidates && contact.candidates.length > 0 ? (
                  <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>Merge or separate these first:</span>
                    {contact.candidates.map((candidate) => (
                      <Link
                        key={candidate.person_id}
                        href={`/crm/${candidate.person_id}`}
                        target="_blank"
                        className="text-foreground underline-offset-2 hover:underline"
                      >
                        {candidate.person_name} ({candidate.matched_by})
                      </Link>
                    ))}
                  </p>
                ) : null}
              </div>
              {contact.already_imported && contact.person_id ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2 text-xs"
                  onClick={() => void review([contact.external_id])}
                >
                  Update from Google
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center gap-2 border-t border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">
          {selected.length} selected
        </span>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => void review()}
          disabled={busy || selected.length === 0}
        >
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Review the field map
        </Button>
      </div>
    </div>
  );
}
