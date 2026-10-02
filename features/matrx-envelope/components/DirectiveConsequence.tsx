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
import type { ReactNode } from "react";

import {
  itemTitle,
  nounTitleColumn,
  parseDirectiveSlug,
  type DirectiveNounCatalog,
} from "@ai-matrx/content-ir";
import {
  DirectiveChangeList,
  itemChanges,
  itemRecordId,
  recordFallbackName,
  useRecordValues,
  type DirectiveAskRequest,
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
  useResolvedReferenceLabel,
} from "@/features/matrx-envelope/referenceResolvers";
import {
  readDirectiveRecord,
  useDirectiveRecordTrashed,
} from "@/features/matrx-envelope/directiveRecordRow";

/** The live name of `{noun, id}`, or `fallback` until/unless it resolves. */
export function useDirectiveRecordName(noun: string, id: string, fallback: string) {
  const item = { id } as ReferenceItem;
  const { display, status } = useResolvedReferenceLabel(item, noun);
  const name = status === "ready" ? referenceChipLabel(display) : fallback;
  return { name, loading: status === "loading" || status === "idle" };
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
  return <b className="font-semibold text-foreground">{name}</b>;
}

/** The `renderRecord` seam: a row's target, or a record the apply wrote. */
export function DirectiveRecordLink({ noun, id, fallback, context, trashed: aboutToBeTrashed }: DirectiveRecordProps) {
  const { name, loading } = useDirectiveRecordName(noun, id, fallback);
  // The package says "in trash" only for the delete it just ran. A record that
  // went to the trash ANY other way (a Delete card further down the note, the
  // Tasks page) is read live, so a Create card never offers a door to a record
  // that is gone (reviewer, 2026-10-02).
  const liveTrashed = useDirectiveRecordTrashed(noun, id);
  const trashed = aboutToBeTrashed === true || liveTrashed === true;
  // The same door ladder every reference chip climbs (`referenceDoor`).
  const door = useReferenceDoor(noun, { id }, name);

  if (context === "dialog") {
    return <b className="font-semibold text-foreground">{name}</b>;
  }

  const label = (
    <>
      <span className="truncate">{name}</span>
      {loading ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" /> : null}
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

/** How many named records a dialog lists before "and N more". */
const DIALOG_NAMES_MAX = 5;

interface NamedItem {
  key: string;
  /** The record/item name, live for an existing record. */
  name: ReactNode;
  item: Record<string, unknown>;
}

function namedItems(request: DirectiveAskRequest, nouns: DirectiveNounCatalog): NamedItem[] {
  const { directive, items, nounLabel } = request;
  const titleColumn = nounTitleColumn(directive.noun, nouns);
  return items.map((item, index) => {
    const id =
      directive.directiveClass === "update" || directive.directiveClass === "delete"
        ? itemRecordId(item)
        : null;
    if (id) {
      return {
        key: id,
        item,
        name: (
          <DirectiveRecordName
            noun={directive.noun}
            id={id}
            fallback={recordFallbackName(nounLabel, id)}
          />
        ),
      };
    }
    return {
      key: String(index),
      item,
      name: (
        <b className="font-semibold text-foreground">
          {itemTitle(item, titleColumn, index, items.length)}
        </b>
      ),
    };
  });
}

function NameList({
  named,
  withChanges,
  noun,
  titleColumn = null,
}: {
  named: NamedItem[];
  withChanges: boolean;
  noun: string;
  titleColumn?: string | null;
}) {
  const shown = named.slice(0, DIALOG_NAMES_MAX);
  const more = named.length - shown.length;
  return (
    <ul className="mt-2 space-y-1.5">
      {shown.map((entry) => (
        <li key={entry.key} className="min-w-0">
          <div className="truncate">{entry.name}</div>
          {withChanges ? <ChangeList noun={noun} item={entry.item} titleColumn={titleColumn} /> : null}
        </li>
      ))}
      {more > 0 ? <li className="text-muted-foreground">and {more} more</li> : null}
    </ul>
  );
}

/**
 * Every field an update sets, as "old → new" — the package's ONE change list
 * (`DirectiveChangeList`, the same one the card row draws), fed the record as
 * it is now (`readDirectiveRecord`). Until the record is read it lists the new
 * values alone; it never blocks the question.
 */
function ChangeList({
  noun,
  item,
  titleColumn,
}: {
  noun: string;
  item: Record<string, unknown>;
  /** The noun's title column — it reads "Title" here exactly as in the form and on the card. */
  titleColumn: string | null;
}) {
  const id = itemRecordId(item);
  const current = useRecordValues(readDirectiveRecord, id ? { noun, id } : null);
  return (
    <DirectiveChangeList
      changes={itemChanges(item, current.values, { titleColumn })}
      className="mx-auto mt-1 w-fit max-w-full text-left sm:mx-0 sm:pl-3"
    />
  );
}

/**
 * THE QUESTION, per class. Every sentence names the record(s); a delete is
 * destructive and says where the record goes (the executor SOFT-deletes —
 * `aidream/services/directive_apply/executor.py` `_delete`); an update lists
 * every field it overwrites. A plain apply is idempotent (one ledger key per
 * namespace — aidream `keys.human_door_namespace`), so only "Run again"
 * (`request.again`, sent with `force`) can repeat it, and its question says so.
 * Copy fits the dialog budget: ≤2 sentences, ≤140 characters.
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
): ConfirmOptions {
  const { directive, items, nounLabel } = request;
  const noun = nounLabel.toLowerCase();
  const named = namedItems(request, nouns);
  const titleColumn = nounTitleColumn(directive.noun, nouns);
  const one = named.length === 1 ? named[0] : null;
  const many = `${named.length} ${noun} items`;
  // "Run again" (`request.again`): the ledger already holds this block and a
  // yes sends `force`, so every question says it runs a SECOND time.
  const again = request.again === true;
  const ranBefore = "This already ran once.";

  switch (directive.directiveClass) {
    case "delete":
      return {
        title: one
          ? <>Delete {noun} {one.name}{again ? " again" : ""}?</>
          : `Delete ${many}${again ? " again" : ""}?`,
        description: one ? (
          <p>
            {again ? `${ranBefore} ` : null}Moves {one.name} to the trash — the {noun} itself, not
            just this text.{again ? null : " You can restore it from there."}
          </p>
        ) : (
          <>
            <p>
              {again ? `${ranBefore} ` : null}Moves these {many} to the trash — the records
              themselves, not just this text.
            </p>
            <NameList named={named} withChanges={false} noun={directive.noun} />
          </>
        ),
        confirmLabel: again ? "Delete again" : one ? "Delete" : `Delete ${named.length}`,
        variant: "destructive",
      };
    case "update":
      return {
        title: one
          ? <>Update {noun} {one.name}{again ? " again" : ""}?</>
          : `Update ${many}${again ? " again" : ""}?`,
        description: (
          <>
            <p>
              {again
                ? `${ranBefore} Writes these fields again, as you.`
                : `Overwrites ${one ? "these fields" : "the fields below"} as you. The old values are not kept.`}
            </p>
            {one ? (
              <ChangeList noun={directive.noun} item={one.item} titleColumn={titleColumn} />
            ) : (
              <NameList named={named} withChanges noun={directive.noun} titleColumn={titleColumn} />
            )}
          </>
        ),
        confirmLabel: again ? "Update again" : "Update",
      };
    case "create":
      return {
        title: again
          ? one
            ? <>Create another {noun} {one.name}?</>
            : `Create ${many} again?`
          : one
            ? <>Create {noun} {one.name}?</>
            : `Create ${many}?`,
        description: (
          <>
            <p>
              {again
                ? `${ranBefore} Running it again adds a second copy${one ? "" : " of each"}.`
                : `Adds ${one ? `this ${noun}` : `these ${many}`} to ${organizationName?.trim() || "your organization"}, as you — not just to this text.`}
            </p>
            {one ? null : <NameList named={named} withChanges={false} noun={directive.noun} />}
          </>
        ),
        confirmLabel: again ? "Create another" : "Create",
      };
    default:
      return {
        title: again
          ? "Run this action again?"
          : `Run this action on ${items.length === 1 ? `one ${noun}` : many}?`,
        description: (
          <>
            <p>
              {again
                ? `${ranBefore} Running it again repeats it, as you.`
                : "Runs now, as you, and changes data outside this text. Continue only if you trust its source."}
            </p>
            <NameList named={named} withChanges={false} noun={directive.noun} />
          </>
        ),
        confirmLabel: again ? "Run again" : "Run it",
      };
  }
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
