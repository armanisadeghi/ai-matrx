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

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
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
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  importGoogleContacts,
  searchGoogleContacts,
} from "./service";
import { GoogleImportReadFailureNotice } from "./GoogleImportReadFailureNotice";
import {
  readGoogleImportFailure,
  type GoogleImportReadFailure,
} from "./read-failure";
import {
  IMPORT_PROVENANCE_UNRECORDED,
  importDateText,
  importFieldLabel,
  importMatchKeyWords,
  importProvenanceSentence,
} from "./field-labels";
import {
  UNKNOWN_ACTION_SENTENCE,
  contactFieldChoice,
  contactRefusalSentence,
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
  // Google and this record disagree; your organization's setting asks a
  // person to decide, so nothing was written until this row is ticked.
  conflict: "disagree — you decide",
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
  conflict: "text-amber-600 dark:text-amber-400",
  choice_required: "text-amber-600 dark:text-amber-400",
  added: "text-foreground",
  present: "text-muted-foreground",
  excluded: "text-muted-foreground",
};

function valueText(value: string | string[] | null): string {
  if (value === null) return "";
  return Array.isArray(value) ? value.join(", ") : value;
}

/**
 * 🚨 THE INVARIANT (three Bugbot rounds on `75fd614c`/`8e612aa2` all patched
 * an INSTANCE of the same root defect — this is the class fix): A SELECTION
 * HOLDS ONLY IDS A READ HAS RETURNED; AN ADDRESS NAMES A REQUEST, NEVER A
 * SELECTION. The window address's `initialExternalId` is a REQUEST
 * (`requestedExternalId`) until some read proves the contact exists — it
 * never enters `selected` directly, so there is no provisional id for any
 * later hole (an aborted read, a narrowed page, an organization swap, …) to
 * leak into "N selected" or the Review button. One `useReducer`, so every
 * field that answers "what is selected, and why" changes together:
 *
 * - `selected` — ids the person has ticked, or that a read has confirmed
 *   answer to `requestedExternalId`. NEVER seeded from the address.
 * - `seenIds` — the UNION of every `external_id` any read has returned this
 *   session (never shrinks; reset only by `reset`), so a contact once proven
 *   to exist stays provably real regardless of what a later, narrower read
 *   shows.
 * - `unfilteredSearch` — the last COMPLETE, empty-query read: the only read
 *   that can prove absence, because it is the one read that is not itself a
 *   narrower page.
 * - `requestedExternalId` — the address's contact, while it remains
 *   unresolved-or-not-yet-proven; the banners below read this plus
 *   `seenIds`/`unfilteredSearch`, never `selected`.
 *
 * `reset` clears every field at once on an organization change — a
 * different Google account invalidates all of them together, so a
 * per-field reset (the shape of the two Bugbot-found holes on `8e612aa2`)
 * cannot happen again.
 */
interface ContactSelectionState {
  selected: string[];
  seenIds: Set<string>;
  unfilteredSearch: ContactSearchResultPending | null;
  requestedExternalId: string | null;
}

type ContactSelectionAction =
  | { type: "reset"; requestedExternalId: string | null }
  | {
      type: "read";
      contacts: ContactCandidatePending[];
      unfiltered: boolean;
      result: ContactSearchResultPending;
    }
  | { type: "toggle"; externalId: string }
  | { type: "setSelected"; ids: string[] };

function contactSelectionReducer(
  state: ContactSelectionState,
  action: ContactSelectionAction,
): ContactSelectionState {
  switch (action.type) {
    case "reset":
      return {
        selected: [],
        seenIds: new Set(),
        unfilteredSearch: null,
        requestedExternalId: action.requestedExternalId,
      };
    case "read": {
      const seenIds = new Set(state.seenIds);
      for (const contact of action.contacts) seenIds.add(contact.external_id);
      // The FIRST read that proves the address's contact exists promotes it
      // from a request to a real selection — and the request is ANSWERED by
      // that promotion, so it is cleared in the same step.
      //
      // 🚨 PROMOTION HAPPENS EXACTLY ONCE (F-114 NEW-2, VERIFY-R10-FIX-WAVE):
      // the request used to survive its own promotion, and every later read —
      // Refresh, the debounced search, the reload after a save — re-ran the
      // same promotion against a `selected` the person had since un-ticked.
      // Un-ticking the contact a link named was reversed behind their back,
      // and "0 selected" became "1 selected" with nobody touching the box.
      // Clearing it here is also what keeps the banners honest: they all read
      // `requestedExternalId`, and an answered request has nothing left to say.
      const promoted = Boolean(
        state.requestedExternalId && seenIds.has(state.requestedExternalId),
      );
      const selected =
        promoted &&
        state.requestedExternalId &&
        !state.selected.includes(state.requestedExternalId)
          ? [...state.selected, state.requestedExternalId]
          : state.selected;
      return {
        ...state,
        seenIds,
        selected,
        requestedExternalId: promoted ? null : state.requestedExternalId,
        unfilteredSearch: action.unfiltered ? action.result : state.unfilteredSearch,
      };
    }
    case "toggle": {
      const has = state.selected.includes(action.externalId);
      return {
        ...state,
        selected: has
          ? state.selected.filter((value) => value !== action.externalId)
          : [...state.selected, action.externalId],
      };
    }
    case "setSelected":
      return { ...state, selected: action.ids };
    default:
      return state;
  }
}

export function GoogleContactsImportPanel({
  organizationId,
  initialExternalId = null,
  onImported,
}: GoogleContactsImportPanelProps) {
  // 🚨 THREE STATES, AND THE ORGANIZATION THE WINDOW WAS OPENED WITH CAN BE
  // STALE — see the same block in `GoogleTasksImportPanel`. The prop wins when
  // it has an answer, the person's own SELECTED organization fills in when it
  // does not, and with neither this shows the CHECKING beat while boot resolves
  // and the honest refusal only once boot has settled with nothing
  // (VERIFY-R7-FIX-WAVE NEW-1, 2026-09-18).
  const organizationGate = useOrganizationRequired();
  const effectiveOrganizationId = organizationId ?? organizationGate.organizationId;
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<ContactSearchResultPending | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("pick");
  /**
   * 🚨 THE READ'S FOURTH STATE (F-113 — `./read-failure.ts` carries the law).
   * A refusal is held as its own TYPED thing, never folded into the `error`
   * string the review and the apply use: under a failed read this panel used
   * to print the server's failure, "Still looking for the contact this link
   * named…" and "This Google account has no contacts we can read." all at
   * once. Nothing derived from rows may render while this is set.
   */
  const [readFailure, setReadFailure] = useState<GoogleImportReadFailure | null>(
    null,
  );
  /**
   * The Google account the person chose when the server said several could
   * answer. It rides every later call — the read AND the import — so the
   * preview and the save can never resolve to two different accounts.
   */
  const [googleAccount, setGoogleAccount] = useState<string | null>(null);
  const [plans, setPlans] = useState<ContactImportOutcomePending[]>([]);
  const [edits, setEdits] = useState<EditMap>({});
  const [busy, setBusy] = useState(false);
  /**
   * The saved reply — the outcomes AND the warnings that came with them, because
   * a refused field's whole sentence (with its remedy) is one of those warnings
   * and the card shows the SERVER's words, not a second wording of them.
   */
  const [done, setDone] = useState<{
    results: ContactImportOutcomePending[];
    warnings: string[];
  } | null>(null);

  // See `contactSelectionReducer` above for THE INVARIANT this holds:
  // `selected` never holds a provisional id, only ids a read has proven.
  const [selection, dispatchSelection] = useReducer(
    contactSelectionReducer,
    initialExternalId,
    (requestedExternalId): ContactSelectionState => ({
      selected: [],
      seenIds: new Set<string>(),
      unfilteredSearch: null,
      requestedExternalId: requestedExternalId ?? null,
    }),
  );

  // An organization change is a different Google account: NOTHING the old
  // one proved carries over — reset every field of the selection together,
  // in one dispatch, so a future hole cannot again reset only some of them
  // (Bugbot on `8e612aa2`: the previous, per-field reset cleared `seenIds`
  // and `unfilteredSearch` but left `selected` holding the OLD account's
  // ids, so Review could fire them at the new one).
  useEffect(() => {
    dispatchSelection({ type: "reset", requestedExternalId: initialExternalId });
    // `initialExternalId` is the window's own address and does not change for a
    // mounted panel; the reset is keyed on the organization — and, for the same
    // reason, on the chosen Google account: picking a different account is
    // literally a different account's contacts, so nothing the previous one
    // proved may survive the switch.
  }, [effectiveOrganizationId, googleAccount]);

  // 🚨 TWO ABORT CONTROLLERS, NEVER ONE (Bugbot on `8e612aa2`: a keystroke
  // before the mount's unfiltered read resolves aborted the ONE read that can
  // prove absence — a typed load never wrote `unfilteredSearch`, so the
  // address id sat in `selected` with Review enabled and neither banner: the
  // original V-24 phantom, reachable by typing early). A typed query and the
  // unfiltered (empty-query) read are two INDEPENDENT questions — "what
  // matches these words" and "does the whole account have this contact" —
  // and answering one must never cancel the other. `callSeqRef` additionally
  // guards which reply is allowed to update the VISIBLE list: two reads can
  // now be in flight at once, and only the most recently STARTED one may
  // win that race (a stale reply still contributes its ids to `seenIds` via
  // the "read" dispatch — proving existence never goes stale).
  const typedAbortRef = useRef<AbortController | null>(null);
  const unfilteredAbortRef = useRef<AbortController | null>(null);
  const callSeqRef = useRef(0);

  const load = useCallback(
    async (text: string) => {
      if (!effectiveOrganizationId) return;
      const unfiltered = text === "";
      const ref = unfiltered ? unfilteredAbortRef : typedAbortRef;
      ref.current?.abort();
      const controller = new AbortController();
      ref.current = controller;
      const seq = ++callSeqRef.current;
      setLoading(true);
      setError(null);
      try {
        const result = await searchGoogleContacts({
          organizationId: effectiveOrganizationId,
          query: text,
          googleAccount,
          signal: controller.signal,
        });
        if (callSeqRef.current === seq) setReadFailure(null);
        // Only the most recently STARTED call may paint the visible list —
        // an unfiltered read that resolves after a later typed one must not
        // overwrite what the person is currently looking at.
        if (callSeqRef.current === seq) setSearch(result);
        // Proving existence is never stale: every settled read, even a
        // superseded one, unions its ids in and may promote the address's
        // request to a real selection.
        dispatchSelection({ type: "read", contacts: result.contacts, unfiltered, result });
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (callSeqRef.current !== seq) return;
        // 🚨 A FAILED READ IS NOT AN EMPTY READ. The refusal gets its own
        // posture, and the rows of a SUPERSEDED read are dropped with it — a
        // list left on screen under a failure is an answer to a question
        // nobody asked (F-113).
        setReadFailure(readGoogleImportFailure(cause));
        setSearch(null);
      } finally {
        if (!controller.signal.aborted && callSeqRef.current === seq) setLoading(false);
      }
    },
    [effectiveOrganizationId, googleAccount],
  );

  // ONE read on mount, debounced only on later keystrokes. Two effects both
  // firing for the empty query meant the debounced one ABORTED the first — a
  // wasted Google Contacts request and a slower first paint. Clearing the box
  // back to "" re-enters this same branch's `load("")` — which is how a
  // never-completed unfiltered read (aborted only by ANOTHER unfiltered call,
  // never by a typed one) gets re-run without any special-casing.
  //
  // 🚨 THIS BRANCH'S CLEANUP OWNS THE TIMER, NEVER THE PROOF READ (F-114
  // NEW-1, VERIFY-R10-FIX-WAVE). It used to return
  // `() => unfilteredAbortRef.current?.abort()`, and this effect re-runs on
  // every `query` change — so the FIRST keystroke aborted the unfiltered read
  // that had just been fired on mount. `unfilteredSearch` then stayed null for
  // the life of the panel: a deep-linked contact was never promoted and "Still
  // looking for the contact this link named…" never resolved into either
  // answer. The unfiltered read is superseded by ANOTHER unfiltered read and
  // by nothing else (`load` aborts the previous one through
  // `unfilteredAbortRef`), and unmount is owned by the effect below — so a
  // keystroke has nothing of its own to clean up here.
  const typedRef = useRef(false);
  useEffect(() => {
    if (!typedRef.current) {
      void load("");
      return;
    }
    const handle = window.setTimeout(() => void load(query), 250);
    return () => window.clearTimeout(handle);
    // `load` is stable per organization; re-running per keystroke is the point.
  }, [query, load]);
  useEffect(
    () => () => {
      typedAbortRef.current?.abort();
      unfilteredAbortRef.current?.abort();
    },
    [],
  );

  const contacts = search?.contacts ?? [];
  const selectedSet = useMemo(() => new Set(selection.selected), [selection.selected]);
  const { requestedExternalId, unfilteredSearch, seenIds } = selection;
  const requestedFound = Boolean(requestedExternalId && seenIds.has(requestedExternalId));
  // The address named a contact NO read has ever returned, AND the complete
  // (unfiltered, untruncated) account read has already settled — never fired
  // off a typed-query miss (that proves nothing) or a truncated read (see
  // `requestedContactBounded` below for that honest, weaker sentence).
  const requestedContactMissing = Boolean(
    requestedExternalId &&
      unfilteredSearch &&
      !unfilteredSearch.truncated &&
      !requestedFound,
  );
  // The unfiltered read was truncated and the address's contact has not
  // turned up in anything read so far — honestly bounded, never "not in this
  // account" for a page that never covered the whole one. Clears itself the
  // moment a later read (e.g. the person searching for it by name) proves the
  // contact IS there.
  const requestedContactBounded = Boolean(
    requestedExternalId && unfilteredSearch?.truncated && !requestedFound,
  );
  // 🚨 NEVER SILENT WHILE THE PROOF IS STILL PENDING (Bugbot on `8e612aa2`):
  // the unfiltered read has not settled yet at all (aborted, still loading,
  // or the person is mid-keystroke before it fires) and the contact has not
  // turned up anywhere else either — say so, rather than showing nothing
  // while `selected` truthfully sits at zero.
  const requestedStillLooking = Boolean(
    requestedExternalId && !unfilteredSearch && !requestedFound,
  );

  const toggle = (externalId: string) => {
    dispatchSelection({ type: "toggle", externalId });
  };

  // THE REMEDY IS THE PRESS: the accounts the server named are the choice, and
  // pressing one re-reads with it rather than telling a person to set a
  // parameter they have nowhere to set (F-113 NEW-2).
  // ONE read per press, and it is the effect's: `load` is keyed on the chosen
  // account, so setting it re-runs the read through the SAME path an
  // organization change already uses. Calling `load` here as well would fire
  // two Google reads for one press, the second aborting the first.
  const chooseAccount = (account: string) => {
    setGoogleAccount(account);
    setReadFailure(null);
  };

  const review = async (ids: string[] = selection.selected) => {
    if (!effectiveOrganizationId || ids.length === 0) return;
    dispatchSelection({ type: "setSelected", ids });
    setBusy(true);
    setError(null);
    try {
      const result = await importGoogleContacts({
        organizationId: effectiveOrganizationId,
        googleAccount,
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
    if (!effectiveOrganizationId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await importGoogleContacts({
        organizationId: effectiveOrganizationId,
        googleAccount,
        dryRun: false,
        contacts: plans.map((plan) => ({
          externalId: plan.external_id,
          // 🚨 ONE BUILDER FOR THE WIRE CHOICE (`./contract.ts`), so a tick on a
          // locked row carries `override_manual` — the server's own test for "the
          // person said so about THIS field". Without it the tick was sent and
          // discarded while the row read "will replace yours" (aidream lane B-10
          // N1). The row's own plan decides, so the payload cannot disagree with
          // the words that were on screen.
          fields: Object.entries(edits[plan.external_id] ?? {}).flatMap(
            ([key, edit]) => {
              const field = plan.fields.find((candidate) => candidate.key === key);
              return field ? [contactFieldChoice(field, edit)] : [];
            },
          ),
        })),
      });
      setDone({ results: result.results, warnings: result.warnings });
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

  if (!effectiveOrganizationId) {
    return (
      <OrganizationContextNotice
        state={organizationGate.organizationState}
        what="Imported people"
        title="Choose an organization"
        description="Choose the organization these people belong to first — the import writes them into it, and nothing here picks one for you."
        className="flex h-full items-center justify-center"
      />
    );
  }

  if (done) {
    const refusal = (outcome: ContactImportOutcomePending) =>
      contactRefusalSentence(outcome, done.warnings, importFieldLabel);
    return (
      <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          Saved. Google Contacts was not changed.
        </div>
        <ul className="flex flex-col gap-2">
          {done.results.map((outcome) => (
            <li
              key={outcome.external_id}
              className="rounded-md border border-border bg-card p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                {/* THE DOOR LAW: the Person this import named opens — via
                    EntityRef (route, new tab, and peek), the one door
                    primitive, never a hand-rolled Link. The window keeps its
                    state, so the record opens in a new tab — the same rule
                    the CRM list's own out-of-route links use. */}
                {outcome.person_id ? (
                  <EntityRef
                    token="party"
                    id={outcome.person_id}
                    name={outcome.person_name ?? outcome.display_name}
                    openInNewTab
                    labelClassName="text-sm font-medium text-foreground"
                  />
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
              {/* 🚨 A PROMISE THE SAVE COULD NOT KEEP IS NEVER SILENT. A field
                  locked on the Person between the review and the save comes back
                  in `refused_fields` (aidream lane B-10, BREAK K) — named by its
                  LABEL, with the remedy, in the server's own sentence when the
                  reply carried one. Before this the card said only "Enriched"
                  over a value the review had offered to write. */}
              {refusal(outcome) ? (
                <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {refusal(outcome)}
                </p>
              ) : null}
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
              dispatchSelection({ type: "setSelected", ids: [] });
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
                    <EntityRef
                      token="party"
                      id={plan.person_id}
                      name={plan.person_name ?? "the Person"}
                      openInNewTab
                      labelClassName="text-xs text-muted-foreground"
                    >
                      Open the Person
                    </EntityRef>
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
                      <EntityRef
                        key={candidate.person_id}
                        token="party"
                        id={candidate.person_id}
                        name={candidate.person_name}
                        openInNewTab
                        labelClassName="text-foreground"
                      >
                        {candidate.person_name} ({importMatchKeyWords(candidate.matched_by)})
                      </EntityRef>
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
          {/* 🚨 REFRESH NEVER SILENTLY RE-RUNS A REQUEST WE KNOW WILL FAIL
              (F-113 NEW-2): while the server is waiting to be told WHICH
              Google account to read, the same read is the same refusal. The
              choice is right below, and this says so rather than looking
              pressable and changing nothing. */}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 gap-1 px-2 text-xs"
            onClick={() => void load(query)}
            disabled={loading || readFailure?.kind === "several_accounts"}
            title={
              readFailure?.kind === "several_accounts"
                ? "Choose which Google account to read from first."
                : undefined
            }
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
      {/* THE FOURTH STATE. One posture, both import panels
          (`./GoogleImportReadFailureNotice.tsx`). */}
      {readFailure ? (
        <GoogleImportReadFailureNotice
          failure={readFailure}
          chosenAccount={googleAccount}
          onChooseAccount={chooseAccount}
          onRetry={() => void load(query)}
          busy={loading}
        />
      ) : null}
      {search?.warnings.map((warning) => (
        <p
          key={warning}
          className="border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground"
        >
          {warning}
        </p>
      ))}
      {/* 🚨 THE ADDRESS NAMED A CONTACT THIS READ DID NOT RETURN — said by
          name, not folded into "no contacts" (V-24). This is the honest
          reason a link opened here to nothing: never confused with an empty
          account or a search with no hits. */}
      {readFailure ? null : requestedContactMissing ? (
        <p className="flex items-start gap-2 border-b border-border bg-amber-500/10 px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The contact this link named is not in this account&apos;s readable
          contacts. It may have been removed from Google, or the link is
          stale — search for it below, or refresh.
        </p>
      ) : requestedContactBounded ? (
        /* THE HONEST THIRD SENTENCE: the unfiltered read was truncated, so
           it never covered the whole account — it can say only that the
           contact has not turned up YET, never that it is absent. Clears on
           its own the moment a later read (typing its name) proves it is
           there. */
        <p className="flex items-start gap-2 border-b border-border bg-amber-500/10 px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          We could not find this contact in the first{" "}
          {unfilteredSearch?.total_read ?? "the"} read — search for it by
          name below.
        </p>
      ) : requestedStillLooking ? (
        /* 🚨 NEVER SILENT WHILE THE PROOF IS STILL PENDING (Bugbot on
           `8e612aa2`): the unfiltered read has not settled yet — still
           loading, or its previous attempt never completed — so nothing here
           can say "found" OR "not found" honestly. Absence of this line would
           read as the panel simply forgetting the link it was opened with. */
        <p className="flex items-start gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
          Still looking for the contact this link named…
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* 🚨 ONLY A READ THAT HAPPENED MAY SAY THE ACCOUNT IS EMPTY (F-113).
            `readFailure` means no contact was ever read, so neither of these
            sentences is a fact — the posture above is the whole answer. */}
        {!loading && !readFailure && contacts.length === 0 ? (
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
                      <EntityRef
                        key={candidate.person_id}
                        token="party"
                        id={candidate.person_id}
                        name={candidate.person_name}
                        openInNewTab
                        labelClassName="text-foreground"
                      >
                        {candidate.person_name} ({importMatchKeyWords(candidate.matched_by)})
                      </EntityRef>
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
          {selection.selected.length} selected
        </span>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => void review()}
          disabled={busy || selection.selected.length === 0}
        >
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Review the field map
        </Button>
      </div>
    </div>
  );
}
