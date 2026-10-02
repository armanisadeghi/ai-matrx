"use client";

/**
 * WHAT AN IN-CONTENT DIRECTIVE WILL DO, SAID BEFORE IT DOES IT — and the
 * records it names, by their live names, as ways in.
 *
 * The host half of `@ai-matrx/content-ir-react` 0.12.0's `renderRecord` seam
 * and of the `ask` dialog. The package knows an update/delete item points at
 * record `{noun, id}`; only the host can say what that record is CALLED and how
 * to open it. Both answers already exist, so neither is written here:
 *
 *   - the NAME — `useResolvedReferenceLabel` (THE one live reference-label
 *     resolver, catalog-derived for every registered noun) + `referenceChipLabel`;
 *   - the DOOR — `useReferenceDoor` (`referenceDoor`: in-place window →
 *     peek/route → honest name), the same path a reference chip opens through.
 *
 * A noun with no resolver renders its fallback as plain text — honest, never a
 * control that looks clickable and does nothing.
 */

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Skeleton } from "@ai-matrx/design-system";

import {
  itemTitle,
  nounTitleColumn,
  parseDirectiveSlug,
  type DirectiveNounCatalog,
} from "@ai-matrx/content-ir";
import {
  DirectiveChangeList,
  directiveValueWord,
  itemChanges,
  itemRecordId,
  type DirectiveAskRequest,
  type DirectiveHost,
  type DirectiveRecordProps,
  type DirectiveRecordRef,
} from "@ai-matrx/content-ir-react";
import type { ConfirmOptions } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";
import { useReferenceDoor } from "@/features/matrx-envelope/components/useReferenceDoor";
import type { ReferenceItem } from "@ai-matrx/agents/envelope";
import {
  getReferenceResolver,
  referenceChipLabel,
  resolveReferenceName,
  useResolvedReferenceLabel,
} from "@/features/matrx-envelope/referenceResolvers";
import { readDirectiveRecord } from "@/features/matrx-envelope/directiveRecordRow";
import { getOrganization } from "@/features/organizations/service";

/**
 * The live name of `{noun, id}`. While it is being read, `name` is null and
 * `loading` is true — a caller shows a neutral placeholder, NEVER the id
 * ("Task 9e11b091" for a few seconds after a reload — G8A review, 2026-10-02).
 * `fallback` is shown only when the name cannot be read at all.
 */
export function useDirectiveRecordName(noun: string, id: string, fallback: string) {
  const item = { id } as ReferenceItem;
  const { display, status } = useResolvedReferenceLabel(item, noun);
  const loading = status === "loading" || status === "idle";
  const name = status === "ready" ? referenceChipLabel(display) : loading ? null : fallback;
  return { name, loading };
}

/** A name still being read: a neutral bar, never an id. */
function NamePlaceholder() {
  return (
    <Skeleton
      className="inline-block h-3 w-20 shrink-0 align-middle"
      aria-label="Loading name"
      data-record-name-loading=""
    />
  );
}

/** Text only — for the confirm dialog, where a link would open behind the modal. */
export function DirectiveRecordName({
  noun,
  id,
  fallback,
}: {
  noun: string;
  id: string;
  fallback: string;
}) {
  const { name } = useDirectiveRecordName(noun, id, fallback);
  return name === null ? <NamePlaceholder /> : <b className="font-semibold text-foreground">{name}</b>;
}

/** The `renderRecord` seam: a row's target, or a record the apply wrote. */
export function DirectiveRecordLink({ noun, id, fallback, context, trashed: aboutToBeTrashed }: DirectiveRecordProps) {
  const { name, loading } = useDirectiveRecordName(noun, id, fallback);
  // The same door ladder every reference chip climbs (`referenceDoor`) — and its
  // trash answer: a record that went to the trash ANY way (this delete, a Delete
  // card further down the note, the Tasks page) says so, and its click is the
  // trash door (Restore), never a window that cannot open it (G6A review).
  const door = useReferenceDoor(noun, { id }, name ?? fallback);
  const trashed = aboutToBeTrashed === true || door.trashed;

  if (context === "dialog") {
    return name === null ? <NamePlaceholder /> : <b className="font-semibold text-foreground">{name}</b>;
  }

  const label = (
    <>
      {name === null ? <NamePlaceholder /> : <span className="truncate">{name}</span>}
      {loading && name !== null ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
      ) : null}
      {trashed ? <span className="shrink-0 text-muted-foreground">(in trash)</span> : null}
    </>
  );

  if (!door.canOpen) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 font-medium text-foreground">{label}</span>
    );
  }

  const linkClass = cn(
    "inline-flex min-w-0 max-w-full items-center gap-1 rounded px-1 py-0.5 text-left font-medium",
    context === "applied"
      ? "text-primary underline-offset-2 hover:underline"
      : "text-foreground hover:bg-accent hover:text-accent-foreground",
  );
  if (door.primaryHref) {
    return (
      <Link href={door.primaryHref} title={door.title} className={linkClass}>
        {label}
      </Link>
    );
  }
  return (
    <>
      <button type="button" onClick={door.activate} title={door.title} className={linkClass}>
        {label}
      </button>
      {door.peek}
    </>
  );
}

/** Who an organization id is, by name — the host reads the person's memberships. */
export type OrganizationNameOf = (organizationId: string) => string | null;

/**
 * ONE record a question names, as it was read when the question opened.
 *
 * 🚨 A CONFIRM NEVER ASKS BEFORE IT CAN SAY WHAT IT WILL DO (G8A review,
 * 2026-10-02). Opened right after a reload, the question read "Update note
 * Note ae33f4e0?" "in its organization" with no current value — and still ran
 * on yes. Now every record the question names is read FIRST (its live name, its
 * fields now, its organization, whether it is in the trash); the dialog opens at
 * once with a loading line and NO yes (`ConfirmOptions.ready`), then shows the
 * whole question from that one snapshot. A read that fails or runs long is said
 * plainly and the yes is offered anyway — validation offers, never blocks.
 */
export interface PreparedRecord {
  /** The record's live name; null when it has none this reader can read. */
  name: string | null;
  /** Its fields now; null when they could not be read. */
  values: Record<string, unknown> | null;
  /** Already in the trash. */
  trashed: boolean;
}

export interface PreparedQuestion {
  records: Readonly<Record<string, PreparedRecord>>;
  /** Where the records live, by name ("several organizations" when they differ); null when unknown. */
  organization: string | null;
  /** True when a record could not be read (or the reads ran long). */
  unread: boolean;
}

/** How long a question waits for its reads before offering the yes anyway. */
export const QUESTION_READ_MS = 8_000;

const NOTHING_TO_READ: PreparedQuestion = { records: {}, organization: null, unread: false };

/** An organization id → its name: the person's memberships first, else one read of it. */
async function organizationNameFor(id: string, nameOf?: OrganizationNameOf): Promise<string | null> {
  const known = nameOf?.(id);
  if (known) return known;
  const organization = await getOrganization(id);
  return organization?.name?.trim() || null;
}

function targetIds(request: DirectiveAskRequest): string[] {
  const { directive, items } = request;
  if (directive.directiveClass !== "update" && directive.directiveClass !== "delete") return [];
  return items
    .map((item) => itemRecordId(item))
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * Read everything a question names before it asks. Never rejects: a failed or
 * slow read resolves with `unread`, so the question still opens its yes.
 */
export function prepareDirectiveQuestion(
  request: DirectiveAskRequest,
  organizationNameOf?: OrganizationNameOf,
  timeoutMs: number = QUESTION_READ_MS,
): Promise<PreparedQuestion> {
  const ids = targetIds(request);
  if (ids.length === 0) return Promise.resolve(NOTHING_TO_READ);
  const noun = request.directive.noun;

  const reads = (async (): Promise<PreparedQuestion> => {
    let unread = false;
    const records: Record<string, PreparedRecord> = {};
    const organizationIds = new Set<string>();
    await Promise.all(
      ids.map(async (id) => {
        const [values, name] = await Promise.all([
          readDirectiveRecord({ noun, id }).catch(() => null),
          resolveReferenceName(noun, id).catch(() => null),
        ]);
        if (!values) unread = true;
        const organizationId = typeof values?.organization_id === "string" ? values.organization_id : "";
        if (organizationId) organizationIds.add(organizationId);
        const deletedAt = values?.deleted_at;
        records[id] = { name, values, trashed: deletedAt !== null && deletedAt !== undefined && deletedAt !== "" };
      }),
    );
    let organization: string | null = null;
    if (organizationIds.size > 1) organization = "several organizations";
    else if (organizationIds.size === 1) {
      organization = await organizationNameFor([...organizationIds][0], organizationNameOf).catch(() => null);
    }
    return { records, organization, unread };
  })();

  return new Promise<PreparedQuestion>((resolve) => {
    const timer = setTimeout(() => resolve({ records: {}, organization: null, unread: true }), timeoutMs);
    void reads.then(
      (question) => {
        clearTimeout(timer);
        resolve(question);
      },
      () => {
        clearTimeout(timer);
        resolve({ records: {}, organization: null, unread: true });
      },
    );
  });
}

/** The prepared question once read; null while it is still being read. */
function usePrepared(prepared: Promise<PreparedQuestion>): PreparedQuestion | null {
  const [read, setRead] = useState<{ of: Promise<PreparedQuestion>; question: PreparedQuestion } | null>(null);
  useEffect(() => {
    let live = true;
    void prepared.then((question) => {
      if (live) setRead({ of: prepared, question });
    });
    return () => {
      live = false;
    };
  }, [prepared]);
  return read?.of === prepared ? read.question : null;
}

/** Renders `loading` until the question has been read, then `children(question)`. */
function WhenRead({
  prepared,
  loading,
  children,
}: {
  prepared: Promise<PreparedQuestion>;
  loading: ReactNode;
  children: (question: PreparedQuestion) => ReactNode;
}) {
  const question = usePrepared(prepared);
  return <>{question ? children(question) : loading}</>;
}

/** The dialog body while its records are read — a status line, no yes beside it. */
function ReadingLine({ noun, many }: { noun: string; many: boolean }) {
  return (
    <p className="flex items-center gap-1.5 text-muted-foreground" data-directive-question-loading="">
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      {many ? `Reading these ${noun} items…` : `Reading this ${noun}…`}
    </p>
  );
}

/** Said plainly when a read failed — the person still decides. */
function UnreadLine() {
  return (
    <p className="text-muted-foreground" data-directive-question-unread="">
      Current values couldn&apos;t be read.
    </p>
  );
}

function Org({ name }: { name: string | null }) {
  return (
    <b className="font-semibold text-foreground" data-directive-organization="">
      {name ?? "its organization"}
    </b>
  );
}

function Named({ name }: { name: string }) {
  return <b className="font-semibold text-foreground">{name}</b>;
}

/** How many named records a dialog lists before "and N more". */
const DIALOG_NAMES_MAX = 5;

interface NamedItem {
  key: string;
  /** The record/item name, live for an existing record. */
  name: ReactNode;
  item: Record<string, unknown>;
  /** The record's fields now (update/delete), when read. */
  values: Record<string, unknown> | null;
}

/** Items a create/action names by their own fields. */
function namedNewItems(request: DirectiveAskRequest, nouns: DirectiveNounCatalog): NamedItem[] {
  const { directive, items } = request;
  const titleColumn = nounTitleColumn(directive.noun, nouns);
  return items.map((item, index) => ({
    key: String(index),
    item,
    values: null,
    name: <Named name={itemTitle(item, titleColumn, index, items.length)} />,
  }));
}

/** Items an update/delete names by the RECORD it changes, from the read question. */
function namedTargets(request: DirectiveAskRequest, question: PreparedQuestion): NamedItem[] {
  const { items, nounLabel } = request;
  return items.map((item, index) => {
    const id = itemRecordId(item);
    const record = id ? question.records[id] : undefined;
    return {
      key: id ?? String(index),
      item,
      values: record?.values ?? null,
      // Never an id: the live name, else the noun and its position.
      name: <Named name={record?.name ?? `${nounLabel} ${index + 1}`} />,
    };
  });
}

/** The live name of the ONE record a single-item question names, or null. */
function onlyRecordName(request: DirectiveAskRequest, question: PreparedQuestion): string | null {
  const id = request.items[0] ? itemRecordId(request.items[0]) : null;
  return (id ? question.records[id]?.name : null) ?? null;
}

/** The one value-word rule the card uses, bound to this noun. */
type ValueLabel = DirectiveHost["valueLabel"];

function ChangeList({
  item,
  values,
  titleColumn,
  noun,
  valueLabel,
}: {
  item: Record<string, unknown>;
  values: Record<string, unknown> | null;
  /** The noun's title column — it reads "Title" here exactly as in the form and on the card. */
  titleColumn: string | null;
  noun: string;
  valueLabel?: ValueLabel;
}) {
  return (
    <DirectiveChangeList
      changes={itemChanges(item, values, {
        titleColumn,
        valueWord: valueLabel ? directiveValueWord({ valueLabel }, noun) : null,
      })}
      // Full width, never `w-fit`: the list measures its own width to stack.
      className="mt-1 text-left sm:pl-3"
    />
  );
}

function NameList({
  named,
  withChanges,
  noun,
  titleColumn = null,
  valueLabel,
}: {
  named: NamedItem[];
  withChanges: boolean;
  noun: string;
  titleColumn?: string | null;
  valueLabel?: ValueLabel;
}) {
  const shown = named.slice(0, DIALOG_NAMES_MAX);
  const more = named.length - shown.length;
  return (
    <ul className="mt-2 space-y-1.5">
      {shown.map((entry) => (
        <li key={entry.key} className="min-w-0">
          <div className="[overflow-wrap:anywhere]">{entry.name}</div>
          {withChanges ? (
            <ChangeList
              item={entry.item}
              values={entry.values}
              titleColumn={titleColumn}
              noun={noun}
              valueLabel={valueLabel}
            />
          ) : null}
        </li>
      ))}
      {more > 0 ? <li className="text-muted-foreground">and {more} more</li> : null}
    </ul>
  );
}

export interface DirectiveConsequenceOptions {
  /** The host's value words — the card's `valueLabel`, so the confirm says the same words. */
  valueLabel?: ValueLabel;
  /** Test seam: how long the question waits for its reads. */
  readTimeoutMs?: number;
}

/**
 * THE QUESTION, per class. Every sentence names the record(s) and the
 * organization; a delete is destructive and says where the record goes (the
 * executor SOFT-deletes — `aidream/services/directive_apply/executor.py`
 * `_delete`) or that it is already there; an update lists every field it
 * overwrites, old → new, in the app's words. A plain apply is idempotent (one
 * ledger key per namespace — aidream `keys.human_door_namespace`), so only "Run
 * again" (`request.again`, sent with `force`) can repeat it, and its question
 * says so. An update or delete reads its records first and holds its yes until
 * it has (`ready`). Copy fits the dialog budget: ≤2 sentences, ≤140 characters.
 */
export function directiveConsequenceDialog(
  request: DirectiveAskRequest,
  nouns: DirectiveNounCatalog,
  /**
   * The organization the write lands in — the one every directive write is sent
   * with (`authedDirectiveHeaders`, `personWrite`). Named, never "your
   * workspace" (reviewer, 2026-10-02). Unknown → "your organization".
   */
  organizationName?: string | null,
  /** Names an update's or delete's own organization from the record's id. */
  organizationNameOf?: OrganizationNameOf,
  options: DirectiveConsequenceOptions = {},
): ConfirmOptions {
  const { directive, items, nounLabel } = request;
  const { valueLabel } = options;
  // EVERY QUESTION NAMES ITS ORGANIZATION (G6A review, 2026-10-02: only Create's
  // did). A create or an action lands in the organization it is sent with; an
  // update or delete changes a record where that record lives.
  const activeOrg = organizationName?.trim() || "your organization";
  const noun = nounLabel.toLowerCase();
  const titleColumn = nounTitleColumn(directive.noun, nouns);
  const one = items.length === 1;
  const many = `${items.length} ${noun} items`;
  // "Run again" (`request.again`): the ledger already holds this block and a
  // yes sends `force`, so every question says it runs a SECOND time.
  const again = request.again === true;
  const ranBefore = "This already ran once.";
  const twice = again ? " again" : "";

  switch (directive.directiveClass) {
    case "delete": {
      const prepared = prepareDirectiveQuestion(request, organizationNameOf, options.readTimeoutMs);
      return {
        title: one ? (
          <WhenRead prepared={prepared} loading={<>Delete {noun} <DirectiveTitlePlaceholder />{twice}?</>}>
            {(question) => {
              const name = onlyRecordName(request, question);
              // A record whose name cannot be read is "this note" — never its id.
              return name ? <>Delete {noun} <Named name={name} />{twice}?</> : <>Delete this {noun}{twice}?</>;
            }}
          </WhenRead>
        ) : (
          `Delete ${many}${twice}?`
        ),
        description: (
          <WhenRead prepared={prepared} loading={<ReadingLine noun={noun} many={!one} />}>
            {(question) => {
              const named = namedTargets(request, question);
              const records = Object.values(question.records);
              const oneLabel = (q: PreparedQuestion, starts = false) => {
                const name = onlyRecordName(request, q);
                return name ? <Named name={name} /> : <>{starts ? "This" : "this"} {noun}</>;
              };
              // "Delete again" on a record already in the trash says so (G8A).
              const allTrashed = records.length > 0 && records.every((record) => record.trashed);
              const org = <Org name={question.organization} />;
              return (
                <>
                  {question.unread ? <UnreadLine /> : null}
                  {allTrashed ? (
                    <p data-directive-already-trashed="">
                      {again ? `${ranBefore} ` : null}
                      {one ? <>{oneLabel(question, true)} is</> : <>These {many} are</>} already in the trash in {org}.
                    </p>
                  ) : one ? (
                    <p>
                      {again ? `${ranBefore} ` : null}Moves {oneLabel(question)} to the trash in {org} — the {noun}{" "}
                      itself, not just this text.{again ? null : " You can restore it from there."}
                    </p>
                  ) : (
                    <p>
                      {again ? `${ranBefore} ` : null}Moves these {many} to the trash in {org} — the records
                      themselves, not just this text.
                    </p>
                  )}
                  {one ? null : <NameList named={named} withChanges={false} noun={directive.noun} />}
                </>
              );
            }}
          </WhenRead>
        ),
        confirmLabel: again ? "Delete again" : one ? "Delete" : `Delete ${items.length}`,
        variant: "destructive",
        ready: prepared,
      };
    }
    case "update": {
      const prepared = prepareDirectiveQuestion(request, organizationNameOf, options.readTimeoutMs);
      return {
        title: one ? (
          <WhenRead prepared={prepared} loading={<>Update {noun} <DirectiveTitlePlaceholder />{twice}?</>}>
            {(question) => {
              const name = onlyRecordName(request, question);
              // A record whose name cannot be read is "this note" — never its id.
              return name ? <>Update {noun} <Named name={name} />{twice}?</> : <>Update this {noun}{twice}?</>;
            }}
          </WhenRead>
        ) : (
          `Update ${many}${twice}?`
        ),
        description: (
          <WhenRead prepared={prepared} loading={<ReadingLine noun={noun} many={!one} />}>
            {(question) => {
              const named = namedTargets(request, question);
              const org = <Org name={question.organization} />;
              return (
                <>
                  {question.unread ? <UnreadLine /> : null}
                  <p>
                    {again ? (
                      <>
                        {ranBefore} Writes these fields again in {org}, as you.
                      </>
                    ) : (
                      <>
                        Overwrites {one ? "these fields" : "the fields below"} in {org}, as you. The old values
                        are not kept.
                      </>
                    )}
                  </p>
                  {one && named[0] ? (
                    <ChangeList
                      item={named[0].item}
                      values={named[0].values}
                      titleColumn={titleColumn}
                      noun={directive.noun}
                      valueLabel={valueLabel}
                    />
                  ) : (
                    <NameList
                      named={named}
                      withChanges
                      noun={directive.noun}
                      titleColumn={titleColumn}
                      valueLabel={valueLabel}
                    />
                  )}
                </>
              );
            }}
          </WhenRead>
        ),
        confirmLabel: again ? "Update again" : "Update",
        ready: prepared,
      };
    }
    case "create": {
      const named = namedNewItems(request, nouns);
      const first = named[0];
      return {
        title: again
          ? one && first
            ? <>Create another {noun} {first.name}?</>
            : `Create ${many} again?`
          : one && first
            ? <>Create {noun} {first.name}?</>
            : `Create ${many}?`,
        description: (
          <>
            <p>
              {again
                ? `${ranBefore} Running it again adds a second copy${one ? "" : " of each"} to ${activeOrg}.`
                : `Adds ${one ? `this ${noun}` : `these ${many}`} to ${activeOrg}, as you — not just to this text.`}
            </p>
            {one ? null : <NameList named={named} withChanges={false} noun={directive.noun} />}
          </>
        ),
        confirmLabel: again ? "Create another" : "Create",
      };
    }
    default: {
      const named = namedNewItems(request, nouns);
      return {
        title: again
          ? "Run this action again?"
          : `Run this action on ${one ? `one ${noun}` : many}?`,
        description: (
          <>
            <p>
              {again
                ? `${ranBefore} Running it again repeats it in ${activeOrg}, as you.`
                : `Runs now in ${activeOrg}, as you, and changes data outside this text. Continue only if you trust its source.`}
            </p>
            <NameList named={named} withChanges={false} noun={directive.noun} />
          </>
        ),
        confirmLabel: again ? "Run again" : "Run it",
      };
    }
  }
}

/** The name slot of a question title while its record is read. */
function DirectiveTitlePlaceholder() {
  return <NamePlaceholder />;
}

/**
 * The records an apply wrote, from the server's per-item receipts
 * (`DirectiveItemApplied.resource_kind` / `resource_ids`). A receipt whose kind
 * has no reference resolver falls back to the directive's own noun, which is
 * what the executor writes for a catalog noun.
 */
export function appliedRecords(
  slug: string,
  receipts: ReadonlyArray<Record<string, unknown>> | null | undefined,
): DirectiveRecordRef[] {
  const directiveNoun = parseDirectiveSlug(slug)?.noun ?? "";
  const out: DirectiveRecordRef[] = [];
  const seen = new Set<string>();
  for (const receipt of receipts ?? []) {
    const ids = receipt.resource_ids;
    if (!Array.isArray(ids)) continue;
    const kind = typeof receipt.resource_kind === "string" ? receipt.resource_kind : "";
    const noun = kind && getReferenceResolver(kind) ? kind : directiveNoun;
    if (!noun) continue;
    for (const id of ids) {
      if (typeof id !== "string" || !id || seen.has(`${noun}:${id}`)) continue;
      seen.add(`${noun}:${id}`);
      out.push({ noun, id });
    }
  }
  return out;
}
