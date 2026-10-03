/**
 * One table row, read-only, for someone outside its organization: the public page
 * (`/p/e/record/<id>`), an Anyone link (`/s/<token>`) and a person share all draw it.
 * What it holds was decided by the database (./record-fields.ts); this only lays it out.
 * No hooks and no browser APIs, so it renders on the server with the page.
 */

import type { SharedRecord } from "./record-fields";
import { wordFieldValue } from "./record-fields";

export function RecordFieldsView({
  record,
  heading = false,
}: {
  record: SharedRecord;
  /** Draw the label chip and title (a page that already has its own heading passes false). */
  heading?: boolean;
}) {
  const rows = record.fields
    .map((f) => ({ field: f, words: wordFieldValue(f) }))
    .filter((r) => r.words !== "");

  return (
    <article className="mx-auto w-full max-w-3xl" data-shared-record={record.id}>
      {heading && (
        <header className="mb-6">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {record.labelSingular}
          </div>
          <h1 className="break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {record.title}
          </h1>
        </header>
      )}
      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Nothing in this {record.labelSingular.toLowerCase()} is shown outside its organization.
        </p>
      ) : (
        <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {rows.map(({ field, words }) => (
            <div
              key={field.key}
              className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[minmax(8rem,14rem)_1fr] sm:gap-4"
              data-field={field.key}
            >
              <dt className="text-xs font-medium text-muted-foreground sm:pt-0.5">{field.label}</dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words text-sm text-foreground">{words}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}
