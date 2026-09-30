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
 *   - the DOOR — `getReferenceResolver(noun).openItemType/openId` into
 *     `useOpenItemPresentation` (the same path a reference chip opens through).
 *
 * A noun with no resolver renders its fallback as plain text — honest, never a
 * control that looks clickable and does nothing.
 */

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import {
  itemTitle,
  nounTitleColumn,
  parseDirectiveSlug,
  type DirectiveNounCatalog,
} from "@ai-matrx/content-ir";
import {
  itemChanges,
  itemRecordId,
  recordFallbackName,
  type DirectiveAskRequest,
  type DirectiveRecordProps,
  type DirectiveRecordRef,
} from "@ai-matrx/content-ir-react";
import type { ConfirmOptions } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";
import { useOpenItemPresentation } from "@/features/item-presentation/useOpenItemPresentation";
import type { ReferenceItem } from "@/features/matrx-envelope/envelope";
import {
  getReferenceResolver,
  referenceChipLabel,
  useResolvedReferenceLabel,
} from "@/features/matrx-envelope/referenceResolvers";
import { isUuidShape } from "@ai-matrx/kit/uuid";

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
export function DirectiveRecordLink({ noun, id, fallback, context, trashed }: DirectiveRecordProps) {
  const open = useOpenItemPresentation();
  const { name, loading } = useDirectiveRecordName(noun, id, fallback);

  if (context === "dialog") {
    return <b className="font-semibold text-foreground">{name}</b>;
  }

  const resolver = getReferenceResolver(noun);
  const openType = resolver?.openItemType;
  const openId = resolver?.openId({ id });
  const canOpen = !!openType && !!openId && isUuidShape(openId);

  const label = (
    <>
      <span className="truncate">{name}</span>
      {loading ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" /> : null}
      {trashed ? <span className="shrink-0 text-muted-foreground">(in trash)</span> : null}
    </>
  );

  if (!canOpen) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 font-medium text-foreground">{label}</span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => open(openType, openId, { name })}
      title={`Open ${name}`}
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 rounded px-1 py-0.5 text-left font-medium",
        context === "applied"
          ? "text-primary underline-offset-2 hover:underline"
          : "text-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {label}
    </button>
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

function NameList({ named, withChanges }: { named: NamedItem[]; withChanges: boolean }) {
  const shown = named.slice(0, DIALOG_NAMES_MAX);
  const more = named.length - shown.length;
  return (
    <ul className="mt-2 space-y-1.5">
      {shown.map((entry) => (
        <li key={entry.key} className="min-w-0">
          <div className="truncate">{entry.name}</div>
          {withChanges ? <ChangeList item={entry.item} /> : null}
        </li>
      ))}
      {more > 0 ? <li className="text-muted-foreground">and {more} more</li> : null}
    </ul>
  );
}

function ChangeList({ item }: { item: Record<string, unknown> }) {
  const changes = itemChanges(item);
  if (changes.length === 0) {
    return <p className="text-xs text-muted-foreground">Sets no fields — nothing would change.</p>;
  }
  return (
    <ul className="mt-0.5 space-y-0.5 pl-3">
      {changes.map((change) => (
        <li key={change.key} className="flex min-w-0 gap-1.5 text-xs" title={change.full}>
          <span className="shrink-0 text-muted-foreground">{change.label}</span>
          <span aria-hidden className="shrink-0 text-muted-foreground">→</span>
          <span className={cn("min-w-0 truncate", change.clears && "italic text-muted-foreground")}>
            {change.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * THE QUESTION, per class. Every sentence names the record(s); a delete is
 * destructive and says where the record goes (the executor SOFT-deletes —
 * `aidream/services/directive_apply/executor.py` `_delete`); an update lists
 * every field it overwrites. Nothing here promises what the platform cannot
 * keep (no "clicking again will not add a second copy" — an in-content apply
 * has no stable idempotency namespace today).
 */
export function directiveConsequenceDialog(
  request: DirectiveAskRequest,
  nouns: DirectiveNounCatalog,
): ConfirmOptions {
  const { directive, items, nounLabel } = request;
  const noun = nounLabel.toLowerCase();
  const named = namedItems(request, nouns);
  const one = named.length === 1 ? named[0] : null;
  const many = `${named.length} ${noun} items`;

  switch (directive.directiveClass) {
    case "delete":
      return {
        title: one ? <>Delete {noun} {one.name}?</> : `Delete ${many}?`,
        description: one ? (
          <p>
            This moves {one.name} to the trash — the {noun} itself, not just this text. You can
            restore it from the trash; anything pointing at it stops resolving until then.
          </p>
        ) : (
          <>
            <p>
              This moves these {many} to the trash — the records themselves, not just this text.
              You can restore them from the trash.
            </p>
            <NameList named={named} withChanges={false} />
          </>
        ),
        confirmLabel: one ? "Delete" : `Delete ${named.length}`,
        variant: "destructive",
      };
    case "update":
      return {
        title: one ? <>Update {noun} {one.name}?</> : `Update ${many}?`,
        description: (
          <>
            <p>
              This overwrites {one ? "these fields" : "the fields below"} on the{" "}
              {one ? noun : "records"} themselves, as you. The previous values are not kept here.
            </p>
            {one ? <ChangeList item={one.item} /> : <NameList named={named} withChanges />}
          </>
        ),
        confirmLabel: "Update",
      };
    case "create":
      return {
        title: one ? <>Create {noun} {one.name}?</> : `Create ${many}?`,
        description: (
          <>
            <p>
              This adds {one ? `this ${noun}` : `these ${many}`} to your workspace for real, as
              you — not just to this text.
            </p>
            {one ? null : <NameList named={named} withChanges={false} />}
          </>
        ),
        confirmLabel: "Create",
      };
    default:
      return {
        title: `Run this action on ${items.length === 1 ? `one ${noun}` : many}?`,
        description: (
          <>
            <p>
              This runs now, as you, and changes data outside this text. Only continue if you know
              where this block came from.
            </p>
            <NameList named={named} withChanges={false} />
          </>
        ),
        confirmLabel: "Run it",
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
